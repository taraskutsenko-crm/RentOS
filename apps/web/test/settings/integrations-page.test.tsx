import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import IntegrationsSettingsPage from "../../src/app/app/settings/integrations/page";
import { renderWithProviders } from "../test-utils";

const useMeMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useMe: () => useMeMock(),
}));

const useCurrentTenantIdMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => useCurrentTenantIdMock(),
}));

const usePermissionMock = vi.fn();
const useCurrentTenantRoleMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (...args: unknown[]) => usePermissionMock(...args),
  useCurrentTenantRole: () => useCurrentTenantRoleMock(),
}));

const useEInvoiceConnectionMock = vi.fn();
const useConnectEInvoiceProviderMock = vi.fn();
const useDisconnectEInvoiceProviderMock = vi.fn();
vi.mock("../../src/hooks/use-einvoice-connections", () => ({
  useEInvoiceConnection: (...args: unknown[]) => useEInvoiceConnectionMock(...args),
  useConnectEInvoiceProvider: (...args: unknown[]) => useConnectEInvoiceProviderMock(...args),
  useDisconnectEInvoiceProvider: (...args: unknown[]) => useDisconnectEInvoiceProviderMock(...args),
}));

const useEmailStatusMock = vi.fn();
const sendTestEmailMutateAsync = vi.fn();
vi.mock("../../src/hooks/use-email-status", () => ({
  useEmailStatus: (...args: unknown[]) => useEmailStatusMock(...args),
  useSendTestEmail: () => ({ mutateAsync: sendTestEmailMutateAsync, isPending: false }),
}));

describe("IntegrationsSettingsPage — Email (Task B)", () => {
  beforeEach(() => {
    useMeMock.mockReturnValue({ data: { user: { email: "staff@example.test" } } });
    useCurrentTenantIdMock.mockReturnValue(["tenant-1", vi.fn()]);
    useCurrentTenantRoleMock.mockReturnValue({ data: { tenant: { countryCode: "US" } } });
    useEInvoiceConnectionMock.mockReturnValue({ data: undefined });
    useConnectEInvoiceProviderMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    useDisconnectEInvoiceProviderMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    sendTestEmailMutateAsync.mockReset();
  });

  it("shows 'Not configured' truthfully when no provider is bound", () => {
    usePermissionMock.mockReturnValue(true);
    useEmailStatusMock.mockReturnValue({ data: { status: "NOT_CONFIGURED" } });

    renderWithProviders(<IntegrationsSettingsPage />);

    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("shows 'Configured' (not 'Connected') when bound but not yet verified", () => {
    usePermissionMock.mockReturnValue(true);
    useEmailStatusMock.mockReturnValue({ data: { status: "CONFIGURED" } });

    renderWithProviders(<IntegrationsSettingsPage />);

    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("shows 'Connected' only after a real connectivity check succeeded (READY)", () => {
    usePermissionMock.mockReturnValue(true);
    useEmailStatusMock.mockReturnValue({ data: { status: "READY" } });

    renderWithProviders(<IntegrationsSettingsPage />);

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows 'Connection error' after a failed verification, and never fakes a raw internal error", () => {
    usePermissionMock.mockReturnValue(true);
    useEmailStatusMock.mockReturnValue({
      data: { status: "CONNECTION_TEST_FAILED", error: "Could not establish a connection to the SMTP server" },
    });

    renderWithProviders(<IntegrationsSettingsPage />);

    expect(screen.getByText("Connection error")).toBeInTheDocument();
    // The error text shown is the already-sanitized message the backend
    // returned — never something implying a raw stack trace/credential leak.
    expect(screen.queryByText(/password|ECONNREFUSED|auth failed for user/i)).not.toBeInTheDocument();
  });

  it("hides the Send test email action without integrations.manage, even when configured", () => {
    usePermissionMock.mockReturnValue(false);
    useEmailStatusMock.mockReturnValue({ data: { status: "READY" } });

    renderWithProviders(<IntegrationsSettingsPage />);

    expect(screen.queryByRole("button", { name: "Send test email" })).not.toBeInTheDocument();
  });

  it("hides the Send test email action when not configured, even with permission", () => {
    usePermissionMock.mockReturnValue(true);
    useEmailStatusMock.mockReturnValue({ data: { status: "NOT_CONFIGURED" } });

    renderWithProviders(<IntegrationsSettingsPage />);

    expect(screen.queryByRole("button", { name: "Send test email" })).not.toBeInTheDocument();
  });

  it("shows Send test email when configured and permitted, defaulting the recipient to the current user", async () => {
    usePermissionMock.mockReturnValue(true);
    useEmailStatusMock.mockReturnValue({ data: { status: "READY" } });
    const user = userEvent.setup();

    renderWithProviders(<IntegrationsSettingsPage />);
    await user.click(screen.getByRole("button", { name: "Send test email" }));

    expect(screen.getByLabelText("Recipient")).toHaveValue("staff@example.test");
  });

  it("shows visible success feedback after a real successful test send", async () => {
    usePermissionMock.mockReturnValue(true);
    useEmailStatusMock.mockReturnValue({ data: { status: "READY" } });
    sendTestEmailMutateAsync.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    renderWithProviders(<IntegrationsSettingsPage />);
    await user.click(screen.getByRole("button", { name: "Send test email" }));
    // Two "Send test email" buttons now exist (the card action + the
    // dialog's submit) — the dialog's is the last one rendered.
    const sendButtons = screen.getAllByRole("button", { name: "Send test email" });
    await user.click(sendButtons[sendButtons.length - 1]!);

    expect(
      await screen.findByText("Test email sent successfully to staff@example.test."),
    ).toBeInTheDocument();
    expect(sendTestEmailMutateAsync).toHaveBeenCalledWith("staff@example.test");
  });

  it("shows visible failure feedback (never a raw error) after a failed test send", async () => {
    usePermissionMock.mockReturnValue(true);
    useEmailStatusMock.mockReturnValue({ data: { status: "READY" } });
    sendTestEmailMutateAsync.mockResolvedValue({
      success: false,
      error: "The email provider rejected or failed to send this message",
    });
    const user = userEvent.setup();

    renderWithProviders(<IntegrationsSettingsPage />);
    await user.click(screen.getByRole("button", { name: "Send test email" }));
    const sendButtons = screen.getAllByRole("button", { name: "Send test email" });
    await user.click(sendButtons[sendButtons.length - 1]!);

    expect(
      await screen.findByText("The email provider rejected or failed to send this message"),
    ).toBeInTheDocument();
  });

  it("lets the user change the recipient before sending", async () => {
    usePermissionMock.mockReturnValue(true);
    useEmailStatusMock.mockReturnValue({ data: { status: "READY" } });
    sendTestEmailMutateAsync.mockResolvedValue({ success: true });
    const user = userEvent.setup();

    renderWithProviders(<IntegrationsSettingsPage />);
    await user.click(screen.getByRole("button", { name: "Send test email" }));
    const recipientInput = screen.getByLabelText("Recipient");
    await user.clear(recipientInput);
    await user.type(recipientInput, "someone-else@example.test");
    const sendButtons = screen.getAllByRole("button", { name: "Send test email" });
    await user.click(sendButtons[sendButtons.length - 1]!);

    await waitFor(() =>
      expect(sendTestEmailMutateAsync).toHaveBeenCalledWith("someone-else@example.test"),
    );
  });
});
