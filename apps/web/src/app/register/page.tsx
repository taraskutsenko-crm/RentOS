"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentos/ui";
import { useTranslation } from "react-i18next";

import { RegisterForm } from "../../components/auth/register-form";

export default function RegisterPage() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{t("auth.register.title")}</CardTitle>
          <CardDescription>{t("auth.register.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>
    </main>
  );
}
