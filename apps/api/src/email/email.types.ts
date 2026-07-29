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
}
