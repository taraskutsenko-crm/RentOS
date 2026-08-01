import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DocumentDetailPage from "../../src/app/app/documents/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "doc-1" }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const useDocumentMock = vi.fn();
const useDocumentTimelineMock = vi.fn();
const useDocumentPreviewMock = vi.fn();
const useDocumentShareLinksMock = vi.fn();
const useDocumentEmailDeliveriesMock = vi.fn();
const useDocumentSignatureRequestsMock = vi.fn();
const useDeleteDocumentMock = vi.fn();
const useMarkDocumentReadyMock = vi.fn();
const useMarkDocumentSentMock = vi.fn();
const useMarkDocumentViewedMock = vi.fn();
const useSignDocumentMock = vi.fn();
const useRejectDocumentMock = vi.fn();
const useVoidDocumentMock = vi.fn();
const useArchiveDocumentMock = vi.fn();
const useDuplicateDocumentMock = vi.fn();
const useRegenerateDocumentPdfMock = vi.fn();
const useCreateDocumentShareLinkMock = vi.fn();
const useDisableDocumentShareLinkMock = vi.fn();
const useSendDocumentEmailMock = vi.fn();
const useRetryDocumentEmailMock = vi.fn();
const useRequestDocumentSignatureMock = vi.fn();
const useRefreshDocumentSignatureMock = vi.fn();
const useCancelDocumentSignatureMock = vi.fn();

vi.mock("../../src/hooks/use-documents", () => ({
  useDocument: (...args: unknown[]) => useDocumentMock(...args),
  useDocumentTimeline: (...args: unknown[]) => useDocumentTimelineMock(...args),
  useDocumentPreview: (...args: unknown[]) => useDocumentPreviewMock(...args),
  useDocumentShareLinks: (...args: unknown[]) => useDocumentShareLinksMock(...args),
  useDocumentEmailDeliveries: (...args: unknown[]) => useDocumentEmailDeliveriesMock(...args),
  useDocumentSignatureRequests: (...args: unknown[]) => useDocumentSignatureRequestsMock(...args),
  useDeleteDocument: () => useDeleteDocumentMock(),
  useMarkDocumentReady: () => useMarkDocumentReadyMock(),
  useMarkDocumentSent: () => useMarkDocumentSentMock(),
  useMarkDocumentViewed: () => useMarkDocumentViewedMock(),
  useSignDocument: () => useSignDocumentMock(),
  useRejectDocument: () => useRejectDocumentMock(),
  useVoidDocument: () => useVoidDocumentMock(),
  useArchiveDocument: () => useArchiveDocumentMock(),
  useDuplicateDocument: () => useDuplicateDocumentMock(),
  useRegenerateDocumentPdf: () => useRegenerateDocumentPdfMock(),
  useCreateDocumentShareLink: () => useCreateDocumentShareLinkMock(),
  useDisableDocumentShareLink: () => useDisableDocumentShareLinkMock(),
  useSendDocumentEmail: () => useSendDocumentEmailMock(),
  useRetryDocumentEmail: () => useRetryDocumentEmailMock(),
  useRequestDocumentSignature: () => useRequestDocumentSignatureMock(),
  useRefreshDocumentSignature: () => useRefreshDocumentSignatureMock(),
  useCancelDocumentSignature: () => useCancelDocumentSignatureMock(),
  documentPdfUrl: (tenantId: string | null, id: string) =>
    `http://api.test/tenants/${tenantId}/documents/${id}/pdf`,
}));

function baseDocument(status: string) {
  return {
    id: "doc-1",
    documentNumber: "DOC-2026-000001",
    documentType: "CONTRACT",
    customTypeName: null,
    status,
    currentVersionNumber: 1,
    versions: [{ id: "v1", versionNumber: 1, createdAt: "2026-08-01T00:00:00Z", reason: null }],
  };
}

describe("DocumentDetailPage", () => {
  beforeEach(() => {
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useDocumentTimelineMock.mockReturnValue({ data: [] });
    useDocumentPreviewMock.mockReturnValue({ data: undefined });
    useDocumentShareLinksMock.mockReturnValue({ data: [] });
    useDocumentEmailDeliveriesMock.mockReturnValue({ data: [] });
    useDocumentSignatureRequestsMock.mockReturnValue({ data: [] });
    useDeleteDocumentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useMarkDocumentReadyMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useMarkDocumentSentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useMarkDocumentViewedMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useSignDocumentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRejectDocumentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useVoidDocumentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useArchiveDocumentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useDuplicateDocumentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRegenerateDocumentPdfMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCreateDocumentShareLinkMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useDisableDocumentShareLinkMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useSendDocumentEmailMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRetryDocumentEmailMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRequestDocumentSignatureMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRefreshDocumentSignatureMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useCancelDocumentSignatureMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders the document header with number, type, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentMock.mockReturnValue({ data: baseDocument("DRAFT"), isLoading: false });

    renderWithProviders(<DocumentDetailPage />);

    expect(screen.getByRole("heading", { name: "DOC-2026-000001" })).toBeInTheDocument();
    expect(screen.getByText(/rental contract/i)).toBeInTheDocument();
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  it("shows the mark ready action for a DRAFT document with documents.update", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "documents.update");
    useDocumentMock.mockReturnValue({ data: baseDocument("DRAFT"), isLoading: false });
    const markReadyMutateAsync = vi.fn().mockResolvedValue(undefined);
    useMarkDocumentReadyMock.mockReturnValue({
      mutateAsync: markReadyMutateAsync,
      isPending: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<DocumentDetailPage />);
    await user.click(screen.getByRole("button", { name: /mark ready/i }));

    await waitFor(() => expect(markReadyMutateAsync).toHaveBeenCalledWith({ id: "doc-1" }));
  });

  it("shows the send action only for a READY document", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "documents.send");
    useDocumentMock.mockReturnValue({ data: baseDocument("READY"), isLoading: false });

    renderWithProviders(<DocumentDetailPage />);

    expect(screen.getByRole("button", { name: /mark sent/i })).toBeInTheDocument();
  });

  it("hides every lifecycle action when the user has no document permissions", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentMock.mockReturnValue({ data: baseDocument("SENT"), isLoading: false });

    renderWithProviders(<DocumentDetailPage />);

    expect(screen.queryByRole("button", { name: /mark sent/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark signed/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
  });

  it("shows the error message when a lifecycle action fails", async () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "documents.update");
    useDocumentMock.mockReturnValue({ data: baseDocument("DRAFT"), isLoading: false });
    useMarkDocumentReadyMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Document has no items")),
      isPending: false,
    });
    const user = userEvent.setup();

    renderWithProviders(<DocumentDetailPage />);
    await user.click(screen.getByRole("button", { name: /mark ready/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
