import {
  DOCUMENT_ATTACHMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_ATTACHMENT_MAX_SIZE_BYTES,
} from "@rentos/shared";

import { ApiError } from "./api-client";

/** Same allowlist StorageService.validateDocument enforces server-side — see its own doc comment in @rentos/shared. */
export const DOCUMENT_UPLOAD_ACCEPT = DOCUMENT_ATTACHMENT_ALLOWED_MIME_TYPES.join(",");
export const DOCUMENT_UPLOAD_MAX_SIZE_BYTES = DOCUMENT_ATTACHMENT_MAX_SIZE_BYTES;

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
};

/** Short human list for the "Supported: PDF, JPG, PNG, WEBP" helper text. */
export const DOCUMENT_UPLOAD_TYPE_LABELS = DOCUMENT_ATTACHMENT_ALLOWED_MIME_TYPES.map(
  (mime: string) => EXTENSION_BY_MIME_TYPE[mime] ?? mime,
);

export function isAllowedDocumentFileType(file: File): boolean {
  return (DOCUMENT_ATTACHMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type);
}

export function isWithinDocumentFileSizeLimit(file: File): boolean {
  return file.size > 0 && file.size <= DOCUMENT_UPLOAD_MAX_SIZE_BYTES;
}

/** "2.4 MB" / "480 KB" — matches the task's own example formatting. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export type DocumentUploadErrorKind = "unsupportedType" | "tooLarge" | "generic";

/**
 * Client-side pre-check before ever calling the API — instant feedback,
 * same rules the server enforces (never a stricter or looser invented
 * rule). The server call below is still the authoritative check; this only
 * saves a round trip for the common case.
 */
export function validateDocumentFileLocally(file: File): "unsupportedType" | "tooLarge" | null {
  if (!isAllowedDocumentFileType(file)) return "unsupportedType";
  if (!isWithinDocumentFileSizeLimit(file)) return "tooLarge";
  return null;
}

/**
 * Maps a failed upload to one of the three localized error categories the
 * task requires — never surfaces the server's raw message/stack trace.
 * StorageService.validate's own message text ("Unsupported ... type" /
 * "... exceeds the maximum allowed size") is matched defensively in case
 * client-side pre-validation was bypassed or the backend allowlist drifts.
 */
export function mapDocumentUploadError(error: unknown): DocumentUploadErrorKind {
  if (error instanceof ApiError && error.statusCode === 400) {
    if (/unsupported/i.test(error.message)) return "unsupportedType";
    if (/exceeds the maximum/i.test(error.message)) return "tooLarge";
  }
  return "generic";
}
