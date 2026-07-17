"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Hand-rolled focus/dialog-semantics hook for LayerPanel and HotSpotPanel
 * (P2 a11y relay, part C -- WCAG 2.4.3 / 4.1.2 / 1.4.13 / 2.1.2).
 *
 * No focus-trap/react-focus-lock dependency: justified for one modal sheet
 * shape on a zero-dep static export. Handles two distinct variants:
 *
 *   - Desktop side panel (`modal: false`): focus moves in on open, restores
 *     on close, NO Tab trap -- the map must stay reachable, so Tab is
 *     allowed to leave the panel.
 *   - Mobile bottom sheet (`modal: true`): same focus-in/restore, PLUS a
 *     Tab trap that cycles focus within the sheet while it's open.
 *
 * Both LayerPanel and HotSpotPanel render BOTH variants simultaneously
 * (Tailwind's `hidden md:flex` / `md:hidden`, not conditional mounting) --
 * only one is visible at a time, switched by a CSS media query, not JS.
 * Both are `position: fixed`, and `offsetParent` is `null` for ALL fixed
 * elements in Chrome/Safari regardless of visibility -- so `offsetParent
 * !== null` would misreport the VISIBLE variant as hidden. This hook uses
 * `el.getClientRects().length > 0` instead (0 for display:none, non-zero
 * for a visible fixed element), dependency-injected via `isVisible` so
 * tests can exercise both branches without a real layout engine (happy-dom
 * doesn't apply Tailwind's responsive `display` classes).
 *
 * Call this hook ONCE PER VARIANT (once with modal:false for the desktop
 * container, once with modal:true for the mobile sheet) inside the same
 * panel component -- each instance captures/restores focus independently,
 * gated on its own container's visibility, so only the currently-visible
 * variant ever actually moves focus.
 */

export interface UseDialogA11yOptions {
  /** false = desktop side panel (region, no trap). true = mobile bottom
   *  sheet (dialog, Tab-trapped while open). */
  modal: boolean;
  /** Not called by this hook -- Escape-to-close already lives in the map
   *  page's keydown handler (B1 preserves it) and must not be duplicated
   *  here. Kept in the options shape for API clarity (this hook manages
   *  focus for a closeable dialog) and so a future trap-edge-case (e.g.
   *  closing on backdrop click) has an obvious place to call it from. */
  onClose: () => void;
  /** Element that receives focus when the dialog opens -- the panel's own
   *  Close button. */
  initialFocusRef: RefObject<HTMLElement | null>;
  /** Ordered fallback restore targets, tried in order, used only when the
   *  element that had focus before open is no longer connected by close
   *  time (e.g. a sibling dialog closed first and its close button --
   *  which had focus -- went with it). Typically [the panel's own trigger
   *  button, the map container]. */
  restoreFallbackRefs?: Array<RefObject<HTMLElement | null>>;
  /** Dependency-injected visibility predicate. Default:
   *  `el.getClientRects().length > 0`. See module doc for why offsetParent
   *  can't be used here. */
  isVisible?: (el: HTMLElement) => boolean;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Focusable elements within `container`, in DOM order. */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** Default visibility predicate -- see module doc for the offsetParent
 *  pitfall this specifically avoids. */
export function defaultIsVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

export function useDialogA11y(
  isOpen: boolean,
  options: UseDialogA11yOptions
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus-in on open, restore on close (or unmount -- LayerPanel/HotSpotPanel
  // are conditionally MOUNTED by page.tsx, so "close" is usually an
  // unmount, not an isOpen:true->false transition within a still-mounted
  // component. Putting the restore logic in the effect's cleanup function
  // handles both cases uniformly: React always runs it on unmount too.
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    const isVisible = options.isVisible ?? defaultIsVisible;
    if (!container || !isVisible(container)) return; // not the active variant

    // Captured PER-EFFECT-RUN (a local closure variable, not a shared ref)
    // so a sibling dialog opening/closing around the same time can never
    // clobber this instance's own previously-focused element.
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    options.initialFocusRef.current?.focus();

    return () => {
      // GUARD with isConnected -- the captured node can be unmounted by
      // close time (both panels can be open at once; Escape closes
      // hotspot-then-layer; a double-open makes the second panel's
      // "previous focus" a node inside the first). Per-instance capture
      // means closing panel B then panel A never tries to restore focus
      // into a now-closed B.
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
        return;
      }
      for (const ref of options.restoreFallbackRefs ?? []) {
        const el = ref.current;
        if (el && el.isConnected) {
          el.focus();
          return;
        }
      }
    };
    // Re-run only on isOpen transitions. initialFocusRef/restoreFallbackRefs
    // are refs (stable identity across renders) and isVisible/onClose are
    // expected stable per call site -- re-running this on every render
    // would steal focus back on every re-render while already open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Tab trap -- modal (mobile sheet) variant only, and only while this
  // variant is the visible one (checked live per keypress, not cached, so
  // a viewport resize crossing the md breakpoint mid-session is handled
  // correctly with no extra plumbing).
  useEffect(() => {
    if (!isOpen || !options.modal) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const isVisible = options.isVisible ?? defaultIsVisible;
      if (!isVisible(container)) return;

      const focusable = getFocusableElements(container);

      // ZERO-visible-focusables edge: never let Tab escape to nothing --
      // pin focus to the container itself (requires tabIndex={-1} on it).
      if (focusable.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const activeInside = active instanceof Node && container.contains(active);

      if (e.shiftKey) {
        // Shift+Tab wrap on the FIRST element, explicitly handled.
        if (!activeInside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!activeInside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, options.modal]);

  return containerRef;
}
