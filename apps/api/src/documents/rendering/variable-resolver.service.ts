import { Injectable } from "@nestjs/common";

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
      select: { name: true, defaultLanguage: true, defaultCurrency: true },
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
    const employeeName = employeeUser
      ? fullName(employeeUser.firstName, employeeUser.lastName)
      : createdByUser
        ? fullName(createdByUser.firstName, createdByUser.lastName)
        : "";

    const businessData = (version.businessDataSnapshot as Record<string, unknown>) ?? {};

    return {
      company: {
        name: tenant.name,
        // No tenant branding/logo field exists yet — resolves empty until
        // one is added; the template syntax itself needs no change then.
        logo: "",
        email: "",
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
            start: formatDate(document.rental.plannedStart, language),
            end: formatDate(document.rental.plannedEnd, language),
            total: formatMoney(
              document.rental.totalMinor,
              document.rental.currency ?? CURRENCY_FALLBACK,
              language,
            ),
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
          }
        : {},
      today: formatDate(new Date(), language),
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
}

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

function formatDate(value: Date, language: string): string {
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(value);
}

function formatMoney(minor: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, { style: "currency", currency }).format(minor / 100);
}

/**
 * Substitutes every `{{dot.path}}` placeholder in `template` by walking
 * `context` — the actual "unlimited future variables" mechanism: any path
 * that resolves to a string/number/boolean is inserted (HTML-escaped, see
 * below); a path resolving to `undefined`/`null`/an object is replaced with
 * an empty string rather than throwing, so an unknown or not-yet-wired
 * variable degrades gracefully. Values are HTML-escaped by default since
 * they may contain user-entered text (customer name, notes, ...) — there is
 * deliberately no "raw HTML" placeholder syntax, which would be an
 * unnecessary XSS surface for no real benefit here (an image variable like
 * `company.logo` is just a URL string; the template author writes the
 * `<img src="...">` tag themselves).
 */
export function resolveVariables(template: string, context: RenderContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = getPath(context, path);
    if (value === undefined || value === null || typeof value === "object") {
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
