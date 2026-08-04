import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Sidebar } from "../../src/components/shell/sidebar";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/quotes",
}));

const usePermissionMock = vi.fn();
vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  usePermission: (permission: string) => usePermissionMock(permission),
}));

/**
 * Regression coverage for docs/UI_AUDIT.md finding #4: the previous flat
 * top-bar nav rendered every link unconditionally, so a role lacking
 * `quotes.view` (e.g. TECHNICIAN) could click into a 403. The rebuilt
 * Sidebar must omit a nav item entirely when the caller lacks its
 * declared permission, and always show a permission-less item (e.g.
 * Customers) regardless of role.
 */
describe("Sidebar", () => {
  beforeEach(() => {
    usePermissionMock.mockReset();
  });

  it("hides a permission-gated nav item when the caller lacks that permission", () => {
    usePermissionMock.mockReturnValue(false);

    renderWithProviders(
      <Sidebar mobileOpen={false} onCloseMobile={() => {}} onOpenCommandPalette={() => {}} />,
    );

    expect(screen.queryByRole("link", { name: /quotes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /rental billing/i })).not.toBeInTheDocument();
  });

  it("shows a permission-gated nav item once the caller has that permission", () => {
    usePermissionMock.mockImplementation((permission: string) => permission === "quotes.view");

    renderWithProviders(
      <Sidebar mobileOpen={false} onCloseMobile={() => {}} onOpenCommandPalette={() => {}} />,
    );

    expect(screen.getByRole("link", { name: /quotes/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /rental billing/i })).not.toBeInTheDocument();
  });

  it("always shows a nav item with no declared permission requirement, regardless of role", () => {
    usePermissionMock.mockReturnValue(false);

    renderWithProviders(
      <Sidebar mobileOpen={false} onCloseMobile={() => {}} onOpenCommandPalette={() => {}} />,
    );

    expect(screen.getByRole("link", { name: /customers/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument();
  });
});
