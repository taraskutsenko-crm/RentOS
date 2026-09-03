import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UserMenu } from "../../src/components/shell/user-menu";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const useMeMock = vi.fn();
vi.mock("../../src/hooks/use-auth", () => ({
  useMe: () => useMeMock(),
  useLogout: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  useCurrentTenantRole: () => ({ data: undefined }),
}));

vi.mock("../../src/hooks/use-dark-mode", () => ({
  useDarkMode: () => [false, vi.fn()],
}));

vi.mock("../../src/hooks/use-language-preference", () => ({
  useLanguagePreference: () => ({ language: "en", setLanguage: vi.fn() }),
}));

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    isPlatformAdmin: false,
    ...overrides,
  };
}

describe("UserMenu — Platform Admin link (Stage 17 closure pass)", () => {
  it("never shows a Platform Admin link for an ordinary user", async () => {
    useMeMock.mockReturnValue({ data: { user: baseUser() } });
    const user = userEvent.setup();

    renderWithProviders(<UserMenu />);
    await user.click(screen.getByLabelText("Account menu"));

    expect(screen.queryByRole("menuitem", { name: /Havelio Platform Admin/i })).not.toBeInTheDocument();
  });

  it("shows a Platform Admin link only for a real platform admin, linking to /platform-admin", async () => {
    useMeMock.mockReturnValue({ data: { user: baseUser({ isPlatformAdmin: true }) } });
    const user = userEvent.setup();

    renderWithProviders(<UserMenu />);
    await user.click(screen.getByLabelText("Account menu"));

    const link = screen.getByRole("menuitem", { name: /Havelio Platform Admin/i });
    expect(link).toHaveAttribute("href", "/platform-admin");
  });
});
