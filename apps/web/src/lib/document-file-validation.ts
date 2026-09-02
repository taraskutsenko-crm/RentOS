import {
  DOCUMENT_ATTACHMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_ATTACHMENT_MAX_SIZE_BYTES,
} from "@rentos/shared";

import { ApiError } from "./api-client";

/** Same allowlist StorageService.validateDocument enforces server-side — see its own doc comment in @rentos/shared. Passed to the shared FileUploadField as `allowedMimeTypes`/`maxSizeBytes`; the component itself does the actual client-side pre-validation generically (see components/shared/file-upload-field.tsx). */
export const DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES = DOCUMENT_ATTACHMENT_ALLOWED_MIME_TYPES;
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

export type DocumentUploadErrorKind = "unsupportedType" | "tooLarge" | "generic";

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
