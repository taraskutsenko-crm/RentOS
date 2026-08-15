"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, Button, Input, Label } from "@rentos/ui";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useAssets } from "../../hooks/use-assets";
import { useCustomers } from "../../hooks/use-customers";
import { useCurrentTenantId } from "../../hooks/use-current-tenant";
import { useRentals } from "../../hooks/use-rentals";
import { documentSchema, type DocumentFormValues } from "../../lib/validation";
import type { DocumentType } from "../../types/document";

const DOCUMENT_TYPES: DocumentType[] = [
  "QUOTE",
  "CONTRACT",
  "HANDOVER_PROTOCOL",
  "RETURN_PROTOCOL",
  "DAMAGE_REPORT",
  "CONTRACT_AMENDMENT",
  "CUSTOM",
];

export interface DocumentFormProps {
  onSubmit: (values: DocumentFormValues) => Promise<void>;
  isPending: boolean;
  errorMessage?: string | null;
  submitLabel: string;
  submittingLabel: string;
  /**
   * Pre-fills the form when arriving from a "Generate document" link on the
   * Rental/Quote Workspace (see rentals/[id]/page.tsx, quotes/[id]/page.tsx)
   * — this is the actual fix for the reported blank rental.number/total/
   * start/end bug: those placeholders were only ever blank because no UI
   * path ever set `rentalId` on document creation at all.
   */
  initialValues?: Partial<DocumentFormValues> | undefined;
}

export function DocumentForm({
  onSubmit,
  isPending,
  errorMessage,
  submitLabel,
  submittingLabel,
  initialValues,
}: DocumentFormProps) {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const { data: customers } = useCustomers(tenantId, { pageSize: 100 });
  const { data: assets } = useAssets(tenantId, { pageSize: 100 });
  const { data: rentals } = useRentals(tenantId, { pageSize: 100 });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      documentType: "CONTRACT",
      customTypeName: "",
      title: "",
      customerId: "",
      assetId: "",
      rentalId: "",
      ...initialValues,
    },
  });

  // `defaultValues.customerId/assetId/rentalId` above only takes effect if a
  // matching <option> already exists in the DOM at the moment RHF registers
  // the native <select> — but customers/assets/rentals load asynchronously
  // (see useCustomers/useAssets/useRentals below), so a pre-filled rentalId
  // arriving via a "Generate document" link (see rentals/[id]/page.tsx)
  // silently reset to empty once the real <option> list rendered, one
  // render after the browser had already applied the (then-optionless)
  // default. Re-apply any pre-filled ids once all three lists have loaded.
  const appliedAsyncInitialValues = useRef(false);
  useEffect(() => {
    if (appliedAsyncInitialValues.current) return;
    if (!customers || !assets || !rentals) return;
    if (initialValues?.customerId) setValue("customerId", initialValues.customerId);
    if (initialValues?.assetId) setValue("assetId", initialValues.assetId);
    if (initialValues?.rentalId) setValue("rentalId", initialValues.rentalId);
    appliedAsyncInitialValues.current = true;
  }, [customers, assets, rentals, initialValues, setValue]);

  const documentType = watch("documentType");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="documentType">{t("document.fields.documentType")}</Label>
        <select
          id="documentType"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          {...register("documentType")}
        >
          {DOCUMENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`document.types.${value}`)}
            </option>
          ))}
        </select>
      </div>

      {documentType === "CUSTOM" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customTypeName">{t("document.fields.customTypeName")}</Label>
          <Input
            id="customTypeName"
            aria-invalid={!!errors.customTypeName}
            {...register("customTypeName")}
          />
          {errors.customTypeName && (
            <p className="text-destructive text-xs">{t(errors.customTypeName.message!)}</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">{t("document.fields.title")}</Label>
        <Input id="title" {...register("title")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="customerId">{t("customer.title")}</Label>
        <select
          id="customerId"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          {...register("customerId")}
        >
          <option value="">{t("document.fields.none")}</option>
          {customers?.items.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.firstName} {customer.lastName}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rentalId">{t("rental.title")}</Label>
        <select
          id="rentalId"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          {...register("rentalId")}
        >
          <option value="">{t("document.fields.none")}</option>
          {rentals?.items.map((rental) => (
            <option key={rental.id} value={rental.id}>
              {rental.rentalNumber}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">{t("document.fields.rentalHint")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="assetId">{t("asset.title")}</Label>
        <select
          id="assetId"
          className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
          {...register("assetId")}
        >
          <option value="">{t("document.fields.none")}</option>
          {assets?.items.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isPending || isSubmitting}>
        {isPending || isSubmitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  );
}
