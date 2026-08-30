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
