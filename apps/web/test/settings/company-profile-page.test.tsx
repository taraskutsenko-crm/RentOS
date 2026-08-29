import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CompanyProfileSettingsPage from "../../src/app/app/settings/company-profile/page";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
const useCurrentTenantRoleMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
  useCurrentTenantRole: () => useCurrentTenantRoleMock(),
}));

const useUpdateCompanyProfileMock = vi.fn();
vi.mock("../../src/hooks/use-update-company-profile", () => ({
  useUpdateCompanyProfile: (...args: unknown[]) => useUpdateCompanyProfileMock(...args),
}));

const TENANT = {
  id: "tenant-1",
  name: "Closure Pass Rentals",
  registrationNumber: null,
  taxNumber: null,
  address: null,
  phone: null,
  email: null,
};

describe("CompanyProfileSettingsPage", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    usePermissionMock.mockReturnValue(true);
    useCurrentTenantRoleMock.mockReturnValue({ data: { tenant: TENANT }, isLoading: false });
    mutateAsync.mockReset();
    useUpdateCompanyProfileMock.mockReturnValue({ mutateAsync, isPending: false });
  });

  it("shows a disabled 'Saving...' button while the save request is in flight", () => {
    useUpdateCompanyProfileMock.mockReturnValue({ mutateAsync, isPending: true });

    renderWithProviders(<CompanyProfileSettingsPage />);

    const button = screen.getByRole("button", { name: /saving/i });
    expect(button).toBeDisabled();
  });

  it("restores the normal Save button label once the request finishes", async () => {
    mutateAsync.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<CompanyProfileSettingsPage />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByRole("button", { name: /^save$/i })).not.toBeDisabled();
  });

  it("shows a success toast after a successful save", async () => {
    mutateAsync.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<CompanyProfileSettingsPage />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("Company details saved")).toBeInTheDocument();
  });

  it("shows an error toast when the save fails, without a stack trace", async () => {
    mutateAsync.mockRejectedValue(new Error("network exploded at line 42 in foo.ts"));
    const user = userEvent.setup();
    renderWithProviders(<CompanyProfileSettingsPage />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("Failed to save company details")).toBeInTheDocument();
    expect(screen.queryByText(/network exploded/i)).not.toBeInTheDocument();
  });

  it("keeps the edited values visible in the form after a successful save (no reset)", async () => {
    mutateAsync.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<CompanyProfileSettingsPage />);

    const emailInput = screen.getByLabelText(/company email/i);
    await user.type(emailInput, "office@closurepassrentals.example");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await screen.findByText("Company details saved");
    expect(emailInput).toHaveValue("office@closurepassrentals.example");
  });

  it("does not submit a second time while the first save is still pending (double-submit prevention)", async () => {
    let resolveMutate: (() => void) | undefined;
    mutateAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMutate = resolve;
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<CompanyProfileSettingsPage />);

    const button = screen.getByRole("button", { name: /^save$/i });
    await user.click(button);
    // The button is disabled the instant the submit starts (RHF's real
    // isSubmitting flips synchronously) — a second click must be a no-op.
    await user.click(button);

    resolveMutate?.();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("renders the form read-only and hides the Save button without tenant.manage", () => {
    usePermissionMock.mockReturnValue(false);

    renderWithProviders(<CompanyProfileSettingsPage />);

    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("shows a loading state while the tenant profile is being fetched", () => {
    useCurrentTenantRoleMock.mockReturnValue({ data: undefined, isLoading: true });

    renderWithProviders(<CompanyProfileSettingsPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
