import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentEmailService } from "./document-email.service";

/**
 * Email-delivery diagnosis task — DocumentEmailService is the one send
 * pipeline (of Document/Quote/Invoice/PaymentDemand) that creates its
 * delivery row as PENDING *before* attempting the send (see this class's
 * own doc comment on the queue seam). Before this fix, any exception during
 * PDF generation — never mind SMTP — propagated straight out of dispatch()
 * uncaught, leaving that PENDING row orphaned forever (no queue/worker ever
 * revisits it). These tests pin the guarantee that can never regress:
 * dispatch() always ends in a terminal (SENT/FAILED/NOT_CONFIGURED) status,
 * never leaves — or throws out of — a permanent PENDING.
 */
function buildDocument() {
  return {
    id: "doc-1",
    tenantId: "tenant-1",
    documentNumber: "DOC-000001",
    currentVersionNumber: 1,
    customerId: "customer-1",
    employeeUserId: null,
    customer: { email: "customer@example.com" },
    versions: [{ id: "version-1", versionNumber: 1 }],
  } as never;
}

function buildHarness(overrides: {
  pdfGetOrGenerate?: ReturnType<typeof vi.fn>;
  emailSend?: ReturnType<typeof vi.fn>;
  emailIsConfigured?: boolean;
}) {
  const document = buildDocument();
  const createdDelivery = {
    id: "delivery-1",
    tenantId: "tenant-1",
    documentId: "doc-1",
    documentVersionId: "version-1",
    recipientType: "CUSTOMER",
    recipientEmail: "customer@example.com",
    subject: "Your document",
    message: null,
    status: "PENDING",
    sentByUserId: "user-1",
  };

  const updateCalls: Record<string, unknown>[] = [];
  const prisma = {
    documentEmailDelivery: {
      create: vi.fn().mockResolvedValue(createdDelivery),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        updateCalls.push(data);
        return Promise.resolve({ ...createdDelivery, ...data });
      }),
    },
    tenant: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ name: "Acme Rentals", email: null, logoStorageKey: null, logoMimeType: null }),
    },
  };

  const auditService = { log: vi.fn().mockResolvedValue(undefined) };
  const documentsService = { findOneRaw: vi.fn().mockResolvedValue(document) };
  const pdfService = {
    getOrGenerate:
      overrides.pdfGetOrGenerate ?? vi.fn().mockResolvedValue({ buffer: Buffer.from("pdf") }),
  };
  const emailService = {
    isConfigured: vi.fn().mockReturnValue(overrides.emailIsConfigured ?? true),
    send: overrides.emailSend ?? vi.fn().mockResolvedValue({ success: true, messageId: "msg-1" }),
  };
  const storageService = { read: vi.fn() };

  const service = new DocumentEmailService(
    prisma as never,
    auditService as never,
    documentsService as never,
    pdfService as never,
    emailService as never,
    storageService as never,
  );

  return { service, prisma, updateCalls, auditService };
}

describe("DocumentEmailService.send/dispatch", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("PDF/attachment generation failure: PENDING -> FAILED with ATTACHMENT_GENERATION_FAILED, never throws, never stays PENDING", async () => {
    const pdfGetOrGenerate = vi.fn().mockRejectedValue(new Error("NoSuchKey: missing object"));
    const { service, updateCalls } = buildHarness({ pdfGetOrGenerate });

    const result = await service.send("tenant-1", "doc-1", "user-1", {
      recipientType: "CUSTOMER",
      subject: "Your document",
    } as never);

    expect(result.status).toBe("FAILED");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      status: "FAILED",
      errorCategory: "ATTACHMENT_GENERATION_FAILED",
    });
    // The raw exception message (which can contain storage keys) must never
    // reach the persisted, UI-facing errorMessage.
    expect(String(updateCalls[0]!.errorMessage)).not.toContain("NoSuchKey");
  });

  it("successful send: PENDING -> SENT, with the real provider messageId persisted", async () => {
    const emailSend = vi.fn().mockResolvedValue({ success: true, messageId: "msg-42" });
    const { service, updateCalls } = buildHarness({ emailSend });

    const result = await service.send("tenant-1", "doc-1", "user-1", {
      recipientType: "CUSTOMER",
      subject: "Your document",
    } as never);

    expect(result.status).toBe("SENT");
    expect(updateCalls[0]).toMatchObject({
      status: "SENT",
      errorMessage: null,
      errorCategory: null,
      providerMessageId: "msg-42",
    });
  });

  it("SMTP rejection: PENDING -> FAILED with the provider's errorCategory persisted", async () => {
    const emailSend = vi.fn().mockResolvedValue({
      success: false,
      error: "The email provider rejected or failed to send this message",
      errorCategory: "AUTH_FAILED",
    });
    const { service, updateCalls } = buildHarness({ emailSend });

    const result = await service.send("tenant-1", "doc-1", "user-1", {
      recipientType: "CUSTOMER",
      subject: "Your document",
    } as never);

    expect(result.status).toBe("FAILED");
    expect(updateCalls[0]).toMatchObject({ status: "FAILED", errorCategory: "AUTH_FAILED" });
  });

  // A send() failure with no errorCategory at all (defensive — should not
  // happen from SmtpEmailProvider today, but never leave errorCategory
  // silently null on a real FAILED row either).
  it("falls back to PROVIDER_ERROR when a failed send carries no errorCategory", async () => {
    const emailSend = vi.fn().mockResolvedValue({ success: false, error: "unknown" });
    const { service, updateCalls } = buildHarness({ emailSend });

    await service.send("tenant-1", "doc-1", "user-1", {
      recipientType: "CUSTOMER",
      subject: "Your document",
    } as never);

    expect(updateCalls[0]).toMatchObject({ status: "FAILED", errorCategory: "PROVIDER_ERROR" });
  });

  it("not configured: PENDING -> NOT_CONFIGURED without attempting PDF generation or a send", async () => {
    const pdfGetOrGenerate = vi.fn();
    const emailSend = vi.fn();
    const { service, updateCalls } = buildHarness({
      pdfGetOrGenerate,
      emailSend,
      emailIsConfigured: false,
    });

    const result = await service.send("tenant-1", "doc-1", "user-1", {
      recipientType: "CUSTOMER",
      subject: "Your document",
    } as never);

    expect(result.status).toBe("NOT_CONFIGURED");
    expect(pdfGetOrGenerate).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
  });
});
