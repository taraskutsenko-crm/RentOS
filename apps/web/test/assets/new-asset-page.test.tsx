import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewAssetPage from "../../src/app/app/assets/new/page";
import { ApiError } from "../../src/lib/api-client";
import { renderWithProviders } from "../test-utils";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const useCurrentTenantRoleMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  useCurrentTenantRole: () => useCurrentTenantRoleMock(),
  usePermission: () => true,
}));

const useCreateAssetMock = vi.fn();
vi.mock("../../src/hooks/use-assets", () => ({
  useCreateAsset: () => useCreateAssetMock(),
}));

// Isolate the page's own orchestration (create + redirect / error display)
// from AssetForm's internal field rendering, already covered by asset-form.test.tsx.
vi.mock("../../src/components/assets/asset-form", () => ({
  AssetForm: (props: {
    onSubmit: (input: unknown) => Promise<void>;
    errorMessage?: string | null;
  }) => (
    <div>
      {props.errorMessage && <p>{props.errorMessage}</p>}
      <button
        onClick={() =>
          void props.onSubmit({ name: "Truck 1", internalNumber: "AST-0001", categoryId: "cat-1" })
        }
      >
        submit-asset-form
      </button>
    </div>
  ),
}));

describe("NewAssetPage", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useCurrentTenantRoleMock.mockReturnValue({
      data: { tenant: { defaultCurrency: "USD" }, role: "OWNER" },
    });
  });

  // 6. Successful asset creation
  it("creates the asset and navigates to its detail page", async () => {
    const mutateAsyncMock = vi.fn().mockResolvedValue({ id: "new-asset-id" });
    useCreateAssetMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<NewAssetPage />);
    await user.click(screen.getByText("submit-asset-form"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/app/assets/new-asset-id"));
  });

  // 10. Error display
  it("shows the backend error message when creation fails", () => {
    useCreateAssetMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: true,
      error: new ApiError("An asset with this internalNumber already exists", 409),
    });

    renderWithProviders(<NewAssetPage />);

    expect(
      screen.getByText(/an asset with this internalnumber already exists/i),
    ).toBeInTheDocument();
  });
});
