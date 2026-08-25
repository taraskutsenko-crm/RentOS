import { Injectable, Logger } from "@nestjs/common";

import type { EmailMessage, EmailProvider, EmailSendResult } from "./email.types";

/**
 * Default EmailProvider for every environment today (dev, test, and — until
 * a production provider is configured — production too). Logs the message
 * via Nest's Logger and always reports success; it never actually delivers
 * mail. This is a deliberate, honest placeholder (see docs/architecture.md's
 * "Email" section for how a real SMTP/SES/SendGrid provider gets wired in
 * later) — it must never be mistaken for a working transport, so every log
 * line is prefixed clearly and the recipient/subject are always visible for
 * manual verification during development.
 */
@Injectable()
export class LoggingEmailProvider implements EmailProvider {
  private readonly logger = new Logger(LoggingEmailProvider.name);

  send(message: EmailMessage): Promise<EmailSendResult> {
    this.logger.log(
      `[LoggingEmailProvider] Would send email to=${message.to} subject="${message.subject}" ` +
        `attachments=${message.attachments?.length ?? 0} (no real provider configured — see docs/architecture.md)`,
    );
    return Promise.resolve({ success: true });
  }

  isConfigured(): boolean {
    return false;
  }
}
