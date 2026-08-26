"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AssetAvailabilitySection } from "../../../../components/assets/asset-availability-section";
import { AssetFilesManager } from "../../../../components/assets/asset-files-manager";
import { PinButton } from "../../../../components/shell/pin-button";
import { DashboardGrid, DashboardMetric } from "../../../../components/dashboard";
import { Timeline } from "../../../../components/timeline/timeline";
import { useAssetStatuses } from "../../../../hooks/use-asset-statuses";
import {
  useAsset,
  useAssetSummary,
  useAssetTimeline,
  useChangeAssetLocation,
  useChangeAssetStatus,
  useDeleteAsset,
} from "../../../../hooks/use-assets";
import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import { useTrackRecentItem } from "../../../../hooks/use-recent-items";
import { getAssetStatusLabel } from "../../../../lib/asset-status-label";
import { formatMoney } from "../../../../lib/money";
import { ASSET_TIMELINE_REGISTRY } from "../../../../lib/timeline-registries";

export default function AssetDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [tenantId] = useCurrentTenantId();

  const { data: asset, isLoading } = useAsset(tenantId, params.id);
  const { data: timeline } = useAssetTimeline(tenantId, params.id);
  const { data: summary } = useAssetSummary(tenantId, params.id);
  const trackRecentItem = useTrackRecentItem();

  useEffect(() => {
    if (!asset) return;
    trackRecentItem({
      id: `asset:${asset.id}`,
      kind: "entity",
      entityType: "asset",
      label: asset.name,
      href: `/app/assets/${asset.id}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-runs when the loaded asset changes
  }, [asset?.id]);
  const { data: statuses } = useAssetStatuses(tenantId);
  const deleteAsset = useDeleteAsset(tenantId);
  const changeStatus = useChangeAssetStatus(tenantId);
  const changeLocation = useChangeAssetLocation(tenantId);

  const canUpdate = usePermission("assets.update");
  const canDelete = usePermission("assets.delete");
  const canChangeStatus = usePermission("assets.change_status");
  const canManageImages = usePermission("assets.manage_images");
  const canManageDocuments = usePermission("assets.manage_documents");
  const canManageAvailability = usePermission("assets.manage_availability");

  const [statusFormOpen, setStatusFormOpen] = useState(false);
  const [selectedStatusId, setSelectedStatusId] = useState("");
  const [locationFormOpen, setLocationFormOpen] = useState(false);
  const [newLocation, setNewLocation] = useState("");

  if (isLoading || !asset) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  const isUnavailable = !asset.currentStatus.isAvailableForRental;
  const primaryImage = asset.images.find((image) => image.isPrimary) ?? asset.images[0] ?? null;

  async function handleDelete(): Promise<void> {
    if (window.confirm(t("asset.deleteConfirm"))) {
      await deleteAsset.mutateAsync(asset!.id);
      router.push("/app/assets");
    }
  }

  async function handleStatusChange(): Promise<void> {
    if (!selectedStatusId) return;
    await changeStatus.mutateAsync({ id: asset!.id, statusId: selectedStatusId });
    setStatusFormOpen(false);
  }

  async function handleLocationChange(): Promise<void> {
    if (!newLocation.trim()) return;
    await changeLocation.mutateAsync({ id: asset!.id, newLocation: newLocation.trim() });
    setLocationFormOpen(false);
    setNewLocation("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{asset.name}</h1>
            <span
              className={`rounded px-2 py-0.5 text-xs ${isUnavailable ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}`}
            >
              {getAssetStatusLabel(t, asset.currentStatus)}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">{asset.internalNumber}</p>
        </div>
        <div className="flex gap-2">
          <PinButton
            entityType="asset"
            entityId={asset.id}
            label={asset.name}
            href={`/app/assets/${asset.id}`}
          />
          {canUpdate && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/assets/${asset.id}/edit`}>{t("asset.editAsset")}</Link>
            </Button>
          )}
          {canDelete && (
            <Button variant="outline" size="sm" onClick={() => void handleDelete()}>
              {t("asset.delete")}
            </Button>
          )}
        </div>
      </div>

      <DashboardGrid className="grid-cols-2 sm:grid-cols-2 lg:grid-cols-2">
        <DashboardMetric
          label={t("asset.summary.totalRentals")}
          value={summary?.totalRentals ?? 0}
          isLoading={!summary}
        />
        <Card>
          <CardContent className="p-4">
            {summary ? (
              <p className="text-2xl font-semibold">
                {formatMoney(summary.revenueGeneratedMinor, summary.currency)}
              </p>
            ) : (
              <div role="status" aria-label={t("common.loading")}>
                <div className="bg-muted h-8 w-24 animate-pulse rounded" />
              </div>
            )}
            <p className="text-muted-foreground text-xs">{t("asset.summary.revenueGenerated")}</p>
          </CardContent>
        </Card>
      </DashboardGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("asset.sections.basicInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label={t("asset.fields.category")} value={asset.category.name} />
              <InfoRow label={t("asset.fields.manufacturer")} value={asset.manufacturer ?? "—"} />
              <InfoRow label={t("asset.fields.model")} value={asset.model ?? "—"} />
              <InfoRow label={t("asset.fields.sku")} value={asset.sku ?? "—"} />
              <InfoRow label={t("asset.fields.serialNumber")} value={asset.serialNumber ?? "—"} />
              <InfoRow label={t("asset.fields.barcode")} value={asset.barcode ?? "—"} />
              <InfoRow
                label={t("asset.fields.isRentable")}
                value={asset.isRentable ? t("asset.rentableYes") : t("asset.rentableNo")}
              />
              <InfoRow label={t("asset.fields.description")} value={asset.description ?? "—"} />
            </CardContent>
          </Card>

          {Object.keys(asset.customFields).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("asset.sections.customFields")}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                {Object.entries(asset.customFields).map(([key, value]) => (
                  <InfoRow key={key} label={key} value={formatCustomFieldValue(value)} />
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("asset.sections.financial")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow
                label={t("asset.fields.purchasePrice")}
                value={formatMoney(asset.purchasePriceMinor, asset.purchaseCurrency)}
              />
              <InfoRow
                label={t("asset.fields.replacementValue")}
                value={formatMoney(asset.replacementValueMinor, asset.replacementCurrency)}
              />
              <InfoRow
                label={t("asset.fields.purchaseDate")}
                value={asset.purchaseDate?.slice(0, 10) ?? "—"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("asset.sections.locationCondition")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <InfoRow
                label={t("asset.fields.currentLocation")}
                value={asset.currentLocationText ?? "—"}
              />
              <InfoRow
                label={t("asset.fields.conditionNotes")}
                value={asset.conditionNotes ?? "—"}
              />
              {canUpdate && (
                <div>
                  {!locationFormOpen ? (
                    <Button variant="outline" size="sm" onClick={() => setLocationFormOpen(true)}>
                      {t("asset.actions.changeLocation")}
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                        value={newLocation}
                        onChange={(event) => setNewLocation(event.target.value)}
                        placeholder={t("asset.fields.currentLocation")}
                      />
                      <Button
                        size="sm"
                        onClick={() => void handleLocationChange()}
                        disabled={changeLocation.isPending}
                      >
                        {t("asset.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocationFormOpen(false)}
                      >
                        {t("customer.cancel")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("asset.sections.status")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {canChangeStatus && (
                <div>
                  {!statusFormOpen ? (
                    <Button variant="outline" size="sm" onClick={() => setStatusFormOpen(true)}>
                      {t("asset.actions.changeStatus")}
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                        value={selectedStatusId}
                        onChange={(event) => setSelectedStatusId(event.target.value)}
                      >
                        <option value="">{t("asset.fields.selectPlaceholder")}</option>
                        {statuses
                          ?.filter((status) => status.id !== asset.currentStatusId)
                          .map((status) => (
                            <option key={status.id} value={status.id}>
                              {getAssetStatusLabel(t, status)}
                            </option>
                          ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => void handleStatusChange()}
                        disabled={changeStatus.isPending}
                      >
                        {t("asset.save")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStatusFormOpen(false)}>
                        {t("customer.cancel")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <AssetAvailabilitySection
            tenantId={tenantId}
            assetId={asset.id}
            canManage={canManageAvailability}
          />

          <Card>
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

        <div className="flex flex-col gap-6">
          {primaryImage && (
            <Card>
              <CardContent className="p-3">
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/assets/${asset.id}/images/${primaryImage.id}/file`}
                  alt={primaryImage.altText ?? asset.name}
                  className="w-full rounded-md object-cover"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("asset.sections.platformDocuments")}</CardTitle>
            </CardHeader>
            <CardContent>
              {asset.platformDocuments.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("asset.platformDocumentsEmpty")}</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {asset.platformDocuments.map((document) => (
                    <li key={document.id} className="flex items-center justify-between">
                      <span>
                        {document.documentType === "CUSTOM" && document.customTypeName
                          ? document.customTypeName
                          : t(`document.types.${document.documentType}`)}
                        {document.title ? ` — ${document.title}` : ""}
                      </span>
                      <Link
                        href={`/app/documents/${document.id}`}
                        className="text-primary hover:underline"
                      >
                        {document.documentNumber}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("timeline.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                events={timeline}
                registry={ASSET_TIMELINE_REGISTRY}
                isLoading={!timeline}
                emptyLabel={t("timeline.empty")}
                searchPlaceholder={t("timeline.searchPlaceholder")}
              />
            </CardContent>
          </Card>
        </div>
      </div>
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

function formatCustomFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
