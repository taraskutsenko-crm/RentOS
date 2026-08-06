import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShortcutsHelpDialog } from "../../src/components/shell/shortcuts-help-dialog";
import type { KeyboardShortcut } from "../../src/lib/keyboard-shortcuts";
import { renderWithProviders } from "../test-utils";

const SHORTCUTS: KeyboardShortcut[] = [
  {
    id: "open-palette",
    keys: ["k"],
    mod: true,
    descriptionKey: "app.shell.shortcuts.openPalette",
    groupKey: "app.shell.shortcuts.groupGeneral",
    handler: vi.fn(),
  },
  {
    id: "go-customers",
    keys: ["g", "c"],
    descriptionKey: "app.shell.shortcuts.goCustomers",
    groupKey: "app.shell.shortcuts.groupNavigation",
    handler: vi.fn(),
  },
];

describe("ShortcutsHelpDialog", () => {
  it("lists every registered shortcut, grouped, read live from the registry passed in", () => {
    renderWithProviders(<ShortcutsHelpDialog open onOpenChange={vi.fn()} shortcuts={SHORTCUTS} />);

    expect(screen.getByText(/open command palette/i)).toBeInTheDocument();
    expect(screen.getByText(/go to customers/i)).toBeInTheDocument();
    expect(screen.getByText("G C")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    renderWithProviders(
      <ShortcutsHelpDialog open={false} onOpenChange={vi.fn()} shortcuts={SHORTCUTS} />,
    );

    expect(screen.queryByText(/open command palette/i)).not.toBeInTheDocument();
  });
});
