# @rentos/localization

Shared i18n resources for RentOS frontends. Currently covers the
authentication/onboarding UI strings for six languages: English (default),
Russian, Ukrainian, German, Polish, Spanish.

- `src/locales/<lang>/common.json` — translated string dictionaries.
- `src/index.ts` — exports `resources` (an i18next-shaped resource bundle),
  `supportedLanguages`, and `defaultLanguage`.

This package intentionally has no i18next/React dependency itself — it only
ships data. The consuming app (`@rentos/web`) owns the actual i18next/
react-i18next initialization.
