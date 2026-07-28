import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { assertOptionsShape, assertValidationRulesShape } from "./field-definition-rules";

describe("assertValidationRulesShape", () => {
  it("allows undefined rules", () => {
    expect(() => assertValidationRulesShape("TEXT", undefined)).not.toThrow();
  });

  it("rejects a non-object", () => {
    expect(() => assertValidationRulesShape("TEXT", "nope")).toThrow(BadRequestException);
  });

  it("rejects keys not applicable to the field type", () => {
    expect(() => assertValidationRulesShape("INTEGER", { maxLength: 10 })).toThrow(
      BadRequestException,
    );
    expect(() => assertValidationRulesShape("TEXT", { min: 1 })).toThrow(BadRequestException);
  });

  it("rejects min greater than max", () => {
    expect(() => assertValidationRulesShape("INTEGER", { min: 10, max: 5 })).toThrow(
      BadRequestException,
    );
  });

  it("rejects an invalid regular expression pattern", () => {
    expect(() => assertValidationRulesShape("TEXT", { pattern: "(unclosed" })).toThrow(
      BadRequestException,
    );
  });

  it("accepts valid numeric rules", () => {
    expect(() => assertValidationRulesShape("DECIMAL", { min: 0, max: 100 })).not.toThrow();
  });

  it("accepts valid string rules", () => {
    expect(() =>
      assertValidationRulesShape("TEXT", { minLength: 1, maxLength: 50, pattern: "^[A-Z]+$" }),
    ).not.toThrow();
  });

  it("never executes the pattern as code — it is only ever used with RegExp.test", () => {
    // A pattern is just a regex string; it is compiled and tested, never eval'd.
    expect(() => assertValidationRulesShape("TEXT", { pattern: "console.log(1)" })).not.toThrow();
  });
});

describe("assertOptionsShape", () => {
  it("requires a non-empty options array for SELECT", () => {
    expect(() => assertOptionsShape("SELECT", undefined)).toThrow(BadRequestException);
    expect(() => assertOptionsShape("SELECT", [])).toThrow(BadRequestException);
  });

  it("requires a non-empty options array for MULTISELECT", () => {
    expect(() => assertOptionsShape("MULTISELECT", undefined)).toThrow(BadRequestException);
  });

  it("rejects options for a non-choice field type", () => {
    expect(() => assertOptionsShape("TEXT", [{ value: "a", label: "A" }])).toThrow(
      BadRequestException,
    );
  });

  it("rejects duplicate option values", () => {
    expect(() =>
      assertOptionsShape("SELECT", [
        { value: "a", label: "A" },
        { value: "a", label: "A dup" },
      ]),
    ).toThrow(BadRequestException);
  });

  it("rejects malformed option entries", () => {
    expect(() => assertOptionsShape("SELECT", [{ value: "a" }])).toThrow(BadRequestException);
    expect(() => assertOptionsShape("SELECT", ["a"])).toThrow(BadRequestException);
  });

  it("accepts a well-formed options array", () => {
    expect(() =>
      assertOptionsShape("SELECT", [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ]),
    ).not.toThrow();
  });
});
