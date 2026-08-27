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
        from: '"Havelio" <no-reply@example.com>',
        to: "customer@example.com",
        subject: "Your quote",
        attachments: [
          expect.objectContaining({ filename: "quote.pdf", contentType: "application/pdf" }),
        ],
      }),
    );
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
