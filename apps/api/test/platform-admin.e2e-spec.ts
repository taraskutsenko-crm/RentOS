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

/**
 * Havelio PLATFORM administration (Stage 17) — K10: an ordinary tenant
 * OWNER (the highest tenant-scoped role, with EVERY tenant permission) must
 * never reach a Platform Admin endpoint. See PlatformAdminGuard's own doc
 * comment — this is never inferred from MembershipRole.
 */
describe("Platform Admin security E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;

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
    accessCookie = extractCookie(registerResponse.headers, "rentos_access_token");
    // Sanity check: this user really is an OWNER with no isPlatformAdmin flag.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: body.user.id } });
    expect(user.isPlatformAdmin).toBe(false);
  });

  it("denies an ordinary tenant OWNER access to platform-admin/affiliate/partners", async () => {
    await request(app.getHttpServer())
      .get("/platform-admin/affiliate/partners")
      .set("Cookie", accessCookie)
      .expect(403);
  });

  it("denies an ordinary tenant OWNER access to platform-admin/billing/subscriptions", async () => {
    await request(app.getHttpServer())
      .get("/platform-admin/billing/subscriptions")
      .set("Cookie", accessCookie)
      .expect(403);
  });

  it("denies creating an affiliate partner as an ordinary tenant OWNER", async () => {
    await request(app.getHttpServer())
      .post("/platform-admin/affiliate/partners")
      .set("Cookie", accessCookie)
      .send({ displayName: "Sneaky Partner", email: "sneaky@example.com" })
      .expect(403);
  });

  it("allows access once isPlatformAdmin is set (ops-only DB action, never self-service)", async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "admin-user@example.com" })
      .expect(201);
    const body = registerResponse.body as RegisterResponseBody;
    const adminCookie = extractCookie(registerResponse.headers, "rentos_access_token");

    await prisma.user.update({ where: { id: body.user.id }, data: { isPlatformAdmin: true } });

    await request(app.getHttpServer())
      .get("/platform-admin/affiliate/partners")
      .set("Cookie", adminCookie)
      .expect(200);
  });
});
