"use client";

import { useAssetStatuses } from "./use-asset-statuses";
import { useAssets } from "./use-assets";
import { useCustomers } from "./use-customers";
import { useStaffDamageReports, useStaffExtensionRequests } from "./use-customer-portal";
import { useDocuments } from "./use-documents";
import { useQuotes } from "./use-quotes";
import { useRentals } from "./use-rentals";

export interface DashboardStatResult {
  value: number;
  isLoading: boolean;
  isError: boolean;
}

export interface DashboardPermissions {
  canViewRentals: boolean;
  canViewAssets: boolean;
  canViewQuotes: boolean;
  canViewDocuments: boolean;
  canManagePortal: boolean;
}

/**
 * Composes existing staff list-endpoint hooks into one aggregated KPI
 * object — the frontend equivalent of the "pageSize:1, read `.total`"
 * technique, since no staff-side dashboard aggregation endpoint exists.
 * See docs/UI_REDESIGN_PLAN.md Chapter 4, design decision 11.
 */
export function useDashboardStats(tenantId: string | null, permissions: DashboardPermissions) {
  const customersQuery = useCustomers(tenantId, { pageSize: 1 });
  const totalCustomers: DashboardStatResult = {
    value: customersQuery.data?.total ?? 0,
    isLoading: customersQuery.isLoading,
    isError: customersQuery.isError,
  };

  const activeRentalsQuery = useRentals(permissions.canViewRentals ? tenantId : null, {
    pageSize: 1,
    status: "ACTIVE",
  });
  const activeRentals: DashboardStatResult = {
    value: activeRentalsQuery.data?.total ?? 0,
    isLoading: permissions.canViewRentals && activeRentalsQuery.isLoading,
    isError: permissions.canViewRentals && activeRentalsQuery.isError,
  };

  const assetStatusesQuery = useAssetStatuses(permissions.canViewAssets ? tenantId : null);
  const availableStatusId =
    assetStatusesQuery.data?.find((status) => status.code === "AVAILABLE")?.id ?? null;
  const availableAssetsQuery = useAssets(
    permissions.canViewAssets && availableStatusId ? tenantId : null,
    { pageSize: 1, statusId: availableStatusId ?? undefined },
  );
  const availableAssets: DashboardStatResult = {
    value: availableAssetsQuery.data?.total ?? 0,
    isLoading:
      permissions.canViewAssets && (assetStatusesQuery.isLoading || availableAssetsQuery.isLoading),
    isError:
      permissions.canViewAssets && (assetStatusesQuery.isError || availableAssetsQuery.isError),
  };

  const sentQuotesQuery = useQuotes(permissions.canViewQuotes ? tenantId : null, {
    pageSize: 1,
    status: "SENT",
  });
  const viewedQuotesQuery = useQuotes(permissions.canViewQuotes ? tenantId : null, {
    pageSize: 1,
    status: "VIEWED",
  });
  const pendingQuotes: DashboardStatResult = {
    value: (sentQuotesQuery.data?.total ?? 0) + (viewedQuotesQuery.data?.total ?? 0),
    isLoading:
      permissions.canViewQuotes && (sentQuotesQuery.isLoading || viewedQuotesQuery.isLoading),
    isError: permissions.canViewQuotes && (sentQuotesQuery.isError || viewedQuotesQuery.isError),
  };

  const extensionRequestsQuery = useStaffExtensionRequests(
    permissions.canManagePortal ? tenantId : null,
  );
  const damageReportsQuery = useStaffDamageReports(permissions.canManagePortal ? tenantId : null);
  const needsAttention: DashboardStatResult = {
    value:
      (extensionRequestsQuery.data?.filter((request) => request.status === "PENDING").length ?? 0) +
      (damageReportsQuery.data?.filter((report) => report.status === "SUBMITTED").length ?? 0),
    isLoading:
      permissions.canManagePortal &&
      (extensionRequestsQuery.isLoading || damageReportsQuery.isLoading),
    isError:
      permissions.canManagePortal && (extensionRequestsQuery.isError || damageReportsQuery.isError),
  };

  const recentRentalsQuery = useRentals(permissions.canViewRentals ? tenantId : null, {
    pageSize: 5,
  });
  const recentDocumentsQuery = useDocuments(permissions.canViewDocuments ? tenantId : null, {
    pageSize: 5,
  });

  return {
    totalCustomers,
    activeRentals,
    availableAssets,
    pendingQuotes,
    needsAttention,
    recentRentals: {
      items: recentRentalsQuery.data?.items ?? [],
      isLoading: permissions.canViewRentals && recentRentalsQuery.isLoading,
      isError: permissions.canViewRentals && recentRentalsQuery.isError,
      refetch: recentRentalsQuery.refetch,
    },
    recentDocuments: {
      items: recentDocumentsQuery.data?.items ?? [],
      isLoading: permissions.canViewDocuments && recentDocumentsQuery.isLoading,
      isError: permissions.canViewDocuments && recentDocumentsQuery.isError,
      refetch: recentDocumentsQuery.refetch,
    },
  };
}
