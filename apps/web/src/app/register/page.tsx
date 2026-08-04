"use client";

import { useTranslation } from "react-i18next";

import { RegisterForm } from "../../components/auth/register-form";
import { AuthCard, AuthHeader } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";

export default function RegisterPage() {
  const { t } = useTranslation();

  return (
    <AuthShell tone="primary" tagline={t("app.tagline")}>
      <AuthCard className="max-w-lg">
        <AuthHeader title={t("auth.register.title")} subtitle={t("auth.register.subtitle")} />
        <RegisterForm />
      </AuthCard>
    </AuthShell>
  );
}
