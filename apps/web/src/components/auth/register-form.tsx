"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, AlertDescription, Button, Input, Label } from "@rentos/ui";
import { countries } from "@rentos/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useRegister } from "../../hooks/use-auth";
import { apiErrorKey } from "../../lib/api-error-i18n";
import { registerSchema, type RegisterFormValues } from "../../lib/validation";

export function RegisterForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const registerMutation = useRegister();

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
      await registerMutation.mutateAsync(registerInput);
      router.push("/app");
    } catch {
      // Surfaced below via registerMutation.error.
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {registerMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t(apiErrorKey(registerMutation.error))}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">{t("auth.register.firstName")}</Label>
          <Input
            id="firstName"
            autoComplete="given-name"
            aria-invalid={!!errors.firstName}
            {...register("firstName")}
          />
          {errors.firstName && (
            <p className="text-destructive text-sm">{t(errors.firstName.message ?? "")}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">{t("auth.register.lastName")}</Label>
          <Input
            id="lastName"
            autoComplete="family-name"
            aria-invalid={!!errors.lastName}
            {...register("lastName")}
          />
          {errors.lastName && (
            <p className="text-destructive text-sm">{t(errors.lastName.message ?? "")}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">{t("auth.register.email")}</Label>
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

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">{t("auth.register.password")}</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          {errors.password && (
            <p className="text-destructive text-sm">{t(errors.password.message ?? "")}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="passwordConfirmation">{t("auth.register.passwordConfirmation")}</Label>
          <Input
            id="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.passwordConfirmation}
            {...register("passwordConfirmation")}
          />
          {errors.passwordConfirmation && (
            <p className="text-destructive text-sm">
              {t(errors.passwordConfirmation.message ?? "")}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="companyName">{t("auth.register.companyName")}</Label>
        <Input
          id="companyName"
          autoComplete="organization"
          aria-invalid={!!errors.companyName}
          {...register("companyName")}
        />
        {errors.companyName && (
          <p className="text-destructive text-sm">{t(errors.companyName.message ?? "")}</p>
        )}
      </div>

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

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultLanguage">{t("auth.register.language")}</Label>
          <Input
            id="defaultLanguage"
            aria-invalid={!!errors.defaultLanguage}
            {...register("defaultLanguage")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="defaultCurrency">{t("auth.register.currency")}</Label>
          <Input
            id="defaultCurrency"
            aria-invalid={!!errors.defaultCurrency}
            {...register("defaultCurrency")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">{t("auth.register.timezone")}</Label>
          <Input id="timezone" aria-invalid={!!errors.timezone} {...register("timezone")} />
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting || registerMutation.isPending}>
        {registerMutation.isPending ? t("auth.register.submitting") : t("auth.register.submit")}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        {t("auth.register.haveAccount")}{" "}
        <Link href="/login" className="text-primary underline underline-offset-4">
          {t("auth.register.signIn")}
        </Link>
      </p>
    </form>
  );
}
