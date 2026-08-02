"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  portalDocumentPdfUrl,
  usePortalDocument,
  usePortalDocumentPreview,
  usePortalDocumentSignatureRequests,
  useSignPortalDocument,
} from "../../../../../hooks/use-portal-documents";
import { apiErrorMessage } from "../../../../../lib/api-error-i18n";

const SIGNABLE_STATUSES = new Set(["REQUESTED", "PENDING"]);

export default function PortalDocumentDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [signError, setSignError] = useState<string | null>(null);

  const { data: document, isLoading, isError } = usePortalDocument(params.id);
  const { data: preview } = usePortalDocumentPreview(params.id);
  const { data: signatureRequests } = usePortalDocumentSignatureRequests(params.id);
  const signDocument = useSignPortalDocument();

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
    </div>
  );
}
