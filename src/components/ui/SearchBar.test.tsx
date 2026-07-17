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
    expect(container.textContent).not.toMatch(/failed/i);
  });

  it('renders "error" (NOT "empty") for a non-coordinate query with no key -- genuinely unavailable, not a real search that found nothing', async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "vancouver");

    expect(container.textContent).toMatch(/Search failed — try again/);
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
    expect(container.textContent).not.toMatch(/failed/i);
  });

  it('renders "error" for an HTTP failure, and never leaks the request URL (which embeds the key) or a raw error into the DOM', async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "super-secret-key");
    vi.resetModules();
    mockFetchOnce({ ok: false, status: 502 });
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "vancouver");

    expect(container.textContent).toMatch(/Search failed — try again/);
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

    expect(container.textContent).toMatch(/Search failed — try again/);
    expect(container.textContent).not.toContain("super-secret-key");
  });

  // Pre-existing bug (not introduced by this batch), fixed via the
  // sequence-token guard already extracted+tested for the same race on the
  // map page's calc pipeline (forest-carbon-client.ts createSeqGuard).
  // Enter calls handleSearch immediately, so a fast Enter-then-Enter
  // sequence (or Enter racing the 300ms debounce) can have two geocode()
  // calls in flight -- whichever NETWORK response arrives last used to win
  // regardless of which SEARCH was issued last.
  it("out-of-order guard: a slower, earlier-started search does not overwrite a faster, later-started one", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
    vi.resetModules();

    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount += 1;
      return callCount === 1 ? firstResponse : secondResponse;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    // First search starts (Enter bypasses the debounce -- immediate call).
    fireEvent.change(input, { target: { value: "first-query" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    // Second search starts before the first has resolved at all.
    fireEvent.change(input, { target: { value: "second-query" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The NEWER search's response arrives first.
    await act(async () => {
      resolveSecond({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            { id: "2", text: "Second Place", place_type: ["place"], center: [-124, 50] },
          ],
        }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/Second Place/);

    // The OLDER (now-stale) search's response arrives last -- it must be
    // dropped, not overwrite the newer result already on screen.
    await act(async () => {
      resolveFirst({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            { id: "1", text: "First Place", place_type: ["place"], center: [-123, 49] },
          ],
        }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toMatch(/Second Place/);
    expect(container.textContent).not.toMatch(/First Place/);
  });

  // Regression (introduced by the seq-guard fix, caught in Razor re-review):
  // typing >=2 chars starts a search (loading=true), then backspacing below
  // the 2-char threshold while that request is still in flight used to leave
  // the spinner stuck on forever -- the reset() branch invalidated the token
  // but did not clear loading, and the in-flight response then early-returned
  // on the stale-token check without ever reaching setLoading(false).
  it("clears the loading spinner when the query is backspaced below the threshold while a search is in flight", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
    vi.resetModules();

    let resolveFetch!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockImplementation(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    // Search fires and the geocode request stays in flight -> spinner is up.
    fireEvent.change(input, { target: { value: "vancouver" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });
    expect(container.querySelector(".animate-spin")).toBeTruthy();

    // User backspaces below the 2-char threshold while the request is pending.
    fireEvent.change(input, { target: { value: "v" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
      await Promise.resolve();
    });
    // The spinner must clear immediately -- not wait on (or get stuck behind)
    // the now-stale in-flight response.
    expect(container.querySelector(".animate-spin")).toBeNull();

    // When the stale response finally lands it must stay cleared, not resurrect.
    await act(async () => {
      resolveFetch({ ok: true, status: 200, json: async () => ({ features: [] }) });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});

describe("SearchBar accessibility (D1)", () => {
  it("the input carries an aria-label", async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    expect(getInput(container)).toBeTruthy();
  });

  it("the persistent status region (role=status, aria-live=polite) announces the outcome text for every non-idle outcome", async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "vancouver"); // keyless -> "error"

    const region = container.querySelector('[role="status"]');
    expect(region).toBeTruthy();
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.textContent).toMatch(/Search failed — try again/);
  });

  it("nothing VISIBLE is rendered before any search is attempted (idle state) -- but the status region is already mounted, just empty (Razor W4: a freshly-inserted role=status announces inconsistently, so it must exist from first render)", async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);

    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(container.textContent).not.toMatch(/No matches in BC/);
    expect(container.textContent).not.toMatch(/failed/i);

    const region = container.querySelector('[role="status"]');
    expect(region).toBeTruthy();
    expect(region?.textContent).toBe("");
  });

  it("the status region's text clears when the dropdown closes (Escape), so re-triggering the same outcome later is a real text change and re-announces", async () => {
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "vancouver"); // keyless -> "error"
    const region = container.querySelector('[role="status"]');
    expect(region?.textContent).toMatch(/failed/i);

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(region?.textContent).toBe("");
  });

  it("aria-controls on the input references the listbox's own id/role (restored combobox contract), and the listbox has no aria-live ancestor -- a live 5-result listbox must not re-announce on every keystroke", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
    vi.resetModules();
    mockFetchOnce({
      json: async () => ({
        features: [
          { id: "1", text: "Vancouver", place_type: ["place"], center: [-123.1, 49.28] },
        ],
      }),
    });
    const { SearchBar } = await import("./SearchBar");
    const { container } = render(<SearchBar onLocationSelect={vi.fn()} />);
    const input = getInput(container);

    await search(input, "vancouver");

    expect(input.getAttribute("aria-controls")).toBe("search-results");

    const listbox = container.querySelector("#search-results");
    expect(listbox).toBeTruthy();
    expect(listbox?.getAttribute("role")).toBe("listbox");

    // Walk up from the listbox -- none of its ancestors may carry
    // aria-live. Before the fix, id="search-results" lived on a
    // role="status" aria-live="polite" wrapper that the listbox rendered
    // INSIDE, so every keystroke re-announced all 5 results.
    let node: Element | null = listbox;
    while (node) {
      expect(node.getAttribute("aria-live")).toBeNull();
      node = node.parentElement;
    }
  });
});
