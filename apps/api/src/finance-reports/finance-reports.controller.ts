import { BadRequestException, Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import { CurrentTenant, type CurrentTenantContext } from "../auth/decorators/current-tenant.decorator";
import { PermissionsGuard } from "../permissions/permissions.guard";
import { RequirePermissions } from "../permissions/require-permissions.decorator";
import { TenantGuard } from "../tenants/tenant.guard";
import { AssetPerformanceService } from "./asset-performance.service";
// Real (non-type-only) imports — these DTO classes are used as `@Query()`
// parameter types, and NestJS's ValidationPipe resolves the class to
// validate against via runtime `design:paramtypes` reflection metadata,
// which `import type` erases at compile time (silently leaving Nest with
// no class to validate against — every property then fails the global
// `whitelist: true` check as "should not exist").
import { CashReceivedTableQueryDto } from "./dto/cash-received-table-query.dto";
import { FinanceReportQueryDto } from "./dto/finance-report-query.dto";
import { LimitQueryDto } from "./dto/limit-query.dto";
import { ReceivablesTableQueryDto } from "./dto/receivables-table-query.dto";
import { TopCustomersQueryDto } from "./dto/top-customers-query.dto";
import { FinanceExportService, type CsvReportName } from "./finance-export.service";
import { FinanceReportsService } from "./finance-reports.service";

const CSV_REPORT_NAMES: CsvReportName[] = ["summary", "receivables", "payments", "top-customers", "deposits"];

/**
 * Havelio Financial Reports & Analytics V1 (docs/PRODUCT_BIBLE.md) —
 * read-only aggregation endpoints over the already-canonical Invoice/
 * Payment/RentalDeposit/PaymentDemand data (FinanceReportsService/
 * AssetPerformanceService never introduce a second source of truth, see
 * docs/DECISIONS.md). `finance.read` gates every GET here; the three
 * export endpoints additionally require `finance.export` (a more
 * sensitive action — downloading a copy of tenant financial data — than
 * viewing it on screen).
 */
@UseGuards(TenantGuard, PermissionsGuard)
@Controller("tenants/:tenantId/finance-reports")
export class FinanceReportsController {
  constructor(
    private readonly reports: FinanceReportsService,
    private readonly assetPerformance: AssetPerformanceService,
    private readonly exportService: FinanceExportService,
  ) {}

  @RequirePermissions("finance.read")
  @Get("overview")
  async overview(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: FinanceReportQueryDto) {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    return { period: ctx.period, rows: await this.reports.getOverview(ctx, query.currency) };
  }

  @RequirePermissions("finance.read")
  @Get("timeseries")
  async timeseries(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: FinanceReportQueryDto) {
    if (!query.currency) {
      throw new BadRequestException("`currency` is required for the time-series endpoint — a chart can never mix currencies");
    }
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    return { period: ctx.period, ...(await this.reports.getCashSeries(ctx, query.currency)) };
  }

  @RequirePermissions("finance.read")
  @Get("receivables-aging")
  async receivablesAging(@CurrentTenant() { tenant }: CurrentTenantContext, @Query("currency") currency?: string) {
    return { rows: await this.reports.getReceivablesAging(tenant.id, currency) };
  }

  @RequirePermissions("finance.read")
  @Get("biggest-debtors")
  async biggestDebtors(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query("currency") currency: string | undefined,
    @Query("limit") limit: string | undefined,
  ) {
    const parsedLimit = limit ? Math.min(50, Math.max(1, Number(limit) || 10)) : 10;
    return { rows: await this.reports.getBiggestDebtors(tenant.id, currency, parsedLimit) };
  }

  @RequirePermissions("finance.read")
  @Get("top-customers")
  async topCustomers(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: TopCustomersQueryDto) {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    return {
      period: ctx.period,
      rows: await this.reports.getTopCustomers(ctx, query.metric ?? "invoiced", query.currency, query.limit ?? 10),
    };
  }

  @RequirePermissions("finance.read")
  @Get("payments")
  async payments(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: FinanceReportQueryDto) {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    return { period: ctx.period, rows: await this.reports.getPaymentsBreakdown(ctx, query.currency) };
  }

  @RequirePermissions("finance.read")
  @Get("deposits")
  async deposits(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: FinanceReportQueryDto) {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    return { period: ctx.period, rows: await this.reports.getDepositSummary(ctx, query.currency) };
  }

  @RequirePermissions("finance.read")
  @Get("payment-demands")
  async paymentDemands(@CurrentTenant() { tenant }: CurrentTenantContext, @Query("currency") currency?: string) {
    return this.reports.getPaymentDemandStats(tenant.id, currency);
  }

  @RequirePermissions("finance.read")
  @Get("assets")
  async assets(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: LimitQueryDto) {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    return {
      period: ctx.period,
      rows: await this.assetPerformance.getAssetPerformance(ctx, query.currency, query.limit ?? 10),
    };
  }

  @RequirePermissions("finance.read")
  @Get("categories")
  async categories(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: LimitQueryDto) {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    return {
      period: ctx.period,
      rows: await this.assetPerformance.getCategoryPerformance(ctx, query.currency, query.limit ?? 10),
    };
  }

  @RequirePermissions("finance.read")
  @Get("utilization")
  async utilization(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: LimitQueryDto) {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    return { period: ctx.period, ...(await this.assetPerformance.getAssetUtilization(ctx, query.limit ?? 10)) };
  }

  @RequirePermissions("finance.read")
  @Get("receivables")
  async receivablesTable(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: ReceivablesTableQueryDto) {
    return this.reports.getReceivablesTable(tenant.id, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      currency: query.currency,
      customerId: query.customerId,
      search: query.search,
      sortBy: query.sortBy ?? "dueDate",
      sortDirection: query.sortDirection ?? "asc",
    });
  }

  @RequirePermissions("finance.read")
  @Get("cash-received")
  async cashReceivedTable(@CurrentTenant() { tenant }: CurrentTenantContext, @Query() query: CashReceivedTableQueryDto) {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    return this.reports.getCashReceivedTable(ctx, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      currency: query.currency,
      customerId: query.customerId,
      method: query.method,
      search: query.search,
      sortBy: query.sortBy ?? "paymentDate",
      sortDirection: query.sortDirection ?? "desc",
    });
  }

  @RequirePermissions("finance.export")
  @Get("export/csv")
  async exportCsv(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query() query: FinanceReportQueryDto & { report?: string },
    @Res() res: Response,
  ): Promise<void> {
    const report = (query.report ?? "summary") as CsvReportName;
    if (!CSV_REPORT_NAMES.includes(report)) {
      throw new BadRequestException(`Unknown CSV report "${query.report}" — expected one of: ${CSV_REPORT_NAMES.join(", ")}`);
    }
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    const csv = await this.exportService.buildCsv(ctx, report, query.currency);
    res.set("Content-Disposition", `attachment; filename="${report}.csv"`);
    res.type("text/csv; charset=utf-8").send(csv);
  }

  @RequirePermissions("finance.export")
  @Get("export/xlsx")
  async exportXlsx(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query() query: FinanceReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    const buffer = await this.exportService.buildXlsx(ctx, query.currency);
    res.set("Content-Disposition", 'attachment; filename="financial-report.xlsx"');
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buffer);
  }

  @RequirePermissions("finance.export")
  @Get("export/pdf")
  async exportPdf(
    @CurrentTenant() { tenant }: CurrentTenantContext,
    @Query() query: FinanceReportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const ctx = await this.reports.buildContext(tenant.id, query.period, query);
    const buffer = await this.exportService.buildPdf(ctx, tenant.id);
    res.set("Content-Disposition", 'inline; filename="financial-report.pdf"');
    res.type("application/pdf").send(buffer);
  }
}
