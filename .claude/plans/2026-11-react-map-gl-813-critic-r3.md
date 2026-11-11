Overall verdict: FAIL (round 3)

# Critic round 3: react-map-gl 8.1.0 -> 8.1.3

Plan: `.claude/plans/2026-11-react-map-gl-813.md` at 7b6265b. Rounds 1 and 2: FAIL. Rubric: `rules/plan-critic-rubric.md` v2. Reviewer: plan-reviewer agent (Opus, xhigh). Run from 2026-11-11 01:55:41 UTC (`date -u`). Read: the r1 and r2 files, the whole bdf1301..7b6265b diff, the plan, `scripts/live/live-checks.mjs` at 7b6265b (and its diff from release 4's ff9bc25), `.claude/DECISIONS.md`, ARCHITECTURE.md Releases, the hand-off, every file in `~/marvin/state/relay/wheel-drag-live/` (read only), release 4's guard evidence and audit:live log, `chapters.ts`, `useScrollytelling.ts`, `interpolation.ts`, `useDeviceCapability.ts`, `ScrollytellingContainer.tsx`, `StoryMap.tsx`, `useMapState.ts`, `CanopyMap.tsx`, the `/map` page wiring, the installed react-maplibre 8.1.0 (`maplibre.js`, `transform.js`, `components/map.js`, `create-ref.js`), the unpacked 8.1.3 `maplibre.js`, and the maplibre-gl 6.15 dev build. One probe ran against the session's **local** 8.1.0 build on 127.0.0.1:4810. Nothing ran against production. Line cites are in the appendix.

**The short version.** The fix is right, and the `/map` wheel-and-drag guard is real: red on today's deploy (29 throws) and red on the local 8.1.0 build (36). I checked the session's ruling on round 2's landing-page crash, and it holds. The story camera never changes, so `jumpTo` never runs and the page can't unmount. One gating problem is left, and it is the same one round 2 failed on, moved to a different check. The new `deeplink` check is listed as a blocking guard. The session's own baseline, taken a minute after the plan was committed, shows it passing on the broken deploy: zero errors, camera never moved. A local probe shows why. On a fresh visit the deep-link fly doesn't run at all until something re-renders the page, so the check passes whatever react-map-gl does. The fix is one click inside the check, or a downgrade to "recorded", plus fresh baselines. Two of the plan's statements are also wrong. The landing page does throw on 8.1.0, whenever its map is resized, though it stays up. And a deep-link fly throws before the camera moves, not after.

## What is gating and what is not

- **Gating, the only reason this is a FAIL:** dimension 9(a). `deeplink` is a blocking guard that cannot fire on a fresh visit, so it would certify the programmatic camera path without exercising it.
- **Must-fix, not gating:** 3(a)-(e), 6(b)-(c), 9(b) and 10. These are text corrections, scoping and clarity. None of them would let a bad release through on its own.
- **Advisory:** 2, 6(a), 7, 9(c)-(d), X6, plus the late deep-link fly (3c), which goes to M1a.

## Round 2 must-fixes: folded?

| # | Round 2 must-fix | Status |
|---|---|---|
| 1 | Revise `story`; pre-commit its fallback if it can't reach the path | **Folded in substance.** The session went further than I asked and settled the question by reading the code. The trial run agrees, and I re-verified it (scope item 2, below). The fallback was taken: `story` is now recorded only. One part of the fallback is missing. Round 2 said that if `story` dropped to a recording, the anchor's "(and scroll /)" had to be reworded to what the evidence supports. The anchor still promises it (see 9b). |
| 2 | Per-gesture `interact`; add a `deeplink` mode | `interact`: **folded**. The wheel witness is the zoom-or-centre OR rather than a zoom delta of at least 0.5 (9c, minor). `deeplink`: **added, but it can't fire** (9a, gating). |
| 3 | Baseline-void rule, sha in every result | **Folded and kept.** The instrument was committed at 01:55:18Z. Every fresh result carries sha256 `8a267857…`, and the old baselines are in `void/`. The rule is file-wide, so read literally it also voids release 4's console baselines, which the plan reuses (6b). |
| 4 | Local A/B judged on the `center` count | **Folded.** The 8.1.0 arm was re-run on the re-frozen instrument: 36 throws, all `center`. It is served from its own copy of the build, so the 8.1.3 build can't overwrite it. The plan doesn't say that (6a, advisory). |
| 5 | Correct the `jumpTo` sentence; settle the `/` hypothesis | **The hypothesis is settled, correctly. The sentence was over-corrected.** It now says every programmatic move throws "after the camera has moved". That is true of `jumpTo` only. Every path it lists (deep link, popstate, search, CTA) is a `flyTo`, which throws before moving. Line 43 says the opposite (3a). |
| 6 | Lane S line, phone check, rewrite pre-mortem 1 | **Lane S line added.** Declining the phone check is consistent with DECISIONS 2026-10-07: this is not a visual release. Pre-mortem 1 was rewritten, but it credits `deeplink` with coverage the evidence refutes (9a). |
| 7 | Guard test at or above 8.1.3, split `it` blocks, structural lockfile diff, text refresh | **Half folded.** Pre-mortems 2 and 3 have the corrected design. Change item 2, the line Ted builds from, still says "resolves … to `8.1.3`" with a single revert proof. The `live-checks.mjs` header still names the datalayer plan (10). |

## Scope item 2: is the landing page safe? Verified independently

**Yes. Round 2's unmount hypothesis is unreachable on this build, and the trial's wrap could not have missed a call.**
- **Camera fields.** All five chapters use `FLAT_BC_CAMERA`. `interpolateCamera` between two equal cameras returns the same numbers exactly: `a + 0*t` is `a` for any finite `t`, and `lerpAngle(0, 0, t)` is `0`. So `camerasEqual` always holds, and `currentCamera` keeps its first object.
- **Other dependencies.** `supports3D` is a lazy `useState` initializer that never updates. `effectiveCamera`'s memo is therefore stable.
- **When the effect runs.** StoryMap's camera effect runs once, on the first commit. At that point react-maplibre has not built the map yet (it does so in a promise after the commit), so the ref is `null`. The effect never runs again.
- **Other callers.** A sweep of all app code for camera-moving calls finds StoryMap's `jumpTo` as the only one on `/`.
- **The wrap.** The fiber walk passes `_Map`'s hooks, which hold no `getMap`. It stops at StoryMap's own `mapRef`, the instance the effect would use, and `/` has one map. With the only call site unable to fire after the map exists, there was nothing to miss. What the trial lacked was a positive control. My local probe supplied one: wrapping that instance and calling `jumpTo` once counted 1 and threw the `center` error, so the wrapper sees calls on the live instance.

**What the plan gets wrong here.** "The landing page is not exposed" is too broad. MapLibre 6.15's `resize()` fires `movestart`, and the map's ResizeObserver calls it on every container size change. On the local 8.1.0 build, one viewport resize on `/` produced one `center` pageerror. The map stayed mounted and no error screen appeared, because the throw happens outside React. So on today's site, `/` throws whenever a visitor resizes the window, rotates a phone or tablet, or changes browser zoom, and it skips the redraw that should follow. 8.1.3 fixes this too. It also gives `story` a way to go red on the old build (9b).

## Scope item 3: the reworked modes

- **`interact`.** Sound. The camera is snapshotted between the wheel and the drag. `dragMoved` compares the centre after the drag with the centre after the wheel. The fresh baseline on 6af3b9d0 is red (29 throws, 15 of them after the wheel), and so is the local 8.1.0 build (36). On 8.1.3 the gestures also run the newly live camera-update hook: MapLibre's handler manager calls `applyUpdatedTransform` on every gesture frame. So this check covers the riskiest new code in 8.1.3, not just the throw. Minor: `wheelMoved` uses the zoom-or-centre OR (9c).
- **`deeplink`.** It can't fire (9a). `useMapState` polls the page-level `mapRef`. CanopyMap's `useImperativeHandle(ref, () => mapRef.current!)` has no deps, so it fills that ref only when CanopyMap renders. On a fresh visit the map arrives inside react-maplibre's own state, after CanopyMap's last render, so the page ref stays `null`. `flyTo` waits until something re-renders the page. The baseline shows it: zero errors, camera at the default, `landed: false`, `pass: true`. The local probe shows the mechanism: zero errors at 12 s, then one panel click and the `center` throw arrives, with the camera still unmoved.
- **`story`.** Correct as a recording, and the code reading backs its 0. Two loose ends. Its `pass` is false by construction on every run, because `reachedJumpTo` is always false (6c). And it waits on `getStyle()` rather than `isStyleLoaded()`, which no longer matters.

## Applicability

Project type: a web app dependency bump released to production, with one guard test and three live-check modes.

- **Core 1-10:** all active, all [GATING].
- **X1 Physical & human safety:** does not fire. No hardware, heat, power or physical output.
- **X2 Privacy & data stewardship:** does not fire. No personal data is collected, stored or exposed, and the tracker is untouched.
- **X3 Evidence & source integrity:** does not fire. No research or public factual claim is produced. Technical claims are judged under 2, 3 and 9.
- **X4 Audience, brand & money accuracy:** N/A. No copy, figures or brand surfaces change.
- **X5 Concurrency & re-entrancy:** fires (shared ledger and lease, serialized lanes, local build directories). [ADVISORY]
- **X6 Operability & observability:** fires (production deploy). [ADVISORY]
- **X7 Self-modification safety:** does not fire. `live-checks.mjs` is OpenCanopy's own release instrument, not a MARVIN gate, hook or skill. The release tool is untouched.
- **X8 Dependencies, performance & cost:** fires (three packages move). [ADVISORY]

## Verdicts

**1. Problem-fit: PASS.** It still fixes the brief's defect. No DECISIONS entry is contradicted: the 2026-11-10 Deploy amendment's verbatim approval, the three-round cap, serialized releases, and phone checks for visual releases only. Note that the Deploy amendment's standing yes "does not cover anything at critic FAIL", so this round goes to Lee before any `claim`. The anchor's `/` clause is handled under 9b.

**2. Approach soundness: PASS.** Re-verified: 8.1.3 has no `.transform` read, and its `_onCameraUpdate` returns `{}` for this app's props. Advisory: 8.1.3 sets `_propsedCameraUpdate` on every camera update and never clears it. After the first gesture, `e.viewState` on later camera events is stale. No app code reads `viewState` (grep of `src`), so it's inert here. Worth knowing before anyone adds an `onMove`.

**3. Completeness: CONCERN.**
- **(a) The `flyTo` sentence is wrong and contradicts line 43.** MapLibre's `flyTo` fires `movestart` from `_prepareEase` before `_ease` moves anything. Release 4's audit:live log shows it, and so does probe B (camera unmoved after the throw). Every path the sentence lists is a `flyTo`. Only StoryMap's unreachable `jumpTo` throws after moving.
- **(b) "The landing page is not exposed" overclaims.** Today `/` throws on every map-container resize. The page survives (scope item 2). The lane S line and the release report should say so.
- **(c) A newly running behaviour isn't named: the late deep-link fly.** On 8.1.3 a camera deep link, including the story CTA's, flies only when the `/map` page first re-renders. The poll gives up at 120 s, so that can be well after load. `flyTo` calls `stop()`, so a visitor who has panned and then opens a panel gets snapped to the link's camera. Today the same click throws and nothing moves. It is M1a's defect class (a late map handle), one hook above the hash subscription.
- **(d) audit:live.** `:243` (fish-streams) also fails today with the `center` throw (release 4 log, failure 5), not only `:283`. Both will change message.
- **(e) The `attach`, `year` and `visibility` re-runs** now sit at the end of the local A/B paragraph. Locally, tiles don't load, so those modes can't run meaningfully there.

**Fix:**
- (a) "`flyTo` throws at `movestart` before the camera moves; `jumpTo` would throw after."
- (b) Replace with: "`jumpTo` on `/` is unreachable; `/` throws on resize on 8.1.0, outside React, and the page survives." Carry that into the lane S line and the release report.
- (c) Add it to "behaviour that starts running". Add an M1a hand-off line naming the cause, CanopyMap's dep-less imperative handle and the 120 s poll.
- (d) Name `:243` beside `:283`, and state that "no new failure" is judged by test id.
- (e) Put the three re-runs back under Blocking guards: production candidate, instrument `pass` true, as in release 4.

**4. Right-sizing & reuse: PASS.** It is still minimal, 63 lines, and reuses release 4's instrument and ledger. Out-of-scope work is owned (brief item 4, M1a batch 0, lane S). Simple tier is exempt from the batch rules.

**5. Security: PASS.** Unchanged from rounds 1 and 2. The tarball's provenance was checked, no new runtime dependencies are added, and no secrets are involved.

**6. Failure modes: CONCERN.**
- **(a) Advisory: the local A/B arms are separated, but only in practice.** The :4810 server serves a scratchpad copy, `out-810`, not the worktree's `out/`, so building 8.1.3 won't overwrite the 8.1.0 arm. A mix-up would make the A/B fail loudly rather than pass, because the rule needs more than 0 throws on 8.1.0 and exactly 0 on 8.1.3. Write the separation into the plan, and record each arm's served directory and its react-maplibre version in its result.
- **(b) The void rule is file-wide.** Read literally, it voids release 4's `candidate-console-{1,2}.json`, which the plan reuses as the console baseline. Substantively those still stand. Since ff9bc25, the diff touches only the header, the result object and the three new modes; `console`, `attach`, `visibility` and `year` are byte-identical.
- **(c) `story` reports `pass: false` on every run** by construction, because `reachedJumpTo` is false. A reader of the evidence will meet a "failed" check the plan calls recorded.

**Fix:**
- (a) As above, advisory.
- (b) Scope the rule: "an edit voids earlier baselines of the modes whose code changed". Name the four unchanged modes.
- (c) Either say the field is ignored, or adopt 9b's rule.

**7. Change safety: PASS.** The rollback target is named, and the local A/B runs before the push. Advisory: the rollback target throws on `/map` gestures and on `/` resize. Any NEW HALT message should say so in plain words, so Lee's choice between a red candidate and the rollback is informed.

**8. Data integrity & compatibility: PASS.** The lockfile is judged structurally (pre-mortem 2), and the hash and M1a items are not claimed.

**9. Verifiability: FAIL.**

*(a) GATING: `deeplink` can't fire.* The plan makes it a blocking guard, and pre-mortem 1 names it as the coverage for the deep-link path. On deploy 6af3b9d0, where every camera event throws, the session's `known-good-deeplink-1.json` reads 0 pageerrors, camera at the default, `landed: false`, `pass: true`. Probe B, on the local 8.1.0 build, reproduces that and shows the cause. No `flyTo` runs until the page re-renders. After one panel click the `center` throw arrives. So on 8.1.3 the candidate will also read 0, and the release record will say the programmatic camera path passed a guard it never reached. That is round 2's `story` failure, moved to a different check. It also breaks Lee's standing rule that a guard counts only once it has been seen red. The release risk behind it is modest: `interact` already exercises the camera-update hook that `flyTo` shares. The false certification is the defect.

**Fix, either option clears the gate:**
- **A, recommended.** After the 12 s wait, click the button named "Toggle layer panel" once. Wait 2 s. Then judge pageerrors = 0 (blocking) and record the camera and `landed`. Re-freeze the instrument and take two fresh baselines of `interact` and `deeplink` on 6af3b9d0, plus `story` if 9b is folded. `deeplink` must be red in both. The local probe predicts one `center` throw. If it is green, it goes back to being a recording, as in B.
- **B.** Demote `deeplink` to recorded. Strike it from pre-mortem 1. State that no automated check reaches programmatic `flyTo` (deep link, popstate, search, CTA), and that `interact` covers the shared camera-update hook through gestures.

*(b) Must-fix, not gating: `/` has no blocking guard while the anchor promises one.* The anchor still says "(and scroll /) without uncaught errors". Round 2's fallback required rewording it if `story` became a recording. The resize finding offers something better than a reword. **Fix:** in `story`, after the style is ready, do one viewport resize (for example to 1000x700), wait 2.5 s, then scroll as now. The pass rule becomes pageerrors = 0 AND map mounted AND no error screen. Drop `reachedJumpTo` from the pass rule and keep `jumps` as a recorded field. Probe A predicts red on 6af3b9d0 (one `center` throw) and green on 8.1.3. Make it blocking under the same two-baselines-red rule, or reword the anchor to what is actually gated.

*(c) Advisory: the `interact` wheel witness.* `wheelMoved` is the zoom-or-centre OR, while the plan says "the wheel changes zoom". If the instrument is being edited anyway, use `afterWheel.zoom - before.zoom >= 0.5`. Not gating: a wheel at the canvas centre doesn't move the centre on its own.

*(d) Advisory: the `jumpTo` counter.* If `story` keeps it, either add the positive control (one external call after the scroll, expect +1), or describe the trial's 0 as corroboration of the code reading. The plan's sentence leans on it as a measurement.

**10. Maintainability: CONCERN.**
- **Change item 2 disagrees with pre-mortem 3.** Item 2 says the lockfile must resolve to `8.1.3` and gives one revert proof. Pre-mortem 3 says 8.1.3 or later, two `it` blocks, two revert proofs. Ted builds from item 2.
- **The instrument header.** `live-checks.mjs:3` still says "for a /map release (plan: …datalayer-public-path.md …)". The header carries two `interact:` entries, and the first, `:27-29`, still states the retired OR rule.
- **A stale count.** Plan `:11` cites 23 errors from the voided instrument; the fresh baseline is 29.

**Fix:**
- Rewrite item 2 to match pre-mortem 3.
- Fix the header lines; this rides the re-freeze if 9a's option A is taken.
- Update the count, or note that the voided figure is shown for history.

**X5 Concurrency & re-entrancy [ADVISORY]: PASS.** Releases are serialized through the lease and `check-push`. Fresh baselines ran one after another (01:55:32Z, then 01:56:58Z). The local build arms are separated (6a).

**X6 Operability & observability [ADVISORY]: CONCERN.** Nothing watches `/`. `audit:live` loads only `/map` (`PRODUCTION_URL` is `/map`), and so does the console guard. Since 2026-10-22, `/` has been throwing on every resize, unseen. **Fix:** report it in the release report as a live defect found and fixed. List `/` among the pages G1 OPS must watch.

**X8 Dependencies, performance & cost [ADVISORY]: PASS.** Three packages move at once, their provenance was checked, and the package-safety hook fires.

## Stress tests

**Pre-mortem: it is February and this failed.**
1. **The gate failed open, again.** `deeplink` read green on both candidate runs, and the evidence file and ledger recorded the deep-link path as guarded. In January, M1a's re-baseline trusted that record, and nobody learned that no deep link had ever flown on a fresh visit until a journalist's shared link opened on the province view. We should have seen it from `known-good-deeplink-1.json`, which was green on the broken deploy before this review began.
2. **The CTA snap.** On 8.1.3, a visitor from the story's "Explore the Map" lands on the province view, pans for ten seconds, and opens the layer panel. The camera jumps to Clayoquot Sound. The release made it reachable and didn't say so, and M1a learns of it from a visitor. We should have seen it from probe B, where the panel click is when the deferred fly fires.
3. **A recorded check is read as a verdict.** `story` writes `pass: false` on every run by construction, and those files sit in the evidence directory next to the blocking results. Either a later session aggregates `pass` fields and halts a good release, or the team learns to skim past `pass: false`, which is how the next real red gets missed. Saying what the field means, or giving `story` a pass rule that can actually be met (9b), would have prevented both.

**Load-bearing assumptions**

| Assumption | Confidence | If wrong |
|---|---|---|
| StoryMap's `jumpTo` is unreachable after the map exists | High: code read end to end, the wrapper shown able to count on the live instance, three production scrolls at 0 | Round 2's unmount returns. Resolved. |
| `deeplink` exercises programmatic `flyTo` | **Refuted**: the session's own baseline plus probe B | A blocking guard that certifies nothing. Resolve before `claim` (9a). |
| 8.1.3's camera-update hook is inert for this app's props | High by code (`{}` for `initialViewState`-only props), and exercised by `interact`'s gestures through the handler manager | `interact` on the candidate would show it |
| `interact`'s red on 6af3b9d0 measures the defect, not the instrument | High: 29 throws, all `center`; local 8.1.0 gives 36; per-gesture witnesses true | n/a |

**Inversion**
- **Demote `deeplink` rather than fix it (option B).** This wins if a click-driven check is judged too coupled to the UI, since the button's accessible name could change. It is partly true: the selector is app-specific. Either option is honest. Only the current state, blocking and unable to fire, is not.
- **Fix CanopyMap's handle in this release,** so deep links land on load. This wins if the late snap (3c) is judged worse than "doesn't land". It loses here: the fix is M1a's, it changes behaviour beyond the bump (anti-goal), and the snap is rare. Hand it over.
- **Keep `story` as a recording and reword the anchor.** This wins if a resize is judged not to be "scroll". It loses now that a resize is the one way to make `/` go red on the old build: a real guard beats a narrower promise.

## Close

The fix and most of the evidence are in good shape. The diagnosis, the guard test design, the local A/B, the freeze discipline and `interact`'s per-gesture witness all hold up. The session answered round 2's landing-page question properly: the crash was unreachable, and that has been checked. The FAIL is one guard. `deeplink` was promoted to blocking without anyone noticing that its own first baseline passed on the broken deploy. Rule 9 exists to catch exactly that, and round 2 already applied it to `story`. Options A and B each clear it. The rest is text and scoping. This was the last round, so it goes to Lee; there is no round 4.

**Must-fix, in order:**
1. **(Gating, 9a.)** `deeplink`: click "Toggle layer panel" after the 12 s wait, then judge pageerrors = 0 and record landing. Re-freeze, and take two fresh baselines of every blocking mode on 6af3b9d0, with `deeplink` red in both. Or demote it to recorded and strike its coverage claim from pre-mortem 1.
2. **(9b.)** Give `/` a guard that can go red: a viewport resize in `story`, with pass = pageerrors 0 + map mounted + no error screen. Or reword the anchor's `/` clause.
3. **(3a, 3b.)** Correct the `flyTo` sentence and "the landing page is not exposed". Carry the resize fact into the lane S line, the release report (X6) and any halt message (7).
4. **(3c.)** Name the late deep-link fly among the newly running behaviours, and hand it to M1a with its cause.
5. **(6b, 6c.)**
   - Scope the void rule to the changed modes.
   - Settle what `story`'s `pass` means.
6. **(3d, 3e, 10.)**
   - Name `:243` beside `:283`.
   - Put `attach`, `year` and `visibility` back under Blocking guards on the production candidate.
   - Make Change item 2 match pre-mortem 3.
   - Fix the instrument header and the stale 23.

**For Lee, in plain words.** Should the release check be fixed before shipping, or shipped with that check marked as "recorded only"? The library update fixes the errors you'd hit by scrolling or dragging the map, and that is properly proven. The map check fails on today's site and is built to pass once the fix is live. One of the new safety checks, the one meant to catch problems when someone opens a shared map link, can't actually see anything. It passed on today's broken site, so it would pass whatever happens. That breaks your rule that a check only counts once it has been seen to fail. Fixing it is about ten minutes: one click added inside the check, and two fresh runs on today's site to watch it fail. The alternative is to call it "recorded only" and say plainly that shared links aren't covered. I recommend the fix, because it is cheap and it protects the record. If it's wrong, the cost is the ten minutes. Either way is reversible, and nothing is live yet. Doing nothing leaves the release waiting on your answer, because your standing yes doesn't cover a plan the critic has failed.

## Appendix: working notes (appended as verified)

- Run started 2026-11-11 01:55:41 UTC (`date -u`). `resolve-critic.sh --next-round` printed round 3 for this path.
- Instrument at 7b6265b: sha256 `8a267857dacc4d92bf1a508b96866d1140d2d4583a330290dcb44301ab0adebd`, identical to the working tree. Commit time 01:55:18Z. The fresh baselines `known-good-interact-1.json` (01:55:32Z) and `known-good-deeplink-1.json` (01:56:58Z) and the local `local-810-interact.json` (01:58:14Z) all carry that hash, so the freeze-before-baseline rule was kept. The 01:39-01:42Z baselines sit in `void/`. `story-reachability-trial.json` (01:53:52Z) predates the commit by 85 s but carries the same hash, so it ran the committed bytes.
- Story camera, verified by reading: every chapter's `camera` is `FLAT_BC_CAMERA` (`src/data/chapters.ts:122,132,143,159,192`). `updateCamera` either copies the chapter camera (`useScrollytelling.ts:94`) or calls `interpolateCamera` (`:92`), whose `lerp(a, a, t)` is `a + 0*t`, exactly `a` for any finite t, and `lerpAngle(0, 0, t)` is `0` (`src/lib/math/interpolation.ts:9-17`). So `camerasEqual` (`useScrollytelling.ts:32-40`) is always true and `setCurrentCamera` keeps the first object (`:172`). `supports3D` comes from a lazy `useState` initializer that never updates (`src/hooks/useDeviceCapability.ts:41`), and `effectiveCamera`'s `useMemo` deps are therefore stable (`ScrollytellingContainer.tsx:24-27`). StoryMap's camera effect (`StoryMap.tsx:70-80`) runs once, on the first commit, when react-maplibre's ref is still `null` (`components/map.js:13,74`: the map is built in a promise `.then`, after the first commit). It never runs again. **The session's conclusion holds: the `jumpTo` path, and with it round 2's unmount hypothesis, is unreachable on this build.**
- The wrap: the fiber walk from `.maplibregl-map` passes `_Map`'s hooks (none has `.current.getMap`) and stops at StoryMap's `mapRef`, the same ref the effect reads, so it wraps the right instance. `/` has one map. The only call site cannot fire after the map exists, so the wrap could not have missed a call. The 0 is corroboration of the code reading, not proof by itself: the trial had no positive control. My probe supplied one (below).
- Camera-call sweep: `grep -rnE "\.(jumpTo|flyTo|easeTo|panTo|zoomTo|setZoom|setCenter|setPitch|setBearing|fitBounds|resize|setTerrain|setProjection|setPadding)\(" src` (tests excluded) returns six sites: `StoryMap.tsx:74` (the only one on `/`), `CanopyMap.tsx:98` (`setTerrain`), `useMapState.ts:176` and `:241`, `map/page.tsx:414` and `:427`. Shown able to fire: the pattern matches the known `StoryMap.tsx:74`.
- **Probe, local only** (the session's 8.1.0 static build on 127.0.0.1:4810, served from the scratchpad copy `out-810`, `index.html` mtime 01:42:21Z; script in my scratchpad `r3probe/probe.cjs`; run 02:01:40Z; production untouched). (A) `/`: map found at zoom 5, 0 errors. Wrapping `jumpTo` and calling it once from outside counted 1 and threw the `center` TypeError, so the wrapper can fire. Then `page.setViewportSize(1000x700)`: **1 pageerror, `Cannot read properties of undefined (reading 'center')`**, map still mounted, no error screen. (B) `/map#lat=49.3&lng=-123.1&z=10`: at 12 s, **0 pageerrors and the camera unmoved at zoom 5, [-125.5, 54]**, matching the session's `known-good-deeplink-1.json`. One click on "Toggle layer panel": **1 pageerror (the `center` throw)**, camera still unmoved.
- Why (A): MapLibre 6.15 `resize()` fires `movestart` and `move` whenever the camera is not already moving (`maplibre-gl-dev.mjs:59040-59050`), and the container's ResizeObserver calls it on every size change after the first (`:61027-61043`). 8.1.0's `_onCameraEvent` is on `movestart` (`maplibre.js:21-23,256-258`) and throws. The throw is in a ResizeObserver/timer callback, not React, so the page survives; `redraw()` after `resize()` is skipped.
- Why (B): `useMapState`'s deep-link effect polls `mapRef.current` (`useMapState.ts:167-183`). On `/map` that ref is set by CanopyMap's `useImperativeHandle(ref, () => mapRef.current!)` with no deps (`CanopyMap.tsx:119`), which runs only when CanopyMap renders. On the first commit the inner ref is `null`; the map arrives later inside react-maplibre's own state, which does not re-render CanopyMap. So the page's ref stays `null` until the page component re-renders for some other reason (the panel click), and only then does `flyTo` run. On 8.1.0 it throws at `movestart` (`_prepareEase`, before any transform change). It is the same late-handle class as M1a's hash defect, one hook earlier.
- `flyTo` ordering: 6.15 `Camera.flyTo` (`maplibre-gl-dev.mjs:56506`) calls `_prepareEase`, which fires `movestart` (`_prepareEase`, `if (!noMoveStart && !currently.moving) this.fire(... "movestart" ...)`) before `_ease` applies any frame (`:56631-56635`). Release 4's `candidate-audit-live.log:346-356` shows the throw stack `_prepareEase` -> `fire` -> `_onCameraEvent` on the test-driven `flyTo` in `:243`; failures 5 (`:243`) and 6 (`:283`) both carry it (log lines 348-537, 8 occurrences across retries).
- Gesture path runs the camera-update hook: `HandlerManager._commitFrame` calls `this._camera.applyUpdatedTransform(tr)` (`maplibre-gl-dev.mjs:55457-55458`), which calls `transformCameraUpdate` when set (`:56443-56451`). So on 8.1.3 `interact` exercises the hook that 8.1.3's `setTransformCameraUpdate` makes live (8.1.3 `maplibre.js:239-244`).
- 8.1.3 `_propsedCameraUpdate`: initialised `null` (`:83`), set in `_onCameraUpdate` (`:110`), read in `_onCameraEvent` (`:99`), never cleared. `grep -rn viewState src` (tests excluded) returns nothing, so no app code consumes `e.viewState`.
- Instrument diff ff9bc25..7b6265b: hunks at the header (`@@ -8`, `@@ -21`), the result object (`@@ -83`) and the new modes (`@@ -186`, +122 lines); `console`, `attach`, `visibility`, `year` bodies unchanged.
- `local-810-interact.json` (re-frozen instrument): pageErrorCount 36, errorsAfterWheel 23, wheelMoved and dragMoved true, pass false, every error the `center` throw. `known-good-interact-1.json` (production 6af3b9d0): 29 errors, 15 after the wheel, zoom 5 -> 18 after three ticks, pass false.
- audit:live scope: `PRODUCTION_URL = 'https://opencanopy.ca/map'` (`e2e/monitoring/live-health.spec.ts:24`); no test loads `/`.
- Local build directories: the :4810 listener (`ss -ltnp`, pid 2989073) runs `scratchpad/serve.py scratchpad/out-810 4810` (from `/proc/<pid>/cmdline`), so it serves a copy, not the worktree's `out/` (built 00:41Z). That is what `local-810-interact.json` names as `baseUrl`. I first wrote 6a as "the arms share one directory" from the listener's cwd, then corrected it after reading the cmdline. A fingerprint by string is weak, because `setTransformCameraUpdate` also appears in maplibre-gl's own chunk (1 match in `out-810`), so the advice is to record the source version instead.
