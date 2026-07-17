/**
 * Keyboard-routing guard tests (P2 a11y relay B1/B2).
 *
 * Covers the map page's keyboard-shortcut target guards in isolation --
 * page.tsx itself isn't renderable here (CanopyMap needs a real WebGL
 * canvas), so this exercises the extracted pure logic those handlers
 * delegate to (src/lib/keyboard/map-shortcuts.ts). Each test is written to
 * fail if the corresponding guard is reverted/weakened.
 */

import { describe, it, expect } from "vitest";
import {
  isEditableOrControl,
  isTextEntryTarget,
  matchesAltShortcut,
  isTimelineTransportKey,
  type ShortcutKeyEvent,
} from "@/lib/keyboard/map-shortcuts";

function keyEvent(overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return {
    key: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target: null,
    ...overrides,
  };
}

describe("isEditableOrControl (B1 wide guard)", () => {
  it("is true for a focused <button>", () => {
    const btn = document.createElement("button");
    expect(isEditableOrControl(btn)).toBe(true);
  });

  it("is true for input/textarea (superset of the narrow guard)", () => {
    expect(isEditableOrControl(document.createElement("input"))).toBe(true);
    expect(isEditableOrControl(document.createElement("textarea"))).toBe(true);
  });

  it("is true for an <a href>, false for an anchor without href", () => {
    const withHref = document.createElement("a");
    withHref.setAttribute("href", "/map");
    expect(isEditableOrControl(withHref)).toBe(true);

    const withoutHref = document.createElement("a");
    expect(isEditableOrControl(withoutHref)).toBe(false);
  });

  it("is true for an element with an interactive ARIA role", () => {
    const div = document.createElement("div");
    div.setAttribute("role", "switch");
    expect(isEditableOrControl(div)).toBe(true);
  });

  it("is true for a <select> and for contenteditable", () => {
    expect(isEditableOrControl(document.createElement("select"))).toBe(true);
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(isEditableOrControl(editable)).toBe(true);
  });

  it("is false for a plain, non-interactive element (e.g. the map container)", () => {
    expect(isEditableOrControl(document.createElement("div"))).toBe(false);
  });

  it("is false for null / non-Element targets", () => {
    expect(isEditableOrControl(null)).toBe(false);
  });
});

describe("isTextEntryTarget (Escape's narrow guard, preserved as-is)", () => {
  it("is true only for input/textarea", () => {
    expect(isTextEntryTarget(document.createElement("input"))).toBe(true);
    expect(isTextEntryTarget(document.createElement("textarea"))).toBe(true);
  });

  it("is false for a focused <button> -- Escape must still dismiss panels when the panel's own Close button has focus", () => {
    expect(isTextEntryTarget(document.createElement("button"))).toBe(false);
  });

  it("is false for a role=textbox div (narrower than isEditableOrControl by design)", () => {
    const div = document.createElement("div");
    div.setAttribute("role", "textbox");
    expect(isTextEntryTarget(div)).toBe(false);
  });
});

describe("matchesAltShortcut (B2: Alt+S / Alt+W)", () => {
  it("matches Alt+S / Alt+W with no other modifiers, target not a control", () => {
    expect(matchesAltShortcut(keyEvent({ key: "s", altKey: true }), "s")).toBe(true);
    expect(matchesAltShortcut(keyEvent({ key: "S", altKey: true }), "s")).toBe(true); // shift+alt+s
    expect(matchesAltShortcut(keyEvent({ key: "w", altKey: true }), "w")).toBe(true);
  });

  it("bare s/w (no Alt) never match -- the shortcut no longer fires unmodified", () => {
    expect(matchesAltShortcut(keyEvent({ key: "s", altKey: false }), "s")).toBe(false);
    expect(matchesAltShortcut(keyEvent({ key: "w", altKey: false }), "w")).toBe(false);
  });

  it("Ctrl+S / Cmd+S bail even with Alt held -- OS/browser shortcuts are never hijacked", () => {
    expect(
      matchesAltShortcut(keyEvent({ key: "s", altKey: true, ctrlKey: true }), "s")
    ).toBe(false);
    expect(
      matchesAltShortcut(keyEvent({ key: "s", altKey: true, metaKey: true }), "s")
    ).toBe(false);
  });

  it("plain Ctrl+S (no Alt) does not match -- confirms the browser Save dialog is left alone", () => {
    expect(matchesAltShortcut(keyEvent({ key: "s", ctrlKey: true }), "s")).toBe(false);
  });

  it("no-ops when focus is on a button (B1 wide guard applied to Alt+S/Alt+W)", () => {
    const btn = document.createElement("button");
    expect(matchesAltShortcut(keyEvent({ key: "s", altKey: true, target: btn }), "s")).toBe(
      false
    );
    expect(matchesAltShortcut(keyEvent({ key: "w", altKey: true, target: btn }), "w")).toBe(
      false
    );
  });

  it("does not cross-match the other letter", () => {
    expect(matchesAltShortcut(keyEvent({ key: "s", altKey: true }), "w")).toBe(false);
  });

  // Razor W2: macOS remaps `key` under Option (Alt) to a special character
  // -- Option+S yields key:"ß", Option+W yields key:"∑" -- so a `key`-only
  // check never fired there even though aria-keyshortcuts="Alt+S" advertised
  // it. `code` is layout-independent (physical key position) and DOES carry
  // through: "KeyS"/"KeyW" regardless of what `key` resolves to.
  describe("macOS Option+letter (B2/W2: matches via layout-independent `code`)", () => {
    it("fires on the real macOS Option+S event shape -- code:\"KeyS\", key:\"ß\"", () => {
      expect(
        matchesAltShortcut(keyEvent({ altKey: true, code: "KeyS", key: "ß" }), "s")
      ).toBe(true);
    });

    it("fires on the real macOS Option+W event shape -- code:\"KeyW\", key:\"∑\"", () => {
      expect(
        matchesAltShortcut(keyEvent({ altKey: true, code: "KeyW", key: "∑" }), "w")
      ).toBe(true);
    });

    it("does not fire on bare \"ß\"/\"∑\" without Alt held -- code alone is not enough", () => {
      expect(matchesAltShortcut(keyEvent({ altKey: false, code: "KeyS", key: "ß" }), "s")).toBe(
        false
      );
    });

    it("does not cross-match the other letter's code", () => {
      expect(
        matchesAltShortcut(keyEvent({ altKey: true, code: "KeyS", key: "ß" }), "w")
      ).toBe(false);
    });

    it("still no-ops when focus is on a button, even with the macOS code shape (B1 wide guard still applies)", () => {
      const btn = document.createElement("button");
      expect(
        matchesAltShortcut(
          keyEvent({ altKey: true, code: "KeyS", key: "ß", target: btn }),
          "s"
        )
      ).toBe(false);
    });

    it("still bails on Ctrl/Cmd even with the matching macOS code", () => {
      expect(
        matchesAltShortcut(
          keyEvent({ altKey: true, ctrlKey: true, code: "KeyS", key: "ß" }),
          "s"
        )
      ).toBe(false);
    });
  });
});

describe("isTimelineTransportKey (Space/arrow guard)", () => {
  it("is true with no modifiers and a non-control target", () => {
    expect(isTimelineTransportKey(keyEvent({ key: " " }))).toBe(true);
    expect(isTimelineTransportKey(keyEvent({ key: "ArrowLeft" }))).toBe(true);
  });

  it("no-ops (false) when focus is on a button -- Space must activate the button, not hijack playback", () => {
    const btn = document.createElement("button");
    expect(isTimelineTransportKey(keyEvent({ key: " ", target: btn }))).toBe(false);
  });

  it("bails on Ctrl/Cmd so OS/browser shortcuts built on Space/arrows aren't hijacked", () => {
    expect(isTimelineTransportKey(keyEvent({ key: " ", ctrlKey: true }))).toBe(false);
    expect(isTimelineTransportKey(keyEvent({ key: "ArrowLeft", metaKey: true }))).toBe(false);
  });
});
