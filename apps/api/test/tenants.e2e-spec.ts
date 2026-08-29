import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string };
}

const fullPayload = {
  name: "Acme Rentals GmbH",
  registrationNumber: "HRB 12345",
  taxNumber: "DE123456789",
  address: "Musterstrasse 1, 10115 Berlin",
  phone: "+49 30 1234567",
  email: "office@acme-rentals.example",
};

describe("Tenants E2E — Company Profile (PATCH /tenants/:tenantId)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;

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
    accessCookie = extractCookie(registerResponse.headers, "rentos_access_token");
  });

  async function registerSecondTenant() {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other-owner@example.com", companyName: "Other Co" })
      .expect(201);
    const otherBody = response.body as RegisterResponseBody;
    const otherCookie = extractCookie(response.headers, "rentos_access_token");
    return { tenantId: otherBody.tenant.id, cookie: otherCookie };
  }

  async function registerMember(role: string) {
    const email = `${role.toLowerCase()}@example.com`;
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email, companyName: `${role} Co` })
      .expect(201);
    const memberBody = registerResponse.body as RegisterResponseBody;
    const cookie = extractCookie(registerResponse.headers, "rentos_access_token");
    await prisma.tenantMembership.create({
      data: { tenantId, userId: memberBody.user.id, role: role as never, status: "ACTIVE" },
    });
    return cookie;
  }

  it("GET returns null company-identity fields for a freshly registered tenant", async () => {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.tenant).toMatchObject({
      name: validRegisterPayload.companyName,
      registrationNumber: null,
      taxNumber: null,
      address: null,
      phone: null,
      email: null,
    });
  });

  it("updates the company profile and persists it", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send(fullPayload)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.tenant).toMatchObject(fullPayload);
  });

  it("stores empty strings for the optional identity fields as null", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send({
        ...fullPayload,
        registrationNumber: "",
        taxNumber: "",
        address: "",
        phone: "",
        email: "",
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.tenant).toMatchObject({
      registrationNumber: null,
      taxNumber: null,
      address: null,
      phone: null,
      email: null,
    });
  });

  it("rejects a malformed company email", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send({ ...fullPayload, email: "not-an-email" })
      .expect(400);
  });

  it("accepts an explicit null company email and persists it as null", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send({ ...fullPayload, email: null })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.tenant.email).toBeNull();
  });

  // Regression test for the exact reported bug: a client that doesn't send
  // `email` at all (an older frontend build, a partial PATCH, any caller
  // that predates this field) must still be able to save the rest of the
  // Company Profile — and must never silently wipe an already-configured
  // company email it never touched.
  it("omitting email entirely still saves the rest of the profile, without erasing an existing email", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send(fullPayload)
      .expect(200);

    const { email: _omitted, ...payloadWithoutEmail } = fullPayload;
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send({ ...payloadWithoutEmail, phone: "+49 30 9999999" })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.tenant.email).toBe(fullPayload.email);
    expect(response.body.tenant.phone).toBe("+49 30 9999999");
  });

  it("omitting email on a tenant with no email yet still saves the rest of the profile", async () => {
    const { email: _omitted, ...payloadWithoutEmail } = fullPayload;
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send(payloadWithoutEmail)
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.tenant.email).toBeNull();
    expect(response.body.tenant.name).toBe(fullPayload.name);
  });

  it("rejects an empty name", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send({ ...fullPayload, name: "" })
      .expect(400);
  });

  it("writes an audit log entry on update", async () => {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .send(fullPayload)
      .expect(200);

    const logs = await prisma.auditLog.findMany({
      where: { tenantId, action: "tenant.company_profile.updated" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]!.metadata).toMatchObject({
      from: { name: validRegisterPayload.companyName, registrationNumber: null },
      to: fullPayload,
    });
  });

  it("rejects cross-tenant access", async () => {
    const other = await registerSecondTenant();

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", other.cookie)
      .send(fullPayload)
      .expect(403);
  });

  it("allows ADMIN to manage the company profile", async () => {
    const cookie = await registerMember("ADMIN");

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", cookie)
      .send(fullPayload)
      .expect(200);
  });

  it("blocks MANAGER/ACCOUNTANT/TECHNICIAN/VIEWER from managing the company profile", async () => {
    for (const role of ["MANAGER", "ACCOUNTANT", "TECHNICIAN", "VIEWER"]) {
      const cookie = await registerMember(role);

      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}`)
        .set("Cookie", cookie)
        .send(fullPayload)
        .expect(403);
    }
  });

  it("still allows every role to read the tenant (GET is not gated by tenant.manage)", async () => {
    for (const role of ["MANAGER", "ACCOUNTANT", "TECHNICIAN", "VIEWER"]) {
      const cookie = await registerMember(role);

      await request(app.getHttpServer())
        .get(`/tenants/${tenantId}`)
        .set("Cookie", cookie)
        .expect(200);
    }
  });
});
