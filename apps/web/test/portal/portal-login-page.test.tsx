import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalLoginPage from "../../src/app/portal/login/page";
import { renderWithProviders } from "../test-utils";

const pushMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const usePortalLoginMock = vi.fn();
vi.mock("../../src/hooks/use-portal-auth", () => ({
  usePortalLogin: () => usePortalLoginMock(),
}));

describe("PortalLoginPage", () => {
  beforeEach(() => {
    usePortalLoginMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, isError: false });
    pushMock.mockReset();
    searchParams = new URLSearchParams();
  });

  // Task F1/F2 — same friendly-banner/preserved-returnTo behavior as the
  // staff LoginForm, for the customer portal's own session expiry.
  it("shows the friendly session-expired banner when redirected here after a portal 401", () => {
    searchParams = new URLSearchParams({ reason: "session_expired" });
    renderWithProviders(<PortalLoginPage />);

    expect(
      screen.getByText("Your session has expired. Please sign in again."),
    ).toBeInTheDocument();
  });

  it("redirects to the preserved returnTo path after a successful portal login", async () => {
    searchParams = new URLSearchParams({ returnTo: "/portal/rentals/r1" });
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    usePortalLoginMock.mockReturnValue({ mutateAsync, isPending: false, isError: false });
    const user = userEvent.setup();

    renderWithProviders(<PortalLoginPage />);
    await user.type(screen.getByLabelText(/company/i), "acme");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/portal/rentals/r1"));
  });

  it("renders the company, email, and password fields", () => {
    renderWithProviders(<PortalLoginPage />);

    expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("submits the login form with tenant slug, email, and password", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    usePortalLoginMock.mockReturnValue({ mutateAsync, isPending: false, isError: false });
    const user = userEvent.setup();

    renderWithProviders(<PortalLoginPage />);
    await user.type(screen.getByLabelText(/company/i), "acme");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "hunter2");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        tenantSlug: "acme",
        email: "jane@example.com",
        password: "hunter2",
      }),
    );
  });

  it("shows a fallback error message when login fails with a non-ApiError", async () => {
    // apiErrorMessage only surfaces a raw message for ApiError instances — a
    // generic Error (as here) falls back to the translated invalidCredentials copy.
    usePortalLoginMock.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error("Invalid email or password")),
      isPending: false,
      isError: true,
      error: new Error("Invalid email or password"),
    });
    const user = userEvent.setup();

    renderWithProviders(<PortalLoginPage />);
    await user.type(screen.getByLabelText(/company/i), "acme");
    await user.type(screen.getByLabelText(/^email$/i), "jane@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/invalid email, password, or company/i)).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PortalLoginPage />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");
  });
});
