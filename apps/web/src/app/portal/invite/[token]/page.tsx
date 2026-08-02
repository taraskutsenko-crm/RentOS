"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@rentos/ui";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PortalActivateForm } from "../../../../components/portal/portal-activate-form";

/** Public, unauthenticated — the destination of a staff-generated invitation link. */
export default function PortalInvitePage() {
  const { t } = useTranslation();
  const params = useParams<{ token: string }>();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("portal.auth.activate.title")}</CardTitle>
          <CardDescription>{t("portal.auth.activate.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PortalActivateForm token={params.token} />
        </CardContent>
      </Card>
    </main>
  );
}
