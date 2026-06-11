# OpenCanopy — Layer Fidelity Plan (2026-06-10)

One integrated plan covering Lee's live-site layer audit (Overview / Threats /
Ecology, 2026-06-10) and the behavior-changing leftovers from the 06-10 code
refresh. Every diagnosis below was verified empirically this session — live
curls against opencanopy.ca, BC's WFS, and the R2 bucket; pixel analysis of the
raster tiles; source reads of the exact lines.

## Verified diagnoses

**D1 — Satellite renders on top of everything (Overview).**
`satellite` is `opacity: 1` (registry.ts:736) and last in the Overview preset
(`presets.ts:13`). Raster layers mount declaratively with **no `beforeId`**
(DataLayer.tsx:1034-1053), so react-map-gl appends them topmost in mount order.
Last-mounted, fully opaque satellite covers forest-age and parks. The "flash of
colors then satellite covers it" is tile-load timing. Same fragility class for
the forest-age raster overviews (also declarative, unanchored).

**D2 — Per-class toggles blank the map below z10 (Threats).**
The client logic is correct (verified: legend stores an enabled-label set,
page.tsx:147-166; DataLayer maps labels→slugs and swaps default raster for
per-class rasters, DataLayer.tsx:1062-1121). The **tiles are broken at the
source**: `/raster/mature|young|harvested/*` on R2 are ~100% opaque BLACK with
zero class pixels; `/raster/old-growth/*` is the "gold on faint-dark" *theme*
(build-raster-tiles.py THEMES, lines 46-70), not an isolation overlay. Toggling
off one class hides the default raster and fades in opaque black tiles — the
map "disappears." `build-raster-tiles.py` has **no per-class isolation themes
at all**; the R2 dirs are orphaned bad output. (Tiles probed at z4-z9: HTTP 200,
pixel-counted.)

**D3 — "BC data unavailable" on fish-streams + tap-deferrals (Ecology/Protection).**
The proxy sets `bbox` AND `CQL_FILTER` as separate WFS params
(wfs-proxy.ts:705,711). GeoServer rejects that: *"bbox and cql_filter both
specified but are mutually exclusive"* (reproduced against BC directly). So
**every layer with a `cqlFilter` fails on every bbox fetch**: `fish-streams`,
`tap-deferrals` (kills the Protection preset's headline layer), and `cutblocks`'
supplemental fetch (masked by tiles). `species-at-risk` has no cqlFilter — works
(verified live: returns features). The error UI was telling the truth.
**Fix shape proven live**: `CQL_FILTER=BBOX(GEOMETRY,<albers w,s,e,n>) AND
(<filter>)` returns stream features.

**D4 — Parks not clearly denoted (Overview).**
`fill-color: rgba(255,255,255,0.1)` + white outline (registry.ts:389-390) —
a 10%-alpha white wash, invisible over satellite.

**D5 — Species-at-risk invisible even when working.**
Upstream + proxy fine (verified live). But `circle-radius` is 1→2.5px across
z7-14 at `circle-opacity: 0.4` (registry.ts:614-625) — sub-perceptual. The
error Lee saw was most likely a transient BC hiccup; the styling problem is
permanent.

**D6 — Old-growth isolation renders gold; Lee wants palette consistency.**
Gold is the raster *theme* (#eab308, build-raster-tiles.py:55) plus a matching
vector override `RASTER_THEME_COLORS` (DataLayer.tsx:48-50) added to avoid a
gold→green jump at the raster/vector handoff. Decision (Lee, live audit): keep
old-growth **dark green** everywhere.

**D7 — Threats preset is redundant.**
`forest-age` already encodes harvested (red); `cutblocks` adds FTEN boundaries
on top. Decision (Lee): drop `cutblocks` from the Threats preset; rely on
forest-age with sharper opacity. (Cutblocks stays in the registry and other
presets — it's a different dataset, just redundant *in this view*.)

**D8 — Conservancies are outline-only.**
Line-dash style (registry.ts:419-427); complex areas read as spaghetti.
Decision (Lee): add a faint interior fill so containment is legible.

**D9 — Forest-age overpowers as a backdrop (Ecology) / needs to be faint under
satellite (Overview) / sharper alone (Threats).**
Presets can only enable layers (presets.ts) — there is no per-preset styling.
Needs a small `styleOverrides` mechanism on presets (opacity multiplier per
layer id), applied when a preset activates.

**D10 — WfsLayers hooks-order + vestigial WFS fetch (refresh-mandated).**
`if (layer.tileSource) return null` sits above five hooks
(DataLayer.tsx:478-481) — rules-of-hooks violation, StrictMode dev crash. And
for tile-backed layers DataLayer still fetches WFS data that renders nowhere
(WfsLayers returns null; comment at :974 claiming the loading flag drives its
indicator is false for these layers). Fix: mount `<WfsLayers>` only when
`!layer.tileSource` (kills the early return), guard the cleanup, and skip
`loadData` entirely for tile-backed layers. ROADMAP already records that the
rendered behavior is unaffected (verified live during the 06-09 push).

## Execution — four waves, one relay

### Wave 1 — Correctness (code-only, ships first)
1. **Proxy CQL fix** (wfs-proxy.ts bbox path): when `config.cqlFilter` exists,
   emit `CQL_FILTER=BBOX(GEOMETRY,w,s,e,n) AND (filter)` (Albers coords, as
   now; filter parenthesized) and omit the `bbox` param. Keep plain `bbox`
   for filterless layers. `count`/maxFeatures params unchanged.
   **Fix shape pinned live (2026-06-10 session):** fish-streams GetFeature
   against BC with `CQL_FILTER=BBOX(GEOMETRY,1035926,542789,1071379,576537)
   AND STREAM_ORDER>=3` returned LineString features; the same viewport via
   the separate-params form reproduces the mutual-exclusion ExceptionReport.
   Unit-test the URL builder (export it). Add **new** live-health checks
   (e2e/monitoring) asserting every cqlFilter layer returns features —
   test viewports must sit inside each layer's `zoomRange` AND under the
   50,000 km² WFS area guard (DataLayer.tsx:930-947).
2. **Deterministic z-order (scoped to the satellite bug)**: satellite stops
   being declarative. A declarative `beforeId={firstSymbolId}` cannot work:
   the basemap style is remote, so `firstSymbolId` is `undefined` on first
   render and react-map-gl never re-resolves it — the anchor silently no-ops
   (round-2 critic finding). Instead, satellite becomes a small imperative
   component **pattern-cloned from PmtilesLayers** (the proven in-repo shape:
   effect waits for style load, adds source + layer, cleanup removes):
   - Insertion anchor: the first style layer whose id starts with `layer-`
     (excluding satellite's own), else `firstSymbolId`, else append. All data
     layers use the `layer-${id}` prefix; the OpenFreeMap dark fallback
     basemap has zero `layer-`-prefixed ids (verified against the live style
     JSON, 47 layers). One implementation-time check remains: confirm the
     production MapTiler backdrop-dark style is also collision-free (needs
     the API key). This puts satellite below every overlay **regardless of
     toggle order** — including enabling satellite after overlays are
     already mounted.
   - Opacity changes via `setPaintProperty` in a separate effect (matching
     the existing WfsLayers visibility pattern).
   - No render-order sorting in the map shell — the anchor makes mount order
     irrelevant, which is the property we actually need.
   Forest-age raster overviews stay declarative: their zoom band (z4-9) is
   disjoint from PMTiles (z10+), and with satellite anchored low the observed
   bug is gone. Broader raster-vs-WFS-overlay ordering at z4-9 is a known,
   pre-existing limitation — out of scope unless observed (named here so it
   isn't rediscovered as drift).
   **CI gate (the only check that catches the silent no-op):** assertion that
   in `getStyle().layers`, satellite's index < the index of every other
   `layer-*` entry — unit (maplibre mock) + e2e screenshot of the Overview
   stack.
3. **WfsLayers fix (D10)**: conditional mount + cleanup guard + fetch skip.
   The critic verified the dual-source high-zoom WFS render path is dead code
   today (the early return precedes all hooks), so the fetch skip is
   behavior-neutral by construction. Characterization tests with the existing
   `src/test/mocks/maplibre.ts`; named StrictMode assertion: after
   double-mount of a tile-backed layer,
   `map.getLayer("layer-<id>-fill") === undefined` and no crash; for a
   WFS-only layer the fill/line/circle layers exist exactly once.

### Wave 2 — Raster pipeline repair
4. **Per-class isolation tiles**: add real isolation themes to
   `build-raster-tiles.py` — one theme per class, class painted in the
   **registry palette** (old-growth `#0d5c2a`, mature `#4ade80`, young
   `#f97316`, harvested `#ef4444`), everything else fully transparent.
   Regenerate z4-z9 for all four classes, upload to R2 (replacing the orphaned
   black/gold dirs), spot-verify pixels per zoom. Remove
   `RASTER_THEME_COLORS` (the gold override dies with the gold theme).
   Note: the script's own default theme paints old-growth `#15803d`, which
   silently diverges from the registry's `#0d5c2a` — unify on the registry
   value via a generated palette (single source of truth; color-audit already
   guards the TS side).
   **Required oracle updates (part of the work, not regressions):**
   `color-audit.test.ts` hardcodes the old values (line 88 and the
   raster-theme blocks at 208-209 / 259-285: old-growth `#15803d` → `#0d5c2a`,
   expected color distance 41.5 → ~0) — update alongside the palette change
   or the suite goes red on a correct change.
   **R2 safety:** upload new per-class dirs, flip the client, and keep the
   orphaned old dirs for one verified release before deleting anything.

### Wave 3 — Design pass (Jen spec first, then implement)
5. **Parks**: clearly denoted over both dark basemap and satellite — stronger
   emerald-tinted fill + crisp outline (Jen to spec exact values).
   Oracle update: `opacity-audit.test.ts:182-199` hardcodes parks' current
   `0.1` alpha special case — update with the styling change.
6. **Conservancies**: keep dash outline, add faint interior fill.
7. **Species-at-risk**: perceptible circles (radius/opacity bump, Jen to spec).
8. **Preset style overrides (D9)**: `styleOverrides?: Record<layerId,
   {opacityScale: number}>` on presets — Overview: faint forest-age over
   satellite; Ecology: forest-age as quiet backdrop; Threats: sharper
   forest-age. Wiring rules: the scale is passed **explicitly as a DataLayer
   prop** from the map shell when a preset activates (never inferred from a
   computed preset id). Scale changes do NOT re-create layers (verified), so
   every opacity code point needs explicit paint-update wiring with
   `opacityScale` in its dep array — the full list (round-2 critic):
   (a) PmtilesLayers fill: **both** branches — the static restore
   (DataLayer.tsx:376) AND the age-graded timeline branch (:346), else
   opacity jumps when the timeline opens under a preset;
   (b) WfsLayers fill: **no post-creation opacity write exists today**
   (create-time paint only; visibility uses layout) — add a paint effect;
   (c) WfsLayers line/circle visibility writes (:758, :783);
   (d) raster overview constants (:1092, :1116).
   Manual layer toggles after preset activation keep the scale until the
   preset changes (document this; it is the simple, legible rule). If this
   enumeration proves too fiddly in implementation, defer 3.8 and ship the
   other preset wins first — do not half-wire it.
   General styling oracle rule for this wave: audit tests that pin old values
   (`color-audit` incl. the `distance > 20` assertion at :215, and
   `opacity-audit`) get updated in the same commit as each styling change —
   a red audit on a superseded oracle is the work, not a regression.
9. **Threats preset**: drop `cutblocks`, update description (D7).
10. **Old-growth consistency (D6)**: with Wave 2's palette-correct tiles, the
    isolated old-growth view is dark green automatically; verify the
    raster→vector handoff has no color jump.

### Wave 4 — Verification net
11. e2e screenshot cases (**new** spec files): Overview stack order (satellite
    under overlays), class isolation at z6, Ecology preset, Protection preset.
12. Live monitoring (**new** checks in e2e/monitoring): proxy returns features
    for every cqlFilter layer, viewports chosen per the Wave 1.1 constraints.
13. `/production` pass before deploy.

## Sequencing & safety
- Waves ship as separate relay batches (1 → 2 → 3 → 4); Wave 1 alone fixes the
  worst user-facing breakage and is pure code.
- Wave 2 writes only new R2 objects until verified, then flips (old dirs are
  already broken — nothing working is replaced).
- All DataLayer churn (z-order + WfsLayers) lands in Wave 1 to avoid
  re-touching the same file across waves.

## Out of scope (named)
- Remaining preset audits (Lee continues Protection/Accountability/… after
  these land).
- conservation-priority minZoom gating (ROADMAP: needs a real perf trace).
- Story-vs-interactive layer-management merge (declined 06-02, stands).
- logging-risk ROADMAP scope question (open decision, unchanged).

## Open items for Lee
- Wave 2 palette: confirm registry colors are the canonical four.
- Threats preset: confirm dropping `cutblocks` there (it stays elsewhere).
