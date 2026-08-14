import { Injectable } from "@nestjs/common";
import type { DocumentType } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import type { DocumentDetailView, DocumentVersionWithFiles } from "../document.types";

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
  constructor(private readonly prisma: PrismaService) {}

  async buildContext(
    tenantId: string,
    document: DocumentDetailView,
    version: DocumentVersionWithFiles,
  ): Promise<RenderContext> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        name: true,
        defaultLanguage: true,
        defaultCurrency: true,
        timezone: true,
        registrationNumber: true,
        taxNumber: true,
        address: true,
        phone: true,
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

    const language = tenant.defaultLanguage;
    const timezone = tenant.timezone;
    const employeeName = employeeUser
      ? fullName(employeeUser.firstName, employeeUser.lastName)
      : createdByUser
        ? fullName(createdByUser.firstName, createdByUser.lastName)
        : "";

    const businessData = (version.businessDataSnapshot as Record<string, unknown>) ?? {};

    const rentalDeposit = document.rental
      ? await this.resolveRentalDeposit(
          tenantId,
          document.rental.id,
          document.rental.currency,
          language,
        )
      : "";
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

    return {
      company: {
        name: tenant.name,
        // No tenant branding/logo field exists yet — resolves empty until
        // one is added; the template syntax itself needs no change then.
        logo: "",
        email: "",
        registrationNumber: tenant.registrationNumber ?? "",
        taxNumber: tenant.taxNumber ?? "",
        address: tenant.address ?? "",
        phone: tenant.phone ?? "",
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
      rental: document.rental
        ? {
            number: document.rental.rentalNumber,
            start: formatDate(document.rental.plannedStart, language, timezone),
            end: formatDate(document.rental.plannedEnd, language, timezone),
            startTime: formatTime(document.rental.plannedStart, language, timezone),
            endTime: formatTime(document.rental.plannedEnd, language, timezone),
            startDateTime: formatDateTime(document.rental.plannedStart, language, timezone),
            endDateTime: formatDateTime(document.rental.plannedEnd, language, timezone),
            total: formatMoney(
              document.rental.totalMinor,
              document.rental.currency ?? CURRENCY_FALLBACK,
              language,
            ),
            deposit: rentalDeposit,
            assetsTableHtml,
          }
        : {},
      quote: document.quote
        ? {
            number: document.quote.quoteNumber,
            total: formatMoney(
              document.quote.totalMinor,
              document.quote.currency ?? CURRENCY_FALLBACK,
              language,
            ),
            servicesTableHtml,
          }
        : {},
      today: formatDate(new Date(), language, timezone),
      signature: {
        company: tenant.name,
        employee: employeeName,
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
        defaultLanguage: true,
        defaultCurrency: true,
        timezone: true,
        registrationNumber: true,
        taxNumber: true,
        address: true,
        phone: true,
      },
    });

    const language = tenant.defaultLanguage;
    const timezone = tenant.timezone;
    const currency = tenant.defaultCurrency ?? CURRENCY_FALLBACK;
    const labels = tableLabels(language);
    const now = new Date();
    const later = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const employeeName = "Sample Employee";

    return {
      company: {
        name: tenant.name,
        logo: "",
        email: "",
        registrationNumber: tenant.registrationNumber ?? "",
        taxNumber: tenant.taxNumber ?? "",
        address: tenant.address ?? "",
        phone: tenant.phone ?? "",
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
        total: formatMoney(50000, currency, language),
        deposit: formatMoney(10000, currency, language),
        assetsTableHtml: sampleTableHtml(labels.asset, labels.quantity, labels.unitPrice, [
          ["Sample Asset A", "1", `${formatMoney(15000, currency, language)} / ${labels.day}`],
          ["Sample Asset B", "2", `${formatMoney(5000, currency, language)} / ${labels.day}`],
        ]),
      },
      quote: {
        number: "Q-000001",
        total: formatMoney(50000, currency, language),
        servicesTableHtml: sampleTableHtml(labels.service, labels.quantity, labels.total, [
          ["Sample Delivery Service", "1", formatMoney(5000, currency, language)],
        ]),
      },
      today: formatDate(now, language, timezone),
      signature: {
        company: tenant.name,
        employee: employeeName,
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

  /** A display-only sum of already-stored per-item deposits — never a pricing recalculation. */
  private async resolveRentalDeposit(
    tenantId: string,
    rentalId: string,
    currency: string,
    language: string,
  ): Promise<string> {
    const result = await this.prisma.rentalItem.aggregate({
      where: { tenantId, rentalId },
      _sum: { depositMinor: true },
    });
    return formatMoney(result._sum.depositMinor ?? 0, currency ?? CURRENCY_FALLBACK, language);
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
 * consistency. Keyed by tenant.defaultLanguage until per-document language
 * (DocumentTemplate.language) is wired into rendering.
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
 * Variables whose resolved value is pre-built HTML with every cell already
 * escaped individually by the resolver (see buildAssetsTableHtml/
 * buildServicesTableHtml) and so must be substituted verbatim. A small,
 * explicit allowlist of resolver-controlled paths — not a general "raw"
 * template syntax a tenant-authored template could opt into for arbitrary
 * variables, which would reopen the XSS surface the default escaping below
 * exists to close.
 */
const RAW_HTML_VARIABLES = new Set(["rental.assetsTableHtml", "quote.servicesTableHtml"]);

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
