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
import { useParams, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "../../../../components/data-table/confirm-dialog";
import { InvoiceStatusBadge } from "../../../../components/invoices/invoice-status-badge";
import { PaymentProgressBar } from "../../../../components/invoices/payment-progress-bar";
import { SendPaymentDemandEmailDialog } from "../../../../components/payment-demands/send-payment-demand-email-dialog";
import { PageHeader } from "../../../../components/shell/page-header";
import { useBankAccounts } from "../../../../hooks/use-bank-accounts";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { useCustomers } from "../../../../hooks/use-customers";
import { useEntitlementErrorToast } from "../../../../hooks/use-entitlement-error-toast";
import {
  invoicePdfUrl,
  useCancelInvoice,
  useInvoice,
  useInvoiceEmailDeliveries,
  useInvoicePreview,
  useIssueInvoice,
  useSendInvoice,
  useSendInvoiceEmail,
  useUpdateInvoice,
  type InvoiceItemInput,
} from "../../../../hooks/use-invoices";
import {
  paymentDemandPdfUrl,
  useCreatePaymentDemand,
  usePaymentDemandEmailDeliveries,
  usePaymentDemands,
} from "../../../../hooks/use-payment-demands";
import {
  useApplyDeposit,
  useMarkFullyPaid,
  useRecordPayment,
  useVoidPayment,
  usePayments,
} from "../../../../hooks/use-payments";
import { useRentalDeposit } from "../../../../hooks/use-rentals";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { formatBusinessDate } from "../../../../lib/date-format";
import { emailDeliveryDetailText } from "../../../../lib/email-delivery-status";
import { fromMinorUnits, formatMoney, toMinorUnits } from "../../../../lib/money";
import type { Invoice, PaymentDemand, PaymentMethod } from "../../../../types/invoice";

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
  const searchParams = useSearchParams();
  const [tenantId] = useCurrentTenantId();
  const { data: invoice, isLoading } = useInvoice(tenantId, params.id);

  if (isLoading || !invoice || !tenantId) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  // Keyed by invoice.id so a switch to a different invoice (or the status
  // change after issuing) remounts this editor with fresh initial state
  // read directly from `invoice` — no effect needed to sync loaded data
  // into local state (see react-hooks/set-state-in-effect).
  return (
    <InvoiceEditor
      key={invoice.id}
      invoice={invoice}
      tenantId={tenantId}
      prefillChargeDescription={searchParams.get("addChargeDescription")}
    />
  );
}

function InvoiceEditor({
  invoice,
  tenantId,
  prefillChargeDescription,
}: {
  invoice: Invoice;
  tenantId: string;
  prefillChargeDescription?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const updateInvoice = useUpdateInvoice(tenantId);
  const issueInvoice = useIssueInvoice(tenantId);
  const sendInvoice = useSendInvoice(tenantId);
  const cancelInvoice = useCancelInvoice(tenantId);
  const { data: customers } = useCustomers(tenantId, { pageSize: 100 });
  const { data: bankAccounts } = useBankAccounts(tenantId);
  const { data: payments } = usePayments(tenantId, invoice.id);
  const recordPayment = useRecordPayment(tenantId);
  const markFullyPaid = useMarkFullyPaid(tenantId);
  const voidPayment = useVoidPayment(tenantId);
  const applyDeposit = useApplyDeposit(tenantId);
  const { data: rentalDeposit } = useRentalDeposit(tenantId, invoice.rentalId);
  const { data: paymentDemands } = usePaymentDemands(tenantId, invoice.id);
  const createPaymentDemand = useCreatePaymentDemand(tenantId);
  const showEntitlementError = useEntitlementErrorToast();
  const { data: preview } = useInvoicePreview(tenantId, invoice.id);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const sendInvoiceEmail = useSendInvoiceEmail(tenantId);
  const { data: emailDeliveries } = useInvoiceEmailDeliveries(tenantId, invoice.id);

  const canUpdate = usePermission("invoices.update");
  const canIssue = usePermission("invoices.issue");
  const canSend = usePermission("invoices.send");
  const canCancel = usePermission("invoices.cancel");
  const canDownload = usePermission("invoices.download");
  const canRecordPayment = usePermission("payments.record");
  const canVoidPayment = usePermission("payments.void");
  const canCreateDemand = usePermission("payment_demands.create");
  const canSendDemand = usePermission("payment_demands.send");

  // A "Create additional charge" link from the Return Protocol/Rental
  // Workspace (see rentals/[id]/page.tsx) pre-fills exactly one extra blank
  // line's description — amount and tax are always left for staff to enter
  // explicitly, never invented (see DECISIONS.md D-107). Only meaningful on
  // a still-editable DRAFT invoice; a non-DRAFT invoice ignores the param.
  const [items, setItems] = useState<EditableItem[]>(() => {
    const base = toEditableItems(invoice.items);
    if (invoice.status === "DRAFT" && prefillChargeDescription) {
      return [
        ...base,
        {
          description: prefillChargeDescription,
          quantity: "1",
          unit: "",
          unitNetPrice: "0.00",
          discount: "0.00",
          taxRatePercent: "0",
        },
      ];
    }
    return base;
  });
  const [customerId, setCustomerId] = useState(invoice.customerId);
  const [bankAccountId, setBankAccountId] = useState(invoice.bankAccountId ?? "");
  const [issueDate, setIssueDate] = useState(invoice.issueDate.slice(0, 10));
  const [saleDate, setSaleDate] = useState(invoice.saleDate?.slice(0, 10) ?? "");
  const [dueDate, setDueDate] = useState(invoice.dueDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [wasPaymentDialogOpen, setWasPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Task 16 Part 3 — the dialog always opens pre-filled with the exact
  // remaining balance (still freely editable for a partial payment): state
  // adjustment during render (React's documented pattern for resetting
  // state on a prop/condition change), never a setState-in-effect — see
  // command-palette.tsx's identical `wasOpen` convention.
  if (paymentDialogOpen !== wasPaymentDialogOpen) {
    setWasPaymentDialogOpen(paymentDialogOpen);
    if (paymentDialogOpen) {
      setPaymentAmount(fromMinorUnits(invoice.remainingMinor));
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setPaymentMethod("BANK_TRANSFER");
      setPaymentReference("");
      setPaymentNotes("");
      setPaymentError(null);
    }
  }

  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);

  const [applyDepositDialogOpen, setApplyDepositDialogOpen] = useState(false);
  const [applyDepositAmount, setApplyDepositAmount] = useState("");
  const [applyDepositError, setApplyDepositError] = useState<string | null>(null);

  const [demandDialogOpen, setDemandDialogOpen] = useState(false);
  const [demandDeadline, setDemandDeadline] = useState("");
  const [demandError, setDemandError] = useState<string | null>(null);

  const [markFullyPaidConfirmOpen, setMarkFullyPaidConfirmOpen] = useState(false);
  const [demandEmailTargetId, setDemandEmailTargetId] = useState<string | null>(null);

  const isDraft = invoice.status === "DRAFT";
  // Canonical, server-derived figure — never recomputed here. The API's
  // RentalDepositsService.getBalance already nets out returned/retained
  // AND everything already applied to any receivable (including other
  // invoices funded from the same deposit); see docs/DECISIONS.md.
  const depositAvailableMinor = rentalDeposit?.balance?.availableMinor ?? 0;
  // The most that can actually be applied here is bounded by BOTH the
  // canonical available deposit AND this invoice's own remaining balance.
  const maxApplyDepositMinor = Math.max(0, Math.min(depositAvailableMinor, invoice.remainingMinor));

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
    setJustSaved(false);
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
      setJustSaved(true);
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

  async function handleSendEmail(): Promise<void> {
    setError(null);
    try {
      await sendInvoiceEmail.mutateAsync({ id: invoice.id });
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

  /**
   * The preview iframe renders the exact same HTML the PDF is built from
   * (see InvoiceRendererService), so printing its own content window gives
   * a direct-print action with no manual PDF download round trip — same
   * pattern as the generic Document detail page (see DECISIONS.md D-107).
   */
  function handlePrint(): void {
    previewFrameRef.current?.contentWindow?.print();
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
          notes: paymentNotes || null,
        },
      });
      setPaymentDialogOpen(false);
    } catch (err) {
      setPaymentError(apiErrorMessage(err, t("common.error")));
      showEntitlementError(err);
    }
  }

  /** "Mark as paid" — the exact remaining balance is always computed server-side; this never sends an amount. */
  async function handleMarkFullyPaid(): Promise<void> {
    setError(null);
    try {
      await markFullyPaid.mutateAsync({ invoiceId: invoice.id, input: {} });
      setMarkFullyPaidConfirmOpen(false);
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
      showEntitlementError(err);
    }
  }

  async function handleVoidPayment(): Promise<void> {
    if (!voidTargetId) return;
    setVoidError(null);
    if (!voidReason.trim()) {
      setVoidError(t("payment.voidReasonRequired"));
      return;
    }
    try {
      await voidPayment.mutateAsync({
        invoiceId: invoice.id,
        paymentId: voidTargetId,
        reason: voidReason.trim(),
      });
      setVoidTargetId(null);
      setVoidReason("");
    } catch (err) {
      setVoidError(apiErrorMessage(err, t("common.error")));
      showEntitlementError(err);
    }
  }

  async function handleApplyDeposit(): Promise<void> {
    setApplyDepositError(null);
    if (!rentalDeposit) return;
    const amountMinor = toMinorUnits(applyDepositAmount);
    if (!amountMinor || amountMinor <= 0) {
      setApplyDepositError(t("payment.invalidAmount"));
      return;
    }
    // Frontend-side help only — the API remains authoritative and
    // re-validates against the same canonical balance inside its own
    // locked transaction. This just avoids a round-trip for the common
    // case of typing more than what's actually still available.
    if (amountMinor > maxApplyDepositMinor) {
      setApplyDepositError(
        t("payment.applyDepositExceedsAvailable", {
          amount: formatMoney(maxApplyDepositMinor, invoice.currency),
        }),
      );
      return;
    }
    try {
      await applyDeposit.mutateAsync({
        invoiceId: invoice.id,
        input: { rentalDepositId: rentalDeposit.id, amountMinor },
      });
      setApplyDepositDialogOpen(false);
      setApplyDepositAmount("");
    } catch (err) {
      setApplyDepositError(apiErrorMessage(err, t("common.error")));
      showEntitlementError(err);
    }
  }

  async function handleCreatePaymentDemand(): Promise<void> {
    setDemandError(null);
    if (!demandDeadline) {
      setDemandError(t("payment.invalidAmount"));
      return;
    }
    try {
      await createPaymentDemand.mutateAsync({
        invoiceId: invoice.id,
        input: { requestedDeadline: new Date(demandDeadline).toISOString() },
      });
      setDemandDialogOpen(false);
      setDemandDeadline("");
    } catch (err) {
      setDemandError(apiErrorMessage(err, t("common.error")));
      showEntitlementError(err);
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
            {preview && (
              <Button variant="outline" onClick={handlePrint}>
                {t("document.print")}
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
      {justSaved && !updateInvoice.isPending && !error && (
        <p className="text-success text-sm">{t("invoice.saved")}</p>
      )}

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
                <div className="flex gap-2">
                  {canRecordPayment && invoice.remainingMinor > 0 && (
                    <Button
                      size="sm"
                      onClick={() => setMarkFullyPaidConfirmOpen(true)}
                      disabled={markFullyPaid.isPending}
                    >
                      {t("payment.markAsPaid")}
                    </Button>
                  )}
                  {canRecordPayment && (
                    <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(true)}>
                      {t("payment.record")}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {canRecordPayment && maxApplyDepositMinor > 0 && (
                  <div className="bg-muted/30 flex items-center justify-between rounded-md border p-3 text-sm">
                    <span>
                      {t("payment.depositAvailable", {
                        amount: formatMoney(depositAvailableMinor, invoice.currency),
                      })}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setApplyDepositDialogOpen(true)}>
                      {t("payment.applyDeposit")}
                    </Button>
                  </div>
                )}
                {!payments || payments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("payment.empty")}</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {payments.map((payment) => (
                      <li key={payment.id} className="flex flex-col gap-0.5 border-b pb-2 last:border-0">
                        <div
                          className={`flex items-center justify-between gap-2 ${payment.voidedAt ? "text-muted-foreground line-through" : ""}`}
                        >
                          <span>{formatBusinessDate(payment.paymentDate, i18n.language)}</span>
                          <span className="text-muted-foreground">
                            {t(`payment.methods.${payment.method}`)}
                          </span>
                          <span>{formatMoney(payment.amountMinor, payment.currency)}</span>
                          {payment.voidedAt ? (
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs no-underline">
                              {t("payment.voided")}
                            </span>
                          ) : (
                            canVoidPayment && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setVoidTargetId(payment.id);
                                  setVoidReason("");
                                  setVoidError(null);
                                }}
                              >
                                {t("payment.void")}
                              </Button>
                            )
                          )}
                        </div>
                        {/* Task 16 Part 7 — reference/note/deposit-source shown
                            for a live payment; the void reason (never the raw
                            payment detail — that stays visible above, struck
                            through) shown for a voided one, so the audit
                            history stays reconstructable in the UI, not just
                            in the database. */}
                        {payment.voidedAt ? (
                          <p className="text-muted-foreground text-xs">
                            {t("payment.voidedOn", {
                              date: formatBusinessDate(payment.voidedAt, i18n.language),
                            })}
                            {payment.voidReason ? ` — ${payment.voidReason}` : ""}
                          </p>
                        ) : (
                          (payment.reference || payment.notes || payment.sourceRentalDepositId) && (
                            <p className="text-muted-foreground text-xs">
                              {payment.sourceRentalDepositId && `${t("payment.fromDeposit")} · `}
                              {payment.reference &&
                                `${t("payment.fields.reference")}: ${payment.reference}`}
                              {payment.reference && payment.notes ? " · " : ""}
                              {payment.notes}
                            </p>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {!isDraft && (paymentDemands?.length ?? 0) > 0 || (!isDraft && canCreateDemand) ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t("payment.demand.navTitle")}</CardTitle>
                {canCreateDemand && invoice.isOverdue && invoice.remainingMinor > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setDemandDialogOpen(true)}>
                    {t("payment.demand.create")}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!paymentDemands || paymentDemands.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("payment.demand.empty")}</p>
                ) : (
                  <ul className="flex flex-col gap-3 text-sm">
                    {paymentDemands.map((demand) => (
                      <PaymentDemandListItem
                        key={demand.id}
                        tenantId={tenantId}
                        invoiceId={invoice.id}
                        demand={demand}
                        canSendDemand={canSendDemand}
                        onSendEmail={() => setDemandEmailTargetId(demand.id)}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
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

              {!isDraft && (
                <div className="mt-2 flex flex-col gap-2">
                  <PaymentProgressBar
                    percentagePaid={invoice.percentagePaid}
                    isOverdue={invoice.isOverdue}
                  />
                  <div className="text-muted-foreground flex justify-between text-xs">
                    <span>
                      {t("payment.paidOf", {
                        paid: formatMoney(invoice.paidMinor, invoice.currency),
                        total: formatMoney(invoice.totalMinor, invoice.currency),
                      })}
                    </span>
                    <span>
                      {t("payment.percentPaid", { percent: Math.round(invoice.percentagePaid) })}
                    </span>
                  </div>
                  {invoice.isOverdue && (
                    <div className="bg-destructive/10 text-destructive rounded-md p-2 text-xs">
                      <p className="font-medium">
                        {t("payment.overdueDays", { count: invoice.overdueDays })}
                      </p>
                      <p>
                        {t("payment.outstandingLabel", {
                          amount: formatMoney(invoice.overdueAmountMinor, invoice.currency),
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {preview && (
            <Card>
              <CardHeader>
                <CardTitle>{t("document.sections.preview")}</CardTitle>
              </CardHeader>
              <CardContent>
                <iframe
                  ref={previewFrameRef}
                  title={t("document.sections.preview")}
                  srcDoc={preview.html}
                  className="h-[600px] w-full rounded-md border bg-white"
                />
              </CardContent>
            </Card>
          )}

          {!isDraft && canSend && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t("invoice.email.title")}</CardTitle>
                <Button
                  size="sm"
                  onClick={() => void handleSendEmail()}
                  disabled={sendInvoiceEmail.isPending}
                >
                  {t("invoice.email.send")}
                </Button>
              </CardHeader>
              {emailDeliveries && emailDeliveries.length > 0 && (
                <CardContent>
                  <ul className="flex flex-col gap-2 text-sm">
                    {emailDeliveries.map((delivery) => (
                      <li
                        key={delivery.id}
                        className="flex items-center justify-between border-b pb-2 last:border-0"
                      >
                        <span>
                          {delivery.recipientEmail} ·{" "}
                          {t(`document.email.statuses.${delivery.status}`)}
                          {emailDeliveryDetailText(t, delivery) &&
                            ` · ${emailDeliveryDetailText(t, delivery)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              )}
            </Card>
          )}
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="paymentNotes">{t("payment.fields.notes")}</Label>
              <textarea
                id="paymentNotes"
                className="border-input bg-background min-h-16 rounded-md border px-3 py-2 text-sm"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
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

      <Dialog open={!!voidTargetId} onOpenChange={(open) => !open && setVoidTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payment.void")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-muted-foreground text-sm">{t("payment.voidConfirm")}</p>
            {voidError && <p className="text-destructive text-sm">{voidError}</p>}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="voidReason">{t("payment.voidReasonLabel")}</Label>
              <Input
                id="voidReason"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidTargetId(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleVoidPayment()} disabled={voidPayment.isPending}>
              {voidPayment.isPending ? t("common.saving") : t("payment.void")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyDepositDialogOpen} onOpenChange={setApplyDepositDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payment.applyDeposit")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {applyDepositError && <p className="text-destructive text-sm">{applyDepositError}</p>}
            <p className="text-muted-foreground text-sm">
              {t("payment.depositAvailable", {
                amount: formatMoney(depositAvailableMinor, invoice.currency),
              })}
            </p>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="applyDepositAmount">{t("payment.applyDepositAmountLabel")}</Label>
                <button
                  type="button"
                  className="text-primary text-xs hover:underline"
                  onClick={() => setApplyDepositAmount(fromMinorUnits(maxApplyDepositMinor))}
                >
                  {formatMoney(maxApplyDepositMinor, invoice.currency)}
                </button>
              </div>
              <Input
                id="applyDepositAmount"
                value={applyDepositAmount}
                onChange={(e) => setApplyDepositAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDepositDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleApplyDeposit()} disabled={applyDeposit.isPending}>
              {applyDeposit.isPending ? t("common.saving") : t("payment.applyDeposit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={demandDialogOpen} onOpenChange={setDemandDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("payment.demand.create")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {demandError && <p className="text-destructive text-sm">{demandError}</p>}
            <p className="text-muted-foreground text-sm">{t("payment.demand.createConfirm")}</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="demandDeadline">{t("payment.demand.deadlineLabel")}</Label>
              <Input
                id="demandDeadline"
                type="date"
                value={demandDeadline}
                onChange={(e) => setDemandDeadline(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemandDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void handleCreatePaymentDemand()}
              disabled={createPaymentDemand.isPending}
            >
              {createPaymentDemand.isPending ? t("common.saving") : t("payment.demand.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={markFullyPaidConfirmOpen}
        onOpenChange={setMarkFullyPaidConfirmOpen}
        title={t("payment.markAsPaidConfirmTitle")}
        description={t("payment.markAsPaidConfirm", {
          amount: formatMoney(invoice.remainingMinor, invoice.currency),
        })}
        confirmLabel={t("payment.markAsPaid")}
        isLoading={markFullyPaid.isPending}
        onConfirm={() => void handleMarkFullyPaid()}
      />

      {demandEmailTargetId && (
        <SendPaymentDemandEmailDialog
          open={!!demandEmailTargetId}
          onOpenChange={(open) => !open && setDemandEmailTargetId(null)}
          tenantId={tenantId}
          invoiceId={invoice.id}
          paymentDemandId={demandEmailTargetId}
          defaultRecipientEmail={
            customers?.items.find((c) => c.id === invoice.customerId)?.email ?? ""
          }
        />
      )}
    </div>
  );
}

function PaymentDemandListItem({
  tenantId,
  invoiceId,
  demand,
  canSendDemand,
  onSendEmail,
}: {
  tenantId: string;
  invoiceId: string;
  demand: PaymentDemand;
  canSendDemand: boolean;
  onSendEmail: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { data: deliveries } = usePaymentDemandEmailDeliveries(tenantId, invoiceId, demand.id);

  return (
    <li className="flex flex-col gap-1 border-b pb-3 last:border-0">
      <div className="flex items-center justify-between">
        <span className="font-medium">{demand.demandNumber}</span>
        <span className="text-muted-foreground">{t(`payment.demand.statuses.${demand.status}`)}</span>
      </div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>
          {demand.sentAt
            ? t("payment.demand.sentAt", { date: formatBusinessDate(demand.sentAt, i18n.language) })
            : t("payment.demand.notSentYet")}
        </span>
        <span>{formatMoney(demand.outstandingAmountMinor, demand.currency)}</span>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={paymentDemandPdfUrl(tenantId, invoiceId, demand.id)} target="_blank" rel="noreferrer">
            {t("payment.demand.download")}
          </a>
        </Button>
        {canSendDemand && (
          <Button variant="outline" size="sm" onClick={onSendEmail}>
            {t("payment.demand.send")}
          </Button>
        )}
      </div>
      {deliveries && deliveries.length > 0 && (
        <ul className="flex flex-col gap-1 pt-1 text-xs">
          {deliveries.map((delivery) => (
            <li key={delivery.id} className="text-muted-foreground flex justify-between gap-2">
              <span>
                {delivery.recipientEmail} · {t(`document.email.statuses.${delivery.status}`)}
                {emailDeliveryDetailText(t, delivery) && ` · ${emailDeliveryDetailText(t, delivery)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
