import { getCountry } from "@rentos/shared";
import { defaultLanguage, isSupportedLanguage, type SupportedLanguage } from "@rentos/localization";

/**
 * Resolves the default document language for a tenant when no explicit
 * language was requested — UI language and document language are
 * independent concepts (see PRODUCT_BIBLE.md §28, D-057); this resolver
 * only ever reads business-identity fields, never `i18n.language`/the
 * viewer's UI locale. Priority (see DECISIONS.md D-071):
 *
 *  1. (caller's responsibility) an explicit language for this document
 *  2. (not implemented — no customer-language field exists yet; see D-071)
 *  3. the tenant's company country's default business language
 *  4. `tenant.defaultLanguage` (set at registration, also the existing
 *     document-rendering locale fallback — see variable-resolver.service.ts)
 *  5. the package-wide default language ("en")
 *
 * A country only ever supplies a DEFAULT — never a restriction — the
 * caller (`resolveTemplatePin`) still tries this language first but falls
 * back to its existing safe behavior when no active template exists for
 * it, and the user can always pick an explicit language instead.
 */
export function resolveDefaultDocumentLanguage(tenant: {
  countryCode: string;
  defaultLanguage: string;
}): SupportedLanguage {
  const countryDefault = getCountry(tenant.countryCode)?.defaultLanguage;
  if (countryDefault && isSupportedLanguage(countryDefault)) {
    return countryDefault;
  }
  if (isSupportedLanguage(tenant.defaultLanguage)) {
    return tenant.defaultLanguage;
  }
  return defaultLanguage;
}
