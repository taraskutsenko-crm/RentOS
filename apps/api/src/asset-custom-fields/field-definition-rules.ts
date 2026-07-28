import { BadRequestException } from "@nestjs/common";
import type { AssetFieldType } from "@prisma/client";

/**
 * Declarative-only bounds for a custom field's values — never executable
 * code (see AssetCustomFieldDefinition.validationRules in the schema). Every
 * key here is interpreted by field-value-validator.ts; nothing is ever
 * eval'd or passed to a regex/template engine beyond a single, precompiled
 * `RegExp(pattern)` check.
 */
export interface ValidationRules {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface FieldOption {
  value: string;
  label: string;
}

const NUMERIC_TYPES: AssetFieldType[] = ["INTEGER", "DECIMAL"];
const STRING_TYPES: AssetFieldType[] = ["TEXT", "TEXTAREA", "URL", "EMAIL", "PHONE"];
const CHOICE_TYPES: AssetFieldType[] = ["SELECT", "MULTISELECT"];

/** Validates the *shape* of validationRules against the field's type — not any particular value. */
export function assertValidationRulesShape(
  fieldType: AssetFieldType,
  rules: unknown,
): asserts rules is ValidationRules | undefined {
  if (rules === undefined || rules === null) {
    return;
  }
  if (typeof rules !== "object" || Array.isArray(rules)) {
    throw new BadRequestException("validationRules must be a JSON object");
  }

  const allowedKeys = new Set(
    NUMERIC_TYPES.includes(fieldType)
      ? ["min", "max"]
      : STRING_TYPES.includes(fieldType)
        ? ["minLength", "maxLength", "pattern"]
        : [],
  );

  const record = rules as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new BadRequestException(
        `validationRules.${key} is not applicable to field type ${fieldType}`,
      );
    }
  }

  if ("min" in record && typeof record.min !== "number") {
    throw new BadRequestException("validationRules.min must be a number");
  }
  if ("max" in record && typeof record.max !== "number") {
    throw new BadRequestException("validationRules.max must be a number");
  }
  if (
    "min" in record &&
    "max" in record &&
    typeof record.min === "number" &&
    typeof record.max === "number" &&
    record.min > record.max
  ) {
    throw new BadRequestException("validationRules.min cannot be greater than max");
  }
  if ("minLength" in record && (typeof record.minLength !== "number" || record.minLength < 0)) {
    throw new BadRequestException("validationRules.minLength must be a non-negative number");
  }
  if ("maxLength" in record && (typeof record.maxLength !== "number" || record.maxLength < 0)) {
    throw new BadRequestException("validationRules.maxLength must be a non-negative number");
  }
  if ("pattern" in record) {
    if (typeof record.pattern !== "string") {
      throw new BadRequestException("validationRules.pattern must be a string");
    }
    try {
      RegExp(record.pattern);
    } catch {
      throw new BadRequestException("validationRules.pattern is not a valid regular expression");
    }
  }
}

/** Validates the *shape* of options — required, non-empty, unique values for SELECT/MULTISELECT. */
export function assertOptionsShape(
  fieldType: AssetFieldType,
  options: unknown,
): asserts options is FieldOption[] | undefined {
  if (!CHOICE_TYPES.includes(fieldType)) {
    if (options !== undefined && options !== null) {
      throw new BadRequestException(`options is only applicable to SELECT/MULTISELECT fields`);
    }
    return;
  }

  if (!Array.isArray(options) || options.length === 0) {
    throw new BadRequestException(`${fieldType} fields require a non-empty options array`);
  }

  const seen = new Set<string>();
  for (const option of options) {
    if (
      typeof option !== "object" ||
      option === null ||
      typeof (option as FieldOption).value !== "string" ||
      typeof (option as FieldOption).label !== "string" ||
      (option as FieldOption).value.trim() === ""
    ) {
      throw new BadRequestException(
        "Each option must be an object of { value: string, label: string }",
      );
    }
    if (seen.has((option as FieldOption).value)) {
      throw new BadRequestException(`Duplicate option value: ${(option as FieldOption).value}`);
    }
    seen.add((option as FieldOption).value);
  }
}
