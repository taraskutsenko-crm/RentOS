"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  DateTimeField,
  Input,
  Label,
} from "@rentos/ui";
import { tenantLocalToUtc } from "@rentos/shared";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { AvailabilityBadge } from "../assets/availability-badge";
import { useAssets } from "../../hooks/use-assets";
import { useCustomers } from "../../hooks/use-customers";
import { useRentalBillingSettings } from "../../hooks/use-rental-billing-settings";
import type { RentalItemInput } from "../../hooks/use-rentals";
import { useAvailability } from "../../hooks/use-rentals";
import { pickAvailabilityBadge } from "../../lib/asset-availability-badge";
import { getAssetDisplayLabel } from "../../lib/asset-display-label";
import { formatMoney } from "../../lib/money";
import {
  estimateMonthlyBreakdown,
  estimateRentalTotals,
  getMissingRentalItemPriceFields,
  type EstimatedMonthlyItemInput,
  type RentalItemPriceFieldKey,
} from "../../lib/rental-pricing";
import {
  rentalSchema,
  type RentalFormValues,
  type RentalItemFormValues,
} from "../../lib/validation";
import type { PartialMonthPolicy, RentalBillingMode } from "../../types/rental";

const STEPS = ["customer", "assets", "dates", "pricing", "review"] as const;
const PARTIAL_MONTH_POLICIES: PartialMonthPolicy[] = ["PRORATE_BY_DAY", "ROUND_UP_TO_FULL_MONTH"];

/**
 * Which translated label a missing price field's error message quotes —
 * the MONTHLY remainder field is presented as "Daily price (for remaining
 * days)" (rental.fields.dailyPriceForRemainder), not the generic "Daily
 * price" label DAILY billing mode uses for the same dailyPriceDisplay
 * value, so the error must match whichever label is actually visible.
 */
function priceFieldLabelKey(
  field: RentalItemPriceFieldKey,
  billingMode: RentalBillingMode,
): string {
  if (field === "dailyPriceDisplay" && billingMode === "MONTHLY") {
    return "rental.fields.dailyPriceForRemainder";
  }
  const labelKeys: Record<RentalItemPriceFieldKey, string> = {
    dailyPriceDisplay: "rental.fields.dailyPrice",
    weeklyPriceDisplay: "rental.fields.weeklyPrice",
    monthlyPriceDisplay: "rental.fields.monthlyPrice",
    customPriceDisplay: "rental.fields.customPrice",
  };
  return labelKeys[field];
}

export interface RentalWizardProps {
  tenantId: string | null;
  /**
   * The tenant's canonical IANA timezone — every date/time this wizard
   * collects is a tenant-local wall-clock reading, converted to a real UTC
   * instant via `tenantLocalToUtc` before it ever reaches the API (both the
   * live availability check and the final submit; see
   * docs/DECISIONS.md D-115). `undefined` while the caller's own tenant
   * fetch is still loading — every conversion below no-ops until it
   * arrives, exactly like `defaultCurrency`.
   */
  tenantTimezone?: string | undefined;
  defaultCurrency?: string | undefined;
  initialValues?: Partial<RentalFormValues>;
  initialItems?: RentalItemFormValues[];
  submitLabelKey?: string;
  onSubmit: (input: {
    customerId: string;
    plannedStart: string;
    plannedEnd: string;
    currency: string;
    discountMinor: number;
    notes: string | null;
    internalNotes: string | null;
    items: RentalItemInput[];
  }) => Promise<void>;
  isPending: boolean;
  errorMessage?: string | null;
}

function toMinor(display: string): number {
  const value = Number(display.trim() || "0");
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function emptyItemForm(
  assetId: string,
  partialMonthPolicy: PartialMonthPolicy,
): RentalItemFormValues {
  return {
    assetId,
    billingMode: "DAILY",
    quantity: 1,
    dailyPriceDisplay: "",
    weeklyPriceDisplay: "",
    monthlyPriceDisplay: "",
    customPriceDisplay: "",
    depositDisplay: "",
    discountDisplay: "",
    taxRateDisplay: "",
    notes: "",
    partialMonthPolicy,
  };
}

export function RentalWizard({
  tenantId,
  tenantTimezone,
  defaultCurrency,
  initialValues,
  initialItems,
  submitLabelKey,
  onSubmit,
  isPending,
  errorMessage,
}: RentalWizardProps) {
  const { t, i18n } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [items, setItems] = useState<RentalItemFormValues[]>(initialItems ?? []);
  const [assetSearch, setAssetSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [pricingValidationAttempted, setPricingValidationAttempted] = useState(false);
  const [dateConversionError, setDateConversionError] = useState<string | null>(null);

  /**
   * Converts a tenant-local "YYYY-MM-DDTHH:mm" wall-clock reading to a real
   * UTC instant ISO string, or `null` when the input is incomplete or the
   * timezone hasn't loaded yet — every API-bound call site below treats
   * `null` as "not ready to query/submit yet," never as UTC-passthrough.
   */
  function toInstant(localDateTime: string): string | null {
    if (!localDateTime || !tenantTimezone) return null;
    try {
      return tenantLocalToUtc(localDateTime, tenantTimezone).toISOString();
    } catch {
      return null;
    }
  }
  const todayStartIso = useRef(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const previewWindowEnd30Days = useRef(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) + "T00:00:00.000Z",
  );

  const {
    register,
    watch,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<RentalFormValues>({
    resolver: zodResolver(rentalSchema),
    defaultValues: {
      customerId: "",
      plannedStart: "",
      plannedEnd: "",
      currency: defaultCurrency ?? "",
      discountDisplay: "",
      notes: "",
      internalNotes: "",
      ...initialValues,
    },
  });

  // `defaultCurrency` (the tenant's own default currency) often isn't loaded
  // yet at the moment this form first mounts -- react-hook-form's
  // `defaultValues` is only ever read once, at initialization, so a
  // still-`undefined` defaultCurrency at that instant would otherwise leave
  // the currency field permanently blank for the rest of the form's life,
  // silently breaking the entire live pricing estimate (formatMoney can't
  // format an empty currency code). Re-applies once the real value arrives,
  // but only for a fresh create (never overriding an explicit initialValues
  // currency in edit mode) and only if the user hasn't already typed one.
  const appliedDefaultCurrency = useRef(false);
  useEffect(() => {
    if (appliedDefaultCurrency.current) return;
    if (!defaultCurrency) return;
    if (initialValues?.currency) {
      appliedDefaultCurrency.current = true;
      return;
    }
    setValue("currency", defaultCurrency);
    appliedDefaultCurrency.current = true;
  }, [defaultCurrency, initialValues, setValue]);

  const values = watch();
  const { data: customersData } = useCustomers(tenantId, {
    search: customerSearch || undefined,
    pageSize: 20,
  });
  const { data: assetsData } = useAssets(tenantId, {
    search: assetSearch || undefined,
    isRentable: true,
    isActive: true,
    pageSize: 20,
  });
  const selectedAssetIds = items.map((item) => item.assetId);
  const plannedStartInstant = toInstant(values.plannedStart);
  const plannedEndInstant = toInstant(values.plannedEnd);
  const { data: availability } = useAvailability(
    tenantId,
    plannedStartInstant && plannedEndInstant && selectedAssetIds.length > 0
      ? {
          assetIds: selectedAssetIds,
          plannedStart: plannedStartInstant,
          plannedEnd: plannedEndInstant,
        }
      : null,
  );
  // The asset picker (step 2) comes before the dates step, so the exact
  // requested window isn't known yet — fall back to "today .. +30 days" for
  // this preview-only check so every browsable asset still shows its
  // nearest upcoming conflict (reservation/maintenance/etc.) with a reason,
  // per the requirement that unavailable assets never disappear from a
  // selector silently. Once real dates are picked, `availability` above
  // takes over with the precise window for the actually-selected assets.
  // Rounded to the start of today (not `new Date()` computed fresh every
  // render) so the query key stays stable across re-renders — an
  // ever-changing plannedStart/plannedEnd previously caused React Query to
  // treat every render as a new query, hammering the API into 429s.
  const candidateAssetIds = assetsData?.items.map((asset) => asset.id) ?? [];
  const previewWindowStart = plannedStartInstant ?? todayStartIso.current;
  const previewWindowEnd = plannedEndInstant ?? previewWindowEnd30Days.current;
  const { data: candidateAvailability } = useAvailability(
    tenantId,
    candidateAssetIds.length > 0
      ? {
          assetIds: candidateAssetIds,
          plannedStart: previewWindowStart,
          plannedEnd: previewWindowEnd,
        }
      : null,
  );
  const { data: billingSettings } = useRentalBillingSettings(tenantId);
  const monthlyStrategy = billingSettings?.monthlyBillingStrategy ?? "CALENDAR_MONTH";
  const customMonthLengthDays = billingSettings?.customMonthLengthDays ?? null;

  function toEstimatedItem(item: RentalItemFormValues) {
    return {
      billingMode: item.billingMode,
      quantity: item.quantity,
      dailyPriceMinor: toMinor(item.dailyPriceDisplay),
      weeklyPriceMinor: toMinor(item.weeklyPriceDisplay),
      monthlyPriceMinor: toMinor(item.monthlyPriceDisplay),
      customPriceMinor: toMinor(item.customPriceDisplay),
      discountMinor: toMinor(item.discountDisplay),
      taxRateBp: toMinor(item.taxRateDisplay),
      ...(item.billingMode === "MONTHLY"
        ? {
            monthlyBillingStrategy: monthlyStrategy,
            customMonthLengthDays,
            partialMonthPolicy: item.partialMonthPolicy,
          }
        : {}),
    } as EstimatedMonthlyItemInput;
  }

  const estimatedTotals = estimateRentalTotals(
    items.map(toEstimatedItem),
    values.plannedStart,
    values.plannedEnd,
    toMinor(values.discountDisplay),
  );

  const monthlyBreakdown = estimateMonthlyBreakdown(
    monthlyStrategy,
    customMonthLengthDays,
    values.plannedStart,
    values.plannedEnd,
  );

  const selectedCustomer = customersData?.items.find(
    (customer) => customer.id === values.customerId,
  );

  function isItemsPricingValid(): boolean {
    return items.every((item) => getMissingRentalItemPriceFields(item).length === 0);
  }

  async function goNext(): Promise<void> {
    const step = STEPS[stepIndex];
    if (step === "customer" && !(await trigger("customerId"))) return;
    if (step === "assets" && items.length === 0) return;
    if (step === "dates" && !(await trigger(["plannedStart", "plannedEnd"]))) return;
    if (step === "pricing") {
      setPricingValidationAttempted(true);
      if (!isItemsPricingValid()) return;
    }
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function goBack(): void {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function toggleAsset(assetId: string): void {
    setItems((current) =>
      current.some((item) => item.assetId === assetId)
        ? current.filter((item) => item.assetId !== assetId)
        : [
            ...current,
            emptyItemForm(assetId, billingSettings?.partialMonthPolicy ?? "PRORATE_BY_DAY"),
          ],
    );
  }

  function updateItem(assetId: string, patch: Partial<RentalItemFormValues>): void {
    setItems((current) =>
      current.map((item) => (item.assetId === assetId ? { ...item, ...patch } : item)),
    );
  }

  async function handleCreate(): Promise<void> {
    if (!isItemsPricingValid()) {
      setPricingValidationAttempted(true);
      setStepIndex(STEPS.indexOf("pricing"));
      return;
    }

    setDateConversionError(null);
    if (!tenantTimezone) {
      setDateConversionError(t("rental.errors.timezoneNotLoaded"));
      return;
    }
    let plannedStart: string;
    let plannedEnd: string;
    try {
      plannedStart = tenantLocalToUtc(values.plannedStart, tenantTimezone).toISOString();
      plannedEnd = tenantLocalToUtc(values.plannedEnd, tenantTimezone).toISOString();
    } catch {
      // A DST spring-forward gap (the picked wall-clock reading doesn't
      // exist in the tenant's timezone) or a malformed value — never
      // silently save a shifted instant, ask the user to pick a different
      // time instead (see docs/DECISIONS.md D-115).
      setDateConversionError(t("rental.errors.dstGap"));
      setStepIndex(STEPS.indexOf("dates"));
      return;
    }

    await onSubmit({
      customerId: values.customerId,
      plannedStart,
      plannedEnd,
      currency: values.currency,
      discountMinor: toMinor(values.discountDisplay),
      notes: values.notes || null,
      internalNotes: values.internalNotes || null,
      items: items.map((item) => ({
        assetId: item.assetId,
        billingMode: item.billingMode,
        quantity: item.quantity,
        ...(item.dailyPriceDisplay ? { dailyPriceMinor: toMinor(item.dailyPriceDisplay) } : {}),
        ...(item.weeklyPriceDisplay ? { weeklyPriceMinor: toMinor(item.weeklyPriceDisplay) } : {}),
        ...(item.monthlyPriceDisplay
          ? { monthlyPriceMinor: toMinor(item.monthlyPriceDisplay) }
          : {}),
        ...(item.customPriceDisplay ? { customPriceMinor: toMinor(item.customPriceDisplay) } : {}),
        depositMinor: toMinor(item.depositDisplay),
        discountMinor: toMinor(item.discountDisplay),
        taxRateBp: toMinor(item.taxRateDisplay),
        notes: item.notes || null,
        ...(item.billingMode === "MONTHLY" ? { partialMonthPolicy: item.partialMonthPolicy } : {}),
      })),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((step, index) => (
          <li
            key={step}
            className={`rounded-full px-3 py-1 ${index === stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {index + 1}. {t(`rental.wizard.steps.${step}`)}
          </li>
        ))}
      </ol>

      {(errorMessage || dateConversionError) && (
        <Alert variant="destructive">
          <AlertDescription>{dateConversionError || errorMessage}</AlertDescription>
        </Alert>
      )}

      {STEPS[stepIndex] === "customer" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <Input
              placeholder={t("customer.searchPlaceholder")}
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
            />
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {customersData?.items.map((customer) => (
                <label
                  key={customer.id}
                  className={`flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm ${values.customerId === customer.id ? "border-primary" : ""}`}
                >
                  <span>
                    {customer.firstName} {customer.lastName}
                    {customer.company ? ` — ${customer.company}` : ""}
                  </span>
                  <input type="radio" {...register("customerId")} value={customer.id} />
                </label>
              ))}
              {customersData?.items.length === 0 && (
                <p className="text-muted-foreground text-sm">{t("customer.noCustomers")}</p>
              )}
            </div>
            {errors.customerId && (
              <p className="text-destructive text-sm">{t(errors.customerId.message ?? "")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {STEPS[stepIndex] === "assets" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <Input
              placeholder={t("asset.searchPlaceholder")}
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
            />
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {assetsData?.items.map((asset) => {
                const badge = pickAvailabilityBadge(
                  candidateAvailability?.results.find((result) => result.assetId === asset.id),
                );
                return (
                  <label
                    key={asset.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
                  >
                    <span className="flex flex-col gap-1">
                      <span>{getAssetDisplayLabel(asset)}</span>
                      {badge && (
                        <AvailabilityBadge
                          badge={badge}
                          locale={i18n.language}
                          timezone={tenantTimezone}
                        />
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={items.some((item) => item.assetId === asset.id)}
                      onChange={() => toggleAsset(asset.id)}
                    />
                  </label>
                );
              })}
              {assetsData?.items.length === 0 && (
                <p className="text-muted-foreground text-sm">{t("asset.noAssets")}</p>
              )}
            </div>
            {items.length === 0 && (
              <p className="text-destructive text-sm">{t("rental.errors.selectAtLeastOneAsset")}</p>
            )}
          </CardContent>
        </Card>
      )}

      {STEPS[stepIndex] === "dates" && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plannedStart">{t("rental.fields.plannedStart")}</Label>
                <DateTimeField
                  id="plannedStart"
                  value={values.plannedStart}
                  onChange={(value) =>
                    setValue("plannedStart", value, { shouldValidate: true, shouldDirty: true })
                  }
                  locale={i18n.language}
                  aria-invalid={!!errors.plannedStart}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plannedEnd">{t("rental.fields.plannedEnd")}</Label>
                <DateTimeField
                  id="plannedEnd"
                  value={values.plannedEnd}
                  onChange={(value) =>
                    setValue("plannedEnd", value, { shouldValidate: true, shouldDirty: true })
                  }
                  locale={i18n.language}
                  minDate={values.plannedStart ? values.plannedStart.slice(0, 10) : undefined}
                  aria-invalid={!!errors.plannedEnd}
                />
              </div>
            </div>
            {errors.plannedStart && (
              <p className="text-destructive text-sm">{t(errors.plannedStart.message ?? "")}</p>
            )}
            {errors.plannedEnd && (
              <p className="text-destructive text-sm">{t(errors.plannedEnd.message ?? "")}</p>
            )}

            {availability && (
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{t("rental.wizard.availabilityCheck")}</span>
                {availability.results.map((result) => (
                  <p
                    key={result.assetId}
                    className={result.isAvailable ? "text-sm" : "text-destructive text-sm"}
                  >
                    {assetsData?.items.find((asset) => asset.id === result.assetId)?.name ??
                      result.assetId}
                    :{" "}
                    {result.isAvailable
                      ? t("rental.wizard.available")
                      : t("rental.wizard.unavailable")}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {STEPS[stepIndex] === "pricing" && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            {items.map((item) => {
              const asset = assetsData?.items.find((a) => a.id === item.assetId);
              const missingPriceFields = pricingValidationAttempted
                ? getMissingRentalItemPriceFields(item)
                : [];
              const priceFieldError = (field: RentalItemPriceFieldKey): string | null => {
                if (!missingPriceFields.includes(field)) return null;
                return t("rental.errors.priceFieldRequired", {
                  field: t(priceFieldLabelKey(field, item.billingMode)),
                });
              };
              return (
                <div key={item.assetId} className="flex flex-col gap-3 rounded-md border p-3">
                  <span className="font-medium">{asset?.name ?? item.assetId}</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("rental.fields.billingMode")}</Label>
                      <select
                        className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                        value={item.billingMode}
                        onChange={(event) =>
                          updateItem(item.assetId, {
                            billingMode: event.target.value as RentalBillingMode,
                          })
                        }
                      >
                        <option value="DAILY">{t("rental.billingModes.DAILY")}</option>
                        <option value="WEEKLY">{t("rental.billingModes.WEEKLY")}</option>
                        <option value="MONTHLY">{t("rental.billingModes.MONTHLY")}</option>
                        <option value="CUSTOM">{t("rental.billingModes.CUSTOM")}</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("rental.fields.quantity")}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(item.assetId, { quantity: Number(event.target.value) || 1 })
                        }
                      />
                    </div>
                    {item.billingMode === "DAILY" && (
                      <div className="flex flex-col gap-1.5">
                        <Label>{t("rental.fields.dailyPrice")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.dailyPriceDisplay}
                          aria-invalid={!!priceFieldError("dailyPriceDisplay")}
                          onChange={(event) =>
                            updateItem(item.assetId, { dailyPriceDisplay: event.target.value })
                          }
                        />
                        {priceFieldError("dailyPriceDisplay") && (
                          <p className="text-destructive text-xs">
                            {priceFieldError("dailyPriceDisplay")}
                          </p>
                        )}
                      </div>
                    )}
                    {item.billingMode === "WEEKLY" && (
                      <div className="flex flex-col gap-1.5">
                        <Label>{t("rental.fields.weeklyPrice")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.weeklyPriceDisplay}
                          aria-invalid={!!priceFieldError("weeklyPriceDisplay")}
                          onChange={(event) =>
                            updateItem(item.assetId, { weeklyPriceDisplay: event.target.value })
                          }
                        />
                        {priceFieldError("weeklyPriceDisplay") && (
                          <p className="text-destructive text-xs">
                            {priceFieldError("weeklyPriceDisplay")}
                          </p>
                        )}
                      </div>
                    )}
                    {item.billingMode === "MONTHLY" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <Label>{t("rental.fields.monthlyPrice")}</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.monthlyPriceDisplay}
                            aria-invalid={!!priceFieldError("monthlyPriceDisplay")}
                            onChange={(event) =>
                              updateItem(item.assetId, { monthlyPriceDisplay: event.target.value })
                            }
                          />
                          {priceFieldError("monthlyPriceDisplay") && (
                            <p className="text-destructive text-xs">
                              {priceFieldError("monthlyPriceDisplay")}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label>{t("rental.fields.partialMonthPolicy")}</Label>
                          <select
                            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                            value={item.partialMonthPolicy}
                            onChange={(event) =>
                              updateItem(item.assetId, {
                                partialMonthPolicy: event.target.value as PartialMonthPolicy,
                              })
                            }
                          >
                            {PARTIAL_MONTH_POLICIES.map((policy) => (
                              <option key={policy} value={policy}>
                                {t(`rental.partialMonthPolicyOptions.${policy}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                        {item.partialMonthPolicy === "PRORATE_BY_DAY" && (
                          <div className="flex flex-col gap-1.5">
                            <Label>{t("rental.fields.dailyPriceForRemainder")}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.dailyPriceDisplay}
                              aria-invalid={!!priceFieldError("dailyPriceDisplay")}
                              onChange={(event) =>
                                updateItem(item.assetId, { dailyPriceDisplay: event.target.value })
                              }
                            />
                            {priceFieldError("dailyPriceDisplay") && (
                              <p className="text-destructive text-xs">
                                {priceFieldError("dailyPriceDisplay")}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="text-muted-foreground col-span-2 text-sm">
                          {monthlyBreakdown.completeUnits === 0 &&
                          monthlyBreakdown.remainingDays === 0
                            ? t("rental.wizard.monthlyBreakdown.pending")
                            : [
                                monthlyBreakdown.completeUnits > 0 &&
                                  t(`rental.wizard.monthlyBreakdown.${monthlyStrategy}`, {
                                    count: monthlyBreakdown.completeUnits,
                                    length: customMonthLengthDays ?? "",
                                    price: formatMoney(
                                      toMinor(item.monthlyPriceDisplay),
                                      values.currency,
                                    ),
                                  }),
                                monthlyBreakdown.remainingDays > 0 &&
                                  (item.partialMonthPolicy === "ROUND_UP_TO_FULL_MONTH"
                                    ? t("rental.wizard.monthlyBreakdown.roundedUpMonth", {
                                        price: formatMoney(
                                          toMinor(item.monthlyPriceDisplay),
                                          values.currency,
                                        ),
                                      })
                                    : t("rental.wizard.monthlyBreakdown.days", {
                                        count: monthlyBreakdown.remainingDays,
                                        price: formatMoney(
                                          toMinor(item.dailyPriceDisplay),
                                          values.currency,
                                        ),
                                      })),
                              ]
                                .filter(Boolean)
                                .join(" + ")}
                        </div>
                      </>
                    )}
                    {item.billingMode === "CUSTOM" && (
                      <div className="flex flex-col gap-1.5">
                        <Label>{t("rental.fields.customPrice")}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.customPriceDisplay}
                          aria-invalid={!!priceFieldError("customPriceDisplay")}
                          onChange={(event) =>
                            updateItem(item.assetId, { customPriceDisplay: event.target.value })
                          }
                        />
                        {priceFieldError("customPriceDisplay") && (
                          <p className="text-destructive text-xs">
                            {priceFieldError("customPriceDisplay")}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("rental.fields.deposit")}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.depositDisplay}
                        onChange={(event) =>
                          updateItem(item.assetId, { depositDisplay: event.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("rental.fields.itemDiscount")}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.discountDisplay}
                        onChange={(event) =>
                          updateItem(item.assetId, { discountDisplay: event.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("quote.fields.taxRatePercent")}</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          className="pr-7"
                          aria-label={t("quote.fields.taxRatePercent")}
                          value={item.taxRateDisplay}
                          onChange={(event) =>
                            updateItem(item.assetId, { taxRateDisplay: event.target.value })
                          }
                        />
                        <span
                          className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm"
                          aria-hidden="true"
                        >
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">{t("asset.fields.currency")}</Label>
                <Input id="currency" maxLength={3} {...register("currency")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discountDisplay">{t("rental.fields.discount")}</Label>
                <Input
                  id="discountDisplay"
                  type="number"
                  step="0.01"
                  {...register("discountDisplay")}
                />
              </div>
            </div>

            <div className="rounded-md border p-3 text-sm">
              <p>
                {t("rental.fields.subtotal")}:{" "}
                {formatMoney(estimatedTotals.subtotalMinor, values.currency)}
              </p>
              <p>
                {t("quote.fields.taxTotal")}:{" "}
                {formatMoney(estimatedTotals.taxMinor, values.currency)}
              </p>
              <p className="font-semibold">
                {t("rental.fields.total")}:{" "}
                {formatMoney(estimatedTotals.totalMinor, values.currency)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {STEPS[stepIndex] === "review" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 text-sm">
            <p>
              <strong>{t("customer.title")}:</strong> {selectedCustomer?.firstName}{" "}
              {selectedCustomer?.lastName}
            </p>
            <p>
              <strong>{t("rental.fields.plannedStart")}:</strong> {values.plannedStart}
            </p>
            <p>
              <strong>{t("rental.fields.plannedEnd")}:</strong> {values.plannedEnd}
            </p>
            <ul className="list-disc pl-5">
              {items.map((item) => (
                <li key={item.assetId}>
                  {assetsData?.items.find((asset) => asset.id === item.assetId)?.name ??
                    item.assetId}{" "}
                  — {t(`rental.billingModes.${item.billingMode}`)}
                </li>
              ))}
            </ul>
            <p className="font-semibold">
              {t("rental.fields.total")}: {formatMoney(estimatedTotals.totalMinor, values.currency)}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">{t("customer.notes")}</Label>
              <textarea
                id="notes"
                rows={2}
                className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                {...register("notes")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="internalNotes">{t("rental.fields.internalNotes")}</Label>
              <textarea
                id="internalNotes"
                rows={2}
                className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                {...register("internalNotes")}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={goBack} disabled={stepIndex === 0}>
          {t("rental.wizard.back")}
        </Button>
        {stepIndex < STEPS.length - 1 ? (
          <Button type="button" onClick={() => void goNext()}>
            {t("rental.wizard.next")}
          </Button>
        ) : (
          <Button type="button" onClick={() => void handleCreate()} disabled={isPending}>
            {isPending
              ? t("rental.wizard.creating")
              : t(submitLabelKey ?? "rental.wizard.createRental")}
          </Button>
        )}
      </div>
    </div>
  );
}
