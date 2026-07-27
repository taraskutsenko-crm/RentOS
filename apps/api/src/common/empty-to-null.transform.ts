import { Transform } from "class-transformer";

/**
 * Treats an empty string as an explicit null so a following @IsOptional()
 * validator correctly skips the field, and so Prisma's `update`/`updateMany`
 * actually clears the column instead of leaving the old value in place.
 *
 * (Prisma's `update` treats an `undefined`-valued key in `data` as "don't
 * touch this field" — a genuinely different meaning from `null`, which
 * sets the column to NULL. HTML/React forms always submit "" for an
 * untouched or cleared optional text input, never omit the key entirely,
 * so "" must map to `null` — not `undefined` — to correctly persist a
 * user clearing a field via PATCH.)
 */
export function EmptyToNull(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => (value === "" ? null : value));
}
