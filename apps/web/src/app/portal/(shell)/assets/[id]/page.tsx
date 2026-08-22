"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { portalAssetImageUrl, usePortalAsset } from "../../../../../hooks/use-portal-assets";
import { getAssetStatusLabel } from "../../../../../lib/asset-status-label";

export default function PortalAssetDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const { data: asset, isLoading, isError } = usePortalAsset(params.id);

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (isError || !asset) {
    return <p className="text-destructive text-sm">{t("common.error")}</p>;
  }

  const primaryImage = asset.images.find((image) => image.isPrimary) ?? asset.images[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{asset.name}</h1>
        <p className="text-muted-foreground text-sm">{asset.category.name}</p>
      </div>

      {primaryImage && (
        <Card className="w-fit">
          <CardContent className="p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- direct API-served image */}
            <img
              src={portalAssetImageUrl(asset.id, primaryImage.id)}
              alt={primaryImage.altText ?? asset.name}
              className="max-h-80 rounded-md object-contain"
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("portal.assets.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <InfoRow label={t("portal.assets.manufacturer")} value={asset.manufacturer ?? "—"} />
          <InfoRow label={t("portal.assets.model")} value={asset.model ?? "—"} />
          <InfoRow
            label={t("rental.fields.status")}
            value={getAssetStatusLabel(t, asset.currentStatus)}
          />
          <InfoRow label={t("portal.assets.condition")} value={asset.conditionNotes ?? "—"} />
        </CardContent>
      </Card>

      {asset.description && (
        <Card>
          <CardContent className="p-6 text-sm whitespace-pre-wrap">{asset.description}</CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span>{value}</span>
    </div>
  );
}
