import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalShellLayout from "../../src/app/portal/(shell)/layout";
import { renderWithProviders } from "../test-utils";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  usePathname: () => "/portal/dashboard",
}));

const usePortalMeMock = vi.fn();
const usePortalLogoutMock = vi.fn();
vi.mock("../../src/hooks/use-portal-auth", () => ({
  usePortalMe: () => usePortalMeMock(),
  usePortalLogout: () => usePortalLogoutMock(),
}));

const usePortalUnreadNotificationCountMock = vi.fn();
vi.mock("../../src/hooks/use-portal-notifications", () => ({
  usePortalUnreadNotificationCount: () => usePortalUnreadNotificationCountMock(),
}));

describe("PortalShellLayout", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    usePortalLogoutMock.mockReturnValue({ mutateAsync: vi.fn() });
    usePortalUnreadNotificationCountMock.mockReturnValue({ data: { count: 0 } });
  });

  it("redirects to the portal login page when the session is invalid", () => {
    usePortalMeMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderWithProviders(
      <PortalShellLayout>
        <div>content</div>
      </PortalShellLayout>,
    );

    expect(replaceMock).toHaveBeenCalledWith("/portal/login");
  });

  it("renders the nav and customer name once authenticated", () => {
    usePortalMeMock.mockReturnValue({
      data: {
        customer: { id: "c1", firstName: "Jane", lastName: "Doe" },
        tenant: { id: "t1", name: "Acme Rentals" },
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(
      <PortalShellLayout>
        <div>portal content</div>
      </PortalShellLayout>,
    );

    expect(screen.getByText("Acme Rentals")).toBeInTheDocument();
    expect(screen.getByText(/jane doe/i)).toBeInTheDocument();
    expect(screen.getByText("portal content")).toBeInTheDocument();
  });

  it("shows the unread notification badge count", () => {
    usePortalMeMock.mockReturnValue({
      data: {
        customer: { id: "c1", firstName: "Jane", lastName: "Doe" },
        tenant: { id: "t1", name: "Acme Rentals" },
      },
      isLoading: false,
      isError: false,
    });
    usePortalUnreadNotificationCountMock.mockReturnValue({ data: { count: 3 } });

    renderWithProviders(
      <PortalShellLayout>
        <div />
      </PortalShellLayout>,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
