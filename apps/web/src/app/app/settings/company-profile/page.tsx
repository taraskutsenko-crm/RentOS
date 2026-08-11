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
import { useCurrentTenantRole, usePermission } from "../../../../hooks/use-current-tenant-role";
import { useUpdateCompanyProfile } from "../../../../hooks/use-update-company-profile";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { companyProfileSchema, type CompanyProfileFormValues } from "../../../../lib/validation";

export default function CompanyProfileSettingsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("tenant.manage");
  const { data, isLoading } = useCurrentTenantRole();
  const updateProfile = useUpdateCompanyProfile(tenantId);
  const [justSaved, setJustSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      name: "",
      registrationNumber: "",
      taxNumber: "",
      address: "",
      phone: "",
    },
  });

  useEffect(() => {
    if (data?.tenant) {
      reset({
        name: data.tenant.name,
        registrationNumber: data.tenant.registrationNumber ?? "",
        taxNumber: data.tenant.taxNumber ?? "",
        address: data.tenant.address ?? "",
        phone: data.tenant.phone ?? "",
      });
    }
  }, [data, reset]);

  async function onSubmit(values: CompanyProfileFormValues): Promise<void> {
    setJustSaved(false);
    await updateProfile.mutateAsync(values);
    setJustSaved(true);
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("tenant.companyProfile.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("tenant.companyProfile.subtitle")}</p>
      </div>

      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{t("tenant.companyProfile.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            className="flex flex-col gap-4"
            noValidate
          >
            {updateProfile.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {apiErrorMessage(updateProfile.error, t("common.error"))}
                </AlertDescription>
              </Alert>
            )}
            {justSaved && !updateProfile.isPending && !updateProfile.isError && (
              <Alert>
                <AlertDescription>{t("tenant.companyProfile.saved")}</AlertDescription>
              </Alert>
            )}

            <fieldset className="flex flex-col gap-4" disabled={!canManage}>
              <legend className="sr-only">{t("tenant.companyProfile.cardTitle")}</legend>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">{t("tenant.companyProfile.fields.name")}</Label>
                <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
                {errors.name && (
                  <p className="text-destructive text-sm">{t(errors.name.message ?? "")}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="registrationNumber">
                  {t("tenant.companyProfile.fields.registrationNumber")}
                </Label>
                <Input id="registrationNumber" {...register("registrationNumber")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="taxNumber">{t("tenant.companyProfile.fields.taxNumber")}</Label>
                <Input id="taxNumber" {...register("taxNumber")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address">{t("tenant.companyProfile.fields.address")}</Label>
                <Input id="address" {...register("address")} />
              </div>

              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="phone">{t("tenant.companyProfile.fields.phone")}</Label>
                <Input id="phone" type="tel" {...register("phone")} />
              </div>
            </fieldset>

            {canManage && (
              <Button
                type="submit"
                disabled={isSubmitting || updateProfile.isPending}
                className="w-fit"
              >
                {updateProfile.isPending
                  ? t("tenant.companyProfile.saving")
                  : t("tenant.companyProfile.save")}
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
