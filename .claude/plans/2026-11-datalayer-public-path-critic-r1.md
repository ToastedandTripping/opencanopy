Overall verdict: CONCERN (round 1)

# Plan critic, round 1: DataLayer public-path fixes (R1-02, R1-03, R1-05)

Plan: `.claude/plans/2026-11-datalayer-public-path.md` (commit e4630dc on marvin/canopy). Reviewer: plan-reviewer agent (Opus, xhigh), 2026-11-10. Rubric: `rules/plan-critic-rubric.md` v2.

Read before judging: the plan whole; `.claude/DECISIONS.md` (every entry); `.claude/CHARTER.md`; `ARCHITECTURE.md` (Status model, State, Releases in full); `.refresh/2026-09-01-findings/findings-R1.jsonl` (R1-02, R1-03, R1-05); `src/app/map/page.tsx`; `src/components/map/CanopyMap.tsx`; `src/components/map/DataLayer.tsx` (whole file); `src/components/ui/StatusToast.tsx`; `src/contexts/LoadingContext.tsx`; `src/hooks/useTimeline.ts`; `src/test/mocks/maplibre.ts`; `src/test/pipeline/wfs-layers-d10.test.ts`; `src/test/pipeline/data-layer-memo.test.ts`; `src/lib/timeline/filter-expressions.ts`; `src/lib/debug/pipeline-logger.ts`; `src/lib/layers/registry.ts` (public set, six public layer styles); MapLibre 6.15.0 `dist/maplibre-gl-dev.mjs` at every cited line; `@vis.gl/react-maplibre` 8.1.0 `map.js` and `maplibre.js`; react-dom 19.2.4 client builds (dev and prod); eslint-plugin-react-hooks 7.0.1 (the copy eslint-config-next 16.3.0 loads).

Ran (read-only on the repo): `npx eslint` on page.tsx, CanopyMap.tsx, DataLayer.tsx, useTimeline.ts (clean, zero warnings); `npx vitest run` on wfs-layers-d10, data-layer-memo, useTimeline (3 files, 25 passed); one scratch probe of `useEffectEvent` freshness by component kind (file in the session scratchpad, `uee-probe.cjs`, run with node against the repo's react 19.2.4, react-dom 19.2.4 and happy-dom; no repo file written).

## Applicability

Project type: public web app (Next 16 static export, MapLibre 6.15, react-map-gl 8.1), a behaviour fix on the live /map, released through the OpenCanopy release ledger under Lee's standing yes.

- Core dimensions 1 to 10: **[GATING]**.
- **X1 does not fire:** no hardware, heat, power or physical output.
- **X2 does not fire:** no personal data is read or written; LoadingContext holds layer ids and status strings only; the tracker, the report form and /privacy are untouched.
- **X3 does not fire:** the plan produces no research or public factual claim, and changes no public number (its own anti-goal, and the Deploy amendment's carve-out).
- **X7 does not fire:** no MARVIN gate, hook or skill changes, and the release tool's paths are untouched ("No tool paths change, so no install").
- **X4 fires, [ADVISORY]:** the public site's behaviour changes, but no copy, figure, palette, money or legal term.
- **X5 fires, [ADVISORY]:** MapLibre event listeners, a 15 s timer, StrictMode double-invoke, one source shared by six layer instances, a debounced status writer and the timeline's async loop.
- **X6 fires, [ADVISORY]:** a released public app with live guards.
- **X8 fires, [ADVISORY]:** the year writer sits on the timeline hot path (one call per tick); no new dependency.

## Citation check

Every code citation and every "verified" claim in the plan, against the tree at e4630dc.

**Holds.**
- page.tsx:322-327 is the effect; the guard is :325; CanopyMap receives `yearFilter={timeline.yearFilter}` at :699.
- MapLibre 6.15.0: `Map.isStyleLoaded` :59919 returns `Style.loaded()` :47426, which is false on a non-empty `_updatedSources`, any tile manager not loaded, or a busy image manager. `Style.setGlobalStateProperty` :47252 calls only `_checkLoaded` :47473. `Map.setGlobalStateProperty` (:58281-58284) calls `_update(true)`. `Style._loaded` is set false only in the constructor (:47237) and true in `_load` (:47352), so after `load` the setter cannot throw. `_setGlobalStateValues` (:47269) short-circuits an unchanged value.
- CanopyMap.tsx:94 is the hard-coded default; :198 passes a module-constant string. react-maplibre calls `setStyle` only when the `mapStyle` prop changes identity (`maplibre.js:350-363`), and `MAP_STYLES.dark` is a constant (mapConfig.ts:7-11). No `setStyle` in `src/`.
- DataLayer.tsx: the tile-backed early return is :1145, above the clear at :1151-1154; `handlePmtilesError` is :1105-1107; the shared source id is `"opencanopy"` (registry.ts:11). All six public data layers are tile-backed fill layers and all six carry a registry `fill-opacity` (registry.ts, PUBLIC_LAYER_IDS :893-901), so re-applying the no-timeline branch after `addLayer` reproduces the addLayer paint: no visual drift from the fix.
- StatusToast.tsx:26-31 has no visibility check. Assumption 4 holds: the consumers of `layerStatuses` are LoadingBar.tsx:12 ("loading" only), StatusToast.tsx:20 and MapLegend.tsx:292 (enabled layers only), so StatusToast is the only one that shows a hidden layer's error.
- React 19.2.4 exports `useEffectEvent` and @types/react 19.2.14 types it. The react-hooks 7.0.1 rule allows a reference to an effect event anywhere lexically inside an effect callback, including inside a nested function such as `addLayersToMap` (rule source: `useEffectEventFunctions` / `lastEffect`), so calling it from a MapLibre listener registered in the effect, or from a function the effect body defines and calls, is legal by both the lint and the runtime (`mountEvent` only throws inside the render phase).
- The render-gate ordering argument holds. The loop calls `setCurrentYear` (useTimeline.ts:299), loops straight to `waitForPaintTracked`, which calls `waitForRenderRef.current()` synchronously (:221), which registers `map.once("idle")` (page.tsx:309). The commit that runs either writer's passive effect comes after. In that commit CanopyMap's effect runs before page.tsx's (child first) and after DataLayer's filter effect, the same relative order to DataLayer as today.
- `getGlobalState` is called nowhere in `src/` outside the mock, so changing what the mock returns cannot move an existing test; `_setSourcesPending` defaulting to false leaves `isSourceLoaded` as it is for every current caller.

**Loose or off by one** (fix in the plan text; not blocking).
- The addLayer visibility writes are :291, :312 and :358, not :290/:311/:357. The add effect is :238-446. The filter effect is :495-579, not ":494-~560": the extraction must take the whole body to :579, including the no-timeline restore branch. The PMTiles comment is :211-217. SatelliteLayers' `visibleRef` is :122-123 and :148-153.
- "CanopyMap mounts every registry layer": it mounts `LAYER_REGISTRY_AVAILABLE`, the public seven (CanopyMap.tsx:219; registry.ts:910-916). That matters for Review Focus 5 and pre-mortem 4: fish-streams is never mounted on /map.
- "setGlobalStateProperty is a bare vi.fn with no call record": `vi.fn` records `mock.calls`; it is the mock's `calls` object that has no entry for it.
- "main 9ad701b + two docs commits": three commits sit between origin/main and the plan commit (3660ffc, b7df0b4, 7c910d6).
- "handlePmtilesError ... never synchronously in an effect body" is false for the catch path. When the style and the source are both loaded when the add effect runs, `initSource` calls `addLayersToMap` synchronously from the effect body (DataLayer.tsx:391-393, :423-424), so an `addLayer` throw reaches `onError` inside the effect. Harmless at runtime; do not build on the claim.

**Does not hold.**
- **"`useEffectEvent` reads the latest props and may be called from listeners an effect registered" is true only for plain function components in this React version.** react-dom 19.2.4 swaps an effect event's implementation in the before-mutation phase for fiber tag 0 only: `case 0:` applies `ref.impl = nextImpl`, then `case 11: case 15: break;` (react-dom-client.development.js:13874-13892; the production build has the same switch at :8927-8942). Probe result (mount with v=1, rerender with v=2, then call the event from a listener the effect registered): plain function component returned 2; `memo` with a comparator returned 2; `memo` without a comparator returned **1**; `forwardRef` returned **1**. PmtilesLayers is a plain function component, so the design works today. A later `memo(PmtilesLayers)` (a natural Batch 2 move), or any use of `useEffectEvent` inside CanopyMap (a forwardRef), freezes the event at mount props with no error.
- **Review Focus 1: "the agent cannot read `currentYear` on production (`window.__opencanopy_map` is dev-only)".** The pipeline logger runs on production behind `?debug=pipeline` or `localStorage.OC_DEBUG` (pipeline-logger.ts:40-61), and CanopyMap exposes `window.__OC_HEALTH_REPORT` on production whenever it is on (CanopyMap.tsx:115-127). That report reads each layer's effective `visibility` with `getLayoutProperty` (pipeline-logger.ts:104-112, :236-259). One `pipelineLog` line in the new writer makes every `currentYear` write observable on production; the R1-05 symptom is observable there today.

## Dimension verdicts

### 1. Problem-fit [GATING]: PASS
It fixes exactly the hand-off's Owed bullet and brief item 2, and the "fix the class" framing serves CHARTER done (1) ("honest status states instead of silent blanks") and non-goal (3) (the render-gated playhead). The grill skip is written, with an Anchor and Anti-goals; the plan honours both anti-goals (no palette, copy or number change; the no-timeline re-apply reproduces each public layer's registry paint). No DECISIONS entry is contradicted: the Deploy entry and its 2026-11-10 amendment, "Releases go one relay at a time", the critic cap of 2026-10-07, the 2026-10-07 amendment on agent QA and phone checks, and "A public number must be reproducible" were each checked against the plan.

### 2. Approach soundness [GATING]: CONCERN
The three mechanisms are right for today's tree: a `load` latch with a latest-value ref and no `isStyleLoaded()` predicate for the year; status derived from (visible, failed) for tile-backed layers; re-applying current props once the PMTiles layers exist. Three things need writing down before Ted starts.
- **2a. The `useEffectEvent` component-kind trap (see Citation check).** Fix: in design 3 and assumption 2, state "PmtilesLayers must stay a plain function component: in react-dom 19.2.4 an effect event in a `memo()` without comparator or a `forwardRef` component keeps its mount closure"; put the same sentence as a code comment on the effect event; note that tests 1-5 (which rerender with new props during the wait) go red if it regresses, and keep them.
- **2b. Effect deps for the extracted functions.** "The two reactive effects keep their current deps and now call `applyVisibility()` / `applyFilters()`" adds two `react-hooks/exhaustive-deps` warnings (missing dependency on a component-scope function). They are warn-level, `npm run lint` is plain `eslint` and exits 0 on warnings, and Next 16's build skips lint, so no gate would see them; the four touched files lint clean today. Fix: declare `applyVisibility` and `applyFilters` with `useCallback` over exactly the props they read, make each reactive effect depend on its callback, and have the effect event call them. Same behaviour, no suppression.
- **2c. "addLayersToMap writes initial `layout.visibility` / line opacity through the same current value" names no mechanism.** The add effect's closure cannot see current props; it needs a getter (an effect event returning `visible`) or a ref. The stated reason ("no one-frame flash") does not apply: `addLayer` and `applyCurrentState()` run in one JS task, and MapLibre paints on the next animation frame, so it never draws the stale value. Fix: either name the getter, or drop the requirement and let `applyCurrentState()` set it, and in both cases assert effective state (9d).

### 3. Completeness [GATING]: CONCERN
- **3a. The stale-closure sweep misses WfsLayers.** WfsLayers' add effect reads `visible` at :679, :694, :713, :755 and :789 from a closure whose deps (:886) exclude it, waits for `load` on the not-loaded path (:859-863), and its class-filter effect (:980-997) no-ops before the layers exist: the same race as R1-05. It is not reachable today (no public layer is WFS-only), but the plan asks the critic to check the sweep, and it is a member of the class. Fix: name it in the sweep and either apply the same mechanism or park it in the ROADMAP Parking Lot with "not public" as the reason.
- **3b. The wrong-predicate class has other members.** `isStyleLoaded()` used as a readiness test: DataLayer.tsx:174, :423 and :859 decide "add now, or wait for `load`". If one of those effects ever runs after `load` while any tile is in flight, it waits for a `load` that has already fired and the layers are never added. Latent, because their deps are stable in production, but :423 is inside the effect B2 edits. On the landing page, StoryMap.tsx:72 (camera) and :152 (binary reveal) drop a write while tiles load and retry only on the next prop change; :152 is the drop the hand-off's 2026-10-07 log records. Fix: list all five in the plan; fix nothing on the story path in this relay (lane S); park or route each; and have the ARCHITECTURE note on R1-02 state the rule ("`isStyleLoaded()` is never a readiness test").
- **3c. LoadingContext's debounce breaks the invariant the plan will document.** Terminal statuses are set after a 250 ms per-id debounce (LoadingContext.tsx:115-124), and `clearLayerStatus` (:129-136) neither cancels that timer nor blocks it. A layer hidden within 250 ms of its error gets the clear first and the error after, so a hidden layer can still toast, and design 2's "a hidden layer never reports error" (and the planned ARCHITECTURE Status-model wording) is not strictly true. Rare, but it is this relay's invariant. Fix: `clearLayerStatus` cancels the pending debounce for that id (LoadingContext.tsx joins B2, four files), proven by a test on the real LoadingProvider; or soften the documented invariant and park the race.
- **3d. The CanopyMap wiring is untested.** See 9a.
- **3e. Order inside `onLoad`.** Call `onStyleLoad()` first, before the terrain block (CanopyMap.tsx:85-92), so a throw there cannot skip the year write that is now the only default.
- Minor, non-public: a WFS-only layer whose fetch is in flight when it is hidden still receives the fetch's terminal status after the clear (DataLayer.tsx:1220-1236 run after `await`). Not on /map today; name it with 3a.

### 4. Right-sizing & reuse [GATING]: CONCERN
- **4a. The batch count contradicts itself.** The header says "standard relay, one batch" and Gates says "Ted implements (one batch)"; Batches says "Two batches, sequential (B1, B2)". Pick one. Two is fine (six files and three, one subsystem each, the mock dependency declared).
- **4b. Parking Lot.** Whatever of 3a, 3b and 3c is not fixed here gets an index line, as the rubric requires of every out-of-scope item.
- **4c. The finding's own preferred R1-05 shape is not weighed.** R1-05's fix-shape option (b), a `layersReady` counter that re-runs the two reactive effects, is absent from Strategies. Not a defect; add one line saying why the effect event wins (no extra render, nothing drawn at stale state) or switch to it if 2a's pin is judged the larger risk.
- Proportion is fine: no code bodies beyond the quoted defect and one signature.

### 5. Security [GATING]: PASS
No new surface, secret or network path. The debug logger recommended in 9f already ships and is opt-in per browser.

### 6. Failure modes [GATING]: PASS
A dead PMTiles header: every instance times out independently, only visible layers report, and no retry is named out of scope. A wiring or style premise breaking: the year write is uncaught on purpose. Advisory: say what "loud" means here. MapErrorBoundary wraps the whole page (page.tsx:689-1107), so a throw in CanopyMap's effect replaces /map with the crash panel; that is acceptable only while no style switch exists, which the plan verified. Add one line so a future basemap toggle revisits it.

### 7. Change safety [GATING]: CONCERN
The release path is the ledger's, the rollback target is named from `status`, every step is a git commit that `git revert` undoes, and no tool path changes. One mismatch with ARCHITECTURE Releases is detailed under the Release section below: the plan writes this relay's ROADMAP `shipped` entry into its own release, which the runbook says rides in the next release's first commit. Fix there.

### 8. Data integrity & compatibility [GATING]: PASS
One writer of `currentYear` (single source), status single-sourced from (visible, failed), no stored artifact, URL format or localStorage key touched, no public number moved. The single-writer rule needs a repo-wide guard to stay true (9a).

### 9. Verifiability (incl. testing the tests) [GATING]: CONCERN
Tests 1-7 target the real component under StrictMode and are red on today's code as written (checked against the add, visibility and filter effects); the revert-proof rule and Razor's three re-runs are right. Seven gaps.
- **9a. Nothing proves CanopyMap uses the hook.** Tests 8-11 drive the hook directly; the source-text guard checks only that page.tsx has no writer and that `onLoad` has no literal `DEFAULT_RANGE[0]`. A CanopyMap that calls the hook but never calls `onStyleLoad()` passes every planned test and guard. On production the latch never sets, `currentYear` is never written, and with the timeline on every filter compares against an unset global, which `filter-expressions.ts:37-40` itself documents as false: cutblocks and fire-history vanish while the bar ticks. The hard-coded `onLoad` write, today's only fallback, is deleted by the same change. Fix: a rendered CanopyMap test (mock `react-map-gl/maplibre`'s default `Map` as a forwardRef whose handle returns the mock map from `getMap()` and that fires `props.onLoad` on demand; assert the pre-load year is written after load and each later year change writes), or at least extend the guard: CanopyMap calls `useGlobalStateYear(` with its `yearFilter` and calls `onStyleLoad()` inside `onLoad`. Make the single-writer half repo-wide: `setGlobalStateProperty` appears in exactly one non-test file under `src/`, `src/hooks/useGlobalStateYear.ts`.
- **9b. Test 6 goes green on today's code for an unrelated reason.** The d10 harness's LoadingContext mock returns fresh `vi.fn()`s on every call (wfs-layers-d10.test.ts:48-54). DataLayer's unmount-cleanup effect depends on `clearLayerStatus` (DataLayer.tsx:1248-1253), so under that mock it tears down, and calls `clearLayerStatus(layer.id)`, on every DataLayer re-render. Rerendering with `visible=false` therefore records `clearLayerStatus(id)` on today's code, and test 6 passes before the fix. The same churn re-runs any new effect that lists the setters, which hides ordering. The revert proof would catch this during the relay; fix it in the plan instead. Fix: the recording mock returns one stable object with hoisted `vi.fn()`s, as the real provider's `useCallback`s are stable; better, mount the real `LoadingProvider` and assert on `layerStatuses` after advancing fake timers past 250 ms, which is the oracle finding R1-03 proposed and which also exercises 3c.
- **9c. Review Focus 2's owner does not exercise its item.** Tests 1-5 mount with the style not loaded, so StrictMode's double-invoke registers and removes a `load` listener before any `sourcedata` handler exists. "Two `sourcedata` handlers, one cleaned up" needs a case that mounts with the style loaded and sources pending under StrictMode, then flips pending and emits `sourcedata`. Assert one `addLayer` per id from `calls.addLayer` and that the first handler was passed to `off("sourcedata")`. Make "exactly one `addLayer` per layer id" an assertion, not Razor's confirmation.
- **9d. The oracles need effective state.** The mock seeds paint from the `addLayer` config but not layout or filter (maplibre.ts:97-127; `layoutValues` has no getter; `filterValues` holds only `setFilter` calls). "`layout.visibility === "visible"`" can be read from the addLayer config or from the last `setLayoutProperty`, and each gives a different answer depending on how the fix is written; only the merge of the two is what MapLibre draws. Fix: add `getLayoutProperty(id, prop)` and `getFilter(id)` to the mock, seeded from `addLayer` and overwritten by `setLayoutProperty` / `setFilter`, and assert through them. No existing test reads `_getFilterValues` or layout state, so this cannot move a current test. Also: `_reset` must reset the pending flag, and the recording `setGlobalStateProperty` should keep `return this`.
- **9e. The revert table.** Add the source-text guard (re-add the page.tsx effect, see it red) and test 11 (drop the null check). Tests 8 and 9 are proven against mutations of the new hook, not against today's code; say that in the table rather than "red on today's code".
- **9f. Review Focus 1's premise is wrong (Citation check).** Fix: add a `pipelineLog` call to the writer (a stage added to the `PipelineStage` union, pipeline-logger.ts:20), and make the live checks concrete and agent-run: headless `/map?debug=pipeline` on production; turn the timeline on during the first seconds of load, step several years, and compare each logged write with the bar's year; turn a layer on in the first seconds and read `__OC_HEALTH_REPORT()`'s Visible column for it. Whether to make them blocking is the session's call; they are no longer unobservable.
- **9g. This worktree's toolchain is not the locked one.** `node_modules` has vitest 4.1.1 and happy-dom 20.10.2, while package-lock.json pins 4.1.12 and 21.0.4 (the lockfile last changed 2026-11-01; the install dates from 2026-10-22). The runtime packages the plan cites match the lock (maplibre-gl 6.15.0, react and react-dom 19.2.4, react-map-gl 8.1.0). The revert proofs and the step-2 checks would run under a toolchain CI does not use. Fix: `npm ci` before B1; the hand-off says the classifier blocks installs from a session, so if it does, name the installed versions in `--checks` and treat CI on main as the locked-toolchain run.

The Review Focus section is present with five items, each owned. 9c is a mis-assigned owner, not a missing one, so no FAIL.

### 10. Maintainability [GATING]: CONCERN
- **10a.** Write the 2a constraint where Batch 2 will read it: a code comment on the effect event, and a line in ARCHITECTURE (Rendering, beside `PmtilesLayers`).
- **10b.** The planned Status-model text must not say "never" while 3c stands.
- **10c.** The ROADMAP `shipped` entry: see Release.
- **10d.** Pin `getMap`'s identity. If CanopyMap passes an inline arrow and the hook lists it in the effect's deps, the write fires on every CanopyMap render (every page render: every tick, every rendering-chip change). MapLibre short-circuits the unchanged value, but `Map._update(true)` still schedules a repaint each time. Fix: a `useCallback` over `mapRef`, or pass the ref.

### X4 Audience, brand & money accuracy [ADVISORY]: PASS
No copy, figure, palette or label changes; the anti-goal on visuals holds (see Citation check on `fill-opacity`).

### X5 Concurrency & re-entrancy [ADVISORY]: CONCERN
3c (debounce against clear), 2a (memo and forwardRef freeze) and 9c (StrictMode with sources pending). In the plan's favour: `applyCurrentState` and the reactive effects are idempotent (MapLibre short-circuits a deep-equal `setFilter` and an unchanged global); each of the six instances times out on its own and only visible ones report; a second `onStyleLoad` rewrites the same latest year; every handler on the shared source sees the same metadata `sourcedata` event, so all six add on it.

### X6 Operability & observability [ADVISORY]: CONCERN
9f, plus two things. "No new console error during load" has no baseline: capture the console of the current known-good deploy with the same headless script first, then diff. Under the standing yes Lee is not asked, but a red guard "goes to him" and "No daemon watches for halts" (ARCHITECTURE, Halts): send `/notify` when the push lands, so a halt does not wait for him to happen by.

### X8 Dependencies, performance & cost [ADVISORY]: PASS
No new package. The hot-path cost is one `setGlobalStateProperty` per tick, as today, provided 10d holds.

## Release section against ARCHITECTURE Releases and the 2026-11-10 Deploy amendment

**Matches.** Lane M, kind `behaviour`; the installed tool path, never the worktree copy; sequence steps 1-8, with `summary --unrecorded` carrying P0b's post-release record into the first commit (step 1); the four checks on the rebased tip (step 2); a rollback target read from `status` (the expected 6ae8b912 / 9ad701b agrees with the hand-off's 2026-11-10 log); no `install`, since no tool path changes (step 9); approval from the standing yes, cited verbatim and marked relayed; identity guard on `commit_ref`, `state: ready` and the `oc-build` tag on `/`, `/map`, `/privacy`; not a visual release, so no phone check (2026-10-07 amendment). The amendment's limits are respected: no public number changes, nothing is deleted, `install` is not used, no rollback by the session, and the release is conditional on the critic not ending at FAIL.

**Mismatches.**
- **ROADMAP `shipped` entry for this relay, in this relay's own release.** ARCHITECTURE: "**Post-release records** (`shipped`, guard results, deploy id) ride in the next release's first commit, since pushing them alone is itself a release." Fix: this release carries the `current`/`next` corrections and P0b's record; this relay's `shipped` entry rides in the next release, where `summary --unrecorded` will list it. The hand-off edits stay as pre-merge edits, worded as "released pending guards", not as an outcome.
- **Who relayed it.** ARCHITECTURE, Lee's words: "A peer session's relay is recorded as relayed, and by whom". Quote the amendment's text with its "(relayed by marvin session-f1a7d3, stand-in coordinator)" intact, and say so in the plan.
- **Step 4's window.** "Ask Lee, naming the rollback target ... and the ~20-minute window he should stay for" has no counterpart under the standing yes; the X6 `/notify` covers the part that still matters, being reachable if a guard goes red.
- **`audit:live` recorded green with two failures.** The bootstrap `init` set the precedent. Name the two failing test titles and their line numbers in the evidence file, so the next session can tell a third failure from the known two.

## Stress tests

### Pre-mortem: it is February, and this relay is why the map lied
1. **The year never reaches the GPU.** CanopyMap calls the hook but `onStyleLoad()` is not wired into `onLoad`, or the terrain block throws first. Every planned test and guard passes. On production, with the timeline on, cutblocks and fire-history disappear (every filter compares against an unset global) while the bar ticks through the years over an empty map. This is the type-specific worst case: the public map shows a picture the data does not support, in the very place the charter's render-gated playhead promise covers. What we should have seen: no test renders CanopyMap, the old fallback write was deleted in the same change, and the live check was declared unobservable when it is not. (9a, 3e, 9f.)
2. **The toast still lies, and the docs say it cannot.** A reader turns a failing layer off inside the 250 ms debounce, and the error lands after the clear; or test 6 was green for the cleanup-effect reason and nobody noticed. ARCHITECTURE now states that hidden layers never report error. (3c, 9b, 10b.)
3. **Batch 2 wraps PmtilesLayers in `memo()`** to cut renders. The effect event freezes at mount props and R1-05 returns. Tests 1-5 catch it, provided they survive the refactor unedited. (2a, 10a.)

### Load-bearing assumptions
1. **After `load`, `setGlobalStateProperty` cannot throw in this app.** High confidence, verified: `Style._loaded` only ever flips to true after construction; `mapStyle` is a constant; react-maplibre calls `setStyle` only on a prop-identity change. If wrong, MapErrorBoundary replaces /map with its crash panel: loud, as intended, and worse than one skipped tick. (6.)
2. **`useEffectEvent` sees the latest props from a listener.** True for PmtilesLayers only because it is a plain function component; probed against 19.2.4. If wrong (memo, forwardRef): a silent R1-05 regression, caught by tests 1-5. (2a.)
3. **The recording LoadingContext mock behaves like the provider.** False for the harness as written: its setters change identity on every call. Resolve before implementation. (9b.)
4. **Agents cannot observe the fix on production.** False: the debug logger and the health report run there. Resolving it upgrades the release evidence. (9f.)

### Inversion
- **Strategy A (spot patches) wins** if Batch 2 were about to rewrite these effects anyway. It is not: the hand-off orders this relay first, and A leaves the filter half of R1-05 and the hidden-layer toast open. B stands.
- **Strategy C (declarative `<Layer>`) wins** if react-map-gl's async-source failure were fixed in 8.1.0. Unverified, and reshaping these effects is Batch 2's job. B stands.
- **R1-05 option (b), a `layersReady` counter, wins** if the effect event's component-kind trap or its lint handling is judged worse than one extra PmtilesLayers render per add. Part of that condition is true now (2a). Either is acceptable; record the choice (4c).
- **A try/catch around the year write wins** if a basemap or style switch ever ships. Nothing in the tree or the ROADMAP does that today, so no-catch stands, with the loud failure named (6).

## Close

**Overall verdict: CONCERN (round 1).** The diagnosis is accurate on today's tree; every MapLibre citation holds; the three mechanisms are correct for the components they sit in; the render-gate ordering argument is right; the mock change cannot move an existing test; and the release section follows the runbook and the 2026-11-10 amendment except for where this relay's `shipped` record goes. No gating dimension fails. What keeps it from a PASS is the proof layer. The one piece of wiring that makes R1-02 work on production has no test and replaces the only fallback. One planned test goes green on today's code for an unrelated reason. One Review Focus owner does not exercise its item. The debounce in LoadingContext breaks the invariant the docs will state. And the `useEffectEvent` choice carries a version-specific trap the plan does not record. All of it folds into the plan text without changing strategy.

**Must-fix, in priority order.**
1. 9a: a rendered CanopyMap test, or a guard that CanopyMap feeds the hook `yearFilter` and calls `onStyleLoad()` in `onLoad`; a repo-wide single-writer guard. Call `onStyleLoad()` first in `onLoad` (3e).
2. 9b: a stable-identity LoadingContext mock, or the real LoadingProvider with assertions on `layerStatuses`.
3. 3c: `clearLayerStatus` cancels the pending debounce for its id (LoadingContext.tsx joins B2), or soften the invariant and park the race.
4. 9c: a StrictMode case with the style loaded and sources pending; "one `addLayer` per id" as an assertion.
5. 2a and 10a: write down the `useEffectEvent` component-kind constraint (plan, code comment, ARCHITECTURE).
6. 9d: effective-state getters for layout and filter in the mock; `_reset` resets the pending flag.
7. 9f and X6: a `pipelineLog` in the writer; concrete agent live checks through `?debug=pipeline` and `__OC_HEALTH_REPORT`; a console baseline from the current deploy; `/notify` at push.
8. Release: move this relay's `shipped` entry to the next release; quote the relayed words with the relayer.
9. 3a, 3b and 4b: name WfsLayers and the other `isStyleLoaded()` readiness members; fix or park each, with Parking Lot lines.
10. 4a, 2b, 2c, 9e, 9g, 10d: one batch count; `useCallback` deps for the extracted functions; a named mechanism (or none) for the initial visibility write; the guard and test 11 in the revert table; `npm ci` or recorded versions; a stable `getMap`.
