import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

describe("Auth E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

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
  });

  it("registers a new user, tenant, and OWNER membership atomically", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);

    expect(response.body.user.email).toBe(validRegisterPayload.email);
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.body.tenant.name).toBe(validRegisterPayload.companyName);
    expect(response.body.tenant.slug).toBe("acme-rentals");

    const setCookies = response.headers["set-cookie"] as unknown as string[];
    expect(setCookies.some((c) => c.startsWith("rentos_access_token="))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("rentos_refresh_token="))).toBe(true);

    const membership = await prisma.tenantMembership.findFirst({
      where: { userId: response.body.user.id as string },
    });
    expect(membership?.role).toBe("OWNER");
    expect(membership?.status).toBe("ACTIVE");
  });

  it("rejects duplicate email registration", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);

    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, companyName: "Another Co" })
      .expect(409);

    const users = await prisma.user.findMany({ where: { email: validRegisterPayload.email } });
    expect(users).toHaveLength(1);
  });

  it("rejects weak passwords", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, password: "short" })
      .expect(400);

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(0);
  });

  it("logs in successfully with correct credentials", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: validRegisterPayload.email, password: validRegisterPayload.password })
      .expect(200);

    expect(response.body.user.email).toBe(validRegisterPayload.email);
    expect(response.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects an invalid password on login", async () => {
    await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: validRegisterPayload.email, password: "TotallyWrongPassword1" })
      .expect(401);
  });

  it("rotates the refresh token on /auth/refresh", async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);
    const oldRefreshCookie = extractCookie(registerResponse.headers, "rentos_refresh_token");

    const refreshResponse = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", oldRefreshCookie)
      .expect(200);
    const newRefreshCookie = extractCookie(refreshResponse.headers, "rentos_refresh_token");

    expect(newRefreshCookie).not.toBe(oldRefreshCookie);
  });

  it("rejects reuse of a revoked (already-rotated) refresh token", async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);
    const oldRefreshCookie = extractCookie(registerResponse.headers, "rentos_refresh_token");

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", oldRefreshCookie)
      .expect(200);

    // The old token was revoked by the rotation above — reusing it must fail.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", oldRefreshCookie)
      .expect(401);
  });

  it("rejects access to a tenant the user is not a member of", async () => {
    const userAResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);
    const tenantAId = userAResponse.body.tenant.id as string;
    const userAAccessCookie = extractCookie(userAResponse.headers, "rentos_access_token");

    const userBResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "userb@example.com", companyName: "Other Co" })
      .expect(201);
    const userBAccessCookie = extractCookie(userBResponse.headers, "rentos_access_token");

    await request(app.getHttpServer())
      .get(`/tenants/${tenantAId}`)
      .set("Cookie", userBAccessCookie)
      .expect(403);

    // Sanity check: user A can access their own tenant.
    await request(app.getHttpServer())
      .get(`/tenants/${tenantAId}`)
      .set("Cookie", userAAccessCookie)
      .expect(200);
  });

  it("rejects access for a suspended membership", async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);
    const tenantId = registerResponse.body.tenant.id as string;
    const userId = registerResponse.body.user.id as string;
    const accessCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    await prisma.tenantMembership.updateMany({
      where: { tenantId, userId },
      data: { status: "SUSPENDED" },
    });

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}`)
      .set("Cookie", accessCookie)
      .expect(403);
  });

  it("lists only tenants the current user has an active membership in", async () => {
    const userAResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);
    const userAAccessCookie = extractCookie(userAResponse.headers, "rentos_access_token");

    await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "userb@example.com", companyName: "Other Co" })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get("/tenants")
      .set("Cookie", userAAccessCookie)
      .expect(200);

    expect(listResponse.body.tenants).toHaveLength(1);
    expect(listResponse.body.tenants[0].name).toBe(validRegisterPayload.companyName);
  });

  it("never returns passwordHash or tokenHash in any response body", async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send(validRegisterPayload)
      .expect(201);
    expect(JSON.stringify(registerResponse.body)).not.toContain("passwordHash");
    expect(JSON.stringify(registerResponse.body)).not.toContain("tokenHash");

    const accessCookie = extractCookie(registerResponse.headers, "rentos_access_token");
    const meResponse = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", accessCookie)
      .expect(200);
    expect(JSON.stringify(meResponse.body)).not.toContain("passwordHash");

    const loginResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: validRegisterPayload.email, password: validRegisterPayload.password })
      .expect(200);
    expect(JSON.stringify(loginResponse.body)).not.toContain("passwordHash");
  });

  it("rejects anonymous access to a protected route", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
  });
});
