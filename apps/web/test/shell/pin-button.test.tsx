import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PinButton } from "../../src/components/shell/pin-button";
import { renderWithProviders } from "../test-utils";

const togglePinnedMock = vi.fn();
const isPinnedMock = vi.fn();
vi.mock("../../src/hooks/use-pinned-items", () => ({
  usePinnedItems: () => ({
    items: [],
    isPinned: (id: string) => isPinnedMock(id),
    togglePinned: togglePinnedMock,
  }),
}));

describe("PinButton", () => {
  it("shows a pin action and toggles it, generic over entityType", async () => {
    isPinnedMock.mockReturnValue(false);
    renderWithProviders(
      <PinButton entityType="customer" entityId="1" label="Jane Doe" href="/app/customers/1" />,
    );

    const button = screen.getByRole("button", { name: /^pin$/i });
    const user = userEvent.setup();
    await user.click(button);

    expect(togglePinnedMock).toHaveBeenCalledWith({
      id: "customer:1",
      entityType: "customer",
      entityId: "1",
      label: "Jane Doe",
      href: "/app/customers/1",
    });
  });

  it("shows the unpin label when already pinned", () => {
    isPinnedMock.mockReturnValue(true);
    renderWithProviders(
      <PinButton entityType="asset" entityId="2" label="Sony A7 IV" href="/app/assets/2" />,
    );

    expect(screen.getByRole("button", { name: /unpin/i })).toBeInTheDocument();
  });
});
