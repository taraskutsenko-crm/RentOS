"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

import { AssetFilesManager } from "../../../../../components/assets/asset-files-manager";
import { AssetForm } from "../../../../../components/assets/asset-form";
import { useAsset, useUpdateAsset, type AssetInput } from "../../../../../hooks/use-assets";
import { useCurrentTenantId } from "../../../../../hooks/use-current-tenant";
import { useCurrentTenantRole, usePermission } from "../../../../../hooks/use-current-tenant-role";
import { apiErrorMessage } from "../../../../../lib/api-error-i18n";
import { fromMinorUnits } from "../../../../../lib/money";

export default function EditAssetPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();
  const { data: tenantRole } = useCurrentTenantRole();
  const { data: asset, isLoading } = useAsset(tenantId, params.id);
  const updateAsset = useUpdateAsset(tenantId);
  const canManageImages = usePermission("assets.manage_images");
  const canManageDocuments = usePermission("assets.manage_documents");

  async function handleSubmit(input: AssetInput): Promise<void> {
    await updateAsset.mutateAsync({ id: params.id, input });
    router.push(`/app/assets/${params.id}`);
  }

  if (isLoading || !asset) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-8">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>{t("asset.editAsset")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetForm
            tenantId={tenantId}
            defaultCurrency={tenantRole?.tenant.defaultCurrency}
            initialValues={{
              name: asset.name,
              internalNumber: asset.internalNumber,
              categoryId: asset.categoryId,
              statusId: "",
              sku: asset.sku ?? "",
              serialNumber: asset.serialNumber ?? "",
              barcode: asset.barcode ?? "",
              qrCodeValue: asset.qrCodeValue ?? "",
              manufacturer: asset.manufacturer ?? "",
              model: asset.model ?? "",
              description: asset.description ?? "",
              purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : "",
              purchasePriceDisplay: fromMinorUnits(asset.purchasePriceMinor),
              purchaseCurrency: asset.purchaseCurrency ?? "",
              replacementValueDisplay: fromMinorUnits(asset.replacementValueMinor),
              replacementCurrency: asset.replacementCurrency ?? "",
              conditionNotes: asset.conditionNotes ?? "",
              isRentable: asset.isRentable,
              isActive: asset.isActive,
            }}
            initialCustomFields={asset.customFields}
            onSubmit={handleSubmit}
            isPending={updateAsset.isPending}
            errorMessage={
              updateAsset.isError ? apiErrorMessage(updateAsset.error, t("common.error")) : null
            }
            submitLabel={t("asset.save")}
            submittingLabel={t("asset.saving")}
          />
        </CardContent>
      </Card>

      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>{t("asset.sections.filesManagement")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetFilesManager
            tenantId={tenantId}
            assetId={asset.id}
            images={asset.images}
            documents={asset.documents}
            canManageImages={canManageImages}
            canManageDocuments={canManageDocuments}
          />
        </CardContent>
      </Card>
    </div>
  );
}
