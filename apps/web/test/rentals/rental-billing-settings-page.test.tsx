import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RentalBillingSettingsPage from "../../src/app/app/settings/rental-billing/page";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useRentalBillingSettingsMock = vi.fn();
const useUpdateRentalBillingSettingsMock = vi.fn();
vi.mock("../../src/hooks/use-rental-billing-settings", () => ({
  useRentalBillingSettings: (...args: unknown[]) => useRentalBillingSettingsMock(...args),
  useUpdateRentalBillingSettings: (...args: unknown[]) =>
    useUpdateRentalBillingSettingsMock(...args),
}));

describe("RentalBillingSettingsPage", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    mutateAsync.mockReset();
    useUpdateRentalBillingSettingsMock.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
    });
  });

  it("renders the current strategy with the custom-days field hidden by default", () => {
    usePermissionMock.mockReturnValue(true);
    useRentalBillingSettingsMock.mockReturnValue({
      data: {
        tenantId: "tenant-1",
        monthlyBillingStrategy: "CALENDAR_MONTH",
        customMonthLengthDays: null,
        isDefault: true,
        updatedAt: null,
      },
      isLoading: false,
    });

    renderWithProviders(<RentalBillingSettingsPage />);

    expect(screen.getByText("Calendar month")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/number of days in one custom billing month/i),
    ).not.toBeInTheDocument();
  });

  it("shows the custom-days field when CUSTOM is selected", async () => {
    usePermissionMock.mockReturnValue(true);
    useRentalBillingSettingsMock.mockReturnValue({
      data: {
        tenantId: "tenant-1",
        monthlyBillingStrategy: "CALENDAR_MONTH",
        customMonthLengthDays: null,
        isDefault: true,
        updatedAt: null,
      },
      isLoading: false,
    });

    const user = userEvent.setup();
    renderWithProviders(<RentalBillingSettingsPage />);

    await user.click(screen.getByText(/custom period/i));

    expect(
      await screen.findByLabelText(/number of days in one custom billing month/i),
    ).toBeInTheDocument();
  });

  it("shows a validation error for an out-of-range custom length", async () => {
    usePermissionMock.mockReturnValue(true);
    useRentalBillingSettingsMock.mockReturnValue({
      data: {
        tenantId: "tenant-1",
        monthlyBillingStrategy: "CUSTOM",
        customMonthLengthDays: 28,
        isDefault: false,
        updatedAt: null,
      },
      isLoading: false,
    });

    const user = userEvent.setup();
    renderWithProviders(<RentalBillingSettingsPage />);

    const input = await screen.findByLabelText(/number of days in one custom billing month/i);
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      await screen.findByText(/enter a number of days between 1 and 365/i),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("submits the selected strategy and shows a success message", async () => {
    usePermissionMock.mockReturnValue(true);
    useRentalBillingSettingsMock.mockReturnValue({
      data: {
        tenantId: "tenant-1",
        monthlyBillingStrategy: "CALENDAR_MONTH",
        customMonthLengthDays: null,
        isDefault: true,
        updatedAt: null,
      },
      isLoading: false,
    });
    mutateAsync.mockResolvedValue({});

    const user = userEvent.setup();
    renderWithProviders(<RentalBillingSettingsPage />);

    await user.click(screen.getByText(/fixed 30 days/i));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        monthlyBillingStrategy: "FIXED_30_DAYS",
        customMonthLengthDays: null,
      }),
    );
    expect(await screen.findByText(/billing settings saved/i)).toBeInTheDocument();
  });

  it("shows the backend error message on failure", () => {
    usePermissionMock.mockReturnValue(true);
    useRentalBillingSettingsMock.mockReturnValue({
      data: {
        tenantId: "tenant-1",
        monthlyBillingStrategy: "CALENDAR_MONTH",
        customMonthLengthDays: null,
        isDefault: true,
        updatedAt: null,
      },
      isLoading: false,
    });
    useUpdateRentalBillingSettingsMock.mockReturnValue({
      mutateAsync,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error("boom"),
    });

    renderWithProviders(<RentalBillingSettingsPage />);

    expect(screen.getByText(/something went wrong|error/i)).toBeInTheDocument();
  });

  it("renders the form read-only and hides the save button without rental_settings.manage", () => {
    usePermissionMock.mockReturnValue(false);
    useRentalBillingSettingsMock.mockReturnValue({
      data: {
        tenantId: "tenant-1",
        monthlyBillingStrategy: "CALENDAR_MONTH",
        customMonthLengthDays: null,
        isDefault: true,
        updatedAt: null,
      },
      isLoading: false,
    });

    renderWithProviders(<RentalBillingSettingsPage />);

    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });

  it("shows a loading state while settings are being fetched", () => {
    usePermissionMock.mockReturnValue(true);
    useRentalBillingSettingsMock.mockReturnValue({ data: undefined, isLoading: true });

    renderWithProviders(<RentalBillingSettingsPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
