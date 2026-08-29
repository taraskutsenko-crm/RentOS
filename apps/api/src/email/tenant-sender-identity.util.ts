import { isEmail } from "class-validator";

/**
 * Resolves the customer-visible sender identity for a tenant's outbound
 * transactional email (Quote/Document/Invoice/Handover/Return/
 * portal-invite) — see docs/adr/0013-production-storage-and-email.md.
 *
 * Deliberately pure/provider-neutral: nothing here imports nodemailer or
 * knows about Resend/SES/SendGrid. Callers pass the result on
 * `EmailMessage.fromName`/`EmailMessage.replyTo`; the bound EmailProvider
 * (see SmtpEmailProvider) is the one place that turns these into actual MIME
 * headers, and re-validates/re-sanitizes them again there as a second,
 * transport-level line of defense — this module is the *first* line, not
 * the only one.
 *
 * Security model: the authenticated From *address* never comes from here —
 * it always stays SMTP_FROM_EMAIL (trusted env config). Only the display
 * *name* and Reply-To are tenant-controlled, and both are resolved
 * exclusively from the tenant row already loaded by `tenantId` in the
 * calling service (never from request-body input) — see
 * QuotesService.send/DocumentEmailService.dispatch/InvoiceEmailService.send/
 * CustomerPortalInvitationsService.invite, none of which accept a
 * `fromName`/`replyTo` field on their DTOs.
 */

const MAX_DISPLAY_NAME_LENGTH = 200; // matches Tenant.name's own UpdateTenantDto limit
const MAX_REPLY_TO_LENGTH = 320; // RFC 5321 4.5.3.1.3 max mailbox length

/**
 * Strips CR/LF/NUL and other C0/DEL control characters from a value before
 * it can end up in an email header — the concrete defense against header
 * injection (e.g. a tenant name containing `\r\nBcc: attacker@evil.com`).
 * Applied to both the display name and the Reply-To address.
 */
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally matching control chars to strip them
  return value.replace(/[\x00-\x1F\x7F]/g, "");
}

/**
 * Builds the From display name: "<Tenant Company Name> via Havelio". Falls
 * back to plain "Havelio" whenever the tenant name is missing, blank, or
 * becomes blank after sanitization — never produces "undefined via
 * Havelio", "null via Havelio", or " via Havelio".
 */
export function buildTenantFromName(tenantName: string | null | undefined): string {
  const cleaned = stripControlChars(tenantName ?? "")
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
  return cleaned ? `${cleaned} via Havelio` : "Havelio";
}

/**
 * Resolves the Reply-To address from the tenant's own persisted
 * `Tenant.email` — the canonical customer-facing company email (see
 * schema.prisma's Tenant.email doc comment). Returns `undefined` (Reply-To
 * omitted entirely, sending must still proceed) whenever the value is
 * missing, not a syntactically valid email, or becomes empty after
 * sanitization — this function never fabricates an address and never falls
 * back to another tenant's or the global SMTP_REPLY_TO address; that
 * fallback, if any, is the transport's own concern (see
 * SmtpEmailProvider.resolveReplyTo).
 */
export function resolveTenantReplyTo(tenantEmail: string | null | undefined): string | undefined {
  if (!tenantEmail) return undefined;
  const cleaned = stripControlChars(tenantEmail).trim().slice(0, MAX_REPLY_TO_LENGTH);
  if (!cleaned || !isEmail(cleaned)) return undefined;
  return cleaned;
}
