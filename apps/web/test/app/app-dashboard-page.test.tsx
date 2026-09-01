import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppHomePage from "../../src/app/app/page";
import { renderWithProviders } from "../test-utils";

const useMeMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useMe: () => useMeMock(),
}));

vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => ["tenant-1"],
}));

const permissionsMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (permission: string) => permissionsMock(permission),
}));

const useDashboardStatsMock = vi.fn();
vi.mock("../../src/hooks/use-dashboard-stats", () => ({
  useDashboardStats: () => useDashboardStatsMock(),
}));

const useFinanceOverviewMock = vi.fn();
vi.mock("../../src/hooks/use-finance-reports", () => ({
  useFinanceOverview: (...args: unknown[]) => useFinanceOverviewMock(...args),
}));

const EMPTY_STAT = { value: 0, isLoading: false, isError: false };
const EMPTY_LIST = { items: [], isLoading: false, isError: false, refetch: vi.fn() };

function baseStats() {
  return {
    totalCustomers: { value: 12, isLoading: false, isError: false },
    activeRentals: EMPTY_STAT,
    availableAssets: EMPTY_STAT,
    pendingQuotes: EMPTY_STAT,
    needsAttention: EMPTY_STAT,
    recentRentals: EMPTY_LIST,
    recentDocuments: EMPTY_LIST,
  };
}

describe("AppHomePage", () => {
  beforeEach(() => {
    useFinanceOverviewMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
  });

  it("always shows the Customers metric and the welcome header, even with no other permissions", () => {
    useMeMock.mockReturnValue({ data: { user: { firstName: "Ada" } } });
    permissionsMock.mockReturnValue(false);
    useDashboardStatsMock.mockReturnValue(baseStats());

    renderWithProviders(<AppHomePage />);

    expect(screen.getByText(/ada/i)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText(/active rentals/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recent activity/i)).not.toBeInTheDocument();
  });

  it("shows permission-gated metrics and recent-activity panels once the user has view access", () => {
    useMeMock.mockReturnValue({ data: { user: { firstName: "Ada" } } });
    permissionsMock.mockImplementation(
      (permission: string) => permission === "rentals.view" || permission === "documents.view",
    );
    useDashboardStatsMock.mockReturnValue({
      ...baseStats(),
      activeRentals: { value: 3, isLoading: false, isError: false },
      recentRentals: {
        items: [
          {
            id: "rental-1",
            rentalNumber: "RNT-000001",
            status: "ACTIVE",
            customer: { firstName: "Jane", lastName: "Doe" },
          },
        ],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      },
    });

    renderWithProviders(<AppHomePage />);

    expect(screen.getByText(/active rentals/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/recent activity/i)).toBeInTheDocument();
    expect(screen.getByText("RNT-000001")).toBeInTheDocument();
  });

  it("shows an accessible loading status for a metric that is still loading", () => {
    useMeMock.mockReturnValue({ data: { user: { firstName: "Ada" } } });
    permissionsMock.mockReturnValue(false);
    useDashboardStatsMock.mockReturnValue({
      ...baseStats(),
      totalCustomers: { value: 0, isLoading: true, isError: false },
    });

    renderWithProviders(<AppHomePage />);

    expect(screen.getAllByLabelText(/loading/i).length).toBeGreaterThan(0);
  });

  it("hides the Needs attention metric unless the user can manage the customer portal", () => {
    useMeMock.mockReturnValue({ data: { user: { firstName: "Ada" } } });
    permissionsMock.mockImplementation(
      (permission: string) => permission === "customers.portal.manage",
    );
    useDashboardStatsMock.mockReturnValue({
      ...baseStats(),
      needsAttention: { value: 2, isLoading: false, isError: false },
    });

    renderWithProviders(<AppHomePage />);

    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows a compact Finance widget with a link to the full report when the user can read finance data", () => {
    useMeMock.mockReturnValue({ data: { user: { firstName: "Ada" } } });
    permissionsMock.mockImplementation((permission: string) => permission === "finance.read");
    useDashboardStatsMock.mockReturnValue(baseStats());
    useFinanceOverviewMock.mockReturnValue({
      data: {
        period: { preset: "THIS_MONTH", fromDate: "2026-09-01", toDate: "2026-09-30", previous: null },
        rows: [
          {
            currency: "PLN",
            invoiced: { currentMinor: 0, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            cashReceived: { currentMinor: 180_000, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            tax: { currentMinor: 0, previousMinor: 0, absoluteChangeMinor: null, percentChange: null, hasPrevious: false },
            outstandingMinor: 320_000,
            overdueMinor: 150_000,
            outstandingMinorPeriodAgo: null,
            overdueMinorPeriodAgo: null,
            collectionRatePercent: null,
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AppHomePage />);

    expect(screen.getByRole("link", { name: "View financial reports" })).toHaveAttribute("href", "/app/finance");
  });

  it("hides the Finance widget entirely without finance.read", () => {
    useMeMock.mockReturnValue({ data: { user: { firstName: "Ada" } } });
    permissionsMock.mockReturnValue(false);
    useDashboardStatsMock.mockReturnValue(baseStats());

    renderWithProviders(<AppHomePage />);

    expect(screen.queryByRole("link", { name: "View financial reports" })).not.toBeInTheDocument();
  });
});
