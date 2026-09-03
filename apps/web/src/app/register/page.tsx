"use client";

import { Suspense } from "react";
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
        {/* RegisterForm reads `?ref=` via useSearchParams() (Havelio
            referral links, Stage 17 closure pass) — Next.js requires that
            hook's consumer to sit inside a Suspense boundary. */}
        <Suspense fallback={null}>
          <RegisterForm />
        </Suspense>
      </AuthCard>
    </AuthShell>
  );
}
