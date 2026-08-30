import { isISO8601, registerDecorator, type ValidationOptions } from "class-validator";

/**
 * Requires an ISO 8601 date-time string that unambiguously identifies a
 * real instant — i.e. carries a "Z" or an explicit "+HH:MM"/"-HH:MM" offset
 * (`2026-08-31T16:50:00.000Z` or `2026-08-31T18:50:00+02:00`), never a bare
 * offset-less local reading like `2026-08-31T18:50`.
 *
 * A bare local string is inherently ambiguous — the very bug this decorator
 * exists to close at the API boundary (see docs/DECISIONS.md D-115):
 * different environments (browser, API host, DB) can each interpret
 * `2026-08-31T18:50` as a different real moment. Every DTO field backing a
 * `Rental`/`Quote`/`AssetAvailabilityBlock`/`RentalDeposit` instant column
 * must convert a tenant-local wall-clock reading to a real instant with
 * `tenantLocalToUtc` (`@rentos/shared`) *before* it reaches the API — this
 * decorator is the server-side backstop that rejects a client (including a
 * direct API call bypassing the frontend entirely) that skips that step,
 * rather than silently guessing which timezone was intended.
 */
export function IsUnambiguousInstant(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: "isUnambiguousInstant",
      target: object.constructor,
      propertyName: propertyName as string,
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== "string" || !isISO8601(value)) {
            return false;
          }
          return /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
        },
        defaultMessage(): string {
          return (
            '$property must be an unambiguous ISO 8601 instant with a "Z" or explicit offset ' +
            '(e.g. "2026-08-31T16:50:00.000Z"), not a bare local date-time'
          );
        },
      },
    });
  };
}
