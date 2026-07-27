"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, Button, Input, Label } from "@rentos/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useLogin } from "../../hooks/use-auth";
import { apiErrorKey } from "../../lib/api-error-i18n";
import { loginSchema, type LoginFormValues } from "../../lib/validation";

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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {loginMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t(apiErrorKey(loginMutation.error))}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("auth.login.email")}</Label>
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
        <Label htmlFor="password">{t("auth.login.password")}</Label>
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
        {loginMutation.isPending ? t("auth.login.submitting") : t("auth.login.submit")}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        {t("auth.login.noAccount")}{" "}
        <Link href="/register" className="text-primary underline underline-offset-4">
          {t("auth.login.signUp")}
        </Link>
      </p>
    </form>
  );
}
