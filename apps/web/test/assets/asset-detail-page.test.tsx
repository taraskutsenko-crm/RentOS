import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AssetDetailPage from "../../src/app/app/assets/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "asset-1" }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useAssetMock = vi.fn();
const useAssetTimelineMock = vi.fn();
const useDeleteAssetMock = vi.fn();
const useChangeAssetStatusMock = vi.fn();
const useChangeAssetLocationMock = vi.fn();
vi.mock("../../src/hooks/use-assets", () => ({
  useAsset: (...args: unknown[]) => useAssetMock(...args),
  useAssetTimeline: (...args: unknown[]) => useAssetTimelineMock(...args),
  useDeleteAsset: () => useDeleteAssetMock(),
  useChangeAssetStatus: () => useChangeAssetStatusMock(),
  useChangeAssetLocation: () => useChangeAssetLocationMock(),
}));

const useAssetStatusesMock = vi.fn();
vi.mock("../../src/hooks/use-asset-statuses", () => ({
  useAssetStatuses: (...args: unknown[]) => useAssetStatusesMock(...args),
}));

vi.mock("../../src/components/assets/asset-files-manager", () => ({
  AssetFilesManager: () => <div>files-manager</div>,
}));

const baseAsset = {
  id: "asset-1",
  name: "Truck 1",
  internalNumber: "AST-0001",
  categoryId: "cat-1",
  currentStatusId: "status-available",
  category: { id: "cat-1", name: "Vehicles" },
  currentStatus: { id: "status-available", name: "Available", isAvailableForRental: true },
  customFields: {},
  images: [],
  documents: [],
  manufacturer: null,
  model: null,
  sku: null,
  serialNumber: null,
  barcode: null,
  description: null,
  isRentable: true,
  purchasePriceMinor: null,
  purchaseCurrency: null,
  replacementValueMinor: null,
  replacementCurrency: null,
  purchaseDate: null,
  currentLocationText: null,
  conditionNotes: null,
};

describe("AssetDetailPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useAssetTimelineMock.mockReturnValue({ data: [] });
    useDeleteAssetMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useAssetStatusesMock.mockReturnValue({
      data: [
        { id: "status-available", name: "Available" },
        { id: "status-reserved", name: "Reserved" },
      ],
    });
  });

  it("renders the asset header with name, internal number, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetMock.mockReturnValue({ data: baseAsset, isLoading: false });
    useChangeAssetStatusMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useChangeAssetLocationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    renderWithProviders(<AssetDetailPage />);

    expect(screen.getByRole("heading", { name: "Truck 1" })).toBeInTheDocument();
    expect(screen.getByText("AST-0001")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  // 8. Status change flow
  it("changes the asset's status through the status change action", async () => {
    usePermissionMock.mockReturnValue(true);
    useAssetMock.mockReturnValue({ data: baseAsset, isLoading: false });
    const changeStatusMutateAsync = vi.fn().mockResolvedValue(undefined);
    useChangeAssetStatusMock.mockReturnValue({
      mutateAsync: changeStatusMutateAsync,
      isPending: false,
    });
    useChangeAssetLocationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<AssetDetailPage />);

    await user.click(screen.getByRole("button", { name: /change status/i }));
    await user.selectOptions(screen.getByRole("combobox"), "status-reserved");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(changeStatusMutateAsync).toHaveBeenCalledWith({
        id: "asset-1",
        statusId: "status-reserved",
      }),
    );
  });

  it("shows an unavailable indicator for a non-rentable-available status", () => {
    usePermissionMock.mockReturnValue(false);
    useAssetMock.mockReturnValue({
      data: {
        ...baseAsset,
        currentStatus: { id: "status-retired", name: "Retired", isAvailableForRental: false },
      },
      isLoading: false,
    });
    useChangeAssetStatusMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useChangeAssetLocationMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    renderWithProviders(<AssetDetailPage />);

    expect(screen.getByText("Retired")).toBeInTheDocument();
  });
});
