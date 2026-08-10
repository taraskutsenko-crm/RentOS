"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentos/ui";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  publicQuotePdfUrl,
  useAcceptPublicQuote,
  usePublicQuote,
  useRejectPublicQuote,
} from "../../../hooks/use-public-quote";
import { apiErrorMessage } from "../../../lib/api-error-i18n";
import { formatDate } from "../../../lib/date-format";
import { formatMoney } from "../../../lib/money";

const DECIDABLE_STATUSES = new Set(["SENT", "VIEWED"]);

/**
 * Public, unauthenticated customer-facing quote page — outside app/app/**,
 * so it is never subject to the authenticated shell's useMe() redirect (see
 * apps/web/src/app/app/layout.tsx). No tenant chrome/nav is rendered here;
 * this is a standalone page, matching how /login and /register are also
 * self-contained (see apps/web/src/app/login/page.tsx).
 */
export default function PublicQuotePage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ token: string }>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const { data: quote, isLoading, isError, error } = usePublicQuote(params.token);
  const acceptQuote = useAcceptPublicQuote(params.token);
  const rejectQuote = useRejectPublicQuote(params.token);

  async function handleAccept(): Promise<void> {
    setActionError(null);
    try {
      await acceptQuote.mutateAsync(undefined);
    } catch (err) {
      setActionError(apiErrorMessage(err, t("common.error")));
    }
  }

  async function handleReject(): Promise<void> {
    setActionError(null);
    try {
      await rejectQuote.mutateAsync(rejectReason || undefined);
      setShowRejectForm(false);
    } catch (err) {
      setActionError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-2xl">
        {isLoading && (
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
          </CardContent>
        )}

        {isError && (
          <CardContent className="p-8 text-center">
            <p className="text-destructive text-sm">
              {apiErrorMessage(error, t("quote.public.notFound"))}
            </p>
          </CardContent>
        )}

        {quote && (
          <>
            <CardHeader>
              <CardTitle>{quote.quoteNumber}</CardTitle>
              <CardDescription>
                {t(`quote.statuses.${quote.status}`)} · {t("quote.fields.validUntil")}:{" "}
                {formatDate(quote.validUntil, i18n.language)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {actionError && <p className="text-destructive text-sm">{actionError}</p>}

              <div className="text-sm">
                <p className="font-medium">{t("customer.title")}</p>
                <p>
                  {quote.customer.firstName} {quote.customer.lastName}
                  {quote.customer.company ? ` — ${quote.customer.company}` : ""}
                </p>
              </div>

              <div className="text-sm">
                <p className="font-medium">
                  {t("rental.fields.plannedStart")} — {t("rental.fields.plannedEnd")}
                </p>
                <p>
                  {formatDate(quote.plannedStart, i18n.language)} —{" "}
                  {formatDate(quote.plannedEnd, i18n.language)}
                </p>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-medium">{t("quote.fields.name")}</th>
                    <th className="p-2 font-medium">{t("rental.fields.quantity")}</th>
                    <th className="p-2 font-medium">{t("rental.fields.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="p-2">{item.name}</td>
                      <td className="p-2">{item.quantity}</td>
                      <td className="p-2">{formatMoney(item.lineTotalMinor, quote.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="rounded-md border p-3 text-sm">
                <p>
                  {t("rental.fields.subtotal")}: {formatMoney(quote.subtotalMinor, quote.currency)}
                </p>
                {quote.discountTotalMinor > 0 && (
                  <p>
                    {t("rental.fields.discount")}:{" "}
                    {formatMoney(quote.discountTotalMinor, quote.currency)}
                  </p>
                )}
                {quote.taxTotalMinor > 0 && (
                  <p>
                    {t("quote.fields.taxTotal")}: {formatMoney(quote.taxTotalMinor, quote.currency)}
                  </p>
                )}
                {quote.depositTotalMinor > 0 && (
                  <p>
                    {t("quote.fields.depositTotal")}:{" "}
                    {formatMoney(quote.depositTotalMinor, quote.currency)}
                  </p>
                )}
                <p className="font-semibold">
                  {t("rental.fields.total")}: {formatMoney(quote.totalMinor, quote.currency)}
                </p>
              </div>

              {quote.customerNotes && (
                <div className="text-sm">
                  <p className="font-medium">{t("quote.fields.customerNotes")}</p>
                  <p className="whitespace-pre-wrap">{quote.customerNotes}</p>
                </div>
              )}

              {quote.termsAndConditions && (
                <div className="text-sm">
                  <p className="font-medium">{t("quote.fields.termsAndConditions")}</p>
                  <p className="whitespace-pre-wrap">{quote.termsAndConditions}</p>
                </div>
              )}

              {quote.availabilityWarnings.length > 0 && (
                <div className="border-destructive rounded-md border p-3 text-sm">
                  {t("quote.availabilityWarningTitle")}
                </div>
              )}

              <a
                className="text-sm underline"
                href={publicQuotePdfUrl(params.token)}
                target="_blank"
                rel="noreferrer"
              >
                {t("quote.actions.downloadPdf")}
              </a>

              {quote.status === "ACCEPTED" && (
                <p className="text-sm font-medium">
                  {t("quote.public.acceptedNotice", { name: quote.acceptedBy ?? "" })}
                </p>
              )}
              {quote.status === "REJECTED" && (
                <p className="text-sm font-medium">{t("quote.public.rejectedNotice")}</p>
              )}

              {DECIDABLE_STATUSES.has(quote.status) && (
                <div className="flex flex-col gap-3">
                  <p className="text-muted-foreground text-xs">
                    {t("quote.public.acceptanceDisclaimer")}
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => void handleAccept()} disabled={acceptQuote.isPending}>
                      {t("quote.actions.accept")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowRejectForm((current) => !current)}
                    >
                      {t("quote.actions.reject")}
                    </Button>
                  </div>
                  {showRejectForm && (
                    <div className="flex flex-col gap-2">
                      <textarea
                        className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                        rows={3}
                        placeholder={t("quote.public.rejectReasonPlaceholder")}
                        value={rejectReason}
                        onChange={(event) => setRejectReason(event.target.value)}
                      />
                      <Button
                        variant="outline"
                        onClick={() => void handleReject()}
                        disabled={rejectQuote.isPending}
                      >
                        {t("quote.public.confirmReject")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
