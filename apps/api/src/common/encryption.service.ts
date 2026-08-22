import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ApiEnv } from "@rentos/shared";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

/**
 * Encrypts small secrets at rest — today, country-specific e-invoice
 * provider credentials (e.g. a Poland KSeF API token/certificate, see
 * EInvoiceConnection.encryptedCredentials) — using AES-256-GCM with the
 * key from KSEF_ENCRYPTION_KEY (validated at boot by apiEnvSchema, see
 * packages/shared/src/env.ts). No prior encryption-at-rest pattern existed
 * in this codebase before this service (every existing "secret" — password
 * hashes, refresh tokens — is one-way hashed, never decrypted); this is the
 * first reversible-encryption primitive, kept deliberately generic
 * (encrypt/decrypt a string) rather than named after KSeF, so any future
 * provider credential can reuse it unchanged.
 *
 * The ciphertext is serialized as "<ivHex>.<authTagHex>.<ciphertextHex>" —
 * a single opaque string safe to store in one text column. Callers must
 * never log the plaintext or the key, and must never return either in an
 * API response.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(configService: ConfigService<ApiEnv, true>) {
    const hexKey = configService.get("KSEF_ENCRYPTION_KEY", { infer: true });
    this.key = Buffer.from(hexKey, "hex");
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}.${authTag.toString("hex")}.${ciphertext.toString("hex")}`;
  }

  decrypt(payload: string): string {
    const [ivHex, authTagHex, ciphertextHex] = payload.split(".");
    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new Error("Invalid encrypted payload format");
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, "hex")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }
}
