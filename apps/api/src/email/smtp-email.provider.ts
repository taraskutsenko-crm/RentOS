import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";
import { isEmail } from "class-validator";
import nodemailer, { type Transporter } from "nodemailer";

import type { EmailMessage, EmailProvider, EmailSendResult } from "./email.types";
import { stripControlChars } from "./tenant-sender-identity.util";

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
 *
 * Sender identity: the authenticated From *address* is always
 * `SMTP_FROM_EMAIL` — never overridable per-message, by design (see
 * tenant-sender-identity.util.ts). The From *display name* and Reply-To
 * *can* vary per message (`EmailMessage.fromName`/`replyTo`, typically the
 * tenant's own identity — see callers), but this provider is deliberately
 * tenant-agnostic: it has no idea what a "Tenant" is, it only knows how to
 * safely turn a display name / Reply-To string into mail headers. It
 * re-sanitizes/re-validates both defensively regardless of what the caller
 * already did — this is the last line of defense against header injection
 * before anything reaches nodemailer.
 */
@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly transporter: Transporter | null;
  private readonly fromEmail: string | null;
  /** Env-configured default display name (SMTP_FROM_NAME) — used only when a message doesn't supply its own `fromName`. */
  private readonly defaultFromName: string | undefined;
  /** Global fallback Reply-To (SMTP_REPLY_TO) — used only when a message doesn't supply its own valid per-message `replyTo` (see resolveReplyTo). */
  private readonly globalReplyTo: string | undefined;

  constructor(configService: ConfigService<ApiEnv, true>) {
    const host = configService.get("SMTP_HOST", { infer: true });
    const port = configService.get("SMTP_PORT", { infer: true });
    const secure = configService.get("SMTP_SECURE", { infer: true });
    const user = configService.get("SMTP_USER", { infer: true });
    const password = configService.get("SMTP_PASSWORD", { infer: true });
    const fromEmail = configService.get("SMTP_FROM_EMAIL", { infer: true });
    this.defaultFromName = configService.get("SMTP_FROM_NAME", { infer: true });
    this.globalReplyTo = configService.get("SMTP_REPLY_TO", { infer: true });

    if (host && port && user && password && fromEmail) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass: password },
      });
      this.fromEmail = fromEmail;
    } else {
      // Deliberately does not throw — EMAIL_DRIVER=smtp with incomplete
      // config degrades to "not configured" (isConfigured()===false), the
      // same honest-failure shape as LoggingEmailProvider, rather than
      // crashing the whole process at boot over an email misconfiguration.
      this.transporter = null;
      this.fromEmail = null;
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
    if (!this.transporter || !this.fromEmail) {
      return { success: false, error: "SMTP provider is not configured" };
    }
    const replyTo = this.resolveReplyTo(message.replyTo);
    const fromName = this.resolveFromName(message.fromName);
    try {
      const info = await this.transporter.sendMail({
        // Object form (not a hand-built `"name" <addr>` string) so
        // nodemailer's own address encoder handles RFC 2047/5322-correct
        // quoting and encoding — including Unicode display names — rather
        // than this code trying to reimplement that safely. Bare address
        // string when there is no display name at all (never an empty name).
        from: fromName ? { name: fromName, address: this.fromEmail } : this.fromEmail,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(replyTo ? { replyTo } : {}),
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

  /** Per-message display name wins; falls back to SMTP_FROM_NAME, then to no display name at all (bare address). Always re-sanitized here regardless of what the caller already did. */
  private resolveFromName(perMessageFromName: string | undefined): string | undefined {
    const candidate = perMessageFromName ?? this.defaultFromName;
    if (!candidate) return undefined;
    const cleaned = stripControlChars(candidate).trim();
    return cleaned || undefined;
  }

  /**
   * Per-message Reply-To wins over the global SMTP_REPLY_TO fallback (a
   * valid tenant-specific Reply-To must never be silently overridden by the
   * system-wide default — see docs/adr/0013). Re-validates as a
   * syntactically valid email and strips control characters regardless of
   * what the caller already did; an invalid/malformed value is silently
   * omitted (Reply-To dropped, never a send failure, never an injected
   * header).
   */
  private resolveReplyTo(perMessageReplyTo: string | undefined): string | undefined {
    const candidate = perMessageReplyTo ?? this.globalReplyTo;
    if (!candidate) return undefined;
    const cleaned = stripControlChars(candidate).trim();
    if (!cleaned || !isEmail(cleaned)) return undefined;
    return cleaned;
  }
}
