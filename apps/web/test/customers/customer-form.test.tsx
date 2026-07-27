import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CustomerForm } from "../../src/components/customers/customer-form";
import { renderWithProviders } from "../test-utils";

describe("CustomerForm", () => {
  it("shows validation errors for missing required fields and an invalid email", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <CustomerForm
        onSubmit={onSubmit}
        isPending={false}
        submitLabel="Save"
        submittingLabel="Saving…"
      />,
    );

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findAllByText(/this field is required/i)).toHaveLength(2);
    expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits with entered values, including empty optional fields", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(
      <CustomerForm
        onSubmit={onSubmit}
        isPending={false}
        submitLabel="Save"
        submittingLabel="Saving…"
      />,
    );

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Smith");
    await user.type(screen.getByLabelText(/^email$/i), "jane@acme.com");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submittedValues = onSubmit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(submittedValues).toMatchObject({
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@acme.com",
      company: "",
      status: "ACTIVE",
    });
  });

  it("pre-fills fields from initialValues (edit mode)", () => {
    renderWithProviders(
      <CustomerForm
        initialValues={{ firstName: "Existing", lastName: "Customer", status: "INACTIVE" }}
        onSubmit={vi.fn()}
        isPending={false}
        submitLabel="Save"
        submittingLabel="Saving…"
      />,
    );

    expect(screen.getByLabelText(/first name/i)).toHaveValue("Existing");
    expect(screen.getByLabelText(/last name/i)).toHaveValue("Customer");
    expect(screen.getByLabelText(/status/i)).toHaveValue("INACTIVE");
  });

  it("shows the submitting label and disables the button while pending", () => {
    renderWithProviders(
      <CustomerForm onSubmit={vi.fn()} isPending submitLabel="Save" submittingLabel="Saving…" />,
    );

    const button = screen.getByRole("button", { name: /saving…/i });
    expect(button).toBeDisabled();
  });
});
