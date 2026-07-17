/**
 * useDialogA11y tests (P2 a11y relay, part C).
 *
 * LayerPanel/HotSpotPanel render BOTH variants (desktop region + mobile
 * dialog) simultaneously, switched by a CSS media query, not JS -- so these
 * tests exercise the hook via a small harness with an INJECTED `isVisible`
 * predicate (happy-dom doesn't apply Tailwind's responsive `display`
 * classes, so real getClientRects() behavior can't be trusted here; see the
 * hook's own module doc for why offsetParent can't be used either).
 *
 * Each test is written to fail if the corresponding guard is reverted.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, act, screen } from "@testing-library/react";
import { useRef, useState, type RefObject } from "react";
import { useDialogA11y, getFocusableElements, defaultIsVisible } from "./useDialogA11y";

afterEach(cleanup);

interface HarnessProps {
  modal: boolean;
  visible: boolean;
  onClose: () => void;
  /** 0 = no focusable descendants at all (zero-focusable trap edge). 2 =
   *  close button + one content button (default -- enough for first/last
   *  wrap tests). */
  focusableCount?: 0 | 2;
  fallbackRefs?: Array<RefObject<HTMLElement | null>>;
  /** Distinguishes two simultaneously-mounted instances in the same DOM --
   *  needed for the dual-modal-collision test (Razor W1), which mounts two
   *  independent trap instances at once (mirroring LayerPanel's mobile
   *  sheet + HotSpotPanel's mobile sheet both being open) and needs unique
   *  testids to query each one separately. Defaults to "" so every
   *  pre-existing single-instance test keeps its original testids
   *  unchanged. */
  idPrefix?: string;
}

function DialogHarness({
  modal,
  visible,
  onClose,
  focusableCount = 2,
  fallbackRefs,
  idPrefix = "",
}: HarnessProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const containerRef = useDialogA11y(true, {
    modal,
    onClose,
    initialFocusRef: closeRef,
    restoreFallbackRefs: fallbackRefs,
    isVisible: () => visible,
  });

  return (
    <div ref={containerRef} data-testid={`${idPrefix}dialog-container`} tabIndex={-1}>
      {focusableCount >= 2 && (
        <>
          <button ref={closeRef} data-testid={`${idPrefix}close-btn`}>
            Close
          </button>
          <button data-testid={`${idPrefix}content-btn-1`}>Item</button>
        </>
      )}
    </div>
  );
}

/** Wires up trigger + "captured" focus target + a toggleable DialogHarness
 *  so restore-focus tests can control mount/unmount/focus ordering
 *  precisely via button clicks (avoiding effect-timing races). */
function RestoreScenario({ withFallback = true }: { withFallback?: boolean }) {
  const [capturedMounted, setCapturedMounted] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div>
      <button ref={triggerRef} data-testid="trigger">
        Trigger
      </button>
      {capturedMounted && <button data-testid="captured">Captured</button>}
      <button data-testid="open-dialog" onClick={() => setDialogOpen(true)}>
        open
      </button>
      <button data-testid="unmount-captured" onClick={() => setCapturedMounted(false)}>
        unmount captured
      </button>
      <button data-testid="close-dialog" onClick={() => setDialogOpen(false)}>
        close
      </button>
      {dialogOpen && (
        <DialogHarness
          modal={false}
          visible={true}
          onClose={() => setDialogOpen(false)}
          fallbackRefs={withFallback ? [triggerRef] : undefined}
        />
      )}
    </div>
  );
}

describe("useDialogA11y: focus-in on open", () => {
  it("moves focus to the initial-focus target when the container IS the visible variant", () => {
    render(<DialogHarness modal={false} visible={true} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByTestId("close-btn"));
  });

  it("does NOT steal focus when the container is not the visible variant (isVisible guard)", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    render(<DialogHarness modal={false} visible={false} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(outside);

    document.body.removeChild(outside);
  });
});

describe("useDialogA11y: focus restore on close", () => {
  it("restores focus to the previously-focused element when it's still connected", () => {
    const { getByTestId } = render(<RestoreScenario />);
    act(() => getByTestId("captured").focus());
    expect(document.activeElement).toBe(getByTestId("captured"));

    act(() => fireEvent.click(getByTestId("open-dialog")));
    expect(document.activeElement).toBe(getByTestId("close-btn"));

    act(() => fireEvent.click(getByTestId("close-dialog")));
    expect(document.activeElement).toBe(getByTestId("captured"));
  });

  it("falls back to the trigger button when the captured node is no longer connected (isConnected guard)", () => {
    const { getByTestId } = render(<RestoreScenario />);
    act(() => getByTestId("captured").focus());
    act(() => fireEvent.click(getByTestId("open-dialog")));
    expect(document.activeElement).toBe(getByTestId("close-btn"));

    // The node that had focus before open gets removed while the dialog is
    // still open (e.g. a sibling re-render tore it down).
    act(() => fireEvent.click(getByTestId("unmount-captured")));

    act(() => fireEvent.click(getByTestId("close-dialog")));
    expect(document.activeElement).toBe(getByTestId("trigger"));
  });

  it("with no fallback ref supplied and the captured node gone, focus is simply not force-restored (no throw)", () => {
    const { getByTestId } = render(<RestoreScenario withFallback={false} />);
    act(() => getByTestId("captured").focus());
    act(() => fireEvent.click(getByTestId("open-dialog")));
    act(() => fireEvent.click(getByTestId("unmount-captured")));

    expect(() => act(() => fireEvent.click(getByTestId("close-dialog")))).not.toThrow();
  });
});

describe("useDialogA11y: modal Tab trap", () => {
  it("wraps forward Tab from the last focusable element back to the first", () => {
    const { getByTestId } = render(
      <DialogHarness modal={true} visible={true} onClose={vi.fn()} />
    );
    act(() => getByTestId("content-btn-1").focus());
    expect(document.activeElement).toBe(getByTestId("content-btn-1"));

    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
    });
    expect(document.activeElement).toBe(getByTestId("close-btn"));
  });

  it("wraps Shift+Tab from the FIRST focusable element to the last (explicit shift+Tab wrap)", () => {
    const { getByTestId } = render(
      <DialogHarness modal={true} visible={true} onClose={vi.fn()} />
    );
    act(() => getByTestId("close-btn").focus());
    expect(document.activeElement).toBe(getByTestId("close-btn"));

    act(() => {
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    });
    expect(document.activeElement).toBe(getByTestId("content-btn-1"));
  });

  it("pins focus to the container itself when there are zero focusable descendants (never nothing)", () => {
    const { getByTestId } = render(
      <DialogHarness modal={true} visible={true} onClose={vi.fn()} focusableCount={0} />
    );
    const container = getByTestId("dialog-container");

    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
    });
    expect(document.activeElement).toBe(container);
  });

  it("does not trap Tab when this variant is not the visible one (isVisible guard)", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    render(<DialogHarness modal={true} visible={false} onClose={vi.fn()} />);
    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
    });
    // No trap fired -- focus is left wherever it was (jsdom/happy-dom don't
    // implement native Tab focus movement, so it simply stays put).
    expect(document.activeElement).toBe(outside);

    document.body.removeChild(outside);
  });

  it("does not trap Tab for the non-modal (desktop) variant -- Tab must be able to leave the panel", () => {
    const { getByTestId } = render(
      <DialogHarness modal={false} visible={true} onClose={vi.fn()} />
    );
    act(() => getByTestId("content-btn-1").focus());
    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
    });
    // Not wrapped back to close-btn -- no trap listener for modal:false.
    expect(document.activeElement).toBe(getByTestId("content-btn-1"));
  });

  // Razor W3: a tap on the sheet's own non-interactive body (e.g. empty
  // padding, the drag handle area) focuses the container itself --
  // container.contains(container) is true, so `activeInside` was already
  // true, but `active` was neither `first` nor `last`, so Shift+Tab fell
  // through to the browser default and focus escaped the modal backward.
  it("wraps Shift+Tab to the LAST focusable element when focus is on the container itself, not just when it's on the first element", () => {
    const { getByTestId } = render(
      <DialogHarness modal={true} visible={true} onClose={vi.fn()} />
    );
    const container = getByTestId("dialog-container");
    act(() => container.focus());
    expect(document.activeElement).toBe(container);

    act(() => {
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    });
    expect(document.activeElement).toBe(getByTestId("content-btn-1"));
  });

  it("wraps forward Tab to the FIRST focusable element when focus is on the container itself (symmetric case)", () => {
    const { getByTestId } = render(
      <DialogHarness modal={true} visible={true} onClose={vi.fn()} />
    );
    const container = getByTestId("dialog-container");
    act(() => container.focus());
    expect(document.activeElement).toBe(container);

    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
    });
    expect(document.activeElement).toBe(getByTestId("close-btn"));
  });
});

describe("useDialogA11y: dual-modal trap collision (Razor W1 defense-in-depth)", () => {
  it("when two modal traps are simultaneously armed (mirrors LayerPanel + HotSpotPanel mobile sheets both open), a single Tab keydown is decided by the trap that actually contains focus -- the sibling trap sees e.defaultPrevented and bails instead of overriding it", () => {
    const { getByTestId } = render(
      <>
        <DialogHarness modal={true} visible={true} onClose={vi.fn()} idPrefix="a-" />
        <DialogHarness modal={true} visible={true} onClose={vi.fn()} idPrefix="b-" />
      </>
    );

    // Focus is inside panel A's own focus order (its last focusable
    // element), nowhere near panel B.
    act(() => getByTestId("a-content-btn-1").focus());
    expect(document.activeElement).toBe(getByTestId("a-content-btn-1"));

    act(() => {
      fireEvent.keyDown(window, { key: "Tab" });
    });

    // Before the fix: A's listener (registered first) correctly wraps to
    // A's own close button, but B's listener (registered second, no
    // defaultPrevented guard) then re-evaluates the SAME keydown, sees
    // focus is now outside its own container (A's close button isn't
    // inside B), and unconditionally steals it back to B's close button --
    // reproducing Razor's probe (6 Tab presses all pinned to "Close layer
    // panel", i.e. whichever trap mounted last always won). After the fix,
    // B bails on e.defaultPrevented and A's decision stands.
    expect(document.activeElement).toBe(getByTestId("a-close-btn"));
    expect(document.activeElement).not.toBe(getByTestId("b-close-btn"));
  });

  it("Shift+Tab is likewise decided by the trap that actually contains focus, not the last-registered sibling", () => {
    const { getByTestId } = render(
      <>
        <DialogHarness modal={true} visible={true} onClose={vi.fn()} idPrefix="a-" />
        <DialogHarness modal={true} visible={true} onClose={vi.fn()} idPrefix="b-" />
      </>
    );

    act(() => getByTestId("a-close-btn").focus());
    expect(document.activeElement).toBe(getByTestId("a-close-btn"));

    act(() => {
      fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    });

    expect(document.activeElement).toBe(getByTestId("a-content-btn-1"));
    expect(document.activeElement).not.toBe(getByTestId("b-content-btn-1"));
  });
});

describe("useDialogA11y: does not duplicate Escape-to-close", () => {
  it("never calls onClose itself -- Escape-to-close lives in the page-level keydown handler (B1)", () => {
    const onClose = vi.fn();
    render(<DialogHarness modal={true} visible={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("getFocusableElements", () => {
  it("finds buttons, links with href, and excludes disabled controls", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <button>a</button>
      <button disabled>b</button>
      <a href="/x">c</a>
      <a>d (no href)</a>
      <input />
      <div tabindex="-1">e</div>
    `;
    const found = getFocusableElements(container);
    expect(found.map((el) => el.textContent?.trim() || el.tagName)).toEqual([
      "a",
      "c",
      "INPUT",
    ]);
  });
});

describe("defaultIsVisible", () => {
  // happy-dom doesn't compute real CSS layout, so a display:none element's
  // getClientRects() can't be trusted to return empty here the way it does
  // in a real browser -- that's precisely why the hook takes `isVisible` as
  // a dependency-injected predicate (see the other describe blocks above,
  // all of which inject a controlled fixture rather than relying on this
  // default). This test instead pins the function's own logic --
  // length-of-getClientRects() -- so a regression to e.g. `offsetParent
  // !== null` (which the hook's doc comment specifically warns misreports
  // fixed-position elements) would still be caught. The real CSS behavior
  // (Tailwind's hidden/md:hidden) is exercised by the Playwright mobile
  // sheet pass, not vitest.
  it("reflects getClientRects().length, not offsetParent", () => {
    const el = document.createElement("div");
    const spy = vi.spyOn(el, "getClientRects");

    spy.mockReturnValue([] as unknown as DOMRectList);
    expect(defaultIsVisible(el)).toBe(false);

    spy.mockReturnValue([{} as DOMRect] as unknown as DOMRectList);
    expect(defaultIsVisible(el)).toBe(true);
  });
});
