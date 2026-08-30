"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, DateTimeField } from "@rentos/ui";
import { tenantLocalToUtc } from "@rentos/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useRecordDepositReceipt,
  useRecordDepositReturn,
  useRentalDeposit,
} from "../../hooks/use-rentals";
import { apiErrorMessage } from "../../lib/api-error-i18n";
import { formatDate } from "../../lib/date-format";
import { formatMoney } from "../../lib/money";
import type { DepositPaymentMethod } from "../../types/rental";

const PAYMENT_METHODS: DepositPaymentMethod[] = ["BANK_TRANSFER", "CASH", "CARD", "OTHER"];

/**
 * The accounting side of a Rental's security deposit — see RentalDeposit.
 * Deliberately separate from the "Amount due at start" figure shown in the
 * summary cards above (the *required* amount, always derived from
 * RentalItem.depositMinor): this section tracks what actually happened —
 * received/returned/retained — and is the source for the Deposit Receipt
 * document and, eventually, an invoiced retained-amount line (see
 * RentalDepositsService's doc comment for what's not automated yet).
 */
export function RentalDepositSection({
  tenantId,
  tenantTimezone,
  rentalId,
  requiredAmountMinor,
  currency,
  canManage,
}: {
  tenantId: string | null;
  /** See RentalWizardProps.tenantTimezone's doc comment — identical role here. */
  tenantTimezone?: string | undefined;
  rentalId: string;
  requiredAmountMinor: number;
  currency: string;
  canManage: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { data: deposit } = useRentalDeposit(tenantId, rentalId);
  const recordReceipt = useRecordDepositReceipt(tenantId, rentalId);
  const recordReturn = useRecordDepositReturn(tenantId, rentalId);

  const [receiptFormOpen, setReceiptFormOpen] = useState(false);
  const [receivedAt, setReceivedAt] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [receivedMethod, setReceivedMethod] = useState<DepositPaymentMethod>("BANK_TRANSFER");
  const [receivedReference, setReceivedReference] = useState("");

  const [returnFormOpen, setReturnFormOpen] = useState(false);
  const [returnedAt, setReturnedAt] = useState("");
  const [returnedAmount, setReturnedAmount] = useState("");
  const [retainedAmount, setRetainedAmount] = useState("");
  const [retentionReason, setRetentionReason] = useState("");

  const [error, setError] = useState<string | null>(null);

  if (requiredAmountMinor === 0 && !deposit) {
    return null;
  }

  function toMinor(display: string): number {
    const value = Number(display.trim() || "0");
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  async function handleRecordReceipt(): Promise<void> {
    setError(null);
    if (!receivedAt) return;
    if (!tenantTimezone) {
      setError(t("rental.errors.timezoneNotLoaded"));
      return;
    }
    let receivedAtInstant: string;
    try {
      receivedAtInstant = tenantLocalToUtc(receivedAt, tenantTimezone).toISOString();
    } catch {
      setError(t("rental.errors.dstGap"));
      return;
    }
    try {
      await recordReceipt.mutateAsync({
        receivedAt: receivedAtInstant,
        receivedAmountMinor: toMinor(receivedAmount),
        receivedMethod,
        receivedReference: receivedReference || null,
      });
      setReceiptFormOpen(false);
    } catch (thrown) {
      setError(apiErrorMessage(thrown, t("common.error")));
    }
  }

  async function handleRecordReturn(): Promise<void> {
    setError(null);
    if (!returnedAt) return;
    if (!tenantTimezone) {
      setError(t("rental.errors.timezoneNotLoaded"));
      return;
    }
    let returnedAtInstant: string;
    try {
      returnedAtInstant = tenantLocalToUtc(returnedAt, tenantTimezone).toISOString();
    } catch {
      setError(t("rental.errors.dstGap"));
      return;
    }
    try {
      await recordReturn.mutateAsync({
        returnedAt: returnedAtInstant,
        returnedAmountMinor: toMinor(returnedAmount),
        retainedAmountMinor: toMinor(retainedAmount),
        retentionReason: retentionReason || null,
      });
      setReturnFormOpen(false);
    } catch (thrown) {
      setError(apiErrorMessage(thrown, t("common.error")));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("rental.deposit.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("rental.deposit.required")}</span>
          <span>{formatMoney(requiredAmountMinor, currency)}</span>
        </div>

        {deposit?.receivedAt && (
          <div className="flex flex-col gap-1 rounded-md border p-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("rental.deposit.received")}</span>
              <span>{formatMoney(deposit.receivedAmountMinor ?? 0, deposit.currency)}</span>
            </div>
            <span className="text-muted-foreground text-xs">
              {formatDate(deposit.receivedAt, i18n.language, tenantTimezone)}
              {deposit.receivedMethod ? ` · ${t(`payment.methods.${deposit.receivedMethod}`)}` : ""}
              {deposit.receivedReference ? ` · ${deposit.receivedReference}` : ""}
            </span>
          </div>
        )}

        {deposit?.returnedAt && (
          <div className="flex flex-col gap-1 rounded-md border p-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("rental.deposit.returned")}</span>
              <span>{formatMoney(deposit.returnedAmountMinor ?? 0, deposit.currency)}</span>
            </div>
            {(deposit.retainedAmountMinor ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("rental.deposit.retained")}</span>
                <span>{formatMoney(deposit.retainedAmountMinor ?? 0, deposit.currency)}</span>
              </div>
            )}
            {deposit.retentionReason && (
              <span className="text-muted-foreground text-xs">{deposit.retentionReason}</span>
            )}
            <span className="text-muted-foreground text-xs">
              {formatDate(deposit.returnedAt, i18n.language, tenantTimezone)}
            </span>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        {canManage && !deposit?.receivedAt && (
          <div>
            {!receiptFormOpen ? (
              <Button variant="outline" size="sm" onClick={() => setReceiptFormOpen(true)}>
                {t("rental.deposit.recordReceipt")}
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <DateTimeField
                  value={receivedAt}
                  onChange={setReceivedAt}
                  locale={i18n.language}
                  dateLabel={t("rental.deposit.receivedAt")}
                />
                <input
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  placeholder={t("rental.deposit.amountPlaceholder")}
                  value={receivedAmount}
                  onChange={(event) => setReceivedAmount(event.target.value)}
                  inputMode="decimal"
                />
                <select
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  value={receivedMethod}
                  onChange={(event) =>
                    setReceivedMethod(event.target.value as DepositPaymentMethod)
                  }
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {t(`payment.methods.${method}`)}
                    </option>
                  ))}
                </select>
                <input
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  placeholder={t("rental.deposit.referencePlaceholder")}
                  value={receivedReference}
                  onChange={(event) => setReceivedReference(event.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleRecordReceipt()}
                    disabled={recordReceipt.isPending || !receivedAt}
                  >
                    {t("asset.save")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setReceiptFormOpen(false)}>
                    {t("customer.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {canManage && deposit?.receivedAt && !deposit.returnedAt && (
          <div>
            {!returnFormOpen ? (
              <Button variant="outline" size="sm" onClick={() => setReturnFormOpen(true)}>
                {t("rental.deposit.recordReturn")}
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <DateTimeField
                  value={returnedAt}
                  onChange={setReturnedAt}
                  locale={i18n.language}
                  dateLabel={t("rental.deposit.returnedAt")}
                />
                <input
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  placeholder={t("rental.deposit.returnedAmountPlaceholder")}
                  value={returnedAmount}
                  onChange={(event) => setReturnedAmount(event.target.value)}
                  inputMode="decimal"
                />
                <input
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  placeholder={t("rental.deposit.retainedAmountPlaceholder")}
                  value={retainedAmount}
                  onChange={(event) => setRetainedAmount(event.target.value)}
                  inputMode="decimal"
                />
                {toMinor(retainedAmount) > 0 && (
                  <input
                    className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                    placeholder={t("rental.deposit.retentionReasonPlaceholder")}
                    value={retentionReason}
                    onChange={(event) => setRetentionReason(event.target.value)}
                  />
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleRecordReturn()}
                    disabled={recordReturn.isPending || !returnedAt}
                  >
                    {t("asset.save")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setReturnFormOpen(false)}>
                    {t("customer.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
