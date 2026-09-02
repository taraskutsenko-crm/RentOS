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

import { useSendQuote } from "../../hooks/use-quotes";
import { apiErrorMessage } from "../../lib/api-error-i18n";
import type { Quote, SendQuoteResult } from "../../types/quote";

const NOT_CONFIGURED_ERROR = "No email provider is configured";

export interface SendQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null;
  quote: Quote;
}

/**
 * Task 3 Part A4 — "Send quote" fires a real email attempt immediately
 * (QuotesService.send), which is exactly the ambiguity users reported
 * ("does Send mean email?"). This dialog makes that explicit before it
 * happens: shows/edits the real recipient, an optional message, and states
 * the PDF attachment — then reports the actual delivery outcome (sent /
 * failed / not configured) using the existing QuoteEmailDelivery pipeline,
 * never a fabricated "email sent" confirmation. No real external email is
 * sent beyond what the user explicitly confirms here.
 */
export function SendQuoteDialog({ open, onOpenChange, tenantId, quote }: SendQuoteDialogProps) {
  const { t } = useTranslation();
  const sendQuote = useSendQuote(tenantId);
  const [recipientEmail, setRecipientEmail] = useState(quote.customer.email ?? "");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<SendQuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset to a fresh compose view whenever the dialog is (re)opened — state
  // adjustment during render (React's documented pattern for resetting
  // state on a prop change), not a setState-in-effect, so no extra render
  // pass and no cascading-render lint violation. See command-palette.tsx's
  // identical `wasOpen` pattern for the established convention.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRecipientEmail(quote.customer.email ?? "");
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
      const sendResult = await sendQuote.mutateAsync({
        id: quote.id,
        ...(trimmedRecipient ? { recipientEmail: trimmedRecipient } : {}),
        ...(trimmedMessage ? { message: trimmedMessage } : {}),
      });
      setResult(sendResult);
    } catch (caught) {
      setError(apiErrorMessage(caught, t("common.error")));
    }
  }

  function deliveryStatusText(sendResult: SendQuoteResult): string {
    if (sendResult.emailSent) {
      return t("quote.sendDialog.successMessage", { email: recipientEmail });
    }
    if (sendResult.emailError === NOT_CONFIGURED_ERROR) {
      return t("quote.sendDialog.notConfiguredMessage");
    }
    return t("quote.sendDialog.failureMessage", {
      error: sendResult.emailError ?? t("common.error"),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("quote.sendDialog.title")}</DialogTitle>
        </DialogHeader>

        {result ? (
          <>
            <DialogDescription
              className={result.emailSent ? "text-success" : "text-destructive"}
            >
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
                <Label htmlFor="send-quote-recipient">
                  {t("quote.sendDialog.recipientLabel")}
                </Label>
                <Input
                  id="send-quote-recipient"
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  disabled={sendQuote.isPending}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="send-quote-message">{t("quote.sendDialog.messageLabel")}</Label>
                <textarea
                  id="send-quote-message"
                  className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  disabled={sendQuote.isPending}
                />
              </div>
              <p className="text-muted-foreground text-xs">{t("quote.sendDialog.attachmentNote")}</p>
              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={sendQuote.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => void handleSend()}
                disabled={sendQuote.isPending || !recipientEmail.trim()}
              >
                {sendQuote.isPending ? t("quote.sendDialog.sending") : t("quote.sendDialog.send")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
