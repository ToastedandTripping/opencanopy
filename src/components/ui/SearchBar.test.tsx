/**
 * SearchBar D1 regression tests (P2 a11y relay -- honest failure states).
 *
 * geocode() used to return `[]` for an HTTP failure, a genuinely empty
 * result, AND a thrown error alike -- three different outcomes collapsed
 * into the same silent blank dropdown. This file pins the three-way
 * distinction end to end (via the rendered DOM, since geocode itself is
 * module-private by design).
 *
 * Keyless environment (this worktree has no NEXT_PUBLIC_MAPTILER_KEY --
 * .env.local lives only in the primary checkout): most tests exercise that
 * real default. The two "keyed" tests use vi.stubEnv + vi.resetModules +
 * a fresh dynamic import to force the fetch-based branch, matching the
 * established pattern in story-consistency-audit.test.ts. fetch is always
 * mocked -- live MapTiler/WFS calls don't work in this environment.
 *
 * Debounce dodge: handleInputChange schedules a 300ms debounced search, but
 * handleKeyDown's Enter-when-closed branch calls handleSearch(query)
 * immediately. Typing then pressing Enter exercises the real search path
 * without needing to fake-advance the debounce timer. Fake timers are used
 * anyway so the debounce's own setTimeout never fires as a stray real timer
 * after a test/component unmounts.
 *
 * Query note: getByLabelText can't be used here -- the mobile-collapsed
 * button and the desktop input share the literal label text "Search for a
 * location" (happy-dom doesn't apply Tailwind's `md:hidden` responsive
 * display, so both are "visible" to testing-library). A direct
 * `input[aria-label=...]` selector disambiguates.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ features: [] }),
    ...response,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function getInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[aria-label="Search for a location"]');
  if (!input) throw new Error('SearchBar input[aria-label="Search for a location"] not found');
  return input as HTMLInputElement;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function search(input: HTMLElement, query: string) {
  fireEvent.change(input, { target: { value: query } });
  await act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("SearchBar (keyless environment -- this worktree's actual default)", () => {
  it('renders the "ok" listbox for a valid coordinate query (parseCoordinates fallback)', async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "49.1,-123.5");

    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox).toBeTruthy();
    expect(container.textContent).toMatch(/49\.1000, -123\.5000/);
    expect(container.textContent).not.toMatch(/No matches in BC/);
    expect(container.textContent).not.toMatch(/unavailable/i);
  });

  it('renders "error" (NOT "empty") for a non-coordinate query with no key -- genuinely unavailable, not a real search that found nothing', async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "vancouver");

    expect(container.textContent).toMatch(/Search is unavailable — try again/);
    expect(container.textContent).not.toMatch(/No matches in BC/);
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it("selecting a coordinate result still calls onLocationSelect (ok-path behavior unchanged)", async () => {
    const onLocationSelect = vi.fn();
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={onLocationSelect} />);
    const input = getInput(container);

    await search(input, "49.1,-123.5");
    const option = container.querySelector('[role="option"]') as HTMLElement;
    expect(option).toBeTruthy();
    fireEvent.click(option);

    expect(onLocationSelect).toHaveBeenCalledWith(-123.5, 49.1, 12);
  });
});

describe("SearchBar (keyed environment -- fetch-based geocoding, mocked)", () => {
  it('renders "empty" for a 200 response with zero features', async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
    vi.resetModules();
    mockFetchOnce({ json: async () => ({ features: [] }) });
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "nowhere-in-particular");

    expect(container.textContent).toMatch(/No matches in BC/);
    expect(container.textContent).not.toMatch(/unavailable/i);
  });

  it('renders "error" for an HTTP failure, and never leaks the request URL (which embeds the key) or a raw error into the DOM', async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "super-secret-key");
    vi.resetModules();
    mockFetchOnce({ ok: false, status: 502 });
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "vancouver");

    expect(container.textContent).toMatch(/Search is unavailable — try again/);
    expect(container.textContent).not.toContain("super-secret-key");
    expect(container.textContent).not.toContain("key=");
    expect(container.textContent).not.toMatch(/502|HTTP/);
  });

  it('renders "error" for a thrown network failure, with the same static copy', async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "super-secret-key");
    vi.resetModules();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch: super-secret-key leaked"));
    vi.stubGlobal("fetch", fetchMock);
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "vancouver");

    expect(container.textContent).toMatch(/Search is unavailable — try again/);
    expect(container.textContent).not.toContain("super-secret-key");
  });
});

describe("SearchBar accessibility (D1)", () => {
  it("the input carries an aria-label", async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    expect(getInput(container)).toBeTruthy();
  });

  it("the dropdown region is role=status with aria-live=polite for every non-idle outcome", async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "vancouver"); // keyless -> "error"

    const region = container.querySelector('[role="status"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute("aria-live")).toBe("polite");
  });

  it("nothing is rendered before any search is attempted (idle state)", async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
