# Small routed fixes: PDF methodology pointer, audit:live non-public tests, wfs-client cleanup race

*Plan, 2026-11-10. Session marvin/canopy (driven by marvin session-f1a7d3), brief item 4. Tier: Simple (three files of code, one test file each).*

## Intent (grilled)

Grill skipped: fix mode on items routed by the 2026-09-01 refresh and listed in the hand-off's Owed ("Small routed fixes (any session)") and the 2026-11-10 brief, item 4. Anchor: the calculator PDF points at a methodology page that exists; the production monitor stops failing by construction on layers the public cannot see; the WFS client stops dropping a newer request's bookkeeping. Anti-goals: no change to any number, layer or visual; no audit:live retarget beyond the two non-public tests (the other four failures belong to M1a batch 0 and to item 3's release).

**Already done, removed from scope:** the explicit devDependencies (`@mapbox/vector-tile`, `pbf`, `@types/geojson`) are in `devDependencies` since 4bd41f0 (2026-11-01); verified in package.json today.

## 1. PDF methodology pointer (public copy)

`src/lib/export/pdf-generator.ts:287` prints "Approximate estimate &mdash; may overestimate by up to ~20% (see methodology at opencanopy.ca). Not audited carbon accounting." opencanopy.ca has no methodology route (`src/app/` holds `map/`, `privacy/` and the landing page only). The methodology lives in the repo's `METHODOLOGY.md`, public at https://github.com/ToastedandTripping/opencanopy/blob/main/METHODOLOGY.md (HTTP 200 unauthenticated, checked 2026-11-10). The line also carries an em dash, which the copy rules forbid on every surface (`~/marvin/knowledge/email-voice.md`, Part 1, rule 14).

Draft (to be revised, see below): "This is an approximate estimate and may run up to about 20% high. The method is published at github.com/ToastedandTripping/opencanopy/blob/main/METHODOLOGY.md, and it is not audited carbon accounting."

The "up to about 20% high" figure is the existing claim, unchanged in substance (the calculator's own one-sided band, ROADMAP 2026-07-16 entry); no number changes. Process: a Fable reviser pass at medium effort on the sentence (brief: creative elements checked by Fable; small piece), then the orchestrator re-runs the Part 1 tells checklist on what comes back, before it is committed. A test pins that the PDF footer names the METHODOLOGY.md URL and contains no em dash (`—` or `&mdash;`); revert proof: today's line goes red on both assertions.

Not a visual release (one sentence of PDF text), so no phone check is owed; noted for Lee's next PDF export anyway.

## 2. audit:live: retarget the two non-public tests

`e2e/monitoring/live-health.spec.ts:187` asserts `tenure-cutblocks` (not in `PUBLIC_LAYER_IDS`) and `:243` asserts `fish-streams` (WFS-only, not public), so both fail by construction (ledger genesis 2026-11-02, release 4 evidence).

- `:187` retargets to the public `cutblocks` layer: enable it through the URL hash (`#layers=cutblocks`) rather than forcing `setLayoutProperty`, fly to the same Prince George view at z11, assert rendered `layer-cutblocks-tiles-fill` features > 0.
- `:243` is deleted: the WFS proxy's CQL path it guarded is covered by `:323` ("D3: cutblocks WFS proxy returns features via cqlFilter fix", which passes), and no public layer is WFS-only. The comment block above it is updated.

Both stay production-only tests (playwright.live.config.ts). Proof they can fire: the retargeted `:187` is run against production after item 3's release; whether it passes depends on item 3 (its flyTo throws today), so its first run is recorded, and a forced-red run (the layer id misspelled in a scratch copy) shows it can fail. Hand-off: M1a batch 0's "retarget the two audit:live tests" item is closed by this; its other audit:live work (the headless render checks `:130`, `:152`, `:283` and the stale `:118` parser) stays with M1a.

## 3. wfs-client: cleanup only what this request owns

`src/lib/data/wfs-client.ts:137-143`: the `finally` of each debounced fetch does `pending.delete(key)`, `debounceTimers.delete(layerId)`, `controllers.delete(layerId)` unconditionally. If a newer request for the same layer has already replaced the timer or the controller, the older request's `finally` deletes the newer one's entries, so a third request cannot abort the second (its controller is gone) and the second's timer can no longer be cleared. Fix: delete only entries that are still this request's own (`if (controllers.get(layerId) === controller)`, the same identity check for the timer handle and for `pending.get(key) === promise`). Affects WFS-only layers, none public (refresh finding, routed as non-public).

Test (`src/lib/data/wfs-client` test file, fake timers, mocked fetch): request A for a layer starts fetching; request B for the same layer is issued and starts; A settles; then request C is issued: B's fetch must receive an abort (its controller survived A's `finally`). Revert proof: the unconditional deletes go red.

## Gates

Plan-reviewer round 1 at xhigh (DECISIONS 2026-10-07, max three). Fable reviser on the copy (medium). Ted implements; Razor reviews; no Jen (no visual change). Checks on the tip: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Release

After item 3's release closes (one release in flight at a time). Lane M, kind `behaviour`, ARCHITECTURE.md Releases; approval: the full verbatim 2026-11-10 Deploy amendment with its relayed attribution; first commit carries item 3's post-release record and ROADMAP shipped entry. Guards: identity; console against the then-current baseline; `audit:live` (the retargeted `:187` recorded; no previously passing test fails); `attach`, `year`, `visibility`, `interact` re-run green. `/notify` at push; on a halt, tell Lee and `/notify`.

## Pre-mortem

1. The retargeted `:187` fails for item 3's reason (flyTo throws), and gets read as a regression. Mitigation: it runs after item 3 is live; if item 3 is still held, the test is recorded, not judged.
2. The new footer sentence reads machine-made or overclaims. Mitigation: Fable reviser plus the Part 1 checklist; the figure is the existing one.
3. The identity checks in wfs-client leave a stale entry behind when the same request legitimately owns it. Mitigation: the test also asserts the maps are empty after the last request settles.
