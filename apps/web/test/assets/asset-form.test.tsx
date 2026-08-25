import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssetForm } from "../../src/components/assets/asset-form";
import type { AssetInput } from "../../src/hooks/use-assets";
import { renderWithProviders } from "../test-utils";

const useAssetCategoryTreeMock = vi.fn();
vi.mock("../../src/hooks/use-asset-categories", () => ({
  useAssetCategoryTree: (...args: unknown[]) => useAssetCategoryTreeMock(...args),
}));

const useAssetStatusesMock = vi.fn();
vi.mock("../../src/hooks/use-asset-statuses", () => ({
  useAssetStatuses: (...args: unknown[]) => useAssetStatusesMock(...args),
}));

const useAssetCustomFieldsForCategoryMock = vi.fn();
vi.mock("../../src/hooks/use-asset-custom-fields", () => ({
  useAssetCustomFieldsForCategory: (...args: unknown[]) =>
    useAssetCustomFieldsForCategoryMock(...args),
}));

function setup(customFields: unknown[] = []) {
  useAssetCategoryTreeMock.mockReturnValue({
    data: [{ id: "cat-1", name: "Vehicles", isActive: true, children: [] }],
  });
  useAssetStatusesMock.mockReturnValue({
    data: [{ id: "status-1", name: "Available", code: "AVAILABLE" }],
  });
  useAssetCustomFieldsForCategoryMock.mockReturnValue({ data: customFields });
}

describe("AssetForm", () => {
  // 3. Create form validation
  it("shows validation errors for missing required fields", async () => {
    setup();
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AssetForm
        tenantId="tenant-1"
        onSubmit={onSubmit}
        isPending={false}
        submitLabel="Save"
        submittingLabel="Saving…"
      />,
    );

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findAllByText(/this field is required/i)).not.toHaveLength(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // 4. Dynamic custom fields
  it("loads and renders custom fields applicable to the selected category", async () => {
    setup([
      {
        id: "field-1",
        key: "mileage",
        name: "Mileage",
        fieldType: "INTEGER",
        isRequired: false,
        options: null,
      },
    ]);
    const user = userEvent.setup();

    renderWithProviders(
      <AssetForm
        tenantId="tenant-1"
        onSubmit={vi.fn()}
        isPending={false}
        submitLabel="Save"
        submittingLabel="Saving…"
      />,
    );

    await user.selectOptions(screen.getByLabelText(/^category$/i), "cat-1");

    expect(await screen.findByText("Mileage")).toBeInTheDocument();
    expect(useAssetCustomFieldsForCategoryMock).toHaveBeenCalledWith("tenant-1", "cat-1");
  });

  // 5. Required custom-field validation
  it("blocks submission when a required custom field is missing", async () => {
    setup([
      {
        id: "field-1",
        key: "vin",
        name: "VIN",
        fieldType: "TEXT",
        isRequired: true,
        options: null,
      },
    ]);
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <AssetForm
        tenantId="tenant-1"
        onSubmit={onSubmit}
        isPending={false}
        submitLabel="Save"
        submittingLabel="Saving…"
      />,
    );

    await user.type(screen.getByLabelText(/^name$/i), "Truck 1");
    await user.type(screen.getByLabelText(/internal number/i), "AST-0001");
    await user.selectOptions(screen.getByLabelText(/^category$/i), "cat-1");
    await screen.findByText(/vin/i);

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/this field is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // 12. Money input conversion
  it("converts the display purchase price into integer minor units on submit", async () => {
    setup();
    const onSubmit = vi.fn<(input: AssetInput) => Promise<void>>().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(
      <AssetForm
        tenantId="tenant-1"
        defaultCurrency="USD"
        onSubmit={onSubmit}
        isPending={false}
        submitLabel="Save"
        submittingLabel="Saving…"
      />,
    );

    await user.type(screen.getByLabelText(/^name$/i), "Truck 1");
    await user.type(screen.getByLabelText(/internal number/i), "AST-0001");
    await user.selectOptions(screen.getByLabelText(/^category$/i), "cat-1");
    await user.type(screen.getByLabelText(/purchase price/i), "1234.56");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submitted = onSubmit.mock.calls[0]?.[0];
    expect(submitted?.purchasePriceMinor).toBe(123456);
    expect(submitted?.purchaseCurrency).toBe("USD");
  });

  it("pre-fills fields from initialValues (edit mode)", () => {
    setup();

    renderWithProviders(
      <AssetForm
        tenantId="tenant-1"
        initialValues={{ name: "Existing Truck", internalNumber: "AST-9999" }}
        onSubmit={vi.fn()}
        isPending={false}
        submitLabel="Save"
        submittingLabel="Saving…"
      />,
    );

    expect(screen.getByLabelText(/^name$/i)).toHaveValue("Existing Truck");
    expect(screen.getByLabelText(/internal number/i)).toHaveValue("AST-9999");
  });
});
