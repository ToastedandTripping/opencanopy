# DataLayer public-path fixes (R1-02, R1-03, R1-05), with rendered PmtilesLayers tests

*Plan, 2026-11-10, revised after critic round 1 (CONCERN; every must-fix folded, see "Round 1 folds" at the end). Session marvin/canopy (driven by marvin session-f1a7d3, brief item 2). Tier: standard relay, two sequential batches.*

## Intent (grilled)

Grill skipped, on purpose: this is fix mode on defects already specified and routed. The intent is written down three times outside this plan: the 2026-09-01 refresh report's bucket D, the hand-off's Owed bullet ("One relay for the three DataLayer public-path bugs before Batch 2 ... Ship with the rendered PmtilesLayers tests"), and the 2026-11-10 brief, item 2, relaying Lee's standing yes to release. No direction, scope or money call is open. Anchor: the public map stops disagreeing with its own controls. Anti-goals: no visual change, no public number change, no reshaping of the effects Batch 2 owns beyond extracting the two apply functions.

## Intent

Three defects found by the 2026-09-01 code refresh (`.refresh/2026-09-01-findings/findings-R1.jsonl`) are still live on the public /map path. Each is a state write that is dropped once and never retried, so the map silently disagrees with the controls. Fix the class, not the three instances: after this relay, the map's year, a layer's visibility and filters, and a layer's status are each a function of current React state, re-applied whenever the thing they apply to comes into existence. Ship with rendered tests that go red when the fix is reverted.

The hand-off ordered this ahead of Batch 2 (paint re-spine), which edits the same effects. Charter fit: goal (1), "every public layer reading correctly ... honest status states instead of silent blanks", and non-goal (3), the render-gated playhead. No visual design change; no public number changes.

## The three defects, verified on today's tree (origin/main 9ad701b plus three docs commits and this plan)

**R1-02, timeline year dropped while any tile loads.** `src/app/map/page.tsx:322-327` guards `map.setGlobalStateProperty("currentYear", …)` with `if (!map.isStyleLoaded()) return;` (:325) and re-runs only on a year change. In MapLibre 6.15.0 (`node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs`), `Map.isStyleLoaded()` (:59919) returns `Style.loaded()` (:47426), false while `_updatedSources` is non-empty, any tile manager has a tile in flight, or the image manager is busy. `Style.setGlobalStateProperty` (:47252) only calls `_checkLoaded()` (:47473), which throws before the style JSON is parsed; `Style._loaded` is set true once in `_load` and never reset. So a tick that lands during a tile load is lost: the bar shows year N while the GPU evaluates N-1, or 1950 (CanopyMap's onLoad default, `CanopyMap.tsx:94`). If the timeline is enabled before `load`, the first year is lost and onLoad writes `DEFAULT_RANGE[0]` over it. `mapStyle={MAP_STYLES.dark}` is a module constant (`CanopyMap.tsx:198`, mapConfig.ts); react-maplibre calls `setStyle` only on a prop-identity change; nothing in `src/` calls `setStyle`. After `load` the setter cannot throw.

**R1-03, toggle-off never clears status for any public layer.** `DataLayer.tsx:1145` returns early for every tile-backed layer above the `if (!visible) { clearLayerStatus(layer.id); return; }` at :1151-1154. CanopyMap mounts the public seven (`LAYER_REGISTRY_AVAILABLE`, CanopyMap.tsx:219); all six public data layers are tile-backed, and their only status source is `handlePmtilesError` (:1105-1107), fired by PmtilesLayers' 15 s header timeout and its addLayer catch. The six instances share one source (`PMTILES_SOURCE_ID = "opencanopy"`), so one header timeout puts all six into `error`, visible or not. `StatusToast` (`src/components/ui/StatusToast.tsx:26-31`) shows every `error` with no visibility check; it is the only consumer that would show a hidden layer's error (LoadingBar reads "loading" only; MapLegend reads enabled layers only). And LoadingContext debounces terminal statuses 250 ms per id (`LoadingContext.tsx:115-124`) while `clearLayerStatus` (:129-136) does not cancel the pending write, so a clear can be overtaken by an error queued just before it.

**R1-05, PmtilesLayers adds layers from a stale closure.** The add effect (`DataLayer.tsx:238-446`, deps `[map, layer.id, layer.tileSource, layer.style]`) waits for `load` and then `sourcedata` before `addLayersToMap`, which writes `layout.visibility` (:291, :312) and line opacity (:358) from the `visible` captured at mount and applies only the registry base filter. The visibility effect (:448-475) and the merged filter effect (:495-579) bail with `if (!getLayer(...)) return` while the layers do not exist; nothing re-runs them once the layers are added. A toggle, a class-filter change or a timeline switch made during the wait is lost: legend checked, map empty, until the reader toggles twice. SatelliteLayers fixed the visibility half with `visibleRef` on 2026-06-11 (:122-123, :148-153); the filter half has no precedent.

Why no test caught any of it: the mock's `isSourceLoaded` returns true the instant a source is added, so the async wait never runs in a test; `isStyleLoaded` is a constant; the mock's `calls` object has no entry for `setGlobalStateProperty`; page.tsx has no unit tests; no test mounts DataLayer against a real LoadingProvider.

## Strategies considered

- **A. Three spot patches.** try/catch in page.tsx; `visibleRef` in PmtilesLayers; move the clear above the early return. Leaves the filter half of R1-05, the hidden-layer toast and the onLoad-overwrites-year race open.
- **B. Fix the class: state is re-applied when its target appears (chosen).** Same files, no new architecture.
- **C. Make PmtilesLayers declarative** (react-map-gl `<Layer>`). Rejected: the imperative path exists because declarative `<Layer>` fails when the PMTiles source resolves asynchronously (comment at :211-217), and reshaping these effects is Batch 2's job.

Within B, for R1-05's re-apply trigger: (i) `useEffectEvent`, (ii) the finding's `layersReady` state counter re-running the effects, (iii) a latest-ref to the apply function. **Chosen: (iii).** (i) is a trap in this React version: react-dom 19.2.4 refreshes an effect event's implementation only for plain function components, so inside `memo()` without a comparator or `forwardRef` it silently keeps mount-time props (critic r1 probe; react-dom-client.development.js:13874-13892); a Batch 2 `memo(PmtilesLayers)` would bring R1-05 back with no error. (ii) costs a render per layer add and a `setState` that can run synchronously in the add effect's body on the already-loaded path. (iii) works in every component kind and adds no render.

## Design (strategy B)

### 1. Year sync owned by CanopyMap, latched on `load` (R1-02)

New hook `src/hooks/useGlobalStateYear.ts`:

```ts
export function useGlobalStateYear(
  mapRef: React.RefObject<MapRef | null>,
  yearFilter: number | null | undefined,
): () => void   // returns onStyleLoad, called first thing in CanopyMap's onLoad
```

- Takes the ref, not a getter, so nothing in its deps changes identity per render.
- `styleReadyRef` latch, false until `onStyleLoad` runs. `latestYearRef` holds the most recent non-null `yearFilter`, written in `useLayoutEffect`, never during render.
- Effect on `[yearFilter]`: if `yearFilter == null`, no map, or no latch, do nothing; else `setGlobalStateProperty("currentYear", yearFilter)`. No `isStyleLoaded()` on this path.
- `onStyleLoad` (stable `useCallback`): set the latch, then write `latestYearRef.current ?? DEFAULT_RANGE[0]`.
- Each write emits `pipelineLog("global-state-year", "currentYear", { year, source: "tick" | "load" })` (new `PipelineStage` member in `src/lib/debug/pipeline-logger.ts`), so production writes are observable behind `?debug=pipeline`.

CanopyMap calls the hook with its `yearFilter` prop (already `timeline.yearFilter`, page.tsx:699) and calls `onStyleLoad()` as the first statement of `onLoad`, before the terrain block (:85-92), so a throw there cannot skip the only default write. The hard-coded write at :94 is deleted, and so is the page.tsx effect at :319-327. One writer of `currentYear` remains in `src/`.

Not wrapped in try/catch: after `load` the setter cannot throw in this app. If that premise ever breaks (a basemap toggle that calls `setStyle`), the throw reaches MapErrorBoundary (page.tsx:689-1107), which replaces /map with its crash panel. That is acceptable only while no style switch exists; a code comment on the write says any future `setStyle` must revisit it.

Render gate unchanged: `Map.setGlobalStateProperty` calls `_update(true)`, so the `idle` that `waitForRender` awaits still follows the write. useTimeline registers `map.once("idle")` synchronously after `setCurrentYear` (useTimeline.ts:299, :221; page.tsx:309); the commit that runs either writer's passive effect comes later, and CanopyMap's effect keeps the same position relative to DataLayer's filter effect as page.tsx's did (critic r1 checked the order).

### 2. Layer status is a function of (visible, failed) (R1-03)

In `DataLayer`:

- `const [pmtilesFailed, setPmtilesFailed] = useState(false)`; `handlePmtilesError` sets it. (It can run synchronously inside the add effect through the addLayer catch when style and source are already loaded; harmless at runtime, and the lint rule cannot see through the `onError` prop.)
- One effect above any source-type branching, deps `[visible, pmtilesFailed, layer.id, setLayerStatus, clearLayerStatus]`: `!visible` clears the status; `visible && pmtilesFailed` sets `error`.
- `src/contexts/LoadingContext.tsx`: `clearLayerStatus(id)` also cancels the pending debounced write for `id`, so a clear cannot be overtaken by an error queued before it.
- `loadData`'s `if (!visible) { clearLayerStatus; return; }` stays: its `return` keeps a hidden WFS-only layer from fetching.

Result: a header timeout no longer toasts hidden layers; turning a failing layer off clears its toast; turning it back on restores the error honestly (the source is still dead; a retry is out of scope). Tile-backed layers still take `error` from the PMTiles path only (dual-source rule).

Known remaining member, not fixed here: a WFS-only layer whose fetch is in flight when it is hidden receives the fetch's terminal status after the await (:1220-1236). No WFS-only layer is mounted on /map; parked (see Out of scope).

### 3. PmtilesLayers re-applies current state after it adds layers (R1-05)

- Extract the visibility effect's body (:448-475) and the whole merged filter effect's body (:495-579, including the no-timeline restore branch) into `applyVisibility` and `applyFilters`, each a `useCallback` over exactly the props it reads, each no-oping when its target layers do not exist, as now.
- The two reactive effects become `useEffect(() => applyVisibility(), [applyVisibility])` and the same for filters: same triggers as today's deps, no lint suppression.
- `const applyCurrentStateRef = useRef<() => void>(() => {})`, assigned `() => { applyVisibility(); applyFilters(); }` in a `useLayoutEffect` over both callbacks.
- `addLayersToMap` keeps its `addLayer` configs unchanged and calls `applyCurrentStateRef.current()` after the `addLayer` calls succeed. No separate initial-visibility mechanism: `addLayer` and the re-apply run in one JS task, and MapLibre paints on the next frame, so a stale config value is never drawn. Tests assert effective state (design 4), which is what MapLibre draws.
- A comment on the ref names why it is not `useEffectEvent` (the component-kind trap), so Batch 2 does not "modernise" it back. The same comment, and the ARCHITECTURE line, note the lint blind spot: the existing `eslint-disable` lines in PmtilesLayers and DataLayer switch off the React Compiler rules (refs, set-state-in-effect) for those whole components, so "lint clean" says nothing about the ref handling there; the tests are the proof.

Idempotent: `setLayoutProperty`, `setFilter` and `setPaintProperty` with unchanged values. For all six public layers, re-applying the no-timeline branch reproduces the `addLayer` paint (each carries a registry `fill-opacity`), so no visual drift.

**Sweep of the class.**
- Stale closure in an add effect: `onError` (stable `useCallback`) and `tileMinZoom` (a registry constant per layer) are not stale in practice. **WfsLayers** has the same race as R1-05 (reads `visible` at :679, :694, :713, :755, :789 from a closure whose deps at :886 exclude it; its class-filter effect :980-997 no-ops before layers exist). No public layer is WFS-only, so it is unreachable on /map: parked.
- `isStyleLoaded()` as a readiness test: `DataLayer.tsx:174` (SatelliteLayers), `:423` (PmtilesLayers add effect), `:859` (WfsLayers) decide "add now or wait for `load`"; if their effect ever re-ran after `load` with a tile in flight, they would wait for a `load` that already fired. Latent: their deps are stable in production. `StoryMap.tsx:72` (camera) and `:152` (binary reveal, the drop the hand-off logged on 2026-10-07) drop writes while tiles load; lane S. None fixed here; each parked with this reason. ARCHITECTURE states the rule: `isStyleLoaded()` is never a readiness test.

### 4. Mock and test infrastructure

`src/test/mocks/maplibre.ts`:
- `calls.setGlobalState: { name, value }[]`, recorded by `setGlobalStateProperty` (still `return this`); `getGlobalState()` returns the recorded values.
- `_setSourcesPending(pending)`: while true, `isSourceLoaded` returns false; flipping it emits nothing (tests emit `sourcedata`).
- `getLayoutProperty(id, prop)` and `getFilter(id)`, seeded from the `addLayer` config and overwritten by `setLayoutProperty` / `setFilter`: the effective state MapLibre would draw.
- `_reset` clears all of the above, including the pending flag.

No existing test reads layout or filter state or calls `getGlobalState`, and the pending flag defaults off, so no current test can move (critic r1 checked).

Toolchain: run `npm ci` before B1 (this worktree has vitest 4.1.1 and happy-dom 20.10.2 against lockfile pins 4.1.12 and 21.0.4). If the classifier blocks the install, record the installed versions in `--checks` and treat CI on main as the locked-toolchain run.

### 5. Tests

Rendered DataLayer tests use the **real `LoadingProvider`** and assert on `layerStatuses` after advancing fake timers past the 250 ms debounce, not a recording mock (the d10 harness's mock hands out fresh setters per render, which re-runs DataLayer's cleanup effect and would turn test 6 green on today's code).

`src/test/pipeline/pmtiles-layers-lifecycle.test.tsx` (StrictMode, mocked `useMap` and `maplibre-gl`, effective-state oracles):

In tests 1-5, "emit" always means: emit `load`, flip sources pending off, then emit `sourcedata {sourceId}` (the handler adds layers only when `isSourceLoaded` is true, DataLayer.tsx:398-405).

1. Visibility during the wait: style not loaded, sources pending; mount a tile-backed fill layer `visible=false`; rerender `visible=true`; emit; `getLayoutProperty` on fill and outline is `"visible"`.
2. The reverse: `"none"`.
3. Class filter during the wait: rerender with `classFilters={ [id]: ["old"] }`; `getFilter(fill)` contains `["in", ["get","class"], ["literal",["old"]]]`.
4. Timeline on during the wait: rerender with `yearFilter=2000` on a layer with `timelineField`; `getFilter(fill)` contains `["global-state","currentYear"]`; fill-opacity is the age-graded expression.
5. Line layer: as 1, `line-opacity` equals the registry value.
6. Status on hide: mount visible; fire the 15 s timeout; advance past 250 ms; `layerStatuses.get(id) === "error"`; rerender `visible=false`; status absent.
7. Hidden layers never report: two tile-backed layers on the shared source, one visible, one hidden; fire the timeouts; only the visible one is `error`; show the hidden one; now it is `error`.
8. Debounce race: mount visible; fire the timeout; rerender `visible=false` within 250 ms; advance past 250 ms; status absent.
9. StrictMode with the style loaded and sources pending: mount `visible=false`; rerender `visible=true` during the wait; flip pending off, emit `sourcedata`; exactly one `addLayer` per layer id in `calls.addLayer`; the first (StrictMode-discarded) handler was passed to `off("sourcedata")`; fill `getLayoutProperty` is `"visible"`.
10. WFS-only statuses survive the new effect (fixture layer; no WFS-only layer is mounted on /map): mount visible with `fetchLayerData` rejecting; after 250 ms status is `error`, and it survives a rerender with unchanged props; hide, status absent; show with `fetchLayerData` resolving an empty collection; after 250 ms status is `empty`. Secondary: no fetch while hidden.

The status effect is exactly `if (!visible) clear; else if (pmtilesFailed) set error;` with no else branch: a visible layer that has not failed on the PMTiles path keeps whatever status the WFS path wrote (test 10 is the tripwire).

`src/hooks/useGlobalStateYear.test.ts` (`renderHook`, mock map in a ref):

11. Year written while tiles load: latch set; `isStyleLoaded` false; change year; last `calls.setGlobalState` is the new year.
12. Year chosen before `load` survives it: set 1987; `onStyleLoad()`; last write 1987.
13. No year before `load`: `onStyleLoad()` writes `DEFAULT_RANGE[0]`.
14. Null year never writes.
15. Rerendering with an unchanged year writes nothing (stable deps).

`src/test/pipeline/canopy-map-year.test.tsx` (rendered CanopyMap): mock `react-map-gl/maplibre`'s `Map` as a `forwardRef` whose handle returns the mock map from `getMap()` and which fires `props.onLoad` on demand; children and DataLayers stubbed.

16. Mount with `yearFilter=1987` before load; fire `onLoad`; last write 1987. Rerender with 1990; last write 1990.
17. Mount with `yearFilter=null`; fire `onLoad`; write is `DEFAULT_RANGE[0]`.

`src/test/audit/global-state-writer.test.ts` (source-text guard):

Both guards strip `//` and `/* */` comments before matching. "Non-test" excludes `src/test/**` and `**/*.test.*`.

18. The identifier `\bsetGlobalStateProperty\b` not followed by `:` (so optional calls, bracket access and aliases count, a type key does not) appears in exactly one non-test file under `src/`: `src/hooks/useGlobalStateYear.ts`.
19. Inside CanopyMap's `onLoad` body, `onStyleLoad()` appears before `TERRAIN_SOURCE` (the ordering 16 and 17 cannot test: the terrain block never runs without the MapTiler key, mapConfig.ts:27-37).

The CanopyMap test needs import-time mocks for what CanopyMap touches on import and mount: `maplibre-gl`'s `setWorkerUrl` and `addProtocol`, `useMap` (or a stubbed `MapReadout`), and the three map controls. The hook test creates one ref object outside the `renderHook` callback, as CanopyMap's `useRef` does; the hook's effect deps are `[yearFilter, mapRef]`.

**Revert table (Lee, 2026-08-09: a test is not a guard until it has gone red).** Ted records, per test, the mutation, the red line verbatim, and green after restore:
- 1-5: remove the re-apply call in `addLayersToMap` (red on today's behaviour).
- 6: delete only the `!visible` clear branch of the status effect (red at the hide assertion).
- 7: replace `handlePmtilesError`'s body with today's (`setLayerStatus(id, "error")` only, no `setPmtilesFailed`).
- 8: remove the debounce cancel in `clearLayerStatus`.
- 9: two rows: delete the `off("sourcedata", …)` in the add effect's cleanup (the off assertion goes red); remove the re-apply call (the visibility assertion goes red).
- 10: make the status effect clear whenever `!pmtilesFailed`.
- 11: reinstate an `isStyleLoaded()` guard in the hook (a mutation of the new code). 12: restore a hard-coded `DEFAULT_RANGE[0]` write ignoring the latest year. 13: drop the `?? DEFAULT_RANGE[0]` fallback. 14: drop the null check. 15: drop the effect's deps array.
- 16, 17: remove the `onStyleLoad()` call from `onLoad`.
- 18: re-add the page.tsx effect (and, separately, as `map.setGlobalStateProperty?.(`). 19: move the call after the terrain block.

Razor re-runs at least three of these reverts himself, including 16, never trusting the table.

### 6. Docs, in the same branch

- ARCHITECTURE.md near :124-126: the writer is CanopyMap via `useGlobalStateYear`, latched on `load`; `isStyleLoaded()` is never a readiness test, and why.
- ARCHITECTURE.md Status model: status is derived from (visible, failed) at DataLayer level; a clear cancels a pending debounced write; a hidden tile-backed layer does not report error. Stated as it is, with the parked WFS-only in-flight case named. Correct "CanopyMap mounts every registry layer once" to the public set (`LAYER_REGISTRY_AVAILABLE`). `clearLayerStatus` stays a stable `useCallback`.
- ARCHITECTURE.md Rendering, beside PmtilesLayers: the latest-ref re-apply, and why not `useEffectEvent`.
- ROADMAP: `current`/`next` corrected (P0b released 2026-11-02); P0b's post-release record from `summary --unrecorded`. **This relay's own `shipped` entry is not in this release**; it rides in the next release's first commit (ARCHITECTURE, Releases, post-release records). Parking Lot lines for each out-of-scope item below.
- Hand-off: the R1 Owed and Next bullets are replaced by "released pending guards" wording, not an outcome; log entry.

## Batches and dependency graph

Two batches, sequential.

- **B1, year sync (R1-02).** `src/hooks/useGlobalStateYear.ts` (new), `src/hooks/useGlobalStateYear.test.ts` (new), `src/components/map/CanopyMap.tsx`, `src/app/map/page.tsx`, `src/lib/debug/pipeline-logger.ts` (one union member), `src/test/mocks/maplibre.ts` (`calls.setGlobalState`), `src/test/pipeline/canopy-map-year.test.tsx` (new), `src/test/audit/global-state-writer.test.ts` (new). Eight files, one subsystem (the /map shell).
- **B2, layer state (R1-03, R1-05).** `src/components/map/DataLayer.tsx`, `src/contexts/LoadingContext.tsx`, `src/test/mocks/maplibre.ts` (pending flag, effective-state getters), `src/test/pipeline/pmtiles-layers-lifecycle.test.tsx` (new). Four files. Depends on B1 only through the mock.
- **Docs** (ARCHITECTURE.md, ROADMAP.md, `.claude/handoff.md`) at relay close.

## Review Focus

1. A real MapLibre map, not the mock: year and layer state on an actual tile load. Owner: the release's agent live checks (below), run headless on production through `?debug=pipeline` and `window.__OC_HEALTH_REPORT`.
2. StrictMode double-invoke of the add effect with sources pending. Owner: B2, test 9.
3. The render gate after the writer moved. Owner: B1, Razor's written check of the order (useTimeline registers `once("idle")` before the commit that runs the writer), since a unit test cannot observe MapLibre's idle ordering; test 16 proves the writer runs on rerender.
4. Several layers failing on the one shared source. Owner: B2, test 7.
5. A WFS-only layer under the new status effect. Owner: B2, test 10 (harness fixture; no WFS-only layer is on /map).

## Out of scope

Each gets a ROADMAP Parking Lot index line at relay close, except item 1, which is scheduled:

1. Live /map's wheel/drag throw (react-map-gl 8.1.0 vs MapLibre 6.15): brief item 3, its own release.
2. A retry for a failed PMTiles header.
3. WfsLayers' stale-closure race (same class as R1-05; not public).
4. A WFS-only layer's in-flight fetch writing status after it is hidden (not public).
5. `isStyleLoaded()` as a readiness test in DataLayer.tsx:174, :423, :859 (latent, stable deps).
6. StoryMap.tsx:72 and :152 dropping writes while tiles load (lane S).
7. Batch 2's paint re-spine; the URL hash not updating on move (M1a).

## Pre-mortem: it shipped and the map lied. How?

1. **The year never reaches the GPU** because CanopyMap calls the hook but not `onStyleLoad()`: timeline on, cutblocks and fire-history vanish while the bar ticks. Guarded by tests 16, 17 and 19, by calling it first in `onLoad`, and by the live check that compares logged writes with the bar.
2. **The toast still lies.** A clear overtaken by a debounced error, or a test green for the wrong reason. Guarded by the debounce cancel, test 8, the real provider and the revert table.
3. **Batch 2 wraps PmtilesLayers in `memo()`** and the re-apply freezes. The latest-ref works under `memo`; tests 1-5 stay as the tripwire.
4. **`applyFilters` re-applies the base filter over the composed one.** It is the same function the effect uses and reads current `timelineActive`; test 4.
5. **A refactor reintroduces a second `currentYear` writer.** Test 18.

## Assumptions (load-bearing first)

1. After `load`, `setGlobalStateProperty` cannot throw in this app. Verified (MapLibre source, constant `mapStyle`, no `setStyle`). If wrong: MapErrorBoundary shows its crash panel; loud by design.
2. The latest-ref pattern sees current props from a MapLibre listener in every component kind. It is plain closure semantics over a ref written in a layout effect; tests 1-5 prove it.
3. The real `LoadingProvider` mounts in the harness without other providers. Verified by critic r2 (scratch probe; test 6 red on today's code there).
4. The six public layers are tile-backed and `StatusToast` is the only consumer that shows a hidden layer's error. Verified by critic r1 against registry.ts and every `layerStatuses` consumer.

## Inversion: how would we guarantee the map lies after this relay?

Keep a predicate stricter than the failure (R1-02's mistake), keep two writers for one value, let tests run a mock that never takes the async path, or assert against a mock whose setters change identity per render. The design removes the first two; the mock and harness changes remove the last two.

## Gates

1. Critic: plan-reviewer at xhigh, at most three rounds (DECISIONS 2026-10-07). Round 1: CONCERN, folded here.
2. Relay: Ted implements B1 then B2; Razor reviews with revert re-runs. No Jen gate: no visual or copy change.
3. Checks on the rebased tip: `npm test`, `npx tsc --noEmit`, `npm run lint` (zero new warnings in the touched files, not only exit 0), `npm run build`.

## Release

Lane M, kind `behaviour`, through ARCHITECTURE.md Releases, steps 1-8, with the installed tool (`node ~/marvin/state/opencanopy-release-tool/release-ledger.mjs`). Approval: Lee's standing yes. The `--approval` string is the full verbatim amendment text from the DECISIONS Deploy entry (amended 2026-11-10), all three sentences of Lee's words with the attribution "Lee, 2026-11-10 (relayed by marvin session-f1a7d3, stand-in coordinator)" intact, never an excerpt. Rollback target: whatever `status` names as known-good (today 6ae8b912, main 9ad701b). No tool paths change, so no `install` afterwards.

**Who hears what (ARCHITECTURE, Halts, "Who surfaces a halt").** Under the standing yes, step 4's ask is not repeated, but what its window bought, Lee reachable while a red is possible, is kept: when the push lands, the session sends `/notify` (`~/marvin/skills/notify/send.mjs`) naming the release and the rollback target. On any `NEW HALT` from this release, the session itself tells Lee in plain words what stopped and what his choices are, and sends `/notify`. Reports to the coordinator are in addition, never instead.

**Console baseline, before the push.** Script saved in the repo at `scripts/live/console-baseline.mjs` (path named in the evidence so Razor or the next session can rerun it): headless Chromium loads `/map` with no interaction and waits for map idle; captures `console.error` and `pageerror` only; normalises messages by stripping query strings, numbers and request ids. Two runs on the current known-good deploy; a message seen in only one is noise and excluded.

**Blocking guards on the new deploy:**
- Identity: `commit_ref` equals the SHA, `state: ready`; the `oc-build` tag on `/`, `/map`, `/privacy`, each 200.
- `npm run audit:live`: every test passes except the two known by-construction failures (tenure-cutblocks and fish-streams assertions at live-health.spec.ts:187 and :243, routed to brief item 4), named with their titles and lines in the evidence file so a third failure is distinguishable.
- Console: two runs on the candidate; red only for a normalised error that appears in both candidate runs and in neither baseline run. If the two baseline runs disagree so much that the rule cannot be applied, the console check drops to non-blocking for this release and says so in the evidence.

**Agent live checks, deterministic, each first shown able to fire.** Headless production `/map?debug=pipeline`, with Playwright request interception.
- (b) Visibility: on cutblocks (no raster overview, so `__OC_HEALTH_REPORT()`'s Visible column reads only the tiles layers; forest-age and old-growth-250 are unusable because the column also ORs `layer-<id>-raster`), hold the `.pmtiles` header request, toggle cutblocks on, release the request, wait for idle, read the Visible column. Run it first on the current known-good deploy and record that it shows the layer hidden (the defect, so the check can fire); on the candidate it must show visible.
- (a) Year: hold tile responses (not the header), turn the timeline on, step several years, and compare each logged `global-state-year` write with the bar's year. On the known-good deploy the writes are absent by construction (no log stage there), so the check is shown able to fire by the hook's revert in tests 11 and 16, and on production by the candidate's writes matching every step.
- Either check showing the old defect on the candidate is a red guard. Not a visual release, so no phone check is owed (DECISIONS 2026-10-07 amendment).

## Amendment A (2026-11-10, after a live probe of production): `load` is not a readiness signal either

**Evidence.** Headless Chromium (default launch, real GPU) on https://opencanopy.ca/map#layers=cutblocks, map handle found through the React fiber exactly as `e2e/monitoring/live-health.spec.ts` does it, polled every 5 s: the style JSON is parsed at ~6-8 s and `map.loaded()` is true from ~11-35 s, yet for 70 s the PMTiles source `opencanopy` is never added, no `.pmtiles` request is made, `getGlobalState()` is `{}` (CanopyMap's `onLoad` never ran) and terrain is absent; eight `load` listeners sit registered and unfired. One `map.triggerRepaint()` at ~28 s fired `load` at once: the archive was requested, the source and `layer-cutblocks-tiles-fill` appeared, `currentYear` became 1950, terrain attached. Cause, in MapLibre 6.15.0 source (`maplibre-gl-dev.mjs:61261-61264`): `load` fires only inside `_render`, on the first frame where `this.loaded()` is true. When the last frame renders with tiles still pending and they then settle without scheduling another frame (the province-edge raster 404s are the likely trigger), `load` waits for the next interaction. So on production a visitor who opens /map and does not touch it gets no vector layer, no terrain and no timeline year; the first pan or zoom brings them. The Aug audit's "14-40 s vector attach" is probably this.

This promotes the critic's "latent" class (`isStyleLoaded()` as a readiness test, then `on("load")`) to the live defect behind all three findings, and it voids design 1's latch on CanopyMap's `onLoad` (react-map-gl's `onLoad` is that same `load` event).

**The rule:** readiness is "the style JSON is parsed": `map.getStyle()` returns a value (Style.serialize returns undefined until `_loaded`, :48077-48078), and its event is `style.load` (fired by the Map once, before any tile). Never `isStyleLoaded()`, never `load`.

**Design changes (supersede design 1's latch and design 3's add trigger where they conflict):**
- New `src/lib/map/style-ready.ts`: `onStyleReady(map, cb): () => void` — calls `cb` now if `map.getStyle()` is defined, else `map.once("style.load", cb)`; returns a cancel that removes the listener. Not for hot paths (`getStyle()` serializes the style).
- Year: `useGlobalStateYear` takes the map instance (not the ref) and latches through `onStyleReady`, writing the latest year (or `DEFAULT_RANGE[0]`) when it fires. It runs in a small child of `<Map>` in CanopyMap.tsx (`MapStyleSync`, renders null, `useMap()`), because react-maplibre renders children only once the map instance exists (`components/map.js:84`) while CanopyMap's own effects can run before the async `import('maplibre-gl')` resolves. The same child runs CanopyMap's former `onLoad` body (terrain, `map-load` log) through `onStyleReady`; the `onLoad` prop is removed from `<Map>`.
- DataLayer.tsx :174 (SatelliteLayers), :423 (PmtilesLayers), :859 (WfsLayers): `isStyleLoaded() ? go() : on("load", go)` becomes `const cancel = onStyleReady(mapInstance, go)`, cancel in cleanup. :1091 (`updateRasterBeforeId`) reads `const style = mapInstance.getStyle(); if (!style) return;` instead of `isStyleLoaded()`.
- Parked, lane S, reported to the coordinator: StoryMap.tsx:72, :152, its `onLoad` (:219) and `lib/story/visibility.ts:48` have the same readiness pattern on the landing page.

**Mock:** `getStyle()` returns `undefined` while `styleLoaded` is false; `_setTilesPending(true)` makes `isStyleLoaded()` false while `getStyle()` stays defined (the production condition); tests emit `style.load` where they emitted `load`. Every existing test that relied on `_setStyleLoaded(false)` then `_emit("load")` is updated and listed in the report.

**New tests (each with a revert row: restore `isStyleLoaded()` plus `on("load")`):**
20. PmtilesLayers: style JSON parsed, `_setTilesPending(true)`, `load` never emitted, source header resolves (`sourcedata`): layers are added with current visibility.
21. SatelliteLayers: same condition, raster layer added.
22. CanopyMap (rendered): style parsed, `load` never fired: `currentYear` is written (latest year, or `DEFAULT_RANGE[0]`), and a later year change writes.
23. `onStyleReady`: immediate when `getStyle()` is defined; deferred to `style.load` when not; cancel removes the listener.
Guard 19 becomes: after comment stripping, no `on("load"`, `once("load"`, `onLoad=` or `isStyleLoaded(` in `src/components/map/**` or `src/app/map/**` (non-test). Tests 16-17 are rewritten for `MapStyleSync` (no `onLoad`).

**Live check (c), blocking, shown able to fire:** headless `/map#layers=cutblocks`, no interaction, 60 s: the `opencanopy` source and `layer-cutblocks-tiles-fill` exist and `getGlobalState().currentYear` is set. On the known-good deploy this is already recorded as failing (source absent, global state `{}` for 70 s). Live check (b) uses the fiber map handle and `getLayoutProperty` rather than the health report.

Batch impact: B1 gains `src/lib/map/style-ready.ts` and its test (ten files; waiver: the helper and its test are the class fix's one shared primitive, same subsystem); B2 gains the three DataLayer sites (same file) and the mock's tiles-pending flag. Razor reviews the amendment as part of the diff; no critic round 3 (the strategy is unchanged, only the readiness predicate, which is now evidenced from production rather than inferred).

## Round 2 folds

Every must-fix from `2026-11-datalayer-public-path-critic-r2.md` (CONCERN): V-1 tests 1-5 flip pending off before `sourcedata`; V-3 test 10 rewritten to prove WFS-only statuses survive, status effect has no else branch; V-2/V-5 test 9 asserts visibility after a rerender during the wait, two revert rows; C-1 `/notify` at push and on any halt, by the session; V-7 live check (b) on cutblocks with the header held and shown to fire on the known-good deploy, (a) with tiles held; C-2 console guard capture, normalisation, two-run rule, script path; V-4 rows for 13 and 15, 6 and 7 sharpened; V-6 guards strip comments, match the identifier, define non-test, 19 checks order; C-3 full verbatim approval; notes (deps, stable clear, CanopyMap test mocks, lint blind spot, Status-model correction, assumption 3 verified). No round 3: the gate passes on round 2, every r2 item is test or release text, and Razor checks the revert table against the code.

Batch-size note: B1 is eight files; `scripts/live/console-baseline.mjs` is release tooling written at release time, outside both batches.

## Round 1 folds

Every must-fix from `2026-11-datalayer-public-path-critic-r1.md`: (1) CanopyMap wiring tested (16, 17, 19), single-writer guard repo-wide (18), `onStyleLoad()` first in `onLoad`; (2) real `LoadingProvider`; (3) debounce cancel in `clearLayerStatus`, LoadingContext joins B2, test 8; (4) StrictMode-with-pending case, test 9, one `addLayer` per id asserted; (5) the `useEffectEvent` trap recorded, and the design moved to a latest-ref (strategy note, code comment, ARCHITECTURE); (6) effective-state getters, `_reset` clears the pending flag; (7) `pipelineLog` in the writer, concrete agent live checks, console baseline, red guards reported at once; (8) this relay's `shipped` entry moved to the next release, the relayer quoted; (9) WfsLayers and the five `isStyleLoaded()` readiness sites named and parked; (10) two batches throughout, `useCallback` appliers with real deps, no separate initial-visibility mechanism, guard and test 14 in the revert table, `npm ci` or recorded versions, `mapRef` passed instead of a getter. Citation line numbers corrected.
