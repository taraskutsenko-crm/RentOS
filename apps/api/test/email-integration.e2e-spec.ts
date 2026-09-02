import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { EMAIL_PROVIDER } from "../src/email/email.types";
import type { EmailMessage, EmailProvider, EmailSendResult } from "../src/email/email.types";
import { cleanDatabase } from "./db.util";
import { extractCookie, validRegisterPayload } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string; email: string };
  tenant: { id: string };
}

/**
 * Task B — honest email status semantics (NOT_CONFIGURED / CONFIGURED /
 * READY / CONNECTION_TEST_FAILED) and the real test-send endpoint. The
 * test-env default (LoggingEmailProvider) can never reach the
 * "configured" states, so a controllable fake is bound in EMAIL_PROVIDER's
 * place — same technique as tenant-email-sender-identity.e2e-spec.ts.
 */
describe("Email integration status + test send E2E (Task B)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let sentMessages: EmailMessage[];
  let providerConfigured: boolean;
  let testConnectionResult: { ok: boolean; error?: string };
  let sendResult: EmailSendResult;

  const fakeProvider: EmailProvider = {
    isConfigured: () => providerConfigured,
    send: (message: EmailMessage) => {
      sentMessages.push(message);
      return Promise.resolve(sendResult);
    },
    testConnection: () => Promise.resolve(testConnectionResult),
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(EMAIL_PROVIDER).useValue(fakeProvider),
    );
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    sentMessages = [];
    providerConfigured = true;
    testConnectionResult = { ok: true };
    sendResult = { success: true, messageId: "<fake@test>" };
  });

  async function registerTenant(email: string, companyName = "Email Test Co") {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email, companyName })
      .expect(201);
    const body = response.body as RegisterResponseBody;
    return {
      tenantId: body.tenant.id,
      userId: body.user.id,
      userEmail: body.user.email,
      cookie: extractCookie(response.headers, "rentos_access_token"),
    };
  }

  describe("status semantics", () => {
    it("1. reports NOT_CONFIGURED when no usable provider is bound", async () => {
      providerConfigured = false;
      const { tenantId, cookie } = await registerTenant("status-notconfigured@example.com");

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/integrations/email/status`)
        .set("Cookie", cookie)
        .expect(200);

      expect(response.body).toEqual({ status: "NOT_CONFIGURED" });
    });

    it("3. reports READY only after a real connectivity check succeeds", async () => {
      testConnectionResult = { ok: true };
      const { tenantId, cookie } = await registerTenant("status-ready@example.com");

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/integrations/email/status`)
        .set("Cookie", cookie)
        .expect(200);

      expect(response.body).toEqual({ status: "READY" });
    });

    it("4. reports CONNECTION_TEST_FAILED after a failed verification, with a safe (non-secret) error", async () => {
      testConnectionResult = { ok: false, error: "Could not establish a connection to the SMTP server" };
      const { tenantId, cookie } = await registerTenant("status-failed@example.com");

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/integrations/email/status`)
        .set("Cookie", cookie)
        .expect(200);

      expect(response.body).toEqual({
        status: "CONNECTION_TEST_FAILED",
        error: "Could not establish a connection to the SMTP server",
      });
    });

    it("5. never returns SMTP credentials or provider-internal detail in the status response", async () => {
      testConnectionResult = { ok: false, error: "Could not establish a connection to the SMTP server" };
      const { tenantId, cookie } = await registerTenant("status-nosecrets@example.com");

      const response = await request(app.getHttpServer())
        .get(`/tenants/${tenantId}/integrations/email/status`)
        .set("Cookie", cookie)
        .expect(200);

      const raw = JSON.stringify(response.body);
      expect(raw).not.toMatch(/password|smtp_user|smtp_pass|apikey|secret/i);
    });
  });

  describe("test-email send", () => {
    it("sends a real test email through the configured provider and reports success", async () => {
      const { tenantId, cookie } = await registerTenant("send-success@example.com", "Send Success Co");

      const response = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/integrations/email/test`)
        .set("Cookie", cookie)
        .send({ recipientEmail: "recipient@example.com" })
        .expect(201);

      expect(response.body).toEqual({ success: true });
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]!.to).toBe("recipient@example.com");
      expect(sentMessages[0]!.subject).toBe("Havelio — Email configuration test");
      // 9. uses the existing sender-identity/Reply-To architecture, not a
      // parallel/ad-hoc implementation.
      expect(sentMessages[0]!.fromName).toBe("Send Success Co via Havelio");
    });

    it("returns a truthful, safe failure result when the real send fails, never a raw transport error", async () => {
      sendResult = { success: false, error: "The email provider rejected or failed to send this message" };
      const { tenantId, cookie } = await registerTenant("send-fail@example.com");

      const response = await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/integrations/email/test`)
        .set("Cookie", cookie)
        .send({ recipientEmail: "recipient@example.com" })
        .expect(201);

      expect(response.body).toEqual({
        success: false,
        error: "The email provider rejected or failed to send this message",
      });
    });

    it("rejects a test send when the provider isn't configured, without pretending to try", async () => {
      providerConfigured = false;
      const { tenantId, cookie } = await registerTenant("send-notconfigured@example.com");

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/integrations/email/test`)
        .set("Cookie", cookie)
        .send({ recipientEmail: "recipient@example.com" })
        .expect(409);

      expect(sentMessages).toHaveLength(0);
    });

    it("7. rejects an invalid recipient email", async () => {
      const { tenantId, cookie } = await registerTenant("send-invalid-recipient@example.com");

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/integrations/email/test`)
        .set("Cookie", cookie)
        .send({ recipientEmail: "not-an-email" })
        .expect(400);

      expect(sentMessages).toHaveLength(0);
    });

    it("6/10. enforces integrations.manage — a VIEWER-role member cannot trigger a test send, and the rejection leaks no credentials", async () => {
      const owner = await registerTenant("send-perm-owner@example.com");
      const viewerRegister = await request(app.getHttpServer())
        .post("/auth/register")
        .send({ ...validRegisterPayload, email: "send-perm-viewer@example.com", companyName: "Viewer Co" })
        .expect(201);
      const viewerBody = viewerRegister.body as RegisterResponseBody;
      const viewerCookie = extractCookie(viewerRegister.headers, "rentos_access_token");
      await prisma.tenantMembership.create({
        data: { tenantId: owner.tenantId, userId: viewerBody.user.id, role: "VIEWER", status: "ACTIVE" },
      });

      const response = await request(app.getHttpServer())
        .post(`/tenants/${owner.tenantId}/integrations/email/test`)
        .set("Cookie", viewerCookie)
        .send({ recipientEmail: "recipient@example.com" })
        .expect(403);

      expect(sentMessages).toHaveLength(0);
      expect(JSON.stringify(response.body)).not.toMatch(/password|smtp_user|smtp_pass|apikey/i);
    });

    it("8. cross-tenant safety — a member of tenant A cannot trigger a test send against tenant B", async () => {
      const tenantA = await registerTenant("cross-a@example.com");
      const tenantB = await registerTenant("cross-b@example.com");

      await request(app.getHttpServer())
        .post(`/tenants/${tenantB.tenantId}/integrations/email/test`)
        .set("Cookie", tenantA.cookie)
        .send({ recipientEmail: "recipient@example.com" })
        .expect(403);

      expect(sentMessages).toHaveLength(0);
    });

    it("9. uses the tenant's own company email as Reply-To, matching the existing sender-identity architecture", async () => {
      const { tenantId, cookie } = await registerTenant("send-replyto@example.com", "Reply To Co");
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      await request(app.getHttpServer())
        .patch(`/tenants/${tenantId}`)
        .set("Cookie", cookie)
        .send({
          name: tenant.name,
          timezone: tenant.timezone,
          registrationNumber: "",
          taxNumber: "",
          address: "",
          phone: "",
          email: "office@reply-to-co.example",
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tenants/${tenantId}/integrations/email/test`)
        .set("Cookie", cookie)
        .send({ recipientEmail: "recipient@example.com" })
        .expect(201);

      expect(sentMessages[0]!.replyTo).toBe("office@reply-to-co.example");
    });
  });
});

/**
 * Task B2's "CONFIGURED" state: a real provider is bound but offers no
 * `testConnection` (e.g. a hypothetical future provider type without a
 * verify step) — must never be silently promoted to READY. Needs its own
 * app instance since the fake provider's shape (no testConnection method
 * at all) is fixed for the app's lifetime.
 */
describe("Email integration status — CONFIGURED (bound, unverifiable) E2E", () => {
  let app: INestApplication;

  const configuredOnlyProvider: EmailProvider = {
    isConfigured: () => true,
    send: () => Promise.resolve({ success: true }),
    // Deliberately no testConnection — see class doc comment.
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(EMAIL_PROVIDER).useValue(configuredOnlyProvider),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it("2. reports CONFIGURED (never READY) when bound but connectivity cannot be verified", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ ...validRegisterPayload, email: "status-configured-only@example.com" })
      .expect(201);
    const body = response.body as RegisterResponseBody;
    const cookie = extractCookie(response.headers, "rentos_access_token");

    const statusResponse = await request(app.getHttpServer())
      .get(`/tenants/${body.tenant.id}/integrations/email/status`)
      .set("Cookie", cookie)
      .expect(200);

    expect(statusResponse.body).toEqual({ status: "CONFIGURED" });
  });
});
