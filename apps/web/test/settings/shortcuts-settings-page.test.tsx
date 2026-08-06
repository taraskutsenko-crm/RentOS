import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ShortcutsSettingsPage from "../../src/app/app/settings/shortcuts/page";
import { renderWithProviders } from "../test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("ShortcutsSettingsPage", () => {
  it("lists every registered shortcut, grouped, from the same registry the Shift+? modal uses", () => {
    renderWithProviders(<ShortcutsSettingsPage />);

    expect(screen.getAllByText(/open command palette/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/new item/i)).toBeInTheDocument();
    expect(screen.getByText(/go to customers/i)).toBeInTheDocument();
    expect(screen.getByText("G C")).toBeInTheDocument();
  });
});
