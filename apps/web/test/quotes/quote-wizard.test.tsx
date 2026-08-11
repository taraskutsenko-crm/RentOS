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
});
