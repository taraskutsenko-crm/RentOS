"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@rentos/ui";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError } from "../../../lib/api-client";
import { apiErrorMessage } from "../../../lib/api-error-i18n";
import {
  useDownloadPublicDocumentPdf,
  useViewPublicDocument,
} from "../../../hooks/use-public-document";

/**
 * Public, unauthenticated document-sharing page — outside app/app/**, same
 * standalone convention as /quote/[token] (see that page's doc comment).
 * Both public document routes are POST (password may travel in the body),
 * so — unlike the quote page's GET-driven usePublicQuote — this page has to
 * kick off the "view" request itself and separately track whether a
 * password is required.
 */
export default function PublicDocumentPage() {
  const { t } = useTranslation();
  const params = useParams<{ token: string }>();
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const {
    mutate: viewMutate,
    data,
    isPending,
    isError,
    error,
  } = useViewPublicDocument(params.token);
  const downloadPdf = useDownloadPublicDocumentPdf(params.token);

  useEffect(() => {
    viewMutate(undefined, {
      onError: (viewError) => {
        if (viewError instanceof ApiError && viewError.statusCode === 403) {
          setNeedsPassword(true);
        }
      },
    });
  }, [params.token, viewMutate]);

  function handleUnlock(): void {
    viewMutate(password, {
      onSuccess: () => setNeedsPassword(false),
    });
  }

  async function handleDownload(): Promise<void> {
    setDownloadError(null);
    try {
      const blob = await downloadPdf.mutateAsync(password || undefined);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${data?.documentNumber ?? "document"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (downloadFailure) {
      setDownloadError(apiErrorMessage(downloadFailure, t("common.error")));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-4xl">
        {isPending && (
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          </CardContent>
        )}

        {needsPassword && (
          <>
            <CardHeader>
              <CardTitle>{t("share.public.passwordRequiredTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">{t("share.fields.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              {isError && (
                <p className="text-destructive text-sm">
                  {apiErrorMessage(error, t("share.public.wrongPassword"))}
                </p>
              )}
              <Button onClick={handleUnlock}>{t("share.public.unlock")}</Button>
            </CardContent>
          </>
        )}

        {isError && !needsPassword && (
          <CardContent className="p-8 text-center">
            <p className="text-destructive text-sm">
              {apiErrorMessage(error, t("share.public.notFound"))}
            </p>
          </CardContent>
        )}

        {data && (
          <>
            <CardHeader>
              <CardTitle>{data.documentNumber}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <iframe
                title={data.documentNumber}
                srcDoc={data.html}
                className="h-[70vh] w-full rounded-md border bg-white"
              />
              {downloadError && <p className="text-destructive text-sm">{downloadError}</p>}
              <Button
                variant="outline"
                onClick={() => void handleDownload()}
                disabled={downloadPdf.isPending}
              >
                {t("share.public.downloadPdf")}
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
