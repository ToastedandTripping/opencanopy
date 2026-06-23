# Probe: Phase 1b — Static Forest Base Regeneration
Date: 2026-06-23
Plan: (forthcoming) .claude/plans/phase-1b-static-base.md
Scope: verify oracle values before writing a generator for the scroll-story's
static green forest base (`forest-base.png`). Backs the consolidated story-render
plan, Phase 1b (`~/marvin/research/scroll-driven-temporal-map-animation-20260620/consolidated-plan.md`).

## Enumeration (reality first)

- **Static base file:** `public/raster/cutblocks-by-year/forest-base.png` — lives
  WITH the 76 per-year cutblock overlays (`1950.png`…`2025.png`), not in
  `public/images/story/`. `file`: PNG **1024 × 501, 1-bit colormap (mode P)**.
- **Generator references:** `grep "forest-base"` → only consumers
  (`setup-layers.ts`, `visibility.ts`, two tests). NO Python/script generates it.
  `build-year-overlays.py` generates the year frames but NOT the base.
- **Pipeline scripts present:** `scripts/build-year-overlays.py`,
  `scripts/build-raster-tiles.py`, `scripts/water-subtract-gdal.py`,
  `scripts/pipeline/{simplify-for-raster.py,preprocess.ts,transform.ts,build-tiles.ts}`.
- **Source data on disk** (`/home/leesalo/Projects/opencanopy/data/checkpoint/`, ~18 GB):
  `vri-raw.ndjson` 13.3 GB; `preprocessed/forest-age.ndjson` 9.85 GB (full);
  `preprocessed/forest-age-rasterizable.ndjson` **2.37 GB (slim, the raster input)**.
- **Masking inputs:** `data/geojson/reference/` does **NOT exist**; no
  `fwa-lakes.gpkg` / `fwa-lakes.ndjson` / alpine / coast files anywhere under `data/`.
- **Device capability:** `useDeviceCapability.ts` derives `supports3D`/`isMobile`
  from `hardwareConcurrency` + screen width + coarse pointer. NO `MAX_TEXTURE_SIZE` query exists.

## Verified Facts

| # | Claim | Verified Value | Method | Status |
|---|-------|---------------|--------|--------|
| 1 | Base is hand-made, no generator | 1024×501 1-bit PNG; zero generator refs | `file` + `grep -r forest-base` | PROVEN |
| 2 | Registration bounds | `BC_BOUNDS/OVERLAY_BOUNDS = (-139.5, 48.0, -114.0, 60.5)` WGS84 (w,s,e,n) | `grep BC_BOUNDS build-year-overlays.py`; `OVERLAY_BOUNDS` in setup-layers.ts:22 | PROVEN |
| 3 | Grid math | width 1024 → height 501 = `int(1024 × 12.5/25.5)`; equirect rasterize → Mercator row-map resample | build-year-overlays.py:99,192-194,263,288 | PROVEN |
| 4 | Base placement on map | MapLibre `image` source, corners `[[w,n],[e,n],[e,s],[w,s]]`, `type:raster`, opacity-controlled | setup-layers.ts:158-187 | PROVEN |
| 5 | Green is baked into the PNG | raster layers don't recolor; no paint transform | setup-layers.ts:173-187 | PROVEN |
| 6 | Slim NDJSON CRS | WGS84/EPSG:4326 lon/lat (`-122.35,49.70…`) — no reprojection needed | `head -c forest-age-rasterizable.ndjson` | PROVEN |
| 7 | Class attribute + value set | `"class"` ∈ {old-growth, mature, young, harvested} ONLY | 1M-line sample: 632k mature / 149k young / 123k harvested / 96k old-growth | PROVEN |
| 8 | Source is forest-only | non-forest/alpine/rock/water VRI already dropped upstream; 6,201,456 forest features | _report.json `forest-age.finalFeatures`; class sample (no "other") | PROVEN |
| 9 | Lakes NOT subtracted in current data | `forest-age.skippedWater: true` — skipped because lakes data missing | _report.json + preprocess.ts:110-117 | PROVEN |
| 10 | build-raster-tiles.py reuse path | reads `preprocessed/forest-age.ndjson`, rasterio, palette = `forest-age-palette.json` | build-raster-tiles.py:54,71 | PROVEN |
| 11 | No texture-size detection | `useDeviceCapability` never queries `gl.MAX_TEXTURE_SIZE` | useDeviceCapability.ts (full read) | PROVEN |

## Surprises

- **The alpine/"too much green" fix is nearly free.** The slim source contains
  ONLY the 4 forest classes (fact 7/8) — non-forest VRI is already excluded
  upstream. So "green = actual forest" comes from *using the real polygons*; no
  separate alpine/BEM dataset is needed. The current base floods alpine green
  only because it's a hand-dilated blob, not because the data includes alpine.
- **Coastline crispness is also free.** VRI is land-only; rasterizing real
  polygons stops at the coast. The current bleed is the dilation, not the data.
- **Lakes will be excluded for free *by absence*, mostly.** Lakes have no forest
  polygon, so a real rasterize leaves them unpainted automatically. Explicit FWA
  lake subtraction (fact 9, data currently missing) is a *polish* refinement for
  polygon edge-bleed over water — NOT a hard blocker for a correct first base.
- **The grid machinery already exists.** `build-year-overlays.py` does the exact
  equirect→Mercator resample at the exact bounds. The base generator should reuse
  it (add a `--dataset forest-base` mode reading `forest-age-rasterizable.ndjson`,
  painting all classes one green + alpha) rather than write new projection code.

## Oracle Values (for the plan + acceptance criteria)

- **Bounds:** `(-139.5, 48.0, -114.0, 60.5)` WGS84 (w,s,e,n) — MUST match exactly.
- **Grid:** equirect rasterize at `from_bounds(w,s,e,n,width,height)`,
  `height = round(width × 12.5/25.5)`; then Mercator row-map resample. At width
  1024→501, 2048→1003, 4096→2007 (all axes < 4096).
- **Input:** `data/checkpoint/preprocessed/forest-age-rasterizable.ndjson` (WGS84,
  `class` ∈ 4 forest classes, 6.2M features).
- **Output contract:** RGBA (or paletted+alpha) PNG, forest=green / non-forest=transparent,
  written to `public/raster/cutblocks-by-year/forest-base.png`, registered identically
  to the year overlays. Acceptance: at z5 the green silhouette has crisp coastline,
  no green over ocean/alpine; lakes ≥ a few px read as holes (with FWA subtraction).
- **Reuse:** `build-year-overlays.py` grid + `forest-age-palette.json` for color authority.

## [NEEDS CLARIFICATION] — resolve in/around the plan (Lee's calls)

1. **Lake masking effort.** Ship v1 relying on "real polygons leave lakes unpainted"
   (no new dependency, fastest) — OR source FWA lakes (BC open data) → build GPKG →
   subtract, for crisp big-lake holes? Recommend: v1 without, measure at z5, add FWA
   only if big lakes visibly read as forest. (Dependency if yes: FWA lakes not on disk.)
2. **Target resolution.** 1024 (current) / 2048 / 4096? Higher = crisper coast, bigger
   single-texture upload. Research recommended ≤4096 with a 2048 fallback. Picking >1024
   REQUIRES new code: a `gl.MAX_TEXTURE_SIZE` query + branch (none exists today, fact 11).
   Recommend 2048 as the default (big crispness win, safely under every real device cap),
   4096 behind a capability check only if Phase 3 also needs it.
3. **Green value.** A design choice (Jen) — story green vs palette `mature`/`old-growth`.
   Not a probe oracle; defer to the plan's visual spec.

## Gate Check

- [x] All oracle values trace to command output / source lines, not guesses.
- [x] Every claim PROVEN; no DISPROVEN left uncorrected.
- [~] Human-on-system: enumeration run live against real files; Lee to eyeball this doc.
- [ ] Open items are the 3 above — all are scope/design *decisions*, not unverified
      external contracts. Safe to enter planning; resolve 1 & 2 before implementation.
