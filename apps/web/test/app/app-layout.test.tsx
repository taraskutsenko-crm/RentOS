import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppLayout from "../../src/app/app/layout";
import { renderWithProviders } from "../test-utils";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock }),
  usePathname: () => "/app",
}));

const useMeMock = vi.fn();
const useLogoutMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useMe: () => useMeMock(),
  useLogout: () => useLogoutMock(),
  useTenants: () => ({ data: { tenants: [] } }),
  useSelectTenant: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  useCurrentTenantRole: () => ({ data: undefined }),
  usePermission: () => false,
}));

describe("AppLayout", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useMeMock.mockReset();
    useLogoutMock.mockReset();
    useLogoutMock.mockReturnValue({ mutateAsync: vi.fn() });
  });

  it("renders the authenticated shell and children when the session is valid", async () => {
    useMeMock.mockReturnValue({
      data: { user: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" } },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(
      <AppLayout>
        <p>Protected content</p>
      </AppLayout>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(await screen.findByText(/ada lovelace/i)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /log out/i })).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("shows a loading state while the session is being verified", () => {
    useMeMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderWithProviders(
      <AppLayout>
        <p>Protected content</p>
      </AppLayout>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("redirects to /login when the session check fails (anonymous/expired)", async () => {
    useMeMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderWithProviders(
      <AppLayout>
        <p>Protected content</p>
      </AppLayout>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
  });
});
