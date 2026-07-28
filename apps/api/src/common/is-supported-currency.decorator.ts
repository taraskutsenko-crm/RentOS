import { isSupportedCurrencyCode } from "@rentos/shared";
import { registerDecorator, type ValidationOptions } from "class-validator";

/** Validates an ISO 4217 currency code against the platform's supported list. */
export function IsSupportedCurrency(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: "isSupportedCurrency",
      target: object.constructor,
      propertyName: propertyName as string,
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === "string" && isSupportedCurrencyCode(value);
        },
        defaultMessage(): string {
          return "$property must be a supported ISO 4217 currency code";
        },
      },
    });
  };
}
