"use client";

import { Button, cn } from "@rentos/ui";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { FileUploadField } from "../shared/file-upload-field";
import {
  documentFileUrl,
  useDeleteDocumentFile,
  useUploadDocumentFile,
} from "../../hooks/use-documents";
import {
  DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES,
  DOCUMENT_UPLOAD_MAX_SIZE_BYTES,
  DOCUMENT_UPLOAD_TYPE_LABELS,
  mapDocumentUploadError,
  type DocumentUploadErrorKind,
} from "../../lib/document-file-validation";
import type { DocumentAttachmentCategory, DocumentFile, DocumentType } from "../../types/document";

export interface DocumentAttachmentsProps {
  tenantId: string | null;
  documentId: string;
  documentType: DocumentType;
  files: DocumentFile[];
  /** Only DRAFT documents accept new/removed attachments — a finalized version's evidence is immutable (see DECISIONS.md). */
  isDraft: boolean;
  canManage: boolean;
}

const CATEGORIES: DocumentAttachmentCategory[] = [
  "HANDOVER_CONDITION",
  "RETURN_CONDITION",
  "DAMAGE",
  "OTHER",
];

function defaultCategoryFor(documentType: DocumentType): DocumentAttachmentCategory {
  if (documentType === "HANDOVER_PROTOCOL") return "HANDOVER_CONDITION";
  if (documentType === "RETURN_PROTOCOL") return "RETURN_CONDITION";
  return "OTHER";
}

/**
 * Staff-uploaded photo/supporting-file evidence for any Document — built
 * for Handover/Return Protocol condition photos specifically (see
 * DECISIONS.md D-108's deferred-not-blocked finding), kept generic since
 * the backend (DocumentFile ATTACHMENT/PHOTO) is already Document-type-
 * agnostic. Mirrors AssetFilesManager's thumbnail-grid + upload-row UX.
 */
export function DocumentAttachments({
  tenantId,
  documentId,
  documentType,
  files,
  isDraft,
  canManage,
}: DocumentAttachmentsProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<DocumentAttachmentCategory>(
    defaultCategoryFor(documentType),
  );
  const [caption, setCaption] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadErrorKind, setUploadErrorKind] = useState<DocumentUploadErrorKind | null>(null);
  const [uploadSucceeded, setUploadSucceeded] = useState(false);
  const uploadFile = useUploadDocumentFile(tenantId);
  const deleteFile = useDeleteDocumentFile(tenantId);

  const photos = files.filter((file) => file.format === "PHOTO");
  const attachments = files.filter((file) => file.format === "ATTACHMENT");
  const canUpload = canManage && isDraft;

  // Visible success feedback (Task C3) that clears itself — mirrors the
  // "toast fades on its own" pattern used elsewhere rather than requiring a
  // manual dismiss for a low-stakes confirmation.
  useEffect(() => {
    if (!uploadSucceeded) return;
    const timer = setTimeout(() => setUploadSucceeded(false), 4000);
    return () => clearTimeout(timer);
  }, [uploadSucceeded]);

  function handleFileChange(file: File | null): void {
    setSelectedFile(file);
    setUploadErrorKind(null);
    setUploadSucceeded(false);
  }

  async function handleUpload(): Promise<void> {
    if (!selectedFile) return;
    setUploadErrorKind(null);
    const format = selectedFile.type.startsWith("image/") ? "PHOTO" : "ATTACHMENT";
    try {
      await uploadFile.mutateAsync({
        documentId,
        file: selectedFile,
        format,
        category,
        caption: caption.trim() || undefined,
      });
      setCaption("");
      setSelectedFile(null);
      setUploadSucceeded(true);
    } catch (error) {
      setUploadErrorKind(mapDocumentUploadError(error));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {photos.map((photo) => (
          <div key={photo.id} className="relative">
            <a
              href={documentFileUrl(tenantId, documentId, photo.id)}
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={documentFileUrl(tenantId, documentId, photo.id)}
                alt={photo.caption ?? photo.originalFileName}
                className="h-24 w-24 rounded-md border object-cover"
              />
            </a>
            {photo.caption && (
              <p className="text-muted-foreground mt-1 w-24 truncate text-xs" title={photo.caption}>
                {photo.caption}
              </p>
            )}
            {canUpload && (
              <button
                type="button"
                className="bg-destructive text-destructive-foreground absolute -top-2 -right-2 h-5 w-5 rounded-full text-xs"
                onClick={() => void deleteFile.mutateAsync({ documentId, fileId: photo.id })}
                aria-label={t("document.attachments.delete")}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <a
                href={documentFileUrl(tenantId, documentId, attachment.id)}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {attachment.caption || attachment.originalFileName}
              </a>
              {canUpload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void deleteFile.mutateAsync({ documentId, fileId: attachment.id })}
                >
                  {t("document.attachments.delete")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {photos.length === 0 && attachments.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("document.attachments.empty")}</p>
      )}

      {canUpload && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
              value={category}
              onChange={(event) => setCategory(event.target.value as DocumentAttachmentCategory)}
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`document.attachments.category.${value}`)}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder={t("document.attachments.captionPlaceholder")}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              className="border-input h-9 min-w-40 flex-1 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            />
          </div>

          <FileUploadField
            file={selectedFile}
            onFileChange={handleFileChange}
            onValidationError={setUploadErrorKind}
            allowedMimeTypes={DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES}
            maxSizeBytes={DOCUMENT_UPLOAD_MAX_SIZE_BYTES}
            disabled={uploadFile.isPending}
            labels={{
              chooseFile: t("document.attachments.chooseFile"),
              noFileSelected: t("document.attachments.noFileSelected"),
              changeFile: t("document.attachments.changeFile"),
              removeFile: t("document.attachments.removeFile"),
              dropHint: t("document.attachments.dropHint"),
              or: t("document.attachments.or"),
              supportedTypes: t("document.attachments.supportedTypes", {
                types: DOCUMENT_UPLOAD_TYPE_LABELS.join(", "),
                maxSize: `${Math.floor(DOCUMENT_UPLOAD_MAX_SIZE_BYTES / (1024 * 1024))} MB`,
              }),
            }}
          />

          {uploadErrorKind && (
            <p className="text-destructive text-sm" role="alert">
              {t(`document.attachments.error.${uploadErrorKind}`)}
            </p>
          )}
          {uploadSucceeded && (
            <p className="text-success flex items-center gap-1.5 text-sm">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {t("document.attachments.uploadSuccess")}
            </p>
          )}

          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => void handleUpload()}
            disabled={!selectedFile || uploadFile.isPending}
          >
            {uploadFile.isPending && (
              <Loader2 className={cn("size-4 animate-spin")} aria-hidden="true" />
            )}
            {uploadFile.isPending
              ? t("document.attachments.uploading")
              : t("document.attachments.upload")}
          </Button>
        </div>
      )}
    </div>
  );
}
