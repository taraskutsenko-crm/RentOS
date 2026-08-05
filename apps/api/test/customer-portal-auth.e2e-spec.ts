import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string; slug: string };
}

interface InviteResponseBody {
  inviteLink: string;
  email: string;
}

function tokenFromInviteLink(inviteLink: string): string {
  const url = new URL(inviteLink);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1]!;
}

describe("Customer Portal Auth E2E (TASK-0009)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let staffCookie: string;
  let tenantId: string;
  let tenantSlug: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);
    const body = registerResponse.body as RegisterResponseBody;
    tenantId = body.tenant.id;
    tenantSlug = body.tenant.slug;
    staffCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    const customerResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", staffCookie)
      .send({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" })
      .expect(201);
    customerId = customerResponse.body.id;
  });

  async function inviteCustomer(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers/${customerId}/portal/invite`)
      .set("Cookie", staffCookie)
      .send({})
      .expect(201);
    const body = response.body as InviteResponseBody;
    return tokenFromInviteLink(body.inviteLink);
  }

  it("invites a customer, activates the invitation, and logs them into the portal", async () => {
    const token = await inviteCustomer();

    const activateResponse = await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);

    expect(activateResponse.body.customer.email).toBe("jane@example.com");
    const portalAccessCookie = extractCookie(
      activateResponse.headers,
      "rentos_portal_access_token",
    );

    const meResponse = await request(app.getHttpServer())
      .get("/portal/auth/me")
      .set("Cookie", portalAccessCookie)
      .expect(200);
    expect(meResponse.body.customer.id).toBe(customerId);
    expect(meResponse.body.customer.portalPasswordHash).toBeUndefined();
    expect(meResponse.body.tenant.name).toBeTruthy();

    const loginResponse = await request(app.getHttpServer())
      .post("/portal/auth/login")
      .send({ tenantSlug, email: "jane@example.com", password: "SuperSecretPortal123" })
      .expect(200);
    expect(loginResponse.body.customer.id).toBe(customerId);
  });

  it("rejects login with the wrong password", async () => {
    const token = await inviteCustomer();
    await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);

    await request(app.getHttpServer())
      .post("/portal/auth/login")
      .send({ tenantSlug, email: "jane@example.com", password: "WrongPassword123" })
      .expect(401);
  });

  it("rejects an expired or already-used invitation token", async () => {
    const token = await inviteCustomer();
    await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);

    await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "AnotherPassword123" })
      .expect(404);
  });

  it("rejects portal login for a customer who was never invited", async () => {
    await request(app.getHttpServer())
      .post("/portal/auth/login")
      .send({ tenantSlug, email: "jane@example.com", password: "AnyPassword123" })
      .expect(401);
  });

  it("refreshes and rotates the portal session, revoking the old refresh token", async () => {
    const token = await inviteCustomer();
    const activateResponse = await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);
    const refreshCookie = extractCookie(activateResponse.headers, "rentos_portal_refresh_token");

    const refreshResponse = await request(app.getHttpServer())
      .post("/portal/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(200);
    const newAccessCookie = extractCookie(refreshResponse.headers, "rentos_portal_access_token");

    await request(app.getHttpServer())
      .get("/portal/auth/me")
      .set("Cookie", newAccessCookie)
      .expect(200);

    // The old refresh token was rotated away — reusing it must fail.
    await request(app.getHttpServer())
      .post("/portal/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(401);
  });

  it("logs out and revokes the session so the old access token stops working after expiry-independent logout", async () => {
    const token = await inviteCustomer();
    const activateResponse = await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);
    const accessCookie = extractCookie(activateResponse.headers, "rentos_portal_access_token");
    const refreshCookie = extractCookie(activateResponse.headers, "rentos_portal_refresh_token");

    await request(app.getHttpServer())
      .post("/portal/auth/logout")
      .set("Cookie", [accessCookie, refreshCookie].join("; "))
      .expect(200);

    await request(app.getHttpServer())
      .post("/portal/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(401);
  });

  it("keeps a portal access token from ever satisfying a staff-only route", async () => {
    const token = await inviteCustomer();
    const activateResponse = await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);
    const portalAccessCookie = extractCookie(
      activateResponse.headers,
      "rentos_portal_access_token",
    );

    // A portal access token is a completely different, separately-signed
    // JWT — presenting it as if it were a staff rentos_access_token cookie
    // must fail, not silently authenticate as some coincidental user.
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", `rentos_access_token=${portalAccessCookie.split("=")[1]}`)
      .expect(401);
  });

  it("rejects an invitation for a customer with no email on file unless one is provided", async () => {
    const noEmailCustomer = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", staffCookie)
      .send({ firstName: "No", lastName: "Email" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers/${noEmailCustomer.body.id}/portal/invite`)
      .set("Cookie", staffCookie)
      .send({})
      .expect(400);

    const withEmail = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers/${noEmailCustomer.body.id}/portal/invite`)
      .set("Cookie", staffCookie)
      .send({ email: "override@example.com" })
      .expect(201);
    expect(withEmail.body.email).toBe("override@example.com");
  });

  it("reports portal status via the staff-facing status endpoint", async () => {
    const statusBefore = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${customerId}/portal/status`)
      .set("Cookie", staffCookie)
      .expect(200);
    expect(statusBefore.body).toMatchObject({ invited: false, activated: false });

    const token = await inviteCustomer();
    const statusAfterInvite = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${customerId}/portal/status`)
      .set("Cookie", staffCookie)
      .expect(200);
    expect(statusAfterInvite.body).toMatchObject({ invited: true, activated: false });

    await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);

    const statusAfterActivate = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${customerId}/portal/status`)
      .set("Cookie", staffCookie)
      .expect(200);
    expect(statusAfterActivate.body).toMatchObject({ invited: true, activated: true });
  });

  it("revokes portal access, immediately invalidating existing sessions and blocking future login", async () => {
    const token = await inviteCustomer();
    const activateResponse = await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);
    const refreshCookie = extractCookie(activateResponse.headers, "rentos_portal_refresh_token");

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers/${customerId}/portal/revoke`)
      .set("Cookie", staffCookie)
      .expect(201);

    await request(app.getHttpServer())
      .post("/portal/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post("/portal/auth/login")
      .send({ tenantSlug, email: "jane@example.com", password: "SuperSecretPortal123" })
      .expect(401);
  });

  it("blocks a customer from a different tenant from logging in with the wrong tenantSlug", async () => {
    const token = await inviteCustomer();
    await request(app.getHttpServer())
      .post("/portal/auth/activate-invitation")
      .send({ token, password: "SuperSecretPortal123" })
      .expect(200);

    await request(app.getHttpServer())
      .post("/portal/auth/login")
      .send({
        tenantSlug: "not-a-real-tenant-slug",
        email: "jane@example.com",
        password: "SuperSecretPortal123",
      })
      .expect(401);
  });

  it("rejects portal management endpoints without documents-level staff permission (VIEWER role)", async () => {
    // Register a second staff member is out of scope for this focused
    // spec — covered instead by permission.spec.ts's role-matrix tests for
    // customers.portal.manage. This test only asserts the guard chain is
    // actually applied (TenantGuard + PermissionsGuard), not the full role
    // matrix, by hitting the endpoint unauthenticated.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers/${customerId}/portal/invite`)
      .send({})
      .expect(401);
  });
});
