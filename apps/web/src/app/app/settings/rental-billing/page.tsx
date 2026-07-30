"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@rentos/ui";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { usePermission } from "../../../../hooks/use-current-tenant-role";
import {
  useRentalBillingSettings,
  useUpdateRentalBillingSettings,
} from "../../../../hooks/use-rental-billing-settings";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import {
  rentalBillingSettingsSchema,
  type RentalBillingSettingsFormValues,
} from "../../../../lib/validation";
import type { MonthlyBillingStrategy } from "../../../../types/rental";

const STRATEGIES: MonthlyBillingStrategy[] = ["CALENDAR_MONTH", "FIXED_30_DAYS", "CUSTOM"];

export default function RentalBillingSettingsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("rental_settings.manage");
  const { data: settings, isLoading } = useRentalBillingSettings(tenantId);
  const updateSettings = useUpdateRentalBillingSettings(tenantId);
  const [justSaved, setJustSaved] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RentalBillingSettingsFormValues>({
    resolver: zodResolver(rentalBillingSettingsSchema),
    defaultValues: {
      monthlyBillingStrategy: "CALENDAR_MONTH",
      customMonthLengthDays: "",
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        monthlyBillingStrategy: settings.monthlyBillingStrategy,
        customMonthLengthDays:
          settings.customMonthLengthDays !== null ? String(settings.customMonthLengthDays) : "",
      });
    }
  }, [settings, reset]);

  const strategy = watch("monthlyBillingStrategy");

  async function onSubmit(values: RentalBillingSettingsFormValues): Promise<void> {
    setJustSaved(false);
    await updateSettings.mutateAsync({
      monthlyBillingStrategy: values.monthlyBillingStrategy,
      customMonthLengthDays:
        values.monthlyBillingStrategy === "CUSTOM" ? Number(values.customMonthLengthDays) : null,
    });
    setJustSaved(true);
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("rental.billingSettings.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("rental.billingSettings.subtitle")}</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{t("rental.billingSettings.monthlyMethod")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            {updateSettings.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {apiErrorMessage(updateSettings.error, t("common.error"))}
                </AlertDescription>
              </Alert>
            )}
            {justSaved && !updateSettings.isPending && !updateSettings.isError && (
              <Alert>
                <AlertDescription>{t("rental.billingSettings.saved")}</AlertDescription>
              </Alert>
            )}

            <fieldset className="flex flex-col gap-3" disabled={!canManage}>
              <legend className="sr-only">{t("rental.billingSettings.monthlyMethod")}</legend>
              {STRATEGIES.map((value) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 rounded-md border p-3 ${strategy === value ? "border-primary" : ""} ${!canManage ? "opacity-70" : "cursor-pointer"}`}
                >
                  <input
                    type="radio"
                    className="mt-1"
                    value={value}
                    {...register("monthlyBillingStrategy")}
                  />
                  <span className="flex flex-col gap-1">
                    <span className="font-medium">
                      {t(`rental.billingSettings.strategies.${value}.label`)}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {t(`rental.billingSettings.strategies.${value}.description`)}
                    </span>
                  </span>
                </label>
              ))}

              {strategy === "CUSTOM" && (
                <div className="flex flex-col gap-1.5 pl-8 sm:max-w-xs">
                  <Label htmlFor="customMonthLengthDays">
                    {t("rental.billingSettings.customMonthLengthDays")}
                  </Label>
                  <Input
                    id="customMonthLengthDays"
                    type="number"
                    min={1}
                    max={365}
                    aria-invalid={!!errors.customMonthLengthDays}
                    {...register("customMonthLengthDays")}
                  />
                  {errors.customMonthLengthDays && (
                    <p className="text-destructive text-sm">
                      {t(errors.customMonthLengthDays.message ?? "")}
                    </p>
                  )}
                </div>
              )}
            </fieldset>

            {canManage && (
              <Button
                type="submit"
                disabled={isSubmitting || updateSettings.isPending}
                className="w-fit"
              >
                {updateSettings.isPending
                  ? t("rental.billingSettings.saving")
                  : t("rental.billingSettings.save")}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
