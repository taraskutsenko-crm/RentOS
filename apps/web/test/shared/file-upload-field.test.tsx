import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FileUploadField } from "../../src/components/shared/file-upload-field";
import { renderWithProviders } from "../test-utils";

const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const DOCUMENT_MAX_SIZE = 20 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_MAX_SIZE = 8 * 1024 * 1024;

const LABELS = {
  chooseFile: "Choose file",
  noFileSelected: "No file selected",
  changeFile: "Change file",
  removeFile: "Remove",
  dropHint: "Drag a file here",
  or: "or",
  supportedTypes: "Supported: PDF, JPG, PNG, WEBP · Max 20 MB",
};

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

// Task C1/C2: the one shared file-picker/drop-zone primitive reused across
// Document Attachments, Asset Images, and Asset Documents — each surface
// only differs by the real backend-derived allowedMimeTypes/maxSizeBytes it
// passes in, never a second implementation.
describe("FileUploadField (shared upload primitive)", () => {
  it("shows 'No file selected' and a Choose file button before any selection", () => {
    renderWithProviders(
      <FileUploadField
        file={null}
        onFileChange={vi.fn()}
        onValidationError={vi.fn()}
        allowedMimeTypes={DOCUMENT_TYPES}
        maxSizeBytes={DOCUMENT_MAX_SIZE}
        labels={LABELS}
      />,
    );

    expect(screen.getByText("No file selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose file" })).toBeInTheDocument();
  });

  it("selecting a valid file via the (hidden) native input calls onFileChange, not onValidationError", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const onValidationError = vi.fn();
    renderWithProviders(
      <FileUploadField
        file={null}
        onFileChange={onFileChange}
        onValidationError={onValidationError}
        allowedMimeTypes={DOCUMENT_TYPES}
        maxSizeBytes={DOCUMENT_MAX_SIZE}
        labels={LABELS}
      />,
    );

    const input = screen.getByLabelText("Choose file", { selector: "input" }) as HTMLInputElement;
    const file = makeFile("protokol.jpg", "image/jpeg", 2_400_000);
    await user.upload(input, file);

    expect(onFileChange).toHaveBeenCalledWith(file);
    expect(onValidationError).not.toHaveBeenCalled();
  });

  it("dropping an unsupported type calls onValidationError with 'unsupportedType', not onFileChange", () => {
    const onFileChange = vi.fn();
    const onValidationError = vi.fn();
    const { container } = renderWithProviders(
      <FileUploadField
        file={null}
        onFileChange={onFileChange}
        onValidationError={onValidationError}
        allowedMimeTypes={DOCUMENT_TYPES}
        maxSizeBytes={DOCUMENT_MAX_SIZE}
        labels={LABELS}
      />,
    );

    const dropZone = container.querySelector("[class*='border-dashed']") as HTMLElement;
    const file = makeFile("virus.exe", "application/x-msdownload", 100);
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(onValidationError).toHaveBeenCalledWith("unsupportedType");
    expect(onFileChange).not.toHaveBeenCalled();
  });

  it("dropping an oversized file calls onValidationError with 'tooLarge'", () => {
    const onFileChange = vi.fn();
    const onValidationError = vi.fn();
    const { container } = renderWithProviders(
      <FileUploadField
        file={null}
        onFileChange={onFileChange}
        onValidationError={onValidationError}
        allowedMimeTypes={DOCUMENT_TYPES}
        maxSizeBytes={DOCUMENT_MAX_SIZE}
        labels={LABELS}
      />,
    );

    const dropZone = container.querySelector("[class*='border-dashed']") as HTMLElement;
    const file = makeFile("huge.pdf", "application/pdf", DOCUMENT_MAX_SIZE + 1);
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(onValidationError).toHaveBeenCalledWith("tooLarge");
    expect(onFileChange).not.toHaveBeenCalled();
  });

  it("respects a different (stricter) allowedMimeTypes/maxSizeBytes pair — e.g. asset images reject PDFs the document-attachment surface would accept", () => {
    const onFileChange = vi.fn();
    const onValidationError = vi.fn();
    const { container } = renderWithProviders(
      <FileUploadField
        file={null}
        onFileChange={onFileChange}
        onValidationError={onValidationError}
        allowedMimeTypes={IMAGE_TYPES}
        maxSizeBytes={IMAGE_MAX_SIZE}
        labels={{ ...LABELS, supportedTypes: "Supported: JPG, PNG, WEBP · Max 8 MB" }}
      />,
    );

    const dropZone = container.querySelector("[class*='border-dashed']") as HTMLElement;
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [makeFile("scan.pdf", "application/pdf", 1024)] },
    });

    expect(onValidationError).toHaveBeenCalledWith("unsupportedType");
    expect(screen.getByText("Supported: JPG, PNG, WEBP · Max 8 MB")).toBeInTheDocument();
  });

  it("shows the filename and size, plus Change file/Remove, once a file is selected", () => {
    const file = makeFile("protokol-zwrotu.jpg", "image/jpeg", 2_400_000);
    renderWithProviders(
      <FileUploadField
        file={file}
        onFileChange={vi.fn()}
        onValidationError={vi.fn()}
        allowedMimeTypes={DOCUMENT_TYPES}
        maxSizeBytes={DOCUMENT_MAX_SIZE}
        labels={LABELS}
      />,
    );

    expect(screen.getByText(/protokol-zwrotu\.jpg/)).toBeInTheDocument();
    expect(screen.getByText(/2\.3 MB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("shows an image thumbnail preview for an image file (Task C4)", () => {
    const file = makeFile("photo.jpg", "image/jpeg", 1024);
    renderWithProviders(
      <FileUploadField
        file={file}
        onFileChange={vi.fn()}
        onValidationError={vi.fn()}
        allowedMimeTypes={IMAGE_TYPES}
        maxSizeBytes={IMAGE_MAX_SIZE}
        labels={LABELS}
      />,
    );

    const img = screen.getByAltText("");
    expect(img.tagName).toBe("IMG");
    expect((img as HTMLImageElement).src).toMatch(/^blob:/);
  });

  it("clicking Remove calls onFileChange(null)", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const file = makeFile("protokol-zwrotu.jpg", "image/jpeg", 2_400_000);
    renderWithProviders(
      <FileUploadField
        file={file}
        onFileChange={onFileChange}
        onValidationError={vi.fn()}
        allowedMimeTypes={DOCUMENT_TYPES}
        maxSizeBytes={DOCUMENT_MAX_SIZE}
        labels={LABELS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  it("disables the picker and hides interaction affordances when disabled", () => {
    renderWithProviders(
      <FileUploadField
        file={null}
        onFileChange={vi.fn()}
        onValidationError={vi.fn()}
        allowedMimeTypes={DOCUMENT_TYPES}
        maxSizeBytes={DOCUMENT_MAX_SIZE}
        labels={LABELS}
        disabled
      />,
    );

    expect(screen.getByRole("button", { name: "Choose file" })).toBeDisabled();
  });
});
