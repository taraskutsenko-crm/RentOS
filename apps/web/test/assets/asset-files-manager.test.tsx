import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AssetFilesManager } from "../../src/components/assets/asset-files-manager";
import { renderWithProviders } from "../test-utils";

const uploadImageMutateAsync = vi.fn();
const uploadDocumentMutateAsync = vi.fn();
const deleteImageMutateAsync = vi.fn();
const deleteDocumentMutateAsync = vi.fn();
let uploadImagePending = false;
let uploadDocumentPending = false;

vi.mock("../../src/hooks/use-assets", () => ({
  useUploadAssetImage: () => ({
    mutateAsync: uploadImageMutateAsync,
    get isPending() {
      return uploadImagePending;
    },
  }),
  useDeleteAssetImage: () => ({ mutateAsync: deleteImageMutateAsync, isPending: false }),
  useUploadAssetDocument: () => ({
    mutateAsync: uploadDocumentMutateAsync,
    get isPending() {
      return uploadDocumentPending;
    },
  }),
  useDeleteAssetDocument: () => ({ mutateAsync: deleteDocumentMutateAsync, isPending: false }),
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

const baseProps = {
  tenantId: "tenant-1",
  assetId: "asset-1",
  images: [],
  documents: [],
  canManageImages: true,
  canManageDocuments: true,
};

// Task C2/C3/K.6/K.7: Asset -> Images and Asset -> Documents now use the
// same shared Havelio upload control Document Attachments already uses —
// visible "Choose file" button (not raw native chrome), filename+size,
// Remove/Change, and a distinct Upload action with pending/success states.
describe("AssetFilesManager upload UX", () => {
  beforeEach(() => {
    uploadImageMutateAsync.mockReset();
    uploadDocumentMutateAsync.mockReset();
    deleteImageMutateAsync.mockReset();
    deleteDocumentMutateAsync.mockReset();
    uploadImagePending = false;
    uploadDocumentPending = false;
  });

  it("shows a visible Choose file button (not raw native chrome) for images", () => {
    renderWithProviders(<AssetFilesManager {...baseProps} />);
    const chooseButtons = screen.getAllByRole("button", { name: "Choose file" });
    expect(chooseButtons.length).toBeGreaterThan(0);
  });

  it("images: disables Upload before a file is selected, enables once selected, and uploads on click", async () => {
    uploadImageMutateAsync.mockResolvedValueOnce({ id: "img-1" });
    const user = userEvent.setup();
    renderWithProviders(<AssetFilesManager {...baseProps} />);

    const uploadButton = screen.getAllByRole("button", { name: "Upload" })[0]!;
    expect(uploadButton).toBeDisabled();

    const inputs = screen.getAllByLabelText("Choose file", { selector: "input" });
    await user.upload(inputs[0]! as HTMLInputElement, makeFile("photo.jpg", "image/jpeg", 2048));

    expect(uploadButton).toBeEnabled();
    await user.click(uploadButton);

    await waitFor(() => expect(uploadImageMutateAsync).toHaveBeenCalledTimes(1));
    expect(uploadImageMutateAsync.mock.calls[0]?.[0]).toMatchObject({ assetId: "asset-1" });
  });

  it("images: rejects a non-image file client-side (asset images use a stricter allowlist than document attachments)", () => {
    renderWithProviders(<AssetFilesManager {...baseProps} />);
    const dropZones = document.querySelectorAll("[class*='border-dashed']");
    const imageDropZone = dropZones[0] as HTMLElement;

    fireEvent.drop(imageDropZone, {
      dataTransfer: { files: [makeFile("doc.pdf", "application/pdf", 1024)] },
    });

    expect(screen.getByText("Unsupported file type")).toBeInTheDocument();
    expect(uploadImageMutateAsync).not.toHaveBeenCalled();
  });

  it("documents: requires both a title and a selected file before Upload enables", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AssetFilesManager {...baseProps} />);

    const uploadButtons = screen.getAllByRole("button", { name: "Upload" });
    const documentUploadButton = uploadButtons[1]!;
    expect(documentUploadButton).toBeDisabled();

    const inputs = screen.getAllByLabelText("Choose file", { selector: "input" });
    await user.upload(inputs[1]! as HTMLInputElement, makeFile("manual.pdf", "application/pdf", 4096));
    expect(documentUploadButton).toBeDisabled(); // still no title

    await user.type(screen.getByPlaceholderText("Document title"), "User manual");
    expect(documentUploadButton).toBeEnabled();
  });

  it("documents: uploads with the entered title and document type", async () => {
    uploadDocumentMutateAsync.mockResolvedValueOnce({ id: "doc-1" });
    const user = userEvent.setup();
    renderWithProviders(<AssetFilesManager {...baseProps} />);

    const inputs = screen.getAllByLabelText("Choose file", { selector: "input" });
    await user.upload(inputs[1]! as HTMLInputElement, makeFile("manual.pdf", "application/pdf", 4096));
    await user.type(screen.getByPlaceholderText("Document title"), "User manual");
    const uploadButtons = screen.getAllByRole("button", { name: "Upload" });
    await user.click(uploadButtons[1]!);

    await waitFor(() =>
      expect(uploadDocumentMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ assetId: "asset-1", title: "User manual" }),
      ),
    );
  });

  it("hides both upload rows without manage permissions", () => {
    renderWithProviders(
      <AssetFilesManager {...baseProps} canManageImages={false} canManageDocuments={false} />,
    );
    expect(screen.queryByRole("button", { name: "Choose file" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
  });
});
