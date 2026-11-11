# /map throws on wheel and drag: react-map-gl 8.1.0 -> 8.1.3

*Plan, 2026-11-10. Session marvin/canopy (driven by marvin session-f1a7d3), brief item 3. Tier: Simple (a dependency bump plus one guard test).*

## Intent (grilled)

Grill skipped: fix mode on a defect the hand-off already specified ("Live /map throws on wheel and drag ... react-map-gl 8.1.3 is out and untested") and the brief ordered ("try 8.1.3, verify in a real browser. Release."). Anchor: a visitor can scroll and drag /map without uncaught errors, and the URL follows the camera. Anti-goals: no other dependency moves; no map behaviour change beyond the fix.

## The defect, measured on production today (deploy 6af3b9d0, main 4de59d7)

`scripts/live/live-checks.mjs interact` (headless Chromium, real GPU): five wheel ticks and one drag on /map produce **23 uncaught page errors**, all `Cannot read properties of undefined (reading 'center')`, and `location.hash` stays empty (evidence `~/marvin/state/relay/wheel-drag-live/known-good-interact.json`). The audit:live run for release 4 shows the same throw from `_onCameraEvent` on a `flyTo` (`live-health.spec.ts:283`).

Cause, read in the installed code: `@vis.gl/react-maplibre` 8.1.0 `dist/maplibre/maplibre.js:98` computes `transformToViewState(this._map.transform)` in its camera-event handler, and `:302`, `:317` read `map.transform` elsewhere; maplibre-gl 6.15 no longer exposes `map.transform` (the camera lives at `map._camera.transform`), so every move, zoom and pitch event throws inside MapLibre's `fire()`. `fire()` has no try/catch, and react-map-gl registers its camera listeners at map construction, before `useMapState` registers `map.on("moveend", handleMove)` (`src/hooks/useMapState.ts:225`). So the throw also aborts `moveend` dispatch before the hash writer runs: the "URL hash does not update on move" symptom the hand-off filed under M1a is the same defect.

8.1.3 (published 2026-09-02, `npm view`) replaces every `map.transform` read in that file with `getTransformLike(map)`, built from public getters (`getCenter`, `getZoom`, `getBearing`, `getPitch`, `getCenterElevation?.()`, `getPadding`; `dist/utils/transform.js:7-17` of the 8.1.3 tarball, inspected unpacked in the scratchpad). Its peer range is `maplibre-gl >=4.0.0`.

## Change

1. `package.json`: `"react-map-gl": "^8.1.3"`; `npm install react-map-gl@8.1.3` updates the lockfile (react-map-gl, @vis.gl/react-maplibre, @vis.gl/react-mapbox to 8.1.3; nothing else may move: diff the lockfile and list every changed package in the report). The package-safety hook runs after the install.
2. A guard test, `src/test/audit/react-map-gl-transform.test.ts`: reads the installed `@vis.gl/react-maplibre/dist/maplibre/maplibre.js` (resolved from `node_modules`, not via the package exports, which hide package.json) and asserts it contains no `.transform.` / `_map.transform` read, so a downgrade or a lockfile regression to 8.1.0 goes red. Revert proof: point it at the 8.1.0 file text (kept as a fixture string captured from today's install, the three offending lines only) and see it red.
3. A camera-event unit test if the mock can carry it cheaply: not required; the live check below is the real proof, because the mock map has no `transform` either way.

## Verification

- Checks on the tip: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Local real-browser check before release: not possible end to end (localhost cannot load R2 tiles or the domain-locked MapTiler style, DECISIONS 2026-07-17), so the real-browser proof is the release's live check, run first on the current deploy (done: 23 errors, hash empty) and then on the candidate.

## Release

Lane M, kind `behaviour`, ARCHITECTURE.md Releases steps 1-8; approval: the full verbatim 2026-11-10 Deploy amendment with its relayed attribution. First commit carries item 2's post-release record (`summary --unrecorded`) and its ROADMAP `shipped` entry. `/notify` at push; on any `NEW HALT`, tell Lee and `/notify`.

Blocking guards: identity (`commit_ref`, `state: ready`, `oc-build` on `/`, `/map`, `/privacy`, 200); `audit:live` against the recorded six-failure baseline (no new failure; `:283` is expected to change from the `center` throw to whatever it reports next); console (two candidate runs vs the two baseline runs, nothing new in both); live check `interact`: zero page errors and the hash follows the camera (it fails on the current deploy). Also re-run `attach`, `year`, `visibility` from release 4 so the bump cannot quietly regress them.

## Out of scope

The three headless render checks in audit:live (`:130`, `:152`, `:283`) and the stale `:118` parser: brief item 4 and M1a batch 0 own the audit:live retargeting. Story map: lane S.

## Pre-mortem

1. 8.1.3 changes `onMove`/`viewState` semantics and the controlled-map paths (initialViewState, deep-link camera) behave differently. Mitigation: the deep-link camera and preset tests in the suite; the live `interact` check reads zoom and centre after the moves; `attach` re-run covers a deep link.
2. The lockfile pulls other packages forward. Mitigation: exact install, lockfile diff listed, refused if anything outside the three @vis.gl/react-map-gl packages moves.
3. The guard test is satisfied by a string in a comment. It reads compiled `dist` JavaScript, where the 8.1.3 file has no such read at all; the assertion is on `transform.` property access patterns.

## Gates

Simple tier: plan-reviewer round 1 at xhigh (DECISIONS 2026-10-07), then implement, Razor, release. No Jen (no visual change).
