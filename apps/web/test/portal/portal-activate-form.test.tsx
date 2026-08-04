import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PortalActivateForm } from "../../src/components/portal/portal-activate-form";
import { renderWithProviders } from "../test-utils";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const usePortalActivateInvitationMock = vi.fn();
vi.mock("../../src/hooks/use-portal-auth", () => ({
  usePortalActivateInvitation: () => usePortalActivateInvitationMock(),
}));

describe("PortalActivateForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    usePortalActivateInvitationMock.mockReset();
  });

  it("shows a validation error for a too-short password without calling the API", async () => {
    const mutateAsyncMock = vi.fn();
    usePortalActivateInvitationMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<PortalActivateForm token="tok" />);

    await user.type(screen.getByLabelText(/^password$/i), "short");
    await user.click(screen.getByRole("button", { name: /activate account/i }));

    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("shows the invalid-token alert when activation fails", async () => {
    usePortalActivateInvitationMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("invalid")),
      isPending: false,
      isError: true,
      error: new Error("invalid"),
    });

    renderWithProviders(<PortalActivateForm token="tok" />);

    expect(screen.getByText(/invalid or expired invitation/i)).toBeInTheDocument();
  });

  it("shows the welcome success state and redirects after activation succeeds", async () => {
    const mutateAsyncMock = vi.fn().mockResolvedValue({
      customer: {},
      tenant: { id: "t1", name: "Acme Rentals" },
    });
    usePortalActivateInvitationMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<PortalActivateForm token="tok" />);

    await user.type(screen.getByLabelText(/^password$/i), "SuperSecret123");
    await user.click(screen.getByRole("button", { name: /activate account/i }));

    expect(await screen.findByText(/welcome to acme rentals/i)).toBeInTheDocument();
    expect(mutateAsyncMock).toHaveBeenCalledWith({ token: "tok", password: "SuperSecret123" });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/dashboard"), {
      timeout: 2000,
    });
  });
});
