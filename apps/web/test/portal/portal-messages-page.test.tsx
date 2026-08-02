import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalMessagesPage from "../../src/app/portal/(shell)/messages/page";
import { renderWithProviders } from "../test-utils";

const usePortalMessagesMock = vi.fn();
const useSendPortalMessageMock = vi.fn();
vi.mock("../../src/hooks/use-portal-messages", () => ({
  usePortalMessages: (...args: unknown[]) => usePortalMessagesMock(...args),
  useSendPortalMessage: () => useSendPortalMessageMock(),
}));

describe("PortalMessagesPage", () => {
  beforeEach(() => {
    useSendPortalMessageMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("shows an empty state when there are no messages", () => {
    usePortalMessagesMock.mockReturnValue({ data: [], isLoading: false });

    renderWithProviders(<PortalMessagesPage />);

    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("renders existing messages", () => {
    usePortalMessagesMock.mockReturnValue({
      data: [
        {
          id: "m1",
          senderType: "CUSTOMER",
          body: "Hi there",
          createdAt: "2026-08-01T00:00:00Z",
        },
        {
          id: "m2",
          senderType: "STAFF",
          body: "Hello, how can we help?",
          createdAt: "2026-08-01T01:00:00Z",
        },
      ],
      isLoading: false,
    });

    renderWithProviders(<PortalMessagesPage />);

    expect(screen.getByText("Hi there")).toBeInTheDocument();
    expect(screen.getByText("Hello, how can we help?")).toBeInTheDocument();
  });

  it("sends a message and clears the input", async () => {
    usePortalMessagesMock.mockReturnValue({ data: [], isLoading: false });
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    useSendPortalMessageMock.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();

    renderWithProviders(<PortalMessagesPage />);
    await user.type(screen.getByPlaceholderText(/write a message/i), "Need help please");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ body: "Need help please" }));
  });
});
