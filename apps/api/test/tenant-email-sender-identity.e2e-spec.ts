import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { EMAIL_PROVIDER } from "../src/email/email.types";
import type { EmailMessage, EmailProvider } from "../src/email/email.types";
import { cleanDatabase } from "./db.util";
import { extractCookie } from "./fixtures";
import { createTestApp } from "./test-app";

interface RegisterResponseBody {
  user: { id: string };
  tenant: { id: string };
}

/**
 * Proves the multi-tenant sender identity / dynamic Reply-To architecture
 * (docs/adr/0013-production-storage-and-email.md): a Tenant's outbound
 * transactional email must carry *that* tenant's company name/email and
 * never another tenant's — this is the actual security property, so it is
 * exercised through the real HTTP flow (register → set company profile →
 * create + send a quote) with only the transport (EmailProvider) faked out,
 * exactly as production would run it end-to-end except for the real SMTP
 * hop. Test-env default (LoggingEmailProvider) never delivers, so a
 * capturing fake is bound in its place via overrideProvider — the same
 * pattern already used by auth-rollback.e2e-spec.ts.
 */
describe("Tenant email sender identity E2E", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let sentMessages: EmailMessage[];

  const fakeEmailProvider: EmailProvider = {
    isConfigured: () => true,
    send: (message: EmailMessage) => {
      sentMessages.push(message);
      return Promise.resolve({ success: true, messageId: "<fake@test>" });
    },
  };

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(EMAIL_PROVIDER).useValue(fakeEmailProvider),
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
  });

  async function registerTenant(
    companyName: string,
    ownerEmail: string,
  ): Promise<{ tenantId: string; cookie: string }> {
    const response = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: ownerEmail,
        password: "SuperSecret123",
        firstName: "Ada",
        lastName: "Lovelace",
        companyName,
        countryCode: "US",
        defaultLanguage: "en",
        defaultCurrency: "USD",
        timezone: "America/New_York",
      })
      .expect(201);
    const body = response.body as RegisterResponseBody;
    return {
      tenantId: body.tenant.id,
      cookie: extractCookie(response.headers, "rentos_access_token"),
    };
  }

  async function setCompanyEmail(tenantId: string, cookie: string, email: string): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}`)
      .set("Cookie", cookie)
      .send({
        name: (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).name,
        timezone: (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).timezone,
        registrationNumber: "",
        taxNumber: "",
        address: "",
        phone: "",
        email,
      })
      .expect(200);
  }

  async function createAndSendQuote(
    tenantId: string,
    cookie: string,
    recipientEmail: string,
    label = "0001",
  ): Promise<void> {
    const customer = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set("Cookie", cookie)
      .send({ firstName: "John", lastName: "Customer", email: `customer-${label}@example.com` })
      .expect(201);

    const category = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/asset-categories`)
      .set("Cookie", cookie)
      .send({ name: `Generators ${label}` })
      .expect(201);

    const asset = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/assets`)
      .set("Cookie", cookie)
      .send({ name: "Generator", internalNumber: `GEN-${label}`, categoryId: category.body.id })
      .expect(201);

    const dateOffset = (days: number): string => {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString();
    };

    const quote = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes`)
      .set("Cookie", cookie)
      .send({
        customerId: customer.body.id,
        validUntil: dateOffset(30),
        plannedStart: dateOffset(1),
        plannedEnd: dateOffset(4),
        items: [
          {
            itemType: "ASSET",
            assetId: asset.body.id,
            name: "Generator",
            quantity: 1,
            billingMode: "DAILY",
            dailyPriceMinor: 5000,
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/quotes/${quote.body.id}/send`)
      .set("Cookie", cookie)
      .send({ recipientEmail })
      .expect(201);
  }

  it("gives each tenant's outbound email its own sender identity and Reply-To — never another tenant's", async () => {
    const tenantA = await registerTenant("Company A Rentals", "owner-a@example.com");
    await setCompanyEmail(tenantA.tenantId, tenantA.cookie, "office@company-a.com");

    const tenantB = await registerTenant("Company B Rentals", "owner-b@example.com");
    await setCompanyEmail(tenantB.tenantId, tenantB.cookie, "office@company-b.com");

    await createAndSendQuote(tenantA.tenantId, tenantA.cookie, "customer-a@example.com");
    await createAndSendQuote(tenantB.tenantId, tenantB.cookie, "customer-b@example.com");

    expect(sentMessages).toHaveLength(2);
    const [messageA, messageB] = sentMessages;

    expect(messageA!.fromName).toBe("Company A Rentals via Havelio");
    expect(messageA!.replyTo).toBe("office@company-a.com");
    expect(messageA!.fromName).not.toContain("Company B");
    expect(messageA!.replyTo).not.toBe("office@company-b.com");

    expect(messageB!.fromName).toBe("Company B Rentals via Havelio");
    expect(messageB!.replyTo).toBe("office@company-b.com");
    expect(messageB!.fromName).not.toContain("Company A");
    expect(messageB!.replyTo).not.toBe("office@company-a.com");
  });

  it("omits Reply-To safely when the tenant's company email is missing, without failing the send", async () => {
    const tenant = await registerTenant("No Email Rentals", "owner-noemail@example.com");
    // Deliberately never calls setCompanyEmail — Tenant.email stays null.

    await createAndSendQuote(tenant.tenantId, tenant.cookie, "customer@example.com");

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.fromName).toBe("No Email Rentals via Havelio");
    expect(sentMessages[0]!.replyTo).toBeUndefined();
  });

  it("omits Reply-To safely when the tenant's persisted company email is malformed (e.g. legacy/migrated data)", async () => {
    const tenant = await registerTenant("Bad Data Rentals", "owner-baddata@example.com");
    // Simulates data that predates validation — direct write, bypassing the
    // DTO's @IsEmail() to prove the *sender* (not just the form) is safe.
    await prisma.tenant.update({
      where: { id: tenant.tenantId },
      data: { email: "not-a-valid-email" },
    });

    await createAndSendQuote(tenant.tenantId, tenant.cookie, "customer@example.com");

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.replyTo).toBeUndefined();
  });

  // Requirement: User.email (the staff login) must never be substituted for
  // Tenant.email (the company's own Reply-To address) — these are two
  // unrelated concepts (see tenant-sender-identity.util.ts's doc comment).
  it("never uses the logged-in staff user's own login email as Reply-To", async () => {
    const ownerLoginEmail = "owner-loginemail@example.com";
    const tenant = await registerTenant("Login Email Isolation Co", ownerLoginEmail);
    // No company email configured — if User.email were ever used as a
    // fallback, Reply-To would incorrectly become the owner's own login
    // address here.
    await createAndSendQuote(tenant.tenantId, tenant.cookie, "customer@example.com", "A");
    expect(sentMessages[0]!.replyTo).toBeUndefined();
    expect(sentMessages[0]!.replyTo).not.toBe(ownerLoginEmail);

    sentMessages = [];
    // Now configure a *different* company email than the owner's own login
    // address — Reply-To must follow Tenant.email, never User.email, even
    // though both are non-empty valid addresses at this point.
    const companyEmail = "office@login-email-isolation.example";
    await setCompanyEmail(tenant.tenantId, tenant.cookie, companyEmail);
    await createAndSendQuote(tenant.tenantId, tenant.cookie, "customer@example.com", "B");
    expect(sentMessages[0]!.replyTo).toBe(companyEmail);
    expect(sentMessages[0]!.replyTo).not.toBe(ownerLoginEmail);
  });

  it("cross-tenant resource access remains denied for the company-profile endpoint used by this feature", async () => {
    const tenantA = await registerTenant("Isolated A", "owner-iso-a@example.com");
    const tenantB = await registerTenant("Isolated B", "owner-iso-b@example.com");

    // Tenant A's session must not be able to update Tenant B's company profile/email.
    await request(app.getHttpServer())
      .patch(`/tenants/${tenantB.tenantId}`)
      .set("Cookie", tenantA.cookie)
      .send({
        name: "Hijacked",
        registrationNumber: "",
        taxNumber: "",
        address: "",
        phone: "",
        email: "attacker@evil.com",
      })
      .expect(403);

    const untouched = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantB.tenantId } });
    expect(untouched.name).toBe("Isolated B");
    expect(untouched.email).toBeNull();
  });
});
