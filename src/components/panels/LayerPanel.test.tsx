/**
 * LayerPanel a11y + behavior regression tests.
 *
 * Guards the Wave-3 redesign:
 *   - exactly one focusable control per layer row (no nested <button>, the
 *     standing /production a11y FAIL),
 *   - rows are role="switch" with aria-checked reflecting enabled state,
 *   - all category drawers render expanded by default.
 *
 * happy-dom env, no jest-dom matchers — assert via plain DOM queries.
 * Note: LayerPanel renders BOTH a desktop and a mobile panel (CSS-hidden, still
 * in the DOM), so every control appears twice; assertions account for that.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { LayerPanel } from "./LayerPanel";

afterEach(cleanup);

function renderPanel(enabledLayers: string[] = [], onToggle = vi.fn()) {
  const result = render(
    <LayerPanel
      enabledLayers={enabledLayers}
      onToggleLayer={onToggle}
      onClose={vi.fn()}
    />
  );
  return { ...result, onToggle };
}

describe("LayerPanel a11y", () => {
  it("has no nested interactive controls (the nested-<button> FAIL)", () => {
    const { container } = renderPanel();
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(
        btn.querySelectorAll("button").length,
        "a <button> must not contain another <button>"
      ).toBe(0);
    }
  });

  it("renders each layer row as a switch with a valid aria-checked", () => {
    const { container } = renderPanel(["forest-age"]);
    const switches = Array.from(container.querySelectorAll('[role="switch"]'));
    expect(switches.length).toBeGreaterThan(0);
    for (const s of switches) {
      expect(s.getAttribute("aria-checked")).toMatch(/^(true|false)$/);
    }
  });

  it("reflects enabled state in aria-checked", () => {
    const { container } = renderPanel(["forest-age"]);
    const enabled = container.querySelectorAll(
      '[role="switch"][aria-label="Forest Age Classes"]'
    );
    const disabled = container.querySelectorAll(
      '[role="switch"][aria-label="Cutblocks"]'
    );
    expect(enabled.length).toBeGreaterThan(0);
    expect(disabled.length).toBeGreaterThan(0);
    enabled.forEach((s) => expect(s.getAttribute("aria-checked")).toBe("true"));
    disabled.forEach((s) => expect(s.getAttribute("aria-checked")).toBe("false"));
  });

  it("expands all category drawers by default", () => {
    const { container } = renderPanel();
    const categories = Array.from(
      container.querySelectorAll("button[aria-expanded]")
    );
    expect(categories.length).toBeGreaterThan(0);
    categories.forEach((c) =>
      expect(c.getAttribute("aria-expanded")).toBe("true")
    );
    // A layer outside the default "forest" category is present.
    expect(
      container.querySelectorAll('[role="switch"][aria-label="Conservation Priority Areas"]')
        .length
    ).toBeGreaterThan(0);
  });

  it("toggles the layer when a row is activated", () => {
    const onToggle = vi.fn();
    const { container } = renderPanel([], onToggle);
    const row = container.querySelector(
      '[role="switch"][aria-label="Forest Age Classes"]'
    ) as HTMLElement;
    expect(row).toBeTruthy();
    fireEvent.click(row);
    expect(onToggle).toHaveBeenCalledWith("forest-age");
  });
});
