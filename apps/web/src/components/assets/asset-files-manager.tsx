"use client";

import { Button, cn } from "@rentos/ui";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { FileUploadField } from "../shared/file-upload-field";
import {
  useDeleteAssetDocument,
  useDeleteAssetImage,
  useUploadAssetDocument,
  useUploadAssetImage,
} from "../../hooks/use-assets";
import {
  ASSET_DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES,
  ASSET_DOCUMENT_UPLOAD_MAX_SIZE_BYTES,
  ASSET_IMAGE_UPLOAD_ALLOWED_MIME_TYPES,
  ASSET_IMAGE_UPLOAD_MAX_SIZE_BYTES,
  ASSET_IMAGE_UPLOAD_TYPE_LABELS,
  mapAssetImageUploadError,
} from "../../lib/asset-file-validation";
import { DOCUMENT_UPLOAD_TYPE_LABELS, mapDocumentUploadError } from "../../lib/document-file-validation";
import type { DocumentUploadErrorKind } from "../../lib/document-file-validation";
import type { AssetDocument, AssetDocumentType, AssetImage } from "../../types/asset";

export interface AssetFilesManagerProps {
  tenantId: string | null;
  assetId: string;
  images: AssetImage[];
  documents: AssetDocument[];
  canManageImages: boolean;
  canManageDocuments: boolean;
}

const DOCUMENT_TYPES: AssetDocumentType[] = [
  "PURCHASE_DOCUMENT",
  "MANUAL",
  "CERTIFICATE",
  "INSURANCE",
  "REGISTRATION",
  "INSPECTION",
  "OTHER",
];

/**
 * Task C: replaces the raw native "Browse... No file chosen" controls this
 * component used to render directly with the one shared Havelio upload
 * primitive (see components/shared/file-upload-field.tsx) — the same
 * component Document Attachments uses, just with each section's own real
 * backend-derived MIME/size constraints (images vs. supporting documents
 * use different StorageService validators — see asset-file-validation.ts).
 * Both sections now use the same select-then-confirm-Upload pattern
 * (previously Images silently uploaded on selection, an inconsistency with
 * every other upload surface in the app) with visible
 * pending/success/error feedback.
 */
export function AssetFilesManager({
  tenantId,
  assetId,
  images,
  documents,
  canManageImages,
  canManageDocuments,
}: AssetFilesManagerProps) {
  const { t } = useTranslation();
  const uploadImage = useUploadAssetImage(tenantId);
  const deleteImage = useDeleteAssetImage(tenantId);
  const uploadDocument = useUploadAssetDocument(tenantId);
  const deleteDocument = useDeleteAssetDocument(tenantId);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("asset.sections.images")}</h2>
        <div className="flex flex-wrap gap-3">
          {images.map((image) => (
            <div key={image.id} className="relative">
              <img
                src={`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assets/${assetId}/images/${image.id}/file`}
                alt={image.altText ?? ""}
                className="h-24 w-24 rounded-md border object-cover"
              />
              {image.isPrimary && (
                <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1 text-xs">
                  {t("asset.fields.primaryImage")}
                </span>
              )}
              {canManageImages && (
                <button
                  type="button"
                  className="bg-destructive text-destructive-foreground absolute -top-2 -right-2 h-5 w-5 rounded-full text-xs"
                  onClick={() => void deleteImage.mutateAsync({ assetId, imageId: image.id })}
                  aria-label={t("asset.actions.deleteImage")}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {images.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("asset.noImages")}</p>
          )}
        </div>
        {canManageImages && (
          <ImageUploadRow assetId={assetId} uploadImage={uploadImage} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("asset.sections.documents")}</h2>
        <ul className="flex flex-col gap-2">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assets/${assetId}/documents/${document.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {document.title} ({document.documentType})
              </a>
              {canManageDocuments && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void deleteDocument.mutateAsync({ assetId, documentId: document.id })
                  }
                >
                  {t("asset.actions.deleteDocument")}
                </Button>
              )}
            </li>
          ))}
          {documents.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("asset.noDocuments")}</p>
          )}
        </ul>
        {canManageDocuments && (
          <DocumentUploadRow assetId={assetId} uploadDocument={uploadDocument} />
        )}
      </section>
    </div>
  );
}

/**
 * Success feedback that clears itself after a few seconds — mirrors
 * DocumentAttachments' identical convention (a low-stakes confirmation
 * doesn't need a manual dismiss).
 */
function useSelfClearingSuccess(): [boolean, (value: boolean) => void] {
  const [succeeded, setSucceeded] = useState(false);
  useEffect(() => {
    if (!succeeded) return;
    const timer = setTimeout(() => setSucceeded(false), 4000);
    return () => clearTimeout(timer);
  }, [succeeded]);
  return [succeeded, setSucceeded];
}

function ImageUploadRow({
  assetId,
  uploadImage,
}: {
  assetId: string;
  uploadImage: ReturnType<typeof useUploadAssetImage>;
}) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorKind, setErrorKind] = useState<DocumentUploadErrorKind | null>(null);
  const [succeeded, setSucceeded] = useSelfClearingSuccess();

  function handleFileChange(file: File | null): void {
    setSelectedFile(file);
    setErrorKind(null);
    setSucceeded(false);
  }

  async function handleUpload(): Promise<void> {
    if (!selectedFile) return;
    setErrorKind(null);
    try {
      await uploadImage.mutateAsync({ assetId, file: selectedFile });
      setSelectedFile(null);
      setSucceeded(true);
    } catch (error) {
      setErrorKind(mapAssetImageUploadError(error));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 sm:max-w-sm">
      <FileUploadField
        file={selectedFile}
        onFileChange={handleFileChange}
        onValidationError={setErrorKind}
        allowedMimeTypes={ASSET_IMAGE_UPLOAD_ALLOWED_MIME_TYPES}
        maxSizeBytes={ASSET_IMAGE_UPLOAD_MAX_SIZE_BYTES}
        disabled={uploadImage.isPending}
        labels={{
          // Reuses the Document Attachments upload copy — generic file-
          // picker wording ("Choose file", "No file selected", ...) that
          // applies identically here; see document-attachments.tsx's own
          // use of the same keys.
          chooseFile: t("document.attachments.chooseFile"),
          noFileSelected: t("document.attachments.noFileSelected"),
          changeFile: t("document.attachments.changeFile"),
          removeFile: t("document.attachments.removeFile"),
          dropHint: t("document.attachments.dropHint"),
          or: t("document.attachments.or"),
          supportedTypes: t("document.attachments.supportedTypes", {
            types: ASSET_IMAGE_UPLOAD_TYPE_LABELS.join(", "),
            maxSize: `${Math.floor(ASSET_IMAGE_UPLOAD_MAX_SIZE_BYTES / (1024 * 1024))} MB`,
          }),
        }}
      />
      {errorKind && (
        <p className="text-destructive text-sm" role="alert">
          {t(`document.attachments.error.${errorKind}`)}
        </p>
      )}
      {succeeded && (
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
        disabled={!selectedFile || uploadImage.isPending}
      >
        {uploadImage.isPending && <Loader2 className={cn("size-4 animate-spin")} aria-hidden="true" />}
        {uploadImage.isPending ? t("document.attachments.uploading") : t("asset.actions.uploadImage")}
      </Button>
    </div>
  );
}

function DocumentUploadRow({
  assetId,
  uploadDocument,
}: {
  assetId: string;
  uploadDocument: ReturnType<typeof useUploadAssetDocument>;
}) {
  const { t } = useTranslation();
  const [documentType, setDocumentType] = useState<AssetDocumentType>("OTHER");
  const [documentTitle, setDocumentTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorKind, setErrorKind] = useState<DocumentUploadErrorKind | null>(null);
  const [succeeded, setSucceeded] = useSelfClearingSuccess();

  function handleFileChange(file: File | null): void {
    setSelectedFile(file);
    setErrorKind(null);
    setSucceeded(false);
  }

  async function handleUpload(): Promise<void> {
    if (!selectedFile || !documentTitle.trim()) return;
    setErrorKind(null);
    try {
      await uploadDocument.mutateAsync({
        assetId,
        file: selectedFile,
        documentType,
        title: documentTitle.trim(),
      });
      setDocumentTitle("");
      setSelectedFile(null);
      setSucceeded(true);
    } catch (error) {
      setErrorKind(mapDocumentUploadError(error));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 sm:max-w-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value as AssetDocumentType)}
        >
          {DOCUMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`asset.documentTypes.${type}`)}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder={t("asset.fields.documentTitle")}
          value={documentTitle}
          onChange={(event) => setDocumentTitle(event.target.value)}
          className="border-input h-9 min-w-40 flex-1 rounded-md border bg-transparent px-3 text-sm shadow-xs"
        />
      </div>

      <FileUploadField
        file={selectedFile}
        onFileChange={handleFileChange}
        onValidationError={setErrorKind}
        allowedMimeTypes={ASSET_DOCUMENT_UPLOAD_ALLOWED_MIME_TYPES}
        maxSizeBytes={ASSET_DOCUMENT_UPLOAD_MAX_SIZE_BYTES}
        disabled={uploadDocument.isPending}
        labels={{
          chooseFile: t("document.attachments.chooseFile"),
          noFileSelected: t("document.attachments.noFileSelected"),
          changeFile: t("document.attachments.changeFile"),
          removeFile: t("document.attachments.removeFile"),
          dropHint: t("document.attachments.dropHint"),
          or: t("document.attachments.or"),
          supportedTypes: t("document.attachments.supportedTypes", {
            types: DOCUMENT_UPLOAD_TYPE_LABELS.join(", "),
            maxSize: `${Math.floor(ASSET_DOCUMENT_UPLOAD_MAX_SIZE_BYTES / (1024 * 1024))} MB`,
          }),
        }}
      />
      {errorKind && (
        <p className="text-destructive text-sm" role="alert">
          {t(`document.attachments.error.${errorKind}`)}
        </p>
      )}
      {succeeded && (
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
        disabled={!selectedFile || !documentTitle.trim() || uploadDocument.isPending}
      >
        {uploadDocument.isPending && (
          <Loader2 className={cn("size-4 animate-spin")} aria-hidden="true" />
        )}
        {uploadDocument.isPending
          ? t("document.attachments.uploading")
          : t("asset.actions.uploadDocument")}
      </Button>
    </div>
  );
}
