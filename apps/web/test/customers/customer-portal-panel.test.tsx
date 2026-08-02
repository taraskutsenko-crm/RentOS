import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerPortalPanel } from "../../src/components/customers/customer-portal-panel";
import { renderWithProviders } from "../test-utils";

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
}));

const usePortalAccessStatusMock = vi.fn();
const useInviteCustomerToPortalMock = vi.fn();
const useRevokeCustomerPortalAccessMock = vi.fn();
const useStaffExtensionRequestsMock = vi.fn();
const useRespondToExtensionRequestMock = vi.fn();
const useStaffDamageReportsMock = vi.fn();
const useReviewDamageReportMock = vi.fn();
const useConvertDamageReportToDocumentMock = vi.fn();
const useStaffPortalMessagesMock = vi.fn();
const useSendStaffPortalMessageMock = vi.fn();
vi.mock("../../src/hooks/use-customer-portal", () => ({
  usePortalAccessStatus: (...args: unknown[]) => usePortalAccessStatusMock(...args),
  useInviteCustomerToPortal: () => useInviteCustomerToPortalMock(),
  useRevokeCustomerPortalAccess: () => useRevokeCustomerPortalAccessMock(),
  useStaffExtensionRequests: (...args: unknown[]) => useStaffExtensionRequestsMock(...args),
  useRespondToExtensionRequest: () => useRespondToExtensionRequestMock(),
  useStaffDamageReports: (...args: unknown[]) => useStaffDamageReportsMock(...args),
  useReviewDamageReport: () => useReviewDamageReportMock(),
  useConvertDamageReportToDocument: () => useConvertDamageReportToDocumentMock(),
  useStaffPortalMessages: (...args: unknown[]) => useStaffPortalMessagesMock(...args),
  useSendStaffPortalMessage: () => useSendStaffPortalMessageMock(),
  staffDamageReportPhotoUrl: (tenantId: string, reportId: string, photoId: string) =>
    `http://api.test/tenants/${tenantId}/damage-reports/${reportId}/photos/${photoId}`,
}));

describe("CustomerPortalPanel", () => {
  beforeEach(() => {
    useStaffExtensionRequestsMock.mockReturnValue({ data: [] });
    useStaffDamageReportsMock.mockReturnValue({ data: [] });
    useStaffPortalMessagesMock.mockReturnValue({ data: [] });
    useRespondToExtensionRequestMock.mockReturnValue({ mutateAsync: vi.fn() });
    useReviewDamageReportMock.mockReturnValue({ mutateAsync: vi.fn() });
    useConvertDamageReportToDocumentMock.mockReturnValue({ mutateAsync: vi.fn() });
    useSendStaffPortalMessageMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useInviteCustomerToPortalMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useRevokeCustomerPortalAccessMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("renders nothing when the user lacks customers.portal.manage", () => {
    usePermissionMock.mockReturnValue(false);
    usePortalAccessStatusMock.mockReturnValue({ data: undefined, isLoading: false });

    const { container } = renderWithProviders(
      <CustomerPortalPanel tenantId="tenant-1" customerId="customer-1" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the invite action for a customer who has never been invited", () => {
    usePermissionMock.mockReturnValue(true);
    usePortalAccessStatusMock.mockReturnValue({
      data: {
        invited: false,
        activated: false,
        invitedAt: null,
        activatedAt: null,
        lastLoginAt: null,
        invitationExpired: null,
      },
      isLoading: false,
    });

    renderWithProviders(<CustomerPortalPanel tenantId="tenant-1" customerId="customer-1" />);

    expect(screen.getByRole("button", { name: /invite to portal/i })).toBeInTheDocument();
  });

  it("calls the invite mutation and shows the generated link", async () => {
    usePermissionMock.mockReturnValue(true);
    usePortalAccessStatusMock.mockReturnValue({
      data: {
        invited: false,
        activated: false,
        invitedAt: null,
        activatedAt: null,
        lastLoginAt: null,
        invitationExpired: null,
      },
      isLoading: false,
    });
    const mutateAsync = vi.fn().mockResolvedValue({
      invited: true,
      email: "jane@example.com",
      expiresAt: "2026-08-15T00:00:00Z",
      emailSent: true,
      inviteLink: "http://app.test/portal/invite/abc123",
    });
    useInviteCustomerToPortalMock.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<CustomerPortalPanel tenantId="tenant-1" customerId="customer-1" />);
    await user.click(screen.getByRole("button", { name: /invite to portal/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ customerId: "customer-1" }));
    expect(await screen.findByText(/abc123/)).toBeInTheDocument();
  });

  it("shows the revoke action once a customer is activated", () => {
    usePermissionMock.mockReturnValue(true);
    usePortalAccessStatusMock.mockReturnValue({
      data: {
        invited: true,
        activated: true,
        invitedAt: "2026-07-01T00:00:00Z",
        activatedAt: "2026-07-02T00:00:00Z",
        lastLoginAt: null,
        invitationExpired: false,
      },
      isLoading: false,
    });

    renderWithProviders(<CustomerPortalPanel tenantId="tenant-1" customerId="customer-1" />);

    expect(screen.getByRole("button", { name: /revoke access/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /invite to portal/i })).not.toBeInTheDocument();
  });

  it("shows pending extension requests scoped to this customer with approve/decline actions", () => {
    usePermissionMock.mockReturnValue(true);
    usePortalAccessStatusMock.mockReturnValue({ data: undefined, isLoading: false });
    useStaffExtensionRequestsMock.mockReturnValue({
      data: [
        {
          id: "ext-1",
          customerId: "customer-1",
          status: "PENDING",
          requestedEnd: "2026-08-20T00:00:00Z",
          message: null,
          customer: { id: "customer-1", firstName: "Jane", lastName: "Doe", company: null },
        },
        {
          id: "ext-2",
          customerId: "customer-other",
          status: "PENDING",
          requestedEnd: "2026-08-25T00:00:00Z",
          message: null,
          customer: { id: "customer-other", firstName: "Other", lastName: "Person", company: null },
        },
      ],
    });

    renderWithProviders(<CustomerPortalPanel tenantId="tenant-1" customerId="customer-1" />);

    expect(screen.getAllByRole("button", { name: /approve/i })).toHaveLength(1);
  });
});
