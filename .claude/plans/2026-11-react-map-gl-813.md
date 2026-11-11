# /map throws on wheel and drag: react-map-gl 8.1.0 -> 8.1.3

*Plan, 2026-11-10. Session marvin/canopy (driven by marvin session-f1a7d3), brief item 3. Tier: Simple (a dependency bump plus one guard test).*

## Intent (grilled)

Grill skipped: fix mode on a defect the hand-off already specified ("Live /map throws on wheel and drag ... react-map-gl 8.1.3 is out and untested") and the brief ordered ("try 8.1.3, verify in a real browser. Release."). Anchor: a visitor can scroll and drag /map (and scroll /) without uncaught errors, and the camera actually moves. The URL hash following the camera is NOT promised here (see below; M1a owns it). Anti-goals: no other dependency moves; no map behaviour change beyond the fix.

## The defect, measured on production today (deploy 6af3b9d0, main 4de59d7)

`scripts/live/live-checks.mjs interact` (headless Chromium, real GPU): five wheel ticks and one drag on /map produce **23 uncaught page errors**, all `Cannot read properties of undefined (reading 'center')`, and `location.hash` stays empty (evidence `~/marvin/state/relay/wheel-drag-live/known-good-interact.json`). The audit:live run for release 4 shows the same throw from `_onCameraEvent` on a `flyTo` (`live-health.spec.ts:283`).

Cause, read in the installed code: `@vis.gl/react-maplibre` 8.1.0 `dist/maplibre/maplibre.js:98` computes `transformToViewState(this._map.transform)` in its camera-event handler, and `:302`, `:317` read `map.transform` elsewhere; maplibre-gl 6.15 no longer exposes `map.transform` (the camera lives at `map._camera.transform`), so every move, zoom and pitch event throws inside MapLibre's `fire()`. `fire()` has no try/catch, and react-map-gl registers its camera listeners at map construction, before `useMapState` registers `map.on("moveend", handleMove)` (`src/hooks/useMapState.ts:225`). **Correction (critic r1): the hash symptom is a separate defect.** `useMapState.ts:196-233` reads `mapRef.current?.getMap()` once and returns if it is null; on a fresh visit the map instance arrives later (react-maplibre's async `import('maplibre-gl')`), nothing re-runs the effect, and `moveend` is never subscribed (critic's scratch harness against the real hook: 0 subscriptions on late attach, 1 in the control). M1a keeps its item, "subscribe the URL sync once the map exists". Where the subscription does exist (a visit that changes layers), the throw also aborts `moveend` dispatch, because react-maplibre's listeners run first and `Evented.fire` (dev.mjs:3682) has no try/catch; this bump removes that second cause only.

8.1.3 (published 2026-09-02, `npm view`) replaces every `map.transform` read in that file with `getTransformLike(map)`, built from public getters (`getCenter`, `getZoom`, `getBearing`, `getPitch`, `getCenterElevation?.()`, `getPadding`; `dist/utils/transform.js:7-17` of the 8.1.3 tarball, inspected unpacked in the scratchpad). Its peer range is `maplibre-gl >=4.0.0`.

## Change

1. `package.json`: `"react-map-gl": "^8.1.3"`; `npm install react-map-gl@8.1.3` updates the lockfile (react-map-gl, @vis.gl/react-maplibre, @vis.gl/react-mapbox to 8.1.3; nothing else may move: diff the lockfile and list every changed package in the report). The package-safety hook runs after the install.
2. A guard test, `src/test/audit/react-map-gl-transform.test.ts`: reads the installed `node_modules/@vis.gl/react-maplibre/dist/maplibre/maplibre.js` by path (the package exports hide package.json) and asserts no match of `/\.transform\b/` (8.1.0 matches at :98, :302, :317, including `const tr = map.transform;`); and asserts package-lock.json resolves `node_modules/react-map-gl` and `node_modules/@vis.gl/react-maplibre` to `8.1.3`. A header comment says why it exists (MapLibre 6 removed `map.transform`) and when to delete it (when react-map-gl is replaced or MapLibre is no longer 6.x). Revert proof on real installs, not a fixture: run it on today's 8.1.0 install (red), then on 8.1.3 (green), record both lines.
3. No camera-event unit test: the suite mocks react-map-gl, so it cannot reach this code; the local A/B and the live checks below are the proof.

**What else changes with 8.1.3 (critic r1, diffed):** (1) `setTransformCameraUpdate(this._onCameraUpdate)` replaces 8.1.0's dead `map.transformCameraUpdate =` on MapLibre 6, so the camera-update hook becomes live on both maps; with no controlled `viewState` it returns `{}`; (2) min/max zoom and pitch move to `_updateConstraints` (CanopyMap passes constants, inert); (3) `_updateSize` (controlled viewState only, inert); (4) `map.style?._loaded`; (5) `sideEffects: false`; (6) `GlobeControl` export; (7) a type alias. **Behaviour that starts running because the throw stops masking it:** DataLayer's WFS reload on `moveend` (`DataLayer.tsx:1291`, WFS-only layers, none public), the zoom readout (`MapReadout.tsx:40`), and every programmatic `flyTo`/`jumpTo` (deep-link camera, popstate, search, the story CTA, `StoryMap.tsx:74` on `/`), which today throws at `movestart` before the camera moves. M1a's batch-0 negative controls that are "red on batch 0" may stop being red; the hand-off tells M1a to re-baseline them.

## Verification

- Checks on the tip: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- **Local A/B before any push (critic r1: the throw needs no tiles):** static build of the tip on 8.1.0 and on 8.1.3, each served on localhost, `interact` run against each (tiles and basemap will not load; camera events still fire). Expected: 8.1.0 pageerrors > 0, 8.1.3 pageerrors = 0 with the camera moved. Outputs kept beside the live evidence.
- The `interact` instrument is frozen (committed) before its live baseline is taken; then 2 baseline runs on deploy 6af3b9d0 and 2 candidate runs. Pre-committed: a red guard halts and goes to Lee; no instrument edits after the candidate runs start.

## Release

Lane M, kind `behaviour`, ARCHITECTURE.md Releases steps 1-8; approval: the full verbatim 2026-11-10 Deploy amendment with its relayed attribution. First commit carries item 2's post-release record (`summary --unrecorded`) and its ROADMAP `shipped` entry. `/notify` at push; on any `NEW HALT`, tell Lee and `/notify`.

Rollback target: deploy 6af3b9d0647a97628cb3fffe (sha 4de59d7), today's known-good per `status`.

Blocking guards: identity (`commit_ref`, `state: ready`, `oc-build` on `/`, `/map`, `/privacy`, 200); `audit:live` against the recorded six-failure baseline (no new failure; `:283` is expected to change from the `center` throw); console against the existing baselines for 6af3b9d0, `~/marvin/state/relay/datalayer-public-path-live/candidate-console-{1,2}.json` (nothing new in both candidate runs); live check `interact` (`/map`): pageerrors = 0 in both candidate runs AND a movement witness: zoom or centre recorded before the moves differs after them (on the current deploy pageerrors are 23); live check `story` (`/`): scroll the landing page through its chapters, pageerrors = 0 in both runs (baseline 2 runs on 6af3b9d0 first). Re-run `attach`, `year`, `visibility` from release 4 so the bump cannot regress them.

Non-blocking measurements, recorded: whether the hash follows the camera (M1a's item; expected still empty on a fresh visit); a camera deep link `/map#lat=..&lng=..&z=..` lands at the encoded camera (today the flyTo throws before moving).

## Out of scope

The three headless render checks in audit:live (`:130`, `:152`, `:283`) and the stale `:118` parser: brief item 4 and M1a batch 0 own the audit:live retargeting. Story map: lane S.

## Pre-mortem

1. 8.1.3 changes camera-update semantics and the programmatic camera paths behave differently now that they stop throwing. Mitigation: the diff is listed above and this app passes no controlled `viewState`; the deep-link camera measurement and `interact`'s movement witness cover the real paths (the unit suite mocks react-map-gl and `attach` uses a layers-only deep link, so neither covers this, critic r1).
2. The lockfile pulls other packages forward. Mitigation: exact install, lockfile diff listed, refused if anything outside the three @vis.gl/react-map-gl packages moves.
3. The guard test is satisfied by a string in a comment. It reads compiled `dist` JavaScript, where the 8.1.3 file has no such read at all; the assertion is on `transform.` property access patterns.

## Hand-off lines (at close)

- M1a: the hash-subscription defect stands (map handle arrives after `useMapState`'s effect); batch-0 negative controls that relied on flyTo throwing must be re-baselined after this release.
- Item 3 closed with its evidence path, or the halt and Lee's choices.

## Gates

Simple tier: plan-reviewer round 1 at xhigh (DECISIONS 2026-10-07), then implement, Razor, release. No Jen (no visual change).
