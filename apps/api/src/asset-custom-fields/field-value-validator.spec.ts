import { BadRequestException } from "@nestjs/common";
import type { AssetCustomFieldDefinition } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { validateFieldValue } from "./field-value-validator";

function buildDefinition(
  overrides: Partial<AssetCustomFieldDefinition> = {},
): AssetCustomFieldDefinition {
  return {
    id: "field-1",
    tenantId: "tenant-1",
    categoryId: null,
    name: "Test Field",
    key: "test_field",
    description: null,
    fieldType: "TEXT",
    isRequired: false,
    isActive: true,
    isFilterable: false,
    isSearchable: false,
    sortOrder: 0,
    validationRules: null,
    options: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as AssetCustomFieldDefinition;
}

describe("validateFieldValue", () => {
  it("accepts a valid TEXT value", () => {
    const definition = buildDefinition({ fieldType: "TEXT" });
    expect(validateFieldValue(definition, "hello")).toBe("hello");
  });

  it("rejects a non-string TEXT value", () => {
    const definition = buildDefinition({ fieldType: "TEXT" });
    expect(() => validateFieldValue(definition, 123)).toThrow(BadRequestException);
  });

  it("enforces minLength/maxLength on TEXT", () => {
    const definition = buildDefinition({
      fieldType: "TEXT",
      validationRules: { minLength: 3, maxLength: 5 },
    });
    expect(() => validateFieldValue(definition, "ab")).toThrow(BadRequestException);
    expect(() => validateFieldValue(definition, "abcdef")).toThrow(BadRequestException);
    expect(validateFieldValue(definition, "abcd")).toBe("abcd");
  });

  it("enforces a pattern on TEXT", () => {
    const definition = buildDefinition({
      fieldType: "TEXT",
      validationRules: { pattern: "^[A-Z]{3}$" },
    });
    expect(validateFieldValue(definition, "ABC")).toBe("ABC");
    expect(() => validateFieldValue(definition, "abc")).toThrow(BadRequestException);
  });

  it("accepts a valid INTEGER and rejects a non-integer", () => {
    const definition = buildDefinition({ fieldType: "INTEGER" });
    expect(validateFieldValue(definition, 42)).toBe(42);
    expect(() => validateFieldValue(definition, 4.2)).toThrow(BadRequestException);
    expect(() => validateFieldValue(definition, "42")).toThrow(BadRequestException);
  });

  it("enforces min/max on INTEGER and DECIMAL", () => {
    const definition = buildDefinition({
      fieldType: "DECIMAL",
      validationRules: { min: 0, max: 10 },
    });
    expect(validateFieldValue(definition, 5.5)).toBe(5.5);
    expect(() => validateFieldValue(definition, -1)).toThrow(BadRequestException);
    expect(() => validateFieldValue(definition, 11)).toThrow(BadRequestException);
  });

  it("accepts BOOLEAN true/false only", () => {
    const definition = buildDefinition({ fieldType: "BOOLEAN" });
    expect(validateFieldValue(definition, true)).toBe(true);
    expect(validateFieldValue(definition, false)).toBe(false);
    expect(() => validateFieldValue(definition, "true")).toThrow(BadRequestException);
  });

  it("validates DATE format strictly (YYYY-MM-DD)", () => {
    const definition = buildDefinition({ fieldType: "DATE" });
    expect(validateFieldValue(definition, "2026-01-15")).toBe("2026-01-15");
    expect(() => validateFieldValue(definition, "01/15/2026")).toThrow(BadRequestException);
    expect(() => validateFieldValue(definition, "not-a-date")).toThrow(BadRequestException);
  });

  it("normalizes DATETIME to an ISO string", () => {
    const definition = buildDefinition({ fieldType: "DATETIME" });
    const result = validateFieldValue(definition, "2026-01-15T10:00:00Z");
    expect(result).toBe(new Date("2026-01-15T10:00:00Z").toISOString());
  });

  it("validates EMAIL format", () => {
    const definition = buildDefinition({ fieldType: "EMAIL" });
    expect(validateFieldValue(definition, "a@b.com")).toBe("a@b.com");
    expect(() => validateFieldValue(definition, "not-an-email")).toThrow(BadRequestException);
  });

  it("validates URL format", () => {
    const definition = buildDefinition({ fieldType: "URL" });
    expect(validateFieldValue(definition, "https://example.com")).toBe("https://example.com");
    expect(() => validateFieldValue(definition, "not a url")).toThrow(BadRequestException);
  });

  it("validates PHONE format", () => {
    const definition = buildDefinition({ fieldType: "PHONE" });
    expect(validateFieldValue(definition, "+1 (555) 123-4567")).toBe("+1 (555) 123-4567");
    expect(() => validateFieldValue(definition, "abc")).toThrow(BadRequestException);
  });

  it("validates SELECT against configured options", () => {
    const definition = buildDefinition({
      fieldType: "SELECT",
      options: [
        { value: "diesel", label: "Diesel" },
        { value: "petrol", label: "Petrol" },
      ],
    });
    expect(validateFieldValue(definition, "diesel")).toBe("diesel");
    expect(() => validateFieldValue(definition, "electric")).toThrow(BadRequestException);
  });

  it("validates MULTISELECT against configured options and dedupes", () => {
    const definition = buildDefinition({
      fieldType: "MULTISELECT",
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    expect(validateFieldValue(definition, ["a", "b", "a"])).toEqual(["a", "b"]);
    expect(() => validateFieldValue(definition, ["a", "c"])).toThrow(BadRequestException);
    expect(() => validateFieldValue(definition, "a")).toThrow(BadRequestException);
  });
});
