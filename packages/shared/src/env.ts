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
