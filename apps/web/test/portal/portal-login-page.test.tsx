import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortalLoginPage from "../../src/app/portal/login/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const usePortalLoginMock = vi.fn();
vi.mock("../../src/hooks/use-portal-auth", () => ({
  usePortalLogin: () => usePortalLoginMock(),
}));

describe("PortalLoginPage", () => {
  beforeEach(() => {
    usePortalLoginMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false, isError: false });
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
