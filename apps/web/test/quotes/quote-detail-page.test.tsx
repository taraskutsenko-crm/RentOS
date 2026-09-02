import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QuoteDetailPage from "../../src/app/app/quotes/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "quote-1" }),
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

const useQuoteMock = vi.fn();
const useQuoteTimelineMock = vi.fn();
const useDeleteQuoteMock = vi.fn();
const useSendQuoteMock = vi.fn();
const useAcceptQuoteMock = vi.fn();
const useRejectQuoteMock = vi.fn();
const useCancelQuoteMock = vi.fn();
const useDuplicateQuoteMock = vi.fn();
const useConvertQuoteToRentalMock = vi.fn();
const useRegenerateQuotePdfMock = vi.fn();
const useQuoteEmailDeliveriesMock = vi.fn();
vi.mock("../../src/hooks/use-quotes", () => ({
  useQuote: (...args: unknown[]) => useQuoteMock(...args),
  useQuoteTimeline: (...args: unknown[]) => useQuoteTimelineMock(...args),
  useDeleteQuote: () => useDeleteQuoteMock(),
  useSendQuote: () => useSendQuoteMock(),
  useAcceptQuote: () => useAcceptQuoteMock(),
  useRejectQuote: () => useRejectQuoteMock(),
  useCancelQuote: () => useCancelQuoteMock(),
  useDuplicateQuote: () => useDuplicateQuoteMock(),
  useConvertQuoteToRental: () => useConvertQuoteToRentalMock(),
  useRegenerateQuotePdf: () => useRegenerateQuotePdfMock(),
  useQuoteEmailDeliveries: (...args: unknown[]) => useQuoteEmailDeliveriesMock(...args),
  quotePdfUrl: (tenantId: string | null, id: string) =>
    `http://api.test/tenants/${tenantId}/quotes/${id}/pdf`,
}));

function baseQuote(status: string) {
  return {
    id: "quote-1",
    quoteNumber: "Q-2026-000001",
    status,
    issueDate: "2026-08-01T00:00:00Z",
    validUntil: "2026-09-01T00:00:00Z",
    plannedStart: "2026-08-10T00:00:00Z",
    plannedEnd: "2026-08-17T00:00:00Z",
    currency: "USD",
    subtotalMinor: 3000,
    discountTotalMinor: 0,
    taxTotalMinor: 0,
    depositTotalMinor: 0,
    totalMinor: 3000,
    customerNotes: null,
    internalNotes: null,
    termsAndConditions: null,
    customer: {
      id: "customer-1",
      firstName: "Jane",
      lastName: "Doe",
      company: null,
      phone: null,
      email: null,
    },
    items: [],
    convertedRental: null,
    platformDocuments: [],
    availabilityWarnings: [],
  };
}

describe("QuoteDetailPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useQuoteTimelineMock.mockReturnValue({ data: [] });
    useDeleteQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useSendQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useAcceptQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRejectQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCancelQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useDuplicateQuoteMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useConvertQuoteToRentalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRegenerateQuotePdfMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useQuoteEmailDeliveriesMock.mockReturnValue({ data: [] });
  });

  it("renders the quote header with number, customer, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByRole("heading", { name: "Q-2026-000001" })).toBeInTheDocument();
    expect(screen.getAllByText(/jane doe/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  // Chapter 8: Customer card links to the customer's own detail page
  it("renders a Customer card linking to the customer's detail page", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("DRAFT"),
        customer: {
          id: "customer-1",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme Events Co",
          phone: "555-1234",
          email: "jane@example.com",
        },
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    const customerLink = screen.getByRole("link", { name: "Jane Doe" });
    expect(customerLink).toHaveAttribute("href", "/app/customers/customer-1");
    expect(screen.getByText("Acme Events Co")).toBeInTheDocument();
    expect(screen.getByText("555-1234")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  // Chapter 8: Smart Summary shows the real quote value/deposit/items — never fabricated
  it("shows the quote value, deposit total, and items count in the summary strip", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("DRAFT"),
        totalMinor: 12000,
        depositTotalMinor: 500,
        items: [
          {
            id: "item-1",
            itemType: "ASSET",
            assetId: "asset-1",
            name: "Generator A",
            billingMode: "DAILY",
            quantity: 1,
            discountTotalMinor: 0,
            taxTotalMinor: 0,
            lineTotalMinor: 12000,
            asset: { id: "asset-1", name: "Generator A" },
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    const quoteValueCard = screen.getByText("Quote value").closest("div");
    expect(quoteValueCard).toHaveTextContent("120");
    const depositCard = screen.getByText("Deposit total").closest("div");
    expect(depositCard).toHaveTextContent("5");
    const itemsCard = screen.getByText("Items").closest("div");
    expect(itemsCard).toHaveTextContent("1");
  });

  // Chapter 8: the items table links an asset-bound item to its asset detail page
  it("links an asset-bound item to its asset detail page", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("DRAFT"),
        items: [
          {
            id: "item-1",
            itemType: "ASSET",
            assetId: "asset-1",
            name: "Generator A",
            billingMode: "DAILY",
            quantity: 1,
            discountTotalMinor: 0,
            taxTotalMinor: 0,
            lineTotalMinor: 3000,
            asset: { id: "asset-1", name: "Generator A" },
          },
        ],
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    const assetLink = screen.getByRole("link", { name: "Generator A" });
    expect(assetLink).toHaveAttribute("href", "/app/assets/asset-1");
  });

  // Chapter 8: Documents card — honest empty state when nothing is linked
  it("shows the honest empty state in the Documents card when no converted rental or documents exist", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByText(/no documents linked to this quote yet/i)).toBeInTheDocument();
  });

  // Chapter 8: Documents card — linked platform documents, never fabricated
  it("renders linked platform documents in the Documents card", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("DRAFT"),
        platformDocuments: [
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

    renderWithProviders(<QuoteDetailPage />);

    const documentLink = screen.getByRole("link", { name: "DOC-000001" });
    expect(documentLink).toHaveAttribute("href", "/app/documents/doc-1");
  });

  it("shows the send action for a DRAFT quote when the user has quotes.send", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.send");
    useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByRole("button", { name: /send quote/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
  });

  it("shows accept/reject actions for a SENT quote when the user has those permissions", () => {
    usePermissionMock.mockImplementation(
      (permission: string) => permission === "quotes.accept" || permission === "quotes.reject",
    );
    useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByRole("button", { name: /^accept$/i })).toBeInTheDocument();
  });

  // Task 3 A3/A11 — Accept no longer fires on a single click; a
  // confirmation dialog must appear first, and the status only actually
  // changes once the user confirms it there.
  it("accepted status changes only after confirming the Accept dialog", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.accept");
    useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });
    const acceptMutateAsync = vi.fn().mockResolvedValue(undefined);
    useAcceptQuoteMock.mockReturnValue({ mutateAsync: acceptMutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<QuoteDetailPage />);
    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/customer accepted the quote/i)).toBeInTheDocument();
    expect(acceptMutateAsync).not.toHaveBeenCalled(); // not yet — only the dialog opened

    await user.click(within(dialog).getByRole("button", { name: /yes, mark as accepted/i }));

    await waitFor(() => expect(acceptMutateAsync).toHaveBeenCalledWith({ id: "quote-1" }));
  });

  // Task 3 A3/A12 — dismissing the confirmation dialog's own Cancel button
  // (not the quote's separate "Cancel quote" action) must leave the quote's
  // status untouched.
  it("cancelling the Accept confirmation dialog leaves the quote's status unchanged", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.accept");
    useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });
    const acceptMutateAsync = vi.fn().mockResolvedValue(undefined);
    useAcceptQuoteMock.mockReturnValue({ mutateAsync: acceptMutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<QuoteDetailPage />);
    await user.click(screen.getByRole("button", { name: /^accept$/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(acceptMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Sent")).toBeInTheDocument(); // status still SENT, never optimistically changed
  });

  // Task 3 A5 — "Cancel quote" also changes lifecycle, so it now requires
  // its own confirmation before firing.
  it("shows a confirmation dialog before actually cancelling the quote", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.update");
    useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });
    const cancelMutateAsync = vi.fn().mockResolvedValue(undefined);
    useCancelQuoteMock.mockReturnValue({ mutateAsync: cancelMutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<QuoteDetailPage />);
    await user.click(screen.getByRole("button", { name: /cancel quote/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/cancel this quote\?/i)).toBeInTheDocument();
    expect(cancelMutateAsync).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /^confirm$/i }));
    await waitFor(() => expect(cancelMutateAsync).toHaveBeenCalledWith({ id: "quote-1" }));
  });

  // Task 3 A6 — Delete now uses the same accessible ConfirmDialog as every
  // other destructive action instead of the native window.confirm.
  it("shows a destructive confirmation dialog before deleting the quote", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.delete");
    useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });
    const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
    useDeleteQuoteMock.mockReturnValue({ mutateAsync: deleteMutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<QuoteDetailPage />);
    await user.click(screen.getByRole("button", { name: /delete/i }));

    const dialog = await screen.findByRole("dialog");
    expect(deleteMutateAsync).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /^confirm$/i }));
    await waitFor(() => expect(deleteMutateAsync).toHaveBeenCalledWith("quote-1"));
  });

  it("shows the convert action only for an ACCEPTED quote", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.convert");
    useQuoteMock.mockReturnValue({ data: baseQuote("ACCEPTED"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByRole("button", { name: /convert to rental/i })).toBeInTheDocument();
  });

  it("hides the convert action for an ACCEPTED quote that already has a converted rental", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.convert");
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("ACCEPTED"),
        convertedRental: { id: "rental-1", rentalNumber: "RNT-000001" },
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.queryByRole("button", { name: /convert to rental/i })).not.toBeInTheDocument();
  });

  it("hides every lifecycle action when the user has no quote permissions", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.queryByRole("button", { name: /send quote/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /edit quote/i })).not.toBeInTheDocument();
  });

  it("shows the error message when a lifecycle action fails", async () => {
    usePermissionMock.mockImplementation(
      (permission: string) => permission === "quotes.duplicate",
    );
    useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });
    useDuplicateQuoteMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Something failed")),
      isPending: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<QuoteDetailPage />);
    await user.click(screen.getByRole("button", { name: /duplicate/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("shows a link to the converted rental once CONVERTED", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({
      data: {
        ...baseQuote("CONVERTED"),
        convertedRental: { id: "rental-1", rentalNumber: "RNT-000001" },
      },
      isLoading: false,
    });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByRole("link", { name: "RNT-000001" })).toHaveAttribute(
      "href",
      "/app/rentals/rental-1",
    );
  });

  // Email delivery truthfulness (production-infrastructure pass) — a
  // persisted, retryable record of each send attempt, not just an
  // audit-log line on failure.
  it("shows the truthful email delivery history for this quote", () => {
    usePermissionMock.mockReturnValue(false);
    useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });
    useQuoteEmailDeliveriesMock.mockReturnValue({
      data: [
        {
          id: "delivery-1",
          recipientEmail: "jane@example.com",
          status: "NOT_CONFIGURED",
          errorMessage: "No email provider is configured",
        },
      ],
    });

    renderWithProviders(<QuoteDetailPage />);

    expect(screen.getByText(/jane@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Not configured/)).toBeInTheDocument();
  });

  // Task 3 A2/A9/E — accessible tooltips on every quote action, truthful
  // about what each button actually does. Triggered via keyboard focus
  // here (not just mouse hover) — the same accessible path a screen-reader
  // or keyboard-only user relies on (Part E's explicit requirement).
  describe("action tooltips (keyboard-focus accessible)", () => {
    it("shows the Send quote tooltip on focus", async () => {
      usePermissionMock.mockImplementation((permission: string) => permission === "quotes.send");
      useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });
      renderWithProviders(<QuoteDetailPage />);

      screen.getByRole("button", { name: /send quote/i }).focus();

      expect(
        await screen.findByText("Send this quote to the customer by email."),
      ).toBeInTheDocument();
    });

    it("shows the Accept quote tooltip on focus", async () => {
      usePermissionMock.mockImplementation(
        (permission: string) => permission === "quotes.accept",
      );
      useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });
      renderWithProviders(<QuoteDetailPage />);

      screen.getByRole("button", { name: /^accept$/i }).focus();

      expect(
        await screen.findByText("Mark this quote as accepted by the customer."),
      ).toBeInTheDocument();
    });

    it("shows the Regenerate PDF tooltip on focus", async () => {
      usePermissionMock.mockImplementation(
        (permission: string) => permission === "quotes.download",
      );
      useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });
      renderWithProviders(<QuoteDetailPage />);

      screen.getByRole("button", { name: /regenerate pdf/i }).focus();

      expect(
        await screen.findByText("Create a new PDF from the current quote data."),
      ).toBeInTheDocument();
    });

    it("shows the Duplicate tooltip on focus", async () => {
      usePermissionMock.mockImplementation(
        (permission: string) => permission === "quotes.duplicate",
      );
      useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });
      renderWithProviders(<QuoteDetailPage />);

      screen.getByRole("button", { name: /duplicate/i }).focus();

      expect(
        await screen.findByText("Create a copy of this quote as a new draft."),
      ).toBeInTheDocument();
    });

    it("shows the Cancel quote tooltip on focus", async () => {
      usePermissionMock.mockImplementation(
        (permission: string) => permission === "quotes.update",
      );
      useQuoteMock.mockReturnValue({ data: baseQuote("SENT"), isLoading: false });
      renderWithProviders(<QuoteDetailPage />);

      screen.getByRole("button", { name: /cancel quote/i }).focus();

      expect(
        await screen.findByText("Cancel this quote without deleting its history."),
      ).toBeInTheDocument();
    });

    it("shows the Delete tooltip on focus (keyboard-focus accessible, same as mouse hover)", async () => {
      usePermissionMock.mockImplementation(
        (permission: string) => permission === "quotes.delete",
      );
      useQuoteMock.mockReturnValue({ data: baseQuote("DRAFT"), isLoading: false });
      renderWithProviders(<QuoteDetailPage />);

      screen.getByRole("button", { name: /delete/i }).focus();

      expect(await screen.findByText("Delete this quote.")).toBeInTheDocument();
    });
  });

  // Task 3 A4/A13/A14 — Send quote opens a real compose flow instead of
  // firing an email on a single click.
  describe("Send quote email dialog", () => {
    function sentQuoteWithEmail() {
      return {
        ...baseQuote("DRAFT"),
        customer: {
          id: "customer-1",
          firstName: "Jane",
          lastName: "Doe",
          company: null,
          phone: null,
          email: "jane@example.com",
        },
      };
    }

    it("opens a compose dialog showing the real recipient, message field, and attachment note", async () => {
      usePermissionMock.mockImplementation((permission: string) => permission === "quotes.send");
      useQuoteMock.mockReturnValue({ data: sentQuoteWithEmail(), isLoading: false });
      const user = userEvent.setup();
      renderWithProviders(<QuoteDetailPage />);

      await user.click(screen.getByRole("button", { name: /send quote/i }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByDisplayValue("jane@example.com")).toBeInTheDocument();
      expect(within(dialog).getByText(/will be attached automatically/i)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^send$/i })).toBeInTheDocument();
    });

    it("sends with the edited recipient and message, and reports the real delivery outcome", async () => {
      usePermissionMock.mockImplementation((permission: string) => permission === "quotes.send");
      useQuoteMock.mockReturnValue({ data: sentQuoteWithEmail(), isLoading: false });
      const sendMutateAsync = vi.fn().mockResolvedValue({ emailSent: true });
      useSendQuoteMock.mockReturnValue({ mutateAsync: sendMutateAsync, isPending: false });
      const user = userEvent.setup();
      renderWithProviders(<QuoteDetailPage />);

      await user.click(screen.getByRole("button", { name: /send quote/i }));
      const dialog = await screen.findByRole("dialog");
      const recipientInput = within(dialog).getByLabelText(/recipient email/i);
      await user.clear(recipientInput);
      await user.type(recipientInput, "other@example.com");
      await user.type(within(dialog).getByLabelText(/message/i), "Please review");
      await user.click(within(dialog).getByRole("button", { name: /^send$/i }));

      await waitFor(() =>
        expect(sendMutateAsync).toHaveBeenCalledWith({
          id: "quote-1",
          recipientEmail: "other@example.com",
          message: "Please review",
        }),
      );
      expect(
        await within(dialog).findByText("Email sent to other@example.com."),
      ).toBeInTheDocument();
    });

    // Task 3 A14 / Part C — a NOT_CONFIGURED delivery must show a truthful,
    // localized "not configured" message, never the raw backend string
    // leaked straight to the user.
    it("shows a truthful, translated message (never raw backend text) when email isn't configured", async () => {
      usePermissionMock.mockImplementation((permission: string) => permission === "quotes.send");
      useQuoteMock.mockReturnValue({ data: sentQuoteWithEmail(), isLoading: false });
      const sendMutateAsync = vi.fn().mockResolvedValue({
        emailSent: false,
        emailError: "No email provider is configured",
      });
      useSendQuoteMock.mockReturnValue({ mutateAsync: sendMutateAsync, isPending: false });
      const user = userEvent.setup();
      renderWithProviders(<QuoteDetailPage />);

      await user.click(screen.getByRole("button", { name: /send quote/i }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /^send$/i }));

      expect(
        await within(dialog).findByText(/isn.t configured for this workspace yet/i),
      ).toBeInTheDocument();
      expect(within(dialog).queryByText("No email provider is configured")).not.toBeInTheDocument();
    });
  });
});
