"use client";

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { useSelectTenant, useTenants } from "../../../hooks/use-auth";
import { useCurrentTenantId } from "../../../hooks/use-current-tenant";

export default function SelectTenantPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useTenants();
  const selectTenant = useSelectTenant();
  const [, setCurrentTenantId] = useCurrentTenantId();

  async function handleSelect(tenantId: string): Promise<void> {
    await selectTenant.mutateAsync(tenantId);
    setCurrentTenantId(tenantId);
    router.push("/app");
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("tenant.selectTitle")}</CardTitle>
          <CardDescription>{t("tenant.selectSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
        </CardContent>
      </Card>
    </div>
  );
}
