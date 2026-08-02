"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentos/ui";
import { useTranslation } from "react-i18next";

import { PortalLoginForm } from "../../../components/portal/portal-login-form";

/**
 * Public, unauthenticated — sibling to /login, outside app/portal/(shell)/
 * so it is never subject to that gated layout's usePortalMe() redirect.
 */
export default function PortalLoginPage() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("portal.auth.login.title")}</CardTitle>
          <CardDescription>{t("portal.auth.login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PortalLoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
