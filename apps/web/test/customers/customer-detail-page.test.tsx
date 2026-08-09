import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CustomerDetailPage from "../../src/app/app/customers/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "customer-1" }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const useCustomerMock = vi.fn();
const useCustomerSummaryMock = vi.fn();
const useCustomerTimelineMock = vi.fn();
const useUpdateCustomerMock = vi.fn();
vi.mock("../../src/hooks/use-customers", () => ({
  useCustomer: (...args: unknown[]) => useCustomerMock(...args),
  useCustomerSummary: (...args: unknown[]) => useCustomerSummaryMock(...args),
  useCustomerTimeline: (...args: unknown[]) => useCustomerTimelineMock(...args),
  useUpdateCustomer: () => useUpdateCustomerMock(),
}));

vi.mock("../../src/hooks/use-recent-items", () => ({
  useTrackRecentItem: () => vi.fn(),
}));

vi.mock("../../src/components/customers/customer-form", () => ({
  CustomerForm: () => <div>customer-form</div>,
}));

vi.mock("../../src/components/customers/customer-portal-panel", () => ({
  CustomerPortalPanel: () => <div>customer-portal-panel</div>,
}));

const baseCustomer = {
  id: "customer-1",
  firstName: "Jane",
  lastName: "Doe",
  company: "Acme Inc",
  phone: null,
  email: null,
  vatNumber: null,
  address: null,
  notes: null,
  status: "ACTIVE" as const,
  documents: [],
};

describe("CustomerDetailPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useUpdateCustomerMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
    });
    useCustomerTimelineMock.mockReturnValue({ data: [] });
  });

  it("renders a real page header with the customer's name — not just an edit form", () => {
    useCustomerMock.mockReturnValue({ data: baseCustomer, isLoading: false });
    useCustomerSummaryMock.mockReturnValue({ data: undefined });

    renderWithProviders(<CustomerDetailPage />);

    expect(screen.getByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();
  });

  it("renders the Documents card with an honest empty state, and lists real linked documents", () => {
    useCustomerMock.mockReturnValue({ data: baseCustomer, isLoading: false });
    useCustomerSummaryMock.mockReturnValue({ data: undefined });

    const { unmount } = renderWithProviders(<CustomerDetailPage />);
    expect(screen.getByText(/no documents linked to this customer yet/i)).toBeInTheDocument();
    unmount();

    useCustomerMock.mockReturnValue({
      data: {
        ...baseCustomer,
        documents: [
          {
            id: "doc-1",
            documentType: "CONTRACT",
            customTypeName: null,
            documentNumber: "CON-000001",
            status: "DRAFT",
            title: null,
            createdAt: "2026-08-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<CustomerDetailPage />);
    expect(screen.getByRole("link", { name: "CON-000001" })).toHaveAttribute(
      "href",
      "/app/documents/doc-1",
    );
  });

  it("shows real summary numbers once loaded", () => {
    useCustomerMock.mockReturnValue({ data: baseCustomer, isLoading: false });
    useCustomerSummaryMock.mockReturnValue({
      data: {
        customerSince: "2025-01-01T00:00:00.000Z",
        totalRentals: 4,
        activeRentals: 1,
        totalRevenueMinor: 12345,
        currency: "USD",
        lastActivityAt: "2026-01-01T00:00:00.000Z",
        damageReportsCount: 2,
      },
    });

    renderWithProviders(<CustomerDetailPage />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
