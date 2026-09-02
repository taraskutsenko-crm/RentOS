export const APP_NAME = "Havelio";
export const APP_TAGLINE = "One Platform. Every Asset.";

/**
 * Thrown verbatim by RentalsService.start() when a rental's planned start
 * date/time has already passed — a rental that's already overdue-to-start
 * must be explicitly re-dated by staff, never silently activated. Exported
 * here (not duplicated as a string literal on each side) so the frontend
 * can match it exactly to show a dedicated "cannot activate" dialog with an
 * "Edit dates" action, rather than falling through to a generic error
 * toast — see apps/web/src/app/app/rentals/[id]/page.tsx.
 */
export const RENTAL_START_DATE_PASSED_MESSAGE =
  "Cannot activate a rental whose planned start date/time has already passed.";

/**
 * Mirrors `ALLOWED_DOCUMENT_MIME_TYPES`/`MAX_DOCUMENT_SIZE_BYTES` in
 * apps/api/src/storage/storage.service.ts — that service (StorageService)
 * remains the sole authoritative enforcement point; these are exported here
 * so the Document Attachments upload UI can display the *real* constraints
 * and give instant client-side feedback instead of guessing/inventing its
 * own frontend-only rule (see docs/DECISIONS.md). If the backend allowlist
 * or limit ever changes, update both places together.
 */
export const DOCUMENT_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const DOCUMENT_ATTACHMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Mirrors `ALLOWED_IMAGE_MIME_TYPES`/`MAX_IMAGE_SIZE_BYTES` in
 * apps/api/src/storage/storage.service.ts — the same real constraints
 * `StorageService.validateImage` enforces for Asset Images, the Company
 * Logo, and the Company Signature upload (all three route through
 * `validateImage`). See DOCUMENT_ATTACHMENT_ALLOWED_MIME_TYPES's own doc
 * comment for why this lives here rather than being duplicated per upload
 * surface.
 */
export const IMAGE_UPLOAD_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_UPLOAD_MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
