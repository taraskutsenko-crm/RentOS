import { BadRequestException } from "@nestjs/common";
import type { AssetCustomFieldDefinition } from "@prisma/client";

import type { FieldOption, ValidationRules } from "./field-definition-rules";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+0-9()\-.\s]{3,50}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates and normalizes one raw value against its field definition's
 * `fieldType` and `validationRules`, returning the exact JSON-encodable
 * representation to store in AssetCustomFieldValue.valueJson. Throws
 * BadRequestException with a field-identifying message on any violation.
 */
export function validateFieldValue(
  definition: AssetCustomFieldDefinition,
  rawValue: unknown,
): unknown {
  const rules = (definition.validationRules ?? undefined) as ValidationRules | undefined;
  const label = definition.name;

  switch (definition.fieldType) {
    case "TEXT":
    case "TEXTAREA": {
      const value = expectString(rawValue, label);
      checkStringLength(value, rules, label);
      checkPattern(value, rules, label);
      return value;
    }
    case "URL": {
      const value = expectString(rawValue, label);
      checkStringLength(value, rules, label);
      checkPattern(value, rules, label);
      try {
        new URL(value);
      } catch {
        throw new BadRequestException(`${label} must be a valid URL`);
      }
      return value;
    }
    case "EMAIL": {
      const value = expectString(rawValue, label);
      checkStringLength(value, rules, label);
      if (!EMAIL_PATTERN.test(value)) {
        throw new BadRequestException(`${label} must be a valid email address`);
      }
      return value;
    }
    case "PHONE": {
      const value = expectString(rawValue, label);
      checkStringLength(value, rules, label);
      if (!PHONE_PATTERN.test(value)) {
        throw new BadRequestException(`${label} must be a valid phone number`);
      }
      return value;
    }
    case "INTEGER": {
      const value = expectNumber(rawValue, label);
      if (!Number.isInteger(value)) {
        throw new BadRequestException(`${label} must be an integer`);
      }
      checkNumberRange(value, rules, label);
      return value;
    }
    case "DECIMAL": {
      const value = expectNumber(rawValue, label);
      checkNumberRange(value, rules, label);
      return value;
    }
    case "BOOLEAN": {
      if (typeof rawValue !== "boolean") {
        throw new BadRequestException(`${label} must be true or false`);
      }
      return rawValue;
    }
    case "DATE": {
      const value = expectString(rawValue, label);
      if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
        throw new BadRequestException(`${label} must be a valid date (YYYY-MM-DD)`);
      }
      return value;
    }
    case "DATETIME": {
      const value = expectString(rawValue, label);
      if (Number.isNaN(Date.parse(value))) {
        throw new BadRequestException(`${label} must be a valid ISO date-time`);
      }
      return new Date(value).toISOString();
    }
    case "SELECT": {
      const value = expectString(rawValue, label);
      const options = (definition.options ?? []) as unknown as FieldOption[];
      if (!options.some((option) => option.value === value)) {
        throw new BadRequestException(`${label} must be one of the configured options`);
      }
      return value;
    }
    case "MULTISELECT": {
      if (!Array.isArray(rawValue) || rawValue.some((entry) => typeof entry !== "string")) {
        throw new BadRequestException(`${label} must be an array of strings`);
      }
      const options = (definition.options ?? []) as unknown as FieldOption[];
      const allowed = new Set(options.map((option) => option.value));
      for (const entry of rawValue as string[]) {
        if (!allowed.has(entry)) {
          throw new BadRequestException(
            `${label} contains an option that is not configured: ${entry}`,
          );
        }
      }
      return [...new Set(rawValue as string[])];
    }
    default:
      throw new BadRequestException(`Unsupported field type: ${String(definition.fieldType)}`);
  }
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new BadRequestException(`${label} must be a non-empty string`);
  }
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BadRequestException(`${label} must be a number`);
  }
  return value;
}

function checkStringLength(value: string, rules: ValidationRules | undefined, label: string): void {
  if (rules?.minLength !== undefined && value.length < rules.minLength) {
    throw new BadRequestException(`${label} must be at least ${rules.minLength} characters`);
  }
  if (rules?.maxLength !== undefined && value.length > rules.maxLength) {
    throw new BadRequestException(`${label} must be at most ${rules.maxLength} characters`);
  }
}

function checkPattern(value: string, rules: ValidationRules | undefined, label: string): void {
  if (rules?.pattern && !new RegExp(rules.pattern).test(value)) {
    throw new BadRequestException(`${label} does not match the required format`);
  }
}

function checkNumberRange(value: number, rules: ValidationRules | undefined, label: string): void {
  if (rules?.min !== undefined && value < rules.min) {
    throw new BadRequestException(`${label} must be at least ${rules.min}`);
  }
  if (rules?.max !== undefined && value > rules.max) {
    throw new BadRequestException(`${label} must be at most ${rules.max}`);
  }
}
