"use client";

import { useState, useRef, useEffect, useCallback } from "react";

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

async function geocode(query: string): Promise<SearchResult[]> {
  if (!MAPTILER_KEY) {
    return parseCoordinates(query);
  }

  try {
    const encoded = encodeURIComponent(query.trim());
    const url = `https://api.maptiler.com/geocoding/${encoded}.json?key=${MAPTILER_KEY}&country=CA&bbox=${BC_BBOX}&limit=5`;
    const res = await fetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    if (!data.features || data.features.length === 0) return [];

    return data.features.slice(0, 5).map((f: GeocodingFeature) => ({
      id: f.id ?? f.properties?.osm_id ?? String(Math.random()),
      placeName: f.text ?? f.place_name ?? "Unknown",
      region: buildRegion(f),
      center: f.center as [number, number],
    }));
  } catch {
    return [];
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
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
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    const searchResults = await geocode(q);
    setResults(searchResults);
    setOpen(searchResults.length > 0);
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
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (results.length > 0) setOpen(true);
              }}
              placeholder={MAPTILER_KEY ? "Search location..." : "Enter lat,lng..."}
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

        {/* Results dropdown */}
        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10 overflow-hidden shadow-2xl z-50">
            <ul role="listbox">
              {results.map((result, i) => (
                <li
                  key={result.id}
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
                    <div className="text-xs text-zinc-500 truncate">
                      {result.region}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
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
