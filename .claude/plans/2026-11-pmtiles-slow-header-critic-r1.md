Overall verdict: FAIL (round 1)

# Plan critic, round 1: 2026-11-pmtiles-slow-header.md

Reviewer: plan-reviewer agent (Opus, xhigh), 2026-11-11. Read in full: the plan, `rules/plan-critic-rubric.md`, `.claude/DECISIONS.md`, `src/components/map/DataLayer.tsx` (PmtilesLayers 211-603, DataLayer 1089-1440), `src/contexts/LoadingContext.tsx`, `src/test/pipeline/pmtiles-layers-lifecycle.test.tsx`, `src/test/mocks/maplibre.ts`, `scripts/live/live-checks.mjs`, ARCHITECTURE.md (PMTiles and Releases), ROADMAP Parking Lot, `.claude/handoff.md:51`, MapLibre 6.15.0 `dist/maplibre-gl-dev.mjs`, pmtiles 4.4.0 `dist/esm/index.js`, react-dom 19.2.4 `cjs/react-dom-client.development.js`, the release ledger tail (read only).

The fix itself is right and small: the code reading is correct, MapLibre does deliver the late event, and six instances do recover independently. The FAIL is on Verifiability, where three of the plan's proof claims are false as written: the release guard it names cannot see the fix, test 3's mutant cannot go red, and the `pmtilesFailed` reset has no test. There is also one real ordering race in the recovery's explicit clear. Every fix below keeps the plan Simple.

## Applicability

Project type: public web app (Next.js 16 + MapLibre 6.15, /map), behaviour fix shipped through the release ledger to production.

- **Core 1-10: GATING.**
- **X1 Physical safety: does not fire.** Browser map code; no hardware, heat, power or G-code.
- **X2 Privacy: does not fire.** Touches map layers and an in-memory status map; no personal, client or child data.
- **X3 Evidence: does not fire.** No research, figures or public claims; it changes when data renders, not what any number says.
- **X4 Audience/brand: fires, ADVISORY.** Changes a public notice (the legend's "BC data unavailable", `MapLegend.tsx:173`, and StatusToast); no copy, money or legal terms.
- **X5 Concurrency: fires, ADVISORY.** A 15 s timer, a listener that now outlives it, a 250 ms debounced shared status map, six instances on one source, React passive-effect scheduling.
- **X6 Operability: fires, ADVISORY.** Deployed to production, runs unattended on visitors' devices.
- **X7 Self-modification: does not fire.** No MARVIN gate, hook or skill; `live-checks.mjs` is project release tooling.
- **X8 Performance: fires, ADVISORY.** On an outright header failure the `sourcedata` listener is now kept for the page's life, and `sourcedata` fires per tile load map-wide.

## The brief's five questions, answered directly

**1. Does MapLibre 6.15 fire a later `sourcedata` with `isSourceLoaded` true when a slow header finally arrives? Yes.**
- `VectorTileSource.load` (`maplibre-gl-dev.mjs:29966-29987`) awaits `loadTileJson` with no timeout of its own; the only abort is `setSourceProperty` or removal. `makeRequest` (`:3387-3394`) hands `pmtiles://` to the registered protocol with no timeout either.
- pmtiles 4.4.0's `Protocol` is created with no options (`src/lib/layers/pmtiles-source.ts:17-18`), so its JSON path awaits `getHeader()` only (one 16 KB range request, no metadata fetch) through `FetchSource.getBytes`, a plain `fetch` with no timeout. This also explains why the evidence run shows exactly one archive request.
- On resolution the source fires `data` with `sourceDataType: "metadata"` then `"content"` (`:29977-29981`). `Evented.fire` runs the TileManager's own listeners first (`:3682-3697`), so `_dataHandler` sets `_sourceLoaded = true` (`:39483-39485`) before the event reaches the Map, which re-fires it as `sourcedata` with `sourceId` (`:58253-58255`). `isSourceLoaded` reads `TileManager.loaded()` (`:59981-59988`, `:39023-39031`), which is true for a source no layer uses (`used === false` after any `Style.update`, `:47502-47514`), and by 15 s the style has updated many times.
- So the event arrives however late, and the kept listener can recover. Note the mock cannot prove any of this: `_emit("sourcedata")` is hand-fired, and the test file's own header (`pmtiles-layers-lifecycle.test.tsx:28-30`) says real MapLibre and real PMTiles fetches belong to the live checks. See question 5.

**2. Is the recovery's explicit clear safe against the 250 ms debounce? One ordering yes, the other no.**
- *Error queued just before the clear:* safe. `clearLayerStatus` cancels the pending write (`LoadingContext.tsx:141-149`), as test 8 already proves for the hide path.
- *Clear just before a queued error:* not safe. The error is not queued by `onError`; it is queued by DataLayer's status effect (`DataLayer.tsx:1315-1317`) after React commits `pmtilesFailed = true`. The timeout's `setState` is a default-lane update, and react-dom 19.2.4 flushes passive effects synchronously at the end of a commit only for sync lanes (`react-dom-client.development.js:18323`, `0 !== (pendingEffectsLanes & 3) && flushPendingEffects()`); otherwise they run in a later scheduler task. If the header lands in that gap, the handler's `clearLayerStatus` finds nothing pending and nothing in the map, `setPmtilesFailed(false)` schedules a render, React first flushes the stale effect from the previous commit (visible, failed) which queues `"error"`, and the new render's effect has no else branch. The error lands 250 ms later and stays: "BC data unavailable" over a layer that is drawing, until the visitor toggles it. The window is one task boundary, rare, but it widens exactly on the saturated main thread this plan targets. It cannot be reproduced under `act()` (which flushes effects), so it must be closed by construction (fix in Approach soundness).

**3. Do six instances sharing one source each recover independently? Yes.** Each PmtilesLayers run has its own handler, timer and failure flag, and each DataLayer its own `pmtilesFailed`. The Map dispatches one `sourcedata` to a sliced copy of its listener list (`:3687`), so a handler removing itself mid-dispatch does not starve the others, and `used` is only recomputed in the next render's `Style.update`, so `isSourceLoaded` stays true for all six within that dispatch (the first handler's `addLayer` does not flip it synchronously). Staggered timers (one instance timed out, another not yet) also work: the late one takes the normal path and clears its own timer. Hidden instances add hidden layers and their status stays clear.

**4. Can a never-removed listener leak or double-add? No double-add; the "leak" is bounded and inert, with one dependency to name.**
- Double-add: every `addLayer` is behind `getLayer` (`DataLayer.tsx:286, 314, 363`), and the handler removes itself on the event that adds. The plan says "adds the layers as normal", which implies the self-`off`, but no planned test asserts it (finding V3).
- StrictMode and remount: cleanup (`:447-455`) removes `sourcedataHandler` whenever it is non-null; once the timeout stops nulling it, cleanup still finds it. The discarded StrictMode run's timer is cleared before it fires, so its failure flag never sets. Safe.
- Outright failure (network error, the parked case): six closures stay registered for the page's life (DataLayer never unmounts on /map) and run one string compare per `sourcedata`. Negligible. But `TileManager.loaded()` returns **true** for an errored source (`_sourceErrored`, `:39024`, set at `:38993`), so the kept handler's guard (`isSourceLoaded`) would "recover" a dead source if any `sourcedata` for it ever fired. In 6.15 none does: `metadata`/`content` fire only on success, `TileManager.update` returns early while `!_sourceLoaded` (`:39283`) so no `idle`, and `visibility` needs a layer on the source, which only a successful add creates. Safe today, version-dependent; advisory hardening under Failure modes.

**5. Is the release plan honest about which guard can see the fix? No.** The plan says the late-header case is "the visibility check's own scenario when its hold trips the timeout". The visibility mode holds the header 10 s, chosen to stay under the 15 s timeout (`live-checks.mjs:141-149`, whose comment says a 15 s hold trips the timeout and the layer never attaches on any build). It trips the timeout only when the host is loaded, as in the cited load-16 run. On an idle host no listed guard exercises the late path; on a loaded host the visibility check becomes a non-deterministic discriminator. And none of the listed guards reads the error notice, so the "error clears" half of the Anchor is unobserved live on any host. This project's own precedent for this exact code (`2026-11-datalayer-public-path.md:228-233`) required each agent live check to be run first on known-good to show it can fire. Finding V1.

## Dimension verdicts

### 1. Problem-fit: PASS
Solves the owed item (`handoff.md:51`, ROADMAP `next:`) and the Anchor. The grill-skip line is present with a reason (fix mode). No DECISIONS contradiction: it serves the beta bar's serious-bug definition ("shows wrong or missing data") and changes nothing the Deploy amendment of 2026-11-10 excludes. One premise is inferred, not shown: that production's header *arrived late* rather than never. The cited run cannot show it, because `snapshot()` records `getSource()` (registration), not `isSourceLoaded()` (`live-checks.mjs:88-96`). It is very likely (the route continues after 10 s and the run watched 67 s), and the V1 fix proves it on release 8 for free.

### 2. Approach soundness: CONCERN
Keeping the listener is the right one-line idea. The recovery's clear is in the wrong place (question 2).
**Fix:** move the clear into the status effect so React's commit order guarantees it runs after any error the previous commit queued: a ref records whether the last run saw `pmtilesFailed`, and a third branch clears on the true-to-false transition while visible (`else if (wasFailedRef.current) clearLayerStatus(layer.id)`, then `wasFailedRef.current = pmtilesFailed`). The branch is reachable only by a tile-backed layer recovering, and tile-backed layers have no WFS status writer (`loadData` returns at `DataLayer.tsx:1174`, D10), so test 10 and the "no else branch" rationale are untouched; test 10 becomes the tripwire for an unconditional clear. DataLayer's handler then only sets `pmtilesFailed` false. With that, PmtilesLayers can signal success after *every* successful add (rename `onRecovered` to `onLoaded` if preferred): React bails out when the flag is already false, nothing is written on the on-time path (Anti-goal held), and the per-run "a timeout already reported" flag disappears along with its one blind spot (an add effect that re-runs after a timeout would start a fresh run whose flag is false, so its late add would never clear the error; unreachable on /map today since the memo comparator keys on `layer.id` and layers are registry constants, but no longer a thing to reason about). State in the plan that the clear-before-queued-error ordering is proven by construction, citing react-dom 19.2.4, because no `act()` test can produce it.

### 3. Completeness: CONCERN
Three transitions are unplanned or untested:
- **Recovery while hidden, then shown.** After a hidden recovery, showing the layer must not resurrect the error. That is the only observable proof that `pmtilesFailed` was reset: if the handler only cleared status and never reset the flag, test 1 would still pass (the status effect would not re-run). Planned test 2 stops before the show.
- **Recovery inside the debounce window** (timeout at 15 s, header at 15.1 s, before the error lands). Works via the cancel, but untested.
- **The add failing during recovery.** `addLayersToMap` swallows its own throw and calls `onError` (`:395-398`). If the plan calls `onRecovered` after it unconditionally, the throw path sets failed and then immediately clears it: a blank layer with no notice.
**Fix:** `addLayersToMap` returns whether it succeeded; signal success only on true; add the tests in V2 and V3.

### 4. Right-sizing and reuse: PASS
Simple tier holds: one source file (both components live in `DataLayer.tsx`), its test, docs, and optionally one release-tooling mode. Reuses the latest-ref re-apply, `clearLayerStatus`'s cancel and the existing harness. Proportion is good; no code bodies. One correction: the Out of scope section implies a new Parking Lot line, but ROADMAP:216 already carries "A failed PMTiles header is never retried", which this plan makes partly false (a slow header now recovers). Amend that line rather than adding a second one (see Maintainability).

### 5. Security: PASS
No new surface, inputs or secrets; the listener filters on `e.sourceId`.

### 6. Failure modes: CONCERN
- The add-throws-during-recovery masking (Completeness) is the must-fix here.
- Advisory hardening for question 4's dependency: in the handler, treat the header as resolved only when the source actually holds a tile URL list (`(mapInstance.getSource(sourceId) as { tiles?: string[] } | undefined)?.tiles` is set only by `extend(this, tileJSON)` on success, `:29975`), so a future MapLibre that emits a `sourcedata` for an errored source cannot clear a true error over a dead layer. One line, no test needed beyond test 1 staying green.
- Behaviour on outright failure is unchanged and parked, as the Anti-goals say.

### 7. Change safety: PASS
Single revertable commit; the release sequence names the rollback target; the standing yes is cited correctly (2026-11-10 Deploy amendment, verbatim, relayed) and does not cover a critic FAIL, so this round must be cleared before release. Release 8 (`45c2109`) is green in the ledger, so "against release 8's set" names a real known-good.

### 8. Data integrity and compatibility: PASS
The status map stays single-writer (DataLayer only; grep of `src` finds no other `setLayerStatus` or `clearLayerStatus` caller). No stored artifacts change. The race in question 2 is a status-truth defect, counted under Approach soundness and X5, not twice here.

### 9. Verifiability: FAIL
Three proof claims are false as written, and that is exactly how instruments end up certifying what they never measured.
- **V1, release guard (gating).** See question 5. **Fix (preferred, small):** add a `late-header` mode to `live-checks.mjs`: open `/map#layers=cutblocks` (visible from load), hold the first archive request 20 s so the 15 s timeout trips on any host, then poll about 75 s recording the fill layer's visibility, `map.isSourceLoaded("opencanopy")`, and whether the "BC data unavailable" notice is present (`MapLegend.tsx:173`; the toast auto-dismisses at 6 s, so read the legend). Run it on release 8 first: it must fail with `isSourceLoaded` true and the fill absent, which shows the check can fire *and* proves the late-arrival diagnosis. On the candidate, pass means fill `visible` and no notice once the source is loaded. Adding a mode leaves the `visibility` mode's baselines intact (`live-checks.mjs:36-37`). **Fallback, if the coordinator rules it not small:** rewrite the release line to say plainly that no live guard exercises the late path, that the fix is proven by mocked unit tests only, and that the real-MapLibre half stays unverified; the visibility parenthetical goes.
- **V2, test 3 cannot kill its mutant.** A WFS-only fixture never mounts PmtilesLayers (`DataLayer.tsx:1406`), so no recovery signal can reach it, and a tile-backed layer has no other status writer, so "clear status on every `sourcedata`" is unobservable in the planned fixture. **Fix:** replace test 3 with (a) late recovery where the mock's `addLayer` throws for this layer: status stays `error` after +300 ms (mutant: signal success regardless of the add's result, red); and, under the Approach fix, rely on existing test 10 as the tripwire for an unconditional clear (mutant: drop the ref condition, test 10's `loading` wiped, red).
- **V3, two halves of the change have no test.** (a) The `pmtilesFailed` reset: add to test 2 a show after recovery, +300 ms, no status (mutant: handler clears status but does not reset the flag, red). (b) The handler's self-removal after a late add: after recovery assert `_listenerCount("sourcedata") === 0` (only PmtilesLayers registers `sourcedata` in `src`) and that a second `sourcedata` adds nothing and calls no setter (mutant: no `off` on the late path, red).
- Also: test 1 should advance 300 ms after the recovery and assert the status is still absent; add the inside-the-window case (advance 15 000, +100, recover, +300: no status, fill present); test 4 should unmount *after* the timeout fires (the new state, a live listener past 15 s), since unmounting before it is already covered by today's cleanup.
- Numbering: the file's tests are already numbered 1-11, 20, 21, and code comments cite them ("test 10 is the tripwire", `:1313`). Number the new ones 22 onward.

### 10. Maintainability: CONCERN
Four places will say the opposite of the code after this ships, and the plan lists no docs:
- ARCHITECTURE.md:116-118, "one header timeout fails all six": add that a late header recovers all six and clears the notice; an outright failure still does not.
- ROADMAP:216 Parking Lot: narrow the existing line to an outright header failure; do not add a duplicate.
- `DataLayer.tsx:1308-1309` status-effect comment ("the source is still dead") and the timeout's `console.warn` at `:435` ("failed to load within 15s"): both become "not loaded within 15 s, still listening".
- `live-checks.mjs:143-145` comment (holding 15 s means the layer never attaches on any build): false after the fix. If V1 adds a mode, fix the comment in the same edit; if not, leave it and note it in the hand-off so the next guard author is not misled.
Also keep `onRecovered`/`onLoaded` stable (a `useCallback` over `layer.id` and the stable setters), because the add effect deliberately excludes its callbacks from its deps (`:456`) and captures them once.

### X4 Audience (ADVISORY): PASS
The visible change is a notice that now clears when data arrives, which is more honest. Inversion (b) below names the one product question.

### X5 Concurrency (ADVISORY): CONCERN
The clear-before-queued-error race (question 2). Fix as in Approach soundness. Must-fix despite advisory, since it leaves a false error over a working map.

### X6 Operability (ADVISORY): PASS
`pipelineLog` covers debug sessions. Note for when the G1 OPS monitoring lands: count timeouts and late recoveries in the field. That count is the only evidence that would justify (or kill) the parked header retry.

### X8 Performance (ADVISORY): PASS
Six inert closures on outright failure, one string compare per `sourcedata`. Negligible.

## Stress tests

**Pre-mortem (three months out, it failed):**
1. *A false error over a working map.* A beta tester on a mid-range phone reports "BC data unavailable" next to a layer that is clearly drawn. It never reproduces on demand. Cause: the header landed between React's commit of the failure and its passive-effect flush, so the explicit clear ran before the effect queued the error. We should have seen it from react-dom's lane-gated flush at commit end. This is the type-specific worst case for this plan: the notice and the map disagree, which the beta bar counts as a serious bug.
2. *Shipped green, never observed working.* Every live guard ran on an idle host, the 10 s visibility hold never tripped the timeout, and nothing read the notice. The fix was "verified" by a mock that fires `sourcedata` by hand. If a real-world difference existed (an extension, a CDN quirk, a MapLibre minor bump changing when `loaded()` is true), nothing would have shown it.
3. *A silent blank.* During a late recovery `addLayer` threw (style replaced, symbol anchor gone), `onError` set failed, the success signal cleared it a microsecond later, and the layer stayed blank with no notice: missing data shown as fine.

**Load-bearing assumptions:**
1. MapLibre fires `sourcedata` with `isSourceLoaded` true whenever the header resolves, however late. *High confidence* from code (question 1). Unverified live. Resolved by V1.
2. Production's failure was a late header, not one that never came. *High but inferred*; the instrument cannot record it. Resolved by V1's release-8 run.
3. No `sourcedata` ever fires for an errored source, so the kept listener cannot "recover" a dead one even though `isSourceLoaded` is true on error. *Medium-high*, true in 6.15 by reading, version-dependent. Hardening in Failure modes.
4. Tile-backed layers have no status writer besides the PMTiles path. *High* (`:1174`, grep). This is what makes the Approach fix safe and test 3's WFS framing moot.

**Inversion:**
- (a) *Retry the header (remove and re-add the shared source)* wins if outright failures, not late arrivals, dominate in the field. Nobody knows the ratio; X6's counter would tell. Not shown true today.
- (b) *Report "loading", not "error", past 15 s* wins if a visitor reading "BC data unavailable" at 15 s leaves before the layers arrive at 20 s. Beta bar (c) wants data within about 10 s on 4G, so a 15 s+ header is already below the bar, and the Anchor accepts the interim notice. Not already true, but it is a product question for Lee if late recoveries prove common.
- (c) *Clear inside the status effect instead of in the handler* wins whenever the header can land between a commit and its passive flush. That condition is already true in react-dom 19.2.4, which is why it is a must-fix.

## Close

The diagnosis is right and the one-line change works with the MapLibre and pmtiles actually installed: the late header does arrive as a `sourcedata`, all six instances recover on their own, and the kept listener neither double-adds nor leaks in any way that matters. The plan fails on proof, not idea. Its named live guard cannot see the fix on a normal host and never reads the notice, test 3's mutant is unkillable, and the flag reset and the late self-removal have no test. Separately, the explicit clear in the recovery handler races React's deferred passive effects and can leave a sticky false error, which is fixed by letting the status effect own the clear. All fixes are small and keep the plan Simple.

**Must-fix, in priority order:**
1. **V1:** add the `late-header` live mode (20 s hold, visible from load, reads fill, `isSourceLoaded` and the legend notice), shown failing on release 8 and passing on the candidate; or, if ruled not small, state plainly that no live guard sees the fix and drop the visibility claim.
2. **Race:** move the clear into the status effect (true-to-false transition while visible, via a ref); the handler only resets `pmtilesFailed`; signal success after every successful add; cite react-dom 19.2.4 for the by-construction ordering.
3. **Masking:** `addLayersToMap` returns success; signal only on true; test it with a throwing `addLayer` (replaces test 3).
4. **Tests:** show-after-hidden-recovery (guards the flag reset); listener count 0 and no second add after late recovery; +300 ms after every recovery; the inside-the-debounce-window case; test 4 unmounts after the timeout; new tests numbered 22 onward.
5. **Docs:** ARCHITECTURE.md:116-118; amend ROADMAP:216 rather than adding a line; the status-effect comment and `console.warn` wording in `DataLayer.tsx`; the `live-checks.mjs:143-145` comment if that file is edited.

Advisory: the `tiles`-present guard in the handler; a stable success callback; a field counter for timeouts and late recoveries once OPS monitoring lands; add `year` to the guard list since the late add re-applies filters.
