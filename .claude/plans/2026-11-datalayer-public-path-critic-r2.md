Overall verdict: CONCERN (round 2)

# Plan critic, round 2: DataLayer public-path fixes (R1-02, R1-03, R1-05)

Plan: `.claude/plans/2026-11-datalayer-public-path.md` at b1e469f (marvin/canopy). Round 1: `-critic-r1.md`, CONCERN. Reviewer: plan-reviewer agent (Opus, xhigh), 2026-11-10 23:44 UTC (`date -u`). Rubric: `rules/plan-critic-rubric.md` v2. Round 2 of at most three (DECISIONS 2026-10-07).

Read before judging: the plan whole and `git diff e4630dc b1e469f` on it; round 1 whole; `.claude/DECISIONS.md` (`decisions-check.sh`: 29 entries, `ref=origin/main@9ad701b 2026-11-02`, no shrink); ARCHITECTURE.md (Rendering, Status model, State, Releases including Halts and Lee's words); `.claude/handoff.md`; findings R1-02, R1-03, R1-05; `src/contexts/LoadingContext.tsx` in full; `src/components/map/DataLayer.tsx` (SatelliteLayers, PmtilesLayers whole, DataLayer main whole); `src/components/map/CanopyMap.tsx` in full; `src/app/map/page.tsx` (:290-335, :685-705); `src/test/mocks/maplibre.ts` in full; `src/test/pipeline/wfs-layers-d10.test.ts` (harness); `src/lib/debug/pipeline-logger.ts` (logger and health report); `src/hooks/useLayerState.ts` (:160-200); `src/lib/mapConfig.ts`; `src/lib/layers/pmtiles-source.ts`; `src/lib/layers/registry.ts` (public set, raster overviews, defaults); `@vis.gl/react-maplibre` 8.1.0 `components/map.js`; `react-map-gl` 8.1.0 `maplibre.d.ts`; `e2e/monitoring/live-health.spec.ts` (:187, :243).

Ran (read-only on the repo; every scratch file is under the session scratchpad `.../scratchpad/r2/`, nothing written to the repo but this file):
- `npx vitest run` on wfs-layers-d10, data-layer-memo, source-registration: 3 files, 25 passed.
- `rt/probe-today.test.tsx`, a rendered probe of TODAY's DataLayer and LoadingContext through a scratch vitest config (root in the scratchpad, `@` aliased to the repo's `src`): 5 of 5 assertions as stated below.
- `rt/probe-design3.test.tsx` against `rt/design3.tsx` (a cut-down PmtilesLayers built to design 3, StrictMode, real LoadingProvider): green; with the `applyCurrentStateRef.current()` call removed, the async-path case goes red (`expected 'none' to be 'visible'`).
- `npx eslint --stdin --stdin-filename src/...` on design-3 and hook probes, plus four negative controls showing the rules can fire.
- Toolchain caveat, as the plan states: vitest 4.1.1 and happy-dom 20.10.2 installed, lockfile pins 4.1.12 and 21.0.4.

## Applicability

Project type: public web app (Next 16 static export, MapLibre 6.15, react-map-gl 8.1), a behaviour fix on the live /map, released through the OpenCanopy release ledger under Lee's standing yes.

- Core dimensions 1 to 10: **[GATING]**.
- **X1 does not fire:** no hardware, heat, power or physical output.
- **X2 does not fire:** no personal data; LoadingContext holds layer ids and status strings; the tracker, report form and /privacy are untouched.
- **X3 does not fire:** no research output or public factual claim; no public number changes (anti-goal, and the Deploy amendment's carve-out).
- **X7 does not fire:** no MARVIN gate, hook or skill changes; the release tool's paths are untouched (no `install`).
- **X4 fires, [ADVISORY]:** public behaviour changes, no copy, figure, palette, money or legal term.
- **X5 fires, [ADVISORY]:** MapLibre listeners, a 15 s timer, StrictMode double-invoke, one source shared by six instances, a debounced status writer, the timeline's async loop.
- **X6 fires, [ADVISORY]:** a released public app with live guards and halt handling.
- **X8 fires, [ADVISORY]:** one write per timeline tick on the hot path; no new dependency.

## Round 1 folds, checked against the plan text (not the "Round 1 folds" paragraph)

| r1 must-fix | Folded? | Where, and what is left |
|---|---|---|
| 1. CanopyMap wiring tested; repo-wide single writer; `onStyleLoad()` first | Yes, with gaps | Tests 16, 17, guards 18, 19, design 1. Guards 18-19 can be satisfied or evaded by text (V-6); "first in `onLoad`" is stated, never tested (A-3) |
| 2. Stable mock or real LoadingProvider | Yes | Design 5 header. Probe: the real provider mounts alone under StrictMode with fake timers, and test 6 is red on today's code there (assumption 3 is now verified) |
| 3. Debounce cancel, LoadingContext in B2, test 8 | Yes | Design 2, B2, test 8. Sound (see "The debounce cancel" below) |
| 4. StrictMode with style loaded and sources pending; one `addLayer` per id asserted | Partly | Test 9 exists, but its revert row cannot turn it red (V-2) |
| 5. `useEffectEvent` trap recorded | Yes, and exceeded | Design moved to a latest-ref; strategy note, code comment, ARCHITECTURE line |
| 6. Effective-state getters; `_reset` clears pending | Yes | Design 4 |
| 7. `pipelineLog` in the writer; concrete agent live checks; console baseline; `/notify` at push | Partly | Log, checks and baseline are in. `/notify` was dropped for "reporting to the coordinator" (C-1), and live check (b) cannot see the defect on two of the six layers (V-7) |
| 8. `shipped` entry to the next release; relayer quoted | Yes | Docs, Release. The `--approval` text in the plan is elided with "..." (C-3) |
| 9. WfsLayers and the `isStyleLoaded()` readiness sites named and parked | Yes | Design 3 sweep, Out of scope 3-6, ARCHITECTURE rule |
| 10. One batch count; `useCallback` deps; no initial-visibility mechanism; guard and null-check test in the revert table; `npm ci`; stable map handle | Yes | Header and Batches agree on two; design 3; revert rows 14 and 18; Toolchain line; `mapRef` |

Citations re-checked on today's tree and holding: DataLayer.tsx :122-123, :148-153, :174, :238-446, :291, :312, :358, :423, :448-475, :495-579, :679, :694, :713, :755, :789, :859, :886, :980-997, :1105-1107, :1145, :1151-1154, :1220-1236, :1248-1253; StoryMap.tsx :72, :152; StatusToast.tsx :26-31; useTimeline.ts :221, :299; page.tsx :309, :322-327, :689; live-health.spec.ts :187 and :243 are the two named test declarations.

## Adversarial review of what changed

### The R1-05 mechanism (design 3): sound, and now proven

- **Runtime.** The probe built to design 3 (two `useCallback` appliers, reactive effects depending on them, `applyCurrentStateRef` assigned in `useLayoutEffect`, called from `addLayersToMap`) passes under StrictMode on both paths: the async path (style not loaded, toggle during the wait, `load`) ends `"visible"`, and the sync path (style loaded at mount) applies mount props with one `addLayer`. Removing the call turns the async case red. So assumption 2 holds by test, not only by argument.
- **Ordering.** Layout effects run in the commit before passive effects, and on StrictMode's re-mount layout effects reappear before passive effects reconnect. A MapLibre event that lands between a commit's layout phase and its passive flush already sees the new appliers, which is strictly earlier than the passive reactive effect; the reactive effect then re-applies idempotently. No window exists in which the ref lags a committed render.
- **Lint.** The design-3 probe lints clean (exit 0, no warnings) with the add effect's existing suppression. Negative controls show `exhaustive-deps` fires on a missing applier dep and `react-hooks/refs` fires on a render-time ref read in a component with no suppression.
- **A blind spot round 1 missed (advisory).** The repo's eslint config runs the React Compiler rules as errors (`refs`, `set-state-in-effect`, `immutability`, `preserve-manual-memoization`), but the compiler skips any component containing an `eslint-disable` of a react-hooks rule, and its rules go silent with it. Probe: a ref read during render inside the design-3 PmtilesLayers is not reported while the add effect's suppression is present, and is reported (error) once it is removed. PmtilesLayers (:445), SatelliteLayers (:192), WfsLayers (:885) and DataLayer itself (:1244) all carry one, which is why SatelliteLayers' render-time `visibleRef.current = visible` (:123) passes lint today. "Lint clean in the touched files" is therefore no evidence for the ref discipline in either touched component; tests 1-5 are the only guard. Say so in the plan and in the code comment, so neither Razor nor Batch 2 leans on lint here.

### The debounce cancel in `clearLayerStatus`: sound

`useDebounce` (LoadingContext.tsx:58-86) keeps one timer per key in a `Map`, and `setLayerStatus` keys it on the layer id (:117); a new terminal status for the same id replaces the pending one. So a cancel inside `clearLayerStatus(id)` can drop only a terminal status queued for that same id before the clear. Anything set after the clear schedules a fresh timer and lands. `"loading"` is immediate and never debounced (:108-114), so it is untouched. The only callers of `clearLayerStatus` in `src/` are loadData's hidden branch (:1151-1154), the unmount cleanup (:1248-1253) and the new status effect, and each means "this layer is off or gone", so a terminal status queued before any of them is stale by definition. StrictMode's simulated unmount runs the cleanup before anything is queued (the PMTiles timeout is 15 s away; WFS terminals arrive after an `await`). No legitimate later status can be dropped. The parked WFS-only in-flight case is untouched by the cancel, because its terminal is queued after the clear, which matches the plan's parking.

One line to add: the cancel must be a `useCallback` over the timers ref so `clearLayerStatus` stays referentially stable. DataLayer's unmount-cleanup effect lists it in its deps (:1253); an unstable identity would re-run that cleanup on every provider render and clear every layer's status. Tests 6 and 7 would go red, so this is cheap insurance, not a hole.

### The real-LoadingProvider harness: sound, verified

Probe `probe-today` mounts today's DataLayer inside the real `LoadingProvider` under StrictMode with fake timers: the 15 s timeout plus 300 ms yields `error`, and after `visible=false` the error is still there. Test 6 is red on today's code for the right reason, which closes round 1's 9b. Assumption 3 no longer needs Ted to confirm it.

### The rendered CanopyMap test against react-maplibre 8.1.0: feasible, under-specified (advisory)

`react-map-gl/maplibre` re-exports `@vis.gl/react-maplibre` with `Map` as the default export (`maplibre.d.ts`), and the real `Map` mounts its children only after the map instance exists (`components/map.js:84`) and sets its ref handle with `useImperativeHandle(ref, ..., [mapInstance])`. A `forwardRef` mock whose handle returns the mock map, with `onLoad` fired on demand, reproduces the order the hook depends on: no write before the latch, the latest year at load, every later change written. What the plan does not name, and Ted will hit on import: CanopyMap calls `setWorkerUrl` from `maplibre-gl` at module load when `window` exists (:37-41), and `initPMTiles()` calls `addProtocol` from `maplibre-gl` (pmtiles-source.ts); the mock module needs `default` (Map), `NavigationControl`, `ScaleControl`, `GeolocateControl`, and `useMap` unless `MapReadout` is stubbed as well as DataLayer and MapPopup. One sentence in the plan saves a round trip.

### Test 15 and its row

The hook now takes `mapRef`. Its effect cannot be written `[yearFilter]`: a probe of the hook with that dep list draws `react-hooks/exhaustive-deps: missing dependency 'mapRef'`, which the plan's "zero new warnings" gate forbids, so the deps will be `[yearFilter, mapRef]`. Test 15 then holds only if the test creates one ref object outside the `renderHook` callback, as CanopyMap's `useRef` does. Its revert row, "pass an inline getter in the deps", describes the round-1 API and has no counterpart in this one (V-4).

### Guards 18 and 19: satisfiable by text

- 18 searches for `setGlobalStateProperty(`. A second writer written `map.setGlobalStateProperty?.("currentYear", y)`, `map["setGlobalStateProperty"](...)` or through a bound alias contains no `setGlobalStateProperty(` and passes; a comment containing the string in another file fails it falsely. "Non-test file" is undefined: `src/test/mocks/maplibre.ts` is not a `*.test.*` file, and if the recording mock is written in method shorthand (`setGlobalStateProperty(name, value) {`) the guard goes red on its own infrastructure.
- 19 is satisfied by a comment inside `onLoad` such as `// onStyleLoad() must run first` with the call removed, and "inside `onLoad`" requires slicing a `useCallback` body by regex. It shares its mutation with 16 and 17, which prove the same wiring behaviourally, so as written it adds nothing they do not.

### The release section's replacement for step 4

The 2026-11-10 amendment does cover step 4's "ask": "a session releases each item that comes green through this project's own gates ... without asking again". What the ~20-minute window bought was Lee reachable while a red guard is possible, because only he rolls back and the failed candidate stays live until he acts (ARCHITECTURE, Red release). The replacement routes that through "the coordinator", which the amendment itself calls a stand-in. ARCHITECTURE, Halts, "Who surfaces a halt", is explicit: the session whose command printed `NEW HALT` "tells Lee in plain words what stopped and what the choices are, and sends `/notify`", and "No daemon watches for halts". The amendment's own words are that "a red guard still halts and goes to him". The plan must keep the runbook's duty, not swap it for a relay (C-1).

## Dimension verdicts

### 1. Problem-fit [GATING]: PASS
Unchanged from round 1 and still right: the plan fixes the hand-off's Owed bullet and brief item 2 and serves CHARTER done (1) and non-goal (3). The grill skip is written with an Anchor and Anti-goals, and the extraction of the two appliers stays inside the anti-goal on Batch 2's effects. No DECISIONS entry is contradicted: Deploy and its 2026-11-10 amendment (the release is conditional on the critic not ending at FAIL; no number, deletion or install), "Releases go one relay at a time", the three-round cap, the 2026-10-07 agent-QA amendment (not a visual release, so no phone check), and "A public number must be reproducible".

### 2. Approach soundness [GATING]: PASS
All three mechanisms hold under adversarial reading and, for the two that carried risk, under probes: the latest-ref re-apply (green with the call, red without, StrictMode, both paths); the debounce cancel (keyed on id, can drop only a pre-clear terminal for the same id, all clear callers mean off or gone); the `load` latch with a layout-effect latest-year ref. Two notes for the plan text, not defects: the hook effect's deps will be `[yearFilter, mapRef]`, and `clearLayerStatus` must stay stable.

### 3. Completeness [GATING]: PASS
Every path round 1 named is now fixed, tested or parked with a reason. Advisories: (A-1) the ARCHITECTURE Status-model paragraph says "CanopyMap mounts every registry layer once"; the planned edit should correct it to the public set, the same correction round 1 made to the plan. (A-2) The CanopyMap test's import-time mocks (above). (A-3) "`onStyleLoad()` first, before the terrain block" is untestable as planned, because `TERRAIN_SOURCE.enabled` is false without the MapTiler key (mapConfig.ts:27-37), so the block never runs in a test. Either fold it into guard 19 (V-6) or accept it as stated.

### 4. Right-sizing & reuse [GATING]: PASS
Two batches, B1 at exactly eight files (the limit, not over), B2 at four, the mock dependency declared. No code bodies beyond one signature. Every out-of-scope item gets a Parking Lot line at relay close. The latest-ref reuses closure semantics rather than adding a render (option ii) or a version-fragile API (option i), and the strategy note says why.

### 5. Security [GATING]: PASS
No new surface, secret or network path. The new `pipelineLog` stage is opt-in per browser.

### 6. Failure modes [GATING]: PASS
A dead PMTiles header: each instance times out alone, only visible layers report, showing a failed layer restores its error, no retry (parked). A throwing year write after a future `setStyle`: loud by design, with a code comment and an ARCHITECTURE line naming the condition. The console-guard false red is a change-safety problem and is listed there.

### 7. Change safety [GATING]: CONCERN
- **C-1. Halt surfacing.** Fix: on any `NEW HALT` from this release, the session tells Lee in plain words what stopped and his choices and sends `/notify` itself (`~/marvin/skills/notify/send.mjs`), per ARCHITECTURE Releases, "Who surfaces a halt"; the coordinator report is in addition. Keep round 1's `/notify` when the push lands, since that notice is what stands in for the window step 4 used to name.
- **C-2. The blocking console guard has no precision rule.** A red `guard` halts both lanes, red to green needs Lee's `--lee`, and "re-running a guard until it passes is not a recovery". A single-run diff of console output against a single-run baseline will trip on run-to-run noise (aborted tile requests, basemap 404s, timing-dependent warnings promoted to errors) and halt both lanes on nothing. Fix: state what is captured (`console.error` and `pageerror` only), how messages are normalised (query strings, numbers, request ids stripped), and a reproducibility rule before red is recorded: two baseline runs on the known-good deploy (anything in only one is noise) and two runs on the candidate (a new error must appear in both). Save the script and name its path in the evidence file so Razor or the next session can rerun it.
- **C-3. The approval words are elided.** The plan quotes the amendment ending in "...". ARCHITECTURE, Lee's words: "Verbatim from his own message, never a paraphrase." Fix: say the `--approval` string is the full three-sentence quote from the DECISIONS Deploy amendment, attribution included, not the excerpt in the plan.

### 8. Data integrity & compatibility [GATING]: PASS
One writer of `currentYear`; status single-sourced from (visible, failed) for tile-backed layers; no stored artifact, URL format or localStorage key touched; no public number moves. The mock changes cannot move a current test: no test calls `getLayoutProperty`, `getFilter` or `getGlobalState` (grep of `src/`), and the pending flag defaults off.

### 9. Verifiability (incl. testing the tests) [GATING]: CONCERN
The architecture of proof is right: real provider, effective-state oracles, a revert table, Razor re-running three reverts. The specification of individual tests has defects that would each cost a relay round trip, and two tests cannot do what their rows claim.
- **V-1. Tests 1-5 cannot go green as written.** They set "sources pending", then "emit `load`, then `sourcedata`", and never flip pending off. The `sourcedata` handler adds layers only when `isSourceLoaded(sourceId)` is true (DataLayer.tsx:398-405), so nothing is ever added. Probe: under exactly that wording `addLayer` is called 0 times; with pending flipped off before `sourcedata`, today's code adds the fill with `visibility: "none"` and no `setLayoutProperty`, so the corrected test discriminates. Round 1 should have caught this; the wording predates it. Fix: "flip pending off, then emit `sourcedata`", as test 9 already says.
- **V-2. Test 9's revert row cannot turn it red.** Probe: test 9 as written passes on today's code, which is exactly the code with no re-apply call, so "revert the re-apply call" leaves it green. Its "one `addLayer` per id" assertion cannot go red from a leaked handler either, because `addLayersToMap` guards each `addLayer` with `getLayer` (:271, :299, :348); only the `off("sourcedata")` assertion can. Fix: give 9 its own row, "delete the `off("sourcedata", …)` in the add effect's cleanup" (the off assertion goes red); and, so it also covers the new mechanism under the condition Review Focus 2 names, rerender `visible` during the wait and assert effective visibility, which makes "revert the re-apply call" a valid second row.
- **V-3. Test 10 is vacuous, so Review Focus 5 has an owner that does not exercise it.** For a WFS-only layer PmtilesLayers never mounts, `pmtilesFailed` never changes, and both listed mutations touch only the PMTiles path. "Never error while hidden; no fetch while hidden" is today's loadData behaviour (:1151-1154), which the plan does not touch. Probe: the test as written passes on today's code. The real risk the new effect poses to a WFS-only layer is the literal reading of design 2's title, `visible && failed ? set(error) : clear()`, which would wipe every WFS-derived ok, empty, zoom or error status. Fix: test 10 mounts the WFS-only fixture visible with a rejecting `fetchLayerData`, asserts `error` after 250 ms and that it survives a rerender, hides and asserts absent, shows with an empty result and asserts `empty`; revert row: "the status effect clears whenever `!pmtilesFailed`". Keep "no fetch while hidden" as a secondary assertion if wanted.
- **V-4. Revert-table rows missing or stale.** Test 13 has no row; mutation: drop the `?? DEFAULT_RANGE[0]` fallback (12's mutation leaves 13 green). Test 15's row describes the old getter API; mutation: drop the effect's deps array, and require one ref object across rerenders in the test. Test 7's second mutation must replace `handlePmtilesError`'s body with today's (`setLayerStatus(error)` only): adding the direct call alongside `setPmtilesFailed(true)` stays green, because the status effect's clear on the hidden layer cancels the queued error. Advisory: test 6's listed mutation fails at its precondition (no error is ever set); "delete only the `!visible` clear branch" goes red at the hide assertion, which is the property under test.
- **V-5. Review Focus 2's owner covers only today's cleanup** until V-2's rerender assertion is added.
- **V-6. Guards 18 and 19 can be satisfied or evaded by text** (above). Fix: strip `//` and `/* */` comments before matching; match the identifier `\bsetGlobalStateProperty\b` not followed by `:`, so optional calls, bracket access and aliases count; define "non-test" as excluding `src/test/**` and `**/*.test.*`. Then either drop 19 (16 and 17 prove the wiring under the same mutation) or make it check what they cannot: after comment stripping, `onStyleLoad()` appears inside `onLoad` before `TERRAIN_SOURCE`.
- **V-7. Live check (b) cannot see the defect on two of six layers, and the race is left to chance.** `pipelineHealthReport`'s Visible column for a fill layer is "ok" if any of the tiles-fill, WFS fill or `layer-<id>-raster` layer is visible (pipeline-logger.ts:232-240). The declarative raster overview is hidden through `raster-opacity`, never `visibility`, so for forest-age and old-growth-250 (both carry `rasterOverview`) the column reads "ok" whatever the tiles-fill layer's visibility. And the window the check must hit, from DataLayer mount to the PMTiles header's `sourcedata`, can be well under a second on a fast connection. Fix: name the layer (cutblocks, parks, fire-history or tap-priority); hold the `.pmtiles` request with Playwright request interception until after the toggle (and hold tile responses for check (a), so the year steps happen with tiles in flight, the condition under which the old code dropped writes); and run (b) on the current known-good deploy first and record that it shows "hidden", so the check is shown able to fire before its "ok" on the candidate counts.

Review Focus is present with five owned items, so no FAIL; V-3 and V-5 are owners that do not yet exercise their items, the same class round 1 graded CONCERN.

### 10. Maintainability [GATING]: PASS
Clean seams: one hook owns the year, one effect owns status, the appliers are shared by the reactive effects and the re-apply. The code comment and ARCHITECTURE line on why not `useEffectEvent` are where Batch 2 will read them. Advisory: add the lint blind spot to that comment and line (above), so a future "lint is clean" is not read as proof of the ref discipline.

### X4 Audience, brand & money accuracy [ADVISORY]: PASS
No copy, figure, palette or label change; the no-timeline re-apply reproduces each public layer's addLayer paint (round 1 verified the six registry `fill-opacity` values; the outline's addLayer `line-opacity` at :326-334 and the restore at :557-570 pick the same value).

### X5 Concurrency & re-entrancy [ADVISORY]: PASS
Round 1's three items are closed: the debounce race (cancel, sound), the memo and forwardRef freeze (latest-ref, probed under StrictMode), and StrictMode with sources pending (test 9, pending V-2). The six instances on the shared source each re-apply their own state on the same `sourcedata`; CanopyMap's `load` handler, registered at map construction, writes the year before any PmtilesLayers `load` listener runs, so no layer is added before the year exists.

### X6 Operability & observability [ADVISORY]: CONCERN
C-1, C-2 and V-7. The `global-state-year` log line is the right instrument; it needs the deterministic conditions in V-7 to prove anything.

### X8 Dependencies, performance & cost [ADVISORY]: PASS
No new package. One write per tick as today; with `mapRef` in the deps, nothing re-runs the effect per render.

## Stress tests

### Pre-mortem: it is February and the map lied anyway
1. **The live check certified a defect it could not see.** The agent toggled forest-age during load, the health report said Visible "ok" from the raster overview, the release went green, and R1-05 came back later through a Batch 2 edit on a path the check could never observe. Worst case for this project type: the public map shows an enabled layer as empty while the legend says it is on, which is the exact disagreement the Anchor forbids. What we should have seen: the Visible column ORs three layers, and no pre-fix run showed the check could go red. (V-7.)
2. **Two tests were certified as guards without ever going red.** Test 9's and test 10's rows cannot fail; the revert table asks for a verbatim red line, Ted either reports the gap (a round trip) or records a red from an unrelated failure, and Razor's three re-runs happen to pick tests that do discriminate. This is the 2026-08-09 lesson (instruments certifying what they never measured) repeated inside the relay meant to end it. (V-2, V-3, V-4.)
3. **A noisy console diff halted both lanes and nobody heard.** One run of the candidate showed an aborted-tile error the single baseline run did not; the guard was recorded red; the session reported to a stand-in coordinator that had ended. Both lanes sat halted until Lee happened by, and had the red been real, the failed candidate would have stayed live just as long. (C-1, C-2.)

### Load-bearing assumptions
1. **The latest-ref sees current props from a MapLibre listener in every component kind.** High, now by probe (StrictMode, both add paths, red without the call). If wrong: silent R1-05 regression; tests 1-5 are the tripwire once V-1 is fixed.
2. **The debounce cancel cannot drop a legitimate later status.** High, by reading: one timer per id, every clear caller means off or gone, `loading` is not debounced. If wrong: a WFS-only status would vanish; V-3's rewritten test 10 would see it.
3. **The agent can observe both defects on production.** Partly false today (V-7). Resolve before release, not during it.
4. **After `load`, `setGlobalStateProperty` cannot throw.** High, verified in round 1; unchanged.

### Inversion
- **Option (ii), the `layersReady` counter, wins** if the extra render per add mattered less than keeping state flow visible to the React Compiler rules. Today those rules are off in PmtilesLayers anyway (suppression), so the advantage does not exist; the latest-ref stands.
- **Option (i), `useEffectEvent`, wins** once React refreshes effect events for `memo()` without a comparator and `forwardRef`. Not in 19.2.4.
- **A non-blocking console check wins over a blocking one** if the known-good deploy's console is not reproducible between two runs. Nobody has measured that; C-2's two baseline runs measure it, and the plan should let the result decide.
- **A try/catch on the year write wins** if a style switch ships. None exists; no-catch stands.

## Close

**Overall verdict: CONCERN (round 2).** Every round-1 must-fix is in the plan, two of them only partly: `/notify` was swapped for a coordinator relay, and the StrictMode case exists but cannot fail under its listed mutation. The rework itself holds up. The latest-ref mechanism is correct and now probed red and green. The debounce cancel cannot drop a legitimate status, because the debounce keys on the layer id and every clear means off or gone. The real-provider harness mounts alone and makes test 6 red on today's code. The rendered CanopyMap test is feasible against react-maplibre 8.1.0. No gating dimension fails. What remains is the proof layer, again, but narrower: tests 1-5 omit the pending flip and cannot go green as written; tests 9 and 10 cannot go red under their rows, and 10 does not exercise the risk its Review Focus item names; three revert rows are missing or stale; the source-text guards can be satisfied by a comment; one live check is blind on two of six layers and leaves the race to chance; and the release's halt and console-guard handling are weaker than the runbook. All of it is plan text. Folded as below, round 3 should have nothing left to find in these sections.

**Must-fix, in priority order.**
1. V-1: tests 1-5 flip pending off before emitting `sourcedata`.
2. V-3: rewrite test 10 to prove WFS-only statuses survive the new effect (rejecting fetch, `error` after 250 ms, hide clears, show with an empty result gives `empty`); row "status effect clears whenever `!pmtilesFailed`".
3. V-2 and V-5: test 9 gets its own row (delete the cleanup's `off("sourcedata", …)`) and a rerender-during-the-wait visibility assertion.
4. C-1: on `NEW HALT` the session tells Lee and sends `/notify` itself (ARCHITECTURE, "Who surfaces a halt"); `/notify` at push as well; the coordinator report is in addition.
5. V-7: live check (b) names a layer without a raster overview, holds the PMTiles request with interception, and is first run on the current known-good deploy to show it can go red; check (a) runs with tile responses held.
6. C-2: the console guard's capture, normalisation and two-run reproducibility rule, with the script's path in the evidence.
7. V-4: rows for 13 (drop the fallback) and 15 (drop the deps array, one ref object across rerenders); 7's second mutation replaces the body; 6's sharper mutation.
8. V-6: guards strip comments, match the identifier, define "non-test"; drop 19 or make it check the order inside `onLoad`.
9. C-3: `--approval` carries the full verbatim amendment text with its attribution.
10. Plan-text notes: the hook's deps are `[yearFilter, mapRef]`; `clearLayerStatus` stays stable; the CanopyMap test's import-time mocks (`setWorkerUrl`, `addProtocol`, `useMap` or a stubbed `MapReadout`, the three controls); the lint blind spot in the code comment and ARCHITECTURE line; the Status-model "every registry layer" correction; assumption 3 marked verified.
