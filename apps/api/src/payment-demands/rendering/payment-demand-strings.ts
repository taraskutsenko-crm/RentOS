/**
 * Havelio International Payment Demand Foundation (docs/PRODUCT_BIBLE.md).
 * The PDF wording is selected by the tenant's COUNTRY at generation time
 * (`PaymentDemand.countryCode`, frozen — see the model's own schema doc
 * comment), never by document language alone: a real Polish "Wezwanie do
 * zapłaty" is always written in Polish, exactly like a real one would be,
 * regardless of what language the rest of the tenant's UI happens to use.
 * Every country NOT given its own entry here falls back to
 * `GENERIC_STRINGS_BY_LANGUAGE` (English/Russian, selected by
 * `documentLanguage`, itself falling back to English) — a safe, honest
 * "Payment Demand" that makes no jurisdiction-specific legal claim (see
 * this file's own doc comment on payment-demand-renderer.service.ts and
 * docs/DECISIONS.md — "do not make legal claims for countries where rules
 * have not been implemented").
 */
export interface PaymentDemandStrings {
  title: string;
  demandNumberLabel: string;
  issueDateLabel: string;
  creditorLabel: string;
  debtorLabel: string;
  invoiceReferenceLabel: string;
  originalAmountLabel: string;
  paidLabel: string;
  outstandingLabel: string;
  originalDueDateLabel: string;
  requestedDeadlineLabel: string;
  bankDetailsLabel: string;
  taxNumberLabel: string;
  registrationNumberLabel: string;
  ibanLabel: string;
  swiftBicLabel: string;
  introParagraph: string;
  closingParagraph: string;
  generatedWith: string;
}

/** Poland — the first localized country template (Phase 20). Professional Polish debt-collection wording; deliberately no statutory-interest calculation and no claim of automatic court action (see docs/DECISIONS.md). */
export const PL_STRINGS: PaymentDemandStrings = {
  title: "WEZWANIE DO ZAPŁATY",
  demandNumberLabel: "Numer wezwania",
  issueDateLabel: "Data wystawienia",
  creditorLabel: "Wierzyciel",
  debtorLabel: "Dłużnik",
  invoiceReferenceLabel: "Dotyczy faktury",
  originalAmountLabel: "Kwota pierwotna",
  paidLabel: "Kwota zapłacona",
  outstandingLabel: "Kwota pozostała do zapłaty",
  originalDueDateLabel: "Pierwotny termin płatności",
  requestedDeadlineLabel: "Nowy termin płatności",
  bankDetailsLabel: "Dane do przelewu",
  taxNumberLabel: "NIP",
  registrationNumberLabel: "Nr rejestrowy",
  ibanLabel: "IBAN",
  swiftBicLabel: "SWIFT/BIC",
  introParagraph:
    "Niniejszym wzywamy Państwa do zapłaty zaległej kwoty wskazanej poniżej w nieprzekraczalnym terminie podanym w niniejszym wezwaniu.",
  closingParagraph:
    "W przypadku, gdy płatność została już dokonana, prosimy o pominięcie niniejszego wezwania.",
  generatedWith: "Wygenerowano w Havelio",
};

const EN_STRINGS: PaymentDemandStrings = {
  title: "Payment Demand",
  demandNumberLabel: "Demand number",
  issueDateLabel: "Issue date",
  creditorLabel: "Creditor",
  debtorLabel: "Debtor",
  invoiceReferenceLabel: "Relating to invoice",
  originalAmountLabel: "Original amount",
  paidLabel: "Amount paid",
  outstandingLabel: "Outstanding amount",
  originalDueDateLabel: "Original due date",
  requestedDeadlineLabel: "Requested payment deadline",
  bankDetailsLabel: "Bank details",
  taxNumberLabel: "Tax ID",
  registrationNumberLabel: "Registration No.",
  ibanLabel: "IBAN",
  swiftBicLabel: "SWIFT/BIC",
  introParagraph:
    "This is a formal request for payment of the outstanding amount shown below by the deadline stated in this notice.",
  closingParagraph: "If payment has already been made, please disregard this notice.",
  generatedWith: "Generated with Havelio",
};

const RU_STRINGS: PaymentDemandStrings = {
  title: "Требование об оплате",
  demandNumberLabel: "Номер требования",
  issueDateLabel: "Дата составления",
  creditorLabel: "Кредитор",
  debtorLabel: "Должник",
  invoiceReferenceLabel: "По счёту",
  originalAmountLabel: "Первоначальная сумма",
  paidLabel: "Оплачено",
  outstandingLabel: "Задолженность",
  originalDueDateLabel: "Первоначальный срок оплаты",
  requestedDeadlineLabel: "Новый срок оплаты",
  bankDetailsLabel: "Банковские реквизиты",
  taxNumberLabel: "Налоговый номер",
  registrationNumberLabel: "Регистрационный номер",
  ibanLabel: "IBAN",
  swiftBicLabel: "SWIFT/BIC",
  introParagraph:
    "Настоящим уведомляем о необходимости погашения указанной ниже задолженности в срок, указанный в данном требовании.",
  closingParagraph: "Если оплата уже произведена, пожалуйста, не принимайте это уведомление во внимание.",
  generatedWith: "Сформировано в Havelio",
};

const GENERIC_STRINGS_BY_LANGUAGE: Record<string, PaymentDemandStrings> = {
  en: EN_STRINGS,
  ru: RU_STRINGS,
};

/** Countries with their own dedicated wording — everything else uses the generic international template (see this file's top doc comment). */
const COUNTRY_STRINGS: Record<string, PaymentDemandStrings> = {
  PL: PL_STRINGS,
};

export function getPaymentDemandStrings(
  countryCode: string,
  documentLanguage: string,
): PaymentDemandStrings {
  const countrySpecific = COUNTRY_STRINGS[countryCode];
  if (countrySpecific) return countrySpecific;
  return GENERIC_STRINGS_BY_LANGUAGE[documentLanguage] ?? EN_STRINGS;
}

/** Whether `countryCode` has its own dedicated template (vs. falling back to the generic international one) — exposed for tests/introspection, never used to gate eligibility. */
export function hasCountrySpecificTemplate(countryCode: string): boolean {
  return countryCode in COUNTRY_STRINGS;
}
