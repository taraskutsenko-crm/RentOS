import { Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";

import { CompanyLogoService } from "../company-branding/company-logo.service";
import { PrismaService } from "../prisma/prisma.service";
import { buildCsv } from "./csv.util";
import type { FinanceReportContext } from "./finance-reports.service";
import { FinanceReportsService } from "./finance-reports.service";
import { AssetPerformanceService } from "./asset-performance.service";
import { FinanceReportPdfService } from "./rendering/finance-report-pdf.service";

function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

export type CsvReportName = "summary" | "receivables" | "payments" | "top-customers" | "deposits";

/**
 * Composes FinanceReportsService/AssetPerformanceService's already-canonical
 * data into the three export formats (§28/§29/§30) — never recomputes any
 * figure itself, only formats what the report services already returned.
 * Every export always respects the caller's currently-selected
 * period/currency filters and is generated on demand (no persisted export
 * file, no public URL — see docs/PRODUCT_BIBLE.md §31 export security;
 * every export endpoint sits behind the same tenant/permission guards as
 * the rest of this module).
 */
@Injectable()
export class FinanceExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: FinanceReportsService,
    private readonly assetPerformance: AssetPerformanceService,
    private readonly companyLogo: CompanyLogoService,
    private readonly pdfService: FinanceReportPdfService,
  ) {}

  async buildCsv(ctx: FinanceReportContext, report: CsvReportName, currency: string | undefined): Promise<string> {
    switch (report) {
      case "summary": {
        const rows = await this.reports.getOverview(ctx, currency);
        return buildCsv(
          ["Currency", "Invoiced", "Cash received", "Outstanding", "Overdue", "Tax", "Collection rate %"],
          rows.map((r) => [
            r.currency,
            toMajor(r.invoiced.currentMinor),
            toMajor(r.cashReceived.currentMinor),
            toMajor(r.outstandingMinor),
            toMajor(r.overdueMinor),
            toMajor(r.tax.currentMinor),
            r.collectionRatePercent ?? "",
          ]),
        );
      }
      case "receivables": {
        const { items } = await this.reports.getReceivablesTable(ctx.tenantId, {
          page: 1,
          pageSize: 10_000,
          ...(currency ? { currency } : {}),
          sortBy: "dueDate",
          sortDirection: "asc",
        });
        return buildCsv(
          ["Invoice", "Customer", "Currency", "Issue date", "Due date", "Total", "Paid", "Outstanding", "Status", "Overdue days"],
          items.map((i) => [
            i.invoiceNumber,
            i.customerName,
            i.currency,
            i.issueDate.slice(0, 10),
            i.dueDate ? i.dueDate.slice(0, 10) : "",
            toMajor(i.totalMinor),
            toMajor(i.paidMinor),
            toMajor(i.outstandingMinor),
            i.paymentStatus,
            i.overdueDays,
          ]),
        );
      }
      case "payments": {
        const { items } = await this.reports.getCashReceivedTable(ctx, {
          page: 1,
          pageSize: 10_000,
          ...(currency ? { currency } : {}),
          sortBy: "paymentDate",
          sortDirection: "desc",
        });
        return buildCsv(
          ["Payment date", "Customer", "Invoice", "Amount", "Currency", "Method", "Source", "Entered by"],
          items.map((p) => [
            p.paymentDate.slice(0, 10),
            p.customerName,
            p.invoiceNumber,
            toMajor(p.amountMinor),
            p.currency,
            p.method,
            p.source,
            p.enteredByName,
          ]),
        );
      }
      case "top-customers": {
        const rows = await this.reports.getTopCustomers(ctx, "invoiced", currency, 50);
        return buildCsv(
          ["Customer", "Currency", "Invoiced"],
          rows.map((r) => [r.customerName, r.currency, toMajor(r.amountMinor)]),
        );
      }
      case "deposits": {
        const rows = await this.reports.getDepositSummary(ctx, currency);
        return buildCsv(
          ["Currency", "Received", "Returned", "Retained", "Applied", "Currently held"],
          rows.map((r) => [
            r.currency,
            toMajor(r.receivedMinor),
            toMajor(r.returnedMinor),
            toMajor(r.retainedMinor),
            toMajor(r.appliedMinor),
            toMajor(r.currentlyHeldMinor),
          ]),
        );
      }
    }
  }

  async buildXlsx(ctx: FinanceReportContext, currency: string | undefined): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Havelio";
    workbook.created = new Date();

    const [overview, receivables, payments, topCustomers, deposits, assets] = await Promise.all([
      this.reports.getOverview(ctx, currency),
      this.reports.getReceivablesTable(ctx.tenantId, {
        page: 1,
        pageSize: 10_000,
        ...(currency ? { currency } : {}),
        sortBy: "dueDate",
        sortDirection: "asc",
      }),
      this.reports.getCashReceivedTable(ctx, {
        page: 1,
        pageSize: 10_000,
        ...(currency ? { currency } : {}),
        sortBy: "paymentDate",
        sortDirection: "desc",
      }),
      this.reports.getTopCustomers(ctx, "invoiced", currency, 50),
      this.reports.getDepositSummary(ctx, currency),
      this.assetPerformance.getAssetPerformance(ctx, currency, 50),
    ]);

    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.columns = [
      { header: "Currency", key: "currency", width: 10 },
      { header: "Invoiced", key: "invoiced", width: 14 },
      { header: "Cash received", key: "cashReceived", width: 14 },
      { header: "Outstanding", key: "outstanding", width: 14 },
      { header: "Overdue", key: "overdue", width: 14 },
      { header: "Tax", key: "tax", width: 12 },
      { header: "Collection rate %", key: "collectionRate", width: 16 },
    ];
    for (const row of overview) {
      summarySheet.addRow({
        currency: row.currency,
        invoiced: toMajor(row.invoiced.currentMinor),
        cashReceived: toMajor(row.cashReceived.currentMinor),
        outstanding: toMajor(row.outstandingMinor),
        overdue: toMajor(row.overdueMinor),
        tax: toMajor(row.tax.currentMinor),
        collectionRate: row.collectionRatePercent ?? "",
      });
    }
    summarySheet.getRow(1).font = { bold: true };

    const paymentsSheet = workbook.addWorksheet("Payments");
    paymentsSheet.columns = [
      { header: "Payment date", key: "date", width: 14 },
      { header: "Customer", key: "customer", width: 24 },
      { header: "Invoice", key: "invoice", width: 18 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Method", key: "method", width: 14 },
      { header: "Source", key: "source", width: 18 },
      { header: "Entered by", key: "enteredBy", width: 20 },
    ];
    for (const p of payments.items) {
      paymentsSheet.addRow({
        date: p.paymentDate.slice(0, 10),
        customer: p.customerName,
        invoice: p.invoiceNumber,
        amount: toMajor(p.amountMinor),
        currency: p.currency,
        method: p.method,
        source: p.source,
        enteredBy: p.enteredByName,
      });
    }
    paymentsSheet.getRow(1).font = { bold: true };

    const receivablesSheet = workbook.addWorksheet("Receivables");
    receivablesSheet.columns = [
      { header: "Invoice", key: "invoice", width: 18 },
      { header: "Customer", key: "customer", width: 24 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Issue date", key: "issueDate", width: 14 },
      { header: "Due date", key: "dueDate", width: 14 },
      { header: "Total", key: "total", width: 12 },
      { header: "Paid", key: "paid", width: 12 },
      { header: "Outstanding", key: "outstanding", width: 14 },
      { header: "Status", key: "status", width: 20 },
      { header: "Overdue days", key: "overdueDays", width: 14 },
    ];
    for (const r of receivables.items) {
      receivablesSheet.addRow({
        invoice: r.invoiceNumber,
        customer: r.customerName,
        currency: r.currency,
        issueDate: r.issueDate.slice(0, 10),
        dueDate: r.dueDate ? r.dueDate.slice(0, 10) : "",
        total: toMajor(r.totalMinor),
        paid: toMajor(r.paidMinor),
        outstanding: toMajor(r.outstandingMinor),
        status: r.paymentStatus,
        overdueDays: r.overdueDays,
      });
    }
    receivablesSheet.getRow(1).font = { bold: true };

    const customersSheet = workbook.addWorksheet("Customers");
    customersSheet.columns = [
      { header: "Customer", key: "customer", width: 24 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Invoiced", key: "invoiced", width: 14 },
    ];
    for (const c of topCustomers) {
      customersSheet.addRow({ customer: c.customerName, currency: c.currency, invoiced: toMajor(c.amountMinor) });
    }
    customersSheet.getRow(1).font = { bold: true };

    const depositsSheet = workbook.addWorksheet("Deposits");
    depositsSheet.columns = [
      { header: "Currency", key: "currency", width: 10 },
      { header: "Received", key: "received", width: 12 },
      { header: "Returned", key: "returned", width: 12 },
      { header: "Retained", key: "retained", width: 12 },
      { header: "Applied", key: "applied", width: 12 },
      { header: "Currently held", key: "held", width: 14 },
    ];
    for (const d of deposits) {
      depositsSheet.addRow({
        currency: d.currency,
        received: toMajor(d.receivedMinor),
        returned: toMajor(d.returnedMinor),
        retained: toMajor(d.retainedMinor),
        applied: toMajor(d.appliedMinor),
        held: toMajor(d.currentlyHeldMinor),
      });
    }
    depositsSheet.getRow(1).font = { bold: true };

    if (assets.length > 0) {
      const assetsSheet = workbook.addWorksheet("Assets");
      assetsSheet.columns = [
        { header: "Asset", key: "asset", width: 24 },
        { header: "Currency", key: "currency", width: 10 },
        { header: "Invoiced", key: "invoiced", width: 14 },
        { header: "Rental days", key: "rentalDays", width: 12 },
        { header: "Rental count", key: "rentalCount", width: 12 },
      ];
      for (const a of assets) {
        assetsSheet.addRow({
          asset: a.assetName,
          currency: a.currency,
          invoiced: toMajor(a.invoicedMinor),
          rentalDays: a.rentalDays,
          rentalCount: a.rentalCount,
        });
      }
      assetsSheet.getRow(1).font = { bold: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async buildPdf(ctx: FinanceReportContext, tenantId: string): Promise<Buffer> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, defaultLanguage: true },
    });

    let logoBase64: string | undefined;
    let logoMimeType: string | undefined;
    try {
      const logo = await this.companyLogo.readFile(tenantId);
      logoBase64 = logo.buffer.toString("base64");
      logoMimeType = logo.mimeType;
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      // No logo configured — render without one, exactly like every other
      // PDF renderer in this codebase (see invoice-renderer.service.ts's
      // logoHtml).
    }

    const [overview, aging, topCustomers, deposits] = await Promise.all([
      this.reports.getOverview(ctx),
      this.reports.getReceivablesAging(ctx.tenantId),
      this.reports.getTopCustomers(ctx, "invoiced", undefined, 10),
      this.reports.getDepositSummary(ctx),
    ]);

    const periodLabel = ctx.period.fromDate
      ? `${ctx.period.fromDate} – ${ctx.period.toDate}`
      : `All time – ${ctx.period.toDate}`;

    return this.pdfService.render({
      tenantName: tenant.name,
      logoBase64,
      logoMimeType,
      language: tenant.defaultLanguage,
      periodLabel,
      generatedAt: new Date(),
      overview,
      aging,
      topCustomers,
      deposits,
    });
  }
}
