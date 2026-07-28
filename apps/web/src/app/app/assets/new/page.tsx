"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { AssetForm } from "../../../../components/assets/asset-form";
import { useCreateAsset, type AssetInput } from "../../../../hooks/use-assets";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useCurrentTenantRole } from "../../../../hooks/use-current-tenant-role";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";

export default function NewAssetPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [tenantId] = useCurrentTenantId();
  const { data: tenantRole } = useCurrentTenantRole();
  const createAsset = useCreateAsset(tenantId);

  async function handleSubmit(input: AssetInput): Promise<void> {
    const created = await createAsset.mutateAsync(input);
    router.push(`/app/assets/${created.id}`);
  }

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>{t("asset.newAsset")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetForm
            tenantId={tenantId}
            defaultCurrency={tenantRole?.tenant.defaultCurrency}
            onSubmit={handleSubmit}
            isPending={createAsset.isPending}
            errorMessage={
              createAsset.isError ? apiErrorMessage(createAsset.error, t("common.error")) : null
            }
            submitLabel={t("asset.save")}
            submittingLabel={t("asset.saving")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
