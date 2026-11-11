Overall verdict: FAIL (round 2)

# Critic round 2: react-map-gl 8.1.0 -> 8.1.3

Plan: `.claude/plans/2026-11-react-map-gl-813.md` at bdf1301. Round 1: `-critic-r1.md` (FAIL). Rubric: `rules/plan-critic-rubric.md` v2. Reviewer: plan-reviewer agent (Opus, xhigh). Run from 2026-11-11 01:39:56 UTC (`date -u`). Read: the r1 file, the whole 792d08e..bdf1301 diff, the plan, `scripts/live/live-checks.mjs` at bdf1301, `.claude/DECISIONS.md` (whole), ARCHITECTURE.md Releases, the hand-off, the session's fresh baselines in `~/marvin/state/relay/wheel-drag-live/` (read only), release 4's guard evidence, StoryMap, ScrollytellingContainer, useScrollytelling, useMapState, mapConfig, next.config, the installed 8.1.0 and unpacked 8.1.3 react-maplibre, maplibre-gl 6.15 dev build, and Next 16.4.2's client error callbacks. Nothing was run against production. Evidence with line cites is in the appendix.

**The short version.** Seven of round 1's eight must-fixes are folded properly, and the `/map` half is now sound: `interact` is red on the live deploy (22 and 23 throws) and red on the local 8.1.0 build (47), it finds the map, and its witness can only be moved by input. The landing-page half isn't. The new `story` check passed on today's broken deploy in both baseline runs, with zero errors. The session's own evidence shows it can't detect the defect it was added for. Reading the code says why, and what it's hiding. StoryMap's `jumpTo` only runs when `isStyleLoaded()` is true, and a 10-second flick scroll never gets there. When it does run on 8.1.0, it throws inside a React effect. On `/`, that goes to Next's built-in error boundary, which replaces the whole page. So the landing page probably dies on the first chapter transition for anyone who scrolls at reading pace. Nothing in the plan, and nothing in production monitoring, would show it. That claim is inferred from code and one probe, not observed. Verifiability fails, so the gate stays shut. The fix is one instrument revision, a re-baseline and some text.

## Round 1 must-fixes: folded?

| # | Round 1 must-fix | Status |
|---|---|---|
| 1 | Narrow anchor; `interact` = pageerrors 0 + movement witness; hash non-blocking; strike "same defect" | **Folded.** The correction paragraph is accurate. The witness is weaker than asked: an OR of any zoom or centre change, where round 1 asked for zoom up by at least 1 AND centre moved (see 9b). |
| 2 | Local A/B before push | **Folded, and the 8.1.0 arm has run** (`local-810-interact.json`, 47 throws, map found). There is no rule yet for a non-`center` pageerror on the 8.1.3 arm (see 6). |
| 3 | `/` story check, baseline and candidate | **Folded in form, failed in substance.** Both baselines are green on the broken deploy (see 9a). |
| 4 | Guard test pattern, real revert proof, lockfile assertion | **Folded.** I re-verified the pattern on both versions. Minor: the version is pinned exactly, and the two halves need separate revert proof (see 10). |
| 5 | What else changes; fix pre-mortem 1; deep-link measurement | **Mostly folded.** `jumpTo` is misdescribed and its consequence on `/` is missed (see 3). The deep-link measurement has no instrument. Pre-mortem 1 still credits `interact` with covering programmatic paths it never runs (see 9c). |
| 6 | Freeze, 2+2, named console baselines, red halts | **Folded, and the freeze was kept** (commit 01:39:34Z, first baseline 01:39:49Z). Nothing says what happens to the baselines when the instrument is revised, which this round requires (see 6). |
| 7 | Rollback target; M1a re-baseline line; hand-off close | **Folded.** |
| 8 | `live-checks.mjs` usage and header; guard-test comment | **Folded.** |

## Applicability

Project type: a web app dependency bump released to production, with one guard test and two new live-check modes.

- **Core 1-10:** all active, all [GATING].
- **X1 Physical & human safety:** does not fire. No hardware, heat, power or physical output.
- **X2 Privacy & data stewardship:** does not fire. No personal data is collected, stored or exposed, and the tracker is untouched.
- **X3 Evidence & source integrity:** does not fire. No research or public factual claim is produced. The plan's technical claims are judged under 2, 3 and 9.
- **X4 Audience, brand & money accuracy:** N/A. No copy, figures or brand surfaces change.
- **X5 Concurrency & re-entrancy:** fires (shared ledger, lease, serialized lanes). [ADVISORY]
- **X6 Operability & observability:** fires (production deploy). [ADVISORY]
- **X7 Self-modification safety:** does not fire. `live-checks.mjs` is OpenCanopy's own release instrument, not a MARVIN gate, hook or skill. The release tool paths are untouched.
- **X8 Dependencies, performance & cost:** fires (an external package moves). [ADVISORY]

## Verdicts

**1. Problem-fit: PASS.** The anchor is now honest about the hash and assigns it to M1a. The change still targets the brief's defect, and no DECISIONS entry is contradicted: the Deploy amendment of 2026-11-10, the three-round cap and serialized releases are all respected. The `/` severity question is a framing gap, and it belongs under 3.

**2. Approach soundness: PASS.** I re-verified that 8.1.3 has no `.transform` read, and that 8.1.3's now-live `_onCameraUpdate` returns `{}` for this app's props, so MapLibre 6.15 applies the camera unchanged. The map component and `createRef` are byte-identical across the two versions. Upgrading is still the right fix.

**3. Completeness: CONCERN.**
- **(a) `jumpTo` is misdescribed, and the worst consequence is missing.** The plan says programmatic moves, StoryMap's included, "today throw at `movestart` before the camera moves". That is true for `flyTo`. 6.15's `jumpTo` applies the transform first and fires afterwards (dev.mjs:56003-56004). More importantly, StoryMap calls it inside a `useEffect`. There is no app error boundary on `/`. Next 16.4.2 treats its built-in boundary as uncaught, reports the error and swaps in its own error page (`id="__next_error__"`, "This page couldn't load"). If that reading is right, `/` has been unmounting on scroll since 2026-10-22. That is worse than the `/map` symptom: the map keeps working, but the landing page doesn't.
- **(b) No deep-link instrument.** The deep-link measurement is listed, but no mode measures it, and the instrument is frozen.
- **(c) Lane S isn't told.** This release changes `/` behaviour, whether that is the story camera moving again or the page no longer dying. The only hand-off line goes to M1a. Round 1's pre-mortem 2 ("lane S's next baseline carries an unexplained shift") was never acted on.
- **(d) No phone check.** DECISIONS (2026-07-17, amended 2026-10-07) puts story changes in the visual set that gets Lee's phone check, owed but never blocking. "No Jen (no visual change)" is not true if `/` changes.

**Fix:**
- Correct the `jumpTo` sentence. State the `/` hypothesis as a hypothesis, to be settled by the revised `story` baseline (see 9).
- Add a `deeplink` mode before the re-freeze (see 9).
- Add a lane S hand-off line.
- Add one owed phone check: scroll `/` on the phone; the story camera moves between chapters and the page stays up.

**4. Right-sizing & reuse: PASS.** Still minimal. It reuses the release-4 instrument and the ledger. The out-of-scope items are owned (brief item 4, M1a batch 0, lane S). Simple tier is exempt from the batch rules.

**5. Security: PASS.** Unchanged from round 1. Tarball provenance was checked, there are no new runtime dependencies, and no secrets or attack surface are involved.

**6. Failure modes: CONCERN.**
- **(a) Baselines after an instrument revision.** The pre-commitment forbids edits "after the candidate runs start". It says nothing about the window between baseline and candidate, or about what an edit does to baselines already taken. This round requires a revision, so the rule has to exist now. The per-run JSONs don't record which instrument version produced them.
- **(b) Local 8.1.3 arm, unexplained pageerrors.** The localhost build has no `/api/wfs` or `/r2` edge functions and no tile CORS. A non-`center` pageerror there would leave the A/B undecidable. Nothing says whether that stops the push.
- **(c) A revised `story` that still can't reach the path.** If the slow, load-gated version still shows no `jumpTo` call on 6af3b9d0, the plan doesn't say what then.

**Fix:**
- Write down that any instrument edit voids every baseline taken with the previous blob. The revised instrument is committed, then two fresh baseline runs of each changed mode go on 6af3b9d0, then the candidate runs. Each result records the instrument blob hash (one `createHash` over the script's own file), and the evidence file names it.
- Judge the local A/B on the `center` throw count: greater than 0 on 8.1.0, 0 on 8.1.3, with the camera moving on both. Record any other local pageerror. If it can't be explained as local-only (missing edge function, no CORS), stop before `claim`. Production is the judge of the total.
- Pre-commit that `story` blocks only if both of its baseline runs reach the camera path, either `jumpCount` of at least 1 or the error page. If they don't, it drops to a recorded measurement, and the anchor's "(and scroll /)" is reworded to what the evidence supports.

**7. Change safety: CONCERN.** The rollback target is named, and the local A/B now runs before the push. One thing is missing. If the revised `story` baseline confirms the landing page dies on scroll, then the rollback target, deploy 6af3b9d0, is a deploy whose `/` dies too. Lee's red-release choice is then between a candidate with some red guard and a known-good whose landing page breaks. He should hear both halves. **Fix:** if the `story` baseline goes red, say so in any NEW HALT message and in the release report, in plain words.

**8. Data integrity & compatibility: PASS, with one advisory.** The lockfile is asserted, the M1a line is present and the hash is not claimed. Advisory: "refused if anything outside the three packages moves" should be judged on a structured diff of `packages[*].version/resolved/integrity`, not on text. An npm version that rewrites `peer` or `dev` flags on untouched entries would otherwise block a working fix on noise.

**9. Verifiability: FAIL.**

*(a) The `story` guard is shown unable to fire.* `known-good-story-{1,2}.json` on opencanopy.ca, deploy 6af3b9d0: pageErrorCount 0, pass true in both runs, scrolled to the bottom (14033 of 14833). Release 4's own standard for these checks is "a showing of the old defect would be red", and this one is green on the old defect. The reason is in the code. The camera only changes in the last 20% of each chapter, and StoryMap's effect skips `jumpTo` unless `isStyleLoaded()`. `Style.loaded()` is false while any in-view tile or image is still loading. A 40-tick, 10-second scroll never meets both conditions at once.

I ruled out the other explanation by probe. A `reportError` call, which is how Next reports this throw, does surface as a Playwright pageerror. So the green baselines mean `jumpTo` never ran. As a blocking guard behind an anchor that promises "(and scroll /) without uncaught errors, and the camera actually moves", it certifies nothing. It also misses the riskiest new code path in 8.1.3: the camera-update hook going live on a pitched, programmatically driven map.

*(b) `interact`'s witness is an OR.* A run where only the wheel or only the drag reached the map passes, and the dead gesture's error count is vacuous. There is no programmatic camera move on a fresh `/map`, so the witness can't be satisfied without input. That part is sound.

*(c) Pre-mortem 1 still overclaims.* It says "the deep-link camera measurement and `interact`'s movement witness cover the real paths". `interact` exercises only user input. The deep-link measurement has no instrument. As written, nothing exercises programmatic `flyTo` or `jumpTo` at all, and `audit:live :283`, which does, is already in the failing six, so a different failure there would not be "new".

**Fix:** one instrument revision, committed before any re-baseline.
- **`story`.** Move the mouse over the narrative column. Wait up to 60 s for `__ocMap()?.isStyleLoaded()`. Then wrap that instance's `jumpTo` with a counter. StoryMap calls `getMap().jumpTo` on the same instance, so the own-property wrapper sees every call. Scroll at reading pace, in about 100 px wheel steps, and after each step wait up to 8 s for `isStyleLoaded()` or the map to vanish. Record:
  - `jumpCount`;
  - the story camera after load and after each chapter;
  - whether `#__next_error__` exists at the end;
  - whether `.maplibregl-map` is still mounted;
  - pageerrors.

  Pass = pageerrors 0 AND `jumpCount` of at least 1 AND map still mounted AND no `#__next_error__` AND at least one camera sample differing from the first chapter's camera. Don't require equality with the last chapter's camera: the readiness pattern lane S already owns, `StoryMap.tsx:72`, drops writes and never retries them. Expected on 6af3b9d0: red, with one `center` pageerror and the error page.
- **`interact`.** Snapshot the camera between the wheel phase and the drag phase. Pass = pageerrors 0 AND (zoom after wheel) - (zoom before) of at least 0.5 AND centre after drag differs from centre after wheel. On 8.1.3 five ticks should give about +2, not the runaway to 18 that the throw causes. Keep `cameraMoved` as a recorded field.
- **`deeplink`.** Open `/map#lat=51.7&lng=-119.9&z=11` and read the camera 15 s later. Pageerrors = 0 is blocking. Landing within 0.01 of the encoded camera is recorded, not blocking. That gives the programmatic `flyTo` path a blocking error check.
- **Pre-mortem 1.** Rewrite it to name what covers each path.

**10. Maintainability: CONCERN, minor.**
- The lockfile assertion pins `8.1.3` exactly. A routine 8.1.4 would go red with a message about the wrong thing. Round 1 asked for "8.1.3 or later".
- Put the regex half and the lockfile half in separate `it` blocks. On 8.1.0 both fail, so in one block the first `expect` masks the second, and the lockfile half is never shown red on its own.
- The `live-checks.mjs` header (`:3`) still describes the file as for "a /map release" under the datalayer plan.
- Pre-mortem 3 still describes the old `transform.` pattern.
- Gates still says "round 1".

**Fix:** use `semver.gte(version, "8.1.3")` or a numeric compare, split the `it` blocks, and refresh those three text lines.

**X5 Concurrency & re-entrancy [ADVISORY]: PASS.** The release goes through the lease and `check-push`. Baseline runs were sequential, and the mtimes and start times don't overlap.

**X6 Operability & observability [ADVISORY]: CONCERN.** Nothing watches `/` in production. `audit:live` and the console guard both load `/map`. If the revised baseline confirms the landing page dies on scroll, it has been doing so for every visitor since 2026-10-22, unseen until now. **Fix:** if confirmed, tell Lee in plain words in the release report, as a found-and-fixed live defect, and list `/` among the pages G1 OPS must watch.

**X8 Dependencies, performance & cost [ADVISORY]: PASS.** Three packages move, provenance is checked and the package-safety hook fires. See 8 for the lockfile-diff advisory.

## Stress tests

**Pre-mortem: it is February and this failed.**
1. **The gate failed open on `/`.** `story` passed in both candidate runs because it never reached `jumpTo`, so the release was certified for a page it never exercised. Two outcomes are possible. If 8.1.3 fixed `/`, nobody learned that the landing page had been dying on scroll for a month, and lane S re-baselined against a story that had silently changed. If 8.1.3 broke `/` some other way (the camera-update hook now runs on a pitched, programmatically driven map), visitors found it first. What we should have seen: both baselines green on the known-broken deploy, minutes before this review.
2. **A one-gesture pass.** The drag never engaged, because a future preset panel or beta banner sat over the canvas centre. The wheel moved zoom, `interact` passed, and the drag path was never tested. This one is low-likelihood; the per-gesture witness closes it for the cost of two lines.
3. **A re-baseline argument mid-release.** The instrument is revised after the 01:39-01:42Z baselines, and with no written rule about voided baselines, someone compares the new candidate with the old green `story` baseline. That is ARCHITECTURE's "re-running a guard until it passes" by another route.

**Load-bearing assumptions**

| Assumption | Confidence | If wrong |
|---|---|---|
| The `story` check exercises StoryMap's camera path | Refuted by the plan's own baselines (green on the broken deploy) and by the `isStyleLoaded()` gate | A blocking guard that certifies nothing on `/` |
| On 8.1.0, a story `jumpTo` unmounts the landing page | Medium-high. Code path read end to end, and the `reportError` probe shows the error reaches pageerror. Not observed live | If wrong, the revised baseline is green with `jumpCount` > 0, the check still proves the camera path, and the severity note is dropped |
| A keyless local static export reproduces the `/map` throw | High, observed (`local-810-interact.json`: 47 throws, map found) | n/a |
| 8.1.3's camera-update hook is inert for this app's props | High for both maps, by code reading (`initialViewState` only, so `{}`) | The revised `story` and the local A/B would show it |

Row 1 must be resolved before implementation. Row 2 is resolved by the revised baseline itself.

**Inversion**
- **Keep `story` as a "nothing new" regression check and drop "(and scroll /)" from the anchor.** This wins if no instrument can reach `jumpTo` headless. That is not established: the load-gated slow scroll is untried. If it also fails to reach the path, this becomes the fallback (see 6c).
- **Add an error boundary around StoryMap instead of, or as well as, the bump.** This wins if `/` must survive any future camera throw. It is a lane S change and out of scope here. Worth a Parking Lot line if the baseline confirms the crash, since a story-map throw should not take the whole landing page with it.
- **Shim `map.transform` in app code.** Still loses, for round 1's reasons.

## Close

The `/map` half is ready. The diagnosis, the guard test, the local A/B, the frozen `interact` with red baselines and the M1a hand-off all hold up. The FAIL is the landing page. The new `story` guard was green on the broken deploy before this review began, which is the vacuity round 1 flagged in `interact`, reintroduced one mode down. The code it doesn't reach suggests `/` may be in worse shape than `/map`. One instrument revision fixes it: the load-gated story scroll with a `jumpTo` counter and error-page check, per-gesture `interact`, and a `deeplink` mode. Then come a fresh freeze, fresh 2+2 baselines and the text corrections. This is round 2 of at most three, so the next round should be able to pass if these are folded as written.

**Must-fix, in order:**
1. Revise `story` (load-gated reading-pace scroll, `jumpTo` counter, `#__next_error__` and mounted-map checks, camera samples; pass rule as in 9) and pre-commit its fallback if both baselines don't reach the path. (9, 6; gating)
2. Make `interact`'s witness per gesture (zoom after the wheel at least +0.5, centre moved by the drag). Add a `deeplink` mode with blocking pageerrors = 0 and a recorded landing. (9, 3)
3. Write the baseline-void rule: an instrument edit voids prior baselines, re-freeze, two fresh baselines per changed mode on 6af3b9d0, and the instrument blob hash recorded in every result and in the evidence file. (6)
4. Judge the local A/B on the `center` count (8.1.0 > 0, 8.1.3 = 0, camera moved). Other local pageerrors are recorded and, if unexplained, stop the release before `claim`. (6)
5. Correct the `jumpTo` sentence. State the `/` unmount hypothesis and that the revised baseline settles it. If confirmed, say so in the release report and any halt message, including that the rollback target has the same defect. (3, 7, X6)
6. Add a lane S hand-off line, an owed (non-blocking) phone check of `/`, and rewrite pre-mortem 1 to name what covers each camera path. (3, 9)
7. Guard test: `>= 8.1.3`, separate `it` blocks per half with each half's red recorded on 8.1.0. Judge the lockfile structurally. Refresh the header, pre-mortem 3 and Gates text. (8, 10)

## Appendix: working notes (appended as verified)

- Diff 792d08e..bdf1301 read whole (plan + `scripts/live/live-checks.mjs`). Instrument blob at bdf1301: `8dd8ad70`. bdf1301 committed 01:39:34Z; first live baseline (`known-good-interact-1.json`) started 01:39:49Z, so the freeze-before-baseline promise was kept.
- Session evidence read (read-only), `~/marvin/state/relay/wheel-drag-live/`: `known-good-interact-{1,2}.json` on opencanopy.ca: zoom 5 -> 18, centre moved ~0.003 deg, 22 and 23 pageerrors, every one the `center` throw, `cameraMoved: true`, pass false. `known-good-story-{1,2}.json` on opencanopy.ca: **pageErrorCount 0, pass true, both runs**, scrollHeight 14833, finalScrollY 14033 (= 14833 - 800, the bottom). `local-810-interact.json` on 127.0.0.1:4810 (8.1.0 static export, no key): map found (zoom 5, centre [-125.5, 54]), zoom -> 18, 47 pageerrors all `center`, pass false.
- So the local A/B question is settled empirically for the 8.1.0 arm: a keyless static export constructs the map and fires camera events. The style is not MapTiler there anyway: `src/lib/mapConfig.ts:8-10` falls back to `https://tiles.openfreemap.org/styles/dark` when `NEXT_PUBLIC_MAPTILER_KEY` is unset, and the worktree has no `.env.local` (only `.env.example`). The plan's "tiles and basemap will not load" is half wrong: the basemap is a different, public style. `next.config` is `output: "export"`, so "static build" is the real build mode.
- `/map` has no programmatic camera move on a fresh visit: the only app `flyTo`/`jumpTo` sites are `useMapState.ts:176` (hash with `lat=` and `lng=` only), `:241` (popstate), `page.tsx:414/427` (search, hot spots) and `StoryMap.tsx:74`. So `interact`'s before/after delta can only come from input (or a resize).
- `/` path, read end to end: scrollama `onStepProgress` -> rAF -> `updateCamera` -> `setCurrentCamera` (changes only inside the last 20% of each chapter, `useScrollytelling.ts:85-92`) -> `StoryMap` effect `[camera, supports3D]` (`StoryMap.tsx:70-80`), which returns unless `map.isStyleLoaded()`, then calls `map.jumpTo`. maplibre 6.15 `Map.jumpTo` -> `Camera.jumpTo` (dev.mjs:58855, :55976) applies the transform, then `fire("movestart")` (:56004), which bubbles to the map, where 8.1.0's `_onCameraEvent` reads `this._propsedCameraUpdate || transformToViewState(this._map.transform)` (maplibre.js:98). `_propsedCameraUpdate` is only ever set by `_onCameraUpdate` (:109), which 6.15 never calls (it reads `this._camera.transformCameraUpdate`, dev.mjs:56446; the map-level assignment at maplibre.js:237 is dead). So every story `jumpTo` throws, synchronously, inside a React passive effect.
- Where that throw goes on `/`: there is no app error boundary on `/` (the only one is `MapErrorBoundary`, used at `src/app/map/page.tsx:682`; no `error.tsx` or `global-error.tsx` under `src/app`). React routes a passive-effect throw to the nearest boundary, which is Next's built-in global one; Next 16.4.2's `onCaughtError` treats the built-in boundary as implicit and calls `reportGlobalError` = `window.reportError` (`next/dist/client/react-client-callbacks/error-boundary-callbacks.js`, `report-global-error.js`). That is reported as an uncaught exception (a Playwright pageerror), and the built-in global error UI replaces the page. Unlike `/map`, where the throw happens in MapLibre's frame loop and the map survives, on `/` the first throw would unmount the landing page. This is a code-path reading, not observed: I did not run anything against production, per the brief.
- So the two `story` baselines passing on the broken deploy mean one of two things, and both make the guard vacuous: either `jumpTo` never ran (the fast 40-tick scroll never met a camera change while `isStyleLoaded()` was true, which `Style.loaded()` makes likely: it is false while any tile manager has an in-view tile not yet `loaded` or `errored`, or an image is pending, dev.mjs:47426-47431 and :39023-39031), or it ran and the throw does not surface as a pageerror. Either way the check passed on the build it exists to catch.
- Probe that the instrument CAN see that path (scratch, `scratchpad/r2probe/`, 2026-11-11 ~01:50 UTC, repo untouched): a `file://` page calling `reportError(new Error(...))`, an uncaught `throw` as control, and a `console.error`, run under the repo's Playwright Chromium. Result: `pageerrors: ["probe-reportError", "probe-uncaught-control"]`, `consoleErrors: ["probe-console-error"]`. So a Next-routed effect throw does surface as a pageerror, which leaves "the scroll never ran `jumpTo`" as the explanation for the green story baselines.
- Next 16.4.2's built-in global error renders `<html id="__next_error__">` titled "This page couldn't load" (`next/dist/client/components/builtin/global-error.js:27, :46`): a DOM marker a story check can read.
- react-maplibre `components/map.js` and `maplibre/create-ref.js` are byte-identical between 8.1.0 (installed) and 8.1.3 (round 1's unpacked tarball), so the `__ocMap` fiber finder that read zoom 5 on 8.1.0 reads the same structure on 8.1.3.
- 8.1.3 `_onCameraUpdate` (maplibre.js:106-112) returns `applyViewStateToTransform(tr, this.props)`, which reads `props.viewState || props` (utils/transform.js:43); CanopyMap and StoryMap pass only `initialViewState`, so it returns `{}` and 6.15 `applyUpdatedTransform` (dev.mjs:56442-56458) applies the corrected clone unchanged. Inert, as round 1 said.
- Guard regex re-checked: `/\.transform\b/` hits 8.1.0 `maplibre.js` at exactly :98, :302, :317 and 8.1.3 at none (`.transformCameraUpdate` does not match, `\b` fails between `m` and `C`). Lockfile today: react-map-gl, @vis.gl/react-maplibre, @vis.gl/react-mapbox all 8.1.0.
- Release 4's own standard for agent live checks (`datalayer-public-path-live/guard-evidence-token4.md`): "deterministic; a showing of the old defect would be red". `interact` meets it (baselines red, 22 and 23). `story` does not (baselines green).
- No app code passes `onMove`/`onZoom`/`onDrag` camera callbacks: `grep -rnE "on(Move|MoveStart|MoveEnd|Zoom|ZoomEnd|Drag|DragEnd|Rotate|Pitch)[=:]" src` (tests excluded) returns nothing, while the same form for `onLoad=` finds `StoryMap.tsx:219`. The only camera listeners are `MapReadout.tsx:40` (zoom), `DataLayer.tsx:1291` and `useMapState.ts:225` (moveend).
