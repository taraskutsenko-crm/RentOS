"use client";

import { Input, Label } from "@rentos/ui";
import { useTranslation } from "react-i18next";

import { formatMoney } from "../../lib/money";
import { estimateMonthlyBreakdown } from "../../lib/rental-pricing";
import type { QuoteItemFormValues } from "../../lib/validation";
import type { QuoteBillingMode, QuoteDiscountType, QuoteItemType } from "../../types/quote";
import type { MonthlyBillingStrategy } from "../../types/rental";

const NON_ASSET_ITEM_TYPES: QuoteItemType[] = [
  "SERVICE",
  "PRODUCT",
  "FEE",
  "DELIVERY",
  "COLLECTION",
  "LABOR",
  "CUSTOM",
];

function toMinor(display: string): number {
  const value = Number(display.trim() || "0");
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export interface QuoteItemRowProps {
  item: QuoteItemFormValues;
  assetLabel?: string | undefined;
  onChange: (patch: Partial<QuoteItemFormValues>) => void;
  onRemove: () => void;
  plannedStart: string;
  plannedEnd: string;
  currency: string;
  /** The tenant's current monthly billing strategy — see use-rental-billing-settings.ts. */
  monthlyBillingStrategy: MonthlyBillingStrategy;
  customMonthLengthDays: number | null;
}

/**
 * One editable line in the quote wizard's pricing step — asset-bound items
 * (itemType/name/assetId fixed by the earlier "assets" step) only expose
 * pricing fields; non-asset items also expose itemType/name/description/unit.
 * Field visibility mirrors the server's billing-mode rules exactly: FLAT is
 * only offered for non-asset items (ASSET items must use DAILY/WEEKLY/
 * MONTHLY/CUSTOM — see QuotesService.assertItemsValid).
 *
 * MONTHLY items also expose a daily price (for any partial-unit remainder)
 * and a live breakdown, reusing the exact same tenant-configurable
 * strategy engine as Rentals (see
 * docs/adr/0008-configurable-monthly-billing-strategies.md) — never a
 * separate Quotes-specific calculation.
 */
export function QuoteItemRow({
  item,
  assetLabel,
  onChange,
  onRemove,
  plannedStart,
  plannedEnd,
  currency,
  monthlyBillingStrategy,
  customMonthLengthDays,
}: QuoteItemRowProps) {
  const { t } = useTranslation();
  const isAsset = item.itemType === "ASSET";
  const monthlyBreakdown = estimateMonthlyBreakdown(
    monthlyBillingStrategy,
    customMonthLengthDays,
    plannedStart,
    plannedEnd,
  );

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {isAsset ? (assetLabel ?? item.name) : item.name || t("quote.fields.name")}
        </span>
        <button
          type="button"
          className="text-destructive text-xs underline"
          onClick={onRemove}
          aria-label={t("quote.actions.removeItem")}
        >
          {t("quote.actions.removeItem")}
        </button>
      </div>

      {!isAsset && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{t("quote.fields.itemType")}</Label>
            <select
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
              value={item.itemType}
              onChange={(event) => onChange({ itemType: event.target.value as QuoteItemType })}
            >
              {NON_ASSET_ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`quote.itemTypes.${type}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("quote.fields.name")}</Label>
            <Input value={item.name} onChange={(event) => onChange({ name: event.target.value })} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>{t("quote.fields.description")}</Label>
            <Input
              value={item.description}
              onChange={(event) => onChange({ description: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("quote.fields.unit")}</Label>
            <Input
              value={item.unit}
              placeholder={t("quote.fields.unitPlaceholder")}
              onChange={(event) => onChange({ unit: event.target.value })}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t("quote.fields.billingMode")}</Label>
          <select
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            value={item.billingMode}
            onChange={(event) => onChange({ billingMode: event.target.value as QuoteBillingMode })}
          >
            <option value="DAILY">{t("quote.billingModes.DAILY")}</option>
            <option value="WEEKLY">{t("quote.billingModes.WEEKLY")}</option>
            <option value="MONTHLY">{t("quote.billingModes.MONTHLY")}</option>
            <option value="CUSTOM">{t("quote.billingModes.CUSTOM")}</option>
            {!isAsset && <option value="FLAT">{t("quote.billingModes.FLAT")}</option>}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("quote.fields.quantity")}</Label>
          <Input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(event) => onChange({ quantity: Number(event.target.value) || 1 })}
          />
        </div>

        {item.billingMode === "DAILY" && (
          <div className="flex flex-col gap-1.5">
            <Label>{t("quote.fields.dailyPrice")}</Label>
            <Input
              type="number"
              step="0.01"
              value={item.dailyPriceDisplay}
              onChange={(event) => onChange({ dailyPriceDisplay: event.target.value })}
            />
          </div>
        )}
        {item.billingMode === "WEEKLY" && (
          <div className="flex flex-col gap-1.5">
            <Label>{t("quote.fields.weeklyPrice")}</Label>
            <Input
              type="number"
              step="0.01"
              value={item.weeklyPriceDisplay}
              onChange={(event) => onChange({ weeklyPriceDisplay: event.target.value })}
            />
          </div>
        )}
        {item.billingMode === "MONTHLY" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>{t("quote.fields.monthlyPrice")}</Label>
              <Input
                type="number"
                step="0.01"
                value={item.monthlyPriceDisplay}
                onChange={(event) => onChange({ monthlyPriceDisplay: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("rental.fields.dailyPriceForRemainder")}</Label>
              <Input
                type="number"
                step="0.01"
                value={item.dailyPriceDisplay}
                onChange={(event) => onChange({ dailyPriceDisplay: event.target.value })}
              />
            </div>
            <div className="text-muted-foreground col-span-2 text-sm">
              {monthlyBreakdown.completeUnits === 0 && monthlyBreakdown.remainingDays === 0
                ? t("rental.wizard.monthlyBreakdown.pending")
                : [
                    monthlyBreakdown.completeUnits > 0 &&
                      t(`rental.wizard.monthlyBreakdown.${monthlyBillingStrategy}`, {
                        count: monthlyBreakdown.completeUnits,
                        length: customMonthLengthDays ?? "",
                        price: formatMoney(toMinor(item.monthlyPriceDisplay), currency),
                      }),
                    monthlyBreakdown.remainingDays > 0 &&
                      t("rental.wizard.monthlyBreakdown.days", {
                        count: monthlyBreakdown.remainingDays,
                        price: formatMoney(toMinor(item.dailyPriceDisplay), currency),
                      }),
                  ]
                    .filter(Boolean)
                    .join(" + ")}
            </div>
          </>
        )}
        {item.billingMode === "CUSTOM" && (
          <div className="flex flex-col gap-1.5">
            <Label>{t("quote.fields.customPrice")}</Label>
            <Input
              type="number"
              step="0.01"
              value={item.customPriceDisplay}
              onChange={(event) => onChange({ customPriceDisplay: event.target.value })}
            />
          </div>
        )}
        {item.billingMode === "FLAT" && (
          <div className="flex flex-col gap-1.5">
            <Label>{t("quote.fields.unitPrice")}</Label>
            <Input
              type="number"
              step="0.01"
              value={item.unitPriceDisplay}
              onChange={(event) => onChange({ unitPriceDisplay: event.target.value })}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>{t("quote.fields.discountType")}</Label>
          <select
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            value={item.discountType ?? ""}
            onChange={(event) =>
              onChange({ discountType: (event.target.value || null) as QuoteDiscountType | null })
            }
          >
            <option value="">{t("quote.fields.noDiscount")}</option>
            <option value="FIXED">{t("quote.discountTypes.FIXED")}</option>
            <option value="PERCENTAGE">{t("quote.discountTypes.PERCENTAGE")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>
            {item.discountType === "PERCENTAGE"
              ? t("quote.fields.discountPercent")
              : t("quote.fields.discountAmount")}
          </Label>
          <Input
            type="number"
            step="0.01"
            disabled={!item.discountType}
            value={item.discountValueDisplay}
            onChange={(event) => onChange({ discountValueDisplay: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("quote.fields.taxRatePercent")}</Label>
          <Input
            type="number"
            step="0.01"
            value={item.taxRateDisplay}
            onChange={(event) => onChange({ taxRateDisplay: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("quote.fields.deposit")}</Label>
          <Input
            type="number"
            step="0.01"
            value={item.depositDisplay}
            onChange={(event) => onChange({ depositDisplay: event.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
