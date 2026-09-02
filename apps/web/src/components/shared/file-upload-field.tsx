"use client";

import { Button, cn } from "@rentos/ui";
import { FileText, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";

export type FileUploadValidationErrorKind = "unsupportedType" | "tooLarge";

export interface FileUploadFieldLabels {
  /** "Choose file" */
  chooseFile: string;
  /** "No file selected" */
  noFileSelected: string;
  /** "Change file" */
  changeFile: string;
  /** "Remove" */
  removeFile: string;
  /** "Drag a file here" */
  dropHint: string;
  /** "or" */
  or: string;
  /** Already-formatted, e.g. "Supported: PDF, JPG, PNG, WEBP · Max 20 MB" — real backend-derived constraints, see the caller's own constants. */
  supportedTypes: string;
}

export interface FileUploadFieldProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** The file failed local pre-validation — the caller shows a localized message and never proceeds to upload. */
  onValidationError: (kind: FileUploadValidationErrorKind) => void;
  /** Real backend-accepted MIME types for this upload target (e.g. asset images vs. document attachments accept different sets) — never invented, always mirrors the actual server-side allowlist. */
  allowedMimeTypes: readonly string[];
  /** Real backend max size in bytes for this upload target. */
  maxSizeBytes: number;
  labels: FileUploadFieldLabels;
  disabled?: boolean;
  /** Shows an image thumbnail instead of the generic file icon once a file is selected — only meaningful when `allowedMimeTypes` includes image types (Task C4). Defaults to true. */
  showImagePreview?: boolean;
  id?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function validateFile(
  file: File,
  allowedMimeTypes: readonly string[],
  maxSizeBytes: number,
): FileUploadValidationErrorKind | null {
  if (!allowedMimeTypes.includes(file.type)) return "unsupportedType";
  if (file.size <= 0 || file.size > maxSizeBytes) return "tooLarge";
  return null;
}

/**
 * The one Havelio file-picker/drop-zone primitive — replaces every raw
 * native `<input type="file">` ("Browse... No file chosen") across the app
 * (Task C: Document Attachments, Asset Images, Asset Documents, and any
 * future file chooser) with a single shared, accessible, consistently
 * styled control. Never a second upload component per surface — surfaces
 * differ only in their real backend MIME/size constraints (passed in) and
 * what they do with the selected `File` once chosen (the caller owns the
 * actual upload mutation; this component only manages selection +
 * client-side pre-validation).
 *
 * Click-to-choose and drag-and-drop both funnel through the same
 * `handleFiles`/`validateFile` — one validation pipeline, not two
 * divergent code paths (Task C4/C5).
 */
export function FileUploadField({
  file,
  onFileChange,
  onValidationError,
  allowedMimeTypes,
  maxSizeBytes,
  labels,
  disabled,
  showImagePreview = true,
  id,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const isImageFile = !!file && file.type.startsWith("image/");
  // A transient local preview for the not-yet-uploaded File — created
  // during render (the standard, widely-used pattern for object-URL
  // previews) rather than via setState-in-an-effect, so a fresh URL is
  // always in sync with the current `file` with no extra render pass. The
  // effect below only revokes it once it's no longer the current preview —
  // it never calls setState, just releases the browser resource.
  const previewUrl = useMemo(() => {
    if (!showImagePreview || !isImageFile || !file) return null;
    return URL.createObjectURL(file);
  }, [file, isImageFile, showImagePreview]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFiles(fileList: FileList | null): void {
    const picked = fileList?.[0];
    if (!picked) return;
    const errorKind = validateFile(picked, allowedMimeTypes, maxSizeBytes);
    if (errorKind) {
      onValidationError(errorKind);
      return;
    }
    onFileChange(picked);
  }

  function openPicker(): void {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleRemove(): void {
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={allowedMimeTypes.join(",")}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
        }}
        aria-label={labels.chooseFile}
      />

      {file ? (
        <div className="border-input bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a transient local object URL for an unsaved File, not an app asset next/image can optimize
            <img
              src={previewUrl}
              alt=""
              className="size-8 shrink-0 rounded object-cover"
            />
          ) : (
            <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {file.name} <span className="text-muted-foreground">· {formatFileSize(file.size)}</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={disabled}>
            {labels.changeFile}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={disabled}
            aria-label={labels.removeFile}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-4 text-center text-sm transition-colors",
            isDragOver ? "border-primary bg-primary/5" : "border-input",
            disabled && "opacity-50",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <span className="text-muted-foreground">{labels.dropHint}</span>
          <span className="text-muted-foreground text-xs">{labels.or}</span>
          <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={disabled}>
            <Upload className="size-4" aria-hidden="true" />
            {labels.chooseFile}
          </Button>
          <span className="text-muted-foreground text-xs">{labels.noFileSelected}</span>
        </div>
      )}

      <p className="text-muted-foreground text-xs">{labels.supportedTypes}</p>
    </div>
  );
}
