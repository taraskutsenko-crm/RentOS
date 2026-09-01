import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FileUploadField } from "../../src/components/documents/file-upload-field";
import { renderWithProviders } from "../test-utils";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("FileUploadField", () => {
  it("shows 'No file selected' and a Choose file button before any selection", () => {
    renderWithProviders(<FileUploadField file={null} onFileChange={vi.fn()} onValidationError={vi.fn()} />);

    expect(screen.getByText("No file selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose file" })).toBeInTheDocument();
  });

  it("selecting a valid file via the (hidden) native input calls onFileChange, not onValidationError", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const onValidationError = vi.fn();
    renderWithProviders(
      <FileUploadField file={null} onFileChange={onFileChange} onValidationError={onValidationError} />,
    );

    const input = screen.getByLabelText("Choose file", { selector: "input" }) as HTMLInputElement;
    const file = makeFile("protokol-zwrotu.jpg", "image/jpeg", 2_400_000);
    await user.upload(input, file);

    expect(onFileChange).toHaveBeenCalledWith(file);
    expect(onValidationError).not.toHaveBeenCalled();
  });

  it("dropping an unsupported type calls onValidationError with 'unsupportedType', not onFileChange", () => {
    // Drag-and-drop bypasses the native input's `accept` filter (real
    // browsers already prevent picking a disallowed type through the
    // Choose-file dialog), so this is the pathway that actually exercises
    // validateDocumentFileLocally's unsupportedType branch — and per Task
    // C4, drop and click-choose must share this exact same validation.
    const onFileChange = vi.fn();
    const onValidationError = vi.fn();
    const { container } = renderWithProviders(
      <FileUploadField file={null} onFileChange={onFileChange} onValidationError={onValidationError} />,
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
      <FileUploadField file={null} onFileChange={onFileChange} onValidationError={onValidationError} />,
    );

    const dropZone = container.querySelector("[class*='border-dashed']") as HTMLElement;
    const file = makeFile("huge.pdf", "application/pdf", 21 * 1024 * 1024);
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(onValidationError).toHaveBeenCalledWith("tooLarge");
    expect(onFileChange).not.toHaveBeenCalled();
  });

  it("shows the filename and size, plus Change file/Remove, once a file is selected", () => {
    const file = makeFile("protokol-zwrotu.jpg", "image/jpeg", 2_400_000);
    renderWithProviders(<FileUploadField file={file} onFileChange={vi.fn()} onValidationError={vi.fn()} />);

    expect(screen.getByText(/protokol-zwrotu\.jpg/)).toBeInTheDocument();
    expect(screen.getByText(/2\.3 MB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("clicking Remove calls onFileChange(null)", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const file = makeFile("protokol-zwrotu.jpg", "image/jpeg", 2_400_000);
    renderWithProviders(<FileUploadField file={file} onFileChange={onFileChange} onValidationError={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  it("shows the real backend-derived supported types and max size, never an invented rule", () => {
    renderWithProviders(<FileUploadField file={null} onFileChange={vi.fn()} onValidationError={vi.fn()} />);

    const helper = screen.getByText(/Supported:/);
    expect(helper.textContent).toContain("PDF");
    expect(helper.textContent).toContain("JPG");
    expect(helper.textContent).toContain("PNG");
    expect(helper.textContent).toContain("WEBP");
    expect(helper.textContent).toContain("20 MB");
  });
});
