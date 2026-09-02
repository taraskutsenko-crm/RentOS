"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@rentos/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useLogin } from "../../hooks/use-auth";
import { apiErrorKey } from "../../lib/api-error-i18n";
import { isSessionExpiredReason, sanitizeReturnTo } from "../../lib/session-expiry";
import { loginSchema, type LoginFormValues } from "../../lib/validation";
import { AuthAlert } from "./auth-alert";
import { AuthField, PasswordField } from "./auth-field";
import { AuthFooter } from "./auth-card";

export function LoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginMutation = useLogin();

  // Task F2 — two independent mechanisms can send the user back to this
  // page with a path to return to: the global 401 handler (query-
  // provider.tsx, `?returnTo=`) and the pre-existing cookie-presence-only
  // middleware redirect (proxy.ts, `?from=`, e.g. a closed tab reopened
  // with no session at all). `reason` explains why they landed back on
  // login (never a raw backend "Authentication required" string — see F1)
  // — the middleware's redirect has no such reason, it's an ordinary
  // "please sign in" case, not an expired-session notice. Either param is
  // sanitized before ever being used as a navigation target (never trusted
  // as an open redirect).
  const sessionExpired = isSessionExpiredReason(searchParams?.get("reason") ?? null);
  const returnTo = sanitizeReturnTo(
    searchParams?.get("returnTo") ?? searchParams?.get("from") ?? null,
    "/app",
  );

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
      router.push(returnTo);
    } catch {
      // Surfaced below via loginMutation.error.
    }
  }

  const pending = isSubmitting || loginMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {!loginMutation.isError && sessionExpired && (
        <AuthAlert variant="info">{t("auth.errors.sessionExpired")}</AuthAlert>
      )}
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
