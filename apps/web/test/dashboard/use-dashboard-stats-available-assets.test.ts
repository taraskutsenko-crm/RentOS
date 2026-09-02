import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiGetMock = vi.fn();
vi.mock("../../src/lib/api-client", () => ({
  apiClient: {
    get: (path: string, params?: unknown) => apiGetMock(path, params),
  },
}));

import { useDashboardStats } from "../../src/hooks/use-dashboard-stats";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

const NO_PERMISSIONS = {
  canViewRentals: false,
  canViewAssets: true,
  canViewQuotes: false,
  canViewDocuments: false,
  canManagePortal: false,
};

// Task 3 Part B — the Dashboard's "Available assets" KPI must come from
// the new canonical AssetsService.countAvailableNow endpoint
// (GET /tenants/:tenantId/assets/available-count), never the old
// catalog-status-filtered `useAssets({ statusId: <AVAILABLE status id> })`
// approach. This proves the hook wiring — the endpoint's own correctness
// is proven end-to-end in asset-available-count.e2e-spec.ts.
describe("useDashboardStats — availableAssets (canonical count wiring)", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it("reads availableAssets.value from the canonical available-count endpoint", async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path === "/tenants/tenant-1/customers") return Promise.resolve({ total: 0, items: [] });
      if (path === "/tenants/tenant-1/assets/available-count") return Promise.resolve({ count: 2 });
      return Promise.resolve({ total: 0, items: [] });
    });

    const { result } = renderHook(() => useDashboardStats("tenant-1", NO_PERMISSIONS), {
      wrapper,
    });

    await waitFor(() => expect(result.current.availableAssets.isLoading).toBe(false));
    expect(result.current.availableAssets.value).toBe(2);

    // Never calls the old catalog-status-filtered assets list endpoint or
    // the asset-statuses lookup it depended on for this KPI.
    const calledPaths = apiGetMock.mock.calls.map((call) => call[0] as string);
    expect(calledPaths).not.toContain("/tenants/tenant-1/asset-statuses");
    expect(calledPaths).toContain("/tenants/tenant-1/assets/available-count");
  });

  it("never fetches the available-count endpoint without assets-view permission", async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path === "/tenants/tenant-1/customers") return Promise.resolve({ total: 0, items: [] });
      return Promise.resolve({ count: 999 });
    });

    const { result } = renderHook(
      () => useDashboardStats("tenant-1", { ...NO_PERMISSIONS, canViewAssets: false }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.totalCustomers.isLoading).toBe(false));
    expect(result.current.availableAssets.value).toBe(0);
    const calledPaths = apiGetMock.mock.calls.map((call) => call[0] as string);
    expect(calledPaths).not.toContain("/tenants/tenant-1/assets/available-count");
  });
});
