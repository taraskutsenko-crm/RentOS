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
const useRentalDepositMock = vi.fn();
const useRecordDepositReceiptMock = vi.fn();
const useRecordDepositReturnMock = vi.fn();
vi.mock("../../src/hooks/use-rentals", () => ({
  useRental: (...args: unknown[]) => useRentalMock(...args),
  useRentalTimeline: (...args: unknown[]) => useRentalTimelineMock(...args),
  useDeleteRental: () => useDeleteRentalMock(),
  useReserveRental: () => useReserveRentalMock(),
  useStartRental: () => useStartRentalMock(),
  useReturnRental: () => useReturnRentalMock(),
  useCancelRental: () => useCancelRentalMock(),
  useRentalDeposit: (...args: unknown[]) => useRentalDepositMock(...args),
  useRecordDepositReceipt: () => useRecordDepositReceiptMock(),
  useRecordDepositReturn: () => useRecordDepositReturnMock(),
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
    isOverdue: false,
    overdueSince: null,
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
    useRentalDepositMock.mockReturnValue({ data: null });
    useRecordDepositReceiptMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRecordDepositReturnMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders the rental header with number, customer, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({ data: baseRental("DRAFT"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByRole("heading", { name: "RNT-000001" })).toBeInTheDocument();
    expect(screen.getAllByText(/jane doe/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  // Regression coverage for the exact real case found in live data
  // ("Agregat Honda"): the rental detail page must show a clear overdue
  // warning banner whenever the backend reports isOverdue — never silently
  // treat a past plannedEnd as "returned."
  it("shows a 'Return overdue' warning banner when the rental is overdue, with the planned return date/time", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({
      data: {
        ...baseRental("ACTIVE"),
        plannedEnd: "2026-08-27T15:00:00Z",
        isOverdue: true,
        overdueSince: "2026-08-27T15:00:00Z",
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.getByText("Return overdue")).toBeInTheDocument();
    expect(screen.getByText(/planned return/i)).toBeInTheDocument();
  });

  it("does not show the overdue banner for a rental that is not overdue", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({ data: baseRental("ACTIVE"), isLoading: false });

    renderWithProviders(<RentalDetailPage />);

    expect(screen.queryByText("Return overdue")).not.toBeInTheDocument();
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
              internalNumber: "GEN-0001",
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

  // Regression: the Financial summary must show an explicit "amount due at
  // start" (rental total + refundable deposit), kept visually distinct from
  // Total -- a refundable deposit is never rental revenue (see
  // DECISIONS.md D-097). Uses the task's own acceptance figures: 200 net +
  // 46 VAT = 246 rental total, 700 refundable deposit, 946 amount due.
  it("shows an explicit amount-due-at-start figure separate from the taxable rental total", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalMock.mockReturnValue({
      data: {
        ...baseRental("DRAFT"),
        subtotalMinor: 20000,
        taxMinor: 4600,
        totalMinor: 24600,
        items: [
          {
            id: "item-1",
            billingMode: "DAILY",
            quantity: 1,
            dailyPriceMinor: 5000,
            weeklyPriceMinor: null,
            monthlyPriceMinor: null,
            customPriceMinor: null,
            monthlyBillingStrategy: null,
            customMonthLengthDays: null,
            discountMinor: 0,
            depositMinor: 70000,
            returnedAt: null,
            asset: {
              id: "asset-1",
              name: "Skoda Fabia",
              internalNumber: "SK977UG",
              currentStatus: { name: "Available", isAvailableForRental: true },
            },
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    const financialCard = screen.getByText("Financial summary").closest("div")
      ?.parentElement as HTMLElement;
    const financial = within(financialCard);
    expect(financial.getByText(moneyPattern(24600, "USD"))).toBeInTheDocument(); // rental total
    expect(financial.getByText(moneyPattern(94600, "USD"))).toBeInTheDocument(); // amount due
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
              internalNumber: "GEN-0001",
              currentStatus: { name: "Rented out", isAvailableForRental: false },
            },
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<RentalDetailPage />);

    const assetLink = screen.getByRole("link", { name: "Generator A — GEN-0001" });
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

    // Scoped to the "Documents" card specifically -- the Document checklist
    // card (asserted separately) now also links the same source quote and
    // document, by design (see the checklist regression test above).
    const documentsCard = screen.getByText("Documents").closest("div")
      ?.parentElement as HTMLElement;
    const documentsSection = within(documentsCard);

    const quoteLink = documentsSection.getByRole("link", { name: "Q-2026-000001" });
    expect(quoteLink).toHaveAttribute("href", "/app/quotes/quote-1");
    const documentLink = documentsSection.getByRole("link", { name: "DOC-000001" });
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
    // Commercial offer: sourceQuote exists but no QUOTE document was ever
    // generated -- links to the source quote itself, not a fabricated "Linked".
    const quoteLink = checklist.getByRole("link", { name: "Q-2026-000001" });
    expect(quoteLink).toHaveAttribute("href", "/app/quotes/quote-1");
    // Rental contract: a real signed CONTRACT document -- links straight to it.
    const contractLink = checklist.getByRole("link", { name: "CON-000001" });
    expect(contractLink).toHaveAttribute("href", "/app/documents/doc-1");
    // Handover protocol AND Return protocol: ACTIVE with no document yet
    // (a Return Protocol may now be prepared as soon as the rental is
    // ACTIVE, not only once already RETURNED -- see DECISIONS.md), but no
    // create permission -- plain "ready to generate" text, not a Generate link.
    expect(checklist.getAllByText("Ready to generate")).toHaveLength(2);
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
