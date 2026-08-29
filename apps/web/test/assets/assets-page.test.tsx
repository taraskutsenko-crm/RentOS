import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AssetsPage from "../../src/app/app/assets/page";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useAssetsMock = vi.fn();
vi.mock("../../src/hooks/use-assets", () => ({
  useAssets: (...args: unknown[]) => useAssetsMock(...args),
}));

const useAssetCategoriesMock = vi.fn();
vi.mock("../../src/hooks/use-asset-categories", () => ({
  useAssetCategories: (...args: unknown[]) => useAssetCategoriesMock(...args),
}));

const useAssetStatusesMock = vi.fn();
vi.mock("../../src/hooks/use-asset-statuses", () => ({
  useAssetStatuses: (...args: unknown[]) => useAssetStatusesMock(...args),
}));

describe("AssetsPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useAssetCategoriesMock.mockReturnValue({
      data: { items: [{ id: "cat-1", name: "Vehicles" }] },
    });
    useAssetStatusesMock.mockReturnValue({
      data: [{ id: "status-1", name: "Available", code: "AVAILABLE" }],
    });
  });

  // 1. Asset list rendering
  it("renders a row per asset with internal number, name, category, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: {
        items: [
          {
            id: "a1",
            internalNumber: "AST-0001",
            name: "Truck 1",
            category: { name: "Vehicles" },
            currentStatus: { name: "Available" },
            isRentable: true,
            primaryImage: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.getAllByText("AST-0001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Truck 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Vehicles").length).toBeGreaterThan(0);
  });

  // Regression test for the exact reported bug: an asset whose persisted
  // Status is "Rented" must never simultaneously show "Available now: Yes" —
  // the column is driven purely by the server-computed isAvailableNow field,
  // never by isRentable or currentStatus on their own.
  it("shows 'No' for an asset that is currently rented, never 'Yes', even though isRentable is true", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: {
        items: [
          {
            id: "a1",
            internalNumber: "AST-0001",
            name: "Skoda Fabia",
            category: { name: "Vehicles" },
            currentStatus: { name: "Rented" },
            isRentable: true,
            isAvailableNow: false,
            unavailableReason: "RENTED",
            primaryImage: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.getByText("Available now")).toBeInTheDocument();
    expect(screen.getAllByText("Rented").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No").length).toBeGreaterThan(0);
    expect(screen.queryByText("Yes")).not.toBeInTheDocument();
  });

  // Overdue return: the persisted Status is still "Rented" (never
  // overwritten — see Asset.currentStatusId's own doc comment), but the
  // list must display the derived "Overdue return" status instead, plus
  // "Available now: No" with a matching tooltip — this is the exact
  // real-data case ("Agregat Honda").
  it("shows the derived 'Overdue return' status (not the persisted 'Rented' label) and 'No' with a matching tooltip when isOverdue is true", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: {
        items: [
          {
            id: "a1",
            internalNumber: "01002",
            name: "Agregat Honda",
            category: { name: "Generators" },
            currentStatus: { name: "Rented" },
            isRentable: true,
            isAvailableNow: false,
            unavailableReason: "OVERDUE_RETURN",
            isOverdue: true,
            overdueSince: "2026-08-27T15:00:00.000Z",
            primaryImage: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.getByText("Overdue return")).toBeInTheDocument();
    expect(screen.queryByText("Rented")).not.toBeInTheDocument();
    const noCell = screen.getByText("No");
    expect(noCell).toHaveAttribute("title", "Overdue return");
  });

  it("shows 'Yes' for a rentable asset with no current conflicts, and the reason tooltip is only present when unavailable", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: {
        items: [
          {
            id: "a2",
            internalNumber: "AST-0002",
            name: "Container",
            category: { name: "Containers" },
            currentStatus: { name: "Available" },
            isRentable: true,
            isAvailableNow: true,
            unavailableReason: null,
            primaryImage: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    const yesCell = screen.getByText("Yes");
    expect(yesCell).toBeInTheDocument();
    expect(yesCell).not.toHaveAttribute("title");
  });

  it("shows a reason tooltip on the 'No' cell for a blocked (e.g. maintenance) asset", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: {
        items: [
          {
            id: "a3",
            internalNumber: "AST-0003",
            name: "Generator",
            category: { name: "Equipment" },
            currentStatus: { name: "Available" },
            isRentable: true,
            isAvailableNow: false,
            unavailableReason: "MAINTENANCE",
            primaryImage: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    const noCell = screen.getByText("No");
    expect(noCell).toHaveAttribute("title", "Maintenance");
  });

  it("renders the empty state when there are no assets", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.getByText(/no assets found/i)).toBeInTheDocument();
  });

  it("shows a loading skeleton while fetching", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderWithProviders(<AssetsPage />);

    expect(screen.queryByText(/no assets found/i)).not.toBeInTheDocument();
  });

  it("shows an error message when the query fails", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderWithProviders(<AssetsPage />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  // 2. Search and filter behavior
  it("updates the search query param as the user types", async () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<AssetsPage />);
    await user.type(screen.getByPlaceholderText(/search assets/i), "Ford");

    await waitFor(() => {
      expect(useAssetsMock).toHaveBeenLastCalledWith(
        "tenant-1",
        expect.objectContaining({ search: "Ford" }),
      );
    });
  });

  it("filters by category when a category is selected", async () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<AssetsPage />);
    await user.selectOptions(screen.getByDisplayValue(/all categories/i), "cat-1");

    expect(useAssetsMock).toHaveBeenLastCalledWith(
      "tenant-1",
      expect.objectContaining({ categoryId: "cat-1" }),
    );
  });

  // 9. Permission-based controls
  it("hides the create button when the user lacks assets.create", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.queryByRole("link", { name: /new asset/i })).not.toBeInTheDocument();
  });

  it("shows the create button when the user has assets.create", () => {
    usePermissionMock.mockReturnValue(true);
    useAssetsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<AssetsPage />);

    expect(screen.getByRole("link", { name: /new asset/i })).toBeInTheDocument();
  });
});
