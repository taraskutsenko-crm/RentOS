"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { localeRegistry } from "@rentos/localization";
import { Button, Label } from "@rentos/ui";
import { countries } from "@rentos/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useRegister } from "../../hooks/use-auth";
import { useCurrentTenantId } from "../../hooks/use-current-tenant";
import { apiErrorKey } from "../../lib/api-error-i18n";
import { registerSchema, type RegisterFormValues } from "../../lib/validation";
import { AuthAlert } from "./auth-alert";
import { AuthField, PasswordField } from "./auth-field";
import { AuthFooter } from "./auth-card";

export function RegisterForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const registerMutation = useRegister();
  const [, setCurrentTenantId] = useCurrentTenantId();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      countryCode: "US",
      defaultLanguage: "en",
      defaultCurrency: "USD",
      timezone: "America/New_York",
    },
  });

  function handleCountryChange(code: string): void {
    const country = countries.find((entry) => entry.code === code);
    if (country) {
      setValue("defaultLanguage", country.defaultLanguage);
      setValue("defaultCurrency", country.defaultCurrency);
      setValue("timezone", country.timezones[0] ?? "");
    }
  }

  async function onSubmit(values: RegisterFormValues): Promise<void> {
    const { passwordConfirmation: _passwordConfirmation, ...registerInput } = values;
    try {
      const result = await registerMutation.mutateAsync(registerInput);
      setCurrentTenantId(result.tenant.id);
      router.push("/app");
    } catch {
      // Surfaced below via registerMutation.error.
    }
  }

  const pending = isSubmitting || registerMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
      {registerMutation.isError && <AuthAlert>{t(apiErrorKey(registerMutation.error))}</AuthAlert>}

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthField
            id="firstName"
            label={t("auth.register.firstName")}
            autoComplete="given-name"
            error={errors.firstName && t(errors.firstName.message ?? "")}
            {...register("firstName")}
          />
          <AuthField
            id="lastName"
            label={t("auth.register.lastName")}
            autoComplete="family-name"
            error={errors.lastName && t(errors.lastName.message ?? "")}
            {...register("lastName")}
          />
        </div>

        <AuthField
          id="email"
          label={t("auth.register.email")}
          type="email"
          autoComplete="email"
          error={errors.email && t(errors.email.message ?? "")}
          {...register("email")}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PasswordField
            id="password"
            label={t("auth.register.password")}
            autoComplete="new-password"
            error={errors.password && t(errors.password.message ?? "")}
            showLabel={t("common.showPassword")}
            hideLabel={t("common.hidePassword")}
            {...register("password")}
          />
          <PasswordField
            id="passwordConfirmation"
            label={t("auth.register.passwordConfirmation")}
            autoComplete="new-password"
            error={errors.passwordConfirmation && t(errors.passwordConfirmation.message ?? "")}
            showLabel={t("common.showPassword")}
            hideLabel={t("common.hidePassword")}
            {...register("passwordConfirmation")}
          />
        </div>
      </div>

      <div className="border-border flex flex-col gap-4 border-t pt-5">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t("auth.register.companySection")}
        </p>

        <AuthField
          id="companyName"
          label={t("auth.register.companyName")}
          autoComplete="organization"
          error={errors.companyName && t(errors.companyName.message ?? "")}
          {...register("companyName")}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="countryCode">{t("auth.register.country")}</Label>
          <select
            id="countryCode"
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
            {...register("countryCode", {
              onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                handleCountryChange(event.target.value),
            })}
          >
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {t(country.displayNameKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="defaultLanguage">{t("auth.register.language")}</Label>
            <select
              id="defaultLanguage"
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs"
              aria-invalid={!!errors.defaultLanguage}
              aria-describedby={errors.defaultLanguage ? "defaultLanguage-error" : undefined}
              {...register("defaultLanguage")}
            >
              {localeRegistry.map((locale) => (
                <option key={locale.code} value={locale.code}>
                  {locale.nativeName}
                </option>
              ))}
            </select>
            {errors.defaultLanguage && (
              <p id="defaultLanguage-error" className="text-destructive text-sm">
                {t(errors.defaultLanguage.message ?? "")}
              </p>
            )}
          </div>
          <AuthField
            id="defaultCurrency"
            label={t("auth.register.currency")}
            error={errors.defaultCurrency && t(errors.defaultCurrency.message ?? "")}
            {...register("defaultCurrency")}
          />
          <AuthField
            id="timezone"
            label={t("auth.register.timezone")}
            error={errors.timezone && t(errors.timezone.message ?? "")}
            {...register("timezone")}
          />
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t("auth.register.submitting") : t("auth.register.submit")}
      </Button>

      <AuthFooter>
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="text-primary underline underline-offset-4">
          {t("auth.register.signIn")}
        </Link>
      </AuthFooter>
    </form>
  );
}
