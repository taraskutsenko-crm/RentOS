import type { DocumentSignatureStatus } from "@prisma/client";

/** DI token for the bound DocumentSignatureProvider — mirrors STORAGE_ADAPTER/EMAIL_PROVIDER exactly. */
export const DOCUMENT_SIGNATURE_PROVIDER = Symbol("DOCUMENT_SIGNATURE_PROVIDER");

export interface SignatureRequestInput {
  documentNumber: string;
  signerName: string | null;
  signerEmail: string | null;
  pdfBuffer: Buffer;
}

export interface SignatureRequestResult {
  /** Provider-specific tracking id — null for a provider (like LocalMockProvider) with no external system to reference. */
  externalReference: string | null;
  status: Extract<DocumentSignatureStatus, "REQUESTED" | "PENDING">;
}

export interface SignatureStatusResult {
  status: DocumentSignatureStatus;
}

/**
 * Swappable e-signature transport — "Part 6: E-Signature Foundation".
 * Mirrors StorageAdapter (ADR 0005) and EmailProvider (ADR 0007) exactly:
 * only LocalMockProvider is implemented in TASK-0008 Part 2 (no real
 * provider integration yet); a production DocuSign/Adobe
 * Sign/Autenti/eIDAS provider is a future `useClass`/`useFactory` swap in
 * the module wiring, with zero changes needed to
 * DocumentSignatureService or any caller of it. See
 * docs/adr/0011-document-rendering-and-sharing.md.
 */
export interface DocumentSignatureProvider {
  requestSignature(input: SignatureRequestInput): Promise<SignatureRequestResult>;
  checkStatus(externalReference: string | null): Promise<SignatureStatusResult>;
  cancel(externalReference: string | null): Promise<void>;
}
