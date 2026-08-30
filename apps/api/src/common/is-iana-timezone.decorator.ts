import { isValidIanaTimezone } from "@rentos/shared";
import { registerDecorator, type ValidationOptions } from "class-validator";

/** Validates a string is a real, recognized IANA timezone identifier (e.g. "Europe/Warsaw"). */
export function IsIanaTimezone(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: "isIanaTimezone",
      target: object.constructor,
      propertyName: propertyName as string,
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === "string" && isValidIanaTimezone(value);
        },
        defaultMessage(): string {
          return '$property must be a real IANA timezone identifier (e.g. "Europe/Warsaw")';
        },
      },
    });
  };
}
