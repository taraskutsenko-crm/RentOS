import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { BlockNode } from "../../src/lib/contract-section-library";
import { TemplateBuilder } from "../../src/components/documents/template-builder/template-builder";
import { renderWithProviders } from "../test-utils";

/**
 * Mirrors how the New/Edit Template pages actually use TemplateBuilder —
 * `onChange` feeds back into React state, which is what makes the editor's
 * own re-renders (and thus the reorder-list's block count) keep up with
 * ProseMirror's internal state. A bare `vi.fn()` onChange never triggers a
 * parent re-render, so it can't exercise that path.
 */
function StatefulTemplateBuilder() {
  const [blocks, setBlocks] = useState<BlockNode[] | null>(null);
  return <TemplateBuilder initialBlocks={blocks} onChange={setBlocks} />;
}

describe("TemplateBuilder", () => {
  it("mounts the Tiptap editor with the insert-field and add-section controls", async () => {
    renderWithProviders(<TemplateBuilder initialBlocks={null} onChange={() => {}} />);
    expect(await screen.findByText("Insert field")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Add section" })).toBeInTheDocument();
  });

  it("inserts a field as a readable chip, never the raw {{path}} syntax", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<TemplateBuilder initialBlocks={null} onChange={onChange} />);

    await user.click(await screen.findByText("Insert field"));
    await user.click(await screen.findByRole("menuitem", { name: "Rental total" }));

    expect(await screen.findByText("Rental total")).toBeInTheDocument();
    expect(screen.queryByText(/\{\{rental\.total\}\}/)).not.toBeInTheDocument();

    const lastCall = onChange.mock.calls.at(-1)?.[0] as BlockNode[] | undefined;
    expect(JSON.stringify(lastCall)).toContain('"rental.total"');
  });

  it("inserts a full section from the library into the canvas and shows the reorder list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatefulTemplateBuilder />);

    const addSection = await screen.findByRole("combobox", { name: "Add section" });
    await user.selectOptions(addSection, "price");

    const canvas = document.querySelector(".doc-builder-canvas") as HTMLElement;
    expect(canvas).not.toBeNull();
    expect(await within(canvas).findByText("Price")).toBeInTheDocument();
    expect(within(canvas).getByText("Rental total")).toBeInTheDocument();
    expect(within(canvas).getByText("Security deposit")).toBeInTheDocument();

    // The new section must land as a top-level sibling, not nested inside
    // the existing (isolating) docSection — regression guard for a bug where
    // `.focus("end").insertContent()` resolved *inside* the last section.
    const proseMirrorRoot = canvas.querySelector(".ProseMirror") as HTMLElement;
    const topLevelSections = Array.from(proseMirrorRoot.children).filter((el) =>
      el.hasAttribute("data-doc-section"),
    );
    expect(topLevelSections).toHaveLength(2);

    // Three top-level blocks now exist (the blank starter section, the
    // inserted "Price" section, and Tiptap's auto-appended trailing
    // paragraph), so the move-up/down/remove reorder list becomes visible —
    // one "Move up" per row (the first row's is disabled, per index === 0).
    const moveUpButtons = await screen.findAllByRole("button", { name: "Move up" });
    expect(moveUpButtons).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Remove" }).length).toBeGreaterThan(0);
  });

  it("moves a section up in document order via the reorder list", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatefulTemplateBuilder />);

    const addSection = await screen.findByRole("combobox", { name: "Add section" });
    await user.selectOptions(addSection, "price");
    const moveUpButtons = await screen.findAllByRole("button", { name: "Move up" });
    expect(moveUpButtons).toHaveLength(3);

    const canvas = document.querySelector(".doc-builder-canvas") as HTMLElement;
    const titlesBefore = Array.from(canvas.querySelectorAll("[data-doc-section-title]")).map(
      (el) => el.textContent,
    );
    expect(titlesBefore).toEqual(["", "Price"]);

    // Row 0 (the blank starter section) has its "Move up" disabled; row 1
    // ("Price") is the enabled one.
    await user.click(moveUpButtons[1]!);

    const titlesAfter = Array.from(canvas.querySelectorAll("[data-doc-section-title]")).map(
      (el) => el.textContent,
    );
    expect(titlesAfter).toEqual(["Price", ""]);
  });

  it("does not render insert/edit controls when disabled", async () => {
    renderWithProviders(<TemplateBuilder initialBlocks={null} onChange={() => {}} disabled />);
    expect(await screen.findByText("Insert field")).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Add section" })).toBeDisabled();
  });
});
