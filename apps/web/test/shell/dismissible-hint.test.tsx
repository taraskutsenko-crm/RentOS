import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DismissibleHint } from "../../src/components/shell/dismissible-hint";
import { renderWithProviders } from "../test-utils";

vi.mock("../../src/hooks/use-auth", () => ({
  useMe: () => ({ data: { user: { id: "user-1" } } }),
}));

beforeEach(() => {
  window.localStorage.clear();
});

describe("DismissibleHint", () => {
  it("shows the message and dismisses it, remembering the dismissal", async () => {
    const { unmount } = renderWithProviders(
      <DismissibleHint hintId="test-hint" message="Press Ctrl+K to search" />,
    );

    expect(screen.getByText("Press Ctrl+K to search")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByText("Press Ctrl+K to search")).not.toBeInTheDocument();
    unmount();

    // Remounting simulates a fresh page load — the dismissal must persist.
    renderWithProviders(<DismissibleHint hintId="test-hint" message="Press Ctrl+K to search" />);
    expect(screen.queryByText("Press Ctrl+K to search")).not.toBeInTheDocument();
  });

  it("keeps a different hintId's dismissal independent", async () => {
    renderWithProviders(<DismissibleHint hintId="hint-a" message="Hint A" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    renderWithProviders(<DismissibleHint hintId="hint-b" message="Hint B" />);
    expect(screen.getByText("Hint B")).toBeInTheDocument();
  });
});
