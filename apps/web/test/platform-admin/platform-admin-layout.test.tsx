import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PlatformAdminLayout from "../../src/app/platform-admin/layout";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/platform-admin/affiliates",
}));

const useMeMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useMe: () => useMeMock(),
}));

/**
 * Havelio PLATFORM administration (Stage 17 closure pass) — frontend
 * hiding is never security on its own (the real enforcement is
 * PlatformAdminGuard server-side, see platform-admin.e2e-spec.ts), but this
 * proves the UI itself never renders the admin surface for an ordinary
 * user, and does render it for a real platform admin.
 */
describe("PlatformAdminLayout", () => {
  it("shows an access-denied notice for an ordinary tenant OWNER (isPlatformAdmin: false)", () => {
    useMeMock.mockReturnValue({
      data: { user: { id: "u1", isPlatformAdmin: false } },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(
      <PlatformAdminLayout>
        <div>Affiliates content</div>
      </PlatformAdminLayout>,
    );

    expect(screen.getByText("Platform administration access required")).toBeInTheDocument();
    expect(screen.queryByText("Affiliates content")).not.toBeInTheDocument();
  });

  it("renders the admin shell and children for a real platform admin", () => {
    useMeMock.mockReturnValue({
      data: { user: { id: "u1", isPlatformAdmin: true } },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(
      <PlatformAdminLayout>
        <div>Affiliates content</div>
      </PlatformAdminLayout>,
    );

    expect(screen.getByText("Affiliates content")).toBeInTheDocument();
    expect(screen.getByText("Havelio Platform Admin")).toBeInTheDocument();
  });

  it("shows loading, never the admin shell, while the current user is still resolving", () => {
    useMeMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderWithProviders(
      <PlatformAdminLayout>
        <div>Affiliates content</div>
      </PlatformAdminLayout>,
    );

    expect(screen.queryByText("Affiliates content")).not.toBeInTheDocument();
    expect(screen.queryByText("Havelio Platform Admin")).not.toBeInTheDocument();
  });
});
