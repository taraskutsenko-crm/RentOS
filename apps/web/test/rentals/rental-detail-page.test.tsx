import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RentalDetailPage from "../../src/app/app/rentals/[id]/page";
import { formatMoney } from "../../src/lib/money";
import { renderWithProviders } from "../test-utils";

/**
 * formatMoney's Intl output can contain locale-specific whitespace (e.g. a
 * narrow no-break space) that differs from a plain ASCII space once
 * jest-dom's toHaveTextContent normalizes DOM whitespace — build a
 * whitespace-tolerant regex instead of comparing raw strings.
 */
function moneyPattern(minor: number, currency: string): RegExp {
  const escaped = formatMoney(minor, currency).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\s+/g, "\\s*"));
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "rental-1" }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
  useTenantTimezone: () => undefined,
}));

const useRentalMock = vi.fn();
const useRentalTimelineMock = vi.fn();
const useDeleteRentalMock = vi.fn();
const useReserveRentalMock = vi.fn();
const useStartRentalMock = vi.fn();
const useReturnRentalMock = vi.fn();
const useCancelRentalMock = vi.fn();
vi.mock("../../src/hooks/use-rentals", () => ({
  useRental: (...args: unknown[]) => useRentalMock(...args),
  useRentalTimeline: (...args: unknown[]) => useRentalTimelineMock(...args),
  useDeleteRental: () => useDeleteRentalMock(),
  useReserveRental: () => useReserveRentalMock(),
  useStartRental: () => useStartRentalMock(),
  useReturnRental: () => useReturnRentalMock(),
  useCancelRental: () => useCancelRentalMock(),
}));

function baseRental(status: string) {
  return {
    id: "rental-1",
    rentalNumber: "RNT-000001",
    status,
    plannedStart: "2026-08-01T00:00:00Z",
    plannedEnd: "2026-08-04T00:00:00Z",
    actualStart: null,
    actualEnd: null,
    currency: "USD",
    subtotalMinor: 3000,
    discountMinor: 0,
    taxMinor: 0,
    totalMinor: 3000,
    notes: null,
    internalNotes: null,
    sourceQuoteId: null,
    customer: {
      id: "customer-1",
      firstName: "Jane",
      lastName: "Doe",
      company: null,
      phone: null,
      email: null,
    },
    items: [],
    sourceQuote: null,
    documents: [],
  };
}

describe("RentalDetailPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useRentalTimelineMock.mockReturnValue({ data: [] });
    useDeleteRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useReserveRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useStartRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useReturnRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCancelRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders the rental header with number, customer, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({ data: baseRental("DRAFT"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByRole("heading", { name: "RNT-000001" })).toBeInTheDocument();
    expect(screen.getAllByText(/jane doe/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  // Chapter 7: Customer card links to the customer's own detail page
  it("renders a Customer card linking to the customer's detail page", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({
      data: {
        ...baseRental("DRAFT"),
        customer: {
          id: "customer-1",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme Co",
          phone: "555-1234",
          email: "jane@example.com",
        },
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    const customerLink = screen.getByRole("link", { name: "Jane Doe" });
    expect(customerLink).toHaveAttribute("href", "/app/customers/customer-1");
    expect(screen.getByText("Acme Co")).toBeInTheDocument();
    expect(screen.getByText("555-1234")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  // Chapter 7: Smart Summary shows the real rental value and asset count — never fabricated
  it("shows the rental value, asset count, and total deposit in the summary strip", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({
      data: {
        ...baseRental("DRAFT"),
        totalMinor: 12000,
        items: [
          {
            id: "item-1",
            billingMode: "DAILY",
            quantity: 1,
            dailyPriceMinor: 1000,
            weeklyPriceMinor: null,
            monthlyPriceMinor: null,
            customPriceMinor: null,
            monthlyBillingStrategy: null,
            customMonthLengthDays: null,
            discountMinor: 0,
            depositMinor: 500,
            returnedAt: null,
            asset: {
              id: "asset-1",
              name: "Generator A",
              currentStatus: { name: "Available", isAvailableForRental: true },
            },
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    const rentalValueCard = screen.getByText("Rental value").closest("div");
    expect(rentalValueCard).toHaveTextContent(moneyPattern(12000, "USD"));

    const depositCard = screen.getByText("Total deposit").closest("div");
    expect(depositCard).toHaveTextContent(moneyPattern(500, "USD"));

    const assetsCard = screen.getByText("Asset count").closest("div");
    expect(assetsCard).toHaveTextContent("1");
  });

  // Chapter 7: the Assets card links each item to its asset and shows the asset's own status
  it("links each rental item to its asset detail page and shows the asset's status", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({
      data: {
        ...baseRental("DRAFT"),
        items: [
          {
            id: "item-1",
            billingMode: "DAILY",
            quantity: 1,
            dailyPriceMinor: 1000,
            weeklyPriceMinor: null,
            monthlyPriceMinor: null,
            customPriceMinor: null,
            monthlyBillingStrategy: null,
            customMonthLengthDays: null,
            discountMinor: 0,
            depositMinor: 0,
            returnedAt: null,
            asset: {
              id: "asset-1",
              name: "Generator A",
              currentStatus: { name: "Rented out", isAvailableForRental: false },
            },
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    const assetLink = screen.getByRole("link", { name: "Generator A" });
    expect(assetLink).toHaveAttribute("href", "/app/assets/asset-1");
    expect(screen.getByText("Rented out")).toBeInTheDocument();
  });

  // Chapter 7: Documents card — honest empty state when nothing is linked
  it("shows the honest empty state in the Documents card when no source quote or documents exist", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({ data: baseRental("DRAFT"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByText(/no documents linked to this rental yet/i)).toBeInTheDocument();
  });

  // Chapter 7: Documents card — source quote and linked documents, never fabricated
  it("renders the source quote and linked documents when they exist", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({
      data: {
        ...baseRental("DRAFT"),
        sourceQuote: { id: "quote-1", quoteNumber: "Q-2026-000001" },
        documents: [
          {
            id: "doc-1",
            documentType: "CONTRACT",
            customTypeName: null,
            documentNumber: "DOC-000001",
            status: "SENT",
            title: null,
            createdAt: "2026-08-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    const quoteLink = screen.getByRole("link", { name: "Q-2026-000001" });
    expect(quoteLink).toHaveAttribute("href", "/app/quotes/quote-1");
    const documentLink = screen.getByRole("link", { name: "DOC-000001" });
    expect(documentLink).toHaveAttribute("href", "/app/documents/doc-1");
  });

  // Chapter 9: Document checklist — derived intelligence, never fabricated completion
  it("renders the document checklist reflecting real linked documents and rental status", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({
      data: {
        ...baseRental("ACTIVE"),
        sourceQuote: { id: "quote-1", quoteNumber: "Q-2026-000001" },
        documents: [
          {
            id: "doc-1",
            documentType: "CONTRACT",
            customTypeName: null,
            documentNumber: "CON-000001",
            status: "SIGNED",
            title: null,
            createdAt: "2026-08-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    const checklistCard = screen.getByText("Document checklist").closest("div")
      ?.parentElement as HTMLElement;
    const checklist = within(checklistCard);

    expect(checklist.getByText("Commercial offer")).toBeInTheDocument();
    expect(checklist.getByText("Rental contract")).toBeInTheDocument();
    expect(checklist.getByText("Handover protocol")).toBeInTheDocument();
    expect(checklist.getAllByText("Linked")).toHaveLength(2); // commercial offer + contract
    expect(checklist.getByText("Missing")).toBeInTheDocument(); // handover protocol, since ACTIVE
  });

  it("omits the document checklist card for a CANCELLED rental", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({ data: baseRental("CANCELLED"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.queryByText("Document checklist")).not.toBeInTheDocument();
  });

  // 8. Status change / workflow test: only shows the reserve action for a DRAFT rental
  it("shows the reserve action for a DRAFT rental when the user has rentals.reserve", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "rentals.reserve");
    useRentalMock.mockReturnValue({ data: baseRental("DRAFT"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByRole("button", { name: /reserve/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /start rental/i })).not.toBeInTheDocument();
  });

  it("shows the start action for a RESERVED rental when the user has rentals.start", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "rentals.start");
    useRentalMock.mockReturnValue({ data: baseRental("RESERVED"), isLoading: false });
    const startMutateAsync = vi.fn().mockResolvedValue(undefined);
    useStartRentalMock.mockReturnValue({ mutateAsync: startMutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<RentalDetailPage />);
    await user.click(screen.getByRole("button", { name: /start rental/i }));

    await waitFor(() => expect(startMutateAsync).toHaveBeenCalledWith({ id: "rental-1" }));
  });

  it("shows the return action for an ACTIVE rental", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "rentals.return");
    useRentalMock.mockReturnValue({ data: baseRental("ACTIVE"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByRole("button", { name: /return all/i })).toBeInTheDocument();
  });

  // Pre-Chapter 10 workflow continuity: PageHeader primary action derived
  // from getRentalNextAction, never fabricating a step with no backend
  // capability.
  it("shows Generate contract as the primary action when no contract is linked yet", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "documents.create");
    useRentalMock.mockReturnValue({ data: baseRental("DRAFT"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    const link = screen.getByRole("link", { name: "Generate contract" });
    expect(link).toHaveAttribute(
      "href",
      "/app/documents/new?rentalId=rental-1&documentType=CONTRACT",
    );
  });

  it("shows Prepare handover protocol as the primary action once ACTIVE with a contract but no handover protocol", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "documents.create");
    useRentalMock.mockReturnValue({
      data: {
        ...baseRental("ACTIVE"),
        documents: [
          {
            id: "doc-1",
            documentType: "CONTRACT",
            customTypeName: null,
            documentNumber: "CON-000001",
            status: "SIGNED",
            title: null,
            createdAt: "2026-08-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    const link = screen.getByRole("link", { name: "Prepare handover protocol" });
    expect(link).toHaveAttribute(
      "href",
      "/app/documents/new?rentalId=rental-1&documentType=HANDOVER_PROTOCOL",
    );
  });

  it("shows Return all as the primary action (and not duplicated in secondary actions) once ACTIVE with contract and handover protocol both present", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "rentals.return");
    useRentalMock.mockReturnValue({
      data: {
        ...baseRental("ACTIVE"),
        documents: [
          {
            id: "doc-1",
            documentType: "CONTRACT",
            customTypeName: null,
            documentNumber: "CON-000001",
            status: "SIGNED",
            title: null,
            createdAt: "2026-08-01T00:00:00Z",
          },
          {
            id: "doc-2",
            documentType: "HANDOVER_PROTOCOL",
            customTypeName: null,
            documentNumber: "HND-000001",
            status: "SIGNED",
            title: null,
            createdAt: "2026-08-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getAllByRole("button", { name: /return all/i })).toHaveLength(1);
  });

  // 9. Permission-based controls: no action buttons without any permission
  it("hides every lifecycle action when the user has no rental permissions", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({ data: baseRental("RESERVED"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.queryByRole("button", { name: /start rental/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel rental/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /edit rental/i })).not.toBeInTheDocument();
  });

  // 10. Error display
  it("shows the error message when a lifecycle action fails", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "rentals.reserve");
    useRentalMock.mockReturnValue({ data: baseRental("DRAFT"), isLoading: false });
    useReserveRentalMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Cannot reserve a rental with no items")),
      isPending: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<RentalDetailPage />);
    await user.click(screen.getByRole("button", { name: /reserve/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
