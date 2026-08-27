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

describe("Storage usage E2E (production-infrastructure pass)", () => {
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

  it("aggregates real uploaded-file metadata (never a live bucket scan) and grows as attachments are added", async () => {
    const zero = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/storage/usage`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(zero.body.total).toEqual({ count: 0, bytes: 0 });

    const category = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", accessCookie)
      .send({ name: "Generators" })
      .expect(201);
    const asset = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name: "Generator A", internalNumber: "GEN-1", categoryId: category.body.id })
      .expect(201);

    const imageBytes = Buffer.from("fake jpeg bytes, sixteen");
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${asset.body.id}/images`)
      .set("Cookie", accessCookie)
      .attach("file", imageBytes, { filename: "a.jpg", contentType: "image/jpeg" })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/storage/usage`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(after.body.assetImages).toEqual({ count: 1, bytes: imageBytes.length });
    expect(after.body.total).toEqual({ count: 1, bytes: imageBytes.length });
  });

  it("denies a VIEWER-role member (no integrations.view) from reading storage usage", async () => {
    const viewer = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "viewer-storage@example.com" })
      .expect(201);
    const viewerUserId = (viewer.body as RegisterResponseBody).user.id;
    const viewerCookie = extractCookie(viewer.headers, "rentos_access_token");
    await prisma.tenantMembership.create({
      data: { tenantId, userId: viewerUserId, role: "VIEWER", status: "ACTIVE" },
    });

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/storage/usage`)
      .set("Cookie", viewerCookie)
      .expect(403);
  });
});
