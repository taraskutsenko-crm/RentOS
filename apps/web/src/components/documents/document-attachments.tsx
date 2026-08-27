"use client";

import { Button } from "@rentos/ui";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  documentFileUrl,
  useDeleteDocumentFile,
  useUploadDocumentFile,
} from "../../hooks/use-documents";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<DocumentAttachmentCategory>(
    defaultCategoryFor(documentType),
  );
  const [caption, setCaption] = useState("");
  const uploadFile = useUploadDocumentFile(tenantId);
  const deleteFile = useDeleteDocumentFile(tenantId);

  const photos = files.filter((file) => file.format === "PHOTO");
  const attachments = files.filter((file) => file.format === "ATTACHMENT");
  const canUpload = canManage && isDraft;

  async function handleUpload(): Promise<void> {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    const format = file.type.startsWith("image/") ? "PHOTO" : "ATTACHMENT";
    await uploadFile.mutateAsync({
      documentId,
      file,
      format,
      category,
      caption: caption.trim() || undefined,
    });
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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
        <div className="flex flex-wrap items-end gap-2">
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
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void handleUpload()}
            disabled={uploadFile.isPending}
          >
            {uploadFile.isPending ? t("common.saving") : t("document.attachments.upload")}
          </Button>
        </div>
      )}
    </div>
  );
}
