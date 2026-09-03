import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PlatformAdminAffiliatesPage from "../../src/app/platform-admin/affiliates/page";
import { renderWithProviders } from "../test-utils";

const usePlatformAdminPartnersMock = vi.fn();
const useCreatePartnerMock = vi.fn();
vi.mock("../../src/hooks/use-platform-admin", () => ({
  usePlatformAdminPartners: () => usePlatformAdminPartnersMock(),
  useCreatePartner: () => useCreatePartnerMock(),
}));

describe("PlatformAdminAffiliatesPage", () => {
  it("shows an empty state when there are no partners yet", () => {
    usePlatformAdminPartnersMock.mockReturnValue({ data: [], isLoading: false });
    useCreatePartnerMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    renderWithProviders(<PlatformAdminAffiliatesPage />);

    expect(screen.getByText("No affiliate partners yet.")).toBeInTheDocument();
  });

  it("lists real partners with a link to their detail page", () => {
    usePlatformAdminPartnersMock.mockReturnValue({
      data: [
        { id: "partner-1", displayName: "RentalPro", email: "partner@rentalpro.example.com", status: "ACTIVE" },
      ],
      isLoading: false,
    });
    useCreatePartnerMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    renderWithProviders(<PlatformAdminAffiliatesPage />);

    const link = screen.getByRole("link", { name: "RentalPro" });
    expect(link).toHaveAttribute("href", "/platform-admin/affiliates/partner-1");
    expect(screen.getByText("partner@rentalpro.example.com")).toBeInTheDocument();
  });

  it("creates a partner via the dialog", async () => {
    usePlatformAdminPartnersMock.mockReturnValue({ data: [], isLoading: false });
    const mutateAsync = vi.fn().mockResolvedValue({ id: "partner-2" });
    useCreatePartnerMock.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<PlatformAdminAffiliatesPage />);
    await user.click(screen.getByRole("button", { name: "Create partner" }));
    await user.type(screen.getByLabelText("Display name"), "RentalPro");
    await user.type(screen.getByLabelText("Email"), "partner@rentalpro.example.com");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      displayName: "RentalPro",
      email: "partner@rentalpro.example.com",
    });
  });
});
