import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "../../src/components/auth/login-form";
import { ApiError } from "../../src/lib/api-client";
import { renderWithProviders } from "../test-utils";

const pushMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const useLoginMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useLogin: () => useLoginMock(),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useLoginMock.mockReset();
    searchParams = new URLSearchParams();
  });

  it("shows a validation error for an empty/invalid email without calling the API", async () => {
    const mutateAsyncMock = vi.fn();
    useLoginMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/^password$/i), "whatever");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("displays a translated error message when the API rejects invalid credentials", async () => {
    const mutateAsyncMock = vi
      .fn()
      .mockRejectedValue(new ApiError("Invalid email or password", 401));
    useLoginMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: true,
      error: new ApiError("Invalid email or password", 401),
    });

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "WrongPassword1");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("submits valid credentials and navigates to /app on success", async () => {
    const mutateAsyncMock = vi.fn().mockResolvedValue({ user: {} });
    useLoginMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "SuperSecret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/app"));
  });

  // Task F1/F2 — a real session expiry never leaks the backend's raw
  // "Authentication required" text; the global 401 handler (see
  // query-provider.tsx) sends the user here with these query params
  // instead, and this friendly banner is what they actually see.
  it("shows a friendly session-expired banner (never raw backend text) when redirected here after a 401", () => {
    searchParams = new URLSearchParams({ reason: "session_expired", returnTo: "/app/rentals/r1" });
    useLoginMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });

    renderWithProviders(<LoginForm />);

    expect(
      screen.getByText("Your session has expired. Please sign in again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/authentication required/i)).not.toBeInTheDocument();
  });

  it("does not show the session-expired banner on an ordinary visit to /login", () => {
    useLoginMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });

    renderWithProviders(<LoginForm />);

    expect(
      screen.queryByText("Your session has expired. Please sign in again."),
    ).not.toBeInTheDocument();
  });

  it("redirects to the preserved returnTo path after a successful login following a session expiry", async () => {
    searchParams = new URLSearchParams({ reason: "session_expired", returnTo: "/app/rentals/r1" });
    const mutateAsyncMock = vi.fn().mockResolvedValue({ user: {} });
    useLoginMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "SuperSecret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/app/rentals/r1"));
  });

  it("falls back to the middleware's ?from= param when ?returnTo= is absent (proxy.ts's own cookie-presence redirect)", async () => {
    searchParams = new URLSearchParams({ from: "/app/assets/a1" });
    const mutateAsyncMock = vi.fn().mockResolvedValue({ user: {} });
    useLoginMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "SuperSecret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/app/assets/a1"));
  });

  it("never trusts an absolute/external returnTo (open-redirect protection) — falls back to /app", async () => {
    searchParams = new URLSearchParams({ returnTo: "https://evil.example/phish" });
    const mutateAsyncMock = vi.fn().mockResolvedValue({ user: {} });
    useLoginMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "SuperSecret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/app"));
  });

  it("toggles password visibility without changing the submitted value", async () => {
    useLoginMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});
