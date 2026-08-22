import type { TFunction } from "i18next";

import type { AssetStatusDefinition } from "../types/asset";

/**
 * The eight codes AssetStatusesService seeds for every tenant (see
 * apps/api/src/asset-statuses/system-statuses.ts) — the only codes with a
 * translation in `asset.statuses.*`. Kept in sync manually (not imported
 * across the API/web boundary, same pattern as other frontend enum mirrors
 * in this codebase, e.g. RentalStatus/QuoteStatus).
 */
const SYSTEM_STATUS_CODES = new Set([
  "AVAILABLE",
  "RESERVED",
  "RENTED",
  "INSPECTION_REQUIRED",
  "MAINTENANCE",
  "REPAIR",
  "LOST",
  "RETIRED",
]);

/**
 * The single source of an Asset Status's display label. `AssetStatusDefinition.name`
 * is stored per-tenant, editable text (see D-078) — never a fixed backend
 * enum — so it cannot be blanket-translated. Only the eight built-in system
 * statuses (`isSystem: true`, one of `SYSTEM_STATUS_CODES`) get a localized
 * label, keyed by their immutable `code` (system codes can never be
 * renamed, unlike `name`); every custom, tenant-created status keeps
 * rendering its own stored `name` exactly as entered, since there is no way
 * to translate arbitrary user-authored text. The stored `name` column
 * itself is never modified by this — display only.
 */
export function getAssetStatusLabel(
  t: TFunction,
  status: Pick<AssetStatusDefinition, "code" | "name" | "isSystem">,
): string {
  if (status.isSystem && SYSTEM_STATUS_CODES.has(status.code)) {
    return t(`asset.statuses.${status.code}`);
  }
  return status.name;
}
