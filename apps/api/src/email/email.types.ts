/** DI token for the bound EmailProvider — mirrors STORAGE_ADAPTER's pattern exactly. */
export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

/**
 * Coarse, safe-to-display reason a send failed — mirrors the Prisma
 * `EmailErrorCategory` enum exactly (see schema.prisma's own doc comment).
 * Never derived from raw provider/SMTP response text.
 */
export type EmailErrorCategory =
  | "AUTH_FAILED"
  | "DOMAIN_NOT_VERIFIED"
  | "SMTP_REJECTED"
  | "CONNECTION_TIMEOUT"
  | "RECIPIENT_REJECTED"
  | "ATTACHMENT_GENERATION_FAILED"
  | "PROVIDER_ERROR";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
  /**
   * When set, this attachment is embedded inline (never shown as a
   * separate downloadable attachment) and referenced from the message's
   * `html` body as `<img src="cid:THIS_VALUE">` — used for the tenant's
   * company logo in transactional emails (Havelio Company Branding,
   * docs/PRODUCT_BIBLE.md). Omitted entirely for a normal file attachment
   * (e.g. the generated PDF).
   */
  cid?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  /**
   * Optional per-message From *display name* (e.g. "Closure Pass Rentals
   * via Havelio" — see tenant-sender-identity.util.ts's buildTenantFromName).
   * The authenticated From *address* is never overridable per-message; it
   * always comes from trusted env configuration (SMTP_FROM_EMAIL). Falls
   * back to the provider's own configured default display name
   * (SMTP_FROM_NAME) when omitted.
   */
  fromName?: string;
  /**
   * Optional per-message Reply-To address (e.g. the tenant's company
   * email — see tenant-sender-identity.util.ts's resolveTenantReplyTo).
   * Takes precedence over the provider's global SMTP_REPLY_TO fallback when
   * set and valid. Providers must independently validate/sanitize this
   * before use — never trust a caller-supplied value blindly (see
   * SmtpEmailProvider.resolveReplyTo).
   */
  replyTo?: string;
}

export interface EmailSendResult {
  success: boolean;
  /** Present only when success is false. */
  error?: string;
  /** Present only when success is false — see EmailErrorCategory's own doc comment. */
  errorCategory?: EmailErrorCategory;
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
