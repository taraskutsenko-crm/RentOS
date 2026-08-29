import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";
import nodemailer from "nodemailer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SmtpEmailProvider } from "./smtp-email.provider";

vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn() },
}));

function configFrom(values: Partial<ApiEnv>): ConfigService<ApiEnv, true> {
  return {
    get: (key: keyof ApiEnv) => values[key],
  } as unknown as ConfigService<ApiEnv, true>;
}

const FULL_CONFIG: Partial<ApiEnv> = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: "apikey",
  SMTP_PASSWORD: "secret",
  SMTP_FROM_EMAIL: "no-reply@example.com",
  SMTP_FROM_NAME: "Havelio",
  SMTP_REPLY_TO: undefined,
};

describe("SmtpEmailProvider", () => {
  const sendMail = vi.fn();
  const verify = vi.fn();

  beforeEach(() => {
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail, verify } as never);
    sendMail.mockReset();
    verify.mockReset();
  });

  it("reports not configured when required SMTP env vars are missing", () => {
    const provider = new SmtpEmailProvider(configFrom({}));
    expect(provider.isConfigured()).toBe(false);
  });

  it("reports configured once host/port/user/password/from are all present", () => {
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));
    expect(provider.isConfigured()).toBe(true);
  });

  it("refuses to send (without ever calling nodemailer) when not configured", async () => {
    const provider = new SmtpEmailProvider(configFrom({}));
    const result = await provider.send({ to: "a@b.com", subject: "s", html: "<p>x</p>" });
    expect(result).toEqual({ success: false, error: "SMTP provider is not configured" });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends via nodemailer and returns the provider's message id on success", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc123@smtp.example.com>" });
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));

    const result = await provider.send({
      to: "customer@example.com",
      subject: "Your quote",
      html: "<p>hi</p>",
      attachments: [
        { filename: "quote.pdf", content: Buffer.from("pdf"), contentType: "application/pdf" },
      ],
    });

    expect(result).toEqual({ success: true, messageId: "<abc123@smtp.example.com>" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: "Havelio", address: "no-reply@example.com" },
        to: "customer@example.com",
        subject: "Your quote",
        attachments: [
          expect.objectContaining({ filename: "quote.pdf", contentType: "application/pdf" }),
        ],
      }),
    );
  });

  // Phase 7 #1/#2: a per-message fromName is used for the display name, but
  // the authenticated From *address* always stays SMTP_FROM_EMAIL — nothing
  // in EmailMessage can override it.
  it("uses the per-message fromName for the display name while the From address stays SMTP_FROM_EMAIL", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@x>" });
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));

    await provider.send({
      to: "customer@example.com",
      subject: "Your quote",
      html: "<p>hi</p>",
      fromName: "Closure Pass Rentals via Havelio",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { name: "Closure Pass Rentals via Havelio", address: "no-reply@example.com" },
      }),
    );
  });

  // Phase 7 #3: a valid per-message Reply-To is passed straight through to nodemailer.
  it("passes a valid per-message Reply-To to nodemailer", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@x>" });
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));

    await provider.send({
      to: "customer@example.com",
      subject: "s",
      html: "<p>x</p>",
      replyTo: "office@closurepassrentals.com",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "office@closurepassrentals.com" }),
    );
  });

  // Phase 7 #4: no per-message Reply-To and no global SMTP_REPLY_TO — omitted cleanly, no crash.
  it("omits Reply-To entirely when neither a per-message nor a global Reply-To is set", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@x>" });
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));

    await provider.send({ to: "customer@example.com", subject: "s", html: "<p>x</p>" });

    const call = sendMail.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("replyTo");
  });

  // Phase 7 #5: an invalid/malformed Reply-To can never produce unsafe mail
  // headers — it is silently dropped, never sent to nodemailer, never a send failure.
  it("silently omits an invalid Reply-To instead of passing it through", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@x>" });
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));

    await provider.send({
      to: "customer@example.com",
      subject: "s",
      html: "<p>x</p>",
      replyTo: "not-an-email",
    });

    const call = sendMail.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).not.toHaveProperty("replyTo");
  });

  it("strips CR/LF from a Reply-To attempting header injection instead of forwarding it", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@x>" });
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));

    await provider.send({
      to: "customer@example.com",
      subject: "s",
      html: "<p>x</p>",
      replyTo: "office@company.com\r\nBcc: attacker@evil.com",
    });

    // The raw value contains CR/LF so it fails email validation even after
    // stripping (stripping "office@company.comBcc: attacker@evil.com" is
    // not a valid email either) — it must be omitted, never forwarded raw.
    const call = sendMail.mock.calls[0]![0] as Record<string, unknown>;
    expect(JSON.stringify(call)).not.toMatch(/[\r\n]/);
  });

  // Phase 4: a valid per-message Reply-To must win over the global SMTP_REPLY_TO fallback.
  it("prefers a valid per-message Reply-To over the global SMTP_REPLY_TO", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@x>" });
    const provider = new SmtpEmailProvider(
      configFrom({ ...FULL_CONFIG, SMTP_REPLY_TO: "global-fallback@example.com" }),
    );

    await provider.send({
      to: "customer@example.com",
      subject: "s",
      html: "<p>x</p>",
      replyTo: "office@closurepassrentals.com",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "office@closurepassrentals.com" }),
    );
  });

  it("falls back to the global SMTP_REPLY_TO when no per-message Reply-To is given", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@x>" });
    const provider = new SmtpEmailProvider(
      configFrom({ ...FULL_CONFIG, SMTP_REPLY_TO: "global-fallback@example.com" }),
    );

    await provider.send({ to: "customer@example.com", subject: "s", html: "<p>x</p>" });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "global-fallback@example.com" }),
    );
  });

  // Phase 7 #7: SMTP credentials (the password specifically) are never
  // logged, including on failure paths that log a message.
  it("never logs SMTP_PASSWORD, even when send() fails", async () => {
    sendMail.mockRejectedValue(new Error("boom"));
    const logSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));

    await provider.send({ to: "a@b.com", subject: "s", html: "<p>x</p>" });

    const loggedText = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(loggedText).not.toContain(FULL_CONFIG.SMTP_PASSWORD);
    logSpy.mockRestore();
  });

  // Never surface the raw transport error (which can include the SMTP
  // username/host) back to callers/UI — only a short generic message.
  it("returns a generic error and never leaks the raw SMTP error on failure", async () => {
    sendMail.mockRejectedValue(
      new Error("535 Authentication failed for user apikey@smtp.example.com"),
    );
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));

    const result = await provider.send({ to: "a@b.com", subject: "s", html: "<p>x</p>" });

    expect(result.success).toBe(false);
    expect(result.error).not.toContain("apikey");
    expect(result.error).not.toContain("535");
  });

  it("testConnection() reports not configured without calling verify() when SMTP is unconfigured", async () => {
    const provider = new SmtpEmailProvider(configFrom({}));
    const result = await provider.testConnection();
    expect(result).toEqual({ ok: false, error: "SMTP provider is not configured" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("testConnection() reports ok when the transport's own verify() succeeds", async () => {
    verify.mockResolvedValue(true);
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));
    await expect(provider.testConnection()).resolves.toEqual({ ok: true });
  });

  it("testConnection() reports failure without leaking the raw SMTP error", async () => {
    verify.mockRejectedValue(
      new Error("535 Authentication failed for user apikey@smtp.example.com"),
    );
    const provider = new SmtpEmailProvider(configFrom(FULL_CONFIG));
    const result = await provider.testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("apikey");
    expect(result.error).not.toContain("535");
  });
});
