# @rentos/shared

RentOS shared types, utilities, and constants, consumed across `@rentos/web`
and `@rentos/api`.

- `src/env.ts` — zod schemas + `parseEnv()` for validating process env
  (API and web variable contracts).
- `src/countries.ts` — minimal country configuration (US, PL, DE, UA, ES,
  GB): ISO code, i18n display-name key, default currency/language, common
  time zones.
- `src/constants.ts` — app-wide constants (`APP_NAME`, `APP_TAGLINE`).
