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

export const customerSchema = z.object({
  firstName: z.string().min(1, "auth.errors.required").max(100),
  lastName: z.string().min(1, "auth.errors.required").max(100),
  company: z.string().max(200),
  phone: z.string().max(50),
  email: z.union([z.literal(""), z.string().max(255).email("auth.errors.invalidEmail")]),
  vatNumber: z.string().max(50),
  address: z.string().max(500),
  notes: z.string().max(2000),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;

export const assetSchema = z.object({
  name: z.string().min(1, "auth.errors.required").max(200),
  internalNumber: z.string().min(1, "auth.errors.required").max(100),
  categoryId: z.string().min(1, "asset.errors.categoryRequired"),
  statusId: z.string(),
  sku: z.string().max(100),
  serialNumber: z.string().max(100),
  barcode: z.string().max(100),
  qrCodeValue: z.string().max(200),
  manufacturer: z.string().max(150),
  model: z.string().max(150),
  description: z.string().max(2000),
  purchaseDate: z.string(),
  purchasePriceDisplay: z.string(),
  purchaseCurrency: z.string(),
  replacementValueDisplay: z.string(),
  replacementCurrency: z.string(),
  conditionNotes: z.string().max(2000),
  isRentable: z.boolean(),
  isActive: z.boolean(),
  customFields: z.record(z.string(), z.unknown()),
});

export type AssetFormValues = z.infer<typeof assetSchema>;

export const assetCategorySchema = z.object({
  name: z.string().min(1, "auth.errors.required").max(150),
  description: z.string().max(1000),
  code: z.string().max(50),
  parentId: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});

export type AssetCategoryFormValues = z.infer<typeof assetCategorySchema>;

export const assetStatusSchema = z.object({
  name: z.string().min(1, "auth.errors.required").max(100),
  code: z
    .string()
    .min(1, "auth.errors.required")
    .regex(/^[A-Z][A-Z0-9_]{0,49}$/, "asset.errors.statusCodeFormat"),
  description: z.string().max(500),
  colorToken: z.string().max(50),
  icon: z.string().max(50),
  isAvailableForRental: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});

export type AssetStatusFormValues = z.infer<typeof assetStatusSchema>;

export const assetCustomFieldOptionSchema = z.object({
  value: z.string().min(1, "auth.errors.required"),
  label: z.string().min(1, "auth.errors.required"),
});

export const assetCustomFieldSchema = z.object({
  name: z.string().min(1, "auth.errors.required").max(150),
  key: z
    .string()
    .min(1, "auth.errors.required")
    .regex(/^[a-z][a-z0-9_]{0,49}$/, "asset.errors.fieldKeyFormat"),
  description: z.string().max(500),
  categoryId: z.string(),
  fieldType: z.enum([
    "TEXT",
    "TEXTAREA",
    "INTEGER",
    "DECIMAL",
    "BOOLEAN",
    "DATE",
    "DATETIME",
    "SELECT",
    "MULTISELECT",
    "URL",
    "EMAIL",
    "PHONE",
  ]),
  isRequired: z.boolean(),
  isActive: z.boolean(),
  isFilterable: z.boolean(),
  isSearchable: z.boolean(),
  sortOrder: z.number().int().min(0),
  options: z.array(assetCustomFieldOptionSchema),
});

export type AssetCustomFieldFormValues = z.infer<typeof assetCustomFieldSchema>;

export const rentalItemFormSchema = z.object({
  assetId: z.string().min(1, "rental.errors.assetRequired"),
  billingMode: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]),
  quantity: z.number().int().min(1),
  dailyPriceDisplay: z.string(),
  weeklyPriceDisplay: z.string(),
  monthlyPriceDisplay: z.string(),
  customPriceDisplay: z.string(),
  depositDisplay: z.string(),
  discountDisplay: z.string(),
  notes: z.string().max(2000),
});

export const rentalBillingSettingsSchema = z
  .object({
    monthlyBillingStrategy: z.enum(["CALENDAR_MONTH", "FIXED_30_DAYS", "CUSTOM"]),
    customMonthLengthDays: z.string(),
  })
  .refine(
    (data) => {
      if (data.monthlyBillingStrategy !== "CUSTOM") return true;
      const value = Number(data.customMonthLengthDays);
      return Number.isInteger(value) && value >= 1 && value <= 365;
    },
    {
      path: ["customMonthLengthDays"],
      message: "rental.errors.customMonthLengthRequired",
    },
  );

export type RentalBillingSettingsFormValues = z.infer<typeof rentalBillingSettingsSchema>;

export type RentalItemFormValues = z.infer<typeof rentalItemFormSchema>;

export const rentalSchema = z
  .object({
    customerId: z.string().min(1, "rental.errors.customerRequired"),
    plannedStart: z.string().min(1, "rental.errors.datesRequired"),
    plannedEnd: z.string().min(1, "rental.errors.datesRequired"),
    currency: z.string().min(1, "auth.errors.required"),
    discountDisplay: z.string(),
    taxDisplay: z.string(),
    notes: z.string().max(2000),
    internalNotes: z.string().max(2000),
  })
  .refine((data) => new Date(data.plannedEnd) > new Date(data.plannedStart), {
    path: ["plannedEnd"],
    message: "rental.errors.endBeforeStart",
  });

export type RentalFormValues = z.infer<typeof rentalSchema>;

export const quoteItemFormSchema = z.object({
  itemType: z.enum([
    "ASSET",
    "SERVICE",
    "PRODUCT",
    "FEE",
    "DELIVERY",
    "COLLECTION",
    "LABOR",
    "CUSTOM",
  ]),
  assetId: z.string(),
  name: z.string().min(1, "quote.errors.itemNameRequired"),
  description: z.string(),
  quantity: z.number().int().min(1, "quote.errors.quantityMustBePositive"),
  unit: z.string(),
  billingMode: z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM", "FLAT"]),
  unitPriceDisplay: z.string(),
  dailyPriceDisplay: z.string(),
  weeklyPriceDisplay: z.string(),
  monthlyPriceDisplay: z.string(),
  customPriceDisplay: z.string(),
  discountType: z.enum(["PERCENTAGE", "FIXED"]).nullable(),
  discountValueDisplay: z.string(),
  taxRateDisplay: z.string(),
  depositDisplay: z.string(),
  notes: z.string().max(2000),
});

export type QuoteItemFormValues = z.infer<typeof quoteItemFormSchema>;

export const quoteSchema = z
  .object({
    customerId: z.string().min(1, "quote.errors.customerRequired"),
    validUntil: z.string().min(1, "quote.errors.validUntilRequired"),
    plannedStart: z.string().min(1, "quote.errors.datesRequired"),
    plannedEnd: z.string().min(1, "quote.errors.datesRequired"),
    currency: z.string().min(1, "auth.errors.required"),
    discountType: z.enum(["PERCENTAGE", "FIXED"]).nullable(),
    discountValueDisplay: z.string(),
    customerNotes: z.string().max(2000),
    internalNotes: z.string().max(2000),
    termsAndConditions: z.string().max(10000),
  })
  .refine((data) => new Date(data.plannedEnd) > new Date(data.plannedStart), {
    path: ["plannedEnd"],
    message: "quote.errors.endBeforeStart",
  })
  .refine((data) => !data.validUntil || new Date(data.validUntil) >= new Date(), {
    path: ["validUntil"],
    message: "quote.errors.validUntilBeforeIssueDate",
  });

export type QuoteFormValues = z.infer<typeof quoteSchema>;

export const documentSchema = z
  .object({
    documentType: z.enum([
      "QUOTE",
      "CONTRACT",
      "HANDOVER_PROTOCOL",
      "RETURN_PROTOCOL",
      "DAMAGE_REPORT",
      "CONTRACT_AMENDMENT",
      "CUSTOM",
    ]),
    customTypeName: z.string().max(100),
    title: z.string().max(200),
    customerId: z.string(),
    assetId: z.string(),
  })
  .refine((data) => data.documentType !== "CUSTOM" || data.customTypeName.trim().length > 0, {
    path: ["customTypeName"],
    message: "document.errors.customTypeNameRequired",
  });

export type DocumentFormValues = z.infer<typeof documentSchema>;
