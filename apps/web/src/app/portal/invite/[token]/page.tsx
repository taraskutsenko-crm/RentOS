"use client";

import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";

import { PortalActivateForm } from "../../../../components/portal/portal-activate-form";
import { AuthCard, AuthHeader } from "../../../../components/auth/auth-card";
import { AuthShell } from "../../../../components/auth/auth-shell";

/** Public, unauthenticated — the destination of a staff-generated invitation link. */
export default function PortalInvitePage() {
  const { t } = useTranslation();
  const params = useParams<{ token: string }>();

  return (
    <AuthShell tone="sidebar" tagline={t("portal.auth.tagline")}>
      <AuthCard>
        <AuthHeader
          title={t("portal.auth.activate.title")}
          subtitle={t("portal.auth.activate.subtitle")}
        />
        <PortalActivateForm token={params.token} />
      </AuthCard>
    </AuthShell>
  );
}
