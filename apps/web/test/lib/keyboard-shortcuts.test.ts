import { describe, expect, it, vi } from "vitest";

import { matchShortcut, type KeyboardShortcut } from "../../src/lib/keyboard-shortcuts";

function makeEvent(
  key: string,
  options: { mod?: boolean; shift?: boolean; target?: EventTarget } = {},
): KeyboardEvent {
  const target = options.target ?? document.createElement("div");
  return {
    key,
    metaKey: options.mod ?? false,
    ctrlKey: false,
    shiftKey: options.shift ?? false,
    target,
  } as unknown as KeyboardEvent;
}

const openPalette = vi.fn();
const shortcuts: KeyboardShortcut[] = [
  {
    id: "open-palette",
    keys: ["k"],
    mod: true,
    descriptionKey: "d",
    groupKey: "g",
    handler: openPalette,
  },
  { id: "new", keys: ["n"], descriptionKey: "d", groupKey: "g", handler: vi.fn() },
  { id: "focus-search", keys: ["/"], descriptionKey: "d", groupKey: "g", handler: vi.fn() },
  { id: "go-customers", keys: ["g", "c"], descriptionKey: "d", groupKey: "g", handler: vi.fn() },
  {
    id: "help",
    keys: ["?"],
    shift: true,
    descriptionKey: "d",
    groupKey: "g",
    handler: vi.fn(),
  },
];

describe("matchShortcut", () => {
  it("matches a mod+key shortcut even when a plain div has focus", () => {
    const { matched } = matchShortcut(makeEvent("k", { mod: true }), shortcuts, null);
    expect(matched?.id).toBe("open-palette");
  });

  it("does not match a bare-letter shortcut when focus is inside an input", () => {
    const input = document.createElement("input");
    const { matched } = matchShortcut(makeEvent("n", { target: input }), shortcuts, null);
    expect(matched).toBeNull();
  });

  it("does not match a bare-letter shortcut when focus is inside a textarea", () => {
    const textarea = document.createElement("textarea");
    const { matched } = matchShortcut(makeEvent("n", { target: textarea }), shortcuts, null);
    expect(matched).toBeNull();
  });

  it("does not match a bare-letter shortcut when focus is inside a contenteditable element", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const { matched } = matchShortcut(makeEvent("n", { target: editable }), shortcuts, null);
    expect(matched).toBeNull();
  });

  it("matches a bare-letter shortcut when focus is not editable", () => {
    const { matched } = matchShortcut(makeEvent("n"), shortcuts, null);
    expect(matched?.id).toBe("new");
  });

  it("starts a chord on the opening key and completes it on the second key", () => {
    const first = matchShortcut(makeEvent("g"), shortcuts, null);
    expect(first.matched).toBeNull();
    expect(first.nextPendingChordKey).toBe("g");

    const second = matchShortcut(makeEvent("c"), shortcuts, first.nextPendingChordKey);
    expect(second.matched?.id).toBe("go-customers");
  });

  it("does not start a chord when focus is inside an input", () => {
    const input = document.createElement("input");
    const { nextPendingChordKey } = matchShortcut(
      makeEvent("g", { target: input }),
      shortcuts,
      null,
    );
    expect(nextPendingChordKey).toBeNull();
  });

  it("matches a shift-modified shortcut", () => {
    const { matched } = matchShortcut(makeEvent("?", { shift: true }), shortcuts, null);
    expect(matched?.id).toBe("help");
  });

  it("resets the chord state on a non-matching second key", () => {
    const first = matchShortcut(makeEvent("g"), shortcuts, null);
    const second = matchShortcut(makeEvent("z"), shortcuts, first.nextPendingChordKey);
    expect(second.matched).toBeNull();
    expect(second.nextPendingChordKey).toBeNull();
  });

  it("does not match a non-shift shortcut when Shift is held, even if the browser reports the unshifted key", () => {
    // Regression: on some keyboard layouts Shift+/ still reports key "/"
    // (not "?"), which must not silently steal the "/" shortcut instead of
    // requiring an exact modifier match against the "?" shortcut.
    const { matched } = matchShortcut(makeEvent("/", { shift: true }), shortcuts, null);
    expect(matched).toBeNull();
  });

  it("does not match a mod shortcut's key as a bare-letter shortcut without the modifier", () => {
    const { matched } = matchShortcut(makeEvent("k"), shortcuts, null);
    expect(matched).toBeNull();
  });

  it("does not start a chord when a modifier key is held", () => {
    const { nextPendingChordKey } = matchShortcut(makeEvent("g", { shift: true }), shortcuts, null);
    expect(nextPendingChordKey).toBeNull();
  });

  it("does not complete a chord when a modifier is held on the second key", () => {
    const first = matchShortcut(makeEvent("g"), shortcuts, null);
    const second = matchShortcut(
      makeEvent("c", { shift: true }),
      shortcuts,
      first.nextPendingChordKey,
    );
    expect(second.matched).toBeNull();
  });
});
