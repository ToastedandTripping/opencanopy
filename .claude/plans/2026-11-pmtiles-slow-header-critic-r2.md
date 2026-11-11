Overall verdict: FAIL (round 2)

# Plan critic, round 2: 2026-11-pmtiles-slow-header.md

Reviewer: plan-reviewer agent (Opus, xhigh), 2026-11-11. Read in full: the plan at `8f191b4` and its diff from `4e0589a`, round 1, `rules/plan-critic-rubric.md`, `.claude/DECISIONS.md` (`decisions-check.sh`: 29 entries, ref `origin/main@45c2109`, no shrink). Read for this round: `src/components/map/DataLayer.tsx` (PmtilesLayers 212-609, DataLayer 1089-1440), `src/contexts/LoadingContext.tsx`, `src/components/map/MapLegend.tsx` (status badge and legend row), `src/components/ui/StatusToast.tsx`, `src/app/map/page.tsx` (layer panel default), `src/test/pipeline/pmtiles-layers-lifecycle.test.tsx`, `src/test/mocks/maplibre.ts`, `scripts/live/live-checks.mjs`, ARCHITECTURE.md (Status model, Releases), ROADMAP.md:216, `.claude/handoff.md:45`, `~/marvin/.claude/skills/relay-load/SKILL.md` (tier table), MapLibre 6.15.0 `dist/maplibre-gl-dev.mjs`, pmtiles 4.4.0 `dist/esm/index.js`, react-dom 19.2.4 `cjs/react-dom-client.development.js`, the cited evidence file (exists, 1,332 bytes).

The code change is now right. The status effect owning the clear closes round 1's race by construction, the success signal after a successful add closes the masking case, and the tile-list guard reads a field that real MapLibre 6.15 with pmtiles 4.4.0 does set on success and only on success. What still fails is the proof, again in the release guard: the new `late-header` mode reads a legend string that the legend does not render in its default state, so the "notice gone" half passes on any build, and its `isSourceLoaded` reading cannot tell a late header from a failed one, so the "late rather than never" claim is unsupported. Round 1's own prescription carried both flaws (it said "read the legend" and "isSourceLoaded true" without checking either), and the fold inherited them; I own that. Below that, the guard needs a mock change the plan does not name, and three of the six tests are written so they can pass with the defect present. Every fix stays small.

## Applicability

Project type: public web app (Next.js 16 + MapLibre 6.15, /map), behaviour fix through the release ledger to production, plus a new release-tooling mode.

- **Core 1-10: GATING.**
- **X1 Physical safety: does not fire.** Browser map code; no hardware, heat, power or G-code.
- **X2 Privacy: does not fire.** Map layers and an in-memory status map; no personal, client or child data.
- **X3 Evidence: does not fire.** No research or public figures; it changes when data renders, not what a number says.
- **X4 Audience/brand: fires, ADVISORY.** Changes when a public notice ("BC data unavailable" in the legend, "Couldn't reach BC data" in StatusToast) clears. No copy, money or legal terms.
- **X5 Concurrency: fires, ADVISORY.** A 15 s timer, a listener that outlives it, six instances on one source, a 250 ms debounced status map, React passive-effect scheduling.
- **X6 Operability: fires, ADVISORY.** Deployed to production; a new live instrument joins the release guards.
- **X7 Self-modification: does not fire.** No MARVIN gate, hook or skill; `live-checks.mjs` is this project's release tooling.
- **X8 Performance: fires, ADVISORY.** A `sourcedata` listener kept for the page's life on an outright header failure.

## Round 1 must-fixes: what was folded

| R1 item | State in r2 | Where it stands |
|---|---|---|
| 1. V1 late-header live mode | **Folded in shape, broken in instrument** | The notice reading cannot fire; `isSourceLoaded` cannot separate late from failed; nothing proves the hold applied on the candidate. Finding L1-L3. |
| 2. Race: clear in the status effect | **Folded** | Correct; see Q1. The react-dom citation R1 asked for is not in the plan or the planned comment (Maintainability). |
| 3. Masking: signal only after a successful add | **Folded** | Correct in intent; mechanism wording misleads (Q2). Test 4 guards it once the mock is fixed. |
| 4. Tests (show after recovery, listener count, +300 ms after every recovery, inside-the-window case, unmount after the timeout, number from 22) | **Partly** | Show after recovery: yes (test 2). Listener: replaced by "handler passed to `off`", which StrictMode makes tautological (T1). +300 ms: test 1 only (T2). Inside-the-window: dropped silently. Unmount after timeout: not folded (T5). Numbering: not folded, new tests 1-6 collide with the file's 1-6. |
| 5. Docs | **Folded** | ARCHITECTURE, ROADMAP:216 amend, status-effect comment, `console.warn` text, hand-off, visibility comment. Gaps under Maintainability. |
| Advisory: tiles guard | Folded | Needs the mock change and a pinned expression (G1). |
| Advisory: stable callback, `year` guard, field counter | Not folded | Still advisory. |

## The brief's questions, answered directly

**Q1. The status effect's ref-based transition clear.**
- *Ordering:* correct by construction. `performWorkOnRootViaSchedulerTask` calls `flushPendingEffects()` before rendering (`react-dom-client.development.js:18945`), so if the header lands between the failure's commit and its passive flush, the stale effect (visible, failed) queues `error` first and the recovery render's effect (visible, not failed, ref true) then calls `clearLayerStatus`, which cancels that pending write (`LoadingContext.tsx:141-149`). If both `setPmtilesFailed` calls land before any render, React folds them to `false`, the effect never sees `true`, nothing is written. All three orderings end with no status.
- *StrictMode double-invoke:* safe. The effect has no cleanup; the mount double-run sees (visible, false, ref false) twice and does nothing. The ref lives on the fiber, not in the render body, so double render does not touch it.
- *Can it clear a WFS status?* No. The branch needs the ref true, which needs `pmtilesFailed` true, which only `handlePmtilesError` sets, which is only passed to PmtilesLayers, which mounts only when `hasTileSource` (`DataLayer.tsx:1406`); tile-backed layers have no WFS status writer (`:1174`), and a grep of `src` finds no status writer outside DataLayer. Existing test 10 is the tripwire for an implementation that drops the ref condition (an unconditional else-clear wipes its synchronous `loading`); the plan should say so, because nothing else kills that mutant (T4).
- *Hidden at recovery, later shown:* correct. The hide already cleared and cancelled; at recovery the hidden branch runs again; on show nothing is failed so nothing is queued. Whether the ref is written in every branch only decides whether a harmless no-op clear runs at show. Pin it anyway: `wasFailedRef.current = pmtilesFailed` as the effect's last statement, every run.

**Q2. `onRecovered` only after a successful add.** Right in intent, but `addLayersToMap` never throws outward: it catches and calls `onError` itself (`DataLayer.tsx:395-399`). "Only if that succeeds (no throw)" invites `try { addLayersToMap(); onRecovered() } catch {}`, which is exactly the masking mutant. Say the mechanism: `addLayersToMap` returns `true` at the end of its `try` and `false` from its `catch`, and the listener calls `onRecovered` only on `true`. Test 4 does kill the wrong version once the mock lets an add happen (G1). Also say whether `onRecovered` fires on on-time adds; R1 recommended every successful add (React bails out when the flag is already false, so it costs nothing on the on-time path), and test 3's mutant depends on the answer (T4).

**Q3. The tile-list guard: does a loaded PMTiles vector source expose `tiles` in 6.15? Yes, on the real map; no, in the mock.**
- Real: pmtiles 4.4.0's `Protocol` (created with no options, `src/lib/layers/pmtiles-source.ts:17`, so `metadata` is false) answers the JSON request with `{tiles: [url + "/{z}/{x}/{y}"], minzoom, maxzoom, bounds}`; MapLibre's `loadTileJson` picks `tiles` (`maplibre-gl-dev.mjs:29534-29543`); `VectorTileSource.load` runs `extend(this, tileJSON)` before firing `metadata` and `content` (`:29975-29981`); `Map.getSource` returns that instance (`:47791-47792`). The constructor picks only `url, scheme, tileSize, promoteId, encoding` from options (`:29954-29960`), so `tiles` is absent until success, and the error path (`:29983-29986`) never sets it. The guard does not block a real recovery or a real on-time add.
- Mock: `getSource` returns `{...config, setData}` and the config PmtilesLayers registers is `{type, url, maxzoom}` (`mocks/maplibre.ts:92-99`, `DataLayer.tsx:264-268`). With the guard on the listener, every test that resolves the header by `sourcedata` adds nothing: existing tests 1-5, 9 and 20, and all six new ones. Finding G1.

**Q4. Can each of the six tests fail as described?** Three can, three cannot as written.
- Test 1: can fail on the layer, after G1. Its `off` assertion is tautological under the harness's StrictMode (T1).
- Test 2: cannot fail as written if the show is asserted without advancing past the 250 ms debounce (T2). Its named mutant (skip the reset) is also killed by test 1, since under the new design the reset is all the handler does.
- Test 3: its mutant ("clear on every `sourcedata`") has no single-edit form under the new design, and whether the test can kill the nearest one depends on Q2's open question (T4).
- Test 4: can fail, after G1. Before G1 it passes vacuously (no add is attempted, so the error stands and the mutant is never reached).
- Test 5: can fail only with +300 ms before the status read (T2).
- Test 6: as written ("during the wait") it cannot distinguish the new state; unmount must come after the timeout (T5).

**Q5. Can the late-header mode be built, and can it tell late from never on production?** It can be built: it is the visibility mode's first-request hold at 20 s instead of 10 s, which already works against production (`live-checks.mjs:137-151`). As specified it cannot tell what the plan says it tells. L1-L3 below.

## Findings

**L1. The legend notice the check reads is not rendered in the legend's default state (Verifiability, gating).** `MapLegend` starts every row expanded (`collapsedLayers` is an empty Set, `MapLegend.tsx:291`, `expanded={!collapsedLayers.has(layer.id)}` at `:336`), and the "BC data unavailable" badge renders only when a row is collapsed (`{!expanded && (status && status !== "ok" ? <LayerStatusBadge/> : <CompactDots/>)}`, `:232-236`). An expanded row in error shows only an amber left border (`border-l-2 border-amber-400/40`, `:206`). StatusToast says "Couldn't reach BC data", not the legend string, and auto-dismisses 6 s after it appears (`StatusToast.tsx:39-48`). So `/map#layers=cutblocks` with no interaction never contains "BC data unavailable": the reading is "absent" on release 8 and on the candidate, before and after recovery. "On the candidate ... the notice gone" passes on any build; the Anchor's second half stays unobserved live, which is round 1's V1 defect surviving its own fold.
**Fix:** make the notice observable, then prove the reading fires. Either collapse the cutblocks legend row before the timeout (keyboard focus and Enter on the row's `aria-expanded` name button inside `role="region"` "Map legend", not a pointer click, per the `year` mode's 2026-11-11 note on pointer clicks under load) and read the badge text, or read the row's `border-amber-400` class with no interaction. Then require: notice **present** at about 18 s after the held request (after the 15 s timer and the 250 ms debounce, before the 20 s release) on both builds, which proves the instrument can fire; still present at the end on release 8; absent at the end on the candidate. Sampling at "request time + 18 s" is simplest from inside the route handler, before `route.continue()`.

**L2. `isSourceLoaded` cannot tell a late header from a failed one (Verifiability, gating).** `TileManager.loaded()` returns `true` when `_sourceErrored` (`maplibre-gl-dev.mjs:39024`, set at `:38993`). On release 8 a header released late and a header that errored both read "fill absent, `isSourceLoaded` true". Only "still pending" reads false. The plan's "shows whether production's header arrives late rather than never" and its fallback "if the release-8 run shows the header never arrives at all under the hold" both rest on a reading that cannot separate the two cases that matter. Separately, the hold is synthetic: the run shows that production's build resolves a header released after the timeout, which is the mechanism the fix needs; it says nothing about which of late or never happened in the load-16 field run. Say that, not more.
**Fix:** record `!!map.getSource("opencanopy")?.tiles` (set only on a successful header, Q3; the same field the guard reads) and the held request's outcome (Playwright `requestfinished` with the response status, or `requestfailed`). Late = tiles present; failed = tiles absent with `isSourceLoaded` true; pending = `isSourceLoaded` false. Reword the Live check and Release sentences accordingly.

**L3. A green candidate run does not prove the late path ran (Verifiability).** If the hold does not apply (a route mismatch, or a starved main thread delaying the 15 s timer past the 20 s release), the header lands before the timeout, the on-time path attaches the layer and no notice ever shows: "layer present, notice gone" passes on the candidate without exercising the fix. Release 8 being red first does not cover the candidate run.
**Fix:** each run, both builds, records `archiveRequestsHeld >= 1`, the measured hold (release time minus first-request time, at least 15 s), and the timeout's `console.warn` (Playwright `console` type `warning`; the warn is not stripped, `next.config.ts` has no `removeConsole`). A run without all three is `unverified`, not green or red. With L1's "present before release" reading, this is what makes the candidate's green mean the late path ran.

**G1. The guard needs a mock change the plan does not name (Completeness).** See Q3. Without it, seven existing tests and all six new ones go red, and test 4 passes vacuously before anyone notices. **Fix:** name the edit: in `src/test/mocks/maplibre.ts`, `getSource` returns `tiles` for a `type: "vector"` source with a `url` once `sourcesPending` is false (mirroring `extend` on success). No other test reads the vector source's shape (`source-registration.test.ts` only checks defined/undefined), so the change is safe across the ten files using `createMockMap`. Optional but cheap once the mock has it: a `_setSourceErrored` helper and one row (source loaded, no tiles, `sourcedata` emitted: no layer, `error` stands) so the guard is revert-provable rather than unprotected. Pin the guard's expression in the plan, `(mapInstance.getSource(sourceId) as { tiles?: unknown[] } | undefined)?.tiles?.length`, with Q3's citations: the guard now sits on the on-time path every visitor takes, a wrong field there blanks all six layers, and the first thing that would see it is the `attach` guard after the push, with rollback waiting on Lee.

**T1. Test 1's `off` assertion is tautological under StrictMode.** The harness wraps the tree in `StrictMode` (`pmtiles-layers-lifecycle.test.tsx:176`), so the add effect registers two `sourcedata` handlers and the discarded one is already passed to `off` by the simulated unmount (test 9 asserts exactly that, `:288-292`). "The handler was passed to `off`" holds before the header ever arrives unless it names the live (last-registered) handler. **Fix:** assert `mockMap._listenerCount("sourcedata") === 0` after recovery (only PmtilesLayers registers `sourcedata` in `src`), as round 1 asked.

**T2. +300 ms before every status read.** Terminal statuses land after the 250 ms debounce (`LoadingContext.tsx:116-135`). Test 2's "no `error` returns" read straight after the show sees no error on the mutant too; the same holds for test 5's "no status" and test 3's "untouched". **Fix:** state `advance(300)` before every status assertion in tests 2-5, as test 1 already does and tests 6-8 do.

**T4. Test 3's mutant is undefined under the new design, and the ref condition's real tripwire is unnamed.** Under the new design no single edit "clears on every `sourcedata`". The nearest mutant (the handler calls `clearLayerStatus` directly and `onRecovered` fires on every successful add) is killable only if `onRecovered` fires on on-time adds and the test's status is set after mount, before the on-time `sourcedata`, and read after +300 ms. Dropping the ref condition from the status effect is not caught by test 3 at all (the on-time `onRecovered` is a React bail-out, so the effect never re-runs); existing test 10 catches it. Note too that moving the clear back into the handler, the race round 1 found, is unkillable under `act()`; only the code comment guards it. **Fix:** write test 3's mutant as code, state the `onRecovered` contract (Q2), say test 10 is the tripwire for the ref condition, or drop test 3 as round 1 suggested.

**T5. Test 6 must unmount after the 15 s timeout.** Before the timeout, today's cleanup already removes the handler, so the test proves nothing new. After it is the new state: a live listener past 15 s that only cleanup can remove. **Fix:** advance 15 000 ms (status `error`), unmount, emit `sourcedata`: no layer.

**N1. Test numbering.** The file's tests are 1-11, 20, 21, and code comments cite them ("test 10 is the tripwire", `DataLayer.tsx:1313`). The plan numbers its new tests 1-6 and in the same breath cites "existing test 7". Number them 22-27.

**N2. The tier header is no longer true.** "Tier: Simple (one source file and its test)" now covers `DataLayer.tsx`, its test, the maplibre mock (G1) and `live-checks.mjs`, plus ARCHITECTURE.md, ROADMAP.md and the hand-off. relay-load classifies 1-3 files Simple and 4-10 Standard (`relay-load/SKILL.md:78-79`). Re-tier to Standard and add the `## Review Focus` section the rubric requires of Standard plans (natural entries: the guard's errored-source case, the inside-the-debounce-window recovery, a candidate run where the hold did not apply), or state why Simple holds.

## Dimension verdicts

### 1. Problem-fit: PASS
Solves the owed item (`handoff.md:45`, ROADMAP `next:`) and both halves of the Anchor in code; the Anti-goals hold (no retry; on-time path invisible, since the guard's field is set before the event). Grill-skip line present with a reason. No DECISIONS contradiction: the Deploy amendment of 2026-11-10 is cited correctly and does not cover a critic FAIL, so this round must clear before release; the three-round cap is respected.

### 2. Approach soundness: PASS
Keeping the listener, signalling only a successful add, and letting the status effect own the clear are the right shape, and Q1 shows the clear is ordered by construction. One wording fix belongs here but is counted under Completeness: `addLayersToMap` returns a boolean (Q2).

### 3. Completeness: CONCERN
The mock change the guard requires is missing from the plan (G1). The success mechanism is underspecified (Q2). Whether `onRecovered` fires on on-time adds is unstated (Q2, T4). **Fix:** G1 and Q2 as written above.

### 4. Right-sizing and reuse: CONCERN
Still small in substance and reuses the visibility mode's hold, the latest-ref re-apply and `clearLayerStatus`'s cancel. The tier label understates the file count and so skips Review Focus (N2). **Fix:** N2.

### 5. Security: PASS
No new surface or secrets; the listener filters on `e.sourceId`; the live check is read-only against production.

### 6. Failure modes: CONCERN
The guard is the right hardening and correct on 6.15 (Q3), but it now gates the on-time path for every visitor, its expression is not pinned, and it has no test that can show it working (G1). Outright failure is unchanged and parked, as the Anti-goals say. **Fix:** pin the expression with its citations; add the errored-source row if the helper is added.

### 7. Change safety: PASS
Single revertable commit; rollback target named by `status`; the standing yes cited verbatim and correctly limited. G1's blast-radius note is counted under Failure modes, not twice.

### 8. Data integrity and compatibility: PASS
The status map stays single-writer (DataLayer only, grep of `src`); no stored artifact changes.

### 9. Verifiability: FAIL
The release guard written to fold round 1's V1 cannot see the notice it claims to read (L1), cannot separate late from failed (L2), and cannot show that its own green exercised the late path (L3). Three unit tests can pass with the defect present as written (T1, T2, T5), and a fourth has an undefined mutant (T4). Each is a proof claim false as written, the class round 1 failed on. **Fix:** L1, L2, L3, T1, T2, T4, T5, all small. Advisory: restore round 1's inside-the-debounce-window row (timeout, +100 ms, recover, +300 ms: no status, fill present), which is where "also cancels any pending debounced error" is load-bearing on the recovery path; test 8 proves the same cancel only for the hide path.

### 10. Maintainability: CONCERN
- The status-effect comment must carry why the clear lives in the effect (react-dom 19.2.4 flushes passive effects before the next render, `:18945`, but only synchronously for sync lanes, `:18323`; no `act()` test can reproduce the race), or the next tidy-up moves it back into the handler and nothing goes red (T4).
- `live-checks.mjs`: the header's usage line and mode list gain `late-header`; the visibility hold is described three ways today (6 s in the header at `:20`, 15 s in the mode comment at `:129`, 10 s in the code at `:148`); "console, attach, visibility and year are unchanged since release 4" (`:36-37`) is already stale (the `year` mode changed on 2026-11-11). Fix all of them in the same edit, and say in the plan that the visibility change is comment-only, so its release-8 baselines stand even though `instrumentSha256`, which hashes the whole file, changes for every mode.
- Add `onRecovered` to the add effect's eslint-disable rationale (`DataLayer.tsx:455`), which lists the callbacks deliberately captured once.
- Number the tests 22-27 (N1).

### X4 Audience (ADVISORY): PASS
The notice now clears when the data arrives, which makes the notice and the map agree.

### X5 Concurrency (ADVISORY): PASS
Round 1's race is closed by construction (Q1). Six instances recover independently on one event, each with its own timer, listener and flag.

### X6 Operability (ADVISORY): CONCERN
A new release instrument that can return green without measuring anything is an operability hazard as much as a proof gap (L3). Fold L3; the field counter for timeouts and late recoveries stays advisory until OPS monitoring lands.

### X8 Performance (ADVISORY): PASS
Six inert closures on outright failure, one string compare per `sourcedata` for other sources; no `sourcedata` fires for an errored source.

## Stress tests

**Pre-mortem (three months out, it failed):**
1. *The instrument said green and measured nothing.* The release's `late-header` run was red on release 8 for the fill and green on the candidate; the notice field read "absent" on both, because the legend row was expanded. Weeks later a regression puts the error back over a drawing layer (someone moves the clear into the handler during a refactor; no `act()` test can see it) and the guard still reads "notice gone". This is the type-specific worst case for this plan: the map and its notice disagree, which the beta bar counts as a serious bug, and the one live check built to see it is blind. We should have required the notice to be seen present before trusting its absence.
2. *Every vector layer blank after the push.* The guard reads a field that exists in the hand-edited mock but not on MapLibre's source (for example `_options.tiles`); the whole unit suite is green; the push lands; `attach` goes red; the release halts and production stays broken until Lee answers. Unlikely given Q3, but the plan currently leaves the expression to the implementer and the mock to be bent to match it.
3. *A green that ran the on-time path.* On a busy host the browser's 15 s timer fires after the route releases the header; the layer attaches on time, no error ever shows, and the candidate run is recorded green for a fix it never exercised.

**Load-bearing assumptions:**
1. *A loaded PMTiles vector source exposes `tiles`, and an errored one does not.* High, verified in code (Q3). Unverified live; L2's `tiles` reading verifies it on release 8 for free.
2. *React flushes the previous commit's passive effects before rendering the recovery.* High, verified (`react-dom-client.development.js:18945`); it is what makes Q1's ordering hold, and no test can show it.
3. *The legend can show the error state to an instrument.* False as specified (L1); true once the row is collapsed or the border class is read.
4. *A 20 s hold reliably trips a 15 s timer.* Medium. The timer starts at `initSource`, at or before the header request, so the margin is at least 5 s, but a starved main thread can delay the timer. L3's preconditions turn a miss into `unverified` instead of a false green.

**Inversion:**
- (a) *Retry the header (remove and re-add the shared source)* wins if outright failures dominate in the field. Unknown; the X6 counter would tell. Not shown true.
- (b) *Rely on unit tests alone, no live mode* wins if the live mode cannot be made to measure the notice and the late path. It can (L1-L3 are small), so the mode is worth keeping; but a mode shipped without L1-L3 is worse than none, because it adds a green that means nothing.
- (c) *Guard only the post-timeout path* wins if the on-time path's blast radius matters more than one uniform listener. Q3 shows the field is right, so a pinned expression on the shared listener is acceptable; scoping it to the late path is a reasonable alternative if the implementer prefers the on-time path byte-identical.

## Close

The fix itself now holds up: the clear is ordered correctly by construction, it touches no WFS status, a failed late add keeps its error, the hidden-then-shown cases behave, and the guard's field is the right one on the installed MapLibre and pmtiles. The plan fails Verifiability a second time because its release guard, built to answer round 1, reads a legend string that is not rendered in the default state, uses a reading that cannot separate a late header from a failed one, and has no way to show its green exercised the late path. Three unit tests can also pass with the defect present as written. Round 1 prescribed the legend reading and `isSourceLoaded` without checking either, so part of this is a correction of the previous round, not a new demand. Every fix below is a sentence or two in the plan and keeps the work small.

**Must-fix, in priority order:**
1. **L1:** make the notice observable (collapse the cutblocks legend row by keyboard, or read the row's amber-border class), and require it present at about 18 s after the held request on both builds, present at the end on release 8, absent at the end on the candidate.
2. **L2:** record `!!map.getSource("opencanopy")?.tiles` and the held request's outcome; reword "late rather than never" to what a synthetic hold can show.
3. **L3:** every run records held >= 1, the measured hold (at least 15 s) and the timeout's `console.warn`; a run missing any is `unverified`.
4. **G1:** name the mock change (`getSource` exposes `tiles` for a vector url source once not pending); pin the guard expression with its citations; optionally an errored-source helper and row.
5. **Tests:** T1 (`_listenerCount("sourcedata") === 0`), T2 (+300 ms before every status read), T4 (state the `onRecovered` contract, write test 3's mutant as code or drop it, name test 10 as the ref condition's tripwire), T5 (unmount after the timeout), N1 (number 22-27).
6. **Q2:** `addLayersToMap` returns a boolean; `onRecovered` only on `true`.
7. **N2:** re-tier to Standard with a `## Review Focus` section, or state why Simple holds.
8. **Maintainability:** the status-effect comment carries the react-dom reason; the `live-checks.mjs` header and hold descriptions are corrected in the same edit, with a sentence on why other modes' baselines stand despite the whole-file hash.

Advisory: the inside-the-debounce-window row; `onRecovered` after every successful add, including `initSource`'s immediate path (closes round 1's unreachable re-run blind spot for free); `year` in the guard list, since the late add re-applies filters; `onRecovered` stable via `useCallback`; the field counter once OPS monitoring lands.
