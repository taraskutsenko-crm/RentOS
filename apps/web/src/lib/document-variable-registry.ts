/**
 * Mirrors apps/api/src/documents/rendering/document-variable-registry.ts —
 * every path here must resolve to a real value in
 * VariableResolverService.buildContext, kept in sync by
 * scripts/check-document-variable-parity.mjs (same dual-registry
 * convention as lib/permissions.ts / permission.ts).
 *
 * This is the richer, UI-facing half: each path is grouped and carries an
 * i18n label key so the no-code template builder's "Insert field" picker
 * (see components/documents/template-builder/) can show a human-readable
 * chip like "Rental start" instead of the raw `{{rental.start}}` syntax a
 * normal Havelio user should never have to see or type.
 */

export type DocumentVariableGroup =
  | "company"
  | "customer"
  | "employee"
  | "asset"
  | "rental"
  | "quote"
  | "deposit"
  | "document"
  | "signature"
  | "other";

export interface DocumentVariableMeta {
  /** The exact `{{path}}` the resolver substitutes — never shown to the user directly. */
  path: string;
  group: DocumentVariableGroup;
  /** i18n key under the `documentVariable.*` namespace, e.g. "documentVariable.company.name". */
  labelKey: string;
  /** Pre-built, already-escaped-per-cell HTML — inserted as a block, not an inline chip. */
  isRawHtml?: boolean;
}

export const DOCUMENT_VARIABLES: DocumentVariableMeta[] = [
  { path: "company.name", group: "company", labelKey: "documentVariable.company.name" },
  { path: "company.logo", group: "company", labelKey: "documentVariable.company.logo" },
  {
    path: "company.logoHtml",
    group: "company",
    labelKey: "documentVariable.company.logoHtml",
    isRawHtml: true,
  },
  { path: "company.email", group: "company", labelKey: "documentVariable.company.email" },
  {
    path: "company.registrationNumber",
    group: "company",
    labelKey: "documentVariable.company.registrationNumber",
  },
  { path: "company.taxNumber", group: "company", labelKey: "documentVariable.company.taxNumber" },
  { path: "company.address", group: "company", labelKey: "documentVariable.company.address" },
  { path: "company.phone", group: "company", labelKey: "documentVariable.company.phone" },
  { path: "company.bank.label", group: "company", labelKey: "documentVariable.company.bank.label" },
  {
    path: "company.bank.bankName",
    group: "company",
    labelKey: "documentVariable.company.bank.bankName",
  },
  {
    path: "company.bank.accountHolder",
    group: "company",
    labelKey: "documentVariable.company.bank.accountHolder",
  },
  {
    path: "company.bank.accountNumber",
    group: "company",
    labelKey: "documentVariable.company.bank.accountNumber",
  },
  { path: "company.bank.iban", group: "company", labelKey: "documentVariable.company.bank.iban" },
  {
    path: "company.bank.swiftBic",
    group: "company",
    labelKey: "documentVariable.company.bank.swiftBic",
  },
  {
    path: "company.bank.currency",
    group: "company",
    labelKey: "documentVariable.company.bank.currency",
  },
  {
    path: "company.bank.bankAddress",
    group: "company",
    labelKey: "documentVariable.company.bank.bankAddress",
  },
  {
    path: "company.bank.paymentReference",
    group: "company",
    labelKey: "documentVariable.company.bank.paymentReference",
  },

  { path: "customer.name", group: "customer", labelKey: "documentVariable.customer.name" },
  {
    path: "customer.firstName",
    group: "customer",
    labelKey: "documentVariable.customer.firstName",
  },
  { path: "customer.lastName", group: "customer", labelKey: "documentVariable.customer.lastName" },
  { path: "customer.company", group: "customer", labelKey: "documentVariable.customer.company" },
  { path: "customer.address", group: "customer", labelKey: "documentVariable.customer.address" },
  { path: "customer.phone", group: "customer", labelKey: "documentVariable.customer.phone" },
  { path: "customer.email", group: "customer", labelKey: "documentVariable.customer.email" },
  {
    path: "customer.taxNumber",
    group: "customer",
    labelKey: "documentVariable.customer.taxNumber",
  },

  { path: "employee.name", group: "employee", labelKey: "documentVariable.employee.name" },
  {
    path: "employee.position",
    group: "employee",
    labelKey: "documentVariable.employee.position",
  },

  { path: "asset.name", group: "asset", labelKey: "documentVariable.asset.name" },
  { path: "asset.serial", group: "asset", labelKey: "documentVariable.asset.serial" },
  { path: "asset.location", group: "asset", labelKey: "documentVariable.asset.location" },
  { path: "asset.category", group: "asset", labelKey: "documentVariable.asset.category" },

  { path: "rental.number", group: "rental", labelKey: "documentVariable.rental.number" },
  { path: "rental.start", group: "rental", labelKey: "documentVariable.rental.start" },
  { path: "rental.end", group: "rental", labelKey: "documentVariable.rental.end" },
  { path: "rental.startTime", group: "rental", labelKey: "documentVariable.rental.startTime" },
  { path: "rental.endTime", group: "rental", labelKey: "documentVariable.rental.endTime" },
  {
    path: "rental.startDateTime",
    group: "rental",
    labelKey: "documentVariable.rental.startDateTime",
  },
  {
    path: "rental.endDateTime",
    group: "rental",
    labelKey: "documentVariable.rental.endDateTime",
  },
  { path: "rental.subtotal", group: "rental", labelKey: "documentVariable.rental.subtotal" },
  { path: "rental.discount", group: "rental", labelKey: "documentVariable.rental.discount" },
  { path: "rental.tax", group: "rental", labelKey: "documentVariable.rental.tax" },
  { path: "rental.total", group: "rental", labelKey: "documentVariable.rental.total" },
  { path: "rental.deposit", group: "rental", labelKey: "documentVariable.rental.deposit" },
  { path: "rental.amountDue", group: "rental", labelKey: "documentVariable.rental.amountDue" },
  {
    path: "rental.assetsTableHtml",
    group: "rental",
    labelKey: "documentVariable.rental.assetsTableHtml",
    isRawHtml: true,
  },

  { path: "quote.number", group: "quote", labelKey: "documentVariable.quote.number" },
  { path: "quote.issueDate", group: "quote", labelKey: "documentVariable.quote.issueDate" },
  { path: "quote.validUntil", group: "quote", labelKey: "documentVariable.quote.validUntil" },
  { path: "quote.total", group: "quote", labelKey: "documentVariable.quote.total" },
  { path: "quote.terms", group: "quote", labelKey: "documentVariable.quote.terms" },
  {
    path: "quote.servicesTableHtml",
    group: "quote",
    labelKey: "documentVariable.quote.servicesTableHtml",
    isRawHtml: true,
  },

  {
    path: "deposit.requiredAmount",
    group: "deposit",
    labelKey: "documentVariable.deposit.requiredAmount",
  },
  {
    path: "deposit.receivedAt",
    group: "deposit",
    labelKey: "documentVariable.deposit.receivedAt",
  },
  {
    path: "deposit.receivedAmount",
    group: "deposit",
    labelKey: "documentVariable.deposit.receivedAmount",
  },
  {
    path: "deposit.receivedMethod",
    group: "deposit",
    labelKey: "documentVariable.deposit.receivedMethod",
  },
  {
    path: "deposit.receivedReference",
    group: "deposit",
    labelKey: "documentVariable.deposit.receivedReference",
  },
  {
    path: "deposit.returnedAt",
    group: "deposit",
    labelKey: "documentVariable.deposit.returnedAt",
  },
  {
    path: "deposit.returnedAmount",
    group: "deposit",
    labelKey: "documentVariable.deposit.returnedAmount",
  },
  {
    path: "deposit.retainedAmount",
    group: "deposit",
    labelKey: "documentVariable.deposit.retainedAmount",
  },
  {
    path: "deposit.retentionReason",
    group: "deposit",
    labelKey: "documentVariable.deposit.retentionReason",
  },
  { path: "deposit.notes", group: "deposit", labelKey: "documentVariable.deposit.notes" },

  { path: "today", group: "other", labelKey: "documentVariable.other.today" },
  { path: "signature.company", group: "signature", labelKey: "documentVariable.signature.company" },
  {
    path: "signature.employee",
    group: "signature",
    labelKey: "documentVariable.signature.employee",
  },
  {
    path: "signature.companySignatureImageHtml",
    group: "signature",
    labelKey: "documentVariable.signature.companySignatureImageHtml",
    isRawHtml: true,
  },
  {
    path: "signature.companySignerName",
    group: "signature",
    labelKey: "documentVariable.signature.companySignerName",
  },
  {
    path: "signature.companySignerTitle",
    group: "signature",
    labelKey: "documentVariable.signature.companySignerTitle",
  },
  {
    path: "signature.companySignedAt",
    group: "signature",
    labelKey: "documentVariable.signature.companySignedAt",
  },
  {
    path: "signature.companySignedAtLabel",
    group: "signature",
    labelKey: "documentVariable.signature.companySignedAtLabel",
  },
  {
    path: "signature.customerSignatureImageHtml",
    group: "signature",
    labelKey: "documentVariable.signature.customerSignatureImageHtml",
    isRawHtml: true,
  },
  {
    path: "signature.customerSignerName",
    group: "signature",
    labelKey: "documentVariable.signature.customerSignerName",
  },
  {
    path: "signature.customerSignedAt",
    group: "signature",
    labelKey: "documentVariable.signature.customerSignedAt",
  },
  {
    path: "signature.customerSignedAtLabel",
    group: "signature",
    labelKey: "documentVariable.signature.customerSignedAtLabel",
  },
  { path: "notes", group: "other", labelKey: "documentVariable.other.notes" },

  { path: "document.number", group: "document", labelKey: "documentVariable.document.number" },
  { path: "document.title", group: "document", labelKey: "documentVariable.document.title" },
  { path: "document.type", group: "document", labelKey: "documentVariable.document.type" },
  { path: "document.status", group: "document", labelKey: "documentVariable.document.status" },
];

export const DOCUMENT_VARIABLE_PATHS = DOCUMENT_VARIABLES.map((v) => v.path);

export const DOCUMENT_VARIABLE_GROUP_LABEL_KEYS: Record<DocumentVariableGroup, string> = {
  company: "documentVariable.group.company",
  customer: "documentVariable.group.customer",
  employee: "documentVariable.group.employee",
  asset: "documentVariable.group.asset",
  rental: "documentVariable.group.rental",
  quote: "documentVariable.group.quote",
  deposit: "documentVariable.group.deposit",
  document: "documentVariable.group.document",
  signature: "documentVariable.group.signature",
  other: "documentVariable.group.other",
};

export function groupDocumentVariables(): Array<{
  group: DocumentVariableGroup;
  variables: DocumentVariableMeta[];
}> {
  const order: DocumentVariableGroup[] = [
    "company",
    "customer",
    "employee",
    "asset",
    "rental",
    "quote",
    "deposit",
    "document",
    "signature",
    "other",
  ];
  return order
    .map((group) => ({
      group,
      variables: DOCUMENT_VARIABLES.filter((v) => v.group === group),
    }))
    .filter((entry) => entry.variables.length > 0);
}
