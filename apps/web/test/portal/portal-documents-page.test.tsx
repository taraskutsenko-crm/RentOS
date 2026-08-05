import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalDocumentsPage from "../../src/app/portal/(shell)/documents/page";
import { renderWithProviders } from "../test-utils";

const usePortalDocumentsMock = vi.fn();
vi.mock("../../src/hooks/use-portal-documents", () => ({
  usePortalDocuments: (...args: unknown[]) => usePortalDocumentsMock(...args),
}));

const baseDocument = {
  id: "doc-1",
  documentNumber: "DOC-2026-000001",
  title: null,
  documentType: "CONTRACT",
  customTypeName: null,
  status: "SIGNED",
};

describe("PortalDocumentsPage", () => {
  beforeEach(() => {
    usePortalDocumentsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
  });

  it("renders a row per document, falling back to documentNumber when title is null", () => {
    usePortalDocumentsMock.mockReturnValue({
      data: { items: [baseDocument], total: 1, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PortalDocumentsPage />);
    const table = within(screen.getByRole("table"));

    expect(table.getByText("DOC-2026-000001")).toBeInTheDocument();
    expect(table.getByRole("cell", { name: "Signed" })).toBeInTheDocument();
  });

  it("renders the empty state when there are no documents", () => {
    renderWithProviders(<PortalDocumentsPage />);

    expect(screen.getByText(/no documents found/i)).toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PortalDocumentsPage />);

    await user.selectOptions(screen.getByDisplayValue(/all statuses/i), "SIGNED");

    expect(usePortalDocumentsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "SIGNED" }),
    );
  });

  it("links each row to the document's detail page", () => {
    usePortalDocumentsMock.mockReturnValue({
      data: { items: [baseDocument], total: 1, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PortalDocumentsPage />);

    for (const link of screen.getAllByRole("link", { name: /DOC-2026-000001/ })) {
      expect(link).toHaveAttribute("href", "/portal/documents/doc-1");
    }
  });
});
