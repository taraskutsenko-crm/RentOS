"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../components/shell/page-header";
import { useMe } from "../../hooks/use-auth";

export default function AppHomePage() {
  const { t } = useTranslation();
  const { data } = useMe();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("app.nav.dashboard")}
        subtitle={
          data ? `${data.user.firstName} ${data.user.lastName} — ${data.user.email}` : undefined
        }
      />
      <Link href="/app/select-tenant" className="text-primary w-fit underline underline-offset-4">
        {t("nav.selectTenant")}
      </Link>
    </div>
  );
}
