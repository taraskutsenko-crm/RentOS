"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  useToast,
} from "@rentos/ui";
import { listSupportedTimezones } from "@rentos/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useCurrentTenantId } from "../../../../hooks/use-current-tenant";
import { useCurrentTenantRole, usePermission } from "../../../../hooks/use-current-tenant-role";
import { useUpdateCompanyProfile } from "../../../../hooks/use-update-company-profile";
import { apiErrorMessage } from "../../../../lib/api-error-i18n";
import { companyProfileSchema, type CompanyProfileFormValues } from "../../../../lib/validation";

const SUPPORTED_TIMEZONES = listSupportedTimezones();

export default function CompanyProfileSettingsPage() {
  const { t } = useTranslation();
  const [tenantId] = useCurrentTenantId();
  const canManage = usePermission("tenant.manage");
  const { data, isLoading } = useCurrentTenantRole();
  const updateProfile = useUpdateCompanyProfile(tenantId);
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CompanyProfileFormValues>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: {
      name: "",
      timezone: "",
      registrationNumber: "",
      taxNumber: "",
      address: "",
      phone: "",
      email: "",
    },
  });

  useEffect(() => {
    if (data?.tenant) {
      reset({
        name: data.tenant.name,
        timezone: data.tenant.timezone,
        registrationNumber: data.tenant.registrationNumber ?? "",
        taxNumber: data.tenant.taxNumber ?? "",
        address: data.tenant.address ?? "",
        phone: data.tenant.phone ?? "",
        email: data.tenant.email ?? "",
      });
    }
  }, [data, reset]);

  async function onSubmit(values: CompanyProfileFormValues): Promise<void> {
    // Defensive double-submit guard on top of the disabled Save button below
    // — a disabled button already stops a second click/Enter from firing
    // this handler again, but this is a cheap extra line of defense against
    // any race between the click and React committing that disabled state.
    if (updateProfile.isPending) return;

    try {
      // Keep the just-saved values in the form (no reset()) — the user
      // should see exactly what they saved, not a reverted/blank form.
      await updateProfile.mutateAsync(values);
      toast({ variant: "success", description: t("tenant.companyProfile.saved") });
    } catch (error) {
      // apiErrorMessage() already extracts a safe, user-readable backend
      // validation message when the API provides one, falling back to a
      // generic message otherwise — never the raw error/stack trace.
      toast({
        variant: "destructive",
        description: apiErrorMessage(error, t("tenant.companyProfile.saveFailed")),
      });
    }
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
            <fieldset className="flex flex-col gap-4" disabled={!canManage}>
              <legend className="sr-only">{t("tenant.companyProfile.cardTitle")}</legend>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">{t("tenant.companyProfile.fields.name")}</Label>
                <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
                {errors.name && (
                  <p className="text-destructive text-sm">{t(errors.name.message ?? "")}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="timezone">{t("tenant.companyProfile.fields.timezone")}</Label>
                <Select id="timezone" aria-invalid={!!errors.timezone} {...register("timezone")}>
                  {SUPPORTED_TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
                {errors.timezone && (
                  <p className="text-destructive text-sm">{t(errors.timezone.message ?? "")}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  {t("tenant.companyProfile.fields.timezoneHelp")}
                </p>
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

              <div className="flex flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor="email">{t("tenant.companyProfile.fields.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-destructive text-sm">{t(errors.email.message ?? "")}</p>
                )}
                <p className="text-muted-foreground text-xs">
                  {t("tenant.companyProfile.fields.emailHelp")}
                </p>
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
