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
const useTenantsMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useMe: () => useMeMock(),
  useLogout: () => useLogoutMock(),
  useTenants: () => useTenantsMock(),
  useSelectTenant: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  useCurrentTenantRole: () => ({ data: undefined }),
  usePermission: () => false,
}));

const TENANT_STORAGE_KEY = "rentos_current_tenant_id";

describe("AppLayout", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useMeMock.mockReset();
    useLogoutMock.mockReset();
    useLogoutMock.mockReturnValue({ mutateAsync: vi.fn() });
    // Real localStorage-backed useCurrentTenantId() is exercised
    // (deliberately not mocked) — start every test from a clean slate.
    window.localStorage.clear();
    useTenantsMock.mockReset();
    useTenantsMock.mockReturnValue({ data: { tenants: [] } });
    useMeMock.mockReturnValue({
      data: { user: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" } },
      isLoading: false,
      isError: false,
    });
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

  // Regression coverage for the customer-creation bug: a returning user's
  // localStorage tenant id can be missing or stale (cleared storage, a
  // different device, a revoked membership) while their session is
  // otherwise perfectly valid. Every tenant-scoped request previously went
  // to `/tenants/null/...` (or an inaccessible tenant), 403ing silently.
  it("auto-selects the tenant when the account has exactly one and none is stored", async () => {
    useTenantsMock.mockReturnValue({ data: { tenants: [{ id: "tenant-1", name: "Acme Inc" }] } });

    renderWithProviders(
      <AppLayout>
        <p>Protected content</p>
      </AppLayout>,
    );

    await waitFor(() => expect(screen.getByText("Protected content")).toBeInTheDocument());
    expect(window.localStorage.getItem(TENANT_STORAGE_KEY)).toBe("tenant-1");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("auto-selects the tenant when the stored id doesn't match any real membership", async () => {
    window.localStorage.setItem(TENANT_STORAGE_KEY, "some-other-tenant-from-a-different-account");
    useTenantsMock.mockReturnValue({ data: { tenants: [{ id: "tenant-1", name: "Acme Inc" }] } });

    renderWithProviders(
      <AppLayout>
        <p>Protected content</p>
      </AppLayout>,
    );

    await waitFor(() => expect(screen.getByText("Protected content")).toBeInTheDocument());
    expect(window.localStorage.getItem(TENANT_STORAGE_KEY)).toBe("tenant-1");
  });

  it("renders immediately (no correction) when the stored tenant id is already valid", () => {
    window.localStorage.setItem(TENANT_STORAGE_KEY, "tenant-1");
    useTenantsMock.mockReturnValue({ data: { tenants: [{ id: "tenant-1", name: "Acme Inc" }] } });

    renderWithProviders(
      <AppLayout>
        <p>Protected content</p>
      </AppLayout>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects to /app/select-tenant when the account has multiple tenants and none is valid", async () => {
    useTenantsMock.mockReturnValue({
      data: {
        tenants: [
          { id: "tenant-1", name: "Acme Inc" },
          { id: "tenant-2", name: "Beta LLC" },
        ],
      },
    });

    renderWithProviders(
      <AppLayout>
        <p>Protected content</p>
      </AppLayout>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/app/select-tenant"));
    expect(window.localStorage.getItem(TENANT_STORAGE_KEY)).toBeNull();
  });
});
