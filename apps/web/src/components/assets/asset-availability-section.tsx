"use client";

import { Button, Card, CardContent, CardHeader, CardTitle, DateTimeField } from "@rentos/ui";
import { tenantLocalToUtc } from "@rentos/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAssetAvailabilityBlocks,
  useCancelAvailabilityBlock,
  useCreateAvailabilityBlock,
} from "../../hooks/use-asset-availability-blocks";
import { formatDateTime } from "../../lib/date-format";
import type { AssetAvailabilityBlockType } from "../../types/rental";

const BLOCK_TYPES: AssetAvailabilityBlockType[] = [
  "MAINTENANCE",
  "REPAIR",
  "INSPECTION",
  "RELOCATION",
  "MANUAL_BLOCK",
];

/**
 * The authoring surface for the availability engine (see AvailabilityService/
 * AssetAvailabilityBlock) — schedule or cancel a maintenance/repair/
 * inspection/relocation/manual-block period for this asset. A future block
 * never marks the asset unavailable today; it only affects the date range
 * shown here. Every block (including cancelled ones) stays listed for audit
 * history — cancelling never deletes the row.
 */
export function AssetAvailabilitySection({
  tenantId,
  tenantTimezone,
  assetId,
  canManage,
  initialType,
  initialRelatedRentalId,
}: {
  tenantId: string | null;
  /** See RentalWizardProps.tenantTimezone's doc comment — identical role here. */
  tenantTimezone?: string | undefined;
  assetId: string;
  canManage: boolean;
  /** Pre-opens the form with this type/rental link — used by the Return Protocol's "Send to repair" follow-up. */
  initialType?: AssetAvailabilityBlockType;
  initialRelatedRentalId?: string;
}) {
  const { t, i18n } = useTranslation();
  const { data: blocks } = useAssetAvailabilityBlocks(tenantId, assetId);
  const createBlock = useCreateAvailabilityBlock(tenantId, assetId);
  const cancelBlock = useCancelAvailabilityBlock(tenantId, assetId);

  const [formOpen, setFormOpen] = useState(!!initialType);
  const [type, setType] = useState<AssetAvailabilityBlockType>(initialType ?? "MAINTENANCE");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    setError(null);
    if (!startAt || !endAt) return;
    if (!tenantTimezone) {
      setError(t("rental.errors.timezoneNotLoaded"));
      return;
    }
    let startAtInstant: string;
    let endAtInstant: string;
    try {
      startAtInstant = tenantLocalToUtc(startAt, tenantTimezone).toISOString();
      endAtInstant = tenantLocalToUtc(endAt, tenantTimezone).toISOString();
    } catch {
      setError(t("rental.errors.dstGap"));
      return;
    }
    try {
      await createBlock.mutateAsync({
        type,
        startAt: startAtInstant,
        endAt: endAtInstant,
        notes: notes || null,
        ...(initialRelatedRentalId ? { relatedRentalId: initialRelatedRentalId } : {}),
      });
      setFormOpen(false);
      setStartAt("");
      setEndAt("");
      setNotes("");
    } catch {
      setError(t("asset.availability.createError"));
    }
  }

  async function handleCancel(blockId: string): Promise<void> {
    const reason = window.prompt(t("asset.availability.cancelReasonPrompt")) ?? undefined;
    await cancelBlock.mutateAsync({ blockId, reason });
  }

  const activeBlocks = blocks?.filter((block) => !block.cancelledAt) ?? [];
  const cancelledBlocks = blocks?.filter((block) => block.cancelledAt) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("asset.sections.availability")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {activeBlocks.length === 0 && (
          <p className="text-muted-foreground text-sm">{t("asset.availability.noBlocks")}</p>
        )}
        {activeBlocks.map((block) => (
          <div
            key={block.id}
            className="flex items-center justify-between gap-3 rounded-md border p-2"
          >
            <div className="flex flex-col">
              <span className="font-medium">
                {t(`asset.availability.${block.type.toLowerCase()}`)}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatDateTime(block.startAt, i18n.language, tenantTimezone)} –{" "}
                {formatDateTime(block.endAt, i18n.language, tenantTimezone)}
              </span>
              {block.notes && <span className="text-muted-foreground text-xs">{block.notes}</span>}
            </div>
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCancel(block.id)}
                disabled={cancelBlock.isPending}
              >
                {t("asset.availability.cancelBlock")}
              </Button>
            )}
          </div>
        ))}

        {cancelledBlocks.length > 0 && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer">
              {t("asset.availability.cancelledBlocks", { count: cancelledBlocks.length })}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {cancelledBlocks.map((block) => (
                <div key={block.id} className="text-muted-foreground rounded-md border p-2 text-xs">
                  <span className="font-medium">
                    {t(`asset.availability.${block.type.toLowerCase()}`)}
                  </span>{" "}
                  {formatDateTime(block.startAt, i18n.language, tenantTimezone)} –{" "}
                  {formatDateTime(block.endAt, i18n.language, tenantTimezone)}
                  {block.cancelReason ? ` · ${block.cancelReason}` : ""}
                </div>
              ))}
            </div>
          </details>
        )}

        {canManage && (
          <div>
            {!formOpen ? (
              <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                {t("asset.availability.scheduleBlock")}
              </Button>
            ) : (
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <select
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  value={type}
                  onChange={(event) => setType(event.target.value as AssetAvailabilityBlockType)}
                >
                  {BLOCK_TYPES.map((blockType) => (
                    <option key={blockType} value={blockType}>
                      {t(`asset.availability.${blockType.toLowerCase()}`)}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <DateTimeField
                    value={startAt}
                    onChange={setStartAt}
                    locale={i18n.language}
                    dateLabel={t("asset.availability.startAt")}
                  />
                  <DateTimeField
                    value={endAt}
                    onChange={setEndAt}
                    locale={i18n.language}
                    minDate={startAt ? startAt.slice(0, 10) : undefined}
                    dateLabel={t("asset.availability.endAt")}
                  />
                </div>
                <input
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  placeholder={t("asset.availability.notesPlaceholder")}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
                {error && <p className="text-destructive text-sm">{error}</p>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleCreate()}
                    disabled={createBlock.isPending || !startAt || !endAt}
                  >
                    {t("asset.save")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
                    {t("customer.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
