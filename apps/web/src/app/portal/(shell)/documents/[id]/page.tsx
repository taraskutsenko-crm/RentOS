"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  SignaturePad,
} from "@rentos/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  portalDocumentPdfUrl,
  portalDocumentSignatureFileUrl,
  useCapturePortalDocumentSignature,
  usePortalDocument,
  usePortalDocumentPreview,
  usePortalDocumentSignatureRequests,
  usePortalDocumentSignatures,
  useSignPortalDocument,
} from "../../../../../hooks/use-portal-documents";
import { apiErrorMessage } from "../../../../../lib/api-error-i18n";
import type { DocumentType } from "../../../../../types/document";

const SIGNABLE_STATUSES = new Set(["REQUESTED", "PENDING"]);

/** Havelio Signature System (docs/PRODUCT_BIBLE.md) — mirrors the staff-side eligible-type list exactly. */
const SIGNATURE_ELIGIBLE_TYPES = new Set<DocumentType>([
  "CONTRACT",
  "HANDOVER_PROTOCOL",
  "RETURN_PROTOCOL",
]);

export default function PortalDocumentDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [signError, setSignError] = useState<string | null>(null);

  const { data: document, isLoading, isError } = usePortalDocument(params.id);
  const { data: preview } = usePortalDocumentPreview(params.id);
  const { data: signatureRequests } = usePortalDocumentSignatureRequests(params.id);
  const { data: signatures } = usePortalDocumentSignatures(params.id);
  const signDocument = useSignPortalDocument();
  const captureSignature = useCapturePortalDocumentSignature(params.id);
  const [drawOpen, setDrawOpen] = useState(false);

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (isError || !document) {
    return <p className="text-destructive text-sm">{t("common.error")}</p>;
  }

  async function handleSign(signatureRequestId: string): Promise<void> {
    setSignError(null);
    try {
      await signDocument.mutateAsync({ documentId: document!.id, signatureRequestId });
    } catch (err) {
      setSignError(apiErrorMessage(err, t("common.error")));
    }
  }

  const myEvidence = signatures?.find((row) => row.signerType === "CUSTOMER");

  async function handleDrawSave(file: File): Promise<void> {
    setSignError(null);
    try {
      await captureSignature.mutateAsync(file);
      setDrawOpen(false);
    } catch (err) {
      setSignError(apiErrorMessage(err, t("document.signatures.saveFailed")));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{document.title ?? document.documentNumber}</h1>
          <p className="text-muted-foreground text-sm">
            {document.documentType === "CUSTOM"
              ? (document.customTypeName ?? t("document.types.CUSTOM"))
              : t(`document.types.${document.documentType}`)}{" "}
            · {t(`document.statuses.${document.status}`)}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={portalDocumentPdfUrl(document.id)} target="_blank" rel="noreferrer">
            {t("portal.documents.download")}
          </a>
        </Button>
      </div>

      {signError && <p className="text-destructive text-sm">{signError}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{t("portal.documents.preview")}</CardTitle>
        </CardHeader>
        <CardContent>
          {preview ? (
            <iframe
              title={t("portal.documents.preview")}
              srcDoc={preview.html}
              className="h-[600px] w-full rounded-md border bg-white"
            />
          ) : (
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          )}
        </CardContent>
      </Card>

      {SIGNATURE_ELIGIBLE_TYPES.has(document.documentType) && (
        <Card>
          <CardHeader>
            <CardTitle>{t("document.signatures.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {myEvidence ? (
              <div className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- authenticated API-served signature image */}
                <img
                  src={portalDocumentSignatureFileUrl(document.id, myEvidence.id)}
                  alt=""
                  className="h-16 w-fit max-w-full object-contain"
                />
                <span className="text-muted-foreground text-sm">
                  {t("document.signatures.customerSignature")} · {myEvidence.signerName}
                </span>
              </div>
            ) : (
              <Button size="sm" onClick={() => setDrawOpen(true)} className="w-fit">
                {t("document.signatures.customerSigns")}
              </Button>
            )}
            <p className="text-muted-foreground text-xs">{t("document.signatures.legalNote")}</p>
          </CardContent>
        </Card>
      )}

      {(signatureRequests?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("portal.documents.signatureRequests")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {signatureRequests?.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between border-b pb-2 last:border-0"
              >
                <span className="text-sm">
                  {t(`document.signature.statuses.${request.status}`)}
                </span>
                {SIGNABLE_STATUSES.has(request.status) && (
                  <Button
                    size="sm"
                    disabled={signDocument.isPending}
                    onClick={() => void handleSign(request.id)}
                  >
                    {signDocument.isPending
                      ? t("portal.documents.signing")
                      : t("portal.documents.sign")}
                  </Button>
                )}
                {request.status === "SIGNED" && (
                  <span className="text-muted-foreground text-xs">
                    {t("portal.documents.signed")}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Link href="/portal/documents" className="text-muted-foreground text-sm underline">
        {t("portal.documents.backToList")}
      </Link>

      <Dialog open={drawOpen} onOpenChange={setDrawOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("document.signatures.customerSigns")}</DialogTitle>
          </DialogHeader>
          <SignaturePad
            isSaving={captureSignature.isPending}
            labels={{
              clear: t("signaturePad.clear"),
              undo: t("signaturePad.undo"),
              save: t("signaturePad.save"),
              cancel: t("signaturePad.cancel"),
              emptyHint: t("signaturePad.emptyHint"),
            }}
            onCancel={() => setDrawOpen(false)}
            onSave={(file) => void handleDrawSave(file)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
