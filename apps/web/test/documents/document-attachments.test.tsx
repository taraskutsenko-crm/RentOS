import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentAttachments } from "../../src/components/documents/document-attachments";
import { ApiError } from "../../src/lib/api-client";
import { renderWithProviders } from "../test-utils";

const mutateAsync = vi.fn();
const deleteMutateAsync = vi.fn();
let isPending = false;

vi.mock("../../src/hooks/use-documents", () => ({
  documentFileUrl: (_tenantId: string | null, _documentId: string, fileId: string) =>
    `https://example.test/files/${fileId}`,
  useUploadDocumentFile: () => ({
    mutateAsync,
    get isPending() {
      return isPending;
    },
  }),
  useDeleteDocumentFile: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

const baseProps = {
  tenantId: "tenant-1",
  documentId: "doc-1",
  documentType: "RETURN_PROTOCOL" as const,
  files: [],
  isDraft: true,
  canManage: true,
};

// Task C/H: the raw native file input is gone — attachments now go through
// a Havelio-styled Choose file / Upload flow with real enabled/disabled,
// success, and localized (never raw-server-message) error states.
describe("DocumentAttachments upload UX", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    deleteMutateAsync.mockReset();
    isPending = false;
  });

  it("disables Upload before a file is selected", () => {
    renderWithProviders(<DocumentAttachments {...baseProps} />);
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("enables Upload once a valid file is selected, and calls the upload mutation on click", async () => {
    mutateAsync.mockResolvedValueOnce({ id: "file-1" });
    const user = userEvent.setup();
    renderWithProviders(<DocumentAttachments {...baseProps} />);

    const input = screen.getByLabelText("Choose file", { selector: "input" }) as HTMLInputElement;
    await user.upload(input, makeFile("protokol.jpg", "image/jpeg", 2048));

    const uploadButton = screen.getByRole("button", { name: "Upload" });
    expect(uploadButton).toBeEnabled();

    await user.click(uploadButton);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({ documentId: "doc-1", format: "PHOTO" });
  });

  it("shows success feedback after a successful upload", async () => {
    mutateAsync.mockResolvedValueOnce({ id: "file-2" });
    const user = userEvent.setup();
    renderWithProviders(<DocumentAttachments {...baseProps} />);

    const input = screen.getByLabelText("Choose file", { selector: "input" }) as HTMLInputElement;
    await user.upload(input, makeFile("scan.pdf", "application/pdf", 4096));
    await user.click(screen.getByRole("button", { name: "Upload" }));

    expect(await screen.findByText("Upload successful")).toBeInTheDocument();
  });

  it("shows a localized error (never the raw server message) when upload fails", async () => {
    mutateAsync.mockRejectedValueOnce(
      new ApiError("Unsupported document type: text/plain. Allowed: application/pdf", 400),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentAttachments {...baseProps} />);

    const input = screen.getByLabelText("Choose file", { selector: "input" }) as HTMLInputElement;
    await user.upload(input, makeFile("scan.pdf", "application/pdf", 4096));
    await user.click(screen.getByRole("button", { name: "Upload" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unsupported file type");
    expect(alert).not.toHaveTextContent("Unsupported document type: text/plain");
  });
});
