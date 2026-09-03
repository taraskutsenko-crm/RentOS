import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FinanceReportsPage from "../../src/app/app/finance/page";
import { ApiError } from "../../src/lib/api-client";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useFinanceOverviewMock = vi.fn();
const useFinanceTimeseriesMock = vi.fn();
const useFinanceReceivablesAgingMock = vi.fn();
const useFinanceBiggestDebtorsMock = vi.fn();
const useFinanceTopCustomersMock = vi.fn();
const useFinancePaymentsMock = vi.fn();
const useFinanceDepositsMock = vi.fn();
const useFinanceAssetsMock = vi.fn();
const useFinanceCategoriesMock = vi.fn();
const useFinanceUtilizationMock = vi.fn();
const useFinanceReceivablesTableMock = vi.fn();
const useFinanceCashReceivedTableMock = vi.fn();

vi.mock("../../src/hooks/use-finance-reports", () => ({
  useFinanceOverview: (...args: unknown[]) => useFinanceOverviewMock(...args),
  useFinanceTimeseries: (...args: unknown[]) => useFinanceTimeseriesMock(...args),
  useFinanceReceivablesAging: (...args: unknown[]) => useFinanceReceivablesAgingMock(...args),
  useFinanceBiggestDebtors: (...args: unknown[]) => useFinanceBiggestDebtorsMock(...args),
  useFinanceTopCustomers: (...args: unknown[]) => useFinanceTopCustomersMock(...args),
  useFinancePayments: (...args: unknown[]) => useFinancePaymentsMock(...args),
  useFinanceDeposits: (...args: unknown[]) => useFinanceDepositsMock(...args),
  useFinanceAssets: (...args: unknown[]) => useFinanceAssetsMock(...args),
  useFinanceCategories: (...args: unknown[]) => useFinanceCategoriesMock(...args),
  useFinanceUtilization: (...args: unknown[]) => useFinanceUtilizationMock(...args),
  useFinanceReceivablesTable: (...args: unknown[]) => useFinanceReceivablesTableMock(...args),
  useFinanceCashReceivedTable: (...args: unknown[]) => useFinanceCashReceivedTableMock(...args),
  financeReportExportUrl: (tenantId: string, format: string) =>
    `https://example.com/${tenantId}/finance-reports/export/${format}`,
}));

const emptyQuery = { data: undefined, isLoading: false, isError: false };

describe("FinanceReportsPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1"]);
    usePermissionMock.mockReturnValue(true);
    useFinanceOverviewMock.mockReturnValue(emptyQuery);
    useFinanceTimeseriesMock.mockReturnValue(emptyQuery);
    useFinanceReceivablesAgingMock.mockReturnValue(emptyQuery);
    useFinanceBiggestDebtorsMock.mockReturnValue(emptyQuery);
    useFinanceTopCustomersMock.mockReturnValue(emptyQuery);
    useFinancePaymentsMock.mockReturnValue(emptyQuery);
    useFinanceDepositsMock.mockReturnValue(emptyQuery);
    useFinanceAssetsMock.mockReturnValue(emptyQuery);
    useFinanceCategoriesMock.mockReturnValue(emptyQuery);
    useFinanceUtilizationMock.mockReturnValue(emptyQuery);
    useFinanceReceivablesTableMock.mockReturnValue(emptyQuery);
    useFinanceCashReceivedTableMock.mockReturnValue(emptyQuery);
  });

  it("renders one KPI section per currency, never a blended cross-currency total", () => {
    useFinanceOverviewMock.mockReturnValue({
      data: {
        period: { preset: "THIS_MONTH", fromDate: "2026-09-01", toDate: "2026-09-30", previous: null },
        rows: [
          {
            currency: "PLN",
            invoiced: { currentMinor: 500_000, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            cashReceived: { currentMinor: 180_000, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            tax: { currentMinor: 0, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            outstandingMinor: 320_000,
            overdueMinor: 150_000,
            outstandingMinorPeriodAgo: null,
            overdueMinorPeriodAgo: null,
            collectionRatePercent: 36,
          },
          {
            currency: "EUR",
            invoiced: { currentMinor: 120_000, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            cashReceived: { currentMinor: 70_000, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            tax: { currentMinor: 0, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            outstandingMinor: 50_000,
            overdueMinor: 0,
            outstandingMinorPeriodAgo: null,
            overdueMinorPeriodAgo: null,
            collectionRatePercent: 58,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<FinanceReportsPage />);

    expect(screen.getByRole("heading", { name: "PLN" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "EUR" })).toBeInTheDocument();
    // Never a combined grand total anywhere on the page.
    expect(screen.queryByText(/grand total/i)).not.toBeInTheDocument();
  });

  it("shows 'New' instead of a misleading percentage when there is no previous-period value", () => {
    useFinanceOverviewMock.mockReturnValue({
      data: {
        period: { preset: "ALL_TIME", fromDate: null, toDate: "2026-09-01", previous: null },
        rows: [
          {
            currency: "USD",
            invoiced: { currentMinor: 100_000, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            cashReceived: { currentMinor: 0, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            tax: { currentMinor: 0, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            outstandingMinor: 100_000,
            overdueMinor: 0,
            outstandingMinorPeriodAgo: null,
            overdueMinorPeriodAgo: null,
            collectionRatePercent: 0,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<FinanceReportsPage />);

    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Infinity/i)).not.toBeInTheDocument();
  });

  it("switches tab content when a different tab is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinanceReportsPage />);

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Receivables" }));
    expect(screen.getByRole("tab", { name: "Receivables" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Receivable aging")).toBeInTheDocument();
  });

  it("shows export buttons when the user has finance.export, hides them otherwise", () => {
    usePermissionMock.mockImplementation((permission: string) => permission !== "finance.export");
    renderWithProviders(<FinanceReportsPage />);
    expect(screen.queryByRole("link", { name: "Export CSV" })).not.toBeInTheDocument();

    usePermissionMock.mockReturnValue(true);
    renderWithProviders(<FinanceReportsPage />);
    expect(screen.getByRole("link", { name: "Export CSV" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export Excel" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export PDF" })).toBeInTheDocument();
  });

  it("shows an empty state when there is no financial activity", () => {
    renderWithProviders(<FinanceReportsPage />);
    expect(screen.getByText("No financial activity for this period")).toBeInTheDocument();
  });

  it("shows a full-page upgrade notice with a 'View plans' action when the plan doesn't include Financial Reports", () => {
    useFinanceOverviewMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(
        "This feature is available on the BUSINESS plan. Upgrade to unlock it.",
        403,
        "/tenants/tenant-1/finance-reports/overview",
        {
          code: "ENTITLEMENT_DENIED",
          reason: { type: "FEATURE", feature: "FINANCIAL_REPORTS", availableFromPlan: "BUSINESS" },
        },
      ),
    });

    renderWithProviders(<FinanceReportsPage />);

    expect(
      screen.getByText("This feature is available on the BUSINESS plan. Upgrade to unlock it."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View plans" })).toBeInTheDocument();
    // The broken multi-widget rendering never happens — only the notice.
    expect(screen.queryByRole("tab", { name: "Receivables" })).not.toBeInTheDocument();
  });

  it("switching to the custom period preset reveals from/to date pickers", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinanceReportsPage />);
    const select = screen.getByLabelText("Period");
    await user.selectOptions(select, "Custom range");
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });
});
