"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, Button, Card, CardContent, Input, Label } from "@rentos/ui";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useAssets } from "../../hooks/use-assets";
import { useCustomers } from "../../hooks/use-customers";
import { useAvailability } from "../../hooks/use-rentals";
import type { QuoteInput, QuoteItemInput } from "../../hooks/use-quotes";
import { formatMoney } from "../../lib/money";
import { estimateQuoteTotals } from "../../lib/quote-pricing";
import { quoteSchema, type QuoteFormValues, type QuoteItemFormValues } from "../../lib/validation";
import type { QuoteItemType } from "../../types/quote";
import { QuoteItemRow } from "./quote-item-row";

const STEPS = ["customer", "dates", "assets", "services", "pricing", "terms", "review"] as const;
const NEW_SERVICE_TYPES: QuoteItemType[] = [
  "SERVICE",
  "PRODUCT",
  "FEE",
  "DELIVERY",
  "COLLECTION",
  "LABOR",
  "CUSTOM",
];

export interface QuoteWizardProps {
  tenantId: string | null;
  defaultCurrency?: string | undefined;
  initialValues?: Partial<QuoteFormValues>;
  initialItems?: QuoteItemFormValues[];
  submitLabelKey?: string;
  onSubmit: (input: QuoteInput) => Promise<void>;
  isPending: boolean;
  errorMessage?: string | null;
}

function toMinor(display: string): number {
  const value = Number(display.trim() || "0");
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function emptyAssetItemForm(assetId: string, name: string): QuoteItemFormValues {
  return {
    itemType: "ASSET",
    assetId,
    name,
    description: "",
    quantity: 1,
    unit: "",
    billingMode: "DAILY",
    unitPriceDisplay: "",
    dailyPriceDisplay: "",
    weeklyPriceDisplay: "",
    monthlyPriceDisplay: "",
    customPriceDisplay: "",
    discountType: null,
    discountValueDisplay: "",
    taxRateDisplay: "",
    depositDisplay: "",
    notes: "",
  };
}

function emptyServiceItemForm(): QuoteItemFormValues {
  return {
    itemType: "SERVICE",
    assetId: "",
    name: "",
    description: "",
    quantity: 1,
    unit: "",
    billingMode: "FLAT",
    unitPriceDisplay: "",
    dailyPriceDisplay: "",
    weeklyPriceDisplay: "",
    monthlyPriceDisplay: "",
    customPriceDisplay: "",
    discountType: null,
    discountValueDisplay: "",
    taxRateDisplay: "",
    depositDisplay: "",
    notes: "",
  };
}

export function QuoteWizard({
  tenantId,
  defaultCurrency,
  initialValues,
  initialItems,
  submitLabelKey,
  onSubmit,
  isPending,
  errorMessage,
}: QuoteWizardProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [items, setItems] = useState<QuoteItemFormValues[]>(initialItems ?? []);
  const [assetSearch, setAssetSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const {
    register,
    watch,
    trigger,
    formState: { errors },
  } = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      customerId: "",
      validUntil: "",
      plannedStart: "",
      plannedEnd: "",
      currency: defaultCurrency ?? "",
      discountType: null,
      discountValueDisplay: "",
      customerNotes: "",
      internalNotes: "",
      termsAndConditions: "",
      ...initialValues,
    },
  });

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

  const assetItems = items.filter((item) => item.itemType === "ASSET");
  const serviceItems = items.filter((item) => item.itemType !== "ASSET");
  const selectedAssetIds = assetItems.map((item) => item.assetId).filter(Boolean);

  const { data: availability } = useAvailability(
    tenantId,
    values.plannedStart && values.plannedEnd && selectedAssetIds.length > 0
      ? {
          assetIds: selectedAssetIds,
          plannedStart: values.plannedStart,
          plannedEnd: values.plannedEnd,
        }
      : null,
  );

  const estimatedTotals = estimateQuoteTotals(
    items.map((item) => ({
      billingMode: item.billingMode,
      quantity: item.quantity,
      unitPriceMinor: toMinor(item.unitPriceDisplay),
      dailyPriceMinor: toMinor(item.dailyPriceDisplay),
      weeklyPriceMinor: toMinor(item.weeklyPriceDisplay),
      monthlyPriceMinor: toMinor(item.monthlyPriceDisplay),
      customPriceMinor: toMinor(item.customPriceDisplay),
      discountType: item.discountType ?? undefined,
      discountValue: toMinor(item.discountValueDisplay),
      taxRateBp: toMinor(item.taxRateDisplay),
      depositMinor: toMinor(item.depositDisplay),
    })),
    values.plannedStart,
    values.plannedEnd,
    values.discountType,
    toMinor(values.discountValueDisplay),
  );

  const selectedCustomer = customersData?.items.find(
    (customer) => customer.id === values.customerId,
  );

  async function goNext(): Promise<void> {
    const step = STEPS[stepIndex];
    if (step === "customer" && !(await trigger("customerId"))) return;
    if (step === "dates" && !(await trigger(["plannedStart", "plannedEnd", "validUntil"]))) return;
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
  }

  function goBack(): void {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function toggleAsset(assetId: string, name: string): void {
    setItems((current) =>
      current.some((item) => item.assetId === assetId && item.itemType === "ASSET")
        ? current.filter((item) => !(item.assetId === assetId && item.itemType === "ASSET"))
        : [...current, emptyAssetItemForm(assetId, name)],
    );
  }

  function addServiceItem(): void {
    setItems((current) => [...current, emptyServiceItemForm()]);
  }

  function updateItemAt(index: number, patch: Partial<QuoteItemFormValues>): void {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItemAt(index: number): void {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  async function handleCreate(): Promise<void> {
    const itemInputs: QuoteItemInput[] = items.map((item, index) => ({
      itemType: item.itemType,
      ...(item.itemType === "ASSET" ? { assetId: item.assetId } : {}),
      name: item.name,
      description: item.description || null,
      quantity: item.quantity,
      unit: item.unit || null,
      billingMode: item.billingMode,
      ...(item.unitPriceDisplay ? { unitPriceMinor: toMinor(item.unitPriceDisplay) } : {}),
      ...(item.dailyPriceDisplay ? { dailyPriceMinor: toMinor(item.dailyPriceDisplay) } : {}),
      ...(item.weeklyPriceDisplay ? { weeklyPriceMinor: toMinor(item.weeklyPriceDisplay) } : {}),
      ...(item.monthlyPriceDisplay ? { monthlyPriceMinor: toMinor(item.monthlyPriceDisplay) } : {}),
      ...(item.customPriceDisplay ? { customPriceMinor: toMinor(item.customPriceDisplay) } : {}),
      ...(item.discountType ? { discountType: item.discountType } : {}),
      discountValue: toMinor(item.discountValueDisplay),
      taxRateBp: toMinor(item.taxRateDisplay),
      depositMinor: toMinor(item.depositDisplay),
      sortOrder: index,
      notes: item.notes || null,
    }));

    await onSubmit({
      customerId: values.customerId,
      validUntil: values.validUntil,
      plannedStart: values.plannedStart,
      plannedEnd: values.plannedEnd,
      currency: values.currency,
      ...(values.discountType ? { discountType: values.discountType } : {}),
      discountValue: toMinor(values.discountValueDisplay),
      customerNotes: values.customerNotes || null,
      internalNotes: values.internalNotes || null,
      termsAndConditions: values.termsAndConditions || null,
      items: itemInputs,
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
            {index + 1}. {t(`quote.wizard.steps.${step}`)}
          </li>
        ))}
      </ol>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
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

      {STEPS[stepIndex] === "dates" && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plannedStart">{t("rental.fields.plannedStart")}</Label>
                <Input id="plannedStart" type="datetime-local" {...register("plannedStart")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="plannedEnd">{t("rental.fields.plannedEnd")}</Label>
                <Input id="plannedEnd" type="datetime-local" {...register("plannedEnd")} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="validUntil">{t("quote.fields.validUntil")}</Label>
              <Input id="validUntil" type="datetime-local" {...register("validUntil")} />
            </div>
            {errors.plannedStart && (
              <p className="text-destructive text-sm">{t(errors.plannedStart.message ?? "")}</p>
            )}
            {errors.plannedEnd && (
              <p className="text-destructive text-sm">{t(errors.plannedEnd.message ?? "")}</p>
            )}
            {errors.validUntil && (
              <p className="text-destructive text-sm">{t(errors.validUntil.message ?? "")}</p>
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
              {assetsData?.items.map((asset) => (
                <label
                  key={asset.id}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <span>
                    {asset.name} ({asset.internalNumber})
                  </span>
                  <input
                    type="checkbox"
                    checked={assetItems.some((item) => item.assetId === asset.id)}
                    onChange={() => toggleAsset(asset.id, asset.name)}
                  />
                </label>
              ))}
              {assetsData?.items.length === 0 && (
                <p className="text-muted-foreground text-sm">{t("asset.noAssets")}</p>
              )}
            </div>
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

      {STEPS[stepIndex] === "services" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            {serviceItems.length === 0 && (
              <p className="text-muted-foreground text-sm">{t("quote.wizard.noServiceItems")}</p>
            )}
            {items.map((item, index) =>
              item.itemType === "ASSET" ? null : (
                <div key={index} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("quote.fields.itemType")}</Label>
                      <select
                        className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                        value={item.itemType}
                        onChange={(event) =>
                          updateItemAt(index, { itemType: event.target.value as QuoteItemType })
                        }
                      >
                        {NEW_SERVICE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`quote.itemTypes.${type}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t("quote.fields.name")}</Label>
                      <Input
                        value={item.name}
                        onChange={(event) => updateItemAt(index, { name: event.target.value })}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-destructive self-start text-xs underline"
                    onClick={() => removeItemAt(index)}
                  >
                    {t("quote.actions.removeItem")}
                  </button>
                </div>
              ),
            )}
            <Button type="button" variant="outline" onClick={addServiceItem}>
              {t("quote.actions.addServiceItem")}
            </Button>
          </CardContent>
        </Card>
      )}

      {STEPS[stepIndex] === "pricing" && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            {items.length === 0 && (
              <p className="text-destructive text-sm">{t("quote.errors.noItems")}</p>
            )}
            {items.map((item, index) => (
              <QuoteItemRow
                key={index}
                item={item}
                assetLabel={
                  item.itemType === "ASSET"
                    ? assetsData?.items.find((asset) => asset.id === item.assetId)?.name
                    : undefined
                }
                onChange={(patch) => updateItemAt(index, patch)}
                onRemove={() => removeItemAt(index)}
              />
            ))}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">{t("asset.fields.currency")}</Label>
                <Input id="currency" maxLength={3} {...register("currency")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("quote.fields.discountType")}</Label>
                <select
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  {...register("discountType")}
                >
                  <option value="">{t("quote.fields.noDiscount")}</option>
                  <option value="FIXED">{t("quote.discountTypes.FIXED")}</option>
                  <option value="PERCENTAGE">{t("quote.discountTypes.PERCENTAGE")}</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="discountValueDisplay">
                  {values.discountType === "PERCENTAGE"
                    ? t("quote.fields.discountPercent")
                    : t("quote.fields.discountAmount")}
                </Label>
                <Input
                  id="discountValueDisplay"
                  type="number"
                  step="0.01"
                  disabled={!values.discountType}
                  {...register("discountValueDisplay")}
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
                {formatMoney(estimatedTotals.taxTotalMinor, values.currency)}
              </p>
              <p>
                {t("quote.fields.depositTotal")}:{" "}
                {formatMoney(estimatedTotals.depositTotalMinor, values.currency)}
              </p>
              <p className="font-semibold">
                {t("rental.fields.total")}:{" "}
                {formatMoney(estimatedTotals.totalMinor, values.currency)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {STEPS[stepIndex] === "terms" && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customerNotes">{t("quote.fields.customerNotes")}</Label>
              <textarea
                id="customerNotes"
                rows={3}
                className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                {...register("customerNotes")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="termsAndConditions">{t("quote.fields.termsAndConditions")}</Label>
              <textarea
                id="termsAndConditions"
                rows={4}
                className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
                {...register("termsAndConditions")}
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
            <p>
              <strong>{t("quote.fields.validUntil")}:</strong> {values.validUntil}
            </p>
            <ul className="list-disc pl-5">
              {items.map((item, index) => (
                <li key={index}>
                  {item.itemType === "ASSET"
                    ? (assetsData?.items.find((asset) => asset.id === item.assetId)?.name ??
                      item.name)
                    : item.name}{" "}
                  — {t(`quote.billingModes.${item.billingMode}`)}
                </li>
              ))}
            </ul>
            <p className="font-semibold">
              {t("rental.fields.total")}: {formatMoney(estimatedTotals.totalMinor, values.currency)}
            </p>
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
            {isPending ? t("quote.wizard.saving") : t(submitLabelKey ?? "quote.wizard.createQuote")}
          </Button>
        )}
      </div>
    </div>
  );
}
