import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DocumentTemplateDetailPage from "../../src/app/app/documents/templates/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "tpl-1" }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useDocumentTemplateMock = vi.fn();
const previewMutateMock = vi.fn();
let previewMutationState: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: { html: string } | undefined;
};

vi.mock("../../src/hooks/use-document-templates", () => ({
  useDocumentTemplate: (...args: unknown[]) => useDocumentTemplateMock(...args),
  useUpdateDocumentTemplateMeta: () => ({ mutateAsync: vi.fn() }),
  useUpdateDocumentTemplateContent: () => ({ mutateAsync: vi.fn() }),
  useRestoreDocumentTemplateVersion: () => ({ mutateAsync: vi.fn() }),
  useActivateDocumentTemplate: () => ({ mutateAsync: vi.fn() }),
  useArchiveDocumentTemplate: () => ({ mutateAsync: vi.fn() }),
  useRestoreDocumentTemplate: () => ({ mutateAsync: vi.fn() }),
  useDuplicateDocumentTemplate: () => ({ mutateAsync: vi.fn() }),
  usePreviewDocumentTemplate: () => ({
    mutate: previewMutateMock,
    ...previewMutationState,
  }),
}));

// A LEGACY version (no recognized blocks-v1 variablesSchema) keeps the page
// in Advanced-only mode, so TemplateBuilder (Tiptap) never mounts here —
// this file is about the preview-fetch wiring, not the visual editor.
const baseTemplate = {
  id: "tpl-1",
  tenantId: "tenant-1",
  documentType: "CONTRACT",
  name: "Standard rental contract",
  description: "",
  status: "DRAFT",
  currentVersionNumber: 1,
  createdByUserId: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  versions: [
    {
      id: "v1",
      templateId: "tpl-1",
      versionNumber: 1,
      htmlContent: "<h1>{{company.name}}</h1>",
      css: null,
      variablesSchema: null,
      createdByUserId: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

describe("DocumentTemplateDetailPage preview wiring", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    usePermissionMock.mockReturnValue(true);
    useDocumentTemplateMock.mockReturnValue({
      data: baseTemplate,
      isLoading: false,
      isError: false,
    });
    previewMutateMock.mockClear();
    previewMutationState = { isPending: false, isError: false, error: null, data: undefined };
  });

  it("fetches a preview automatically when the page loads, using the current draft content", () => {
    renderWithProviders(<DocumentTemplateDetailPage />);

    expect(previewMutateMock).toHaveBeenCalledTimes(1);
    expect(previewMutateMock).toHaveBeenCalledWith({
      documentType: "CONTRACT",
      htmlContent: "<h1>{{company.name}}</h1>",
      css: null,
    });
  });

  it("shows the resolved preview HTML once the mutation returns data", () => {
    previewMutationState = {
      isPending: false,
      isError: false,
      error: null,
      data: { html: "<h1>Acme Rentals</h1>" },
    };
    renderWithProviders(<DocumentTemplateDetailPage />);

    const iframe = screen.getByTitle("Preview") as HTMLIFrameElement;
    expect(iframe.srcdoc).toContain("Acme Rentals");
  });

  it("calls the preview mutation again when Refresh preview is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentTemplateDetailPage />);
    previewMutateMock.mockClear();

    await user.click(screen.getByRole("button", { name: "Refresh preview" }));

    expect(previewMutateMock).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when the preview mutation fails", () => {
    previewMutationState = {
      isPending: false,
      isError: true,
      error: new Error("boom"),
      data: undefined,
    };
    renderWithProviders(<DocumentTemplateDetailPage />);

    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
