Overall verdict: FAIL (round 1)

# Critic round 1: react-map-gl 8.1.0 -> 8.1.3

Plan: `.claude/plans/2026-11-react-map-gl-813.md`. Rubric: `rules/plan-critic-rubric.md` v2. Reviewer: plan-reviewer agent (Opus, xhigh). Run 2026-11-11 01:25 to 01:40 UTC (`date -u`). Read: the plan, `.claude/DECISIONS.md` (whole), `ARCHITECTURE.md` Releases, both react-maplibre versions (installed 8.1.0 `src/` and `dist/`, the 8.1.3 tarball, hash-checked against the registry), react-map-gl 8.1.3 (`npm pack` into the scratchpad, read only), maplibre-gl 6.15.0 `dist/maplibre-gl-dev.mjs`, `scripts/live/live-checks.mjs`, the evidence file, release 4's evidence, the ledger tail, and the app's map code. Evidence with line cites is in the appendix at the end.

The short version: 8.1.3 is the right fix for the throw, and the plan's root-cause reading is correct. But the plan also promises that the URL hash will follow the camera, and it makes that a blocking guard. The hash has a second, independent cause that M1a already owns, and this change cannot fix it. As written, the release goes red on a working fix and halts both lanes.

## Applicability

Project type: a web app dependency bump released to production, plus one guard test and one new live-check mode.

- **Core 1-10:** all active, all [GATING].
- **X1 Physical & human safety:** does not fire. No hardware, heat, power or physical output.
- **X2 Privacy & data stewardship:** does not fire. No personal data is collected, stored or exposed, and the tracker is untouched.
- **X3 Evidence & source integrity:** does not fire. The plan produces no research or public factual claim. Its own technical claims are judged under core 2, 3 and 9.
- **X4 Audience, brand & money accuracy:** N/A. No copy, figures, prices or brand surfaces change.
- **X5 Concurrency & re-entrancy:** fires because the release uses the shared ledger, lease and serialized lanes. [ADVISORY]
- **X6 Operability & observability:** fires because it deploys to production. [ADVISORY]
- **X7 Self-modification safety:** does not fire. `scripts/live/live-checks.mjs` is OpenCanopy's own release instrument, not a MARVIN gate, hook or skill. The release tool paths (`release-ledger.mjs`, `scripts/lib/*`, `pre-push`) are untouched, so ARCHITECTURE step 9 does not apply.
- **X8 Dependencies, performance & cost:** fires because it updates an external package. [ADVISORY]

## Verdicts

**1. Problem-fit: FAIL.** The anchor says "a visitor can scroll and drag /map without uncaught errors, and the URL follows the camera". The second half has a cause this plan does not touch. `useMapState.ts:196-233` subscribes `moveend` only if `mapRef.current` is already set when the effect runs. Its deps are `[mapRef, enabledLayers, activePreset]`, and the map exists only after react-maplibre's async `import('maplibre-gl')`. A fresh visitor's layers never change, so the subscription never happens. I proved this in a harness against the real hook: zero subscriptions on late attach, and a control showing the instrument can fire (appendix). The program plan already assigns exactly this to M1a ("subscribe the URL sync once the map exists"), and the hand-off itself said only that the hash "may be the older M1a defect". The plan's claim that the throw aborts `moveend` before the hash writer is correct in mechanism: `Evented.fire` has no try/catch and react-maplibre registers first. But it applies only after the writer has subscribed, which on a fresh visit it never does. Calling the hash "the same defect" quietly takes an item off M1a's list that this release will not deliver. No DECISIONS entry is contradicted. **Fix:** narrow the anchor to "no uncaught errors on wheel, drag and programmatic camera moves", strike the "same defect" sentence, and say outright that the hash stays with M1a. If Lee wants the hash fixed in this release, that is a scope change for him to make. The fix is M1a's one-liner (subscribe once the map exists), and it brings M1a's guard obligations with it.

**2. Approach soundness: PASS.** Verified: maplibre-gl 6.15 `Map` has no `transform` member. 8.1.0's bundled ESM reads it at exactly `maplibre.js:98/:302/:317`, which are the only `\.transform\b` hits in all of 8.1.0's dist JS. 8.1.3's `maplibre.js` has none, and every getter `getTransformLike` calls exists on 6.15 `Map`. The ESM entry Next bundles (`react-map-gl/dist/maplibre.js`) is byte-identical between versions. Two minor plan inaccuracies don't change the approach: `:302` became `map.getCanvas().clientWidth/Height`, not `getTransformLike`, and the 8.1.3 change is wider than the plan describes (see 3).

**3. Completeness: CONCERN.** Four paths the change touches are missing from the plan.
- **The landing page.** `StoryMap.tsx:74` calls `map.jumpTo` on every camera change on `/`. In 6.15 `jumpTo` applies the transform and then fires `movestart`, so the same throw is reachable there today, and the bump changes it. Nothing in the plan's guard set looks at `/` beyond HTTP 200 and the build tag.
- **Listeners the throw has been masking since 2026-10-22.** These are `DataLayer.tsx:1291` (WFS reload on `moveend`) and `MapReadout.tsx:40` (the zoom readout). After the bump they run again, which is visible behaviour.
- **Programmatic camera moves.** Release 4's log shows app `flyTo` throwing from `_prepareEase` before the camera moves. The deep link, popstate, search and the CTA deep link (which a product ruling depends on) all go through that path, and all of them change.
- **The rest of the 8.1.3 diff.** The diff has seven runtime or type changes beyond the transform reads (appendix), and the plan names one. The most material is `setTransformCameraUpdate`: 8.1.0's assignment was dead on 6.15, so the camera-update hook goes live on both maps. I checked the app's props, and the constraint, size and settings changes are inert here. The plan should say so instead of leaving it to pre-mortem 1.

**Fix:** add a short "what else changes" list covering these four, the release-record lines for each, and coverage for `/` (see 9).

**4. Right-sizing & reuse: PASS.** It is a minimal change and the plan is short. Out-of-scope items are already owned and scheduled (brief item 4, M1a batch 0, lane S). Simple tier is exempt from the dependency-graph and batch rules.

**5. Security: PASS.** The tarball's sha1 and sha512 match the registry. Both packages are canonical vis.gl, 8.1.3 was published 2026-09-02 (69 days old), the optional-peer metadata is unchanged so no peer gets auto-installed, and there are no new runtime dependencies. No secrets, auth or attack surface are involved.

**6. Failure modes: CONCERN.** The plan does not say what happens when `interact` comes back half-red: zero page errors, but the hash still empty. Per 1, that is the expected outcome. It also gives `interact` one baseline run where every other guard gets two, and it does not freeze the instrument before the baseline. Release 4 corrected the visibility instrument three times mid-release. A new instrument that disagrees with expectation invites the same thing here, and ARCHITECTURE forbids it ("Re-running a guard until it passes is not a recovery"). **Fix:** pre-commit the `interact` code and pass rule before the baseline run, and take two baseline and two candidate runs. Write down now that a red on the candidate halts and goes to Lee, with no instrument edits during the release.

**7. Change safety: CONCERN.**
- **Local proof.** The plan says a local real-browser check is "not possible end to end". That is true for tiles, but the defect doesn't need tiles. Camera events fire on a constructed map with no style loaded, so `interact` can run headless against a local `npm run build && npm start` on 8.1.0 and then on 8.1.3. That A/B would show the throw gone before production sees the build, and it would also show the hash staying empty, which catches the item-1 problem before a red release.
- **Rollback target.** The plan doesn't name one: deploy `6af3b9d0647a97628cb3fffe`, sha `4de59d7`, the token-4 known-good.

**Fix:** add the local A/B as a pre-push step with its outputs kept, and name the rollback target in the Release section.

**8. Data integrity & compatibility: CONCERN.**
- **What actually ships.** The lockfile is the shipped artifact (Netlify installs from it), but the guard test reads whatever is in the local `node_modules`.
- **M1a's negative controls.** M1a's guard catalogue requires its search and CTA guards to be "red on batch 0". This release may un-break part of the programmatic-camera path, which could quietly invalidate those negative controls.
- **The release record.** The ROADMAP `shipped` entry and the hand-off update must not claim the hash fixed.

**Fix:** have the guard test also assert the `package-lock.json` entries for `react-map-gl` and `@vis.gl/react-maplibre` at 8.1.3 or later. Add a hand-off line (via `update-handoff.mjs`) telling M1a that app `flyTo` no longer throws at `movestart` as of this release, so its negative controls must be re-baselined. Keep M1a's "subscribe the URL sync" item as is.

**9. Verifiability: FAIL.**
- **(a) A blocking guard that cannot pass.** `interact` passes only if the hash changes and contains `z=`. Per 1, the hash will not change on a fresh-context run whatever the react-map-gl version. So the plan's own blocking guard is red by construction on a working fix, and that halts both lanes.
- **(b) A vacuous half.** "Zero page errors" alone would pass a run in which the wheel and drag never reached the map. The mode records zoom and centre only after the moves and asserts nothing about them.
- **(c) The guard test's pattern has a hole.** "No `.transform.` / `_map.transform`" misses 8.1.0's `const tr = map.transform;` at `:317`. It still goes red on 8.1.0 because of `:98` and `:302`, but by luck.
- **(d) The revert proof is weaker than the one available for free.** A three-line fixture proves the regex, not the file resolution. A test that resolved the wrong file, such as `dist/index.js`, which has no transform reads in 8.1.0, would pass its fixture proof and stay green on 8.1.0. The real 8.1.0 file is on disk right now.
- **(e) Pre-mortem 1's mitigations misdescribe their instruments.** The suite's deep-link and preset tests stub the map handle and `vi.mock` react-map-gl, so they cannot see 8.1.3. `attach` opens `/map#layers=cutblocks`, which is a layer deep link with no camera. And `interact` "reads zoom and centre" but compares them to nothing.
- **(f) Unnamed baselines.** The console baseline runs aren't named. Release 4's `candidate-console-{1,2}.json` are on this exact deploy and can serve.

**Fix:**
- For (a) and (b): make `interact` block on pageerror count = 0 AND a positive movement witness. The witness is zoom and centre captured before the moves, with zoom up by at least 1 and centre moved. Record `hashFollowed` as a non-blocking measurement for M1a. The baseline's jump to maxZoom 18 from five ticks is also worth recording before and after.
- For (c): use `/\.transform\b/` on `dist/maplibre/maplibre.js` only. 8.1.3's `utils/transform.js` has `map.transform` in a comment and would false-red.
- For (d): write the test first, run it on today's 8.1.0 `node_modules` and keep the red output, then install and keep the green.
- For (e): add a non-blocking camera deep-link measurement, such as `/map#lat=…&lng=…&z=8` with the camera read after 15 s, and correct the pre-mortem text.
- For (f): name the console baseline files.
- Add the `/` check from 3: a headless scroll of the story counting pageerrors, baseline now and candidate after. Make it blocking on "nothing new", or at minimum record it.

**10. Maintainability: CONCERN.** `live-checks.mjs` gained `interact`, but its usage line (`:31`) and header block (`:7-23`) still list four modes. The guard test should say why it exists (maplibre-gl 6 removed `map.transform`) and when it can go (when the minimum react-map-gl is past 8.1.3 and the pattern can't recur). The plan doesn't mention closing its own hand-off entry ("Live /map throws on wheel and drag") on the next release's first commit. **Fix:** update the usage and header text, add the test comment, and add the hand-off close to the post-release record.

**X5 Concurrency & re-entrancy [ADVISORY]: PASS.** The release goes through the ledger lease and `check-push`. The token-4 release is closed, with no lease held (ledger tail). `npm install` runs in this worktree's own `node_modules`, a real directory, not a symlink to the primary.

**X6 Operability & observability [ADVISORY]: PASS.** The ledger, halts, `/notify` and the standing-yes limits are all named. After the guards, nobody watches production pageerrors until OPS ships, which is a known and scheduled gap (G1 OPS). The `/` check from 9 narrows it for this release.

**X8 Dependencies, performance & cost [ADVISORY]: PASS.** Three packages move. Integrity and age are checked and the package-safety hook fires on install. `sideEffects: false` is new in both package.json files and is covered by `npm run build` plus the live checks. The now-live `_onCameraUpdate` costs one `transformToViewState` per camera update, which is negligible.

## Stress tests

**Pre-mortem: it is February and this failed.**
1. **The release goes red by construction.** The candidate shows zero page errors and an empty hash, so `interact` is red, a NEW HALT goes out, both lanes stop, and Lee is asked to bless a red-to-green or roll back a fix that worked. This is the type-specific worst case: a gate that fails closed on correct work. The cheap way out, adjusting the instrument until it reads green, is exactly the move ARCHITECTURE forbids. What we should have seen: `useMapState`'s deps and M1a's own work list.
2. **The landing page changes and nobody looks.** Story-map camera moves stop throwing and the camera-update hook goes live there. No guard checks `/`. A visible change, good or bad, is first seen by a visitor, and lane S's next baseline carries an unexplained shift.
3. **Cross-plan drift.** App `flyTo` (search, deep links, the CTA) stops throwing at `movestart`, so M1a's "red on batch 0" negative controls are no longer red. M1a either re-plans late or certifies guards that never failed in front of it.

**Load-bearing assumptions**

| Assumption | Confidence | If wrong |
|---|---|---|
| Fixing the throw makes the hash follow the camera | Low. Refuted by code reading and the harness probe; M1a owns it | Red release, both lanes halted |
| Nothing else in 8.1.3 matters to this app | High for `/map` (props verified); unverified for `/` and the un-masked listeners | An unguarded landing-page or WFS behaviour shift |
| The 8.1.3 bundle has no `map.transform` read and its getters exist on 6.15 | High, verified | n/a |
| No real-browser proof is possible before production | Partly false; the throw needs no tiles | Production is the first test, again |

Rows 1 and 4 are resolve-before-implementation.

**Inversion**
- **Shim `map.transform` in app code** (a getter returning `map._camera.transform`). This wins only if 8.1.3's semantic changes hurt this app or the upgrade were blocked. Neither is true: the changes are inert for these props, and a shim reaches into a private field. Upgrading stays right.
- **Fold M1a's "subscribe once the map exists" into this release.** This wins if the hash must ship now. Nothing in the brief says it must ("try 8.1.3, verify in a real browser. Release."). It is Lee's call, and the default is to narrow.
- **Local A/B before production.** This wins if a local build can reproduce the throw without tiles, and that condition is already true. Adopt it.

## Close

The diagnosis is right and the fix is right. The verification has two defects. It promises and gates a symptom the fix cannot reach, and it trusts instruments to cover paths they don't exercise. Fold the must-fix items below and the next round should be short.

**Must-fix, in order:**
1. Narrow the anchor and the `interact` pass rule. Block on pageerrors = 0 plus a before/after movement witness, and record the hash as a non-blocking M1a measurement. Strike the "same defect" claim and keep M1a's subscribe item. (Gating: 1, 9.)
2. Add the local A/B with `interact` against a localhost build on 8.1.0 and on 8.1.3 before any push, keeping the outputs. (7)
3. Add a `/` story-scroll pageerror check, baseline and candidate. (3, 9)
4. Guard test: pattern `/\.transform\b/` on `maplibre.js` only, a real 8.1.0-then-8.1.3 revert proof, and a lockfile version assertion. (8, 9)
5. List what else changes: the rest of the 8.1.3 diff, the un-masked `moveend` and `zoom` listeners, and programmatic `flyTo`. Correct pre-mortem 1's instrument claims, and add a non-blocking camera deep-link measurement. (3, 9)
6. Freeze the `interact` instrument before the baseline, take 2+2 runs, name the console baselines (`candidate-console-{1,2}.json` on 6af3b9d0), and pre-commit "red halts, no instrument edits". (6, 9)
7. Name the rollback target (deploy 6af3b9d0, sha 4de59d7). Add the hand-off line telling M1a to re-baseline its negative controls, and the hand-off close for this item. (7, 8, 10)
8. Update the `live-checks.mjs` usage and header text, and add the guard test's "why and when to delete" comment. (10)

## Appendix: working notes (appended as verified)

- Tarball provenance: `scratchpad/pkg-rml813/vis.gl-react-maplibre-8.1.3.tgz` sha1 `1139184644fd…` and sha512 match `npm view @vis.gl/react-maplibre@8.1.3 dist.*` (read 2026-11-11 01:27 UTC). react-map-gl 8.1.3 depends on exactly `@vis.gl/react-maplibre 8.1.3` and `@vis.gl/react-mapbox 8.1.3`; optional-peer metadata unchanged (no peer auto-install). Published 2026-09-02T21:41Z (npm `time`).
- Root cause verified: maplibre-gl 6.15.0 `Map$1` (dev.mjs:58061) has no `transform` member, the camera is `this._camera` (:58152); 8.1.0 `dist/maplibre/maplibre.js` reads `.transform` at :98, :302, :317 (sweep of all 8.1.0 dist `*.js` for `\.transform\b`: exactly those three). `Evented.fire` (dev.mjs:3682) has no try/catch and calls listeners in registration order; react-maplibre registers camera listeners at :257, right after construction (:228). Camera events reach the map via `this._camera.setEventedParent(this)` (:58168).
- 8.1.3 `dist/maplibre/maplibre.js`: zero `\.transform\b` matches. `react-map-gl/dist/maplibre.js` (the ESM entry Next bundles) is byte-identical between 8.1.0 and 8.1.3. All getters `getTransformLike` calls exist on 6.15 `Map` (getCenter :58394, getCenterElevation :58418, getZoom :58487, getBearing :58602, getPadding :58647, getPitch :58725).
- 8.1.3 diff beyond the transform reads (src/maplibre/maplibre.ts): (1) `setTransformCameraUpdate(this._onCameraUpdate)` on MapLibre 6, where 8.1.0's `map.transformCameraUpdate = …` was a dead assignment (6.15 reads `this._camera.transformCameraUpdate`, dev.mjs:58380, :56446), so the camera-update hook goes live on both maps; (2) minZoom/maxZoom/minPitch/maxPitch moved out of `settingNames` into `_updateConstraints`, and a removed setting prop now resets to a default; (3) `_updateSize` reads canvas client size (controlled `viewState` only); (4) `map.style?._loaded`; (5) `sideEffects: false` in both package.json files; (6) new `GlobeControl` export; (7) `MapBoxZoomEvent` type alias. App usage checked: CanopyMap passes constant `minZoom={4} maxZoom={18} maxPitch={70}` and `initialViewState` (CanopyMap.tsx:218-229); StoryMap passes `initialViewState`, `interactive={false}`, `onLoad` (StoryMap.tsx:208-221). Neither passes `viewState`, top-level camera props, `projection`, `maxBounds`; `_onCameraUpdate` therefore returns `{}` and (2)/(3) are inert for this app. (1) is live and new on StoryMap.
- `src/` reads no `map.transform`: `grep -rnE '\.transform\b'` over src, e2e, scripts (`*.ts,*.tsx,*.mjs,*.js`) returns 3 hits, all `style.transform` in `src/hooks/useDragDismiss.ts`.
- Hash writer registration: `useMapState.ts:196-233` reads `mapRef.current?.getMap()` once, returns if null, deps `[mapRef, enabledLayers, activePreset]`. The map instance exists only after react-maplibre's async `import('maplibre-gl')` (map.tsx:49, :72) and the handle is published through `useImperativeHandle(…, [mapInstance])` (map.tsx:108) and CanopyMap's dep-less `useImperativeHandle(ref, () => mapRef.current!)` (CanopyMap.tsx:119). On a fresh context (no hash, no localStorage) `useLayerState` never calls `setEnabledLayers` (useLayerState.ts:171-187), so the effect never re-runs and `map.on("moveend", handleMove)` is never registered. M1a in the program plan already owns this: "subscribe the URL sync once the map exists" (glowing-dazzling-brooks.md, M1a, map handle and camera).
- Other app camera listeners masked by the throw today (all registered after react-maplibre's): `DataLayer.tsx:1291` (WFS reload on moveend), `MapReadout.tsx:40` (zoom readout). `StoryMap.tsx:74` calls `map.jumpTo` per camera change on `/`; 6.15 `jumpTo` applies the transform then fires `movestart` (dev.mjs:56003-56004), so the same throw is reachable on the landing page. Release 4's audit:live log shows app `flyTo` throwing from `_prepareEase` before the camera moves (`datalayer-public-path-live/candidate-audit-live.log:348-356`), so every app flyTo (deep link, popstate, search, CTA) is on the same path.
- Evidence file `~/marvin/state/relay/wheel-drag-live/known-good-interact.json`: 23 pageerrors, all the `center` throw; hash empty before and after; zoom ended at 18 (the maxZoom) after five wheel ticks; started 2026-11-11T01:23:03Z. It names no deploy id or SHA. Ledger tail: token 4 green on deploy `6af3b9d0647a97628cb3fffe`, sha `4de59d7`, released 01:07:18Z, so the plan's "deploy 6af3b9d0, main 4de59d7" matches.
- `interact` mode (live-checks.mjs:189-218): pass = no pageerror AND hash changed AND contains `z=`. It captures no zoom/centre before the moves, asserts nothing about the values after, does not record console.error, and the file's usage line (:31) and header (:7-23) omit the mode.
- Harness probe of the subscription race (scratch, not committed): `scratchpad/vt/hash-subscribe.test.ts` run with `npx vitest run --config scratchpad/vt/vitest.scratch.config.mjs` against the repo's real `useMapState`, 2026-11-11 01:36 UTC: map handle attached after mount with deps unchanged gives **0** `moveend` subscriptions; the control (same harness, layers change after attach) gives **1**, so the instrument can fire. 2 tests passed. Repo left clean (`git status`).
- Console baseline for this release already exists on deploy 6af3b9d0: release 4's `candidate-console-{1,2}.json` (one normalised line each, the province-edge 404).
