"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { useMe } from "../../hooks/use-auth";

export default function AppHomePage() {
  const { t } = useTranslation();
  const { data } = useMe();

  return (
    <div className="flex flex-col gap-4">
      <p>
        {data?.user.firstName} {data?.user.lastName} — {data?.user.email}
      </p>
      <Link href="/app/select-tenant" className="text-primary w-fit underline underline-offset-4">
        {t("nav.selectTenant")}
      </Link>
    </div>
  );
}
