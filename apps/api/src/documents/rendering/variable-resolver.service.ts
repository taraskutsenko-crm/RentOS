import { Injectable } from "@nestjs/common";
import type { DocumentSignatureEvidence, DocumentType } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import type { DocumentDetailView, DocumentVersionWithFiles } from "../document.types";
import { resolveDefaultDocumentLanguage } from "./document-language-resolver.util";

/**
 * The resolved variable context for one render — a plain nested object.
 * Deliberately untyped beyond this shallow shape: the render engine walks
 * arbitrary dot-paths into it (see resolveVariables below), so adding a new
 * variable anywhere in the codebase is just adding a field to whichever
 * source object builds this context, never a change to the resolver or the
 * template syntax itself — see docs/adr/0011-document-rendering-and-sharing.md.
 */
export type RenderContext = Record<string, unknown>;

const CURRENCY_FALLBACK = "USD";

/**
 * Builds the variable context for one Document render — company/customer/
 * employee/asset/rental/quote/today/signature/notes, per the placeholder
 * list in TASK-0008 Part 2. Every path resolves to an empty string rather
 * than throwing when the underlying data doesn't exist (e.g. `company.logo`
 * — Tenant has no logo field yet; `employee.*` when no employeeUserId is
 * set) — a template referencing a not-yet-populated variable degrades
 * gracefully instead of failing the whole render.
 */
@Injectable()
export class VariableResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async buildContext(
    tenantId: string,
    document: DocumentDetailView,
    version: DocumentVersionWithFiles,
  ): Promise<RenderContext> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        name: true,
        countryCode: true,
        defaultLanguage: true,
        defaultCurrency: true,
        timezone: true,
        registrationNumber: true,
        taxNumber: true,
        address: true,
        phone: true,
        email: true,
        logoStorageKey: true,
        logoMimeType: true,
      },
    });

    const employeeUser = document.employeeUserId
      ? await this.prisma.user.findUnique({
          where: { id: document.employeeUserId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null;
    const employeeMembership = document.employeeUserId
      ? await this.prisma.tenantMembership.findFirst({
          where: { tenantId, userId: document.employeeUserId },
          select: { role: true },
        })
      : null;

    const createdByUser = await this.prisma.user.findUnique({
      where: { id: document.createdByUserId },
      select: { firstName: true, lastName: true },
    });

    const assetCustomFields = document.asset
      ? await this.resolveAssetCustomFields(tenantId, document.asset.id)
      : {};

    const defaultBankAccount = await this.prisma.companyBankAccount.findFirst({
      where: { tenantId, deletedAt: null, isActive: true, isDefault: true },
    });

    const language = resolveDefaultDocumentLanguage(tenant);
    const timezone = tenant.timezone;
    const employeeName = employeeUser
      ? fullName(employeeUser.firstName, employeeUser.lastName)
      : createdByUser
        ? fullName(createdByUser.firstName, createdByUser.lastName)
        : "";

    const businessData = (version.businessDataSnapshot as Record<string, unknown>) ?? {};

    const rentalDepositMinor = document.rental
      ? await this.resolveRentalDepositMinor(tenantId, document.rental.id)
      : 0;
    const rentalDepositRecord = document.rental
      ? await this.prisma.rentalDeposit.findUnique({ where: { rentalId: document.rental.id } })
      : null;
    const assetsTableHtml = document.rental
      ? await this.buildAssetsTableHtml(
          tenantId,
          document.rental.id,
          document.rental.currency,
          language,
        )
      : "";
    const servicesTableHtml = document.quote
      ? await this.buildServicesTableHtml(
          tenantId,
          document.quote.id,
          document.quote.currency,
          language,
        )
      : "";

    // Havelio Signature System (visual handwritten signatures — see
    // docs/PRODUCT_BIBLE.md, never a qualified electronic signature): each
    // DocumentSignatureEvidence row is itself the immutable snapshot, so
    // rendering simply reads whatever rows exist right now for this
    // document — no separate "freeze into businessDataSnapshot" step is
    // needed. Unsigned documents (no rows yet) render an empty signature
    // image/timestamp exactly as before this feature existed.
    const signatureEvidence = await this.prisma.documentSignatureEvidence.findMany({
      where: { tenantId, documentId: document.id },
      orderBy: { createdAt: "asc" },
    });
    const companySignature = signatureEvidence.filter(
      (row) => row.signerType === "TENANT_REPRESENTATIVE",
    );
    const customerSignature = signatureEvidence.filter((row) => row.signerType === "CUSTOMER");
    const latestCompanySignature = companySignature[companySignature.length - 1];
    const latestCustomerSignature = customerSignature[customerSignature.length - 1];
    const signedLabel = signedAtLabel(language);
    const tenantLogo = await this.loadTenantLogo(tenant);

    return {
      company: {
        name: tenant.name,
        // No plain-text "logo URL" is ever exposed (never a raw R2 path) —
        // this stays "" always; templates use company.logoHtml instead.
        logo: "",
        // Pre-built raw HTML (see RAW_HTML_VARIABLES below) — renders a
        // real <img> only when the tenant has actually uploaded a company
        // logo (Havelio Company Branding, docs/PRODUCT_BIBLE.md), so a
        // tenant with no logo never emits a broken-image icon in a
        // generated document. Templates should use this instead of
        // hand-wrapping {{company.logo}} in their own <img> tag.
        logoHtml: buildLogoHtml(tenantLogo, tenant.name),
        email: tenant.email ?? "",
        registrationNumber: tenant.registrationNumber ?? "",
        taxNumber: tenant.taxNumber ?? "",
        address: tenant.address ?? "",
        phone: tenant.phone ?? "",
        bank: defaultBankAccount
          ? {
              label: defaultBankAccount.label,
              bankName: defaultBankAccount.bankName ?? "",
              accountHolder: defaultBankAccount.accountHolder ?? "",
              accountNumber: defaultBankAccount.accountNumber ?? "",
              iban: defaultBankAccount.iban ?? "",
              swiftBic: defaultBankAccount.swiftBic ?? "",
              currency: defaultBankAccount.currency,
              bankAddress: defaultBankAccount.bankAddress ?? "",
              paymentReference: defaultBankAccount.paymentReference ?? "",
            }
          : {},
      },
      customer: document.customer
        ? {
            name: fullName(document.customer.firstName, document.customer.lastName),
            firstName: document.customer.firstName,
            lastName: document.customer.lastName,
            company: document.customer.company ?? "",
            address: document.customer.address ?? "",
            phone: document.customer.phone ?? "",
            email: document.customer.email ?? "",
            taxNumber: document.customer.vatNumber ?? "",
          }
        : {},
      employee: {
        name: employeeName,
        // No job-title field on User — the tenant membership role is the
        // closest existing proxy.
        position: employeeMembership?.role ?? "",
      },
      asset: document.asset
        ? {
            name: document.asset.name,
            serial: document.asset.serialNumber ?? "",
            location: document.asset.currentLocationText ?? "",
            category: document.asset.category?.name ?? "",
            customFields: assetCustomFields,
          }
        : {},
      // Rental.plannedStart/plannedEnd are real UTC instants (see
      // docs/DECISIONS.md D-115, superseding D-066's "floating naive"
      // model) — format with the tenant's real IANA zone, same as every
      // other genuine instant (`today` below).
      rental: document.rental
        ? {
            number: document.rental.rentalNumber,
            start: formatDate(document.rental.plannedStart, language, timezone),
            end: formatDate(document.rental.plannedEnd, language, timezone),
            startTime: formatTime(document.rental.plannedStart, language, timezone),
            endTime: formatTime(document.rental.plannedEnd, language, timezone),
            startDateTime: formatDateTime(document.rental.plannedStart, language, timezone),
            endDateTime: formatDateTime(document.rental.plannedEnd, language, timezone),
            subtotal: formatMoney(
              document.rental.subtotalMinor,
              document.rental.currency ?? CURRENCY_FALLBACK,
              language,
            ),
            discount: formatMoney(
              document.rental.discountMinor,
              document.rental.currency ?? CURRENCY_FALLBACK,
              language,
            ),
            tax: formatMoney(
              document.rental.taxMinor,
              document.rental.currency ?? CURRENCY_FALLBACK,
              language,
            ),
            total: formatMoney(
              document.rental.totalMinor,
              document.rental.currency ?? CURRENCY_FALLBACK,
              language,
            ),
            deposit: formatMoney(
              rentalDepositMinor,
              document.rental.currency ?? CURRENCY_FALLBACK,
              language,
            ),
            // Explicit "amount due at start" = rental total + refundable
            // deposit -- a refundable deposit is never rental revenue (see
            // DECISIONS.md D-097/D-098), so this is kept as its own
            // variable rather than redefining rental.total.
            amountDue: formatMoney(
              document.rental.totalMinor + rentalDepositMinor,
              document.rental.currency ?? CURRENCY_FALLBACK,
              language,
            ),
            assetsTableHtml,
          }
        : {},
      quote: document.quote
        ? {
            number: document.quote.quoteNumber,
            // issueDate is a genuine server-generated instant (`new Date()`
            // at creation — never a user-entered wall-clock value), so it
            // uses the tenant's real timezone like validUntil does now.
            issueDate: formatDate(document.quote.issueDate, language, timezone),
            validUntil: formatDate(document.quote.validUntil, language, timezone),
            total: formatMoney(
              document.quote.totalMinor,
              document.quote.currency ?? CURRENCY_FALLBACK,
              language,
            ),
            terms: document.quote.termsAndConditions ?? "",
            servicesTableHtml,
          }
        : {},
      // The RentalDeposit accounting ledger — distinct from rental.deposit
      // above (the flat *required* amount quoted from RentalItem.depositMinor).
      // This namespace reflects what actually happened to the money: only
      // populated once staff records receipt (see RentalDepositsService).
      // Backs the DEPOSIT_RECEIPT document type.
      deposit: rentalDepositRecord
        ? {
            requiredAmount: formatMoney(
              rentalDepositRecord.requiredAmountMinor,
              rentalDepositRecord.currency,
              language,
            ),
            receivedAt: rentalDepositRecord.receivedAt
              ? formatDate(rentalDepositRecord.receivedAt, language, timezone)
              : "",
            receivedAmount:
              rentalDepositRecord.receivedAmountMinor !== null
                ? formatMoney(
                    rentalDepositRecord.receivedAmountMinor,
                    rentalDepositRecord.currency,
                    language,
                  )
                : "",
            receivedMethod: rentalDepositRecord.receivedMethod
              ? paymentMethodLabel(rentalDepositRecord.receivedMethod, language)
              : "",
            receivedReference: rentalDepositRecord.receivedReference ?? "",
            returnedAt: rentalDepositRecord.returnedAt
              ? formatDate(rentalDepositRecord.returnedAt, language, timezone)
              : "",
            returnedAmount:
              rentalDepositRecord.returnedAmountMinor !== null
                ? formatMoney(
                    rentalDepositRecord.returnedAmountMinor,
                    rentalDepositRecord.currency,
                    language,
                  )
                : "",
            retainedAmount:
              rentalDepositRecord.retainedAmountMinor !== null
                ? formatMoney(
                    rentalDepositRecord.retainedAmountMinor,
                    rentalDepositRecord.currency,
                    language,
                  )
                : "",
            retentionReason: rentalDepositRecord.retentionReason ?? "",
            notes: rentalDepositRecord.notes ?? "",
          }
        : {},
      today: formatDate(new Date(), language, timezone),
      signature: {
        // Unchanged since before the Havelio Signature System existed —
        // any tenant-authored template still using these two plain-text
        // variables keeps working exactly as before.
        company: tenant.name,
        employee: employeeName,
        companySignatureImageHtml: latestCompanySignature
          ? await this.buildSignatureImageHtml(latestCompanySignature)
          : "",
        companySignerName: latestCompanySignature?.signerName ?? "",
        companySignerTitle: latestCompanySignature?.signerTitle ?? "",
        companySignedAt: latestCompanySignature
          ? formatDateTime(latestCompanySignature.capturedAt, language, timezone)
          : "",
        companySignedAtLabel: latestCompanySignature ? signedLabel : "",
        customerSignatureImageHtml: latestCustomerSignature
          ? await this.buildSignatureImageHtml(latestCustomerSignature)
          : "",
        customerSignerName: latestCustomerSignature?.signerName ?? "",
        customerSignedAt: latestCustomerSignature
          ? formatDateTime(latestCustomerSignature.capturedAt, language, timezone)
          : "",
        customerSignedAtLabel: latestCustomerSignature ? signedLabel : "",
      },
      notes: typeof businessData.notes === "string" ? businessData.notes : "",
      document: {
        number: document.documentNumber,
        title: document.title ?? "",
        type: document.documentType,
        status: document.status,
      },
      // The full business-data snapshot, namespaced under `data.*` — the
      // open-ended escape hatch for anything not covered by a named
      // variable above (see ADR 0011).
      data: businessData,
    };
  }

  /**
   * The variable context for previewing an *unsaved* draft template — no
   * Document exists yet, so there's nothing real to load for customer/
   * employee/asset/rental/quote. Company data comes from the real tenant
   * (a preview should look like this tenant's actual letterhead); every
   * other field is clearly-labeled sample data covering every registered
   * path (see document-variable-registry.ts) so a template author sees
   * every variable resolve to *something* before saving. Reuses the same
   * `resolveVariables` substitution engine as a real render — only the
   * context differs (see DocumentRendererService#renderPreviewHtml).
   */
  async buildPreviewContext(tenantId: string, documentType: DocumentType): Promise<RenderContext> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        name: true,
        countryCode: true,
        defaultLanguage: true,
        defaultCurrency: true,
        timezone: true,
        registrationNumber: true,
        taxNumber: true,
        address: true,
        phone: true,
        email: true,
        logoStorageKey: true,
        logoMimeType: true,
      },
    });

    const language = resolveDefaultDocumentLanguage(tenant);
    const timezone = tenant.timezone;
    const currency = tenant.defaultCurrency ?? CURRENCY_FALLBACK;
    const labels = tableLabels(language);
    const now = new Date();
    const later = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const employeeName = "Sample Employee";
    const defaultBankAccount = await this.prisma.companyBankAccount.findFirst({
      where: { tenantId, deletedAt: null, isActive: true, isDefault: true },
    });
    // A preview shows this tenant's actual current letterhead — no
    // immutability concern applies here since nothing is ever persisted
    // from a preview render (see DocumentRendererService's own comment).
    const tenantLogo = await this.loadTenantLogo(tenant);

    return {
      company: {
        name: tenant.name,
        logo: "",
        logoHtml: buildLogoHtml(tenantLogo, tenant.name),
        email: tenant.email ?? "",
        registrationNumber: tenant.registrationNumber ?? "",
        taxNumber: tenant.taxNumber ?? "",
        address: tenant.address ?? "",
        phone: tenant.phone ?? "",
        bank: defaultBankAccount
          ? {
              label: defaultBankAccount.label,
              bankName: defaultBankAccount.bankName ?? "",
              accountHolder: defaultBankAccount.accountHolder ?? "",
              accountNumber: defaultBankAccount.accountNumber ?? "",
              iban: defaultBankAccount.iban ?? "",
              swiftBic: defaultBankAccount.swiftBic ?? "",
              currency: defaultBankAccount.currency,
              bankAddress: defaultBankAccount.bankAddress ?? "",
              paymentReference: defaultBankAccount.paymentReference ?? "",
            }
          : {
              label: "Sample Account",
              bankName: "Sample Bank",
              accountHolder: tenant.name,
              accountNumber: "00 0000 0000 0000 0000 0000 0000",
              iban: "PL00 0000 0000 0000 0000 0000 0000",
              swiftBic: "SAMPLEXX",
              currency,
              bankAddress: "1 Sample Street, Sample City",
              paymentReference: "Sample payment reference",
            },
      },
      customer: {
        name: "Sample Customer",
        firstName: "Sample",
        lastName: "Customer",
        company: "Sample Customer Co.",
        address: "123 Sample Street, Sample City",
        phone: "+1 555 0100",
        email: "customer@example.com",
        taxNumber: "SAMPLE-TAX-001",
      },
      employee: {
        name: employeeName,
        position: "Staff",
      },
      asset: {
        name: "Sample Asset",
        serial: "SN-000001",
        location: "Main Warehouse",
        category: "Sample Category",
        customFields: {},
      },
      rental: {
        number: "R-000001",
        start: formatDate(now, language, timezone),
        end: formatDate(later, language, timezone),
        startTime: formatTime(now, language, timezone),
        endTime: formatTime(later, language, timezone),
        startDateTime: formatDateTime(now, language, timezone),
        endDateTime: formatDateTime(later, language, timezone),
        subtotal: formatMoney(46000, currency, language),
        discount: formatMoney(0, currency, language),
        tax: formatMoney(4000, currency, language),
        total: formatMoney(50000, currency, language),
        deposit: formatMoney(10000, currency, language),
        amountDue: formatMoney(60000, currency, language),
        assetsTableHtml: sampleTableHtml(labels.asset, labels.quantity, labels.unitPrice, [
          ["Sample Asset A", "1", `${formatMoney(15000, currency, language)} / ${labels.day}`],
          ["Sample Asset B", "2", `${formatMoney(5000, currency, language)} / ${labels.day}`],
        ]),
      },
      quote: {
        number: "Q-000001",
        issueDate: formatDate(now, language, timezone),
        validUntil: formatDate(later, language, timezone),
        total: formatMoney(50000, currency, language),
        terms: "Sample terms and conditions for preview purposes.",
        servicesTableHtml: sampleTableHtml(labels.service, labels.quantity, labels.total, [
          ["Sample Delivery Service", "1", formatMoney(5000, currency, language)],
        ]),
      },
      // Sample data covers the full receive-then-return lifecycle so every
      // deposit.* path resolves to something in a template preview, even
      // though a real document's deposit only has return fields populated
      // once staff actually records a return (see buildContext above).
      deposit: {
        requiredAmount: formatMoney(10000, currency, language),
        receivedAt: formatDate(now, language, timezone),
        receivedAmount: formatMoney(10000, currency, language),
        receivedMethod: paymentMethodLabel("BANK_TRANSFER", language),
        receivedReference: "SAMPLE-REF-001",
        returnedAt: formatDate(later, language, timezone),
        returnedAmount: formatMoney(8000, currency, language),
        retainedAmount: formatMoney(2000, currency, language),
        retentionReason: "Sample retention reason for preview purposes.",
        notes: "Sample deposit notes for preview purposes.",
      },
      today: formatDate(now, language, timezone),
      signature: {
        company: tenant.name,
        employee: employeeName,
        // A template preview has no real signed document behind it, so
        // the signature image/timestamp fields stay empty — matching what
        // an actual not-yet-signed document renders (see buildContext).
        companySignatureImageHtml: "",
        companySignerName: "",
        companySignerTitle: "",
        companySignedAt: "",
        companySignedAtLabel: "",
        customerSignatureImageHtml: "",
        customerSignerName: "",
        customerSignedAt: "",
        customerSignedAtLabel: "",
      },
      notes: "Sample notes for preview purposes.",
      document: {
        number: "DOC-000001",
        title: "Sample Document",
        type: documentType,
        status: "DRAFT",
      },
      data: {},
    };
  }

  private async resolveAssetCustomFields(
    tenantId: string,
    assetId: string,
  ): Promise<Record<string, unknown>> {
    const values = await this.prisma.assetCustomFieldValue.findMany({
      where: { tenantId, assetId },
      include: { fieldDefinition: true },
    });
    const result: Record<string, unknown> = {};
    for (const value of values) {
      result[value.fieldDefinition.key] = value.valueJson;
    }
    return result;
  }

  /** A display-only sum of already-stored per-item deposits, in minor units — never a pricing recalculation. */
  private async resolveRentalDepositMinor(tenantId: string, rentalId: string): Promise<number> {
    const result = await this.prisma.rentalItem.aggregate({
      where: { tenantId, rentalId },
      _sum: { depositMinor: true },
    });
    return result._sum.depositMinor ?? 0;
  }

  /**
   * Solves "a Rental can have multiple assets but a template can only show
   * one" — one row per RentalItem, each asset name and price cell escaped
   * individually before the table string is assembled (see
   * RAW_HTML_VARIABLES below for why this is substituted unescaped). Shows
   * each item's already-stored per-unit price for its billing mode, never a
   * recomputed line total (date-range pricing stays in rental-pricing.util).
   */
  private async buildAssetsTableHtml(
    tenantId: string,
    rentalId: string,
    currency: string,
    language: string,
  ): Promise<string> {
    const items = await this.prisma.rentalItem.findMany({
      where: { tenantId, rentalId },
      include: { asset: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (items.length === 0) return "";

    const labels = tableLabels(language);
    const rows = items
      .map((item) => {
        const unitPriceMinor = billingModeUnitPriceMinor(item);
        const priceCell =
          unitPriceMinor === null
            ? ""
            : `${escapeHtml(formatMoney(unitPriceMinor, currency ?? CURRENCY_FALLBACK, language))} / ${escapeHtml(periodLabel(item.billingMode, labels))}`;
        return (
          `<tr><td>${escapeHtml(item.asset.name)}</td>` +
          `<td>${escapeHtml(String(item.quantity))}</td>` +
          `<td>${priceCell}</td></tr>`
        );
      })
      .join("");

    return (
      `<table class="doc-table"><thead><tr>` +
      `<th>${escapeHtml(labels.asset)}</th><th>${escapeHtml(labels.quantity)}</th><th>${escapeHtml(labels.unitPrice)}</th>` +
      `</tr></thead><tbody>${rows}</tbody></table>`
    );
  }

  /**
   * Renders one captured signature as an inline `<img>` with the actual
   * bytes embedded as a base64 data URI — a signed PDF must be a
   * self-contained, byte-stable artifact (docs/PRODUCT_BIBLE.md "Havelio
   * Signature System"), never a live `src` pointing back at a mutable
   * storage object. `mimeType` comes from the evidence row itself (set at
   * upload/draw time by StorageService.validateImage), never trusted from
   * anywhere else. CSS (`.doc-signature-block__image`) caps the display
   * size and preserves aspect ratio — the source image is never stretched.
   */
  private async buildSignatureImageHtml(evidence: DocumentSignatureEvidence): Promise<string> {
    const bytes = await this.storageService.read(evidence.storageKey);
    const base64 = bytes.toString("base64");
    return `<img class="doc-signature-block__image" src="data:${evidence.mimeType};base64,${base64}" alt="" />`;
  }

  /**
   * Reads the tenant's currently-configured company logo (Havelio Company
   * Branding, docs/PRODUCT_BIBLE.md) and base64-encodes it for embedding —
   * `null` when no logo is configured (buildLogoHtml then renders nothing,
   * never a broken-image icon). Reads the CURRENT tenant row every call,
   * which is only ever correct for a DRAFT/not-yet-final render — the
   * caller (DocumentsController.regeneratePdf) is responsible for refusing
   * to re-render a document that has already reached a terminal status, so
   * an already-finalized PDF's embedded logo can never change after the
   * fact. Resilient to a storage read failure (e.g. an object that somehow
   * no longer exists) — degrades to "no logo" rather than failing the
   * whole document render.
   */
  private async loadTenantLogo(tenant: {
    logoStorageKey: string | null;
    logoMimeType: string | null;
  }): Promise<{ base64: string; mimeType: string } | null> {
    if (!tenant.logoStorageKey || !tenant.logoMimeType) return null;
    try {
      const bytes = await this.storageService.read(tenant.logoStorageKey);
      return { base64: bytes.toString("base64"), mimeType: tenant.logoMimeType };
    } catch {
      return null;
    }
  }

  /**
   * Only the non-ASSET lines of a source Quote (services/fees/labor/...) —
   * the ASSET lines are already covered by rental.assetsTableHtml once the
   * Quote converts to a Rental. Uses each item's already-stored
   * lineTotalMinor (see ADR 0007) — never a recomputed total.
   */
  private async buildServicesTableHtml(
    tenantId: string,
    quoteId: string,
    currency: string,
    language: string,
  ): Promise<string> {
    const items = await this.prisma.quoteItem.findMany({
      where: { tenantId, quoteId, itemType: { not: "ASSET" } },
      orderBy: { sortOrder: "asc" },
    });
    if (items.length === 0) return "";

    const labels = tableLabels(language);
    const rows = items
      .map((item) => {
        const total = formatMoney(item.lineTotalMinor, currency ?? CURRENCY_FALLBACK, language);
        return (
          `<tr><td>${escapeHtml(item.name)}</td>` +
          `<td>${escapeHtml(String(item.quantity))}</td>` +
          `<td>${escapeHtml(total)}</td></tr>`
        );
      })
      .join("");

    return (
      `<table class="doc-table"><thead><tr>` +
      `<th>${escapeHtml(labels.service)}</th><th>${escapeHtml(labels.quantity)}</th><th>${escapeHtml(labels.total)}</th>` +
      `</tr></thead><tbody>${rows}</tbody></table>`
    );
  }
}

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/**
 * `timezone` is the tenant's own IANA zone (`Tenant.timezone`, set at
 * registration) rather than hardcoded UTC — a rendered contract/document is
 * dated from the issuing tenant's perspective, not the server's.
 */
function formatDate(value: Date, language: string, timezone: string): string {
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(value);
}

function formatTime(value: Date, language: string, timezone: string): string {
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(value);
}

function formatDateTime(value: Date, language: string, timezone: string): string {
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(value);
}

/** The already-stored per-unit price for this item's billing mode — never a computed line total. */
function billingModeUnitPriceMinor(item: {
  billingMode: string;
  dailyPriceMinor: number | null;
  weeklyPriceMinor: number | null;
  monthlyPriceMinor: number | null;
  customPriceMinor: number | null;
}): number | null {
  switch (item.billingMode) {
    case "DAILY":
      return item.dailyPriceMinor;
    case "WEEKLY":
      return item.weeklyPriceMinor;
    case "MONTHLY":
      return item.monthlyPriceMinor;
    case "CUSTOM":
      return item.customPriceMinor;
    default:
      return null;
  }
}

interface TableLabels {
  asset: string;
  quantity: string;
  unitPrice: string;
  service: string;
  total: string;
  day: string;
  week: string;
  month: string;
  custom: string;
}

/**
 * Labels for the rental.assetsTableHtml / quote.servicesTableHtml raw-HTML
 * blocks — these are server-rendered document content, not app UI chrome,
 * so they're a small local dictionary rather than routed through
 * packages/localization, but still cover all 14 supported locales for
 * consistency. Keyed by the resolved document language (see
 * resolveDefaultDocumentLanguage — company country first, never the
 * viewer's UI locale or the raw tenant.defaultLanguage field).
 */
const TABLE_LABELS: Record<string, TableLabels> = {
  en: {
    asset: "Asset",
    quantity: "Qty",
    unitPrice: "Unit price",
    service: "Service",
    total: "Total",
    day: "day",
    week: "week",
    month: "month",
    custom: "custom",
  },
  cs: {
    asset: "Vybavení",
    quantity: "Množství",
    unitPrice: "Jednotková cena",
    service: "Služba",
    total: "Celkem",
    day: "den",
    week: "týden",
    month: "měsíc",
    custom: "vlastní",
  },
  de: {
    asset: "Ausrüstung",
    quantity: "Menge",
    unitPrice: "Einzelpreis",
    service: "Leistung",
    total: "Gesamt",
    day: "Tag",
    week: "Woche",
    month: "Monat",
    custom: "individuell",
  },
  es: {
    asset: "Equipo",
    quantity: "Cant.",
    unitPrice: "Precio unitario",
    service: "Servicio",
    total: "Total",
    day: "día",
    week: "semana",
    month: "mes",
    custom: "personalizado",
  },
  fr: {
    asset: "Équipement",
    quantity: "Qté",
    unitPrice: "Prix unitaire",
    service: "Service",
    total: "Total",
    day: "jour",
    week: "semaine",
    month: "mois",
    custom: "personnalisé",
  },
  it: {
    asset: "Attrezzatura",
    quantity: "Qtà",
    unitPrice: "Prezzo unitario",
    service: "Servizio",
    total: "Totale",
    day: "giorno",
    week: "settimana",
    month: "mese",
    custom: "personalizzato",
  },
  ja: {
    asset: "資産",
    quantity: "数量",
    unitPrice: "単価",
    service: "サービス",
    total: "合計",
    day: "日",
    week: "週",
    month: "月",
    custom: "カスタム",
  },
  ko: {
    asset: "자산",
    quantity: "수량",
    unitPrice: "단가",
    service: "서비스",
    total: "합계",
    day: "일",
    week: "주",
    month: "월",
    custom: "사용자 지정",
  },
  nl: {
    asset: "Materiaal",
    quantity: "Aantal",
    unitPrice: "Stukprijs",
    service: "Dienst",
    total: "Totaal",
    day: "dag",
    week: "week",
    month: "maand",
    custom: "aangepast",
  },
  pl: {
    asset: "Sprzęt",
    quantity: "Ilość",
    unitPrice: "Cena jednostkowa",
    service: "Usługa",
    total: "Razem",
    day: "dzień",
    week: "tydzień",
    month: "miesiąc",
    custom: "niestandardowy",
  },
  "pt-BR": {
    asset: "Equipamento",
    quantity: "Qtd.",
    unitPrice: "Preço unitário",
    service: "Serviço",
    total: "Total",
    day: "dia",
    week: "semana",
    month: "mês",
    custom: "personalizado",
  },
  ru: {
    asset: "Оборудование",
    quantity: "Кол-во",
    unitPrice: "Цена за единицу",
    service: "Услуга",
    total: "Итого",
    day: "день",
    week: "неделя",
    month: "месяц",
    custom: "особый",
  },
  uk: {
    asset: "Обладнання",
    quantity: "К-сть",
    unitPrice: "Ціна за одиницю",
    service: "Послуга",
    total: "Разом",
    day: "день",
    week: "тиждень",
    month: "місяць",
    custom: "особливий",
  },
  "zh-CN": {
    asset: "资产",
    quantity: "数量",
    unitPrice: "单价",
    service: "服务",
    total: "总计",
    day: "天",
    week: "周",
    month: "月",
    custom: "自定义",
  },
};

function tableLabels(language: string): TableLabels {
  return TABLE_LABELS[language] ?? TABLE_LABELS.en!;
}

/**
 * Labels for RentalDeposit.receivedMethod in the deposit.receivedMethod
 * variable — same small-local-dictionary convention as TABLE_LABELS, so a
 * generated Deposit Receipt document never shows a raw enum value like
 * "BANK_TRANSFER" to a customer.
 */
const PAYMENT_METHOD_LABELS: Record<string, Record<string, string>> = {
  en: { BANK_TRANSFER: "Bank transfer", CASH: "Cash", CARD: "Card", OTHER: "Other" },
  cs: { BANK_TRANSFER: "Bankovní převod", CASH: "Hotovost", CARD: "Karta", OTHER: "Jiné" },
  de: { BANK_TRANSFER: "Überweisung", CASH: "Bar", CARD: "Karte", OTHER: "Sonstige" },
  es: {
    BANK_TRANSFER: "Transferencia bancaria",
    CASH: "Efectivo",
    CARD: "Tarjeta",
    OTHER: "Otro",
  },
  fr: { BANK_TRANSFER: "Virement bancaire", CASH: "Espèces", CARD: "Carte", OTHER: "Autre" },
  it: { BANK_TRANSFER: "Bonifico bancario", CASH: "Contanti", CARD: "Carta", OTHER: "Altro" },
  ja: { BANK_TRANSFER: "銀行振込", CASH: "現金", CARD: "カード", OTHER: "その他" },
  ko: { BANK_TRANSFER: "계좌이체", CASH: "현금", CARD: "카드", OTHER: "기타" },
  nl: { BANK_TRANSFER: "Bankoverschrijving", CASH: "Contant", CARD: "Kaart", OTHER: "Anders" },
  pl: { BANK_TRANSFER: "Przelew bankowy", CASH: "Gotówka", CARD: "Karta", OTHER: "Inne" },
  "pt-BR": {
    BANK_TRANSFER: "Transferência bancária",
    CASH: "Dinheiro",
    CARD: "Cartão",
    OTHER: "Outro",
  },
  ru: { BANK_TRANSFER: "Банковский перевод", CASH: "Наличные", CARD: "Карта", OTHER: "Другое" },
  uk: {
    BANK_TRANSFER: "Банківський переказ",
    CASH: "Готівка",
    CARD: "Картка",
    OTHER: "Інше",
  },
  "zh-CN": { BANK_TRANSFER: "银行转账", CASH: "现金", CARD: "银行卡", OTHER: "其他" },
};

function paymentMethodLabel(method: string, language: string): string {
  return PAYMENT_METHOD_LABELS[language]?.[method] ?? PAYMENT_METHOD_LABELS.en?.[method] ?? method;
}

/** "Signed:" label for the signature block's timestamp line — same small-local-dictionary convention as TABLE_LABELS/PAYMENT_METHOD_LABELS. */
const SIGNED_AT_LABELS: Record<string, string> = {
  en: "Signed:",
  cs: "Podepsáno:",
  de: "Unterschrieben:",
  es: "Firmado:",
  fr: "Signé :",
  it: "Firmato:",
  ja: "署名日:",
  ko: "서명일:",
  nl: "Ondertekend:",
  pl: "Podpisano:",
  "pt-BR": "Assinado em:",
  ru: "Подписано:",
  uk: "Підписано:",
  "zh-CN": "签署时间:",
};

function signedAtLabel(language: string): string {
  return SIGNED_AT_LABELS[language] ?? SIGNED_AT_LABELS.en!;
}

/** Same `.doc-table` markup shape as buildAssetsTableHtml/buildServicesTableHtml, built from literal sample rows (see buildPreviewContext). */
function sampleTableHtml(
  col1: string,
  col2: string,
  col3: string,
  rows: [string, string, string][],
): string {
  const body = rows
    .map(
      ([a, b, c]) =>
        `<tr><td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td><td>${escapeHtml(c)}</td></tr>`,
    )
    .join("");
  return (
    `<table class="doc-table"><thead><tr>` +
    `<th>${escapeHtml(col1)}</th><th>${escapeHtml(col2)}</th><th>${escapeHtml(col3)}</th>` +
    `</tr></thead><tbody>${body}</tbody></table>`
  );
}

function periodLabel(billingMode: string, labels: TableLabels): string {
  switch (billingMode) {
    case "DAILY":
      return labels.day;
    case "WEEKLY":
      return labels.week;
    case "MONTHLY":
      return labels.month;
    default:
      return labels.custom;
  }
}

function formatMoney(minor: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, { style: "currency", currency }).format(minor / 100);
}

/**
 * Renders the header logo `<img>` only when the tenant has actually
 * uploaded one (Havelio Company Branding, docs/PRODUCT_BIBLE.md) —
 * otherwise returns "" so no element is emitted at all, never a
 * `src=""` broken-image icon (see docs/DECISIONS.md, logo fallback fix).
 * The image bytes are embedded as a base64 data URI — same reasoning as
 * `buildSignatureImageHtml` (see below): a rendered/finalized PDF must be
 * a self-contained, byte-stable artifact, never a live `src` pointing at
 * mutable/private storage an email client or later viewer couldn't reach
 * anyway. `alt` is escaped like every other RAW_HTML_VARIABLES entry.
 */
function buildLogoHtml(logo: { base64: string; mimeType: string } | null, companyName: string): string {
  if (!logo) return "";
  return `<img class="doc-header__logo" src="data:${logo.mimeType};base64,${logo.base64}" alt="${escapeHtml(companyName)}" />`;
}

/**
 * Variables whose resolved value is pre-built HTML with every cell already
 * escaped individually by the resolver (see buildAssetsTableHtml/
 * buildServicesTableHtml) and so must be substituted verbatim. A small,
 * explicit allowlist of resolver-controlled paths — not a general "raw"
 * template syntax a tenant-authored template could opt into for arbitrary
 * variables, which would reopen the XSS surface the default escaping below
 * exists to close.
 */
const RAW_HTML_VARIABLES = new Set([
  "rental.assetsTableHtml",
  "quote.servicesTableHtml",
  "company.logoHtml",
  "signature.companySignatureImageHtml",
  "signature.customerSignatureImageHtml",
]);

/**
 * Substitutes every `{{dot.path}}` placeholder in `template` by walking
 * `context` — the actual "unlimited future variables" mechanism: any path
 * that resolves to a string/number/boolean is inserted (HTML-escaped, see
 * below); a path resolving to `undefined`/`null`/an object is replaced with
 * an empty string rather than throwing, so an unknown or not-yet-wired
 * variable degrades gracefully. Values are HTML-escaped by default since
 * they may contain user-entered text (customer name, notes, ...) — the only
 * exception is the small RAW_HTML_VARIABLES allowlist above, whose values
 * are pre-escaped-per-cell HTML built by the resolver itself, not
 * user-entered text passed through unescaped.
 */
export function resolveVariables(template: string, context: RenderContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = getPath(context, path);
    if (value === undefined || value === null) {
      return "";
    }
    if (RAW_HTML_VARIABLES.has(path)) {
      return typeof value === "string" ? value : "";
    }
    if (typeof value === "object") {
      return "";
    }
    return escapeHtml(String(value));
  });
}

function getPath(context: RenderContext, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, context);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
