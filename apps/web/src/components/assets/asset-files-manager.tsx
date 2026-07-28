"use client";

import { Button } from "@rentos/ui";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useDeleteAssetDocument,
  useDeleteAssetImage,
  useUploadAssetDocument,
  useUploadAssetImage,
} from "../../hooks/use-assets";
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

export function AssetFilesManager({
  tenantId,
  assetId,
  images,
  documents,
  canManageImages,
  canManageDocuments,
}: AssetFilesManagerProps) {
  const { t } = useTranslation();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState<AssetDocumentType>("OTHER");
  const [documentTitle, setDocumentTitle] = useState("");

  const uploadImage = useUploadAssetImage(tenantId);
  const deleteImage = useDeleteAssetImage(tenantId);
  const uploadDocument = useUploadAssetDocument(tenantId);
  const deleteDocument = useDeleteAssetDocument(tenantId);

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadImage.mutateAsync({ assetId, file });
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  async function handleDocumentUpload(): Promise<void> {
    const file = documentInputRef.current?.files?.[0];
    if (!file || !documentTitle.trim()) return;
    await uploadDocument.mutateAsync({ assetId, file, documentType, title: documentTitle.trim() });
    setDocumentTitle("");
    if (documentInputRef.current) documentInputRef.current.value = "";
  }

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
          <div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void handleImageChange(e)}
            />
          </div>
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
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            />
            <input ref={documentInputRef} type="file" />
            <Button type="button" size="sm" onClick={() => void handleDocumentUpload()}>
              {t("asset.actions.uploadDocument")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
