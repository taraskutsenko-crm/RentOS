import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RentalWizard } from "../../src/components/rentals/rental-wizard";
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

describe("RentalWizard", () => {
  // 4. Dynamic customer/asset step content
  it("renders customers on step 1 and assets on step 2", async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(<RentalWizard tenantId="tenant-1" onSubmit={vi.fn()} isPending={false} />);

    expect(screen.getByText(/jane doe/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Jane Doe"));
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText(/generator a/i)).toBeInTheDocument();
  });

  // 3. Create form validation: cannot advance past step 1 without a customer
  it("blocks advancing to the next step without selecting a customer", async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(<RentalWizard tenantId="tenant-1" onSubmit={vi.fn()} isPending={false} />);

    await user.click(screen.getByRole("button", { name: /next/i }));

    // still on the customer step — assets are not shown yet
    expect(screen.queryByText(/generator a/i)).not.toBeInTheDocument();
  });

  // 5. Required field validation: cannot advance past the assets step with none selected
  it("shows a hint and blocks advancing when no assets are selected", async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(<RentalWizard tenantId="tenant-1" onSubmit={vi.fn()} isPending={false} />);

    await user.click(screen.getByLabelText("Jane Doe"));
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText(/generator a/i)).toBeInTheDocument();

    expect(screen.getByText(/select at least one asset/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next/i }));
    // still on the assets step
    expect(screen.getByText(/generator a/i)).toBeInTheDocument();
  });

  // 10. Error display
  it("shows the backend error message when provided", () => {
    setup();
    renderWithProviders(
      <RentalWizard
        tenantId="tenant-1"
        onSubmit={vi.fn()}
        isPending={false}
        errorMessage="Something went wrong"
      />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows a daily-price field and the CALENDAR_MONTH breakdown for a MONTHLY item", async () => {
    setup();
    const user = userEvent.setup();
    renderWithProviders(
      <RentalWizard
        tenantId="tenant-1"
        initialValues={{
          customerId: "cust-1",
          plannedStart: "2026-01-15T00:00",
          plannedEnd: "2026-03-20T00:00",
        }}
        initialItems={[
          {
            assetId: "asset-1",
            billingMode: "MONTHLY",
            quantity: 1,
            dailyPriceDisplay: "10.00",
            weeklyPriceDisplay: "",
            monthlyPriceDisplay: "500.00",
            customPriceDisplay: "",
            depositDisplay: "",
            discountDisplay: "",
            notes: "",
            partialMonthPolicy: "PRORATE_BY_DAY",
          },
        ]}
        onSubmit={vi.fn()}
        isPending={false}
      />,
    );

    // customer -> assets -> dates -> pricing
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByText(/daily price \(for remaining days\)/i)).toBeInTheDocument();
    expect(await screen.findByText(/2 calendar months × .*5 days ×/i)).toBeInTheDocument();
  });

  it("pre-fills from initialValues and initialItems for edit mode", () => {
    setup();
    renderWithProviders(
      <RentalWizard
        tenantId="tenant-1"
        initialValues={{ customerId: "cust-1" }}
        initialItems={[
          {
            assetId: "asset-1",
            billingMode: "DAILY",
            quantity: 1,
            dailyPriceDisplay: "10.00",
            weeklyPriceDisplay: "",
            monthlyPriceDisplay: "",
            customPriceDisplay: "",
            depositDisplay: "",
            discountDisplay: "",
            notes: "",
            partialMonthPolicy: "PRORATE_BY_DAY",
          },
        ]}
        submitLabelKey="rental.save"
        onSubmit={vi.fn()}
        isPending={false}
      />,
    );

    expect(screen.getByLabelText("Jane Doe")).toBeChecked();
  });

  describe("MONTHLY pricing validation before Review (manual-testing bug fix)", () => {
    async function reachMonthlyPricingStep(
      user: ReturnType<typeof userEvent.setup>,
    ): Promise<void> {
      renderWithProviders(
        <RentalWizard
          tenantId="tenant-1"
          initialValues={{ plannedStart: "2026-01-15T00:00", plannedEnd: "2026-03-20T00:00" }}
          onSubmit={vi.fn()}
          isPending={false}
        />,
      );

      await user.click(screen.getByLabelText("Jane Doe"));
      await user.click(screen.getByRole("button", { name: /next/i })); // -> assets
      await user.click(await screen.findByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /next/i })); // -> dates
      await user.click(screen.getByRole("button", { name: /next/i })); // -> pricing

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

      // Still on Prices — the Review step's total summary never appears.
      expect(screen.queryByText(/planned start/i)).not.toBeInTheDocument();

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

      expect(await screen.findByText(/planned start/i)).toBeInTheDocument();
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
        <RentalWizard
          tenantId="tenant-1"
          initialValues={{ plannedStart: "2026-01-15T00:00", plannedEnd: "2026-03-20T00:00" }}
          onSubmit={vi.fn()}
          isPending={false}
        />,
      );

      await user.click(screen.getByLabelText("Jane Doe"));
      await user.click(screen.getByRole("button", { name: /next/i })); // -> assets
      await user.click(await screen.findByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /next/i })); // -> dates
      await user.click(screen.getByRole("button", { name: /next/i })); // -> pricing

      const billingModeSelect = screen.getByDisplayValue(/daily/i);
      await user.selectOptions(billingModeSelect, "MONTHLY");

      expect(screen.getByDisplayValue("Charge started month as full month")).toBeInTheDocument();
      expect(screen.queryByText(/daily price \(for remaining days\)/i)).not.toBeInTheDocument();
    });

    it("switching to 'charge proportionally by day' shows and requires the daily remainder field", async () => {
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
        <RentalWizard
          tenantId="tenant-1"
          initialValues={{ plannedStart: "2026-01-15T00:00", plannedEnd: "2026-03-20T00:00" }}
          onSubmit={vi.fn()}
          isPending={false}
        />,
      );

      await user.click(screen.getByLabelText("Jane Doe"));
      await user.click(screen.getByRole("button", { name: /next/i })); // -> assets
      await user.click(await screen.findByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /next/i })); // -> dates
      await user.click(screen.getByRole("button", { name: /next/i })); // -> pricing

      const billingModeSelect = screen.getByDisplayValue(/daily/i);
      await user.selectOptions(billingModeSelect, "MONTHLY");

      const policySelect = screen.getByDisplayValue("Charge started month as full month");
      await user.selectOptions(policySelect, "PRORATE_BY_DAY");

      expect(await screen.findByText(/daily price \(for remaining days\)/i)).toBeInTheDocument();

      const spinbuttons = screen.getAllByRole("spinbutton");
      await user.type(spinbuttons[1]!, "600");
      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(screen.getByText("Daily price (for remaining days) is required")).toBeInTheDocument();
    });

    it("ROUND_UP_TO_FULL_MONTH never blocks advancing past Prices with no daily-price value", async () => {
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
        <RentalWizard
          tenantId="tenant-1"
          initialValues={{ plannedStart: "2026-01-15T00:00", plannedEnd: "2026-03-20T00:00" }}
          onSubmit={vi.fn()}
          isPending={false}
        />,
      );

      await user.click(screen.getByLabelText("Jane Doe"));
      await user.click(screen.getByRole("button", { name: /next/i })); // -> assets
      await user.click(await screen.findByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /next/i })); // -> dates
      await user.click(screen.getByRole("button", { name: /next/i })); // -> pricing

      const billingModeSelect = screen.getByDisplayValue(/daily/i);
      await user.selectOptions(billingModeSelect, "MONTHLY");

      const spinbuttons = screen.getAllByRole("spinbutton");
      await user.type(spinbuttons[1]!, "600");

      await user.click(screen.getByRole("button", { name: /next/i }));

      expect(await screen.findByText(/planned start/i)).toBeInTheDocument();
    });
  });
});
