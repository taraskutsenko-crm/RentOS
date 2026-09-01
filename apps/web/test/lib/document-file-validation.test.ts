import { describe, expect, it } from "vitest";

import { ApiError } from "../../src/lib/api-client";
import {
  DOCUMENT_UPLOAD_MAX_SIZE_BYTES,
  DOCUMENT_UPLOAD_TYPE_LABELS,
  formatFileSize,
  isAllowedDocumentFileType,
  isWithinDocumentFileSizeLimit,
  mapDocumentUploadError,
  validateDocumentFileLocally,
} from "../../src/lib/document-file-validation";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("document-file-validation", () => {
  it("mirrors the real backend allowlist (PDF, JPEG, PNG, WEBP)", () => {
    expect(DOCUMENT_UPLOAD_TYPE_LABELS).toEqual(["PDF", "JPG", "PNG", "WEBP"]);
  });

  it("accepts every allowed MIME type", () => {
    for (const type of ["application/pdf", "image/jpeg", "image/png", "image/webp"]) {
      expect(isAllowedDocumentFileType(makeFile("f", type, 100))).toBe(true);
    }
  });

  it("rejects an unsupported MIME type", () => {
    expect(isAllowedDocumentFileType(makeFile("f.exe", "application/x-msdownload", 100))).toBe(
      false,
    );
  });

  it("accepts a file within the size limit and rejects one over it", () => {
    expect(isWithinDocumentFileSizeLimit(makeFile("f.pdf", "application/pdf", 1024))).toBe(true);
    expect(
      isWithinDocumentFileSizeLimit(
        makeFile("f.pdf", "application/pdf", DOCUMENT_UPLOAD_MAX_SIZE_BYTES + 1),
      ),
    ).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(isWithinDocumentFileSizeLimit(makeFile("f.pdf", "application/pdf", 0))).toBe(false);
  });

  it("validateDocumentFileLocally returns unsupportedType before tooLarge", () => {
    const hugeUnsupported = makeFile(
      "f.exe",
      "application/x-msdownload",
      DOCUMENT_UPLOAD_MAX_SIZE_BYTES + 1,
    );
    expect(validateDocumentFileLocally(hugeUnsupported)).toBe("unsupportedType");
  });

  it("validateDocumentFileLocally returns tooLarge for an oversized allowed type", () => {
    const huge = makeFile("f.pdf", "application/pdf", DOCUMENT_UPLOAD_MAX_SIZE_BYTES + 1);
    expect(validateDocumentFileLocally(huge)).toBe("tooLarge");
  });

  it("validateDocumentFileLocally returns null for a valid file", () => {
    expect(validateDocumentFileLocally(makeFile("f.pdf", "application/pdf", 2048))).toBeNull();
  });

  it("formats file sizes the way the spec examples show", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2_400_000)).toBe("2.3 MB");
    expect(formatFileSize(480 * 1024)).toBe("480 KB");
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
