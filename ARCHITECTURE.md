# OpenCanopy — Architecture

BC forest map: faithful government data rendered as PMTiles and live WFS,
served as a public conservation reference. This document is the written
design — the oracle future audits reconcile the code against. If code and
this doc disagree, one of them is wrong on purpose: figure out which, then
fix that one.

## Scope rule (the load-bearing one)

The base tileset is **government-truthful only**. Synthesis layers (risk
proxies, fire-age reconciliation, disturbance models) are separate layers,
clearly labelled, and are not part of the open-source base. (Known tension:
`logging-risk` is a derived risk proxy living in the main registry — an open
decision, tracked in ROADMAP, not an endorsement.)

## The layer registry pattern

**A layer is one config object** (`src/lib/layers/registry.ts`, ~18 entries:
17 data layers + satellite). A `LayerDefinition` declares everything the
renderer needs:

- `source` — WFS endpoint (proxied), raster URL, with attribution
- `tileSource?` — PMTiles archive + source-layer (`opencanopy-v10.pmtiles`,
  max zoom 12, on R2) and optional `minZoom` crash-gate
- `rasterOverview?` / `rasterOverviewClassUrl?` — pre-rendered PNG tiles
  (z4–z9) for layers too dense for vector rendering at province scale
- `style` — MapLibre paint, `zoomRange`, legend items, interactivity

Components never special-case a layer id; they interpret the config.
Only 7 of 18 registry entries are publicly available at runtime
(`PUBLIC_LAYER_IDS` → `LAYER_REGISTRY_AVAILABLE`); the remaining 11 are
gated — they exist in the full registry for audit coverage and can be
re-enabled by adding their id to the public set.

The proxy keeps a mirrored per-layer config (`LAYER_CONFIG` in
`netlify/edge-functions/wfs-proxy.ts`); `proxy-consistency-audit` guards the
mirror against drift. Three proxy entries have no registry counterpart
(`watershed-boundaries` for watershed selection, `operating-territories` and
`planned-cutblocks` for future layers) — the audit documents these as
informational orphans.

URL single source of truth: `src/lib/r2-config.ts` (R2 origin, raster URL
template). Never inline an R2 URL elsewhere.

## Rendering: one layer, up to three sources by zoom

`DataLayer` (`src/components/map/DataLayer.tsx`) renders any registry layer
with a zoom handoff:

```
z4 ──────── z9 │ z10 ───────── z12 │ overzoom ──→ z18
raster overview │ PMTiles vector    │ PMTiles overzoom
(PNG, no parse) │ (GPU filters)     │
                │        WFS GeoJSON (WFS-only layers, viewport fetches)
```

- **Raster overviews** avoid province-scale WebGL crashes (forest-age is
  ~6.2M polygons). Default 4-class set plus per-class isolation sets
  (`/raster/{class}/`), swapped by legend class filters.
- **PMTiles** render imperatively (`PmtilesLayers`) because declarative
  react-map-gl `<Layer>` fails for async-loading remote PMTiles sources.
  Inserted below the first basemap symbol layer.
- **WFS GeoJSON** renders imperatively (`WfsLayers`) for WFS-only layers;
  data arrives via the proxy on `moveend`, filtered client-side for the
  timeline. For tile-backed (dual-source) layers, PMTiles+overzoom are the
  user-visible source at all zooms — WFS adds nothing visible there.
- **Satellite (raster source)** renders imperatively (`SatelliteLayers`),
  anchored below the earlier of (first `layer-*` overlay, first symbol layer)
  via `findSatelliteAnchor` — deterministic regardless of toggle order.
- **Layer z-order** must be deterministic, never mount-order dependent:
  basemap → satellite → raster overviews → fills → lines/points → symbols.

Invariants (enforced by `src/test/audit/*`):
1. Any fill layer on the shared forest-age PMTiles source carries a
   `tileSource.minZoom` crash-gate unless it has a raster overview
   (`registry-audit` check 5).
2. Paint objects passed to MapLibre never contain `undefined` values — build
   them with `pickDefinedPaint` (a single undefined key silently kills the
   whole paint spec).
3. Class colors match across legend, vector paint, and raster tiles
   (`color-audit`); story map constants match the interactive registry
   (`story-consistency-audit`).
4. Effective layer opacity stays ≥0.15 within its zoomRange (`opacity-audit`).

## Status model

`LoadingContext` tracks per-layer status: `loading → ok | empty | zoom |
error`, surfaced by `StatusToast`. **Dual-source rule:** tile-backed layers
report status only from the PMTiles path; WFS fetch results set status only
for WFS-only layers (a WFS hiccup must not claim "data unavailable" while
tiles render fine). `DataLayer` instances are always mounted (CanopyMap
mounts every registry layer once; the P1a memo redesign), so a status is
cleared when its layer is toggled off, not on unmount.

## The WFS proxy

`netlify/edge-functions/wfs-proxy.ts` (`/api/wfs`) is the only client path to
BC's WFS — origin-locked CORS (`opencanopy.ca` only), per-IP rate-limited,
response-shaping:

- Converts WGS84 viewport bboxes to BC Albers (EPSG:3005) for the upstream.
- GeoServer constraint: `bbox` and `CQL_FILTER` are mutually exclusive — a
  layer with a CQL filter must embed the bbox as
  `CQL_FILTER=BBOX(GEOMETRY,…) AND (filter)`.
- Property whitelisting (40–60% payload cut on VRI), company-id resolution
  for tenure layers, zoom-scaled feature counts.
- Separate point-query path (`INTERSECTS`) for watershed lookups.

Client side, `src/lib/data/wfs-client.ts` adds debounce, in-flight dedupe,
abort-on-supersede, and a 50-entry LRU cache.

## State

Hooks own UI state; URL is the shareable source of truth. On `/map`:

- `useLayerState` — enabled layers; hydrates URL → localStorage → defaults.
  Renamed layer ids (2026-08-26: `tap-deferrals → old-growth-250`,
  `conservation-priority → tap-priority`) keep aliases on every input path
  (URL hash, localStorage, popstate).
- `useMapState` — viewport ↔ URL, history push only on genuine user changes
- `useTimeline` — the year. Since 2026-08-27 the year is a MapLibre
  global-state uniform: the registry's filter/opacity expressions read
  `["global-state", "currentYear"]` on the GPU and each tick is one
  `map.setGlobalStateProperty("currentYear", …)` call from `map/page.tsx`
  (`setFilter` remains only for legend class filters and WFS layers). The
  playhead is render-gated: it advances only after `map.once("idle")` (Phase
  A "honest timeline"), via a `waitForRender` injected into the hook.
- `useWatershedSelection` — watershed click/selection lifecycle
- `useDialogA11y` — dialog focus management (focus-in, restore, Tab trap)

On `/` (the landing story):

- `useScrollytelling` / story — the scrollytelling map (`src/lib/story/`) is a
  deliberately separate, deterministic layer setup; it shares constants with
  the registry via audits, not imports. Do not merge the two paths (decided
  2026-06-02). The one deliberate shared *data* dependency is
  `src/data/scrub/*.json` (cumulative-area pacing tables built by
  `scripts/build-scrub-tables.py`): the story scrubs by them and the `/map`
  timeline's scented track reads the fire table's per-year shares.
- `useDeviceCapability` — device performance detection (SSR-safe lazy init);
  its only consumer is `ScrollytellingContainer`.

Presets (`src/lib/layers/presets.ts`) are named layer combinations the map
shell activates.

## Pipeline (data → tiles)

`scripts/pipeline/`: `download.sh` (bulk FGDB) → `transform.ts` →
`preprocess.ts` (water subtraction, classing) → `build-tiles.ts`
(single-pass tippecanoe → PMTiles v10) → `verify.ts`, orchestrated by
`rebuild.sh`. Raster overviews come from `scripts/build-raster-tiles.py`
(rasterio; all themes derive from `src/lib/layers/forest-age-palette.json`,
the single color authority shared with the TS registry — `color-audit`
cross-checks both sides via the script's `--dump-themes` mode). The raster
build reads the slimmed `forest-age-rasterizable.ndjson` produced by
`scripts/pipeline/simplify-for-raster.py` (the full-fidelity file is ~63 GB
as Python objects and exceeds the 32 GB build machine; half-pixel-at-z9
simplify, no features dropped; raster input ONLY — PMTiles keep full
fidelity). Output ships to R2 under versioned dirs (`raster/v2/...`):
upload new dirs, flip the client URL in `r2-config.ts`, keep old dirs one
verified release.

Story overlays come from the same preprocessed checkpoint:
`scripts/build-year-overlays.py` (per-year cutblock and fire PNGs) and
`scripts/build-scrub-tables.py` (pacing curves + absolute totals).
`scripts/generate-tile-manifest.py` emits the optional binary-tile manifest
the story's `ocbin://` protocol consults (fail-open when absent).

Quality net: the audit suite (`scripts/audit-*.ts`) traces source→tile
fidelity, geometry precision, spatial/temporal/cross-source consistency.
`npm run audit:all` runs eight of them; `audit:trend` (archived reports),
`audit:viewport` (needs a prior `next build`) and the Python
`audit:crosssource` (live WFS) run separately. `e2e/` adds screenshot
regression (`audit:visual`, needs a dev server) and the production monitor
(`audit:live`, its own Playwright config so `test:e2e` never hits prod).

## Layout

```
src/app/            routes (map shell at /map, story at /, privacy, OG images)
src/components/     map/ (CanopyMap, DataLayer, legend, popup, draw, timeline)
                    panels/ (layers, calculator, hotspots), story/, landing/, ui/
src/hooks/          state hooks + useDragDismiss
src/contexts/       LoadingContext (per-layer status model)
src/data/           chapters (story), companies (licensee SSOT), hotspots,
                    scrub/ (pacing tables shared by story + timeline)
src/types/          LayerDefinition and friends
src/lib/            layers/ (registry, presets, forest-age-palette.json),
                    taxonomy/ (forest-age class SSOT), data/ (wfs-client,
                    forest-carbon-client, watershed-client, DataFetchError),
                    story/, carbon/ (calculator — must match METHODOLOGY.md
                    exactly), timeline/, export/, debug/, r2-config, mapConfig,
                    a11y/ (reduced-motion), map/ (shared GeoJSON/layer utils,
                    popup-keys), keyboard/ (map shortcuts), math/ (interpolation),
                    react/ (merge-refs)
src/test/           unit + audit suites (vitest), mocks/maplibre
netlify/            edge functions (wfs-proxy)
scripts/            pipeline v2, raster builder, audit suite
e2e/                playwright screenshots + live monitoring
```
