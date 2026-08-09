import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DocumentsPage from "../../src/app/app/documents/page";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useDocumentsMock = vi.fn();
const useDocumentsSummaryMock = vi.fn();
vi.mock("../../src/hooks/use-documents", () => ({
  useDocuments: (...args: unknown[]) => useDocumentsMock(...args),
  useDocumentsSummary: (...args: unknown[]) => useDocumentsSummaryMock(...args),
}));

const baseDocument = {
  id: "doc-1",
  documentNumber: "DOC-2026-000001",
  documentType: "CONTRACT",
  customTypeName: null,
  status: "DRAFT",
  customer: { firstName: "Jane", lastName: "Doe" },
};

describe("DocumentsPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useDocumentsSummaryMock.mockReturnValue({
      total: 4,
      draft: 1,
      sent: 2,
      signed: 1,
      isLoading: false,
      isError: false,
    });
  });

  it("renders a row per document with number, type, customer, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentsMock.mockReturnValue({
      data: { items: [baseDocument], total: 1, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DocumentsPage />);
    const table = within(screen.getByRole("table"));

    expect(table.getByText("DOC-2026-000001")).toBeInTheDocument();
    expect(table.getByText("Jane Doe")).toBeInTheDocument();
    expect(table.getByRole("cell", { name: "Draft" })).toBeInTheDocument();
  });

  it("renders the Smart Summary with real counts from useDocumentsSummary", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentsMock.mockReturnValue({
      data: { items: [], total: 4, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DocumentsPage />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Total documents")).toBeInTheDocument();
    const sentCard = screen.getByText("2").closest("div");
    expect(sentCard).not.toBeNull();
    expect(within(sentCard as HTMLElement).getByText("Sent")).toBeInTheDocument();
  });

  it("renders the empty state when there are no documents", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DocumentsPage />);

    expect(screen.getByText(/no documents found/i)).toBeInTheDocument();
  });

  it("shows an error message when the query fails", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    renderWithProviders(<DocumentsPage />);

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it("updates the search query param as the user types", async () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<DocumentsPage />);
    await user.type(screen.getByPlaceholderText(/search documents/i), "DOC-1");

    await waitFor(() => {
      expect(useDocumentsMock).toHaveBeenLastCalledWith(
        "tenant-1",
        expect.objectContaining({ search: "DOC-1" }),
      );
    });
  });

  it("filters by status", async () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<DocumentsPage />);
    await user.selectOptions(screen.getByDisplayValue(/all statuses/i), "SIGNED");

    expect(useDocumentsMock).toHaveBeenLastCalledWith(
      "tenant-1",
      expect.objectContaining({ status: "SIGNED" }),
    );
  });

  it("hides the new document button without documents.create", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DocumentsPage />);

    expect(screen.queryByRole("link", { name: /new document/i })).not.toBeInTheDocument();
  });

  it("shows the new document button with documents.create", () => {
    usePermissionMock.mockReturnValue(true);
    useDocumentsMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DocumentsPage />);

    expect(screen.getByRole("link", { name: /new document/i })).toBeInTheDocument();
  });
});
