import type { AssetDetailView } from "../../assets/assets.service";

/**
 * Strips purchase-price/replacement-value/internal-number — tenant-internal
 * financial and inventory fields a customer has no reason to see — from the
 * staff AssetDetailView. Everything else (name, category, manufacturer,
 * model, serial number, condition notes, images) is genuinely useful
 * "equipment information" for the portal.
 */
export type PortalAssetView = Omit<
  AssetDetailView,
  | "purchasePriceMinor"
  | "purchaseCurrency"
  | "purchaseDate"
  | "replacementValueMinor"
  | "replacementCurrency"
  | "internalNumber"
  | "createdByUserId"
  | "updatedByUserId"
>;

export function toPortalAssetView(asset: AssetDetailView): PortalAssetView {
  const {
    purchasePriceMinor: _purchasePriceMinor,
    purchaseCurrency: _purchaseCurrency,
    purchaseDate: _purchaseDate,
    replacementValueMinor: _replacementValueMinor,
    replacementCurrency: _replacementCurrency,
    internalNumber: _internalNumber,
    createdByUserId: _createdByUserId,
    updatedByUserId: _updatedByUserId,
    ...rest
  } = asset;
  return rest;
}
