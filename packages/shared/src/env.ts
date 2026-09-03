import { z } from "zod";

export const nodeEnvSchema = z.enum(["development", "test", "production"]);
export type NodeEnv = z.infer<typeof nodeEnvSchema>;

/**
 * An optional numeric env var, safe against Docker Compose's
 * `${VAR:-}` interpolation — when the host doesn't set VAR, Compose still
 * passes the container an *empty string*, not an unset key. Plain
 * `z.coerce.number().optional()` would coerce `""` to `0` (via `Number("")`)
 * and then fail `.positive()`/`.int()` at boot even though the intent was
 * "not configured". This treats `""` the same as truly unset.
 */
function optionalPositiveInt() {
  return z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().int().positive().optional(),
  );
}

/**
 * An env-var boolean, safe against both Docker Compose's empty-string
 * interpolation and JS's `Boolean("false") === true` trap — plain
 * `z.coerce.boolean()` would treat the literal string "false" as truthy.
 * Only "true"/"1" (case-insensitive) are true; everything else (including
 * "false", "0", "", unset) is false.
 */
function booleanFlag(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    return ["true", "1"].includes(value.trim().toLowerCase());
  }, z.boolean().default(defaultValue));
}

/**
 * Environment contract for the API process. Kept intentionally small —
 * infrastructure-only variables, no business/domain configuration.
 */
export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  WEB_ORIGIN: z.string().min(1, "WEB_ORIGIN is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Customer Portal (TASK-0009) — deliberately a separate secret from
  // JWT_ACCESS_SECRET so a customer-portal session token can never be
  // confused with, or accidentally verified as, a staff session token,
  // even if a bug caused the wrong verifier to be used. See
  // docs/adr/0012-customer-portal.md.
  JWT_CUSTOMER_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_CUSTOMER_ACCESS_SECRET must be at least 32 characters"),
  COOKIE_DOMAIN: z.string().optional(),
  // File storage (asset images/documents, generated PDFs, Handover/Return
  // attachments). STORAGE_DRIVER selects the StorageAdapter implementation
  // (see apps/api/src/storage/storage.module.ts) — "local" (default, dev/
  // test) or "s3" (any S3-compatible provider: AWS S3, Cloudflare R2,
  // Backblaze B2, MinIO, ...). See docs/adr/0005-asset-file-storage-strategy.md
  // and docs/adr/0013-production-storage-and-email.md.
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().min(1).default("./storage-uploads"),
  // Only required/consulted when STORAGE_DRIVER=s3 — deliberately optional
  // here (not required) so a local-driver deployment never has to set them.
  // S3StorageAdapter itself throws a clear boot-time error if STORAGE_DRIVER
  // is "s3" and any of these is missing (see s3-storage.adapter.ts).
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // MinIO and most self-hosted S3-compatible servers need "path style"
  // (https://host/bucket/key) instead of AWS's default virtual-hosted style
  // (https://bucket.host/key) — off unless explicitly requested.
  S3_FORCE_PATH_STYLE: booleanFlag(false),
  // Optional public base URL for a bucket already fronted by a CDN/public
  // read policy — unused today (every download still goes through the
  // authenticated streaming endpoint, see StorageService/AssetFilesService/
  // DocumentFilesService), reserved for a future CDN-backed read path.
  S3_PUBLIC_BASE_URL: z.string().optional(),

  // Outbound email transport. EMAIL_DRIVER selects the EmailProvider
  // implementation (see apps/api/src/email/email.module.ts) — "logging"
  // (default, dev/test — see LoggingEmailProvider) or "smtp" (any
  // transactional-SMTP provider: Amazon SES, SendGrid, Mailgun, Postmark,
  // a self-hosted relay, ...). See docs/adr/0013-production-storage-and-email.md.
  EMAIL_DRIVER: z.enum(["logging", "smtp"]).default("logging"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: optionalPositiveInt(),
  // true = implicit TLS (port 465); false = plain/STARTTLS (587/25) — passed
  // straight through to nodemailer's own `secure` option.
  SMTP_SECURE: booleanFlag(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  SMTP_REPLY_TO: z.string().optional(),
  // Encrypts country-specific e-invoice provider credentials at rest (e.g.
  // a Poland KSeF token/certificate — see EInvoiceConnection.
  // encryptedCredentials and EncryptionService). AES-256-GCM, so this must
  // be exactly 32 bytes — accepted as a 64-character hex string. Never
  // logged, never returned by any API response.
  KSEF_ENCRYPTION_KEY: z
    .string()
    .length(64, "KSEF_ENCRYPTION_KEY must be a 64-character hex string (32 bytes for AES-256)"),

  // Havelio Billing (Stage 17) — Stripe is the billing provider for money
  // HAVELIO receives from tenant companies (never the tenant's own rental
  // customers — see HavelioSubscription's doc comment in schema.prisma).
  // All optional, matching the STORAGE_*/SMTP_* precedent: StripeProvider's
  // own isConfigured() gates real functionality, and the Billing UI shows a
  // truthful "Stripe billing is not configured" message when unset — see
  // docs/DECISIONS.md.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  // Verifies inbound webhook signatures (Stripe.webhooks.constructEvent) —
  // required for any webhook to be accepted once STRIPE_SECRET_KEY is set,
  // but kept independently optional here so schema validation itself never
  // blocks booting without Stripe configured at all.
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Deterministic Havelio-plan + billing-interval → Stripe Price mapping
  // (see docs/DECISIONS.md "do not dynamically create duplicate Stripe
  // products/prices on every runtime"). Enterprise has no self-service
  // Price — Contact Sales only in V1.
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STARTER_ANNUAL: z.string().optional(),
  STRIPE_PRICE_BUSINESS_MONTHLY: z.string().optional(),
  STRIPE_PRICE_BUSINESS_ANNUAL: z.string().optional(),
  STRIPE_PRICE_PROFESSIONAL_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PROFESSIONAL_ANNUAL: z.string().optional(),
});
export type ApiEnv = z.infer<typeof apiEnvSchema>;

/**
 * Environment contract for browser-exposed web variables. Every key here
 * must be prefixed NEXT_PUBLIC_ and is inlined at build time by Next.js.
 */
export const webEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().min(1, "NEXT_PUBLIC_API_URL is required"),
});
export type WebEnv = z.infer<typeof webEnvSchema>;

/**
 * Parses and validates a set of environment variables against a schema,
 * throwing a single readable error that lists every missing/invalid key
 * instead of failing on the first one.
 */
export function parseEnv<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  source: Record<string, string | undefined> = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data as z.infer<TSchema>;
}
