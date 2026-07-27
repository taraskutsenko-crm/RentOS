import { z } from "zod";

/**
 * Error `message` values are i18n key paths (e.g. "auth.errors.required"),
 * not display text — form components translate them via `t(message)`.
 */
const passwordSchema = z
  .string()
  .min(12, "auth.errors.passwordTooShort")
  .regex(/[a-z]/, "auth.errors.passwordLowercase")
  .regex(/[A-Z]/, "auth.errors.passwordUppercase")
  .regex(/[0-9]/, "auth.errors.passwordNumber");

export const registerSchema = z
  .object({
    firstName: z.string().min(1, "auth.errors.required"),
    lastName: z.string().min(1, "auth.errors.required"),
    email: z.string().min(1, "auth.errors.required").email("auth.errors.invalidEmail"),
    password: passwordSchema,
    passwordConfirmation: z.string().min(1, "auth.errors.required"),
    companyName: z.string().min(1, "auth.errors.required"),
    countryCode: z.string().min(1, "auth.errors.required"),
    defaultLanguage: z.string().min(1, "auth.errors.required"),
    defaultCurrency: z.string().min(1, "auth.errors.required"),
    timezone: z.string().min(1, "auth.errors.required"),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "auth.errors.passwordMismatch",
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().min(1, "auth.errors.required").email("auth.errors.invalidEmail"),
  password: z.string().min(1, "auth.errors.required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
