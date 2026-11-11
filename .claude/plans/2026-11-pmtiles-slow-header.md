# A slow PMTiles header no longer leaves /map's vector layers dead until reload

*Plan, 2026-11-11, revised after critic r1 (FAIL, folded). Session marvin/canopy (driven by marvin session-f1a7d3; coordinator 2026-11-11: plan it as its own item, build and release only if it stays small). Tier: Simple (one source file and its test).*

## Intent (grilled)

Grill skipped: fix mode on a defect measured on production this session and owed in the hand-off ("PMTiles header timeout on slow devices"). Anchor: a visitor on a slow phone whose tile-archive header arrives after 15 s still gets the vector layers, and any error notice shown meanwhile clears when they arrive. Anti-goals: no retry of a header that genuinely failed (that needs removing and re-adding the shared source; parked); no change to the timeout length or to anything visible when the header is on time.

## The defect, verified in code

`src/components/map/DataLayer.tsx:430-439` (PmtilesLayers `initSource`): after 15 s without the archive header, the timeout removes the `sourcedata` listener and calls `onError`. If the header arrives later (slow network, saturated main thread), nothing is listening, so `addLayersToMap` never runs and the layer stays blank until reload. Measured on production 2026-11-11 under host load 16 (evidence `~/marvin/state/relay/small-routed-fixes-live/candidate-visibility-run1-header-timeout-load16.json`): one archive request, layer never attached in 67 s. All six public layers share one source, so all six die together.

Status today: `handlePmtilesError` sets `pmtilesFailed`; the DataLayer status effect (`:1315-1317`) shows `error` while the layer is visible and failed, and has no else branch on purpose (WFS statuses survive; test 10 of `pmtiles-layers-lifecycle.test.tsx`).

## Change (revised after critic r1, FAIL: folded)

1. **Keep listening after the timeout.** The 15 s timer still reports the error (`onError`), but no longer removes the `sourcedata` listener; the effect's cleanup still removes it on unmount. Hardening: the listener also requires the source to have its tile list before adding (an errored source reads `isSourceLoaded` true in 6.15; it never fires `sourcedata`, but the guard costs one line).
2. **Recover when the header arrives late.** The listener removes itself and calls `addLayersToMap`; only if that succeeds (no throw) does PmtilesLayers call a new `onRecovered(layer.id)`. A throw keeps the existing `onError` path, so a failed add never hides its own error.
3. **The status effect owns the clear** (critic r1: an explicit clear can run before React commits the failure's effect, and the stale effect would then queue the error over a drawing layer). DataLayer's `onRecovered` handler only sets `pmtilesFailed` false. The status effect keeps a ref of the previous `pmtilesFailed`; on the transition failed to not-failed while visible it calls `clearLayerStatus` once (which also cancels any pending debounced error); otherwise it behaves exactly as now (no else branch, so WFS statuses survive).
4. A `pipelineLog` line marks a late recovery.

## Tests (`src/test/pipeline/pmtiles-layers-lifecycle.test.tsx`, real LoadingProvider, fake timers)

1. Late header, visible: style ready, sources pending; advance 15 s: status `error`; flip pending off, emit `sourcedata`; the fill exists with visibility `visible`, the status is cleared after the debounce window, and the handler was passed to `off("sourcedata")`. Mutant: the timeout removes the listener (red: no layer).
2. Recovery resets the failure: after recovery, hide and re-show the layer: no `error` returns. Mutant: the handler skips the `pmtilesFailed` reset (red).
3. Recovery clears only after a reported failure, on a tile-backed layer: an on-time header with a status set beforehand by the test leaves that status untouched. Mutant: clear on every `sourcedata` (red).
4. Failed add during recovery: `addLayer` throws on the late header: status stays `error`. Mutant: call `onRecovered` unconditionally (red).
5. Late header while hidden: layer added hidden, no status. Regression guard.
6. Unmount during the wait: a later `sourcedata` adds nothing. Regression guard.
Existing test 7 (hidden layers never report on the shared source) unchanged.

**Live check.** New `late-header` mode in `scripts/live/live-checks.mjs`: hold the archive header 20 s (past the timeout) on `/map#layers=cutblocks`, then read the fill layer, `isSourceLoaded`, and whether the legend shows "BC data unavailable" for the layer. Run on the current deploy first: it must fail (layer absent) and in doing so shows whether production's header arrives late rather than never; on the candidate the layer must be present and the notice gone. The visibility mode's comment about the 15 s timeout is updated.

## Out of scope (Parking Lot line)

A header that fails outright (network error) is still not retried: that needs removing and re-adding the shared source for all six layers, with its own design. Amend the existing ROADMAP Parking Lot line (around :216, "A failed PMTiles header is never retried") to say late headers now recover and only outright failures remain, rather than adding a second line.

## Docs

ARCHITECTURE.md (the Status model and the PMTiles paragraph around :116-118: late headers recover, the status effect clears on recovery); the status-effect comment and the `console.warn` text in DataLayer.tsx ("did not load within 15 s; still waiting"); the hand-off line for this item.

## Release

Lane M, kind `behaviour`, ARCHITECTURE.md Releases; approval: the standing yes (2026-11-10 Deploy amendment, verbatim, relayed). Guards: identity, console, `attach`, `visibility`, `interact`, `audit:live` against release 8's set, and the new `late-header` check (red on release 8 first, green on the candidate). If the release-8 run shows the header never arrives at all under the hold, the check proves nothing on production, and the release says plainly that only the unit tests prove the fix. Not a visual release.

## Gates

Plan-reviewer at xhigh, at most three rounds; Ted; Razor. Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Round 2 folds (critic r2, FAIL; folded 2026-11-11, round 3 not yet run)

The code design held against the installed libraries (critic r2): the status effect's transition clear always runs after the stale failure effect (React commit order), is StrictMode-safe and never clears a WFS status; pmtiles 4.4.0 exposes `tiles`, and MapLibre 6.15 copies it onto the source only on a successful header, so the tile-list guard blocks no real recovery. The proof is what changes:

- **Tier is Standard, not Simple** (DataLayer.tsx, the mock, the lifecycle test, live-checks.mjs, plus docs), so this plan owes a Review Focus section before round 3.
- `addLayersToMap` catches its own errors and never throws outward: it returns a boolean, and `onRecovered` is called only on `true`.
- **Mock:** `src/test/mocks/maplibre.ts` gives the vector source a `tiles` array once its sources are no longer pending; without it seven existing tests and all new ones go red, and test 4 proves nothing.
- **Tests renumbered 22-27** (the file already uses 1-21). Test 22 asserts `_listenerCount("sourcedata") === 0` after the late add (the `off` assertion is already true under StrictMode). Tests 23, 24 and 26 advance past the 250 ms debounce before reading status. Test 27 unmounts after the 15 s timeout, not before. Test 24's mutant has no single-edit form under this design: the existing test 10 is the tripwire for dropping the ref condition, and 24 is labelled a regression guard. The status-effect comment records why the clear lives there (no test catches it moving back into the handler).
- **Live `late-header` mode, rebuilt:** the legend's "BC data unavailable" text renders only in a collapsed row (legend rows start expanded, `MapLegend.tsx:232,291,336`) and the toast uses other text and vanishes after 6 s, so neither is read. The check reads `getSource("opencanopy")?.tiles` (not `isSourceLoaded`, which is true for an errored source), the fill layer's presence and visibility, records that the header request was held and for how long, and records the console's 15 s timeout warning. A green candidate run counts only if the hold applied and the warning appeared (the late path ran); a run on the current deploy must show the layer absent after the header arrived late, which also settles "late, not never" on production.

Next: round 3 (the last), then build and release. Not started in this session (coordinator 2026-11-11: build only if it stays small; it did not).
