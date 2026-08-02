"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "../lib/api-client";
import type {
  CustomerPortalMessage,
  PortalAccessStatus,
  PortalInvitationResult,
  StaffRentalDamageReport,
  StaffRentalExtensionRequest,
} from "../types/portal";

const ACCESS_KEY = "customer-portal-access";

export function usePortalAccessStatus(tenantId: string | null, customerId: string | null) {
  return useQuery({
    queryKey: [ACCESS_KEY, tenantId, customerId],
    queryFn: () =>
      apiClient.get<PortalAccessStatus>(
        `/tenants/${tenantId}/customers/${customerId}/portal/status`,
      ),
    enabled: !!tenantId && !!customerId,
  });
}

export function useInviteCustomerToPortal(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, email }: { customerId: string; email?: string | undefined }) =>
      apiClient.post<PortalInvitationResult>(
        `/tenants/${tenantId}/customers/${customerId}/portal/invite`,
        { email },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [ACCESS_KEY, tenantId, variables.customerId],
      });
    },
  });
}

export function useRevokeCustomerPortalAccess(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) =>
      apiClient.post<{ revoked: true }>(
        `/tenants/${tenantId}/customers/${customerId}/portal/revoke`,
      ),
    onSuccess: (_data, customerId) => {
      void queryClient.invalidateQueries({ queryKey: [ACCESS_KEY, tenantId, customerId] });
    },
  });
}

// ---------------------------------------------------------------------
// Extension requests
// ---------------------------------------------------------------------

const EXTENSION_KEY = "staff-extension-requests";

export function useStaffExtensionRequests(tenantId: string | null, rentalId?: string) {
  return useQuery({
    queryKey: [EXTENSION_KEY, tenantId, rentalId],
    queryFn: () =>
      apiClient.get<StaffRentalExtensionRequest[]>(`/tenants/${tenantId}/extension-requests`, {
        rentalId,
      }),
    enabled: !!tenantId,
  });
}

export function useRespondToExtensionRequest(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      approve,
      responseMessage,
    }: {
      id: string;
      approve: boolean;
      responseMessage?: string | undefined;
    }) =>
      apiClient.post<StaffRentalExtensionRequest>(
        `/tenants/${tenantId}/extension-requests/${id}/respond`,
        { approve, responseMessage },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [EXTENSION_KEY, tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["rentals", tenantId] });
    },
  });
}

// ---------------------------------------------------------------------
// Damage reports
// ---------------------------------------------------------------------

const DAMAGE_KEY = "staff-damage-reports";

export function useStaffDamageReports(tenantId: string | null, rentalId?: string) {
  return useQuery({
    queryKey: [DAMAGE_KEY, tenantId, rentalId],
    queryFn: () =>
      apiClient.get<StaffRentalDamageReport[]>(`/tenants/${tenantId}/damage-reports`, {
        rentalId,
      }),
    enabled: !!tenantId,
  });
}

export function useReviewDamageReport(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "REVIEWED" | "RESOLVED" }) =>
      apiClient.post<StaffRentalDamageReport>(`/tenants/${tenantId}/damage-reports/${id}/review`, {
        status,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DAMAGE_KEY, tenantId] });
    },
  });
}

export function useConvertDamageReportToDocument(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<StaffRentalDamageReport>(`/tenants/${tenantId}/damage-reports/${id}/convert`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [DAMAGE_KEY, tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["documents", tenantId] });
    },
  });
}

export function staffDamageReportPhotoUrl(
  tenantId: string,
  reportId: string,
  photoId: string,
): string {
  return `${process.env.NEXT_PUBLIC_API_URL}/tenants/${tenantId}/damage-reports/${reportId}/photos/${photoId}`;
}

// ---------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------

const MESSAGES_KEY = "staff-portal-messages";

export function useStaffPortalMessages(
  tenantId: string | null,
  customerId: string | null,
  rentalId?: string,
) {
  return useQuery({
    queryKey: [MESSAGES_KEY, tenantId, customerId, rentalId],
    queryFn: () =>
      apiClient.get<CustomerPortalMessage[]>(
        `/tenants/${tenantId}/customers/${customerId}/portal/messages`,
        { rentalId },
      ),
    enabled: !!tenantId && !!customerId,
    refetchInterval: 15_000,
  });
}

export function useSendStaffPortalMessage(tenantId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      customerId,
      body,
      rentalId,
    }: {
      customerId: string;
      body: string;
      rentalId?: string | undefined;
    }) =>
      apiClient.post<CustomerPortalMessage>(
        `/tenants/${tenantId}/customers/${customerId}/portal/messages`,
        { body, rentalId },
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [MESSAGES_KEY, tenantId, variables.customerId],
      });
    },
  });
}
