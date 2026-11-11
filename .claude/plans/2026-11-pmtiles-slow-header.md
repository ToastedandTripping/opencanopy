# A slow PMTiles header no longer leaves /map's vector layers dead until reload

*Plan, 2026-11-11. Session marvin/canopy (driven by marvin session-f1a7d3; coordinator 2026-11-11: plan it as its own item, build and release only if it stays small). Tier: Simple (one source file and its test).*

## Intent (grilled)

Grill skipped: fix mode on a defect measured on production this session and owed in the hand-off ("PMTiles header timeout on slow devices"). Anchor: a visitor on a slow phone whose tile-archive header arrives after 15 s still gets the vector layers, and any error notice shown meanwhile clears when they arrive. Anti-goals: no retry of a header that genuinely failed (that needs removing and re-adding the shared source; parked); no change to the timeout length or to anything visible when the header is on time.

## The defect, verified in code

`src/components/map/DataLayer.tsx:430-439` (PmtilesLayers `initSource`): after 15 s without the archive header, the timeout removes the `sourcedata` listener and calls `onError`. If the header arrives later (slow network, saturated main thread), nothing is listening, so `addLayersToMap` never runs and the layer stays blank until reload. Measured on production 2026-11-11 under host load 16 (evidence `~/marvin/state/relay/small-routed-fixes-live/candidate-visibility-run1-header-timeout-load16.json`): one archive request, layer never attached in 67 s. All six public layers share one source, so all six die together.

Status today: `handlePmtilesError` sets `pmtilesFailed`; the DataLayer status effect (`:1315-1317`) shows `error` while the layer is visible and failed, and has no else branch on purpose (WFS statuses survive; test 10 of `pmtiles-layers-lifecycle.test.tsx`).

## Change

1. **Keep listening after the timeout.** The 15 s timer still reports the error (`onError`), but no longer removes the `sourcedata` listener; the effect's cleanup still removes it on unmount, as now.
2. **Recover when the header arrives late.** When the listener fires after a timeout already reported an error, PmtilesLayers adds the layers as normal (the latest-ref re-apply puts current visibility and filters on them) and calls a new `onRecovered(layer.id)` prop. DataLayer's handler sets `pmtilesFailed` false and clears the layer's status (`clearLayerStatus`), so the error notice goes away; the status effect's "no else branch" stays untouched (the recovery path clears explicitly, once, only after a reported PMTiles failure, so WFS statuses are unaffected).
3. A `pipelineLog` line marks a late recovery.

## Tests (`src/test/pipeline/pmtiles-layers-lifecycle.test.tsx`, real LoadingProvider, fake timers)

1. Late header: style ready, sources pending, visible; advance 15 s: status `error`; then flip pending off and emit `sourcedata`: the fill layer exists with visibility `visible` and the status is cleared. Mutant: the timeout removes the listener again (red: layer never added).
2. Late header while hidden: as 1 but the layer is hidden; after recovery no status is set and the layer is added hidden. Regression guard.
3. Recovery clears only after a reported failure: a normal on-time header never calls `onRecovered`'s clear (a WFS status written for a WFS-only fixture is untouched). Mutant: clear status on every `sourcedata` (red).
4. Unmount during the wait: the listener is removed by cleanup; a later `sourcedata` adds nothing. Regression guard.
5. Existing test 7 (hidden layers never report error on the shared source) still passes unchanged.

## Out of scope (Parking Lot line)

A header that fails outright (network error) is still not retried: that needs removing and re-adding the shared source for all six layers, with its own design.

## Release

Lane M, kind `behaviour`, ARCHITECTURE.md Releases; approval: the standing yes (2026-11-10 Deploy amendment, verbatim, relayed). Guards: identity, console, `attach`, `visibility` (the late-header case is the visibility check's own scenario when its hold trips the timeout), `interact`, `audit:live` against release 8's set. Not a visual release.

## Gates

Plan-reviewer at xhigh, at most three rounds; Ted; Razor. Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
