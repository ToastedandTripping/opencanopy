# Architecture

OpenCanopy is a conservation mapping platform for British Columbia. It renders
government forest data on an interactive map using a three-tier rendering
pipeline that scales from province-wide overview (z4) to individual polygon
detail (z18).

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 + React 19 + TypeScript |
| Map engine | MapLibre GL JS 5 via react-map-gl 8 |
| Vector tiles | PMTiles 4 (single archive, Cloudflare R2) |
| Raster overviews | Pre-rendered PNG tiles (R2, forest-age only) |
| Live data | BC OGC WFS 2.0.0 via Netlify Edge Function proxy |
| Styling | Tailwind CSS 4 |
| Hosting | Netlify |
| Testing | Vitest (unit) + Playwright (e2e) |

## Rendering Pipeline (Three Tiers)

Each layer can use up to three data sources, selected by zoom level.
Not every layer uses all three tiers -- only `forest-age` uses all of them.

```
z4-z9       Raster overview PNGs (forest-age only)
            Pre-rendered 256px tiles, zero geometry cost.
            Prevents Chrome crashes from rendering millions of polygons.

z4-z12      PMTiles vector tiles (12 layers in one archive)
            Rendered via MapLibre imperative API (not declarative
            react-map-gl, which fails with async PMTiles sources).
            Shared source ID: "opencanopy"

z13-z18     WFS GeoJSON (live government data)
            Fetched per-viewport through Netlify Edge Function proxy.
            Debounced (300ms priority 0, 800ms others), cached in memory.
```

The handoff between tiers happens in `DataLayer.tsx`. For layers with a
`tileSource`, WFS kicks in at `tileSource.maxZoom + 1` (currently z13).
For WFS-only layers (fish-streams, species-at-risk, tap-deferrals), WFS
is the only source.

### Forest-Age Special Handling

The forest-age layer has additional complexity:

- **Raster overview** at z4-z9 with per-class variants (e.g. old-growth-only
  tiles at `.../raster/old-growth/{z}/{x}/{y}.png`)
- **Color continuity**: all forest-age class colors are defined in a
  single source of truth (`src/lib/layers/forest-age-colors.json`)
  consumed by the Python raster pipeline, TypeScript layer registry,
  DataLayer component, PDF generator, and story map. When a single
  class is filtered, PMTiles vector fill-color is overridden to match
  the raster theme color (gold for old-growth) to prevent a jarring
  color jump at the raster-to-vector transition
- **Water subtraction**: the pipeline removes lake polygons from forest-age
  data via GDAL/GEOS before tiling, preventing over-reporting of carbon
  stored in water bodies

## Layer Registry

All 18 layers are defined in `src/lib/layers/registry.ts`. Each entry
specifies data source, tile source, style, zoom range, legend, and
fetch priority. The registry is the single source of truth for what
the map can render.

### Layers by Category

| Category | Layers | Tile Source |
|----------|--------|-------------|
| Forest (3) | forest-age, logging-risk, cutblocks | PMTiles + WFS |
| Accountability (1) | tenure-cutblocks | PMTiles + WFS |
| Disturbance (1) | fire-history | PMTiles + WFS |
| Protection (5) | tap-deferrals, parks, conservancies, ogma, conservation-priority | Mixed (tap-deferrals is WFS-only) |
| Water (2) | fish-streams, community-watersheds | Mixed (fish-streams is WFS-only) |
| Species (3) | species-at-risk, wildlife-habitat-areas, ungulate-winter-range | Mixed (species-at-risk is WFS-only) |
| Context (3) | satellite, mining-claims, forestry-roads | Mixed (satellite is external raster) |

### Default-Enabled Layers

Only `forest-age` and `parks` are enabled by default (`defaultEnabled: true`).

Layer state priority: URL hash > localStorage > registry defaults.
Managed by `useLayerState.ts`, persisted to `localStorage("opencanopy-layers")`.

## Data Pipeline

Raw government data becomes map tiles through four phases. All scripts
live in `scripts/pipeline/`.

```
Phase 1: Download          scripts/pipeline/download.sh
  Bulk FGDB for VRI (~4GB download, ogr2ogr to NDJSON)
  ogr2ogr WFS pagination for 11 other layers
  Output: data/downloads/{layer}-raw.ndjson

Phase 2: Transform          scripts/pipeline/transform.ts
  Streaming NDJSON processing (handles 10GB+ VRI)
  VRI classification: PROJ_AGE_1 + HARVEST_DATE -> old-growth|mature|young|harvested
  Per-layer property extraction and normalization
  Output: data/geojson/{layer}.ndjson

Phase 3: Preprocess         scripts/pipeline/preprocess.ts
  Feature validation via scripts/lib/validate-features.ts
  Water subtraction for forest-age (GDAL/GEOS, ~63 min)
  Atomic writes ({path}.tmp -> rename on completion)
  Output: data/geojson/preprocessed/{layer}.ndjson

Phase 4: Build Tiles        scripts/pipeline/build-tiles.ts
  Single tippecanoe invocation over all 12 tiled layers
  Archives previous PMTiles (retains 3 most recent)
  Output: data/tiles/opencanopy.pmtiles (~1.5-2.0GB, 2-3 hours)

Phase 5: Raster Overviews   scripts/build-raster-tiles.py (forest-age only)
  Rasterizes NDJSON to PNG tiles at z4-z10
  Multiple themes: forest-age (4-class), old-growth (gold), conservation-gap
  Output: data/raster-tiles/{theme}/{z}/{x}/{y}.png
```

### Tippecanoe Configuration

Key flags for the single-pass build (documented in `build-tiles.ts`):

- `-Z 4 -z 12`: zoom range 4-12
- `--drop-densest-as-needed`: prefer dropping features over coalescing
  (coalesce silently reassigns classification attributes — tippecanoe #523)
- `-M 5000000`: 5MB tile cap (reduces drop frequency)
- `--low-detail=11`: 2048-unit grid at overview zooms (prevents zero-area quantization)
- `--minimum-detail=10`: 1024-unit floor
- `--full-detail=12`: 4096-unit grid at z12 (full boundary fidelity)
- `--buffer=64`: industry standard for polygon tile coverage
- `--no-tiny-polygon-reduction`: coalesce into neighbors, not placeholders
- `--attribute-type`: pinned for `FIRE_YEAR`, `class`, `age`, `species`,
  `DISTURBANCE_START_DATE`, `company_id` (prevents type inference divergence)
- `-L name:file` per layer (not `-l`, which merges all into one)

### Deployment

PMTiles are uploaded to Cloudflare R2 at:
```
https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v9.pmtiles
```

Raster overview tiles at:
```
https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/raster/{theme}/{z}/{x}/{y}.png
```

## Audit Scripts

Quality assurance scripts live at `scripts/audit-*.ts` with shared
utilities in `scripts/lib/audit-*.ts`.

| Script | Purpose |
|--------|---------|
| `audit-source-fidelity.ts` | Source-to-tile tracing, property preservation |
| `audit-geometry-precision.ts` | Coordinate precision, simplification artifacts |
| `audit-spatial.ts` | Geometry validity, BC bounding box, coordinate system |
| `audit-adversarial.ts` | Edge cases, null handling, boundary conditions |
| `audit-crosssource.py` | Cross-layer overlap consistency (tenure vs fire) |
| `audit-crosssource-lite.ts` | Lightweight JS version of cross-source checks |
| `audit-property-deep.ts` | Deep property validation per layer schema |
| `audit-temporal.ts` | Year field parsing for timeline layers |
| `audit-tiles.ts` | PMTiles metadata, layer existence, zoom ranges |
| `audit-trend.ts` | Statistical trend analysis across builds |
| `audit-cross-zoom.ts` | Cross-zoom classification consistency (z6 vs z12) |
| `audit-all.ts` | Unified runner for the full suite |

## Key Files

| File | Role |
|------|------|
| `src/lib/layers/forest-age-colors.json` | Shared color constants (Python + TypeScript) |
| `src/lib/layers/registry.ts` | All 18 layer definitions |
| `src/lib/layers/presets.ts` | 11 preset layer combinations |
| `src/types/layers.ts` | TypeScript types for layers, sources, styles |
| `src/components/map/DataLayer.tsx` | Core rendering component (PMTiles + WFS + raster) |
| `src/components/map/CanopyMap.tsx` | Map container (MapLibre + terrain) |
| `src/components/panels/LayerPanel.tsx` | Layer toggle UI |
| `src/hooks/useLayerState.ts` | Layer enable/disable + URL/storage sync |
| `src/lib/data/wfs-client.ts` | WFS proxy client (debounce, cache, dedup) |
| `netlify/edge-functions/wfs-proxy.ts` | WFS proxy edge function |
| `.razor-checklist.md` | Production bug patterns (read before reviewing diffs) |

## Known Architectural Constraints

1. **react-map-gl fill layer bug**: Declarative `<Layer>` components fail
   with async PMTiles sources. All tile layers use imperative
   `mapInstance.addLayer()` via `PmtilesLayers` component.

2. **Shared PMTiles source**: All 12 tiled layers share one MapLibre source
   (`opencanopy`). Source registration is idempotent -- first layer to mount
   creates it, subsequent layers reuse it.

3. **WFS viewport area guard**: WFS-only layers skip fetching when viewport
   exceeds ~50,000 km^2 to avoid overwhelming the BC government endpoint.

4. **Raster-to-vector color continuity**: `RASTER_THEME_COLORS` in
   `DataLayer.tsx` is derived from `forest-age-colors.json`. Any new
   per-class raster theme must add an entry to the shared JSON.

## Landing Page Architecture (planned)

The scrollytelling landing page uses a hybrid rendering approach to
separate cinematic scroll performance from data exploration:

```
Sections 1-3    Pre-rendered assets (photos + composited PNGs)
                No MapLibre. Pure CSS/JS crossfade driven by scroll.
                Timeline: 12-15 frames at key years (1950-2025),
                forest-age raster base + accumulated cutblocks overlay.

Section 4       Crossfade to live MapLibre
                Last pre-rendered frame opacity-swaps with MapLibre
                canvas at matching viewport. Camera dive to Fairy Creek.

Sections 5-6    Live MapLibre + photography
                Full data fidelity (PMTiles + WFS).
                Closer section returns to static photo + CTA.
```

This separation exists because rendering millions of vector polygons
at province scale during smooth scroll destroys frame rate. The raster
tier and pre-rendered frames handle the cinematic sections; the vector
tile engine handles the interactive sections.
