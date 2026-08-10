"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import {
  DashboardCard,
  DashboardGrid,
  DashboardMetric,
  RecentActivity,
} from "../../../../components/dashboard";
import { usePortalDashboard } from "../../../../hooks/use-portal-dashboard";
import { usePortalMe } from "../../../../hooks/use-portal-auth";
import { formatDate } from "../../../../lib/date-format";
import { formatMoney } from "../../../../lib/money";

export default function PortalDashboardPage() {
  const { t, i18n } = useTranslation();
  const { data: session } = usePortalMe();
  const { data, isLoading, isError, refetch } = usePortalDashboard();

  const stats = [
    {
      key: "currentRentals",
      label: t("portal.dashboard.currentRentals"),
      value: data?.currentRentalsCount ?? 0,
    },
    {
      key: "upcomingRentals",
      label: t("portal.dashboard.upcomingRentals"),
      value: data?.upcomingRentalsCount ?? 0,
    },
    {
      key: "unreadMessages",
      label: t("portal.dashboard.unreadMessages"),
      value: data?.unreadMessagesCount ?? 0,
    },
    {
      key: "pendingSignatures",
      label: t("portal.dashboard.pendingSignatures"),
      value: data?.pendingSignatureRequestsCount ?? 0,
    },
    {
      key: "pendingExtensions",
      label: t("portal.dashboard.pendingExtensions"),
      value: data?.pendingExtensionRequestsCount ?? 0,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {t("portal.dashboard.welcome", { name: session?.customer.firstName ?? "" })}
      </h1>

      <DashboardGrid>
        {stats.map((stat) => (
          <DashboardMetric
            key={stat.key}
            label={stat.label}
            value={stat.value}
            isLoading={isLoading}
            isError={isError}
          />
        ))}
      </DashboardGrid>

      <DashboardCard
        title={t("portal.dashboard.recentRentals")}
        viewAllHref="/portal/rentals"
        viewAllLabel={t("portal.dashboard.viewAll")}
      >
        <RecentActivity
          items={data?.recentRentals ?? []}
          getRowId={(rental) => rental.id}
          renderRow={(rental) => (
            <Link
              href={`/portal/rentals/${rental.id}`}
              className="flex flex-col gap-1 text-sm hover:underline"
            >
              <span className="flex items-center justify-between">
                <span className="font-medium">{rental.rentalNumber}</span>
                <span className="text-muted-foreground">
                  {t(`portal.rentals.statuses.${rental.status}`)}
                </span>
              </span>
              <span className="text-muted-foreground flex items-center justify-between text-xs">
                <span>
                  {formatDate(rental.plannedStart, i18n.language)} –{" "}
                  {formatDate(rental.plannedEnd, i18n.language)}
                </span>
                <span>{formatMoney(rental.totalMinor, rental.currency)}</span>
              </span>
            </Link>
          )}
          isLoading={isLoading}
          isError={isError}
          emptyMessage={t("portal.dashboard.noRentals")}
          errorMessage={t("common.error")}
          onRetry={() => void refetch()}
          retryLabel={t("common.table.retry")}
          loadingLabel={t("common.loading")}
        />
      </DashboardCard>
    </div>
  );
}
