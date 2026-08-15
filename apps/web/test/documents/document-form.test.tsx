import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentForm } from "../../src/components/documents/document-form";
import i18n from "../../src/lib/i18n";
import type { DocumentFormValues } from "../../src/lib/validation";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const useCustomersMock = vi.fn();
vi.mock("../../src/hooks/use-customers", () => ({
  useCustomers: (...args: unknown[]) => useCustomersMock(...args),
}));

const useAssetsMock = vi.fn();
vi.mock("../../src/hooks/use-assets", () => ({
  useAssets: (...args: unknown[]) => useAssetsMock(...args),
}));

const useRentalsMock = vi.fn();
vi.mock("../../src/hooks/use-rentals", () => ({
  useRentals: (...args: unknown[]) => useRentalsMock(...args),
}));

const useActiveDocumentTemplateLanguagesMock = vi.fn();
vi.mock("../../src/hooks/use-document-templates", () => ({
  useActiveDocumentTemplateLanguages: (...args: unknown[]) =>
    useActiveDocumentTemplateLanguagesMock(...args),
}));

function renderForm(
  queryClient: QueryClient,
  initialValues: Partial<DocumentFormValues>,
): ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <DocumentForm
          onSubmit={vi.fn()}
          isPending={false}
          submitLabel="Save"
          submittingLabel="Saving"
          initialValues={initialValues}
        />
      </I18nextProvider>
    </QueryClientProvider>
  );
}

describe("DocumentForm async pre-fill (D-067)", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useCustomersMock.mockReturnValue({ data: { items: [] } });
    useAssetsMock.mockReturnValue({ data: { items: [] } });
    useActiveDocumentTemplateLanguagesMock.mockReturnValue({ data: { languages: [] } });
  });

  it("applies a pre-filled rentalId once the async rental list resolves, even though it was still empty at mount", async () => {
    // Simulates the real-world race: the rentals list is still loading when
    // the form first mounts, so no matching <option> exists yet.
    useRentalsMock.mockReturnValue({ data: undefined });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      renderForm(queryClient, { documentType: "CONTRACT", rentalId: "rental-42" }),
    );

    const select = screen.getByLabelText("Rentals") as HTMLSelectElement;
    expect(select.value).toBe("");

    // Rentals resolve after mount, now including the pre-filled rentalId's option.
    useRentalsMock.mockReturnValue({
      data: { items: [{ id: "rental-42", rentalNumber: "R-0042" }] },
    });
    rerender(renderForm(queryClient, { documentType: "CONTRACT", rentalId: "rental-42" }));

    await waitFor(() => expect(select.value).toBe("rental-42"));
  });

  it("leaves the rental select on its default option when no rentalId was pre-filled", async () => {
    useRentalsMock.mockReturnValue({
      data: { items: [{ id: "rental-42", rentalNumber: "R-0042" }] },
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(renderForm(queryClient, { documentType: "CONTRACT" }));

    const select = screen.getByLabelText("Rentals") as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(""));
  });
});

describe("DocumentForm document-language picker (D-068)", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useCustomersMock.mockReturnValue({ data: { items: [] } });
    useAssetsMock.mockReturnValue({ data: { items: [] } });
    useRentalsMock.mockReturnValue({ data: { items: [] } });
  });

  it("hides the language picker when at most one active template exists for the document type", async () => {
    useActiveDocumentTemplateLanguagesMock.mockReturnValue({ data: { languages: ["en"] } });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(renderForm(queryClient, { documentType: "CONTRACT" }));

    expect(screen.queryByLabelText("Document language")).not.toBeInTheDocument();
  });

  it("shows a language picker with a Tenant default option when 2+ active templates exist", async () => {
    useActiveDocumentTemplateLanguagesMock.mockReturnValue({
      data: { languages: [null, "en", "ru"] },
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(renderForm(queryClient, { documentType: "CONTRACT" }));

    const select = (await screen.findByLabelText("Document language")) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((option) => option.textContent);
    expect(optionLabels).toEqual(["Tenant default", "English", "Russian"]);
    // Defaults to the "Tenant default" (empty-string, EmptyToNull) option.
    expect(select.value).toBe("");
  });
});
