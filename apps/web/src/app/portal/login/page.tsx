"use client";

import { useTranslation } from "react-i18next";

import { PortalLoginForm } from "../../../components/portal/portal-login-form";
import { AuthCard, AuthHeader } from "../../../components/auth/auth-card";
import { AuthShell } from "../../../components/auth/auth-shell";

/**
 * Public, unauthenticated — sibling to /login, outside app/portal/(shell)/
 * so it is never subject to that gated layout's usePortalMe() redirect.
 */
export default function PortalLoginPage() {
  const { t } = useTranslation();

  return (
    <AuthShell tone="sidebar" tagline={t("portal.auth.tagline")}>
      <AuthCard>
        <AuthHeader
          title={t("portal.auth.login.title")}
          subtitle={t("portal.auth.login.subtitle")}
        />
        <PortalLoginForm />
      </AuthCard>
    </AuthShell>
  );
}
