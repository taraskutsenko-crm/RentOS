import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentForm } from "../../src/components/documents/document-form";
import i18n, { createI18nInstance } from "../../src/lib/i18n";
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
// Default to `{ data: undefined }` so the many existing tests below (which
// never exercise the RETURN_PROTOCOL Handover-comparison path) don't have
// to each mock this out individually — useRental/useDocument are still
// called unconditionally (React's rules of hooks), just with a null id.
const useRentalMock = vi.fn();
useRentalMock.mockReturnValue({ data: undefined });
vi.mock("../../src/hooks/use-rentals", () => ({
  useRentals: (...args: unknown[]) => useRentalsMock(...args),
  useRental: (...args: unknown[]) => useRentalMock(...args),
}));

const useDocumentMock = vi.fn();
useDocumentMock.mockReturnValue({ data: undefined });
vi.mock("../../src/hooks/use-documents", () => ({
  useDocument: (...args: unknown[]) => useDocumentMock(...args),
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

describe("Handover/Return condition notes (D-094 regression)", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useCustomersMock.mockReturnValue({ data: { items: [] } });
    useAssetsMock.mockReturnValue({ data: { items: [] } });
    useRentalsMock.mockReturnValue({ data: { items: [] } });
    useActiveDocumentTemplateLanguagesMock.mockReturnValue({ data: { languages: [] } });
  });

  it("shows only the general Notes field for a CONTRACT — no condition/damage fields", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(renderForm(queryClient, { documentType: "CONTRACT" }));

    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.queryByLabelText("Asset condition")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Damage description")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Missing items / accessories")).not.toBeInTheDocument();
  });

  it("shows asset condition and damage fields, but not missing items, for a Handover Protocol", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(renderForm(queryClient, { documentType: "HANDOVER_PROTOCOL" }));

    expect(screen.getByLabelText("Asset condition")).toBeInTheDocument();
    expect(screen.getByLabelText("Damage description")).toBeInTheDocument();
    expect(screen.queryByLabelText("Missing items / accessories")).not.toBeInTheDocument();
  });

  it("shows asset condition, damage, and missing items fields for a Return Protocol", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(renderForm(queryClient, { documentType: "RETURN_PROTOCOL" }));

    expect(screen.getByLabelText("Asset condition")).toBeInTheDocument();
    expect(screen.getByLabelText("Damage description")).toBeInTheDocument();
    expect(screen.getByLabelText("Missing items / accessories")).toBeInTheDocument();
  });

  it("shows the universal optional condition fields (meter/fuel/battery/accessories) for both Handover and Return", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(renderForm(queryClient, { documentType: "HANDOVER_PROTOCOL" }));

    expect(screen.getByLabelText("Meter / odometer / operating hours")).toBeInTheDocument();
    expect(screen.getByLabelText("Fuel level")).toBeInTheDocument();
    expect(screen.getByLabelText("Battery / charge level")).toBeInTheDocument();
    expect(screen.getByLabelText("Accessories / equipment checklist")).toBeInTheDocument();
  });
});

describe("Return Protocol compares against the linked Handover Protocol (D-107)", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useCustomersMock.mockReturnValue({ data: { items: [] } });
    useAssetsMock.mockReturnValue({ data: { items: [] } });
    useRentalsMock.mockReturnValue({
      data: { items: [{ id: "rental-1", rentalNumber: "R-0001" }] },
    });
    useActiveDocumentTemplateLanguagesMock.mockReturnValue({ data: { languages: [] } });
  });

  it("shows no reference block when the rental has no linked Handover Protocol", () => {
    useRentalMock.mockReturnValue({ data: { documents: [] } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(renderForm(queryClient, { documentType: "RETURN_PROTOCOL", rentalId: "rental-1" }));

    expect(screen.queryByText("Condition at handover (for comparison)")).not.toBeInTheDocument();
  });

  it("shows the linked Handover Protocol's recorded condition as a read-only reference", () => {
    useRentalMock.mockReturnValue({
      data: {
        documents: [
          {
            id: "doc-handover",
            documentType: "HANDOVER_PROTOCOL",
            status: "SIGNED",
            customTypeName: null,
            documentNumber: "HD-000001",
            title: null,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
    });
    useDocumentMock.mockReturnValue({
      data: {
        currentVersionNumber: 1,
        versions: [
          {
            versionNumber: 1,
            businessDataSnapshot: {
              conditionNotes: {
                assetCondition: "Good, minor scratches",
                meterReading: "12345 km",
                fuelLevel: "Full",
              },
            },
          },
        ],
      },
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(renderForm(queryClient, { documentType: "RETURN_PROTOCOL", rentalId: "rental-1" }));

    expect(screen.getByText("Condition at handover (for comparison)")).toBeInTheDocument();
    // The value sits as a sibling text node after a <span> label inside the
    // same <p> (see the reference block's JSX) — match against the whole
    // paragraph's text content rather than an exact standalone node.
    expect(screen.getByText(/Good, minor scratches/)).toBeInTheDocument();
    expect(screen.getByText(/12345 km/)).toBeInTheDocument();
    expect(screen.getByText(/Full/)).toBeInTheDocument();
  });
});

describe("Document language stays independent of UI language (D-069 regression)", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useCustomersMock.mockReturnValue({ data: { items: [] } });
    useAssetsMock.mockReturnValue({ data: { items: [] } });
    useRentalsMock.mockReturnValue({ data: { items: [] } });
    useActiveDocumentTemplateLanguagesMock.mockReturnValue({
      data: { languages: [null, "en", "ru"] },
    });
  });

  it("still offers the same document-language options and default selection when the UI language is Russian", async () => {
    // The i18n SSR/hydration fix (D-069) introduced createI18nInstance and
    // per-mount i18next instances — this proves that swap didn't couple the
    // Document.templateLanguage field to whichever UI language is active.
    const russianUi = createI18nInstance("ru");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={russianUi}>
          <DocumentForm
            onSubmit={vi.fn()}
            isPending={false}
            submitLabel="Save"
            submittingLabel="Saving"
            initialValues={{ documentType: "CONTRACT" }}
          />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const select = (await screen.findByLabelText("Язык документа")) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((option) => option.textContent);
    // Language *names* in the picker are always shown in English by design
    // (getLocaleMetadata().englishName) — independent of the surrounding UI
    // language, which only translates the field's own label/hint text.
    expect(optionLabels).toEqual(["Значение арендатора по умолчанию", "English", "Russian"]);
    expect(select.value).toBe("");
  });
});
