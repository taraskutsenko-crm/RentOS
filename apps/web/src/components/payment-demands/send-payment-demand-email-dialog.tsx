"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSendPaymentDemandEmail } from "../../hooks/use-payment-demands";
import { apiErrorMessage } from "../../lib/api-error-i18n";

const NOT_CONFIGURED_ERROR = "No email provider is configured";

export interface SendPaymentDemandEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  invoiceId: string;
  paymentDemandId: string;
  /** Pre-filled from the invoice's own customer — the same explicit,
   * editable-before-sending pattern as SendQuoteDialog/SendDocumentEmail
   * (see Task 3/4 email-clarity work). */
  defaultRecipientEmail: string;
}

/**
 * Stage 16 Part 12 — Payment Demand's "Send" used to fire an email
 * immediately with no visibility into the recipient or message (a single
 * one-shot button, matching the exact ambiguity already fixed for Quote/
 * Document sends). This dialog makes it explicit: shows/edits the real
 * recipient, an optional message, states the PDF attachment, and reports
 * the truthful delivery outcome (sent/failed/not configured) — reusing the
 * fixed, never-orphaned-PENDING email delivery architecture. No real
 * external email is sent beyond what the user explicitly confirms here.
 */
export function SendPaymentDemandEmailDialog({
  open,
  onOpenChange,
  tenantId,
  invoiceId,
  paymentDemandId,
  defaultRecipientEmail,
}: SendPaymentDemandEmailDialogProps) {
  const { t } = useTranslation();
  const sendEmail = useSendPaymentDemandEmail(tenantId);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ sent: boolean; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset to a fresh compose view whenever the dialog is (re)opened — state
  // adjustment during render, not a setState-in-effect. See SendQuoteDialog/
  // command-palette.tsx's identical `wasOpen` convention.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRecipientEmail(defaultRecipientEmail);
      setMessage("");
      setResult(null);
      setError(null);
    }
  }

  async function handleSend(): Promise<void> {
    setError(null);
    try {
      const trimmedRecipient = recipientEmail.trim();
      const trimmedMessage = message.trim();
      const sendResult = await sendEmail.mutateAsync({
        invoiceId,
        paymentDemandId,
        ...(trimmedRecipient ? { recipientEmail: trimmedRecipient } : {}),
        ...(trimmedMessage ? { message: trimmedMessage } : {}),
      });
      setResult(sendResult);
    } catch (caught) {
      setError(apiErrorMessage(caught, t("common.error")));
    }
  }

  function deliveryStatusText(sendResult: { sent: boolean; error?: string }): string {
    if (sendResult.sent) {
      return t("payment.demand.sendDialog.successMessage", { email: recipientEmail });
    }
    if (sendResult.error === NOT_CONFIGURED_ERROR) {
      return t("payment.demand.sendDialog.notConfiguredMessage");
    }
    return t("payment.demand.sendDialog.failureMessage", {
      error: sendResult.error ?? t("common.error"),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("payment.demand.sendDialog.title")}</DialogTitle>
        </DialogHeader>

        {result ? (
          <>
            <DialogDescription className={result.sent ? "text-success" : "text-destructive"}>
              {deliveryStatusText(result)}
            </DialogDescription>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="send-demand-recipient">
                  {t("payment.demand.sendDialog.recipientLabel")}
                </Label>
                <Input
                  id="send-demand-recipient"
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  disabled={sendEmail.isPending}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="send-demand-message">
                  {t("payment.demand.sendDialog.messageLabel")}
                </Label>
                <textarea
                  id="send-demand-message"
                  className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  disabled={sendEmail.isPending}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t("payment.demand.sendDialog.attachmentNote")}
              </p>
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={sendEmail.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => void handleSend()}
                disabled={sendEmail.isPending || !recipientEmail.trim()}
              >
                {sendEmail.isPending
                  ? t("payment.demand.sendDialog.sending")
                  : t("payment.demand.sendDialog.send")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
