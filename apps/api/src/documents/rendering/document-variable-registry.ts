/**
 * The single source of truth for "which dot-paths does
 * VariableResolverService.buildContext actually populate" — every path here
 * must correspond to a real field that resolver sets (see
 * variable-resolver.service.ts), and every field the resolver sets must be
 * listed here. Kept in sync with the frontend mirror
 * (apps/web/src/lib/document-variable-registry.ts) by
 * scripts/check-document-variable-parity.mjs, mirroring the existing
 * dual-registry convention already used for permissions (permission.ts /
 * permissions.ts + scripts/check-permission-sync.mjs — see
 * docs/ARCHITECTURE_LOCK.md 1.10).
 *
 * Deliberately excludes two open-ended paths that have no fixed member
 * list: `asset.customFields.*` (tenant-defined custom field keys) and
 * `data.*` (the raw businessDataSnapshot escape hatch) — both are
 * documented in variable-resolver.service.ts's own doc comment instead.
 */
export const DOCUMENT_VARIABLE_PATHS = [
  "company.name",
  "company.logo",
  "company.logoHtml",
  "company.email",
  "company.registrationNumber",
  "company.taxNumber",
  "company.address",
  "company.phone",
  "company.bank.label",
  "company.bank.bankName",
  "company.bank.accountHolder",
  "company.bank.accountNumber",
  "company.bank.iban",
  "company.bank.swiftBic",
  "company.bank.currency",
  "company.bank.bankAddress",
  "company.bank.paymentReference",
  "customer.name",
  "customer.firstName",
  "customer.lastName",
  "customer.company",
  "customer.address",
  "customer.phone",
  "customer.email",
  "customer.taxNumber",
  "employee.name",
  "employee.position",
  "asset.name",
  "asset.serial",
  "asset.location",
  "asset.category",
  "rental.number",
  "rental.start",
  "rental.end",
  "rental.startTime",
  "rental.endTime",
  "rental.startDateTime",
  "rental.endDateTime",
  "rental.subtotal",
  "rental.discount",
  "rental.tax",
  "rental.total",
  "rental.deposit",
  "rental.amountDue",
  "rental.assetsTableHtml",
  "quote.number",
  "quote.issueDate",
  "quote.validUntil",
  "quote.total",
  "quote.terms",
  "quote.servicesTableHtml",
  "deposit.requiredAmount",
  "deposit.receivedAt",
  "deposit.receivedAmount",
  "deposit.receivedMethod",
  "deposit.receivedReference",
  "deposit.returnedAt",
  "deposit.returnedAmount",
  "deposit.retainedAmount",
  "deposit.retentionReason",
  "deposit.notes",
  "today",
  "signature.company",
  "signature.employee",
  "signature.companySignatureImageHtml",
  "signature.companySignerName",
  "signature.companySignerTitle",
  "signature.companySignedAt",
  "signature.companySignedAtLabel",
  "signature.customerSignatureImageHtml",
  "signature.customerSignerName",
  "signature.customerSignedAt",
  "signature.customerSignedAtLabel",
  "notes",
  "document.number",
  "document.title",
  "document.type",
  "document.status",
] as const;

export type DocumentVariablePath = (typeof DOCUMENT_VARIABLE_PATHS)[number];
