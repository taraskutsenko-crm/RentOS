import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuoteWizard } from "../../src/components/quotes/quote-wizard";
import type * as UseRentalsModule from "../../src/hooks/use-rentals";
import { renderWithProviders } from "../test-utils";

const useCustomersMock = vi.fn();
vi.mock("../../src/hooks/use-customers", () => ({
  useCustomers: (...args: unknown[]) => useCustomersMock(...args),
}));

const useAssetsMock = vi.fn();
vi.mock("../../src/hooks/use-assets", () => ({
  useAssets: (...args: unknown[]) => useAssetsMock(...args),
}));

const useAvailabilityMock = vi.fn();
vi.mock("../../src/hooks/use-rentals", async () => {
  const actual = await vi.importActual<typeof UseRentalsModule>("../../src/hooks/use-rentals");
  return { ...actual, useAvailability: (...args: unknown[]) => useAvailabilityMock(...args) };
});

const useRentalBillingSettingsMock = vi.fn();
vi.mock("../../src/hooks/use-rental-billing-settings", () => ({
  useRentalBillingSettings: (...args: unknown[]) => useRentalBillingSettingsMock(...args),
}));

function setup() {
  useCustomersMock.mockReturnValue({
    data: { items: [{ id: "cust-1", firstName: "Jane", lastName: "Doe", company: null }] },
  });
  useAssetsMock.mockReturnValue({
    data: { items: [{ id: "asset-1", name: "Generator A", internalNumber: "GEN-0001" }] },
  });
  useAvailabilityMock.mockReturnValue({ data: undefined });
  useRentalBillingSettingsMock.mockReturnValue({
    data: { monthlyBillingStrategy: "CALENDAR_MONTH", customMonthLengthDays: null },
  });
}

async function goToStep(user: ReturnType<typeof userEvent.setup>, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await user.click(screen.getByRole("button", { name: /next/i }));
  }
}

describe("QuoteWizard", () => {
  it("renders customers on the customer step", () => {
    setup();
    renderWithProviders(<QuoteWizard tenantId="tenant-1" onSubmit={vi.fn()} isPending={false} />);

    expect(screen.getByText(/jane doe/i)).toBeInTheDocument();
  });

  it("blocks advancing past the customer step without selecting one", async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(<QuoteWizard tenantId="tenant-1" onSubmit={vi.fn()} isPending={false} />);

    await user.click(screen.getByRole("button", { name: /next/i }));

    // still on the customer step — the dates step's fields aren't shown yet
    expect(screen.queryByLabelText(/valid until/i)).not.toBeInTheDocument();
  });

  it("shows assets on the assets step after selecting a customer and dates", async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(
      <QuoteWizard
        tenantId="tenant-1"
        onSubmit={vi.fn()}
        isPending={false}
        initialValues={{
          plannedStart: "2026-08-01T00:00",
          plannedEnd: "2026-08-04T00:00",
          validUntil: "2026-09-01T00:00",
        }}
      />,
    );

    await user.click(screen.getByLabelText("Jane Doe"));
    await user.click(screen.getByRole("button", { name: /next/i })); // -> dates
    await user.click(screen.getByRole("button", { name: /next/i })); // -> assets

    expect(await screen.findByText(/generator a/i)).toBeInTheDocument();
  });

  it("adds a non-asset service line item on the services step", async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(
      <QuoteWizard
        tenantId="tenant-1"
        onSubmit={vi.fn()}
        isPending={false}
        initialValues={{
          plannedStart: "2026-08-01T00:00",
          plannedEnd: "2026-08-04T00:00",
          validUntil: "2026-09-01T00:00",
        }}
      />,
    );

    await user.click(screen.getByLabelText("Jane Doe"));
    await goToStep(user, 3); // -> dates -> assets -> services

    await user.click(screen.getByRole("button", { name: /add product or service/i }));

    expect(screen.queryByText(/no products or services added yet/i)).not.toBeInTheDocument();
  });

  it("shows a daily-price field and the CALENDAR_MONTH breakdown for a MONTHLY asset item", async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(
      <QuoteWizard
        tenantId="tenant-1"
        onSubmit={vi.fn()}
        isPending={false}
        initialValues={{
          plannedStart: "2031-01-15T00:00",
          plannedEnd: "2031-03-20T00:00",
          validUntil: "2031-04-01T00:00",
        }}
      />,
    );

    await user.click(screen.getByLabelText("Jane Doe"));
    await goToStep(user, 2); // -> dates -> assets

    await user.click(await screen.findByRole("checkbox"));
    await goToStep(user, 2); // -> services -> pricing

    const billingModeSelect = screen.getByDisplayValue(/daily/i);
    await user.selectOptions(billingModeSelect, "MONTHLY");

    expect(screen.getByText(/daily price \(for remaining days\)/i)).toBeInTheDocument();
    expect(await screen.findByText(/2 calendar months × .*5 days ×/i)).toBeInTheDocument();
  });

  // Regression: found via manual browser QA on rental-wizard.tsx's
  // identical pattern -- the tenant's default currency (fetched async)
  // often isn't loaded yet at the moment this wizard first mounts. Since
  // react-hook-form only reads `defaultValues` once, at initialization, a
  // still-`undefined` defaultCurrency at that instant used to leave the
  // currency field permanently blank for the rest of the form's life.
  it("fills in the currency once defaultCurrency arrives after the initial render", async () => {
    setup();
    const user = userEvent.setup();
    const initialValues = {
      plannedStart: "2031-01-15T00:00",
      plannedEnd: "2031-03-20T00:00",
      validUntil: "2031-04-01T00:00",
    };
    const { rerender } = renderWithProviders(
      <QuoteWizard
        tenantId="tenant-1"
        defaultCurrency={undefined}
        onSubmit={vi.fn()}
        isPending={false}
        initialValues={initialValues}
      />,
    );

    // The tenant role query resolves after mount, now supplying a real currency.
    rerender(
      <QuoteWizard
        tenantId="tenant-1"
        defaultCurrency="PLN"
        onSubmit={vi.fn()}
        isPending={false}
        initialValues={initialValues}
      />,
    );

    await user.click(screen.getByLabelText("Jane Doe"));
    await goToStep(user, 2); // -> dates -> assets
    await user.click(await screen.findByRole("checkbox"));
    await goToStep(user, 2); // -> services -> pricing

    expect(await screen.findByDisplayValue("PLN")).toBeInTheDocument();
  });

  describe("MONTHLY pricing validation before Review (manual-testing bug fix)", () => {
    async function reachMonthlyPricingStep(
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<void> {
      renderWithProviders(
        <QuoteWizard
          tenantId="tenant-1"
          onSubmit={vi.fn()}
          isPending={false}
          initialValues={{
            plannedStart: "2031-01-15T00:00",
            plannedEnd: "2031-03-20T00:00",
            validUntil: "2031-04-01T00:00",
          }}
        />,
      );

      await user.click(screen.getByLabelText("Jane Doe"));
      await goToStep(user, 2); // -> dates -> assets
      await user.click(await screen.findByRole("checkbox"));
      await goToStep(user, 2); // -> services -> pricing

      const billingModeSelect = screen.getByDisplayValue(/daily/i);
      await user.selectOptions(billingModeSelect, "MONTHLY");
    }

    it("blocks advancing past Prices when a MONTHLY item's daily rate for the partial month is left blank, and shows a localized error instead of the internal field name", async () => {
      setup();
      const user = userEvent.setup();
      await reachMonthlyPricingStep(user);

      // Fill only the monthly price, leave the daily-remainder rate blank.
      const spinbuttons = screen.getAllByRole("spinbutton");
      await user.type(spinbuttons[1]!, "500");

      await user.click(screen.getByRole("button", { name: /next/i }));

      // Still on Prices — the Terms step's field never appears.
      expect(screen.queryByLabelText(/customer notes/i)).not.toBeInTheDocument();

      // Human-readable, localized error — never the raw backend field name.
      expect(screen.getByText("Daily price (for remaining days) is required")).toBeInTheDocument();
      expect(screen.queryByText(/dailyPriceMinor/)).not.toBeInTheDocument();
    });

    it("allows advancing past Prices once both the monthly price and the daily remainder rate are filled in", async () => {
      setup();
      const user = userEvent.setup();
      await reachMonthlyPricingStep(user);

      const spinbuttons = screen.getAllByRole("spinbutton");
      await user.type(spinbuttons[1]!, "500"); // monthly price
      await user.type(spinbuttons[2]!, "20"); // daily rate for remainder

      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(await screen.findByLabelText(/customer notes/i)).toBeInTheDocument();
    });
  });

  describe("partial-month billing policy selector (D-072)", () => {
    it("defaults a new MONTHLY item to the tenant's configured partial-month policy", async () => {
      setup();
      useRentalBillingSettingsMock.mockReturnValue({
        data: {
          monthlyBillingStrategy: "CALENDAR_MONTH",
          customMonthLengthDays: null,
          partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
        },
      });
      const user = userEvent.setup();
      renderWithProviders(
        <QuoteWizard
          tenantId="tenant-1"
          onSubmit={vi.fn()}
          isPending={false}
          initialValues={{
            plannedStart: "2031-01-15T00:00",
            plannedEnd: "2031-03-20T00:00",
            validUntil: "2031-04-01T00:00",
          }}
        />,
      );

      await user.click(screen.getByLabelText("Jane Doe"));
      await goToStep(user, 2); // -> dates -> assets
      await user.click(await screen.findByRole("checkbox"));
      await goToStep(user, 2); // -> services -> pricing

      const billingModeSelect = screen.getByDisplayValue(/daily/i);
      await user.selectOptions(billingModeSelect, "MONTHLY");

      // Rounds up to a full month by default — no daily remainder field shown.
      expect(screen.getByDisplayValue("Charge started month as full month")).toBeInTheDocument();
      expect(screen.queryByText(/daily price \(for remaining days\)/i)).not.toBeInTheDocument();
    });

    it("switching to 'charge proportionally by day' shows the daily remainder field and requires it before Review", async () => {
      setup();
      useRentalBillingSettingsMock.mockReturnValue({
        data: {
          monthlyBillingStrategy: "CALENDAR_MONTH",
          customMonthLengthDays: null,
          partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
        },
      });
      const user = userEvent.setup();
      renderWithProviders(
        <QuoteWizard
          tenantId="tenant-1"
          onSubmit={vi.fn()}
          isPending={false}
          initialValues={{
            plannedStart: "2031-01-15T00:00",
            plannedEnd: "2031-03-20T00:00",
            validUntil: "2031-04-01T00:00",
          }}
        />,
      );

      await user.click(screen.getByLabelText("Jane Doe"));
      await goToStep(user, 2); // -> dates -> assets
      await user.click(await screen.findByRole("checkbox"));
      await goToStep(user, 2); // -> services -> pricing

      const billingModeSelect = screen.getByDisplayValue(/daily/i);
      await user.selectOptions(billingModeSelect, "MONTHLY");

      const policySelect = screen.getByDisplayValue("Charge started month as full month");
      await user.selectOptions(policySelect, "PRORATE_BY_DAY");

      expect(await screen.findByText(/daily price \(for remaining days\)/i)).toBeInTheDocument();

      // Fill only the monthly price, leave the now-required daily remainder blank.
      const spinbuttons = screen.getAllByRole("spinbutton");
      await user.type(spinbuttons[1]!, "600");
      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(screen.getByText("Daily price (for remaining days) is required")).toBeInTheDocument();
    });

    it("ROUND_UP_TO_FULL_MONTH never blocks advancing past Prices, even with no daily-price value entered", async () => {
      setup();
      useRentalBillingSettingsMock.mockReturnValue({
        data: {
          monthlyBillingStrategy: "CALENDAR_MONTH",
          customMonthLengthDays: null,
          partialMonthPolicy: "ROUND_UP_TO_FULL_MONTH",
        },
      });
      const user = userEvent.setup();
      renderWithProviders(
        <QuoteWizard
          tenantId="tenant-1"
          onSubmit={vi.fn()}
          isPending={false}
          initialValues={{
            plannedStart: "2031-01-15T00:00",
            plannedEnd: "2031-03-20T00:00",
            validUntil: "2031-04-01T00:00",
          }}
        />,
      );

      await user.click(screen.getByLabelText("Jane Doe"));
      await goToStep(user, 2); // -> dates -> assets
      await user.click(await screen.findByRole("checkbox"));
      await goToStep(user, 2); // -> services -> pricing

      const billingModeSelect = screen.getByDisplayValue(/daily/i);
      await user.selectOptions(billingModeSelect, "MONTHLY");

      const spinbuttons = screen.getAllByRole("spinbutton");
      await user.type(spinbuttons[1]!, "600"); // monthly price only

      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(await screen.findByLabelText(/customer notes/i)).toBeInTheDocument();
    });
  });
});
