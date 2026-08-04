"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@rentos/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useLogin } from "../../hooks/use-auth";
import { apiErrorKey } from "../../lib/api-error-i18n";
import { loginSchema, type LoginFormValues } from "../../lib/validation";
import { AuthAlert } from "./auth-alert";
import { AuthField, PasswordField } from "./auth-field";
import { AuthFooter } from "./auth-card";

export function LoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const loginMutation = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(values: LoginFormValues): Promise<void> {
    try {
      await loginMutation.mutateAsync(values);
      router.push("/app");
    } catch {
      // Surfaced below via loginMutation.error.
    }
  }

  const pending = isSubmitting || loginMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {loginMutation.isError && <AuthAlert>{t(apiErrorKey(loginMutation.error))}</AuthAlert>}

      <AuthField
        id="email"
        label={t("auth.login.email")}
        type="email"
        autoComplete="email"
        error={errors.email && t(errors.email.message ?? "")}
        {...register("email")}
      />

      <PasswordField
        id="password"
        label={t("auth.login.password")}
        autoComplete="current-password"
        error={errors.password && t(errors.password.message ?? "")}
        showLabel={t("common.showPassword")}
        hideLabel={t("common.hidePassword")}
        {...register("password")}
      />

      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? t("auth.login.submitting") : t("auth.login.submit")}
      </Button>

      <AuthFooter>
        {t("auth.login.noAccount")}{" "}
        <Link href="/register" className="text-primary underline underline-offset-4">
          {t("auth.login.signUp")}
        </Link>
      </AuthFooter>
    </form>
  );
}
