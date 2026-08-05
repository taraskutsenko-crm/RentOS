"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../components/shell/page-header";
import {
  DashboardCard,
  DashboardGrid,
  DashboardMetric,
  DashboardSection,
  QuickActions,
  RecentActivity,
  type QuickAction,
} from "../../components/dashboard";
import { useMe } from "../../hooks/use-auth";
import { useCurrentTenantId } from "../../hooks/use-current-tenant";
import { usePermission } from "../../hooks/use-current-tenant-role";
import { useDashboardStats } from "../../hooks/use-dashboard-stats";
import { QUICK_ACTION_DEFINITIONS } from "../../lib/quick-actions";

export default function AppHomePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const [tenantId] = useCurrentTenantId();

  const canViewRentals = usePermission("rentals.view");
  const canViewAssets = usePermission("assets.read");
  const canViewQuotes = usePermission("quotes.view");
  const canViewDocuments = usePermission("documents.view");
  const canManagePortal = usePermission("customers.portal.manage");
  const canCreateAsset = usePermission("assets.create");
  const canCreateRental = usePermission("rentals.create");
  const canCreateQuote = usePermission("quotes.create");
  const canCreateDocument = usePermission("documents.create");

  const stats = useDashboardStats(tenantId, {
    canViewRentals,
    canViewAssets,
    canViewQuotes,
    canViewDocuments,
    canManagePortal,
  });

  const permissionByKey: Record<string, boolean> = {
    customer: true,
    asset: canCreateAsset,
    rental: canCreateRental,
    quote: canCreateQuote,
    document: canCreateDocument,
  };

  const quickActions: QuickAction[] = QUICK_ACTION_DEFINITIONS.map((item) => ({
    key: item.id,
    label: t(item.labelKey),
    href: item.href,
    icon: <item.icon className="size-4" aria-hidden="true" />,
    visible: permissionByKey[item.id] ?? false,
  }));

  const hasQuickActions = quickActions.some((action) => action.visible !== false);
  const hasRecentActivity = canViewRentals || canViewDocuments;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("app.nav.dashboard")}
        subtitle={me ? t("dashboard.welcome", { name: me.user.firstName }) : undefined}
      />

      <DashboardSection title={t("dashboard.sections.overview")}>
        <DashboardGrid>
          <DashboardMetric
            label={t("dashboard.metrics.customers")}
            value={stats.totalCustomers.value}
            isLoading={stats.totalCustomers.isLoading}
            isError={stats.totalCustomers.isError}
            href="/app/customers"
          />
          {canViewRentals && (
            <DashboardMetric
              label={t("dashboard.metrics.activeRentals")}
              value={stats.activeRentals.value}
              isLoading={stats.activeRentals.isLoading}
              isError={stats.activeRentals.isError}
              href="/app/rentals"
            />
          )}
          {canViewAssets && (
            <DashboardMetric
              label={t("dashboard.metrics.availableAssets")}
              value={stats.availableAssets.value}
              isLoading={stats.availableAssets.isLoading}
              isError={stats.availableAssets.isError}
              href="/app/assets"
            />
          )}
          {canViewQuotes && (
            <DashboardMetric
              label={t("dashboard.metrics.pendingQuotes")}
              value={stats.pendingQuotes.value}
              isLoading={stats.pendingQuotes.isLoading}
              isError={stats.pendingQuotes.isError}
              href="/app/quotes"
            />
          )}
          {canManagePortal && (
            <DashboardMetric
              label={t("dashboard.metrics.needsAttention")}
              value={stats.needsAttention.value}
              isLoading={stats.needsAttention.isLoading}
              isError={stats.needsAttention.isError}
            />
          )}
        </DashboardGrid>
      </DashboardSection>

      {hasQuickActions && (
        <DashboardSection title={t("dashboard.sections.quickActions")}>
          <QuickActions actions={quickActions} />
        </DashboardSection>
      )}

      {hasRecentActivity && (
        <DashboardSection title={t("dashboard.sections.recentActivity")}>
          <div className="grid gap-4 lg:grid-cols-2">
            {canViewRentals && (
              <DashboardCard
                title={t("dashboard.recentRentals")}
                viewAllHref="/app/rentals"
                viewAllLabel={t("dashboard.viewAll")}
              >
                <RecentActivity
                  items={stats.recentRentals.items}
                  getRowId={(rental) => rental.id}
                  renderRow={(rental) => (
                    <Link
                      href={`/app/rentals/${rental.id}`}
                      className="flex items-center justify-between gap-4 text-sm hover:underline"
                    >
                      <span>
                        <span className="font-medium">{rental.rentalNumber}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {rental.customer.firstName} {rental.customer.lastName}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        {t(`rental.statuses.${rental.status}`)}
                      </span>
                    </Link>
                  )}
                  isLoading={stats.recentRentals.isLoading}
                  isError={stats.recentRentals.isError}
                  emptyMessage={t("dashboard.emptyRecentRentals")}
                  errorMessage={t("common.error")}
                  onRetry={() => void stats.recentRentals.refetch()}
                  retryLabel={t("common.table.retry")}
                  loadingLabel={t("common.loading")}
                />
              </DashboardCard>
            )}
            {canViewDocuments && (
              <DashboardCard
                title={t("dashboard.recentDocuments")}
                viewAllHref="/app/documents"
                viewAllLabel={t("dashboard.viewAll")}
              >
                <RecentActivity
                  items={stats.recentDocuments.items}
                  getRowId={(document) => document.id}
                  renderRow={(document) => (
                    <Link
                      href={`/app/documents/${document.id}`}
                      className="flex items-center justify-between gap-4 text-sm hover:underline"
                    >
                      <span>
                        <span className="font-medium">{document.documentNumber}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {t(`document.types.${document.documentType}`)}
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        {t(`document.statuses.${document.status}`)}
                      </span>
                    </Link>
                  )}
                  isLoading={stats.recentDocuments.isLoading}
                  isError={stats.recentDocuments.isError}
                  emptyMessage={t("dashboard.emptyRecentDocuments")}
                  errorMessage={t("common.error")}
                  onRetry={() => void stats.recentDocuments.refetch()}
                  retryLabel={t("common.table.retry")}
                  loadingLabel={t("common.loading")}
                />
              </DashboardCard>
            )}
          </div>
        </DashboardSection>
      )}
    </div>
  );
}
