import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "../../src/components/auth/login-form";
import { ApiError } from "../../src/lib/api-client";
import { renderWithProviders } from "../test-utils";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const useLoginMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useLogin: () => useLoginMock(),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useLoginMock.mockReset();
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
    await user.type(screen.getByLabelText(/password/i), "whatever");
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
    await user.type(screen.getByLabelText(/password/i), "WrongPassword1");
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
    await user.type(screen.getByLabelText(/password/i), "SuperSecret123");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/app"));
  });
});
