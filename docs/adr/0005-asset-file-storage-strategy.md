# ADR 0005: Asset File-Storage Strategy

**Status:** Accepted
**Date:** 2026-07-28

## Context

Assets need images (for the list/detail gallery) and documents (manuals,
certificates, insurance, etc.). Binary file content must never be stored
in PostgreSQL. The task allowed either direct multipart upload or a
presigned-upload flow, provided the chosen approach is documented, and
asked for an S3-compatible storage interface with at minimum a
local-development adapter if no complete implementation exists.

## Decision

### Direct multipart upload through the API, not a presigned-URL flow

`POST .../assets/:assetId/images` and `.../documents` accept
`multipart/form-data` directly (NestJS's `FileInterceptor` +
`@nestjs/platform-express`, backed by `multer.memoryStorage()` — files are
buffered in memory, never written to the API container's local disk as a
transient step). We chose this over a presigned-URL flow (client requests
a signed PUT URL, uploads directly to the bucket, then calls the API to
register the resulting object) for three reasons specific to this stage of
the project:

1. **No real S3-compatible bucket exists in this environment yet.** A
   presigned-URL flow only pays off once there's a real object store to
   presign against; building the presign machinery ahead of having
   somewhere to point it at (MinIO in Docker Compose, or a cloud bucket)
   would be speculative infrastructure the task's own "do not add
   PostgreSQL extensions [or other infra] without documenting why" spirit
   argues against.
2. **Simpler to test.** The existing test suite pattern (`*.e2e-spec.ts`
   against a real, ephemeral Postgres) has no equivalent for "a real S3
   bucket" in CI. Direct upload keeps image/document tests
   (`assets.e2e-spec.ts` scenarios 22–23) fully self-contained — `supertest`
   can `.attach()` a file straight at the endpoint.
3. **Validation happens server-side either way.** MIME type and size limits
   (`StorageService.validateImage` / `validateDocument`) must be enforced
   by the API regardless of upload mechanism — a presigned flow still needs
   a server-side confirmation step to check what was actually uploaded, so
   it doesn't eliminate server involvement, it just adds a round trip.

This is a deliberate, revisitable choice: the `StorageAdapter` interface
(below) means switching to presigned uploads later only touches the
upload endpoint and `StorageService`, not the schema, permissions, or
audit logging.

### `StorageAdapter`: the only storage interface the rest of the app sees

`apps/api/src/storage/storage.types.ts` defines a three-method interface —
`put`, `read`, `delete` — that is the _only_ thing `AssetFilesService`
depends on (via `StorageService`, injected through the `STORAGE_ADAPTER`
token in `StorageModule`). Nothing outside `apps/api/src/storage/` imports
an SDK or knows how bytes are actually persisted.

`LocalFilesystemStorageAdapter` is the only implementation shipped in this
task: it writes under `STORAGE_LOCAL_DIR` (default `./storage-uploads`,
`/app/storage-uploads` in the Docker image, backed by a named volume in
`docker-compose.yml` so uploads survive container restarts), with
storage keys generated server-side
(`tenants/<tenantId>/assets/<assetId>/{images,documents}/<uuid>-<filename>`)
— a caller-supplied path is never trusted, and the adapter additionally
verifies every resolved path stays within its root as defense in depth
against path traversal.

A production S3-compatible adapter (`S3StorageAdapter` implementing the
same `StorageAdapter` interface against AWS S3, Cloudflare R2, MinIO, or
any S3-compatible endpoint) is the documented next step — swap the
`useClass` binding in `StorageModule`, add the bucket
credentials/endpoint to `ApiEnv`, done. Not built here because there is no
bucket to point it at in this environment yet, and building an untestable
adapter would violate "do not claim a check passed unless it was actually
run."

### MIME type and size limits are enforced by allow-list, not blocklist

`StorageService` hardcodes the allowed image types (`image/jpeg`,
`image/png`, `image/webp` — exactly the task's initial format list) and a
broader but still explicit document allow-list (`application/pdf` plus the
same three image types, covering scanned documents), each with its own
max size (8 MB images, 20 MB documents). Anything else is rejected with a
400 before the adapter is ever called — content type comes from the
multipart part's declared `Content-Type`, matching how every other upload
library in this space validates (full content-sniffing/magic-byte
verification is a reasonable future hardening step, not implemented here).

### Reading files: a protected, tenant-scoped streaming endpoint

The task's endpoint list covers upload/update/delete but not "view" — yet a
gallery is useless without a way to actually fetch bytes back. We added
`GET .../images/:imageId/file` and `.../documents/:documentId/file`
(`assets.read` permission, same `TenantGuard` + `PermissionsGuard` chain as
every other asset route) that resolve the `AssetImage`/`AssetDocument` row
tenant-scoped, then stream via `StorageService.read`. This keeps file
_viewing_ under the same tenant-isolation and permission enforcement as
every other read in the module, rather than exposing a raw, guessable, or
world-readable URL — "protect all upload and delete operations with tenant
authorization" is extended here to reads too, which is strictly safer and
was a small addition once the guard chain already existed.

### Deletion: soft-delete row + best-effort storage cleanup

`AssetFilesService.removeImage` / `removeDocument` first soft-delete the
metadata row (`deletedAt`), then call `StorageService.delete` on the
underlying object. The metadata row's soft-delete is the durable, audited
fact ("this image was removed, by whom, when" — see the
`asset_image.deleted` / `asset_document.deleted` audit actions); the
storage-layer delete is best-effort cleanup of the bytes themselves.
`LocalFilesystemStorageAdapter.delete` uses `rm(..., { force: true })`, so
a missing file is not an error.

### Primary image: enforced twice

Only one non-deleted image per asset may have `isPrimary = true`.
`AssetFilesService.uploadImage`/`updateImage` enforce this transactionally
(unset any existing primary before setting a new one), and the migration
additionally adds a partial unique index —
`CREATE UNIQUE INDEX ... ON asset_images(assetId) WHERE isPrimary = true
AND deletedAt IS NULL` — as defense in depth, so the invariant holds even
against a bug or a concurrent write that bypasses the service layer.

## Consequences

- Local/dev/test file uploads are not encrypted at rest and live on
  whatever disk backs `STORAGE_LOCAL_DIR` — acceptable for this stage;
  production deployment must use a real S3-compatible adapter with the
  provider's own encryption-at-rest.
- There is no CDN/cache layer in front of file reads yet; every image
  request round-trips through the API and re-reads the file from disk (or,
  eventually, from the bucket). Fine at current scale; a follow-up could
  front this with signed CDN URLs once a real object store exists.
- Multipart uploads are memory-buffered per request (no disk spooling),
  bounded by the per-endpoint size limits above — acceptable at the
  current file-size ceiling but would need revisiting (streaming to disk
  or direct-to-bucket) if much larger files are ever supported.
