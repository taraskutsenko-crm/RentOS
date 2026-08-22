import type { SupportedLanguage } from "@rentos/localization";

/**
 * The literal strings the invoice HTML shell needs, one hand-authored set
 * per language — same "authored per language, English is the fallback,
 * never machine-translated at render time" philosophy as
 * default-templates.ts's DocumentStrings, but standalone: Invoice renders
 * through its own invoice-renderer.service.ts, not the generic Document
 * template pipeline (see docs/DECISIONS.md — Invoice is a first-class
 * business object, not a Document row). The Polish set below uses real
 * Polish invoicing terminology, not a placeholder/transliteration (see
 * task requirement — "FAKTURA", "Numer faktury", ...).
 */
export interface InvoiceStrings {
  title: string;
  proformaTitle: string;
  invoiceNumber: string;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  seller: string;
  buyer: string;
  taxNumberLabel: string;
  registrationNumberLabel: string;
  itemDescription: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  netValue: string;
  taxRateLabel: string;
  taxAmount: string;
  grossValue: string;
  subtotalLabel: string;
  discountLabel: string;
  taxLabel: string;
  totalLabel: string;
  paidLabel: string;
  amountDueLabel: string;
  paymentMethodLabel: string;
  paymentReferenceLabel: string;
  bankAccountNumberLabel: string;
  ibanLabel: string;
  swiftBicLabel: string;
  notesLabel: string;
  generatedWith: string;
}

const EN_STRINGS: InvoiceStrings = {
  title: "INVOICE",
  proformaTitle: "PROFORMA INVOICE",
  invoiceNumber: "Invoice number",
  issueDate: "Issue date",
  saleDate: "Sale date",
  dueDate: "Due date",
  seller: "Seller",
  buyer: "Buyer",
  taxNumberLabel: "Tax ID",
  registrationNumberLabel: "Registration No.",
  itemDescription: "Description",
  quantity: "Qty",
  unit: "Unit",
  unitPrice: "Net unit price",
  netValue: "Net value",
  taxRateLabel: "VAT rate",
  taxAmount: "VAT amount",
  grossValue: "Gross value",
  subtotalLabel: "Subtotal (net)",
  discountLabel: "Discount",
  taxLabel: "VAT",
  totalLabel: "Total",
  paidLabel: "Paid",
  amountDueLabel: "Amount due",
  paymentMethodLabel: "Payment method",
  paymentReferenceLabel: "Payment reference",
  bankAccountNumberLabel: "Account number",
  ibanLabel: "IBAN",
  swiftBicLabel: "SWIFT/BIC",
  notesLabel: "Notes",
  generatedWith: "Generated with Havelio",
};

const PL_STRINGS: InvoiceStrings = {
  title: "FAKTURA",
  proformaTitle: "FAKTURA PROFORMA",
  invoiceNumber: "Numer faktury",
  issueDate: "Data wystawienia",
  saleDate: "Data sprzedaży",
  dueDate: "Termin płatności",
  seller: "Sprzedawca",
  buyer: "Nabywca",
  taxNumberLabel: "NIP",
  registrationNumberLabel: "Nr rejestrowy",
  itemDescription: "Nazwa towaru/usługi",
  quantity: "Ilość",
  unit: "J.m.",
  unitPrice: "Cena netto",
  netValue: "Wartość netto",
  taxRateLabel: "VAT",
  taxAmount: "Kwota VAT",
  grossValue: "Wartość brutto",
  subtotalLabel: "Razem netto",
  discountLabel: "Rabat",
  taxLabel: "VAT",
  totalLabel: "Razem",
  paidLabel: "Zapłacono",
  amountDueLabel: "Do zapłaty",
  paymentMethodLabel: "Forma płatności",
  paymentReferenceLabel: "Tytuł przelewu",
  bankAccountNumberLabel: "Numer rachunku",
  ibanLabel: "IBAN",
  swiftBicLabel: "SWIFT/BIC",
  notesLabel: "Uwagi",
  generatedWith: "Wygenerowano w Havelio",
};

const INVOICE_STRINGS_BY_LANGUAGE: Partial<Record<SupportedLanguage, InvoiceStrings>> = {
  en: EN_STRINGS,
  pl: PL_STRINGS,
};

/**
 * A language with no hand-authored set falls back to English — never a
 * machine translation presented as if it were real (same rule
 * default-templates.ts's getDefaultTemplate follows).
 */
export function getInvoiceStrings(language: string): InvoiceStrings {
  return INVOICE_STRINGS_BY_LANGUAGE[language as SupportedLanguage] ?? EN_STRINGS;
}
