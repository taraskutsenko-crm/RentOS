"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@rentos/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { InvoiceStatusBadge } from "../../../../components/invoices/invoice-status-badge";
import { PageHeader } from "../../../../components/shell/page-header";
import { useBankAccounts } from "../../../../hooks/use-bank-accounts";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { useCustomers } from "../../../../hooks/use-customers";
import {
  invoicePdfUrl,
  useCancelInvoice,
  useInvoice,
  useIssueInvoice,
  useSendInvoice,
  useUpdateInvoice,
  type InvoiceItemInput,
} from "../../../../hooks/use-invoices";
import { useRecordPayment, usePayments } from "../../../../hooks/use-payments";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { formatBusinessDate } from "../../../../lib/date-format";
import { fromMinorUnits, formatMoney, toMinorUnits } from "../../../../lib/money";
import type { Invoice, PaymentMethod } from "../../../../types/invoice";

interface EditableItem {
  description: string;
  quantity: string;
  unit: string;
  unitNetPrice: string;
  discount: string;
  taxRatePercent: string;
  sourceRentalItemId?: string | undefined;
}

function toEditableItems(
  items: {
    description: string;
    quantity: number;
    unit: string | null;
    unitNetPriceMinor: number;
    discountMinor: number;
    taxRateBp: number;
    sourceRentalItemId: string | null;
  }[],
): EditableItem[] {
  return items.map((item) => ({
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit ?? "",
    unitNetPrice: fromMinorUnits(item.unitNetPriceMinor),
    discount: fromMinorUnits(item.discountMinor),
    taxRatePercent: (item.taxRateBp / 100).toString(),
    sourceRentalItemId: item.sourceRentalItemId ?? undefined,
  }));
}

function toInvoiceItemInputs(items: EditableItem[]): InvoiceItemInput[] {
  return items.map((item) => ({
    description: item.description,
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    unit: item.unit || null,
    unitNetPriceMinor: toMinorUnits(item.unitNetPrice) ?? 0,
    discountMinor: toMinorUnits(item.discount) ?? 0,
    taxRateBp: Math.round((parseFloat(item.taxRatePercent) || 0) * 100),
    sourceRentalItemId: item.sourceRentalItemId,
  }));
}

export default function InvoiceDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const { data: invoice, isLoading } = useInvoice(tenantId, params.id);

  if (isLoading || !invoice || !tenantId) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  // Keyed by invoice.id so a switch to a different invoice (or the status
  // change after issuing) remounts this editor with fresh initial state
  // read directly from `invoice` — no effect needed to sync loaded data
  // into local state (see react-hooks/set-state-in-effect).
  return <InvoiceEditor key={invoice.id} invoice={invoice} tenantId={tenantId} />;
}

function InvoiceEditor({ invoice, tenantId }: { invoice: Invoice; tenantId: string }) {
  const { t, i18n } = useTranslation();
  const updateInvoice = useUpdateInvoice(tenantId);
  const issueInvoice = useIssueInvoice(tenantId);
  const sendInvoice = useSendInvoice(tenantId);
  const cancelInvoice = useCancelInvoice(tenantId);
  const { data: customers } = useCustomers(tenantId, { pageSize: 100 });
  const { data: bankAccounts } = useBankAccounts(tenantId);
  const { data: payments } = usePayments(tenantId, invoice.id);
  const recordPayment = useRecordPayment(tenantId);

  const canUpdate = usePermission("invoices.update");
  const canIssue = usePermission("invoices.issue");
  const canSend = usePermission("invoices.send");
  const canCancel = usePermission("invoices.cancel");
  const canDownload = usePermission("invoices.download");
  const canRecordPayment = usePermission("payments.record");

  const [items, setItems] = useState<EditableItem[]>(() => toEditableItems(invoice.items));
  const [customerId, setCustomerId] = useState(invoice.customerId);
  const [bankAccountId, setBankAccountId] = useState(invoice.bankAccountId ?? "");
  const [issueDate, setIssueDate] = useState(invoice.issueDate.slice(0, 10));
  const [saleDate, setSaleDate] = useState(invoice.saleDate?.slice(0, 10) ?? "");
  const [dueDate, setDueDate] = useState(invoice.dueDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const isDraft = invoice.status === "DRAFT";

  function updateItemField(index: number, field: keyof EditableItem, value: string): void {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }

  function addItem(): void {
    setItems((current) => [
      ...current,
      {
        description: "",
        quantity: "1",
        unit: "",
        unitNetPrice: "0.00",
        discount: "0.00",
        taxRatePercent: "0",
      },
    ]);
  }

  function removeItem(index: number): void {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  async function handleSaveDraft(): Promise<void> {
    setError(null);
    try {
      await updateInvoice.mutateAsync({
        id: invoice.id,
        input: {
          customerId,
          bankAccountId: bankAccountId || null,
          issueDate: issueDate ? new Date(issueDate).toISOString() : undefined,
          saleDate: saleDate ? new Date(saleDate).toISOString() : null,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          notes: notes || null,
          items: toInvoiceItemInputs(items),
        },
      });
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  async function handleIssue(): Promise<void> {
    setError(null);
    try {
      await issueInvoice.mutateAsync(invoice.id);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  async function handleSend(): Promise<void> {
    setError(null);
    try {
      await sendInvoice.mutateAsync(invoice.id);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  async function handleCancel(): Promise<void> {
    if (!window.confirm(t("invoice.cancelConfirm"))) return;
    setError(null);
    try {
      await cancelInvoice.mutateAsync({ id: invoice.id });
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  async function handleRecordPayment(): Promise<void> {
    setPaymentError(null);
    const amountMinor = toMinorUnits(paymentAmount);
    if (!amountMinor || amountMinor <= 0) {
      setPaymentError(t("payment.invalidAmount"));
      return;
    }
    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        input: {
          amountMinor,
          paymentDate: new Date(paymentDate).toISOString(),
          method: paymentMethod,
          reference: paymentReference || null,
        },
      });
      setPaymentDialogOpen(false);
      setPaymentAmount("");
      setPaymentReference("");
    } catch (err) {
      setPaymentError(apiErrorMessage(err, t("common.error")));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {isDraft ? t("invoice.draftLabel") : invoice.invoiceNumber}
            <InvoiceStatusBadge status={invoice.status} />
          </span>
        }
        subtitle={
          invoice.customer
            ? invoice.customer.company ||
              `${invoice.customer.firstName} ${invoice.customer.lastName}`
            : undefined
        }
        secondaryActions={
          <>
            {invoice.rental && (
              <Button asChild variant="outline">
                <Link href={`/app/rentals/${invoice.rental.id}`}>
                  {invoice.rental.rentalNumber}
                </Link>
              </Button>
            )}
            {!isDraft && canDownload && (
              <Button asChild variant="outline">
                <a href={invoicePdfUrl(tenantId, invoice.id)} target="_blank" rel="noreferrer">
                  {t("invoice.downloadPdf")}
                </a>
              </Button>
            )}
            {invoice.status !== "CANCELLED" &&
              invoice.status !== "PAID" &&
              invoice.status !== "CORRECTED" &&
              canCancel && (
                <Button variant="outline" onClick={() => void handleCancel()}>
                  {t("invoice.cancel")}
                </Button>
              )}
          </>
        }
        primaryAction={
          isDraft && canIssue ? (
            <Button onClick={() => void handleIssue()} disabled={issueInvoice.isPending}>
              {t("invoice.issue")}
            </Button>
          ) : invoice.status === "ISSUED" && canSend ? (
            <Button onClick={() => void handleSend()} disabled={sendInvoice.isPending}>
              {t("invoice.send")}
            </Button>
          ) : undefined
        }
      />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("invoice.sections.details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex flex-col gap-1.5">
                <Label>{t("customer.title")}</Label>
                {isDraft && canUpdate ? (
                  <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    {customers?.items.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.company || `${customer.firstName} ${customer.lastName}`}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p>{invoice.buyerSnapshot.name}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t("bankAccount.settings.title")}</Label>
                {isDraft && canUpdate ? (
                  <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                    <option value="">{t("document.fields.none")}</option>
                    {bankAccounts?.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p>{invoice.bankSnapshot?.label ?? "—"}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t("invoice.fields.issueDate")}</Label>
                {isDraft && canUpdate ? (
                  <Input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                ) : (
                  <p>{formatBusinessDate(invoice.issueDate, i18n.language)}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t("invoice.fields.dueDate")}</Label>
                {isDraft && canUpdate ? (
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                ) : (
                  <p>
                    {invoice.dueDate ? formatBusinessDate(invoice.dueDate, i18n.language) : "—"}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t("invoice.fields.saleDate")}</Label>
                {isDraft && canUpdate ? (
                  <Input
                    type="date"
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                  />
                ) : (
                  <p>
                    {invoice.saleDate ? formatBusinessDate(invoice.saleDate, i18n.language) : "—"}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{t("invoice.fields.currency")}</Label>
                <p>{invoice.currency}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t("invoice.sections.items")}</CardTitle>
              {isDraft && canUpdate && (
                <Button variant="outline" size="sm" onClick={addItem}>
                  {t("invoice.addLine")}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                      <th className="p-2">{t("invoice.fields.description")}</th>
                      <th className="p-2">{t("invoice.fields.quantity")}</th>
                      <th className="p-2">{t("invoice.fields.unit")}</th>
                      <th className="p-2">{t("invoice.fields.unitPrice")}</th>
                      <th className="p-2">{t("invoice.fields.taxRate")}</th>
                      {isDraft && canUpdate && <th className="p-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {isDraft && canUpdate
                      ? items.map((item, index) => (
                          <tr key={index} className="border-b">
                            <td className="p-2">
                              <Input
                                value={item.description}
                                onChange={(e) =>
                                  updateItemField(index, "description", e.target.value)
                                }
                              />
                            </td>
                            <td className="w-20 p-2">
                              <Input
                                value={item.quantity}
                                onChange={(e) => updateItemField(index, "quantity", e.target.value)}
                              />
                            </td>
                            <td className="w-24 p-2">
                              <Input
                                value={item.unit}
                                onChange={(e) => updateItemField(index, "unit", e.target.value)}
                              />
                            </td>
                            <td className="w-28 p-2">
                              <Input
                                value={item.unitNetPrice}
                                onChange={(e) =>
                                  updateItemField(index, "unitNetPrice", e.target.value)
                                }
                              />
                            </td>
                            <td className="w-20 p-2">
                              <Input
                                value={item.taxRatePercent}
                                onChange={(e) =>
                                  updateItemField(index, "taxRatePercent", e.target.value)
                                }
                              />
                            </td>
                            <td className="p-2">
                              <Button variant="outline" size="sm" onClick={() => removeItem(index)}>
                                {t("common.remove")}
                              </Button>
                            </td>
                          </tr>
                        ))
                      : invoice.items.map((item) => (
                          <tr key={item.id} className="border-b">
                            <td className="p-2">{item.description}</td>
                            <td className="p-2">{item.quantity}</td>
                            <td className="p-2">{item.unit ?? "—"}</td>
                            <td className="p-2">
                              {formatMoney(item.unitNetPriceMinor, invoice.currency)}
                            </td>
                            <td className="p-2">{(item.taxRateBp / 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>

              {isDraft && canUpdate && (
                <div className="mt-4 flex flex-col gap-2">
                  <Label htmlFor="notes">{t("invoice.fields.notes")}</Label>
                  <textarea
                    id="notes"
                    className="border-input min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                  <Button
                    className="w-fit"
                    onClick={() => void handleSaveDraft()}
                    disabled={updateInvoice.isPending}
                  >
                    {updateInvoice.isPending ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              )}

              {!isDraft && invoice.notes && (
                <p className="text-muted-foreground mt-4 text-sm whitespace-pre-wrap">
                  {invoice.notes}
                </p>
              )}
            </CardContent>
          </Card>

          {!isDraft && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t("payment.title")}</CardTitle>
                {canRecordPayment && (
                  <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(true)}>
                    {t("payment.record")}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!payments || payments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("payment.empty")}</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {payments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between">
                        <span>{formatBusinessDate(payment.paymentDate, i18n.language)}</span>
                        <span className="text-muted-foreground">
                          {t(`payment.methods.${payment.method}`)}
                        </span>
                        <span>{formatMoney(payment.amountMinor, payment.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("invoice.sections.totals")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("invoice.fields.subtotal")}</span>
                <span>{formatMoney(invoice.subtotalMinor, invoice.currency)}</span>
              </div>
              {invoice.discountMinor > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("invoice.fields.discount")}</span>
                  <span>-{formatMoney(invoice.discountMinor, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("invoice.fields.tax")}</span>
                <span>{formatMoney(invoice.taxMinor, invoice.currency)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>{t("invoice.fields.total")}</span>
                <span>{formatMoney(invoice.totalMinor, invoice.currency)}</span>
              </div>
              {invoice.paidMinor > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("invoice.fields.paid")}</span>
                  <span>{formatMoney(invoice.paidMinor, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>{t("invoice.fields.remaining")}</span>
                <span>{formatMoney(invoice.remainingMinor, invoice.currency)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payment.record")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {paymentError && <p className="text-destructive text-sm">{paymentError}</p>}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentAmount">{t("payment.fields.amount")}</Label>
              <Input
                id="paymentAmount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentDate">{t("payment.fields.date")}</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentMethod">{t("payment.fields.method")}</Label>
              <Select
                id="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                <option value="BANK_TRANSFER">{t("payment.methods.BANK_TRANSFER")}</option>
                <option value="CASH">{t("payment.methods.CASH")}</option>
                <option value="CARD">{t("payment.methods.CARD")}</option>
                <option value="OTHER">{t("payment.methods.OTHER")}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentReference">{t("payment.fields.reference")}</Label>
              <Input
                id="paymentReference"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleRecordPayment()} disabled={recordPayment.isPending}>
              {recordPayment.isPending ? t("common.saving") : t("payment.record")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
