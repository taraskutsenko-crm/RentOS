"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, Button, Input, Label } from "@rentos/ui";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useAssetCategories } from "../../hooks/use-asset-categories";
import { useAssetCustomFieldsForCategory } from "../../hooks/use-asset-custom-fields";
import { useAssetStatuses } from "../../hooks/use-asset-statuses";
import { getAssetStatusLabel } from "../../lib/asset-status-label";
import { toMinorUnits } from "../../lib/money";
import { assetSchema, type AssetFormValues } from "../../lib/validation";
import type { AssetInput } from "../../hooks/use-assets";
import { CustomFieldInput } from "./custom-field-input";

export interface AssetFormProps {
  tenantId: string | null;
  initialValues?: Partial<AssetFormValues>;
  initialCustomFields?: Record<string, unknown>;
  defaultCurrency?: string | undefined;
  onSubmit: (input: AssetInput) => Promise<void>;
  isPending: boolean;
  errorMessage?: string | null;
  submitLabel: string;
  submittingLabel: string;
}

export function AssetForm({
  tenantId,
  initialValues,
  initialCustomFields,
  defaultCurrency,
  onSubmit,
  isPending,
  errorMessage,
  submitLabel,
  submittingLabel,
}: AssetFormProps) {
  const { t } = useTranslation();
  const { data: categoriesData } = useAssetCategories(tenantId);
  const { data: statuses } = useAssetStatuses(tenantId);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>(
    initialCustomFields ?? {},
  );
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: "",
      internalNumber: "",
      categoryId: "",
      statusId: "",
      sku: "",
      serialNumber: "",
      barcode: "",
      qrCodeValue: "",
      manufacturer: "",
      model: "",
      description: "",
      purchaseDate: "",
      purchasePriceDisplay: "",
      purchaseCurrency: defaultCurrency ?? "",
      replacementValueDisplay: "",
      replacementCurrency: defaultCurrency ?? "",
      conditionNotes: "",
      isRentable: true,
      isActive: true,
      customFields: {},
      ...initialValues,
    },
  });

  const selectedCategoryId = watch("categoryId");
  const { data: applicableFields } = useAssetCustomFieldsForCategory(
    tenantId,
    selectedCategoryId || null,
  );

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (isDirty) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  async function submit(values: AssetFormValues): Promise<void> {
    const errorsFound: Record<string, string> = {};
    for (const field of applicableFields ?? []) {
      const value = customFieldValues[field.key];
      if (field.isRequired && (value === undefined || value === null || value === "")) {
        errorsFound[field.key] = t("asset.errors.customFieldRequired");
      }
    }
    if (Object.keys(errorsFound).length > 0) {
      setCustomFieldErrors(errorsFound);
      return;
    }
    setCustomFieldErrors({});

    const input: AssetInput = {
      name: values.name,
      internalNumber: values.internalNumber,
      categoryId: values.categoryId,
      ...(values.statusId ? { statusId: values.statusId } : {}),
      sku: values.sku || null,
      serialNumber: values.serialNumber || null,
      barcode: values.barcode || null,
      qrCodeValue: values.qrCodeValue || null,
      manufacturer: values.manufacturer || null,
      model: values.model || null,
      description: values.description || null,
      purchaseDate: values.purchaseDate || null,
      conditionNotes: values.conditionNotes || null,
      isRentable: values.isRentable,
      isActive: values.isActive,
      customFields: customFieldValues,
    };

    const purchaseMinor = toMinorUnits(values.purchasePriceDisplay);
    if (purchaseMinor !== undefined) {
      input.purchasePriceMinor = purchaseMinor;
      input.purchaseCurrency = values.purchaseCurrency || defaultCurrency || null;
    }
    const replacementMinor = toMinorUnits(values.replacementValueDisplay);
    if (replacementMinor !== undefined) {
      input.replacementValueMinor = replacementMinor;
      input.replacementCurrency = values.replacementCurrency || defaultCurrency || null;
    }

    await onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-8" noValidate>
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* 1. Basic information */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("asset.sections.basicInfo")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">{t("asset.fields.name")}</Label>
            <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
            {errors.name && (
              <p className="text-destructive text-sm">{t(errors.name.message ?? "")}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">{t("asset.fields.description")}</Label>
            <Input id="description" {...register("description")} />
          </div>
        </div>
      </section>

      {/* 2. Identification */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("asset.sections.identification")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="internalNumber">{t("asset.fields.internalNumber")}</Label>
            <Input
              id="internalNumber"
              aria-invalid={!!errors.internalNumber}
              {...register("internalNumber")}
            />
            {errors.internalNumber && (
              <p className="text-destructive text-sm">{t(errors.internalNumber.message ?? "")}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">{t("asset.fields.sku")}</Label>
            <Input id="sku" {...register("sku")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="serialNumber">{t("asset.fields.serialNumber")}</Label>
            <Input id="serialNumber" {...register("serialNumber")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="barcode">{t("asset.fields.barcode")}</Label>
            <Input id="barcode" {...register("barcode")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qrCodeValue">{t("asset.fields.qrCodeValue")}</Label>
            <Input id="qrCodeValue" {...register("qrCodeValue")} />
          </div>
        </div>
      </section>

      {/* 3. Category */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("asset.sections.category")}</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="categoryId">{t("asset.fields.category")}</Label>
          <select
            id="categoryId"
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            aria-invalid={!!errors.categoryId}
            {...register("categoryId")}
          >
            <option value="">{t("asset.fields.selectPlaceholder")}</option>
            {categoriesData?.items.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {errors.categoryId && (
            <p className="text-destructive text-sm">{t(errors.categoryId.message ?? "")}</p>
          )}
        </div>
      </section>

      {/* 4. Status */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("asset.sections.status")}</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="statusId">{t("asset.fields.status")}</Label>
          <select
            id="statusId"
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            {...register("statusId")}
          >
            <option value="">{t("asset.fields.statusDefaultHint")}</option>
            {statuses?.map((status) => (
              <option key={status.id} value={status.id}>
                {getAssetStatusLabel(t, status)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* 5. Manufacturer and model */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("asset.sections.manufacturerModel")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manufacturer">{t("asset.fields.manufacturer")}</Label>
            <Input id="manufacturer" {...register("manufacturer")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="model">{t("asset.fields.model")}</Label>
            <Input id="model" {...register("model")} />
          </div>
        </div>
      </section>

      {/* 6. Financial information */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("asset.sections.financial")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchaseDate">{t("asset.fields.purchaseDate")}</Label>
            <Input id="purchaseDate" type="date" {...register("purchaseDate")} />
          </div>
          <div />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchasePriceDisplay">{t("asset.fields.purchasePrice")}</Label>
            <Input
              id="purchasePriceDisplay"
              type="number"
              step="0.01"
              {...register("purchasePriceDisplay")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="purchaseCurrency">{t("asset.fields.currency")}</Label>
            <Input id="purchaseCurrency" maxLength={3} {...register("purchaseCurrency")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="replacementValueDisplay">{t("asset.fields.replacementValue")}</Label>
            <Input
              id="replacementValueDisplay"
              type="number"
              step="0.01"
              {...register("replacementValueDisplay")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="replacementCurrency">{t("asset.fields.currency")}</Label>
            <Input id="replacementCurrency" maxLength={3} {...register("replacementCurrency")} />
          </div>
        </div>
      </section>

      {/* 7. Location and condition */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">{t("asset.sections.locationCondition")}</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="conditionNotes">{t("asset.fields.conditionNotes")}</Label>
          <textarea
            id="conditionNotes"
            rows={3}
            className="border-input flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs"
            {...register("conditionNotes")}
          />
        </div>
        <p className="text-muted-foreground text-sm">{t("asset.fields.locationChangeHint")}</p>
      </section>

      {/* 8. Custom fields */}
      {applicableFields && applicableFields.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("asset.sections.customFields")}</h2>
          <div className="grid grid-cols-2 gap-4">
            {applicableFields.map((field) => (
              <CustomFieldInput
                key={field.id}
                definition={field}
                value={customFieldValues[field.key]}
                onChange={(value) =>
                  setCustomFieldValues((current) => ({ ...current, [field.key]: value }))
                }
                error={customFieldErrors[field.key]}
              />
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isRentable")} />
          {t("asset.fields.isRentable")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("isActive")} />
          {t("asset.fields.isActive")}
        </label>
      </div>

      <Button type="submit" disabled={isSubmitting || isPending} className="w-fit">
        {isPending ? submittingLabel : submitLabel}
      </Button>
    </form>
  );
}
