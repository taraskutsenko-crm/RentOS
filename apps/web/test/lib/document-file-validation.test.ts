import { describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api-client";
import {
  DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES,
  DOCUMENT_UPLOAD_MAX_SIZE_BYTES,
  DOCUMENT_UPLOAD_TYPE_LABELS,
  mapDocumentUploadError,
} from "../../src/lib/document-file-validation";

// Client-side file-selection validation itself now lives once, generically,
// in components/shared/file-upload-field.tsx (see its own tests) — this
// file only covers document-attachment-specific constants/error mapping
// that isn't shared with Asset Images/Documents (different MIME/size
// constraints per surface).
describe("document-file-validation", () => {
  it("mirrors the real backend document-attachment allowlist and size limit (PDF, JPEG, PNG, WEBP · 20 MB)", () => {
    expect(DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES).toEqual([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(DOCUMENT_UPLOAD_MAX_SIZE_BYTES).toBe(20 * 1024 * 1024);
    expect(DOCUMENT_UPLOAD_TYPE_LABELS).toEqual(["PDF", "JPG", "PNG", "WEBP"]);
  });

  it("maps a backend 'unsupported type' 400 to unsupportedType, never the raw message", () => {
    const error = new ApiError("Unsupported document type: text/plain. Allowed: ...", 400);
    expect(mapDocumentUploadError(error)).toBe("unsupportedType");
  });

  it("maps a backend 'exceeds the maximum' 400 to tooLarge", () => {
    const error = new ApiError("document exceeds the maximum allowed size of 20 MB", 400);
    expect(mapDocumentUploadError(error)).toBe("tooLarge");
  });

  it("maps any other error (network, 500, unrecognized 400) to generic", () => {
    expect(mapDocumentUploadError(new ApiError("Internal server error", 500))).toBe("generic");
    expect(mapDocumentUploadError(new Error("Failed to fetch"))).toBe("generic");
  });
});
