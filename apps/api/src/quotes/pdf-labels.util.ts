import { isSupportedLanguage, resources, type SupportedLanguage } from "@rentos/localization";

/**
 * Resolves a PDF label from the shared localization resources (quote.pdf.*
 * in packages/localization/src/locales/*\/common.json) for the tenant's
 * defaultLanguage, so the generated document is localization-aware without
 * duplicating translated strings in the backend. Falls back to the English
 * resource, then to the caller-supplied default, so a momentarily missing
 * key (or an unsupported language slipping through) never breaks PDF
 * generation — it just renders in English for that one label.
 */
export function pdfLabel(language: string, path: string, fallback: string): string {
  const lang: SupportedLanguage = isSupportedLanguage(language) ? language : "en";
  return (
    resolvePath(resources[lang].common, path) ?? resolvePath(resources.en.common, path) ?? fallback
  );
}

function resolvePath(root: unknown, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);
  return typeof value === "string" ? value : undefined;
}
