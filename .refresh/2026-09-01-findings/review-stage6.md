# Razor Stage-6 cold-eyes equivalence review — refresh/2026-09-01 (origin/main 11b79f2 .. 5657c95)

No session history within 14 days on this project branch (last opencanopy note 2026-08-22 was a different fix). Starting cold.
Method: read every runtime hunk, then mutation-test claimed guards, then grep callers of deleted helpers, then docs vs tree.

## Part 1 — runtime hunks (src, netlify), read against origin/main

### df32442 lint
- PASS netlify/edge-functions/wfs-proxy.ts:569 — one-parameter default export. Netlify/Deno calls handler(request, context); JS ignores unbound trailing args. The removed NetlifyContext interface was local-only (never exported, never imported). No importer of wfs-proxy.ts other than the two text-parsing audit tests (which regex LAYER_CONFIG / PROPERTY_WHITELIST, not the signature).
- PASS src/components/map/DataLayer.tsx:575 — eslint-disable comment removed only; deps array unchanged.

### 15e27ed dead exports
- PASS src/components/map/index.ts — only importer of the barrel is src/app/map/page.tsx:7 (`CanopyMap`). DataLayer/DrawTool/MapPopup/SelectionBBox are imported by relative path elsewhere. No e2e/scripts importer.
- PASS src/components/ui/PresetChips.tsx ICONS — presets.ts uses only eye/hammer/shield/flame; all four retained. `ICONS[preset.icon] || ICONS.eye` fallback unchanged. LayerPanel CategoryIcon uses config.icon from a different table.
- PASS src/lib/layers/index.ts LAYER_REGISTRY barrel removal / chapters.ts FLAT_BC_CAMERA / tile-manifest.ts BINARY_TILE_PROTOCOL / forest-age.ts CLASS_LEGEND_LABELS / forest-carbon-client.ts ForestCarbonErrorKind / interpolation.ts normalizeAngle — (callers verified in Part 2 grep below)
- NOTE public/images/map-preview.webp deleted — zero references at origin/main or HEAD (git grep). Not a code-path change, but https://opencanopy.ca/images/map-preview.webp now 404s for any external link that was pasted somewhere (no OG image is configured, so nothing in-tree points at it). Acceptable for a refresh; worth knowing.

### cb22257 style= plumbing
- PASS src/hooks/useMapState.ts — at origin/main the only caller (src/app/map/page.tsx:352) never passed `style`, so `style` was always "dark", and buildHash suppressed style= for "dark" → no URL ever gained a style= param. parseHash().style was parsed but never read by any consumer (parseHash results consumed only inside useMapState.ts:160/256 for lat/lng/zoom/pitch/bearing/layers/preset). CanopyMap.tsx:188 hardcodes MAP_STYLES.dark. A URL in the wild carrying #style=satellite did nothing before and does nothing now; unknown keys are ignored by URLSearchParams either way.

### a2aefe5 dedup
- PASS src/hooks/useLayerState.ts:101,213,221 — validateLayerIds is `ids.filter(id => validIds.has(id))` over LAYER_REGISTRY_AVAILABLE, identical to the three inline filters: order preserved, no dedup, same Set source. Byte-equivalent semantics.
- PASS src/hooks/useWatershedSelection.ts:57 — disableMode body == old clear body (setMode off, watershed null, loading false, error null, same order). `clear` now shares the reference with `disableMode`; both are stable ([] deps) so consumers' effect deps are unaffected. No test asserts `clear !== disableMode` (grep below).
- PASS src/components/ui/SearchBar.tsx:279 — old ladder: id==="coords"→12; region startsWith Region→8; Place/Locality→12; else 12. Coords result has region "Coordinates" (SearchBar.tsx:146), which does not start with "Region". New: Region→8 else 12. Identical mapping for every input.
- PASS src/components/story/HeroSection.tsx:14 — prefersReducedMotion() caches the MediaQueryList keyed on window.matchMedia identity but reads `.matches` on every call. MediaQueryList is a live object: `.matches` reflects the current evaluation, so a cached MQL and a fresh matchMedia() return the same value. HeroSection reads once per mount effect as before. Only a jsdom mock that returns a NEW static object per call with a changed `matches` and the SAME matchMedia fn could differ, and no such test exists for HeroSection.
- PASS src/app/map/page.tsx, CalculatorPanel.tsx, useScrollytelling.ts — import hoisted to top; same module, same call sites.

### a45fcf8 fix(debug)
- PASS (labelled fix, debug-only) src/lib/debug/pipeline-logger.ts:167 — pipelineHealthReport only reached from CanopyMap.tsx:110 (gating verified below). Removed union members "timeline-effect"/"onStepProgress" have zero call sites in src/scripts/e2e.
- PASS src/components/map/DataLayer.tsx:1216 — loadData returns at :1141 for hasTileSource, so at :1216 hasTileSource is always false and shouldSurfaceWfsLoading(false)===true: the added guard is a no-op by construction. Cosmetic symmetry only, not a fix.

### 3045aec single-sourcing
- PASS src/lib/layers/registry.ts:119-122 — forest-age-palette.json values are exactly #0d5c2a / #4ade80 / #f97316 / #ef4444, the four literals removed. Byte-identical legend colours.
- PASS src/lib/layers/registry.ts:243 — CUTBLOCK_AREA_CAP_HA = 2000 replaces literal 2000 inside the same expression array; JSON shape identical.
- PASS src/lib/map/popup-keys.ts vs old MapPopup PRIORITY_KEYS — programmatic diff: 40 keys, identical order and members. `readonly string[]` view; indexOf semantics unchanged.

### 056cfb3 scripts/e2e
- PASS scripts/lib/* deleted helpers — repo-wide grep (ts/tsx/js/mjs/py/sh/json/md, excluding node_modules/.git/out) for computePerLayerScore, printLayerDashboard, clearTileCache, traceFeatures, checkPresence, tileBounds, tileCenter, LatLon, TileBounds, DASHBOARD_LAYERS: zero callers. propsMatch/fingerprintScore de-exported but still called in-file (feature-matcher.ts:50,74,97).
- PASS scripts/pipeline/verify.ts:23 `../lib/bc-sample-grid.js` — same style as the existing `../lib/node-file-source.js`; executed `npx tsx` on verify.ts from scripts/pipeline: import resolved, script ran to its "File not found" check. EXPECTED_SOURCE_LAYERS is the same 12 names in the same order as the deleted inline list (programmatic diff). The `as const` readonly tuple is only iterated (`for…of`, verify.ts:236).
- PASS scripts/lib/bc-sample-grid.ts:82,92 SOURCE_TO_MAPLIBRE — DataLayer builds `layer-${layer.id}-tiles-fill` (DataLayer.tsx:284); registry ids `cutblocks` (:197, sourceLayer tenure-cutblocks, type fill) and `tap-priority` (:543, sourceLayer conservation-priority, type fill) are in PUBLIC_LAYER_IDS; `tenure-cutblocks` (:257) is NOT public and never mounts. The old ids `layer-tenure-cutblocks-tiles-fill` / `layer-conservation-priority-tiles-fill` do not exist on the live map, so the old spec's getLayer() returned -2 for those two. Consumer: e2e/screenshots/screenshot-regression.spec.ts:185 only.
- PASS playwright split — `npx playwright test --list` (base config): 0 monitoring specs; `npx playwright test e2e/screenshots/ --list`: 48 tests in 1 file (testIgnore does not interfere with an explicit path under e2e/); `--config=playwright.live.config.ts --list`: 10 tests in live-health.spec.ts. Live config carries the same timeout/expect/retries/viewport/project as base; the only difference is baseURL (prod), and the spec overrides baseURL itself (live-health.spec.ts:35). Nothing lost.
- PASS deploy-tiles.sh:19 — `grep -oP 'https://[^"]+'` on the r2-config.ts line yields https://pub-b5568be386ef4e638b4e49af41395600.r2.dev (verified), identical to the removed literal. `npm run build-tiles` never existed at origin/main (only build-tiles:v2) — message correction is accurate. rebuild.sh step 3 now points at DECISIONS.md, which does state the deploy is git-triggered (line 58).
- PASS scripts/audit-all.ts header — the runner's list (lines 70-105) is exactly 8 audits ending in audit:crosssource-lite; the named exclusions (audit:trend, audit:viewport, audit:crosssource, audit:visual, audit:live) all exist in package.json and are not in the runner.

## Part 3 — tests: guard or hollow? (mutations run by me, files restored with git checkout, tree verified clean)

| Claimed guard | Mutation I made | Result |
|---|---|---|
| legend colour | registry.ts forest-age "mature" legend → literal "#4ade81" | KILLED: color-audit 2 failed (11b swatch==paint, and swatch==palette JSON) |
| proxy CQL 1500 | wfs-proxy.ts cutblocks cqlFilter `< 2000` → `< 1500` | KILLED: proxy-consistency Check 11, 1 failed |
| popup bogus key | popup-keys.ts + "BOGUS_KEY_XYZ" | KILLED: schema-audit Check 12, 1 failed |
| timelineField drop | registry.ts remove fire-history timelineField | KILLED: schema-audit Check 7 pinned set, 1 failed |
| forest-age raster maxZoom 12 | registry.ts rasterOverview.maxZoom 9 → 12 | KILLED: zoom-handoff invariant 3, 1 failed |
| logging-risk zoomRange lowered | registry.ts logging-risk zoomRange [9,18] → [5,18] | KILLED: zoom-handoff invariants 1 and 2, 2 failed |
| property-schema bogus key | scripts/lib/property-schema.ts forest-age + bogus_zzz rule | KILLED: schema-audit Check 13, 1 failed |
| CSS .story-step re-added | globals.css `.story-step{min-height:auto!important}` in both reduced-motion blocks | KILLED: reduced-motion-css, 1 failed |
| visibility.ts idle-deferral removed | visibility.ts:50 map.once("idle", …) deleted | KILLED: visibility-lifecycle "defers via map.once('idle')", 1 failed |
| keyed-env keyless tests | NEXT_PUBLIC_MAPTILER_KEY=pk_fake exported; SearchBar.test.tsx + source-registration.test.ts | PASS at HEAD (16/16, 16/16). Baseline: origin/main SearchBar.test.tsx under the same env fails 6 tests — the hardening is real |

All ten claims hold. Every kill fails the specific test the claim names, not a compile error.

Weakened / deleted assertions:
- PASS 8 normalizeAngle tests — function deleted with zero callers (git grep HEAD); tests of a nonexistent function cannot guard anything.
- PASS registry-audit "documents filter intent" — asserted description non-empty for filtered layers; registry-audit.test.ts:100 already asserts non-empty description for EVERY layer. Strict subset, nothing lost.
- PASS schema-audit "documents all layers with timelineField" — replaced by an exact pinned set (stronger).
- PASS visibility-lifecycle "bug hypothesis" block — A/B/D all re-called applyLayerVisibility by hand after flipping state; none exercised map.once. D's real content is subsumed by the rewritten deferral test (which now proves the deferred call fires). A/B asserted only "no paint before registration", covered by the retained "visibility does nothing when layers not yet registered".
- PASS zoom-handoff-audit rewrite — old tiers derived each minZoom from the previous tier's maxZoom, so findGaps() could never report a gap for any registry input (self-referential). New invariants read DataLayer's actual rules (DataLayer.tsx:264 maxzoom=22, :265 minzoom=tileMinZoom??0, :1316 raster maxzoom=maxZoom+1, :1365 tileMinZoom=hasRasterOverview?rasterMaxZoom+1:tileSource.minZoom) — verified line by line. Dropped "WFS tier does not start above zoomRange[1]": for tile-backed layers WfsLayers never mounts (loadData early return, D10), so the dropped assertion described a path that does not exist. Inverted zoomRange is separately guarded at registry-audit.test.ts:113.
- PASS NarrativePanel chapter-count test relocated to story-consistency-audit with the same assertions (CHAPTERS imported there, :36).
- NOTE src/components/ui/SearchBar.test.tsx — `vi.stubEnv` without `vi.unstubAllEnvs()`; env stubs persist across describe blocks in the same file. Harmless here because the keyed block stubs its own key, but order-dependent.

## Part 4 — docs vs tree
- WARNING ARCHITECTURE.md:92-94 — "a status is cleared when its layer is toggled off, not on unmount." DataLayer.tsx:1247-1252 still has an unmount cleanup that calls setLayerLoading(false) + clearLayerStatus. The toggle-off clear (:1151) is the one that fires in practice because CanopyMap never unmounts DataLayer, but "not on unmount" is false of the code as written. Suggested wording: "…cleared when its layer is toggled off (the unmount cleanup also exists but is unreachable while CanopyMap always-mounts)."
- PASS ARCHITECTURE.md aliases — ALIASES map (useLayerState.ts:47-48) applied on hash (:74), storage (:101) and popstate (useMapState.ts:256).
- PASS ARCHITECTURE.md timeline — setGlobalStateProperty("currentYear") at page.tsx:326 and CanopyMap.tsx:84; setFilter in DataLayer only for class filters (:518-548) and WFS layers (:989-993); waitForRender at page.tsx:294-315 uses map.once("idle").
- PASS ARCHITECTURE.md scrub tables — src/data/scrub/{cutblocks,fire}-scrub.json; scented-track.ts:19 imports fire-scrub.json; useScrollytelling imports both; scripts/build-scrub-tables.py, build-year-overlays.py, generate-tile-manifest.py all exist; tile-manifest.ts is fail-open (null sentinel, :53-73).
- PASS ARCHITECTURE.md useDeviceCapability — sole consumer ScrollytellingContainer.tsx.
- PASS ARCHITECTURE.md audit paragraph + Layout block — every named dir/file exists (src/contexts/LoadingContext.tsx, src/data/*, src/types, lib/taxonomy, lib/data/{wfs-client,forest-carbon-client,watershed-client,fetch-errors,wfs-status}, lib/map/popup-keys.ts).
- PASS CONTRIBUTING.md — LayerCategory union is exactly forest|accountability|disturbance|water|species|protection|context; PUBLIC_LAYER_IDS at registry.ts:893; opacity threshold 0.15 (opacity-audit.test.ts:72); Check 5 province-scale crash guard exists; proxy-consistency audit fails on drift (mutation-proven above).
- PASS METHODOLOGY.md:74 — @turf/intersect clip (lib/carbon/clip.ts), CALC_AREA_GUARD_KM2=500 refused before any network request (forest-carbon-client.ts:144-154), PROJ_AGE_1 clamp Math.max(0, age ?? 0) (calculator.ts:116), one-sided downward band (calculator.ts:285-287), PDF equivalences derived from co2.rounded (pdf-generator.ts:53-57), share gated to ok state (CalculatorPanel.tsx:367-369).
- PASS README.md — PUBLIC_LAYER_IDS = 6 data layers + satellite; registry has 18 ids → 11 non-public; preset labels Overview / Logging / Old Growth + Parks / Fire + Logging match presets.ts; site is live.
- PASS ROADMAP.md dolly restore note — `git merge-tree --write-tree --merge-base=72cbddb HEAD 72cbddb^` exits 1 with CONFLICT in NarrativePanel.tsx and NarrativePanel.test.tsx (both 72cbddb and c67dd99 touch NarrativePanel.tsx); the two named tests exist (prefetch-binary.test.ts:112, scrollytelling-raf.test.ts:585/624).
- NOTE registry.ts:14-18 JSDoc points at lib/timeline/scented-track for the cap; scented-track.ts:8 still describes the cap as a prose literal "2000ha" rather than the constant. Not a behaviour change; a future drift hazard the new comment implies is closed.

## Part 5 — scope
- Nothing in the diff changes a product decision. The only runtime-reachable logic changes are (a) pipelineHealthReport's WFS check (debug-only, window.__OC_HEALTH_REPORT is created only when isEnabled(), CanopyMap.tsx:105-111) and (b) DataLayer.tsx:1216 which is provably a no-op. Everything else is dead-code removal with zero callers, byte-equivalent substitutions, comment/doc text, tests, and tooling/config.
- deploy-tiles.sh gained a parse-and-fail-loud step (exit 1 if R2_PUBLIC_BASE cannot be parsed) — operator tooling, fail-closed, same URL as before.
- Untracked `.refresh/` directory present in the worktree is not part of the branch (not in the diff); ignored.

## Gates re-run personally
vitest: 56 files, 856/856 passed. tsc --noEmit: exit 0. eslint .: no output (0 problems). Tree clean after all mutations (git status: only the pre-existing untracked .refresh/).

## Verdict
PASS-WITH-WARNINGS.
Behaviour of the shipped site is preserved on every runtime hunk I traced (0 CRITICAL). One WARNING, documentation only: ARCHITECTURE.md's "not on unmount" sentence contradicts DataLayer.tsx:1247-1252 (commit 5657c95) — fix the sentence, nothing to revert. Two NOTEs (map-preview.webp URL now 404s for external links; scented-track prose literal). All ten mutation claims independently reproduced; no test got weaker.
