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

const useCompanySignatureMock = vi.fn();
const useUploadCompanySignatureMock = vi.fn();
const useDeleteCompanySignatureMock = vi.fn();
vi.mock("../../src/hooks/use-company-signature", () => ({
  useCompanySignature: (...args: unknown[]) => useCompanySignatureMock(...args),
  useUploadCompanySignature: (...args: unknown[]) => useUploadCompanySignatureMock(...args),
  useDeleteCompanySignature: (...args: unknown[]) => useDeleteCompanySignatureMock(...args),
  companySignatureFileUrl: (tenantId: string) =>
    `http://api.test/tenants/${tenantId}/company-signature/file`,
}));

const useUploadCompanyLogoMock = vi.fn();
const useDeleteCompanyLogoMock = vi.fn();
vi.mock("../../src/hooks/use-company-logo", () => ({
  useUploadCompanyLogo: (...args: unknown[]) => useUploadCompanyLogoMock(...args),
  useDeleteCompanyLogo: (...args: unknown[]) => useDeleteCompanyLogoMock(...args),
  companyLogoFileUrl: (tenantId: string) => `http://api.test/tenants/${tenantId}/company-logo/file`,
}));

const TENANT = {
  id: "tenant-1",
  name: "Closure Pass Rentals",
  timezone: "America/New_York",
  registrationNumber: null,
  taxNumber: null,
  address: null,
  phone: null,
  email: null,
  logoMimeType: null,
  logoWidth: null,
  logoHeight: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("CompanyProfileSettingsPage", () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    usePermissionMock.mockReturnValue(true);
    useCurrentTenantRoleMock.mockReturnValue({ data: { tenant: TENANT }, isLoading: false });
    mutateAsync.mockReset();
    useUpdateCompanyProfileMock.mockReturnValue({ mutateAsync, isPending: false });

    useCompanySignatureMock.mockReturnValue({ data: { signature: null }, isLoading: false });
    useUploadCompanySignatureMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useDeleteCompanySignatureMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    useUploadCompanyLogoMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useDeleteCompanyLogoMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
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

  describe("Time zone selector (Task A)", () => {
    it("shows a friendly 'UTC±HH:MM — City' display for the tenant's stored IANA timezone", () => {
      renderWithProviders(<CompanyProfileSettingsPage />);

      // TENANT.timezone is "America/New_York" — the trigger must show a
      // friendly label, never the raw IANA id as the primary text.
      const trigger = screen.getByRole("combobox", { name: /time zone/i });
      expect(trigger.textContent).toMatch(/UTC[+-]\d{2}:00 — New York/);
    });

    it("shows every option's current UTC offset, grouped by offset", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.click(screen.getByRole("combobox", { name: /time zone/i }));

      // At least one real offset group header renders (e.g. "UTC+02:00" or
      // "UTC±00:00") — never a raw IANA-only list.
      expect(screen.getAllByText(/^UTC[+-±]\d{2}:00$/).length).toBeGreaterThan(0);
      // Each visible option row shows its own offset next to the city name.
      expect(screen.getAllByText(/^[+-]\d{2}:00$/).length).toBeGreaterThan(0);
    });

    it("searching 'Warsaw' narrows the list to Warsaw", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.click(screen.getByRole("combobox", { name: /time zone/i }));
      await user.type(screen.getByRole("searchbox"), "Warsaw");

      expect(screen.getByRole("option", { name: /Warsaw/ })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /^Tokyo/ })).not.toBeInTheDocument();
    });

    it("searching the raw IANA id 'Europe/Warsaw' also finds it", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.click(screen.getByRole("combobox", { name: /time zone/i }));
      await user.type(screen.getByRole("searchbox"), "Europe/Warsaw");

      expect(screen.getByRole("option", { name: /Warsaw/ })).toBeInTheDocument();
    });

    it("searching '+2' / 'UTC+2' finds zones currently at UTC+02:00", async () => {
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.click(screen.getByRole("combobox", { name: /time zone/i }));
      await user.type(screen.getByRole("searchbox"), "UTC+2");

      expect(screen.getByRole("option", { name: /Warsaw/ })).toBeInTheDocument();
    });

    it("selecting a zone from the popover saves the unchanged IANA identifier", async () => {
      mutateAsync.mockResolvedValue({});
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.click(screen.getByRole("combobox", { name: /time zone/i }));
      await user.type(screen.getByRole("searchbox"), "Europe/Warsaw");
      await user.click(screen.getByRole("option", { name: /Warsaw/ }));

      // The trigger now shows the friendly label for the newly selected zone...
      expect(screen.getByRole("combobox", { name: /time zone/i }).textContent).toMatch(/Warsaw/);

      await user.click(screen.getByRole("button", { name: /^save$/i }));

      // ...but the value actually submitted is the exact, unmodified IANA id.
      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith(
          expect.objectContaining({ timezone: "Europe/Warsaw" }),
        ),
      );
    });
  });

  describe("Company representative signature (Havelio Signature System)", () => {
    it("shows no preview and no delete action when nothing is configured yet", () => {
      renderWithProviders(<CompanyProfileSettingsPage />);

      expect(screen.getByRole("button", { name: /upload signature/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /draw signature/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    });

    it("shows a saved-signature preview and a Delete action once one is configured", () => {
      useCompanySignatureMock.mockReturnValue({
        data: {
          signature: {
            id: "sig-1",
            representativeName: "Taras Kutsenko",
            representativeTitle: "President",
          },
        },
        isLoading: false,
      });

      renderWithProviders(<CompanyProfileSettingsPage />);

      expect(screen.getByDisplayValue("Taras Kutsenko")).toBeInTheDocument();
      expect(screen.getByDisplayValue("President")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
      expect(screen.getByAltText("")).toHaveAttribute(
        "src",
        "http://api.test/tenants/tenant-1/company-signature/file",
      );
    });

    it("rejects uploading a file before a signer name is entered", async () => {
      const mutateAsync = vi.fn();
      useUploadCompanySignatureMock.mockReturnValue({ mutateAsync, isPending: false });
      renderWithProviders(<CompanyProfileSettingsPage />);

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["png-bytes"], "sig.png", { type: "image/png" });
      await userEvent.upload(fileInput, file);

      expect(
        await screen.findByText("Enter the signer's name before saving a signature."),
      ).toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it("uploads a signature file with the entered signer name and shows a success toast", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      useUploadCompanySignatureMock.mockReturnValue({ mutateAsync, isPending: false });
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.type(screen.getByLabelText(/signer name/i), "Taras Kutsenko");
      await user.type(screen.getByLabelText(/position/i), "President");

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(["png-bytes"], "sig.png", { type: "image/png" });
      await user.upload(fileInput, file);

      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          file,
          representativeName: "Taras Kutsenko",
          representativeTitle: "President",
          method: "UPLOADED",
        }),
      );
      expect(await screen.findByText("Signature saved")).toBeInTheDocument();
    });

    it("shows an error toast when saving the signature fails", async () => {
      const mutateAsync = vi.fn().mockRejectedValue(new Error("boom at line 99"));
      useUploadCompanySignatureMock.mockReturnValue({ mutateAsync, isPending: false });
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.type(screen.getByLabelText(/signer name/i), "Taras Kutsenko");
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(fileInput, new File(["x"], "sig.png", { type: "image/png" }));

      expect(await screen.findByText("Failed to save signature")).toBeInTheDocument();
      expect(screen.queryByText(/boom at line 99/i)).not.toBeInTheDocument();
    });

    it("asks for confirmation and deletes the saved signature", async () => {
      useCompanySignatureMock.mockReturnValue({
        data: {
          signature: { id: "sig-1", representativeName: "Taras", representativeTitle: null },
        },
        isLoading: false,
      });
      const mutateAsync = vi.fn().mockResolvedValue({});
      useDeleteCompanySignatureMock.mockReturnValue({ mutateAsync, isPending: false });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.click(screen.getByRole("button", { name: /^delete$/i }));

      expect(confirmSpy).toHaveBeenCalled();
      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      expect(await screen.findByText("Signature deleted")).toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it("does not delete when the confirmation is dismissed", async () => {
      useCompanySignatureMock.mockReturnValue({
        data: {
          signature: { id: "sig-1", representativeName: "Taras", representativeTitle: null },
        },
        isLoading: false,
      });
      const mutateAsync = vi.fn();
      useDeleteCompanySignatureMock.mockReturnValue({ mutateAsync, isPending: false });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.click(screen.getByRole("button", { name: /^delete$/i }));

      expect(mutateAsync).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("hides upload/draw/delete actions without tenant.manage, but still shows the preview", () => {
      usePermissionMock.mockReturnValue(false);
      useCompanySignatureMock.mockReturnValue({
        data: {
          signature: { id: "sig-1", representativeName: "Taras", representativeTitle: null },
        },
        isLoading: false,
      });

      renderWithProviders(<CompanyProfileSettingsPage />);

      expect(screen.getByAltText("")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /upload signature/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /draw signature/i })).toBeDisabled();
    });
  });

  describe("Company logo (Havelio Company Branding)", () => {
    it("shows an Upload logo button and a neutral placeholder when no logo is configured", () => {
      renderWithProviders(<CompanyProfileSettingsPage />);

      expect(screen.getByRole("button", { name: /^upload logo$/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^replace logo$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^remove logo$/i })).not.toBeInTheDocument();
      expect(screen.getByText("No logo uploaded")).toBeInTheDocument();
      expect(screen.queryByAltText("")).not.toBeInTheDocument();
    });

    it("shows a logo preview, Replace, and Remove actions once a logo is configured", () => {
      useCurrentTenantRoleMock.mockReturnValue({
        data: { tenant: { ...TENANT, logoMimeType: "image/png", logoWidth: 200, logoHeight: 80 } },
        isLoading: false,
      });

      renderWithProviders(<CompanyProfileSettingsPage />);

      expect(screen.getByRole("button", { name: /^replace logo$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^remove logo$/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^upload logo$/i })).not.toBeInTheDocument();
      expect(screen.getByAltText("")).toHaveAttribute(
        "src",
        "http://api.test/tenants/tenant-1/company-logo/file?v=2026-01-01T00%3A00%3A00.000Z",
      );
    });

    it("uploads a logo file and shows a success toast", async () => {
      const mutateAsync = vi.fn().mockResolvedValue({});
      useUploadCompanyLogoMock.mockReturnValue({ mutateAsync, isPending: false });
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      const fileInput = document.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
      const file = new File(["png-bytes"], "logo.png", { type: "image/png" });
      await user.upload(fileInput, file);

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(file));
      expect(await screen.findByText("Company logo saved")).toBeInTheDocument();
    });

    it("shows an error toast when saving the logo fails, without a stack trace", async () => {
      const mutateAsync = vi.fn().mockRejectedValue(new Error("boom at line 7"));
      useUploadCompanyLogoMock.mockReturnValue({ mutateAsync, isPending: false });
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      const fileInput = document.querySelectorAll('input[type="file"]')[1] as HTMLInputElement;
      await user.upload(fileInput, new File(["x"], "logo.png", { type: "image/png" }));

      expect(await screen.findByText("Failed to save company logo")).toBeInTheDocument();
      expect(screen.queryByText(/boom at line 7/i)).not.toBeInTheDocument();
    });

    it("asks for confirmation and removes the logo", async () => {
      useCurrentTenantRoleMock.mockReturnValue({
        data: { tenant: { ...TENANT, logoMimeType: "image/png", logoWidth: 200, logoHeight: 80 } },
        isLoading: false,
      });
      const mutateAsync = vi.fn().mockResolvedValue({});
      useDeleteCompanyLogoMock.mockReturnValue({ mutateAsync, isPending: false });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.click(screen.getByRole("button", { name: /^remove logo$/i }));

      expect(confirmSpy).toHaveBeenCalled();
      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      expect(await screen.findByText("Company logo removed")).toBeInTheDocument();
      confirmSpy.mockRestore();
    });

    it("does not remove the logo when the confirmation is dismissed", async () => {
      useCurrentTenantRoleMock.mockReturnValue({
        data: { tenant: { ...TENANT, logoMimeType: "image/png", logoWidth: 200, logoHeight: 80 } },
        isLoading: false,
      });
      const mutateAsync = vi.fn();
      useDeleteCompanyLogoMock.mockReturnValue({ mutateAsync, isPending: false });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const user = userEvent.setup();
      renderWithProviders(<CompanyProfileSettingsPage />);

      await user.click(screen.getByRole("button", { name: /^remove logo$/i }));

      expect(mutateAsync).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it("hides upload/replace/remove actions without tenant.manage, but still shows the preview", () => {
      usePermissionMock.mockReturnValue(false);
      useCurrentTenantRoleMock.mockReturnValue({
        data: { tenant: { ...TENANT, logoMimeType: "image/png", logoWidth: 200, logoHeight: 80 } },
        isLoading: false,
      });

      renderWithProviders(<CompanyProfileSettingsPage />);

      expect(screen.getByAltText("")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^replace logo$/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /^remove logo$/i })).toBeDisabled();
    });
  });
});
