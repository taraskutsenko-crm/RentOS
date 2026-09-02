import { IMAGE_UPLOAD_ALLOWED_MIME_TYPES, IMAGE_UPLOAD_MAX_SIZE_BYTES } from "@rentos/shared";

import { ApiError } from "./api-client";
import {
  DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES,
  DOCUMENT_UPLOAD_MAX_SIZE_BYTES,
  type DocumentUploadErrorKind,
} from "./document-file-validation";

/** Same allowlist StorageService.validateImage enforces server-side — see IMAGE_UPLOAD_ALLOWED_MIME_TYPES's own doc comment in @rentos/shared. Used by Asset Images (and Company Logo/Signature, which route through the same backend validator). */
export const ASSET_IMAGE_UPLOAD_ALLOWED_MIME_TYPES = IMAGE_UPLOAD_ALLOWED_MIME_TYPES;
export const ASSET_IMAGE_UPLOAD_MAX_SIZE_BYTES = IMAGE_UPLOAD_MAX_SIZE_BYTES;

/** Asset supporting documents use the same allowlist/limit as Document Attachments (both route through StorageService.validateDocument server-side). */
export const ASSET_DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES = DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES;
export const ASSET_DOCUMENT_UPLOAD_MAX_SIZE_BYTES = DOCUMENT_UPLOAD_MAX_SIZE_BYTES;

const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
};

export const ASSET_IMAGE_UPLOAD_TYPE_LABELS = ASSET_IMAGE_UPLOAD_ALLOWED_MIME_TYPES.map(
  (mime: string) => IMAGE_EXTENSION_BY_MIME_TYPE[mime] ?? mime,
);

/** Maps a failed asset image upload to a safe, localized error category — never the server's raw message. Mirrors mapDocumentUploadError exactly (see its own doc comment); duplicated rather than shared since the two check different message substrings would be a false economy for two lines. */
export function mapAssetImageUploadError(error: unknown): DocumentUploadErrorKind {
  if (error instanceof ApiError && error.statusCode === 400) {
    if (/unsupported/i.test(error.message)) return "unsupportedType";
    if (/exceeds the maximum/i.test(error.message)) return "tooLarge";
  }
  return "generic";
}
