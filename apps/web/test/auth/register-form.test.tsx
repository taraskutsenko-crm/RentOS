import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterForm } from "../../src/components/auth/register-form";
import { renderWithProviders } from "../test-utils";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

const useRegisterMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useRegister: () => useRegisterMock(),
}));

describe("RegisterForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    useRegisterMock.mockReset();
  });

  it("shows validation errors for invalid email, weak password, and mismatched confirmation", async () => {
    const mutateAsyncMock = vi.fn();
    useRegisterMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText(/first name/i), "A");
    await user.type(screen.getByLabelText(/last name/i), "B");
    await user.type(screen.getByLabelText(/^email$/i), "not-an-email");
    await user.type(screen.getByLabelText(/^password$/i), "short");
    await user.type(screen.getByLabelText(/confirm password/i), "different");
    await user.type(screen.getByLabelText(/company name/i), "Co");

    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it("submits valid data (without passwordConfirmation) and navigates to /app", async () => {
    const mutateAsyncMock = vi.fn().mockResolvedValue({ user: {}, tenant: {} });
    useRegisterMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    await user.type(screen.getByLabelText(/first name/i), "Ada");
    await user.type(screen.getByLabelText(/last name/i), "Lovelace");
    await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "SuperSecret123");
    await user.type(screen.getByLabelText(/confirm password/i), "SuperSecret123");
    await user.type(screen.getByLabelText(/company name/i), "Acme Rentals");

    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalledWith("/app");

    const submittedPayload = mutateAsyncMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(submittedPayload).not.toHaveProperty("passwordConfirmation");
    expect(submittedPayload.email).toBe("ada@example.com");
  });

  it("toggles visibility independently for the password and confirmation fields", async () => {
    useRegisterMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);

    const passwordInput = screen.getByLabelText(/^password$/i);
    const confirmationInput = screen.getByLabelText(/confirm password/i);
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(confirmationInput).toHaveAttribute("type", "password");

    const toggles = screen.getAllByRole("button", { name: /show password/i });
    expect(toggles).toHaveLength(2);
    const [showPassword, showConfirmation] = toggles as [HTMLElement, HTMLElement];
    await user.click(showPassword);
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(confirmationInput).toHaveAttribute("type", "password");

    await user.click(showConfirmation);
    expect(confirmationInput).toHaveAttribute("type", "text");
  });
});
