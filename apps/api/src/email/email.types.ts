/** DI token for the bound EmailProvider — mirrors STORAGE_ADAPTER's pattern exactly. */
export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export interface EmailSendResult {
  success: boolean;
  /** Present only when success is false. */
  error?: string;
  /**
   * The transport-level id a real provider returns on acceptance (e.g.
   * SMTP's Message-ID) — present only when a real (non-logging) provider
   * actually accepted the message. Never fabricated; callers persist this
   * verbatim (see DocumentEmailDelivery/QuoteEmailDelivery/
   * InvoiceEmailDelivery.providerMessageId) as truthful proof of send.
   */
  messageId?: string;
}

/**
 * Swappable email transport, mirroring StorageAdapter (see
 * apps/api/src/storage/storage.types.ts and ADR 0005): only a local/logging
 * implementation exists today (see LoggingEmailProvider); a production
 * SMTP/SES/SendGrid provider is a future `useClass`/`useFactory` swap in
 * EmailModule, with zero changes needed to any caller of EmailService.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
  /**
   * Whether this provider can actually deliver mail — `false` for
   * LoggingEmailProvider (no real transport wired up), `true` for a real
   * SMTP/SES/SendGrid provider once one exists. Callers that need to show a
   * truthful "Sent" vs "Not configured" status (see DocumentEmailService)
   * must check this before calling `send`, rather than trusting `send`'s
   * result alone — LoggingEmailProvider's `send` always resolves
   * `{success: true}` for local dev-log visibility, which is not the same
   * claim as "this was actually delivered".
   */
  isConfigured(): boolean;
  /**
   * Optional real connectivity check (e.g. SMTP's own `verify()` — an
   * actual handshake with the transport, not just "the env vars are set").
   * Absent on LoggingEmailProvider (nothing to verify). Used only to power
   * an honest status display (see EmailStatusController) — never called
   * before every send, to avoid a network round trip per email.
   */
  testConnection?(): Promise<{ ok: boolean; error?: string }>;
}
