# DataLayer public-path fixes (R1-02, R1-03, R1-05), with rendered PmtilesLayers tests

*Plan, 2026-11-10. Session marvin/canopy (driven by marvin session-f1a7d3, brief item 2). Tier: standard relay, one batch.*

## Intent (grilled)

Grill skipped, on purpose: this is fix mode on defects already specified and routed. The intent is written down three times outside this plan: the 2026-09-01 refresh report's bucket D, the hand-off's Owed bullet ("One relay for the three DataLayer public-path bugs before Batch 2 ... Ship with the rendered PmtilesLayers tests"), and the 2026-11-10 brief, item 2, relaying Lee's standing yes to release. No direction, scope or money call is open. Anchor: the public map stops disagreeing with its own controls. Anti-goals: no visual change, no public number change, no reshaping of the effects Batch 2 owns beyond extracting the two apply functions.

## Intent

Three defects found by the 2026-09-01 code refresh (`.refresh/2026-09-01-findings/findings-R1.jsonl`) still live on the public /map path. Each is a state write that is dropped once and never retried, so the map silently disagrees with the controls. Fix the class, not the three instances: after this relay, the map's year, a layer's visibility and filters, and a layer's status are each a function of current React state, re-applied whenever the thing they apply to comes into existence. Ship with rendered tests that go red on today's code.

The handoff ordered this ahead of Batch 2 (paint re-spine), which edits the same effects.

Charter fit: goal (1), "every public layer reading correctly ... honest status states instead of silent blanks", and non-goal (3), the render-gated playhead. No visual design change; no public number changes.

## The three defects, verified on today's tree (main 9ad701b + two docs commits)

**R1-02, timeline year dropped while any tile loads.** `src/app/map/page.tsx:322-327`:

```ts
useEffect(() => {
  const map = mapRef.current?.getMap();
  if (!map || timeline.yearFilter == null) return;
  if (!map.isStyleLoaded()) return;
  map.setGlobalStateProperty("currentYear", timeline.yearFilter);
}, [timeline.yearFilter]);
```

Read in `node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs` (6.15.0): `Map.isStyleLoaded()` (:59919) returns `Style.loaded()` (:47426), which is false while `_updatedSources` is non-empty, any tile manager has a tile in flight, or the image manager is busy. `Style.setGlobalStateProperty` (:47252) only calls `_checkLoaded()` (:47473), which throws when `!this._loaded`, i.e. before the style JSON is parsed. The guard is far stricter than the failure it protects against, and the effect re-runs only on a year change, so a tick that lands during a tile load is lost: the bar shows year N while the GPU expressions evaluate N-1, or 1950 (CanopyMap's onLoad default, `CanopyMap.tsx:94`). Separately, if the timeline is enabled before `load`, the first year is lost and onLoad then writes `DEFAULT_RANGE[0]` over it. `mapStyle={MAP_STYLES.dark}` is a constant (`CanopyMap.tsx:198`) and nothing in `src/` calls `setStyle`, so after `load` the style is never replaced and the setter cannot throw.

**R1-03, toggle-off never clears status for any public layer.** `DataLayer.tsx:1145` returns early for every tile-backed layer (`if (!map || layer.source.type !== "wfs" || hasTileSource) return;`) above the `if (!visible) { clearLayerStatus(layer.id); return; }` at :1152. All six public data layers are tile-backed. Their only status source is `handlePmtilesError` (:1105-1107), fired by PmtilesLayers' 15 s header timeout and its addLayer catch. Every PmtilesLayers instance mounts at page load (CanopyMap mounts every registry layer) and they share one source (`PMTILES_SOURCE_ID = "opencanopy"`), so one header timeout puts all six layers, visible or not, into `error`. `StatusToast` (`src/components/ui/StatusToast.tsx:26-31`) shows every `error` entry with no visibility check. So: an error toast for a layer that is off, and one that persists after the reader turns the failing layer off.

**R1-05, PmtilesLayers adds layers from a stale closure.** The add effect (`DataLayer.tsx:237`, deps `[map, layer.id, layer.tileSource, layer.style]`) waits for `load` and then `sourcedata` before `addLayersToMap` (:262), which writes `layout.visibility` (:290, :311) and line opacity (:357) from the `visible` captured at mount, and applies only the registry base filter. The visibility effect (:448-475) and the merged filter effect (:494-499) bail with `if (!getLayer(...)) return` while the layers do not exist, and nothing re-runs them once the layers are added. A toggle, a class-filter change or a timeline switch made during the wait is lost: legend checked, map empty, until the reader toggles twice. SatelliteLayers fixed the visibility half of this race with `visibleRef` on 2026-06-11 (:118-122, :147-152); the filter half has no precedent.

Why no test caught any of it: the mock's `isSourceLoaded` (`src/test/mocks/maplibre.ts`) returns true the instant a source is added, so the async wait path never runs in a test; `isStyleLoaded` is a constant; `setGlobalStateProperty` is a bare `vi.fn` with no call record; page.tsx has no unit tests; no test mounts DataLayer and reads `LoadingContext`.

## Strategies considered

- **A. Three spot patches.** try/catch in page.tsx; `visibleRef` in PmtilesLayers; move the clear above the early return. Smallest diff, but leaves the filter half of R1-05 open, leaves the hidden-layer error toast (R1-03's other half) open, and leaves the onLoad-overwrites-year race.
- **B. Fix the class: state is re-applied when its target appears (chosen).** Each of the three writes becomes "derive from current state, and re-apply when the map object it targets comes into existence". Slightly larger diff, same files, no new architecture.
- **C. Make PmtilesLayers declarative** (react-map-gl `<Layer>`). Rejected: the imperative path exists because declarative `<Layer>` fails when the PMTiles source resolves asynchronously (comment at :213-219), and reshaping these effects is Batch 2's job.

## Design (strategy B)

### 1. Year sync owned by CanopyMap, latched on `load` (R1-02)

New hook `src/hooks/useGlobalStateYear.ts`:

```ts
export function useGlobalStateYear(
  getMap: () => maplibregl.Map | undefined,
  yearFilter: number | null | undefined,
): () => void   // returns onStyleLoad, called from CanopyMap's onLoad
```

- A `styleReadyRef` latch, false until the returned `onStyleLoad` runs.
- A `latestYearRef` holding the most recent non-null `yearFilter`, written in a `useLayoutEffect` (not during render; the react-hooks 7 `refs` rule flags render-phase writes).
- Effect on `[yearFilter]`: if `yearFilter == null`, the map, or the latch is missing, do nothing; otherwise `map.setGlobalStateProperty("currentYear", yearFilter)`. No `isStyleLoaded()` predicate anywhere on this path.
- `onStyleLoad()`: set the latch, then write `latestYearRef.current ?? DEFAULT_RANGE[0]`. This replaces the hard-coded `DEFAULT_RANGE[0]` write in `CanopyMap.onLoad` (:94), so a year chosen before `load` survives it.

CanopyMap calls the hook with its existing `yearFilter` prop (already `timeline.yearFilter`, page.tsx:699) and calls `onStyleLoad()` inside `onLoad`. The page.tsx effect at :319-327 is deleted. One writer of `currentYear` remains, in the component that owns `onLoad`.

Not wrapped in try/catch: after `load` the setter cannot throw in this app (constant style, verified above), and a swallowed throw would hide a real regression. If that premise ever breaks, the throw is loud, which is the right failure.

Render gate unchanged: `setGlobalStateProperty` calls `_update(true)` (:58279-58281), so the `idle` that `waitForRender` awaits still follows the write. Moving the write from page.tsx to CanopyMap does not change ordering relative to `useTimeline`'s loop: the loop registers `map.once("idle")` after `setCurrentYear`, and the commit that runs either effect happens after that.

### 2. Layer status is a function of (visible, failed) (R1-03)

In `DataLayer`:

- `const [pmtilesFailed, setPmtilesFailed] = useState(false)`. `handlePmtilesError` sets it (it runs from a timer or a catch, never synchronously in an effect body).
- One effect, placed above any source-type branching, deps `[visible, pmtilesFailed, layer.id, ...]`: `!visible` clears the layer's status; `visible && pmtilesFailed` sets `error`.
- `loadData`'s own `if (!visible) { clearLayerStatus; return; }` stays as it is: its `return` is what stops a hidden WFS-only layer from fetching, and the clear is harmless.

Effect: a header timeout no longer puts hidden layers into the toast; turning a failing layer off clears its toast; turning it back on restores the error honestly (the source is still dead and nothing retries; a retry is out of scope).

The `error` status remains the PMTiles path's alone for tile-backed layers (dual-source rule, ARCHITECTURE.md Status model).

### 3. PmtilesLayers re-applies current state after it adds layers (R1-05)

- Extract the bodies of the visibility effect (:448-475) and the merged filter effect (:494-~560) into two plain functions in the component, `applyVisibility()` and `applyFilters()`, each reading the current props and no-oping when the target layers do not exist, exactly as now.
- Wrap a call to both in `const applyCurrentState = useEffectEvent(() => { applyVisibility(); applyFilters(); })` (React 19.2.4, verified in node_modules; `useEffectEvent` reads the latest props and may be called from listeners an effect registered).
- `addLayersToMap` writes initial `layout.visibility` / line opacity through the same current value (no stale closure, so no one-frame flash at the wrong visibility), then calls `applyCurrentState()` after the `addLayer` calls succeed.
- The two reactive effects keep their current deps and now call `applyVisibility()` / `applyFilters()`.

This covers visibility, class filters and timeline on/off with one mechanism. Calls are idempotent (`setLayoutProperty`, `setFilter`, `setPaintProperty` with the same values).

Fallback if `useEffectEvent` misbehaves under vitest/happy-dom or the lint plugin: refs for `visible`, `classFilters`, `timelineActive`, written in `useLayoutEffect`, read by the same two functions. Ted reports which one shipped and why.

Sweep (named so the critic can check it): every other place in DataLayer.tsx that writes map state from a value captured at effect creation. Known: `onError` and `tileMinZoom` are excluded from the add effect's deps; `onError` is a stable `useCallback`, `tileMinZoom` is a registry constant per layer, so neither is stale in practice. Ted lists anything else found with a line number and either fixes it or says why it is not stale.

### 4. Mock and test infrastructure

`src/test/mocks/maplibre.ts`:
- `calls.setGlobalState: { name, value }[]`, recorded by `setGlobalStateProperty`, and `getGlobalState()` returning the recorded values; `_reset` clears both.
- `_setSourcesPending(pending: boolean)`: while true, `isSourceLoaded` returns false for every source; flipping it false does not emit anything (tests emit `sourcedata` themselves). Default false keeps every existing test's behaviour.

### 5. Tests (each must be shown red on today's code, then green)

New `src/test/pipeline/pmtiles-layers-lifecycle.test.tsx` (rendered, `@testing-library/react`, the `wfs-layers-d10` harness: mocked `useMap`, mocked `maplibre-gl`, StrictMode). The LoadingContext mock records `setLayerStatus` / `clearLayerStatus` calls instead of no-ops.

1. Visibility during the wait: style not loaded, sources pending; mount a tile-backed fill layer with `visible=false`; rerender `visible=true`; emit `load`, then `sourcedata {sourceId}`; assert fill and outline `layout.visibility === "visible"`.
2. The reverse (`true` then `false`): assert `"none"`.
3. Class filter during the wait: mount with no class filter; rerender with `classFilters={ [id]: ["old"] }`; emit; assert the fill's last filter contains `["in", ["get","class"], ["literal",["old"]]]`.
4. Timeline switched on during the wait: rerender with `yearFilter=2000` on a layer with `timelineField`; emit; assert the fill filter contains `["global-state","currentYear"]` and fill-opacity is the age-graded expression.
5. Line layer: same as 1 for a `style.type: "line"` layer; assert `line-opacity` equals the registry value.
6. Status on hide (R1-03): mount visible; trigger the 15 s timeout with fake timers; assert `setLayerStatus(id,"error")`; rerender `visible=false`; assert `clearLayerStatus(id)` after the error.
7. Hidden layer never reports error: mount `visible=false`, trigger the timeout; assert no `setLayerStatus(id,"error")`; rerender `visible=true`; assert `error` now set.

New `src/hooks/useGlobalStateYear.test.ts` (`renderHook`, mock map):

8. Year written while tiles load: latch set; `isStyleLoaded` mocked false; change year; assert `calls.setGlobalState` ends with `currentYear = new year`. (Red today in the equivalent page.tsx logic; Ted demonstrates red by temporarily reinstating the `isStyleLoaded` guard in the hook, records it, removes it.)
9. Year chosen before `load` survives `load`: latch unset; set year 1987; call `onStyleLoad()`; assert last write is 1987, not `DEFAULT_RANGE[0]`.
10. No year before `load`: `onStyleLoad()` writes `DEFAULT_RANGE[0]` (today's behaviour kept).
11. Null year (timeline off) never writes.

Plus a source-text guard (pattern of the existing CSS text guard): `src/app/map/page.tsx` contains no `setGlobalStateProperty`, and CanopyMap's `onLoad` contains no literal `DEFAULT_RANGE[0]` write, so the single-writer rule cannot regress by someone re-adding the page effect.

**Revert proof (Lee, 2026-08-09: a test is not a guard until it has gone red).** For each of tests 1-9, Ted reverts the matching production change on the branch, runs the test, records the red line verbatim, restores, records green. Razor re-runs at least three of those reverts himself, never trusting the table.

### 6. Docs, in the same branch

- ARCHITECTURE.md :124-126: the writer is CanopyMap via `useGlobalStateYear`, latched on `load`, not page.tsx; why `isStyleLoaded()` is the wrong predicate.
- ARCHITECTURE.md Status model: status is derived from (visible, failed) at DataLayer level; a hidden layer never reports error.
- ROADMAP: `current`/`next` corrected (P0b released 2026-11-02, per the hand-off log), shipped entry for this relay; P0b's post-release record rides in the release's first commit (Releases, sequence step 1, `summary --unrecorded`).
- hand-off: remove the R1 Owed bullet and the Next bullet; log entry.

## Batches and dependency graph

Two batches, sequential (B2 edits the mock B1 extends; no other shared file).

- **B1, year sync (R1-02).** Files: `src/hooks/useGlobalStateYear.ts` (new), `src/hooks/useGlobalStateYear.test.ts` (new), `src/components/map/CanopyMap.tsx`, `src/app/map/page.tsx`, `src/test/mocks/maplibre.ts` (`calls.setGlobalState`), the source-text guard test (new, `src/test/audit/global-state-writer.test.ts`). Six files.
- **B2, layer state (R1-03, R1-05).** Files: `src/components/map/DataLayer.tsx`, `src/test/mocks/maplibre.ts` (`_setSourcesPending`), `src/test/pipeline/pmtiles-layers-lifecycle.test.tsx` (new). Three files. Depends on B1 only through the mock.
- **Docs** (ARCHITECTURE.md, ROADMAP.md, `.claude/handoff.md`) at relay close, ROADMAP and hand-off through the relay's pre-merge edits.

## Review Focus

Inputs or failure modes the intent implies that no test above exercises directly, each pinned to an owner:

1. A real MapLibre map, not the mock: the year and the layer state on an actual tile load. Owner: the release's live checks (agent on production, headless), listed under Release; not a blocking guard because the agent cannot read `currentYear` on production (`window.__opencanopy_map` is dev-only).
2. StrictMode double-invoke of the add effect while sources are pending: two `sourcedata` handlers, one cleaned up. Owner: B2, tests 1-5 run under StrictMode, and Razor confirms exactly one `addLayer` per layer id.
3. The timeline loop's render gate after the write moved from page.tsx to CanopyMap: does `waitForRender` still resolve after the year paints? Owner: B1, a test that records the order of `setGlobalStateProperty` and the `once("idle")` registration through `useTimeline` with an injected `waitForRender`, or Razor's written reasoning if the order cannot be observed in a unit test.
4. Several tile-backed layers failing on the one shared source at once: only visible ones report error. Owner: B2, test 7 extended to two layers, one visible.
5. A WFS-only layer (fish-streams) hidden and shown under the new status effect: no flip to `error` while hidden, fetch still suppressed. Owner: B2, one extra case beside test 6.

## Out of scope

Indexed in the ROADMAP Parking Lot at relay close where not already scheduled:

- Live /map's wheel/drag throw (react-map-gl 8.1.0 vs MapLibre 6.15): brief item 3, its own release (scheduled, not parked).
- A retry for a failed PMTiles header (parked).
- Batch 2's paint re-spine; any palette or visual change.
- The URL hash not updating on move (M1a).

## Pre-mortem: it shipped and broke. How?

1. **The year write moved and now fires before CanopyMap's map exists.** Guarded: the effect no-ops until the latch; `onStyleLoad` writes the latest value. Tests 9 and 10.
2. **react-map-gl calls `onLoad` before CanopyMap's child effects can see the map**, or twice under StrictMode. The latch is idempotent; a second `onStyleLoad` rewrites the same latest year. Test 9 runs under StrictMode.
3. **`applyCurrentState` re-applies the base filter after the timeline effect set the composed one**, wiping the year filter. Prevented by applying the same function the effect uses (it reads the current `timelineActive`), not the registry base. Test 4.
4. **The status effect fights `loadData` for WFS-only layers**, flipping a hidden fish-streams layer's status. Both clear on hide; neither sets on hide. Existing WFS tests plus 6-7 cover it; Razor checks.
5. **Hidden layers no longer show the shared-source failure at all**, so a reader with every layer off never learns tiles are down. Acceptable: there is nothing on screen to be wrong about; the error appears the moment a layer is turned on (test 7).
6. **`useEffectEvent` breaks the static export or lint.** Fallback named in design 3; `npm run build` and `npm run lint` are release checks.

## Assumptions (load-bearing first)

1. After `load`, `setGlobalStateProperty` cannot throw in this app. Verified: MapLibre source (:47252, :47473) and a constant `mapStyle`, no `setStyle` in `src/`. If false, the throw is visible in error monitoring once OPS lands, and in the console now.
2. `useEffectEvent` is usable in React 19.2.4 under vitest. Verified it is exported (`typeof React.useEffectEvent === "function"`); behaviour under the test runner is proven by tests 1-5, with the ref fallback if not.
3. The six public layers are all tile-backed (finding R1-03, `registry.ts` PUBLIC_LAYER_IDS). Ted re-checks against today's registry.
4. `StatusToast` is the only consumer of `error` status that would care about hidden layers. Ted greps `layerStatuses` consumers and lists them.

## Inversion: how would we guarantee the map lies after this relay?

Keep a predicate that is stricter than the failure (R1-02's mistake), keep two writers for one value (page.tsx and onLoad), or let tests run a mock that never takes the async path (why R1-05 hid). The design removes the first, consolidates the second, and the mock change fixes the third.

## Gates

1. Critic: plan-reviewer, round 1 at xhigh, every finding reported; at most three rounds (DECISIONS 2026-10-07).
2. Relay: Ted implements (one batch), Razor reviews with mutation re-runs. No Jen gate: no visual or copy change.
3. Checks on the rebased tip: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Release

Lane M, kind `behaviour`, through ARCHITECTURE.md Releases, steps 1-8, using the installed tool (`node ~/marvin/state/opencanopy-release-tool/release-ledger.mjs`). Approval: Lee's standing yes (DECISIONS, Deploy entry, amended 2026-11-10), cited verbatim and marked as relayed in `request --approval`. Rollback target: whatever `status` names as known-good (expected deploy 6ae8b912, main 9ad701b). No tool paths change, so no `install` afterwards.

Blocking guards on the deploy: identity (`commit_ref` equals the SHA, `state: ready`; `oc-build` tag on `/`, `/map`, `/privacy`, each 200); `npm run audit:live`, with its two known by-construction failures (tenure-cutblocks, fish-streams at live-health.spec.ts, routed to brief item 4) named in the evidence and every other test passing; a headless /map load on production with no new console error during load and no interaction (the wheel/drag throw is item 3's and is excluded by not interacting).

Live checks owed, non-blocking (agent, headless on production, where possible; else Lee): with the timeline on and tiles loading, the bar and the painted year agree at each pause; turning a layer on during the first seconds of load shows it without a second toggle; no error toast for a layer that is off. Not a visual release, so no phone check is owed (DECISIONS 2026-10-07 amendment).
