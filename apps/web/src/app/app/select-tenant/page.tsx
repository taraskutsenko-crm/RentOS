"use client";

import { Button } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { useSelectTenant, useTenants } from "../../../hooks/use-auth";
import { useCurrentTenantId } from "../../../hooks/use-current-tenant";
import { AuthAlert } from "../../../components/auth/auth-alert";
import { AuthCard, AuthHeader } from "../../../components/auth/auth-card";
import { AuthShell } from "../../../components/auth/auth-shell";

export default function SelectTenantPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useTenants();
  const selectTenant = useSelectTenant();
  const [, setCurrentTenantId] = useCurrentTenantId();

  async function handleSelect(tenantId: string): Promise<void> {
    try {
      await selectTenant.mutateAsync(tenantId);
      setCurrentTenantId(tenantId);
      router.push("/app");
    } catch {
      // Surfaced below via selectTenant.error.
    }
  }

  return (
    <AuthShell tone="primary" tagline={t("app.tagline")}>
      <AuthCard>
        <AuthHeader title={t("tenant.selectTitle")} subtitle={t("tenant.selectSubtitle")} />

        {selectTenant.isError && <AuthAlert>{t("auth.errors.generic")}</AuthAlert>}

        <div className="flex flex-col gap-3">
          {isLoading && <p className="text-muted-foreground text-sm">{t("common.loading")}</p>}
          {!isLoading && data?.tenants.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("tenant.noTenants")}</p>
          )}
          {data?.tenants.map((tenant) => (
            <Button
              key={tenant.id}
              variant="outline"
              className="justify-start"
              onClick={() => void handleSelect(tenant.id)}
              disabled={selectTenant.isPending}
            >
              {tenant.name}
            </Button>
          ))}
        </div>
      </AuthCard>
    </AuthShell>
  );
}
