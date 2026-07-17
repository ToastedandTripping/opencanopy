"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createSeqGuard } from "@/lib/data/forest-carbon-client";

// ── Types ───────────────────────────────────────────────────

interface SearchResult {
  id: string;
  placeName: string;
  region: string;
  center: [number, number]; // [lng, lat]
}

interface SearchBarProps {
  onLocationSelect: (lng: number, lat: number, zoom: number) => void;
}

// ── MapTiler geocoding ──────────────────────────────────────

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/** BC bounding box for geocoding constraint */
const BC_BBOX = "-139.06,48.22,-114.03,60.00";

/**
 * Discriminated geocode outcome (D1, honest failure states). Previously
 * `geocode()` returned `[]` for an HTTP failure, a genuinely empty result,
 * AND a thrown error alike -- three different situations collapsed into
 * one silent blank dropdown. Contained to this module-private caller
 * (SearchBar is the only consumer); the exhaustive switch in the render
 * below is tsc-enforced against this union.
 */
type GeocodeOutcome =
  | { status: "ok"; results: SearchResult[] }
  | { status: "empty" }
  | { status: "error" };

async function geocode(query: string): Promise<GeocodeOutcome> {
  if (!MAPTILER_KEY) {
    // Keyless branch: no live geocoding available at all. parseCoordinates
    // is a pure local fallback -- a valid "lat,lng" query still resolves
    // ("ok"), but anything else genuinely can't be searched without a key.
    // That's "error" (the feature is unavailable), NOT "empty" (which
    // implies a real search ran and found nothing).
    const coordResults = parseCoordinates(query);
    return coordResults.length > 0
      ? { status: "ok", results: coordResults }
      : { status: "error" };
  }

  try {
    const encoded = encodeURIComponent(query.trim());
    const url = `https://api.maptiler.com/geocoding/${encoded}.json?key=${MAPTILER_KEY}&country=CA&bbox=${BC_BBOX}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) {
      // SECURITY: the request URL embeds MAPTILER_KEY. Error copy stays
      // STATIC -- never interpolate this URL or a raw error/response body
      // into the DOM or logs.
      return { status: "error" };
    }

    const data = await res.json();
    if (!data.features || data.features.length === 0) {
      return { status: "empty" };
    }

    const results = data.features.slice(0, 5).map((f: GeocodingFeature) => ({
      id: f.id ?? f.properties?.osm_id ?? String(Math.random()),
      placeName: f.text ?? f.place_name ?? "Unknown",
      region: buildRegion(f),
      center: f.center as [number, number],
    }));
    return { status: "ok", results };
  } catch {
    // SECURITY: same static-copy rule -- do not surface the caught error.
    return { status: "error" };
  }
}

interface GeocodingFeature {
  id?: string;
  text?: string;
  place_name?: string;
  place_type?: string[];
  center: number[];
  context?: Array<{ text?: string }>;
  properties?: Record<string, unknown>;
}

function buildRegion(feature: GeocodingFeature): string {
  const parts: string[] = [];

  // Place type
  if (feature.place_type?.[0]) {
    const type = feature.place_type[0];
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    parts.push(label);
  }

  // Context hierarchy (region, province)
  if (feature.context) {
    for (const ctx of feature.context) {
      if (ctx.text) {
        parts.push(ctx.text);
        break; // Just the first context level
      }
    }
  }

  return parts.join(" · ") || "British Columbia";
}

/**
 * Fallback: parse "lat,lng" or "lng,lat" coordinates directly.
 * Detects which is which based on BC's coordinate ranges.
 */
function parseCoordinates(input: string): SearchResult[] {
  const cleaned = input.trim().replace(/\s+/g, "");
  const match = cleaned.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (!match) return [];

  const a = parseFloat(match[1]);
  const b = parseFloat(match[2]);

  if (isNaN(a) || isNaN(b)) return [];

  // BC lat range: ~48 to 60, BC lng range: ~-139 to -114
  let lng: number, lat: number;
  if (a >= 48 && a <= 60 && b >= -139 && b <= -114) {
    lat = a;
    lng = b;
  } else if (b >= 48 && b <= 60 && a >= -139 && a <= -114) {
    lat = b;
    lng = a;
  } else {
    // Just treat as lat,lng
    lat = a;
    lng = b;
  }

  return [
    {
      id: "coords",
      placeName: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      region: "Coordinates",
      center: [lng, lat],
    },
  ];
}

// ── Component ───────────────────────────────────────────────

export function SearchBar({ onLocationSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  // "idle" = no search attempted yet (or query cleared/too short). "ok" /
  // "empty" / "error" mirror GeocodeOutcome and drive which of the three
  // dropdown states renders (D1).
  const [searchStatus, setSearchStatus] = useState<"idle" | "ok" | "empty" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Out-of-order-results guard (pre-existing bug, not introduced by this
  // batch -- flagged by Razor as trivially fixable by reusing the
  // sequence-token pattern already extracted+tested in
  // forest-carbon-client.ts for the same class of race on the map page's
  // own calc pipeline). The debounce timer alone doesn't cover this: Enter
  // calls handleSearch(query) immediately, bypassing/not-clearing the
  // scheduled debounced call, so a fast Enter-then-keep-typing sequence can
  // have two geocode() calls in flight at once, and a slower EARLIER
  // request resolving after a faster LATER one would silently overwrite
  // the newer, correct results. This only guards render ordering (skips
  // applying a superseded response's state) -- it does not thread
  // AbortSignal into geocode()'s fetch, which would be a larger change
  // touching that function's error-handling contract.
  const seqGuardRef = useRef(createSeqGuard());

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setFocusedIndex(-1);
        // On mobile, also collapse the bar
        if (window.innerWidth < 768) {
          setExpanded(false);
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setFocusedIndex(-1);
        inputRef.current?.blur();
        if (window.innerWidth < 768) {
          setExpanded(false);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      // A slower, still-in-flight search from a previous (longer) query
      // must not resurrect stale results after the user's cleared back
      // down below the search threshold -- mark it superseded too.
      seqGuardRef.current.reset();
      setResults([]);
      setSearchStatus("idle");
      setOpen(false);
      // Clear loading here too: a still-in-flight response from the previous
      // (longer) query will hit the stale-token early-return below and never
      // reach setLoading(false), so the spinner would otherwise stick on
      // forever. Do NOT add setLoading(false) to that early-return -- in the
      // two-in-flight case the newer legit search is still loading.
      setLoading(false);
      return;
    }

    const { token } = seqGuardRef.current.start();
    setLoading(true);
    const outcome = await geocode(q);
    // Out-of-order guard: Enter calls handleSearch immediately without
    // clearing the scheduled debounced call, so two geocode() calls can be
    // in flight at once -- if a newer search has started since this one
    // began, drop this (now-stale) response instead of overwriting the
    // newer one's state (including the loading flag, which the newer call
    // has already set back to true for itself).
    if (!seqGuardRef.current.isCurrent(token)) return;
    setSearchStatus(outcome.status);
    // Dropdown opens for EVERY resolved outcome, not just "ok" -- the
    // empty/error states need to actually be shown (D1), not just
    // silently drop the query on the floor.
    setResults(outcome.status === "ok" ? outcome.results : []);
    setOpen(true);
    setFocusedIndex(-1);
    setLoading(false);
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);

      // Debounce search
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        handleSearch(value);
      }, 300);
    },
    [handleSearch]
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      // Use the original geocoding feature's place_type for zoom estimation
      // Since we've already mapped it, use a default zoom of 12
      // unless the result is coordinate-based
      let zoom = 12;
      if (result.id === "coords") {
        zoom = 12;
      } else if (result.region.startsWith("Region")) {
        zoom = 8;
      } else if (result.region.startsWith("Place") || result.region.startsWith("Locality")) {
        zoom = 12;
      }

      onLocationSelect(result.center[0], result.center[1], zoom);
      setQuery(result.placeName);
      setOpen(false);
      setFocusedIndex(-1);
      setExpanded(false);
      inputRef.current?.blur();
    },
    [onLocationSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || results.length === 0) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSearch(query);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) =>
            prev > 0 ? prev - 1 : results.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < results.length) {
            handleSelect(results[focusedIndex]);
          } else {
            handleSearch(query);
          }
          break;
      }
    },
    [open, results, focusedIndex, query, handleSearch, handleSelect]
  );

  // Mobile: show a compact button that expands to the full search input
  const handleExpand = useCallback(() => {
    setExpanded(true);
    // Auto-focus after render
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Announcement text for the persistent status region (Razor W4). Empty
  // string whenever there's nothing to say -- idle, dropdown closed, or a
  // fresh "ok" result set already conveyed visually by the listbox itself
  // (that set must NOT also live inside an aria-live region, or SRs
  // re-announce all 5 results on every keystroke). Gated on `open` too, not
  // just `searchStatus`, so closing and later reopening onto the SAME
  // status is a real text change (empty -> message) and re-announces,
  // instead of silently staying whatever it said last time.
  const statusMessage =
    !open || searchStatus === "idle"
      ? ""
      : searchStatus === "empty"
        ? "No matches in BC"
        : searchStatus === "error"
          ? "Search is unavailable — try again"
          : `${results.length} result${results.length === 1 ? "" : "s"} found`;

  return (
    <div ref={containerRef} className="relative w-full md:w-[min(360px,calc(100vw-2rem))]">
      {/* Mobile collapsed state: just the icon button */}
      {!expanded && (
        <button
          onClick={handleExpand}
          className="md:hidden flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-zinc-400 text-sm w-full"
          aria-label="Search for a location"
        >
          <SearchIcon />
          <span>Search location...</span>
        </button>
      )}

      {/* Desktop always visible, mobile only when expanded */}
      <div className={`${expanded ? "block" : "hidden"} md:block`}>
        <div className="relative">
          <div className="flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-full bg-black/60 backdrop-blur-md border border-white/10">
            <SearchIcon />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchStatus !== "idle" && open}
              aria-controls="search-results"
              aria-activedescendant={focusedIndex >= 0 ? `search-result-${focusedIndex}` : undefined}
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (searchStatus !== "idle") setOpen(true);
              }}
              placeholder={MAPTILER_KEY ? "Search location..." : "Enter lat,lng..."}
              aria-label="Search for a location"
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none min-w-0"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {loading && (
              <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-300 rounded-full animate-spin shrink-0" />
            )}
            {query && !loading && (
              <button
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setSearchStatus("idle");
                  setOpen(false);
                  inputRef.current?.focus();
                }}
                className="flex items-center justify-center w-8 h-8 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                aria-label="Clear search"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="w-3.5 h-3.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Results dropdown. D1: renders for ALL three resolved outcomes
            (ok/empty/error), not just "ok" -- an empty or failed search
            previously dropped the query on the floor with no visible
            signal. This container is NOT itself an aria-live region (Razor
            W4) -- the combobox's popup listbox (id="search-results",
            role="listbox") lives directly inside it so the input's
            aria-controls resolves to the actual popup, and a live 5-item
            listbox re-announcing on every keystroke is exactly the bug this
            fixes. SR announcement for the non-listbox outcomes happens via
            the separate persistent status region below instead. */}
        {open && searchStatus !== "idle" && (
          <div className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl z-50">
            {searchStatus === "ok" && (
              <ul id="search-results" role="listbox" aria-label="Search results">
                {results.map((result, i) => (
                  <li
                    key={result.id}
                    id={`search-result-${i}`}
                    role="option"
                    aria-selected={focusedIndex === i}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setFocusedIndex(i)}
                    className={`
                      flex items-start gap-3 px-4 py-2.5 cursor-pointer
                      transition-colors duration-100
                      ${focusedIndex === i ? "bg-white/10" : "hover:bg-white/5"}
                    `}
                  >
                    <div className="mt-0.5 shrink-0">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        className="w-4 h-4 text-zinc-500"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-200 truncate">
                        {result.placeName}
                      </div>
                      <div className="text-xs text-zinc-400 truncate">
                        {result.region}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {searchStatus === "empty" && (
              <div className="px-4 py-3 text-sm text-zinc-400">No matches in BC</div>
            )}

            {searchStatus === "error" && (
              <div className="px-4 py-3 text-sm text-zinc-400">
                Search is unavailable — try again
              </div>
            )}
          </div>
        )}

        {/* Persistent SR status region (Razor W4). ALWAYS mounted (not
            conditionally rendered with content) -- a freshly-inserted
            role="status" node announces inconsistently across SR/browser
            pairs, so this stays in the DOM with its text simply changing.
            Visually hidden; carries only the non-listbox outcomes plus an
            optional result count for "ok" -- never the listbox itself. */}
        <div role="status" aria-live="polite" className="sr-only">
          {statusMessage}
        </div>
      </div>
    </div>
  );
}

// ── Search icon ─────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className="w-4 h-4 shrink-0 text-zinc-400"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
