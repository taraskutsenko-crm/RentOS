"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentos/ui";
import { useTranslation } from "react-i18next";

import { LoginForm } from "../../components/auth/login-form";

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("auth.login.title")}</CardTitle>
          <CardDescription>{t("auth.login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
