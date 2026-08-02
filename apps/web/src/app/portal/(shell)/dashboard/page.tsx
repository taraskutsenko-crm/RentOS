"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@rentos/ui";
import Link from "next/link";
import { useTranslation } from "react-i18next";

import { usePortalDashboard } from "../../../../hooks/use-portal-dashboard";
import { usePortalMe } from "../../../../hooks/use-portal-auth";
import { formatMoney } from "../../../../lib/money";

export default function PortalDashboardPage() {
  const { t } = useTranslation();
  const { data: session } = usePortalMe();
  const { data, isLoading, isError } = usePortalDashboard();

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">{t("common.loading")}</p>;
  }

  if (isError || !data) {
    return <p className="text-destructive text-sm">{t("common.error")}</p>;
  }

  const stats = [
    { label: t("portal.dashboard.currentRentals"), value: data.currentRentalsCount },
    { label: t("portal.dashboard.upcomingRentals"), value: data.upcomingRentalsCount },
    { label: t("portal.dashboard.unreadMessages"), value: data.unreadMessagesCount },
    { label: t("portal.dashboard.pendingSignatures"), value: data.pendingSignatureRequestsCount },
    { label: t("portal.dashboard.pendingExtensions"), value: data.pendingExtensionRequestsCount },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {t("portal.dashboard.welcome", { name: session?.customer.firstName ?? "" })}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold">{stat.value}</p>
              <p className="text-muted-foreground text-xs">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t("portal.dashboard.recentRentals")}</CardTitle>
          <Link
            href="/portal/rentals"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {t("portal.dashboard.viewAll")}
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {data.recentRentals.length === 0 && (
            <p className="text-muted-foreground p-6 text-sm">{t("portal.dashboard.noRentals")}</p>
          )}
          {data.recentRentals.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3 font-medium">{t("rental.fields.rentalNumber")}</th>
                  <th className="p-3 font-medium">{t("rental.fields.status")}</th>
                  <th className="p-3 font-medium">{t("rental.fields.plannedStart")}</th>
                  <th className="p-3 font-medium">{t("rental.fields.plannedEnd")}</th>
                  <th className="p-3 font-medium">{t("rental.fields.total")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.recentRentals.map((rental) => (
                  <tr key={rental.id} className="border-b last:border-0">
                    <td className="p-3">{rental.rentalNumber}</td>
                    <td className="p-3">{t(`portal.rentals.statuses.${rental.status}`)}</td>
                    <td className="p-3">{new Date(rental.plannedStart).toLocaleDateString()}</td>
                    <td className="p-3">{new Date(rental.plannedEnd).toLocaleDateString()}</td>
                    <td className="p-3">{formatMoney(rental.totalMinor, rental.currency)}</td>
                    <td className="p-3 text-right">
                      <Link
                        href={`/portal/rentals/${rental.id}`}
                        className="text-primary text-sm underline-offset-4 hover:underline"
                      >
                        {t("asset.view")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
