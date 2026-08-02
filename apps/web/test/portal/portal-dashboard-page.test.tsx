import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PortalDashboardPage from "../../src/app/portal/(shell)/dashboard/page";
import { renderWithProviders } from "../test-utils";

const usePortalDashboardMock = vi.fn();
vi.mock("../../src/hooks/use-portal-dashboard", () => ({
  usePortalDashboard: () => usePortalDashboardMock(),
}));

const usePortalMeMock = vi.fn();
vi.mock("../../src/hooks/use-portal-auth", () => ({
  usePortalMe: () => usePortalMeMock(),
}));

describe("PortalDashboardPage", () => {
  it("shows a loading state while the summary is being fetched", () => {
    usePortalMeMock.mockReturnValue({ data: undefined });
    usePortalDashboardMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderWithProviders(<PortalDashboardPage />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders the welcome message and summary counts", () => {
    usePortalMeMock.mockReturnValue({ data: { customer: { firstName: "Jane" } } });
    usePortalDashboardMock.mockReturnValue({
      data: {
        currentRentalsCount: 2,
        upcomingRentalsCount: 1,
        recentRentals: [],
        unreadMessagesCount: 4,
        unreadNotificationsCount: 0,
        pendingSignatureRequestsCount: 1,
        pendingExtensionRequestsCount: 0,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PortalDashboardPage />);

    expect(screen.getByText(/jane/i)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders recent rentals in the table", () => {
    usePortalMeMock.mockReturnValue({ data: { customer: { firstName: "Jane" } } });
    usePortalDashboardMock.mockReturnValue({
      data: {
        currentRentalsCount: 1,
        upcomingRentalsCount: 0,
        recentRentals: [
          {
            id: "rental-1",
            rentalNumber: "RNT-000001",
            status: "ACTIVE",
            plannedStart: "2026-08-01T00:00:00Z",
            plannedEnd: "2026-08-04T00:00:00Z",
            currency: "USD",
            totalMinor: 3000,
          },
        ],
        unreadMessagesCount: 0,
        unreadNotificationsCount: 0,
        pendingSignatureRequestsCount: 0,
        pendingExtensionRequestsCount: 0,
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<PortalDashboardPage />);

    expect(screen.getByText("RNT-000001")).toBeInTheDocument();
  });
});
