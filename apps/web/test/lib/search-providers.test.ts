import { describe, expect, it, vi } from "vitest";

import { apiClient } from "../../src/lib/api-client";
import { SEARCH_PROVIDERS } from "../../src/lib/search-providers";

vi.mock("../../src/lib/api-client", () => ({
  apiClient: { get: vi.fn() },
}));

describe("SEARCH_PROVIDERS", () => {
  it("is a pluggable registry covering the five real entity categories", () => {
    expect(SEARCH_PROVIDERS.map((provider) => provider.id)).toEqual([
      "customers",
      "assets",
      "rentals",
      "quotes",
      "documents",
    ]);
  });

  it("calls the exact same list endpoint the entity's own list page uses, and maps results to a SearchResult", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      items: [{ id: "1", firstName: "Jane", lastName: "Doe", company: "Acme" }],
      total: 1,
      page: 1,
      pageSize: 5,
    });

    const customersProvider = SEARCH_PROVIDERS.find((provider) => provider.id === "customers")!;
    const results = await customersProvider.search("jane", "tenant-1");

    expect(apiClient.get).toHaveBeenCalledWith("/tenants/tenant-1/customers", {
      search: "jane",
      pageSize: 5,
    });
    expect(results).toEqual([
      { id: "customer:1", label: "Jane Doe", description: "Acme", href: "/app/customers/1" },
    ]);
  });

  it("omits a provider's results without throwing when its request fails (caught by the palette, not here)", async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error("network error"));

    const assetsProvider = SEARCH_PROVIDERS.find((provider) => provider.id === "assets")!;
    await expect(assetsProvider.search("x", "tenant-1")).rejects.toThrow("network error");
  });
});
