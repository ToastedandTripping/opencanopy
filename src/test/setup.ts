/**
 * Vitest test setup.
 *
 * Stubs browser APIs that MapLibre and scrollama depend on
 * but which happy-dom may not provide.
 */

import { vi } from "vitest";

// Stub matchMedia for prefers-reduced-motion checks
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

// Stub IntersectionObserver for scrollama
if (typeof window !== "undefined" && !window.IntersectionObserver) {
  const MockIntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
  window.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
}

// Stub ResizeObserver
if (typeof window !== "undefined" && !window.ResizeObserver) {
  const MockResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
  window.ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;
}
