import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp } from "./test-app";

describe("Health E2E (production-infrastructure pass)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health is public, genuinely checks Postgres/storage/Redis, and never leaks connection details", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.body.status).toBe("ok");
    expect(response.body.database).toBe("up");
    expect(response.body.storage).toBe("up");
    expect(response.body.redis).toBe("up");
    expect(typeof response.body.uptime).toBe("number");

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("postgresql://");
    expect(serialized).not.toContain("redis://");
  });

  it("GET /health/live is public and never touches the database/storage/Redis", async () => {
    const response = await request(app.getHttpServer()).get("/health/live").expect(200);
    expect(response.body).toMatchObject({ status: "ok" });
    expect(response.body.database).toBeUndefined();
  });
});
