import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string };
}

describe("Email status E2E (production-infrastructure pass)", () => {
  let app: INestApplication;
  let accessCookie: string;
  let tenantId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const registerResponse = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: `email-status-${Date.now()}@example.com` })
      .expect(201);
    const body = registerResponse.body as RegisterResponseBody;
    tenantId = body.tenant.id;
    accessCookie = extractCookie(registerResponse.headers, "rentos_access_token");
  });

  it("honestly reports NOT_CONFIGURED when only LoggingEmailProvider is bound (EMAIL_DRIVER unset in tests)", async () => {
    const response = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/integrations/email/status`)
      .set("Cookie", accessCookie)
      .expect(200);

    expect(response.body).toEqual({ status: "NOT_CONFIGURED" });
  });
});
