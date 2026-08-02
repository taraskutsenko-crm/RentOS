import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PortalNotificationsPage from "../../src/app/portal/(shell)/notifications/page";
import { renderWithProviders } from "../test-utils";

const usePortalNotificationsMock = vi.fn();
const useMarkPortalNotificationReadMock = vi.fn();
const useMarkAllPortalNotificationsReadMock = vi.fn();
vi.mock("../../src/hooks/use-portal-notifications", () => ({
  usePortalNotifications: (...args: unknown[]) => usePortalNotificationsMock(...args),
  useMarkPortalNotificationRead: () => useMarkPortalNotificationReadMock(),
  useMarkAllPortalNotificationsRead: () => useMarkAllPortalNotificationsReadMock(),
}));

function notification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "n1",
    type: "MESSAGE",
    title: "New message",
    body: "You have a new message",
    link: null,
    readAt: null,
    createdAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("PortalNotificationsPage", () => {
  it("shows an empty state when there are no notifications", () => {
    usePortalNotificationsMock.mockReturnValue({ data: [], isLoading: false });
    useMarkPortalNotificationReadMock.mockReturnValue({ mutateAsync: vi.fn() });
    useMarkAllPortalNotificationsReadMock.mockReturnValue({ mutateAsync: vi.fn() });

    renderWithProviders(<PortalNotificationsPage />);

    expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument();
  });

  it("marks a single notification read", async () => {
    usePortalNotificationsMock.mockReturnValue({ data: [notification()], isLoading: false });
    const markRead = vi.fn();
    useMarkPortalNotificationReadMock.mockReturnValue({ mutateAsync: markRead });
    useMarkAllPortalNotificationsReadMock.mockReturnValue({ mutateAsync: vi.fn() });
    const user = userEvent.setup();

    renderWithProviders(<PortalNotificationsPage />);
    await user.click(screen.getByRole("button", { name: "✓" }));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("n1"));
  });

  it("shows mark-all-read only when there are unread notifications", () => {
    usePortalNotificationsMock.mockReturnValue({
      data: [notification({ readAt: "2026-08-01T00:00:00Z" })],
      isLoading: false,
    });
    useMarkPortalNotificationReadMock.mockReturnValue({ mutateAsync: vi.fn() });
    useMarkAllPortalNotificationsReadMock.mockReturnValue({ mutateAsync: vi.fn() });

    renderWithProviders(<PortalNotificationsPage />);

    expect(screen.queryByRole("button", { name: /mark all as read/i })).not.toBeInTheDocument();
  });
});
