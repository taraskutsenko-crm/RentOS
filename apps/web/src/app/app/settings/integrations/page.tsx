"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
} from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useMe } from "../../../../hooks/use-auth";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission, useCurrentTenantRole } from "../../../../hooks/use-current-tenant-role";
import {
  useConnectEInvoiceProvider,
  useDisconnectEInvoiceProvider,
  useEInvoiceConnection,
} from "../../../../hooks/use-einvoice-connections";
import {
  useEmailStatus,
  useSendTestEmail,
  type EmailStatus,
} from "../../../../hooks/use-email-status";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";

/** Tone for the status dot — matches the "never color alone" convention (dot + real text) used across Havelio's other status displays (Rental Attention, invoice status, ...). */
function emailStatusTone(status: EmailStatus | undefined): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "READY":
      return "success";
    case "CONNECTION_TEST_FAILED":
      return "danger";
    case "CONFIGURED":
      return "warning";
    default:
      return "neutral";
  }
}

const STATUS_DOT_CLASSES: Record<ReturnType<typeof emailStatusTone>, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground",
};

/**
 * Settings -> Integrations: country-specific e-invoicing providers only
 * (see docs/DECISIONS.md, "provider-neutral architecture" —
 * EInvoiceProvider/KsefProvider). Poland's KSeF is the only provider
 * implemented (as a settings/credential-storage boundary — no real KSeF
 * API call exists yet, see KsefProvider's doc comment); it only appears
 * for a tenant whose Company Profile country is Poland, never shown to
 * every tenant regardless of relevance.
 */
export default function IntegrationsSettingsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("integrations.manage");
  const { data: tenantRole } = useCurrentTenantRole();
  const countryCode = tenantRole?.tenant?.countryCode;
  const showKsef = countryCode === "PL";

  const { data: connection } = useEInvoiceConnection(tenantId, "KSEF");
  const connectProvider = useConnectEInvoiceProvider(tenantId);
  const disconnectProvider = useDisconnectEInvoiceProvider(tenantId);
  const { data: emailStatus } = useEmailStatus(tenantId);
  const { data: me } = useMe();

  const [credentials, setCredentials] = useState("");
  const [environment, setEnvironment] = useState("test");
  const [error, setError] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  const canSendTestEmail = canManage && emailStatus?.status !== "NOT_CONFIGURED";

  async function handleConnect(): Promise<void> {
    setError(null);
    try {
      await connectProvider.mutateAsync({ provider: "KSEF", credentials, environment });
      setCredentials("");
    } catch (err) {
      setError(apiErrorMessage(err, t("common.error")));
    }
  }

  async function handleDisconnect(): Promise<void> {
    await disconnectProvider.mutateAsync("KSEF");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("integration.settings.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("integration.settings.subtitle")}</p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>{t("integration.email.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`size-2.5 shrink-0 rounded-full ${STATUS_DOT_CLASSES[emailStatusTone(emailStatus?.status)]}`}
              aria-hidden="true"
            />
            <span className="font-medium">
              {t(`integration.email.statuses.${emailStatus?.status ?? "NOT_CONFIGURED"}`)}
            </span>
          </div>
          {emailStatus?.error && (
            <p className="text-muted-foreground text-sm">{emailStatus.error}</p>
          )}
          <p className="text-muted-foreground text-xs">{t("integration.email.hint")}</p>
          {canSendTestEmail && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setTestDialogOpen(true)}
            >
              {t("integration.email.sendTest")}
            </Button>
          )}
        </CardContent>
      </Card>

      <SendTestEmailDialog
        tenantId={tenantId}
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        defaultRecipient={me?.user.email ?? ""}
      />

      {showKsef && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>{t("integration.ksef.title")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("integration.ksef.status")}:</span>
              <span
                className={
                  connection?.status === "CONNECTED"
                    ? "text-success"
                    : connection?.status === "ERROR"
                      ? "text-destructive"
                      : "text-muted-foreground"
                }
              >
                {t(`integration.status.${connection?.status ?? "NOT_CONNECTED"}`)}
              </span>
            </div>

            {connection?.lastError && (
              <p className="text-muted-foreground text-sm">{connection.lastError}</p>
            )}

            {canManage && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ksefEnvironment">{t("integration.ksef.environment")}</Label>
                  <Select
                    id="ksefEnvironment"
                    value={environment}
                    onChange={(event) => setEnvironment(event.target.value)}
                  >
                    <option value="test">{t("integration.ksef.environmentTest")}</option>
                    <option value="production">
                      {t("integration.ksef.environmentProduction")}
                    </option>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ksefCredentials">{t("integration.ksef.credentials")}</Label>
                  <Input
                    id="ksefCredentials"
                    type="password"
                    autoComplete="off"
                    value={credentials}
                    onChange={(event) => setCredentials(event.target.value)}
                    placeholder={t("integration.ksef.credentialsPlaceholder")}
                  />
                </div>

                {error && <p className="text-destructive text-sm">{error}</p>}

                <div className="flex gap-2">
                  <Button
                    onClick={() => void handleConnect()}
                    disabled={!credentials || connectProvider.isPending}
                  >
                    {connectProvider.isPending ? t("common.saving") : t("integration.ksef.connect")}
                  </Button>
                  {connection && connection.status !== "NOT_CONNECTED" && (
                    <Button
                      variant="outline"
                      onClick={() => void handleDisconnect()}
                      disabled={disconnectProvider.isPending}
                    >
                      {t("integration.ksef.disconnect")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Task B4 — a small dialog that triggers a REAL send through the tenant's
 * configured provider (EmailTestService, same pipeline every other
 * transactional email uses). Recipient defaults to the current user's own
 * address for convenience but is always editable — never locked to it.
 */
function SendTestEmailDialog({
  tenantId,
  open,
  onOpenChange,
  defaultRecipient,
}: {
  tenantId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRecipient: string;
}) {
  const { t } = useTranslation();
  const sendTestEmail = useSendTestEmail(tenantId);
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [result, setResult] = useState<"success" | "failure" | null>(null);
  const [failureDetail, setFailureDetail] = useState<string | null>(null);

  // Re-seed the recipient field (and clear any prior result) each time the
  // dialog is (re)opened, rather than an effect syncing it continuously —
  // matches the "no effect syncing query data into local state" convention
  // used elsewhere on this page (CompanySignatureForm).
  function handleOpenChange(next: boolean): void {
    if (next) {
      setRecipient(defaultRecipient);
      setResult(null);
      setFailureDetail(null);
    }
    onOpenChange(next);
  }

  async function handleSend(): Promise<void> {
    setResult(null);
    setFailureDetail(null);
    try {
      const outcome = await sendTestEmail.mutateAsync(recipient);
      if (outcome.success) {
        setResult("success");
      } else {
        setResult("failure");
        setFailureDetail(outcome.error ?? null);
      }
    } catch (error) {
      setResult("failure");
      setFailureDetail(apiErrorMessage(error, t("integration.email.testDialog.failure")));
    }
  }

  const recipientValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("integration.email.testDialog.title")}</DialogTitle>
          <DialogDescription>{t("integration.email.testDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="testEmailRecipient">{t("integration.email.testDialog.recipient")}</Label>
          <Input
            id="testEmailRecipient"
            type="email"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            disabled={sendTestEmail.isPending}
          />
        </div>

        {result === "success" && (
          <p className="text-success text-sm">
            {t("integration.email.testDialog.success", { email: recipient })}
          </p>
        )}
        {result === "failure" && (
          <p className="text-destructive text-sm">
            {failureDetail ?? t("integration.email.testDialog.failure")}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={!recipientValid || sendTestEmail.isPending}
          >
            {sendTestEmail.isPending
              ? t("integration.email.testDialog.sending")
              : t("integration.email.sendTest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
