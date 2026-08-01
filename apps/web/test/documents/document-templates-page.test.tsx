import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DocumentTemplatesPage from "../../src/app/app/documents/templates/page";
import { renderWithProviders } from "../test-utils";

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useDocumentTemplatesMock = vi.fn();
vi.mock("../../src/hooks/use-document-templates", () => ({
  useDocumentTemplates: (...args: unknown[]) => useDocumentTemplatesMock(...args),
}));

const baseTemplate = {
  id: "tpl-1",
  documentType: "CONTRACT",
  name: "Standard rental contract",
  status: "ACTIVE",
  versionCount: 2,
};

describe("DocumentTemplatesPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
  });

  it("renders a row per template with name, type, status, and version count", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentTemplatesMock.mockReturnValue({
      data: { items: [baseTemplate], total: 1, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DocumentTemplatesPage />);

    expect(screen.getByText("Standard rental contract")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Active" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
  });

  it("renders the empty state when there are no templates", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentTemplatesMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DocumentTemplatesPage />);

    expect(screen.getByText(/no templates found/i)).toBeInTheDocument();
  });

  it("hides the new template button without documents.templates.manage", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentTemplatesMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DocumentTemplatesPage />);

    expect(screen.queryByRole("link", { name: /new template/i })).not.toBeInTheDocument();
  });

  it("shows the new template button with documents.templates.manage", () => {
    usePermissionMock.mockReturnValue(true);
    useDocumentTemplatesMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DocumentTemplatesPage />);

    expect(screen.getByRole("link", { name: /new template/i })).toBeInTheDocument();
  });
});
