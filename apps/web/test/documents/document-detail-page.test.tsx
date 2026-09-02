import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DocumentDetailPage from "../../src/app/app/documents/[id]/page";
import { renderWithProviders } from "../test-utils";

// jsdom has neither a real 2D canvas context nor ResizeObserver — this
// page's Signatures card can mount the shared SignaturePad (Havelio
// Signature System), so it needs the same minimal stand-ins as
// test/components/signature-pad.test.tsx (no shared mock exists to reuse
// across packages).
HTMLCanvasElement.prototype.getContext = vi.fn(
  () =>
    ({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    }) as never,
) as never;
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: "doc-1" }),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
const useTenantTimezoneMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
  useTenantTimezone: () => useTenantTimezoneMock(),
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
const useUploadDocumentFileMock = vi.fn();
const useDeleteDocumentFileMock = vi.fn();

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
  useUploadDocumentFile: () => useUploadDocumentFileMock(),
  useDeleteDocumentFile: () => useDeleteDocumentFileMock(),
  documentPdfUrl: (tenantId: string | null, id: string) =>
    `http://api.test/tenants/${tenantId}/documents/${id}/pdf`,
  documentFileUrl: (tenantId: string | null, documentId: string, fileId: string) =>
    `http://api.test/tenants/${tenantId}/documents/${documentId}/files/${fileId}/file`,
}));

const useCompanySignatureMock = vi.fn();
vi.mock("../../src/hooks/use-company-signature", () => ({
  useCompanySignature: (...args: unknown[]) => useCompanySignatureMock(...args),
  companySignatureFileUrl: (tenantId: string) =>
    `http://api.test/tenants/${tenantId}/company-signature/file`,
}));

const useDocumentSignaturesMock = vi.fn();
const useCaptureDocumentSignatureMock = vi.fn();
vi.mock("../../src/hooks/use-document-signatures", () => ({
  useDocumentSignatures: (...args: unknown[]) => useDocumentSignaturesMock(...args),
  useCaptureDocumentSignature: (...args: unknown[]) => useCaptureDocumentSignatureMock(...args),
  documentSignatureFileUrl: (tenantId: string, documentId: string, evidenceId: string) =>
    `http://api.test/tenants/${tenantId}/documents/${documentId}/signatures/${evidenceId}/file`,
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
    useUploadDocumentFileMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useDeleteDocumentFileMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useTenantTimezoneMock.mockReturnValue("America/New_York");
    useCompanySignatureMock.mockReturnValue({ data: { signature: null } });
    useDocumentSignaturesMock.mockReturnValue({ data: [] });
    useCaptureDocumentSignatureMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders the document header with number, type, and status", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentMock.mockReturnValue({ data: baseDocument("DRAFT"), isLoading: false });

    renderWithProviders(<DocumentDetailPage />);

    expect(screen.getByRole("heading", { name: "DOC-2026-000001" })).toBeInTheDocument();
    expect(screen.getByText(/rental contract/i)).toBeInTheDocument();
    expect(screen.getByText(/draft/i)).toBeInTheDocument();
  });

  // Email-delivery diagnosis task — a FAILED delivery's reason must be a
  // real, translated sentence via the coded errorCategory, never the raw
  // backend errorMessage string (which is always English regardless of the
  // UI's language — see DECISIONS.md, raw-text-leak fix).
  it("shows a translated, categorized reason for a FAILED delivery — never the raw errorMessage", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "documents.send");
    useDocumentMock.mockReturnValue({ data: baseDocument("SENT"), isLoading: false });
    useDocumentEmailDeliveriesMock.mockReturnValue({
      data: [
        {
          id: "delivery-1",
          recipientEmail: "customer@example.com",
          status: "FAILED",
          errorMessage: "535 Authentication failed for user apikey@smtp.example.com",
          errorCategory: "AUTH_FAILED",
        },
      ],
    });

    renderWithProviders(<DocumentDetailPage />);

    expect(
      screen.getByText(/the email account's credentials were rejected/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/apikey/)).not.toBeInTheDocument();
    expect(screen.queryByText(/535/)).not.toBeInTheDocument();
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

  it("renders a Related records card linking to the customer, rental, quote, and asset when present", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentMock.mockReturnValue({
      data: {
        ...baseDocument("DRAFT"),
        customer: { id: "cust-1", firstName: "Jane", lastName: "Doe" },
        rental: { id: "rental-1", rentalNumber: "RNT-000001" },
        quote: { id: "quote-1", quoteNumber: "Q-2026-000001" },
        asset: { id: "asset-1", name: "Generator A" },
      },
      isLoading: false,
    });

    renderWithProviders(<DocumentDetailPage />);

    expect(screen.getByText("Related records")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute(
      "href",
      "/app/customers/cust-1",
    );
    expect(screen.getByRole("link", { name: "RNT-000001" })).toHaveAttribute(
      "href",
      "/app/rentals/rental-1",
    );
    expect(screen.getByRole("link", { name: "Q-2026-000001" })).toHaveAttribute(
      "href",
      "/app/quotes/quote-1",
    );
    expect(screen.getByRole("link", { name: "Generator A" })).toHaveAttribute(
      "href",
      "/app/assets/asset-1",
    );
  });

  it("omits the Related records card entirely when no relation exists", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentMock.mockReturnValue({ data: baseDocument("DRAFT"), isLoading: false });

    renderWithProviders(<DocumentDetailPage />);

    expect(screen.queryByText("Related records")).not.toBeInTheDocument();
  });

  // Regression: direct print, without a manual Generate -> Download -> Print
  // round-trip -- see DECISIONS.md, direct print fix.
  it("hides the Print button until a preview has loaded", () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentMock.mockReturnValue({ data: baseDocument("DRAFT"), isLoading: false });
    useDocumentPreviewMock.mockReturnValue({ data: undefined });

    renderWithProviders(<DocumentDetailPage />);

    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
  });

  it("prints the preview iframe's own content directly when Print is clicked", async () => {
    usePermissionMock.mockReturnValue(false);
    useDocumentMock.mockReturnValue({ data: baseDocument("DRAFT"), isLoading: false });
    useDocumentPreviewMock.mockReturnValue({
      data: {
        html: "<html><body>Rendered document</body></html>",
        templateSource: "built_in_default",
      },
    });
    const user = userEvent.setup();

    renderWithProviders(<DocumentDetailPage />);

    const frame = screen.getByTitle("Preview") as HTMLIFrameElement;
    const printSpy = vi.fn();
    // jsdom gives every iframe a real contentWindow, but doesn't implement
    // window.print() -- stub it to verify the button calls the frame's own
    // print, not the outer app window's.
    Object.defineProperty(frame.contentWindow!, "print", { value: printSpy, writable: true });

    await user.click(screen.getByRole("button", { name: "Print" }));

    expect(printSpy).toHaveBeenCalledTimes(1);
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

  // Attachments (production-infrastructure pass) — staff-uploaded
  // ATTACHMENT/PHOTO evidence, e.g. Handover/Return condition photos.
  describe("attachments", () => {
    function documentWithFiles(status: string, files: Record<string, unknown>[]) {
      const doc = baseDocument(status);
      return { ...doc, versions: [{ ...doc.versions[0], files }] };
    }

    it("shows an upload control on a DRAFT document when the user can update it", () => {
      usePermissionMock.mockImplementation(
        (permission: string) => permission === "documents.update",
      );
      useDocumentMock.mockReturnValue({ data: documentWithFiles("DRAFT", []), isLoading: false });

      renderWithProviders(<DocumentDetailPage />);

      expect(screen.getByText(/no attachments yet/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /upload/i })).toBeInTheDocument();
    });

    it("hides the upload control once the document is no longer DRAFT (finalized/immutable)", () => {
      usePermissionMock.mockImplementation(
        (permission: string) => permission === "documents.update",
      );
      useDocumentMock.mockReturnValue({ data: documentWithFiles("READY", []), isLoading: false });

      renderWithProviders(<DocumentDetailPage />);

      expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
    });

    it("renders an uploaded photo as a thumbnail and an uploaded document as a download link", () => {
      usePermissionMock.mockReturnValue(false);
      useDocumentMock.mockReturnValue({
        data: documentWithFiles("DRAFT", [
          {
            id: "file-photo",
            format: "PHOTO",
            originalFileName: "damage.jpg",
            caption: "Front bumper scratch",
          },
          {
            id: "file-doc",
            format: "ATTACHMENT",
            originalFileName: "inspection.pdf",
            caption: null,
          },
        ]),
        isLoading: false,
      });

      renderWithProviders(<DocumentDetailPage />);

      expect(screen.getByAltText("Front bumper scratch")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "inspection.pdf" })).toHaveAttribute(
        "href",
        "http://api.test/tenants/tenant-1/documents/doc-1/files/file-doc/file",
      );
    });
  });

  describe("Signatures card (Havelio Signature System)", () => {
    it("does not render for a document type that isn't signature-eligible", () => {
      usePermissionMock.mockReturnValue(true);
      useDocumentMock.mockReturnValue({
        data: { ...baseDocument("DRAFT"), documentType: "DEPOSIT_RECEIPT" },
        isLoading: false,
      });

      renderWithProviders(<DocumentDetailPage />);

      expect(screen.queryByText("Signatures")).not.toBeInTheDocument();
    });

    it("shows Unsigned and both sign actions for a CONTRACT with no evidence yet", () => {
      usePermissionMock.mockImplementation((permission: string) => permission === "documents.sign");
      useDocumentMock.mockReturnValue({ data: baseDocument("SENT"), isLoading: false });

      renderWithProviders(<DocumentDetailPage />);

      expect(screen.getByText("Signatures")).toBeInTheDocument();
      expect(screen.getByText("Unsigned")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /sign as company/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /customer signs/i })).toBeInTheDocument();
    });

    it("shows 'Signed by both parties' and both signature previews once evidence exists for both signers", () => {
      usePermissionMock.mockReturnValue(true);
      useDocumentMock.mockReturnValue({ data: baseDocument("SIGNED"), isLoading: false });
      useDocumentSignaturesMock.mockReturnValue({
        data: [
          {
            id: "ev-1",
            signerType: "TENANT_REPRESENTATIVE",
            signerName: "Taras Kutsenko",
            signerTitle: "President",
            capturedAt: "2026-08-31T15:45:00Z",
          },
          {
            id: "ev-2",
            signerType: "CUSTOMER",
            signerName: "John Smith",
            signerTitle: null,
            capturedAt: "2026-08-31T15:47:00Z",
          },
        ],
      });

      renderWithProviders(<DocumentDetailPage />);

      expect(screen.getByText("Signed by both parties")).toBeInTheDocument();
      expect(screen.getByText("Taras Kutsenko")).toBeInTheDocument();
      expect(screen.getByText("John Smith")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /sign as company/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /customer signs/i })).not.toBeInTheDocument();
    });

    it("hides both sign actions without documents.sign", () => {
      usePermissionMock.mockReturnValue(false);
      useDocumentMock.mockReturnValue({ data: baseDocument("SENT"), isLoading: false });

      renderWithProviders(<DocumentDetailPage />);

      expect(screen.queryByRole("button", { name: /sign as company/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /customer signs/i })).not.toBeInTheDocument();
    });

    it("opens straight into the drawing pad for the company signature when no saved company signature exists", async () => {
      usePermissionMock.mockImplementation((permission: string) => permission === "documents.sign");
      useDocumentMock.mockReturnValue({ data: baseDocument("SENT"), isLoading: false });
      useCompanySignatureMock.mockReturnValue({ data: { signature: null } });
      const user = userEvent.setup();

      renderWithProviders(<DocumentDetailPage />);
      await user.click(screen.getByRole("button", { name: /sign as company/i }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByLabelText(/signer name/i)).toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: /use saved signature/i }),
      ).not.toBeInTheDocument();
    });

    it("offers a choice between the saved company signature and drawing a new one when one is configured", async () => {
      usePermissionMock.mockImplementation((permission: string) => permission === "documents.sign");
      useDocumentMock.mockReturnValue({ data: baseDocument("SENT"), isLoading: false });
      useCompanySignatureMock.mockReturnValue({
        data: {
          signature: {
            id: "sig-1",
            representativeName: "Taras Kutsenko",
            representativeTitle: "President",
          },
        },
      });
      const user = userEvent.setup();

      renderWithProviders(<DocumentDetailPage />);
      await user.click(screen.getByRole("button", { name: /sign as company/i }));

      expect(
        await screen.findByRole("button", { name: /use saved signature/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /draw now/i })).toBeInTheDocument();
    });

    it("captures the company signature via 'use saved signature' with the stored signer name/title", async () => {
      usePermissionMock.mockImplementation((permission: string) => permission === "documents.sign");
      useDocumentMock.mockReturnValue({ data: baseDocument("SENT"), isLoading: false });
      useCompanySignatureMock.mockReturnValue({
        data: {
          signature: {
            id: "sig-1",
            representativeName: "Taras Kutsenko",
            representativeTitle: "President",
          },
        },
      });
      const mutateAsync = vi.fn().mockResolvedValue({});
      useCaptureDocumentSignatureMock.mockReturnValue({ mutateAsync, isPending: false });
      const user = userEvent.setup();

      renderWithProviders(<DocumentDetailPage />);
      await user.click(screen.getByRole("button", { name: /sign as company/i }));
      await user.click(await screen.findByRole("button", { name: /use saved signature/i }));

      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          signerType: "TENANT_REPRESENTATIVE",
          method: "STORED_SIGNATURE",
          signerName: "Taras Kutsenko",
          signerTitle: "President",
        }),
      );
    });
  });
});
