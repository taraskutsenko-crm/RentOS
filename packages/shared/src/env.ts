import { z } from "zod";

export const nodeEnvSchema = z.enum(["development", "test", "production"]);
export type NodeEnv = z.infer<typeof nodeEnvSchema>;

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
  // File storage (asset images/documents). Only a local-filesystem adapter
  // is implemented today — see docs/adr/0007-asset-file-storage-strategy.md
  // for the S3-compatible interface this is designed to swap into.
  STORAGE_LOCAL_DIR: z.string().min(1).default("./storage-uploads"),
  // Encrypts country-specific e-invoice provider credentials at rest (e.g.
  // a Poland KSeF token/certificate — see EInvoiceConnection.
  // encryptedCredentials and EncryptionService). AES-256-GCM, so this must
  // be exactly 32 bytes — accepted as a 64-character hex string. Never
  // logged, never returned by any API response.
  KSEF_ENCRYPTION_KEY: z
    .string()
    .length(64, "KSEF_ENCRYPTION_KEY must be a 64-character hex string (32 bytes for AES-256)"),
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
