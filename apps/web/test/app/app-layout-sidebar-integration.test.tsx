import { screen, waitFor } from "@testing-library/react";
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
  useTenants: () => useTenantsMock(),
  useSelectTenant: () => ({ mutateAsync: vi.fn() }),
}));

const useTenantsMock = vi.fn();

// The bug this covers: Sidebar's permission-gated items go through
// usePermission() -> useCurrentTenantRole() -> apiClient.get(`/tenants/:id`).
// That query is `enabled: !!tenantId`. A stale/missing tenant id previously
// left `role` undefined forever, so every permission-gated nav item
// (Assets/Rentals/Quotes/Documents/Settings submodules) silently vanished —
// only the 3 items with no declared permission (Dashboard, Customers,
// Keyboard shortcuts) remained. Deliberately NOT mocking
// use-current-tenant-role or Sidebar here — only the network layer — so
// this exercises the real useEnsureTenantContext -> useCurrentTenantRole ->
// Sidebar chain end to end, the same one the customer-creation bug lived in
// (see apps/web/src/hooks/use-ensure-tenant-context.ts, DECISIONS.md D-058).
const apiGetMock = vi.fn();
vi.mock("../../src/lib/api-client", () => ({
  apiClient: {
    get: (path: string) => apiGetMock(path),
    post: () => Promise.resolve({}),
  },
}));

const TENANT_STORAGE_KEY = "rentos_current_tenant_id";
const TENANT_ID = "tenant-owner-1";

describe("AppLayout + Sidebar integration — tenant context repair", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    useMeMock.mockReset();
    useLogoutMock.mockReset();
    useLogoutMock.mockReturnValue({ mutateAsync: vi.fn() });
    useTenantsMock.mockReset();
    useTenantsMock.mockReturnValue({
      data: { tenants: [{ id: TENANT_ID, name: "Acme Inc" }] },
    });
    apiGetMock.mockReset();
    apiGetMock.mockImplementation((path: string) => {
      if (path === `/tenants/${TENANT_ID}`) {
        return Promise.resolve({
          tenant: { id: TENANT_ID, name: "Acme Inc" },
          role: "OWNER",
        });
      }
      // Every other apiClient.get call made by Header's children
      // (notifications, quick create, tenant switcher) — harmless empty
      // defaults so those unrelated components don't throw.
      return Promise.resolve({ items: [], tenants: [] });
    });
    window.localStorage.clear();
    useMeMock.mockReturnValue({
      data: { user: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" } },
      isLoading: false,
      isError: false,
    });
  });

  it("shows every permission-gated nav item for an OWNER once a missing tenant id self-corrects", async () => {
    // No tenant id in localStorage at all — the exact "returning user,
    // cleared/never-set storage" scenario reported as a missing sidebar.
    renderWithProviders(
      <AppLayout>
        <p>Protected content</p>
      </AppLayout>,
    );

    await waitFor(() => expect(screen.getByText("Protected content")).toBeInTheDocument());
    await waitFor(() => expect(window.localStorage.getItem(TENANT_STORAGE_KEY)).toBe(TENANT_ID));

    await waitFor(() => expect(screen.getByRole("link", { name: /assets/i })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /rentals/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /quotes/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /documents/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /billing settings/i })).toBeInTheDocument();
  });

  it("shows every permission-gated nav item for an OWNER once a stale tenant id self-corrects", async () => {
    window.localStorage.setItem(TENANT_STORAGE_KEY, "some-tenant-from-a-different-account");

    renderWithProviders(
      <AppLayout>
        <p>Protected content</p>
      </AppLayout>,
    );

    await waitFor(() => expect(screen.getByText("Protected content")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("link", { name: /assets/i })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /quotes/i })).toBeInTheDocument();
  });
});
