"use client";

import { useTranslation } from "react-i18next";

import { LoginForm } from "../../components/auth/login-form";
import { AuthCard, AuthHeader } from "../../components/auth/auth-card";
import { AuthShell } from "../../components/auth/auth-shell";

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <AuthShell tone="primary" tagline={t("app.tagline")}>
      <AuthCard>
        <AuthHeader title={t("auth.login.title")} subtitle={t("auth.login.subtitle")} />
        <LoginForm />
      </AuthCard>
    </AuthShell>
  );
}
