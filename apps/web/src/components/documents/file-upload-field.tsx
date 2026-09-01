"use client";

import { Button } from "@rentos/ui";
import { cn } from "@rentos/ui";
import { Paperclip, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_TYPE_LABELS,
  DOCUMENT_UPLOAD_MAX_SIZE_BYTES,
  formatFileSize,
  validateDocumentFileLocally,
} from "../../lib/document-file-validation";

export interface FileUploadFieldProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Shown as a localized "Unsupported file type"/"File too large" message when client-side pre-validation rejects a picked/dropped file. */
  onValidationError: (kind: "unsupportedType" | "tooLarge") => void;
  disabled?: boolean;
}

/**
 * Replaces the raw native `<input type="file">` chrome (Task C) with a
 * proper Havelio control: a hidden native input driven by a styled "Choose
 * file" button (accessible — the input still exists, just visually hidden,
 * so screen readers/keyboard users get the native file-picker semantics),
 * plus an optional drop zone. Click-to-choose and drag-and-drop both funnel
 * through the same `handleFiles`, so they share one validation/upload
 * pipeline (Task C4) — never two divergent code paths.
 */
export function FileUploadField({
  file,
  onFileChange,
  onValidationError,
  disabled,
}: FileUploadFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleFiles(fileList: FileList | null): void {
    const picked = fileList?.[0];
    if (!picked) return;
    const errorKind = validateDocumentFileLocally(picked);
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

  const helperText = t("document.attachments.supportedTypes", {
    types: DOCUMENT_UPLOAD_TYPE_LABELS.join(", "),
    maxSize: `${Math.floor(DOCUMENT_UPLOAD_MAX_SIZE_BYTES / (1024 * 1024))} MB`,
  });

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_UPLOAD_ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
        }}
        aria-label={t("document.attachments.chooseFile")}
      />

      {file ? (
        <div className="border-input bg-muted/30 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {file.name} <span className="text-muted-foreground">· {formatFileSize(file.size)}</span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={disabled}>
            {t("document.attachments.changeFile")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={disabled}
            aria-label={t("document.attachments.removeFile")}
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
          <span className="text-muted-foreground">{t("document.attachments.dropHint")}</span>
          <span className="text-muted-foreground text-xs">{t("document.attachments.or")}</span>
          <Button type="button" variant="outline" size="sm" onClick={openPicker} disabled={disabled}>
            <Upload className="size-4" aria-hidden="true" />
            {t("document.attachments.chooseFile")}
          </Button>
          <span className="text-muted-foreground text-xs">
            {t("document.attachments.noFileSelected")}
          </span>
        </div>
      )}

      <p className="text-muted-foreground text-xs">{helperText}</p>
    </div>
  );
}
