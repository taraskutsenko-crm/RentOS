import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";
import nodemailer, { type Transporter } from "nodemailer";

import type { EmailMessage, EmailProvider, EmailSendResult } from "./email.types";

/**
 * Provider-neutral SMTP transport — works with any transactional-SMTP
 * provider (Amazon SES SMTP, SendGrid SMTP, Mailgun SMTP, Postmark SMTP, a
 * self-hosted relay, ...) via `nodemailer`, the one library this codebase
 * ever calls directly for outbound mail (see docs/adr/0013-production-storage-and-email.md
 * — mirrors ADR 0005's "nothing outside storage/ imports a storage SDK"
 * rule for email: nothing outside `email/` imports `nodemailer`).
 *
 * `isConfigured()` is the truthfulness gate DocumentEmailService/
 * QuotesService/InvoiceEmailService all check before doing real work (see
 * D-093) — it is `true` only when every field this provider actually needs
 * (host, user, password, from address) is present, never merely "an SMTP
 * driver was selected."
 */
@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string | null;
  private readonly replyTo: string | undefined;

  constructor(configService: ConfigService<ApiEnv, true>) {
    const host = configService.get("SMTP_HOST", { infer: true });
    const port = configService.get("SMTP_PORT", { infer: true });
    const secure = configService.get("SMTP_SECURE", { infer: true });
    const user = configService.get("SMTP_USER", { infer: true });
    const password = configService.get("SMTP_PASSWORD", { infer: true });
    const fromEmail = configService.get("SMTP_FROM_EMAIL", { infer: true });
    const fromName = configService.get("SMTP_FROM_NAME", { infer: true });
    this.replyTo = configService.get("SMTP_REPLY_TO", { infer: true });

    if (host && port && user && password && fromEmail) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass: password },
      });
      this.fromAddress = fromName ? `"${fromName}" <${fromEmail}>` : fromEmail;
    } else {
      // Deliberately does not throw — EMAIL_DRIVER=smtp with incomplete
      // config degrades to "not configured" (isConfigured()===false), the
      // same honest-failure shape as LoggingEmailProvider, rather than
      // crashing the whole process at boot over an email misconfiguration.
      this.transporter = null;
      this.fromAddress = null;
      this.logger.warn(
        "EMAIL_DRIVER=smtp but SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_FROM_EMAIL are not all set — email sending will report NOT_CONFIGURED until they are.",
      );
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.transporter) return { ok: false, error: "SMTP provider is not configured" };
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (error) {
      this.logger.error(
        `SMTP connection test failed: ${error instanceof Error ? error.message : error}`,
      );
      return { ok: false, error: "Could not establish a connection to the SMTP server" };
    }
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.transporter || !this.fromAddress) {
      return { success: false, error: "SMTP provider is not configured" };
    }
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
        attachments: message.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
      });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      // Never surface the raw SMTP error to callers/UI verbatim — it can
      // include the auth username or other transport detail. A short,
      // generic message is enough for staff to know it failed and retry.
      this.logger.error(`SMTP send failed: ${error instanceof Error ? error.message : error}`);
      return {
        success: false,
        error: "The email provider rejected or failed to send this message",
      };
    }
  }
}
