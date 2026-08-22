"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@rentos/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission, useCurrentTenantRole } from "../../../../hooks/use-current-tenant-role";
import {
  useConnectEInvoiceProvider,
  useDisconnectEInvoiceProvider,
  useEInvoiceConnection,
} from "../../../../hooks/use-einvoice-connections";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";

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

  const [credentials, setCredentials] = useState("");
  const [environment, setEnvironment] = useState("test");
  const [error, setError] = useState<string | null>(null);

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

      {!showKsef && (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground text-sm">
              {t("integration.settings.noneAvailable")}
            </p>
          </CardContent>
        </Card>
      )}

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
