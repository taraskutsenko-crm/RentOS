import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalDocumentDetailPage from "../../src/app/portal/(shell)/documents/[id]/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "doc-1" }),
}));

const usePortalDocumentMock = vi.fn();
const usePortalDocumentPreviewMock = vi.fn();
const usePortalDocumentSignatureRequestsMock = vi.fn();
const useSignPortalDocumentMock = vi.fn();
vi.mock("../../src/hooks/use-portal-documents", () => ({
  usePortalDocument: (...args: unknown[]) => usePortalDocumentMock(...args),
  usePortalDocumentPreview: (...args: unknown[]) => usePortalDocumentPreviewMock(...args),
  usePortalDocumentSignatureRequests: (...args: unknown[]) =>
    usePortalDocumentSignatureRequestsMock(...args),
  useSignPortalDocument: () => useSignPortalDocumentMock(),
  portalDocumentPdfUrl: (id: string) => `http://api.test/portal/documents/${id}/pdf`,
}));

function baseDocument() {
  return {
    id: "doc-1",
    documentNumber: "DOC-000001",
    documentType: "CONTRACT",
    customTypeName: null,
    status: "SENT",
    title: "Rental contract",
  };
}

describe("PortalDocumentDetailPage", () => {
  beforeEach(() => {
    usePortalDocumentPreviewMock.mockReturnValue({ data: { html: "<p>Preview</p>" } });
    useSignPortalDocumentMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders the document title and status", () => {
    usePortalDocumentMock.mockReturnValue({
      data: baseDocument(),
      isLoading: false,
      isError: false,
    });
    usePortalDocumentSignatureRequestsMock.mockReturnValue({ data: [] });

    renderWithProviders(<PortalDocumentDetailPage />);

    expect(screen.getByRole("heading", { name: /rental contract/i })).toBeInTheDocument();
  });

  it("shows a sign button for a pending signature request and calls the sign mutation", async () => {
    usePortalDocumentMock.mockReturnValue({
      data: baseDocument(),
      isLoading: false,
      isError: false,
    });
    usePortalDocumentSignatureRequestsMock.mockReturnValue({
      data: [{ id: "sig-1", status: "REQUESTED" }],
    });
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    useSignPortalDocumentMock.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<PortalDocumentDetailPage />);
    await user.click(screen.getByRole("button", { name: /sign document/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        documentId: "doc-1",
        signatureRequestId: "sig-1",
      }),
    );
  });

  it("does not show a sign button for an already-signed request", () => {
    usePortalDocumentMock.mockReturnValue({
      data: baseDocument(),
      isLoading: false,
      isError: false,
    });
    usePortalDocumentSignatureRequestsMock.mockReturnValue({
      data: [{ id: "sig-1", status: "SIGNED" }],
    });

    renderWithProviders(<PortalDocumentDetailPage />);

    expect(screen.queryByRole("button", { name: /sign document/i })).not.toBeInTheDocument();
  });
});
