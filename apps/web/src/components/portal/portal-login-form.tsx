"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@rentos/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { usePortalLogin } from "../../hooks/use-portal-auth";
import { apiErrorMessage } from "../../lib/api-error-i18n";
import { portalLoginSchema, type PortalLoginFormValues } from "../../lib/validation";
import { AuthAlert } from "../auth/auth-alert";
import { AuthField, PasswordField } from "../auth/auth-field";

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

  const pending = isSubmitting || loginMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {loginMutation.isError && (
        <AuthAlert>
          {apiErrorMessage(loginMutation.error, t("portal.auth.errors.invalidCredentials"))}
        </AuthAlert>
      )}

      <AuthField
        id="tenantSlug"
        label={t("portal.auth.login.company")}
        type="text"
        autoComplete="organization"
        placeholder={t("portal.auth.login.companyPlaceholder")}
        error={errors.tenantSlug && t(errors.tenantSlug.message ?? "")}
        {...register("tenantSlug")}
      />

      <AuthField
        id="email"
        label={t("portal.auth.login.email")}
        type="email"
        autoComplete="email"
        error={errors.email && t(errors.email.message ?? "")}
        {...register("email")}
      />

      <PasswordField
        id="password"
        label={t("portal.auth.login.password")}
        autoComplete="current-password"
        error={errors.password && t(errors.password.message ?? "")}
        showLabel={t("common.showPassword")}
        hideLabel={t("common.hidePassword")}
        {...register("password")}
      />

      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? t("portal.auth.login.submitting") : t("portal.auth.login.submit")}
      </Button>
    </form>
  );
}
