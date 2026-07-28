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

describe("Assets E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let accessCookie: string;
  let tenantId: string;
  let categoryId: string;
  let availableStatusId: string;

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

    const categoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", accessCookie)
      .send({ name: "Vehicles" })
      .expect(201);
    categoryId = categoryResponse.body.id;

    const statusesResponse = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/asset-statuses`)
      .set("Cookie", accessCookie)
      .expect(200);
    availableStatusId = statusesResponse.body.find(
      (s: { code: string }) => s.code === "AVAILABLE",
    ).id;
  });

  function createAsset(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .send({ name: "Truck 1", internalNumber: "AST-0001", categoryId, ...overrides });
  }

  async function registerSecondTenant() {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "other-owner@example.com", companyName: "Other Co" })
      .expect(201);
    const otherBody = response.body as RegisterResponseBody;
    const otherCookie = extractCookie(response.headers, "rentos_access_token");
    const otherCategoryResponse = await request(app.getHttpServer())
      .post(`/tenants/${otherBody.tenant.id}/asset-categories`)
      .set("Cookie", otherCookie)
      .send({ name: "Vehicles" })
      .expect(201);
    return {
      tenantId: otherBody.tenant.id,
      cookie: otherCookie,
      categoryId: otherCategoryResponse.body.id as string,
    };
  }

  // 1. Create asset successfully
  it("creates an asset successfully", async () => {
    const response = await createAsset({ manufacturer: "Ford", model: "Transit" }).expect(201);

    expect(response.body).toMatchObject({
      tenantId,
      name: "Truck 1",
      internalNumber: "AST-0001",
      categoryId,
      currentStatusId: availableStatusId,
      manufacturer: "Ford",
      model: "Transit",
      isRentable: true,
      isActive: true,
    });
    expect(response.body.id).toBeTypeOf("string");
    expect(response.body.customFields).toEqual({});
  });

  // 2. Duplicate internalNumber rejected within tenant
  it("rejects a duplicate internalNumber within the same tenant", async () => {
    await createAsset().expect(201);
    await createAsset({ name: "Truck 2" }).expect(409);
  });

  // 3. Same internalNumber allowed in another tenant
  it("allows the same internalNumber in a different tenant", async () => {
    await createAsset().expect(201);
    const other = await registerSecondTenant();

    await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/assets`)
      .set("Cookie", other.cookie)
      .send({ name: "Truck 1", internalNumber: "AST-0001", categoryId: other.categoryId })
      .expect(201);
  });

  // 4. Cross-tenant asset access rejected
  it("rejects cross-tenant asset access", async () => {
    const created = await createAsset().expect(201);
    const other = await registerSecondTenant();

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets/${created.body.id}`)
      .set("Cookie", other.cookie)
      .expect(403);
  });

  // 5. Category from another tenant rejected
  it("rejects a category belonging to another tenant", async () => {
    const other = await registerSecondTenant();

    await createAsset({ categoryId: other.categoryId }).expect(404);
  });

  // 6. Status from another tenant rejected
  it("rejects a status belonging to another tenant", async () => {
    const other = await registerSecondTenant();
    const otherStatuses = await request(app.getHttpServer())
      .get(`/tenants/${other.tenantId}/asset-statuses`)
      .set("Cookie", other.cookie)
      .expect(200);
    const otherAvailableId = otherStatuses.body.find(
      (s: { code: string }) => s.code === "AVAILABLE",
    ).id;

    await createAsset({ statusId: otherAvailableId }).expect(404);
  });

  // 7 & 9. Custom field validation enforced / invalid custom field type rejected
  it("enforces custom field type validation", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-custom-fields`)
      .set("Cookie", accessCookie)
      .send({ name: "Mileage", key: "mileage", categoryId, fieldType: "INTEGER" })
      .expect(201);

    await createAsset({ customFields: { mileage: "not-a-number" } }).expect(400);
  });

  // 8. Required custom field missing rejected
  it("rejects asset creation when a required custom field is missing", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-custom-fields`)
      .set("Cookie", accessCookie)
      .send({ name: "VIN", key: "vin", categoryId, fieldType: "TEXT", isRequired: true })
      .expect(201);

    await createAsset().expect(400);
  });

  it("accepts an asset once the required custom field is provided", async () => {
    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-custom-fields`)
      .set("Cookie", accessCookie)
      .send({ name: "VIN", key: "vin", categoryId, fieldType: "TEXT", isRequired: true })
      .expect(201);

    const response = await createAsset({ customFields: { vin: "1HGCM82633A004352" } }).expect(201);
    expect(response.body.customFields).toEqual({ vin: "1HGCM82633A004352" });
  });

  // 10. Status change creates history
  it("creates an AssetStatusHistory record when the status changes", async () => {
    const created = await createAsset().expect(201);
    const statuses = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/asset-statuses`)
      .set("Cookie", accessCookie)
      .expect(200);
    const reserved = statuses.body.find((s: { code: string }) => s.code === "RESERVED");

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${created.body.id}/status`)
      .set("Cookie", accessCookie)
      .send({ statusId: reserved.id, reason: "Booked for a customer" })
      .expect(201);

    const history = await prisma.assetStatusHistory.findMany({
      where: { tenantId, assetId: created.body.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      fromStatusId: availableStatusId,
      toStatusId: reserved.id,
      reason: "Booked for a customer",
    });
  });

  // 11. Location change creates history
  it("creates an AssetLocationHistory record when the location changes", async () => {
    const created = await createAsset({ currentLocationText: "Depot A" }).expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${created.body.id}/location`)
      .set("Cookie", accessCookie)
      .send({ newLocation: "Depot B", reason: "Transferred" })
      .expect(201);

    const history = await prisma.assetLocationHistory.findMany({
      where: { tenantId, assetId: created.body.id },
    });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      previousLocation: "Depot A",
      newLocation: "Depot B",
      reason: "Transferred",
    });
  });

  // 12. System status cannot be deleted
  it("rejects deleting a system status", async () => {
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/asset-statuses/${availableStatusId}`)
      .set("Cookie", accessCookie)
      .expect(403);
  });

  // 13. Status in use cannot be deleted
  it("rejects deleting a status currently used by an asset", async () => {
    const customStatus = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-statuses`)
      .set("Cookie", accessCookie)
      .send({ name: "Awaiting Parts", code: "AWAITING_PARTS" })
      .expect(201);
    const created = await createAsset({ statusId: customStatus.body.id }).expect(201);
    expect(created.body.currentStatusId).toBe(customStatus.body.id);

    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/asset-statuses/${customStatus.body.id}`)
      .set("Cookie", accessCookie)
      .expect(409);
  });

  // 14. Category cycle rejected
  it("rejects a category parent change that would create a cycle", async () => {
    const child = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", accessCookie)
      .send({ name: "Trucks", parentId: categoryId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/asset-categories/${categoryId}`)
      .set("Cookie", accessCookie)
      .send({ parentId: child.body.id })
      .expect(409);
  });

  // 15 & 16. Asset soft deletion / excluded from listing
  it("soft-deletes an asset, which then 404s and is excluded from listings", async () => {
    const created = await createAsset().expect(201);

    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/assets/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(404);

    const listResponse = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(listResponse.body.items).toHaveLength(0);

    const row = await prisma.asset.findUnique({ where: { id: created.body.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  // 17. Permission restrictions enforced
  it("blocks a VIEWER-role member from creating an asset but allows reading", async () => {
    const viewerRegister = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "viewer@example.com", companyName: "Viewer Co" })
      .expect(201);
    const viewerBody = viewerRegister.body as RegisterResponseBody;
    const viewerCookie = extractCookie(viewerRegister.headers, "rentos_access_token");

    await prisma.tenantMembership.create({
      data: { tenantId, userId: viewerBody.user.id, role: "VIEWER", status: "ACTIVE" },
    });

    await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets`)
      .set("Cookie", viewerCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", viewerCookie)
      .send({ name: "Truck 1", internalNumber: "AST-0001", categoryId })
      .expect(403);
  });

  // 18. Search works
  it("searches across name, internalNumber, manufacturer, and model", async () => {
    await createAsset({ internalNumber: "AST-0001", manufacturer: "Ford", model: "Transit" });
    await createAsset({
      internalNumber: "AST-0002",
      name: "Van 2",
      manufacturer: "Mercedes",
      model: "Sprinter",
    });

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets`)
      .query({ search: "Sprinter" })
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].manufacturer).toBe("Mercedes");
  });

  // 19. Pagination works
  it("paginates asset results", async () => {
    for (let i = 0; i < 5; i += 1) {
      await createAsset({ internalNumber: `AST-000${i}`, name: `Truck ${i}` });
    }

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets`)
      .query({ page: 2, pageSize: 2 })
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.total).toBe(5);
    expect(response.body.page).toBe(2);
    expect(response.body.pageSize).toBe(2);
  });

  // 20. Filter by category/status works
  it("filters by categoryId and statusId", async () => {
    const otherCategory = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", accessCookie)
      .send({ name: "Generators" })
      .expect(201);

    await createAsset({ internalNumber: "AST-0001" });
    await createAsset({ internalNumber: "AST-0002", categoryId: otherCategory.body.id });

    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets`)
      .query({ categoryId: otherCategory.body.id })
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].internalNumber).toBe("AST-0002");

    const statusResponse = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets`)
      .query({ statusId: availableStatusId })
      .set("Cookie", accessCookie)
      .expect(200);
    expect(statusResponse.body.items).toHaveLength(2);
  });

  // 21. Timeline is tenant-isolated
  it("keeps an asset's timeline tenant-isolated", async () => {
    const created = await createAsset().expect(201);
    const other = await registerSecondTenant();

    const timeline = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/assets/${created.body.id}/timeline`)
      .set("Cookie", accessCookie)
      .expect(200);
    expect(timeline.body.length).toBeGreaterThan(0);
    expect(timeline.body[0].type).toBe("created");

    await request(app.getHttpServer())
      .get(`/tenants/${other.tenantId}/assets/${created.body.id}/timeline`)
      .set("Cookie", other.cookie)
      .expect(404);
  });

  // 22. Image metadata is tenant-isolated
  it("keeps asset image metadata tenant-isolated", async () => {
    const created = await createAsset().expect(201);
    const other = await registerSecondTenant();

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${created.body.id}/images`)
      .set("Cookie", accessCookie)
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "test.png",
        contentType: "image/png",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/assets/${created.body.id}/images`)
      .set("Cookie", other.cookie)
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: "test.png",
        contentType: "image/png",
      })
      .expect(404);
  });

  // 23. Document metadata is tenant-isolated
  it("keeps asset document metadata tenant-isolated", async () => {
    const created = await createAsset().expect(201);
    const other = await registerSecondTenant();

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets/${created.body.id}/documents`)
      .set("Cookie", accessCookie)
      .field("documentType", "MANUAL")
      .field("title", "Owner's Manual")
      .attach("file", Buffer.from("%PDF-1.4 test"), {
        filename: "manual.pdf",
        contentType: "application/pdf",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${other.tenantId}/assets/${created.body.id}/documents`)
      .set("Cookie", other.cookie)
      .field("documentType", "MANUAL")
      .field("title", "Owner's Manual")
      .attach("file", Buffer.from("%PDF-1.4 test"), {
        filename: "manual.pdf",
        contentType: "application/pdf",
      })
      .expect(404);
  });

  // 24. Monetary values preserve exact minor units
  it("preserves exact integer minor units for monetary fields", async () => {
    const response = await createAsset({
      purchasePriceMinor: 1234599,
      purchaseCurrency: "USD",
      replacementValueMinor: 1500000,
      replacementCurrency: "USD",
    }).expect(201);

    expect(response.body.purchasePriceMinor).toBe(1234599);
    expect(response.body.replacementValueMinor).toBe(1500000);

    const row = await prisma.asset.findUnique({ where: { id: response.body.id } });
    expect(row?.purchasePriceMinor).toBe(1234599);
    expect(row?.replacementValueMinor).toBe(1500000);
  });

  it("rejects a monetary amount without its paired currency", async () => {
    await createAsset({ purchasePriceMinor: 1000 }).expect(400);
  });

  // 25. Asset mutation audit logs are created
  it("logs an audit entry for create, update, and delete", async () => {
    const created = await createAsset().expect(201);
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/assets/${created.body.id}`)
      .set("Cookie", accessCookie)
      .send({ description: "Updated description" })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/tenants/${tenantId}/assets/${created.body.id}`)
      .set("Cookie", accessCookie)
      .expect(204);

    const actions = await prisma.auditLog.findMany({
      where: { entityType: "Asset", entityId: created.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(actions.map((entry) => entry.action)).toEqual([
      "asset.created",
      "asset.updated",
      "asset.deleted",
    ]);
  });
});
