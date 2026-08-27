import { apiEnvSchema } from "@rentos/shared";
import { describe, expect, it } from "vitest";

/**
 * Regression coverage for a real bug caught during the production-
 * infrastructure pass: Docker Compose's `${VAR:-}` interpolation passes an
 * *empty string* to the container when the host doesn't set VAR — not an
 * unset key. Plain `z.coerce.number().optional()` turns `""` into `0` (via
 * `Number("")`) and then fails `.positive()`; plain `z.coerce.boolean()`
 * treats the literal string `"false"` as truthy (`Boolean("false") ===
 * true` in JS). Both would have made docker/docker-compose.yml's new
 * S3 and SMTP env passthroughs crash the API at boot, or silently force
 * S3_FORCE_PATH_STYLE/SMTP_SECURE to true, for every deployment that
 * doesn't set them. See docs/DECISIONS.md production-infrastructure pass.
 */
function requiredEnv() {
  return {
    DATABASE_URL: "postgresql://x",
    REDIS_URL: "redis://x",
    WEB_ORIGIN: "http://localhost:3000",
    JWT_ACCESS_SECRET: "a".repeat(32),
    JWT_CUSTOMER_ACCESS_SECRET: "b".repeat(32),
    KSEF_ENCRYPTION_KEY: "c".repeat(64),
  };
}

describe("apiEnvSchema — Docker Compose empty-string interpolation safety", () => {
  it("treats an empty-string SMTP_PORT (unset via ${SMTP_PORT:-}) as genuinely unset, not 0", () => {
    const result = apiEnvSchema.safeParse({ ...requiredEnv(), SMTP_PORT: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.SMTP_PORT).toBeUndefined();
  });

  it("still validates a real SMTP_PORT value", () => {
    const result = apiEnvSchema.safeParse({ ...requiredEnv(), SMTP_PORT: "587" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.SMTP_PORT).toBe(587);
  });

  it('treats the literal string "false" as false for S3_FORCE_PATH_STYLE (not JS-truthy)', () => {
    const result = apiEnvSchema.safeParse({ ...requiredEnv(), S3_FORCE_PATH_STYLE: "false" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('treats the literal string "false" as false for SMTP_SECURE, and "true" as true', () => {
    const falseResult = apiEnvSchema.safeParse({ ...requiredEnv(), SMTP_SECURE: "false" });
    expect(falseResult.success).toBe(true);
    if (falseResult.success) expect(falseResult.data.SMTP_SECURE).toBe(false);

    const trueResult = apiEnvSchema.safeParse({ ...requiredEnv(), SMTP_SECURE: "true" });
    expect(trueResult.success).toBe(true);
    if (trueResult.success) expect(trueResult.data.SMTP_SECURE).toBe(true);
  });

  it("an empty-string boolean/string field (unset via ${VAR:-}) never fails validation", () => {
    const result = apiEnvSchema.safeParse({
      ...requiredEnv(),
      S3_FORCE_PATH_STYLE: "",
      SMTP_SECURE: "",
      S3_REGION: "",
      SMTP_HOST: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_FORCE_PATH_STYLE).toBe(false);
      expect(result.data.SMTP_SECURE).toBe(false);
    }
  });
});
