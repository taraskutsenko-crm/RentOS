"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, Button, Input, Label } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { usePortalLogin } from "../../hooks/use-portal-auth";
import { apiErrorMessage } from "../../lib/api-error-i18n";
import { portalLoginSchema, type PortalLoginFormValues } from "../../lib/validation";

export function PortalLoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const loginMutation = usePortalLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PortalLoginFormValues>({
    resolver: zodResolver(portalLoginSchema),
  });

  async function onSubmit(values: PortalLoginFormValues): Promise<void> {
    try {
      await loginMutation.mutateAsync(values);
      router.push("/portal/dashboard");
    } catch {
      // Surfaced below via loginMutation.error.
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {loginMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {apiErrorMessage(loginMutation.error, t("portal.auth.errors.invalidCredentials"))}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tenantSlug">{t("portal.auth.login.company")}</Label>
        <Input
          id="tenantSlug"
          type="text"
          autoComplete="organization"
          placeholder={t("portal.auth.login.companyPlaceholder")}
          aria-invalid={!!errors.tenantSlug}
          {...register("tenantSlug")}
        />
        {errors.tenantSlug && (
          <p className="text-destructive text-sm">{t(errors.tenantSlug.message ?? "")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("portal.auth.login.email")}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          {...register("email")}
        />
        {errors.email && (
          <p className="text-destructive text-sm">{t(errors.email.message ?? "")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">{t("portal.auth.login.password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-destructive text-sm">{t(errors.password.message ?? "")}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting || loginMutation.isPending}>
        {loginMutation.isPending
          ? t("portal.auth.login.submitting")
          : t("portal.auth.login.submit")}
      </Button>
    </form>
  );
}
