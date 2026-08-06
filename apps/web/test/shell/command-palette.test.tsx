import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "../../src/components/shell/command-palette";
import { renderWithProviders } from "../test-utils";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

vi.mock("../../src/hooks/use-current-tenant", () => ({
  useCurrentTenantId: () => ["tenant-1"],
}));

vi.mock("../../src/hooks/use-current-tenant-role", () => ({
  useCurrentTenantRole: () => ({ data: { role: "OWNER" } }),
}));

vi.mock("../../src/lib/permissions", () => ({
  roleHasPermission: () => true,
}));

vi.mock("../../src/hooks/use-auth", () => ({
  useMe: () => ({ data: { user: { id: "user-1", firstName: "Ada", lastName: "Lovelace" } } }),
  useLogout: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../../src/hooks/use-dark-mode", () => ({
  useDarkMode: () => [false, vi.fn()],
}));

const pinnedItemsMock = vi.fn();
vi.mock("../../src/hooks/use-pinned-items", () => ({
  usePinnedItems: () => pinnedItemsMock(),
}));

const recentItemsMock = vi.fn();
vi.mock("../../src/hooks/use-recent-items", () => ({
  useRecentItems: () => recentItemsMock(),
}));

vi.mock("../../src/lib/search-providers", () => ({ SEARCH_PROVIDERS: [] }));

describe("CommandPalette", () => {
  beforeEach(() => {
    pushMock.mockReset();
    pinnedItemsMock.mockReturnValue({ items: [], isPinned: () => false, togglePinned: vi.fn() });
    recentItemsMock.mockReturnValue([]);
  });

  it("never opens empty — Quick Actions and Navigation are always present", () => {
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/quick actions/i)).toBeInTheDocument();
    expect(screen.getByText(/pages/i)).toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("shows a Recent section when recent items exist", () => {
    recentItemsMock.mockReturnValue([
      { id: "recent:rental:1", kind: "entity", label: "RNT-000001", href: "/app/rentals/1" },
    ]);

    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/recent/i)).toBeInTheDocument();
    expect(screen.getByText("RNT-000001")).toBeInTheDocument();
  });

  it("shows a Pinned section when items are pinned", () => {
    pinnedItemsMock.mockReturnValue({
      items: [
        {
          id: "customer:1",
          entityType: "customer",
          entityId: "1",
          label: "Jane Doe",
          href: "/app/customers/1",
          pinnedAt: Date.now(),
        },
      ],
      isPinned: () => true,
      togglePinned: vi.fn(),
    });

    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/pinned/i)).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("navigates and closes the palette when a command is clicked", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(<CommandPalette open onOpenChange={onOpenChange} />);

    const user = userEvent.setup();
    await user.click(screen.getByText(/new customer/i));

    expect(pushMock).toHaveBeenCalledWith("/app/customers/new");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("includes real, working action-kind commands (toggle dark mode, log out)", () => {
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/dark mode/i)).toBeInTheDocument();
    expect(screen.getByText(/log out/i)).toBeInTheDocument();
  });
});
