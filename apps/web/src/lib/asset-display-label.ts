/**
 * The single canonical "how do we show one Asset in a picker/selector"
 * label — every asset selector in the app (document form, rental wizard,
 * quote wizard, global search) must use this instead of reimplementing
 * its own inline `${asset.name} (...)` string, so a company with several
 * identically-named assets (e.g. two "Skoda Fabia") can always tell them
 * apart (see docs/DECISIONS.md, asset selector identifiers fix).
 *
 * `internalNumber` is a required field on every Asset (see
 * `apps/api/src/assets/dto/create-asset.dto.ts`), so it is always
 * available and is the standing identifier shown — never guessed from
 * `description`, which is free text with no structural meaning.
 */
export function getAssetDisplayLabel(asset: { name: string; internalNumber: string }): string {
  return `${asset.name} — ${asset.internalNumber}`;
}
