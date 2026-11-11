Overall verdict: CONCERN (round 3)

# Plan critic, round 3: Small routed fixes (PDF methodology pointer, audit:live non-public tests, wfs-client cleanup race)

Plan: `.claude/plans/2026-11-small-routed-fixes.md` as committed at 9a5596a (HEAD). Rounds 1 and 2: FAIL. Reviewer: plan-reviewer agent (Opus, xhigh), 2026-11-11 02:46 UTC (2026-11-10 Pacific). Rubric: `rules/plan-critic-rubric.md` v2. DECISIONS read at `origin/main@4de59d7` (29 entries, working tree identical, `decisions-check.sh` fetched 2026-11-10). Code under review is unchanged since round 2: `git diff --stat 5531af6 9a5596a` touches only the plan, the r2 file, the hand-off, the ROADMAP and the react-map-gl relay's files.

**Nothing gates.** Round 2's one gating defect is folded, and the fold holds when tested. Superseded requests now reject with `DOMException("Superseded", "AbortError")`, the one shape `DataLayer.tsx:1258` ignores. The captured-reject mechanism, built as the plan describes it, cannot reject a newer promise. Every planned row turns red on exactly the mutant it claims. All of this was proven in a fresh happy-dom harness against the real module, below. The remaining findings are non-gating must-fixes. The plan author folds them, and they need no fourth round. Two are new and worth doing: none of the new wfs tests checks that the surviving request resolves, and two documents outside the plan still say M1a owns the retarget. A third finding is something earlier rounds missed: the plan is Standard tier, not Simple, so it owes a `## Review Focus` section.

## Applicability

Project type: a public web app (Next.js static export on Netlify) with a client-generated PDF, a production monitor (Playwright against opencanopy.ca, read-only), and a client data-fetch module with shared timer and abort state.

| Dimension | Fires | Tag | Why |
|---|---|---|---|
| Core 1-10 | always | GATING | |
| X1 Physical safety | no | | No hardware or hazardous output. |
| X2 Privacy | no | | The PDF is built client-side from selection statistics. No change holds or handles personal, health, child or client data. |
| X3 Evidence & source integrity | yes | GATING | The PDF footer is a public factual claim about the calculator's accuracy, and the plan re-authors it. |
| X4 Audience, brand & money | yes | ADVISORY | Public copy on a printed artifact. No money figure, legal term or signature changes. |
| X5 Concurrency | yes | ADVISORY | wfs-client is module-level shared state with timers, aborts and re-entrant calls. |
| X6 Operability | yes | ADVISORY | Ships a release and changes the production monitor that later releases read as blocking. |
| X7 Self-modification | no | | No change to MARVIN's gates, hooks or skills. `audit:live` is this project's own monitor. |
| X8 Dependencies | no | | Nothing added or moved. The devDependencies were verified in round 1. |

## Round-2 must-fixes: folded?

| # | Must-fix (r2) | Folded | Note |
|---|---|---|---|
| 1 | `DOMException` AbortError, S4 type, in-flight row, DataLayer test, mechanism named, pre-mortem 3 | Yes | Verified by harness (below). The new rows never assert that the survivor resolves (Verifiability). |
| 2 | Exact `owed_remove` patterns; M1a bullet kept and corrected through the writer | Yes | Each pattern matches exactly one bullet at HEAD (below). |
| 3 | Panel `:609`/`:632` routed by name; 20% routing at `ROADMAP.md:151`; footer pinned to an exported band factor | Yes, with residue | Line 15 of the plan still says the 20% sourcing is "routed there in the hand-off". The `:632` quote is slightly wrong (Maintainability, X3). |
| 4 | Proxy 502 is `unverified`; both new live checks green before item 4's push | Yes | A CQL regression also returns 502 (Failure modes). The `:323` sentence was not extended. |
| 5 | `STREAM_ORDER >= 3`, literal bbox and timeout, S5 cells and over-guard mutant, S1/S4 setups, forced reds de-duplicated, PDF test path | Yes | Forced red (d) cannot be run as written against production (Verifiability). |
| 6 | `src/lib/site-links.ts`; spec `:224-241`; `test.skip()` handed to M1a | Mostly | The Docs section names `:224-241`, but item 2's bullet (plan line 36) still says "`:286` area". |
| 7 | X4 copy: one hedge per sentence, no semicolon join, CO&#8322;, `color:inherit` | Yes | Checked against Part 1 (X4). |

Round 2's Completeness note on the loading indicator (its dimension 3) was not in its must-fix list. It is still unaddressed, and it is now verified (Completeness).

## What was verified, and how

**Harness.** `.../scratchpad/race/r3/` (this session's scratchpad), vitest 4.1.12, **happy-dom** (the repo's environment; round 2 ran under node). `gen.mjs` builds each variant from today's `src/lib/data/wfs-client.ts` by exact string replacement. `plan3` is the mechanism exactly as the plan words it. Each pending entry is `{ promise, reject }`, with `reject` captured from the executor and stored by `pending.set` after the constructor returns. `rejectPendingForLayer` walks `pending`, attaches the existing no-op catch, calls `entry.reject(new DOMException("Superseded", "AbortError"))` and deletes under identity. The `finally` deletes are identity-guarded. The mutants are `typemut` (rejects `DataFetchError("abort")`), `mtimer`/`mctrl`/`mpend` (one guard reverted each), `mreject` (rejection reverted), `movergard` (finally never deletes pending), `nocatch` (no-op catch dropped), and `sep-selfreject`, a two-map misreading in which the reject goes into a separate map at the top of the executor and `rejectPendingForLayer` walks that map. Each scenario also records whether the **surviving** (newest) request resolves. Results are in `r3-results.txt`.

| Variant | S1 fetches | S2 B aborted sync | S3 a3===a2 | S4 call 1 | In-flight A | S5 fetches | Survivor resolves (S1, S2, S3, S4, IF) |
|---|---|---|---|---|---|---|---|
| today | 3 (red) | false (red) | false (red) | unsettled (red) | AbortError | 2 | S3's A' rejects (the bug) |
| plan3 | 2 | true | true | AbortError | AbortError | 2 | all resolve |
| typemut | 2 | true | true | **DataFetchError** | **DataFetchError** | 2 | all resolve |
| mtimer | **3** | **false** | true | AbortError | AbortError | 2 | all resolve |
| mctrl | 2 | **false** | true | AbortError | AbortError | 2 | all resolve |
| mpend | 2 | true | **false** | AbortError | AbortError | 2 | S3's A' unsettled |
| mreject | 2 | true | true | **unsettled** | AbortError | 2 | all resolve |
| movergard | 2 | true | true | AbortError | AbortError | **1** | all resolve |
| sep-selfreject | 2 | true | true | AbortError | AbortError | 2 | **every survivor rejects AbortError** |

- Every planned row turns red on exactly the mutant the plan names for it, and is green on `plan3`.
- **`sep-selfreject` passes all six planned rows.** Every surviving request rejects with an AbortError, which DataLayer swallows silently: no data, no error, status `ok`. Only the existing supersede test sees it (`wfs-client-fetch.test.ts:143-193`, its `await second` at `:191`).
- Existing suite (`wfs-client-fetch.test.ts`, 11 tests) per variant:
  - `plan3`: 11/11, exit 0.
  - `typemut`: 11/11, exit 0. The suite cannot see the error type, as round 2 found.
  - `sep-selfreject`: 1 failed (the supersede test), exit 1.
  - `nocatch`: 11/11, but vitest reports an unhandled rejection (`AbortError: Superseded`) and exits 1. `npm test` would catch a dropped no-op catch.
- **The DataLayer probe, re-run at this tree** (`.../race/r3/dl/`, round 2's probe, happy-dom). `fetchLayerData` rejecting with `DataFetchError("abort")` leaves status `error` with 4 `Failed to load layer` errors. Rejecting with `DOMException("Superseded","AbortError")` leaves status **`ok`** with 0 errors.

**Can a rejected entry's reject fire on a newer promise? No, in the form the plan describes.**
- `rejectPendingForLayer` runs only inside a new promise's executor (`wfs-client.ts:93-100`). That is before the new promise's `pending.set` (`:149`), so the newest entry is never in the map it walks.
- A same-key call never reaches the executor, because of the dedupe at `:90-91`.
- Each `reject` is bound to its own promise, and settling it a second time does nothing.
- The adversarial ordering confirms it (NEWER scenario):
  - Setup: A (key K1) is fetching and ignores abort. B (K2) supersedes it. C (K1) is issued during B's debounce. A's response then lands after C has registered under K1.
  - Under `plan3`, A and B reject with AbortError and C resolves.
  - A's `finally` leaves C's entry alone, because of the identity guard.
  - A's late data is cached under K1, so a fourth K1 call is a cache hit, a new resolved promise rather than C. That is the parked cache-hit lead, and today's code does the same.
- The only failure shape is the two-map misreading above. The plan's sentence ("each pending entry stores the promise's reject beside it") points to the safe form, but does not rule out the unsafe one.

**Does rejecting before the fetch's own abort change DataLayer's loading state or the timeline's `waitForRender`?**
- *In-flight case: no observable change.* The newer `loadData` calls `setLoading(true)` and `setLayerLoading` (`DataLayer.tsx:1245-1246`) before it calls `fetchLayerData` (`:1249`), and the supersede happens inside that call. Today the old call's AbortError arrives a few microtasks later, from the aborted fetch. Under the fix it arrives one microtask after the synchronous reject. Either way the old call's `finally` (`:1266-1271`) clears loading in the same window, after the newer call started and long before it ends.
- *Debounced-away case: yes, a new behaviour.* Today the old call never settles, so the spinner and the `loading` status last until the newer call finishes. Under the fix the old call settles at once, and its `finally` clears the local flag and moves the status from `loading` to `ok` (`LoadingContext.tsx:154-170`). The probe above shows `ok` while the newer request is still in its 800 ms debounce and fetch. `MapLegend`, `LoadingBar` and `StatusToast` read that status. Only WFS-only layers reach here (`DataLayer.tsx:1174`: `hasTileSource` returns), and those are fish-streams and species-at-risk, neither in `PUBLIC_LAYER_IDS` (`registry.ts:893-901`).
- *`waitForRender`: no change.* It waits for the map's `idle` event (`page.tsx:294-311`) and never reads loading state. No WFS-only layer has a `timelineField`: those are on cutblocks, tenure-cutblocks and fire-history (`registry.ts:251, :305, :349`), all tile-backed.

**The in-flight row: today really does produce AbortError there.**
- Under `today`, A rejects `DOMException/AbortError` ("aborted") when the mock rejects as a browser fetch does on abort.
- The row is a type pin, not proof of the fix. The plan says so honestly: Today and Fixed both read AbortError, and the setup paragraph says the row "guards the type against a future change".
- Its only red mutant is a type change (`typemut`). That mutant is not named in the revert protocol, which lists only the identity reverts and the rejection revert, and the row is green under all of those.

**The footer against the band.**
- `calculator.ts:296` is `return { rounded, bandLow: roundToSigFigs(rounded * 0.8, 3) };`, and the PDF prints that band at `pdf-generator.ts:250`.
- `Math.round((1 - 0.8) * 100)` is 20 (the float 19.999999999999996 rounds correctly).
- "The true CO&#8322; figure may be up to 20% lower than the estimate in this report" says what the band says. Same digits, same direction.
- `carbon-presentation.test.ts:53` independently pins the literal 0.8, so moving the factor stays a visible public-number change.
- `pdf-generator.ts:2` imports from `@/lib/carbon`, whose `index.ts` re-exports by explicit name. `BAND_LOW_FACTOR` has to be added there, or imported from `@/lib/carbon/calculator`. `tsc` would flag this; it is a nit.

**The fish-streams request against the proxy.**
- `wfs-proxy.ts:105-109` configures fish-streams with `cqlFilter: "STREAM_ORDER >= 3"`. It has no `PROPERTY_WHITELIST` entry (`:352-393`), so `STREAM_ORDER` reaches the response, and `zoom=10` caps the result at 5000 features (`:699`).
- The literal bbox `-125.4,49.95,-125.2,50.05` projects through the proxy's own `wgs84ToBcAlbers` to Albers 1043064,548405 to 1057293,559669, a 14.2 x 11.3 km box. That box lies entirely inside the box proven live on 2026-06-10 (1035926,542789 to 1071379,576537, `lib/wfs-bbox-url.ts:10-13`), computed in `.../race/r3/albers2.js`.
- The CQL is `BBOX(GEOMETRY,...) AND (STREAM_ORDER >= 3)` (`wfs-bbox-url.ts:46-49`), so an ocean bbox returns a 200 with 0 features. That makes forced red (c) sound.
- **A 502 is not only an upstream outage.** `fetchWithRetry` throws on any WFS `ExceptionReport` (`wfs-proxy.ts:439-446`), and the handler turns every throw into a 502 "Data source temporarily unavailable" (`:810`). A malformed CQL, the exact D3 regression this check guards, therefore reads as 502. Not run against production, per the brief.

**`owed_remove` patterns at HEAD 9a5596a.**
- `update-handoff.mjs:373-391` matches by case-sensitive substring, deletes whole bullet blocks, and refuses when a pattern matches nothing.
- `**Small routed fixes**` matches line 19 only. `**Next (brief 2026-11-10, item 4):**` matches line 59 only. `**M1a after item 3 ships:**` matches line 55 only. Each is a single-line bullet (`grep -nF`).
- No pattern over-matches. If item 3's post-release records rewrite those bullets first, the writer refuses rather than deleting the wrong thing.

**A class sweep for the "M1a owns the retarget" claim** (`git grep` for `live-health.spec.ts:` and the two test titles, excluding critic files). Besides the hand-off and the M1a plan, which the plan already amends, two live documents carry the claim:
- `ROADMAP.md:135` (Parking Lot, "Deferred from P0b": "Retargeting the two `audit:live` tests ... M1a batch 0 owns it; until then `audit:live` cannot read green").
- `research/ui-perf-audit-2026-10-02/TRACEABILITY.md:188` (R0.3, `open`, owner M1a).

These are historical, and correct as they stand: `ARCHITECTURE.md:275`, the P0b plan, the datalayer plan, superseded plans, and `.refresh/`.

## Core dimensions

**1. Problem-fit: PASS.** The anchor is met on all three counts:
- The PDF points at a page that exists (`METHODOLOGY.md` is on `origin/main`, and its "Known Limitations" `:73` covers the band), and nothing in the footer contradicts its own band.
- The monitor's two by-construction failures become checks the public surface can pass.
- The bookkeeping race is closed.

The grill-skip line is present. No DECISIONS entry is contradicted:
- The footer keeps the 20% under "A public number must be reproducible ...", now pinned to the band factor.
- The standing yes of 2026-11-10 holds at this round's CONCERN. Its exclusion covers "anything at critic FAIL ... or changing a public number", and the footer's digits and direction are the band's own.
- The release is serialized after item 3 ("Releases go one relay at a time ...").

**2. Approach soundness: PASS.** The identity guards, the `DOMException` type and the captured reject are all correct. The harness matrix and the NEWER ordering prove it. The retargeted `:187` and the direct proxy request are the shapes R4-02 prescribed.

**3. Completeness: CONCERN.** Two gaps:
- **Debounced-away loading state.** The fix makes the old call settle, so its `finally` clears the spinner and moves the layer status from `loading` to `ok` while the newer request is still pending. This is verified (probe status `ok`). Round 2 raised it, and the plan neither accepts nor parks it. It is harmless today (non-public layers), and it becomes visible the day Q1 surfaces a WFS-only layer. Fix: one line in item 3, "accepted for WFS-only, non-public layers; parked beside the cache-hit lead for Q1".
- **The `:323` cutblocks request** has the same 502 exposure as the new fish-streams request, and the plan's 502 sentence covers only fish-streams. Fix: one clause, "the same reading applies to `:323`".

**4. Right-sizing & reuse: CONCERN (tier).**
- The plan says "Tier: Simple", but relay-load's table puts 1-3 files at Simple and 4-10 at Standard. This plan changes at least nine code and test files: `pdf-generator.ts`, `pdf-generator.test.ts`, `calculator.ts`, `carbon/index.ts` (for the export), new `site-links.ts`, `Footer.tsx`, `live-health.spec.ts`, `wfs-client.ts`, `wfs-client-fetch.test.ts`, `pmtiles-layers-lifecycle.test.tsx`. Then three docs on top.
- It is a Standard plan, which carries a `## Review Focus` section (Verifiability). Relay-load would reclassify it anyway, but the plan should say what it is.
- The work itself is right-sized. It reuses the existing harnesses (`captureReportHtml`, the fake-timer wfs harness, the lifecycle DataLayer harness), uses the landing footer's URL, and parks the cache-hit lead. No batch rule applies at Standard.

Fix: relabel as Standard and add Review Focus.

**5. Security: PASS.** A constant URL with no user input, read-only GETs against production, and a client module unreachable from public layers. The footer `<a>` opens in the print window the report already uses (`pdf-generator.ts:299-310`).

**6. Failure modes: CONCERN.**
- **A 502 can be our own defect.** The plan records "a proxy 502 or a timeout" as `unverified`. But a CQL regression in the proxy (the D3 failure) returns the same 502, because ExceptionReports are thrown and mapped to 502 (`wfs-proxy.ts:439-446, :810`).
- This does not fail open. An `unverified` halt closes only on a green for that commit (ARCHITECTURE.md "Halts and their doors"), and a persistent defect never goes green.
- It does mislabel a real defect as the province's server being down, and nothing tells the session when to stop waiting.
- Fix: "a 502 that persists on a re-run at least 15 minutes later is recorded red". The same rule covers `:323`.

**7. Change safety: PASS.**
- Each change is a revertible commit.
- The release waits for item 3's release to close, and runs under the verbatim 2026-11-10 standing yes with its relayed attribution.
- Any change to the percentage goes to Lee.
- Both new live checks run green against production before item 4's push.

**8. Data integrity & compatibility: PASS.** No stored data. PDFs already exported keep the dead pointer, which is unavoidable. The METHODOLOGY URL is single-sourced in `site-links.ts`, and the git sweep found no other copy (`Footer.tsx:29` is the only other occurrence). The band factor is single-sourced.

**9. Verifiability: CONCERN.** Every planned row discriminates (matrix above). What remains:
- **Survivors are never asserted.** No new row checks that the newest request resolves with the mock's data. A self-rejecting implementation (`sep-selfreject`) passes all six new rows and the DataLayer-level test, which mocks `fetchLayerData`. Only the old supersede test catches it. The consequence would be a WFS-only layer that goes silently blank after the first pan, with no error and status `ok`. Fix: add "and the surviving request resolves with the mocked data" to S1 and S4, and to the in-flight row. All three assertions are red on `sep-selfreject` and green on `plan3`.
- **Name the remaining mutants.** The in-flight row's red mutant is a rejection of another type (`DataFetchError("abort")`: red). The DataLayer-level test's red proof is the same rejection mocked through the DataLayer harness (status `error`, 4 console errors, shown in the probe above). Both belong in the revert record that Ted produces, the way S5's over-guard is named. A guard counts once seen red, and today both reds rest on the critic's harness.
- **Forced red (d) cannot be run as written.** The production proxy always applies `STREAM_ORDER >= 3` server-side, and `/api/wfs` takes only `layer`, `bbox` and `zoom`, so no client request can drop the filter. Fix: name the mechanism. Either a direct GET to the openmaps WFS endpoint (`wfs-proxy.ts:106-107`) for the same Albers box with no `STREAM_ORDER` term, fed through the same assertion, or the proxy run locally under `netlify dev` with the filter removed.
- **Review Focus is missing** on what is a Standard plan (rubric dimension 9: CONCERN). Suggested items, each with its owner:
  1. The surviving request resolves (item 3: S1, S4, in-flight).
  2. The debounced-away status flip to `ok` is accepted or tested (item 3).
  3. A persistent 502 is read as red (item 2).
  4. The hand-off patterns still match when the writer runs after item 3's records (Docs).
  5. The footer `<a>` keeps the grey footer colour in print (item 1, a check of the generated HTML).

**10. Maintainability: CONCERN.**
- **The class sweep is incomplete.** `ROADMAP.md:135` (Parking Lot: "M1a batch 0 owns it; until then `audit:live` cannot read green") and `research/ui-perf-audit-2026-10-02/TRACEABILITY.md:188` (R0.3, open, owner M1a) both go false when item 4 lands. A later session reading either could re-plan the retarget, or discount a real `audit:live` red as "known by construction". Fix: strike or annotate both in item 4's docs step.
- **The plan contradicts itself in four places.**
  - Line 15 says the 20% sourcing is "routed there in the hand-off". Lines 28 and 77 route it, correctly, to `ROADMAP.md:151`.
  - Line 36 says "the D3 block comment (`:286` area)", while line 77 says `:224-241`.
  - Line 3 ("revised after critic round 1") and the Gates line ("r1 FAIL folded here") do not mention r2.
  - Fix: correct all four.
- **Line numbers that item 4 itself moves.** The corrected M1a bullet and the M1a plan amendment cite spec `:283` and `:313`, which follow the edited `:187` and `:243` tests and will shift when item 4 rewrites them. `:118`, `:130`, `:152` and `:177` sit above `:187`. Fix: cite those tests by title (for example "the old-growth-250 PMTiles test's `test.skip()`"), or recompute the numbers after the spec edit.

## Conditional dimensions

**X3 Evidence & source integrity [GATING]: PASS.**
- The footer claim is the band's own claim, printed on the same page. It is pinned to the exported factor, and the test pins the sentence to the factor, so the two cannot drift.
- The 20% is labelled inherited and routed by name to K (DECISIONS 2026-10-23) at `ROADMAP.md:151`, with the pool-comparison point. The wording at plan line 28 ("it compares against the pool-based model's stated bias") is loose. When the Parking Lot line is written, say that `calculator.ts:22-25` and `METHODOLOGY.md:73` compare total-ecosystem carbon with above-ground biomass alone, which is a difference between carbon pools, not an error bound.
- The routed panel note misquotes `:632`. It says "may overestimate by 10–20% compared to more conservative figures", not "up to ~20%", so quote it exactly in the Parking Lot.
- The stale "routed there in the hand-off" is counted under Maintainability.

**X4 Audience, brand & money [ADVISORY]: PASS.**

The final text was checked against Part 1 of `~/marvin/knowledge/email-voice.md`: Rhythm at lines 22-31, Sentence load at 33-44, Honesty at 46-51, and the tells checklist at 65-92, items 3, 8a, 9 and 14.
- No em dashes in either line.
- One hedge per sentence ("may", with "up to" as the bound), and one number in the whole footer.
- The second sentence joins the disclaimer and the pointer with an ordinary connector, and stays within one fact plus one supporting detail.
- The honesty check passes: the pointer resolves to a file that describes the method and its limitation.
- `CO&#8322;` matches `pdf-generator.ts:249`, `color:inherit` is specified, and `:289` loses its em dash.

Optional nits:
- "estimate" ends sentence one and opens sentence two, which reads slightly mechanical. "It is not audited carbon accounting, ..." is shorter, if "it" reads clearly in context.
- The plan records the Part 1 re-run after the Fable pass, but not after the r2 corrections. The orchestrator re-runs it on the text that ships (this round's check stands in only for the plan text).
- The routing note's "six em dashes (`:493`-`:623`)" is seven dashes on six lines (`:623` carries two).

**X5 Concurrency & re-entrancy [ADVISORY]: CONCERN.**
- The mechanism is sound in the single-entry form (verified, including the NEWER ordering).
- Make the safe form explicit in item 3, so the two-map misreading cannot happen:
  - The reject is stored in the same `pending` entry as its promise, by the `pending.set` after the constructor.
  - `rejectPendingForLayer` walks `pending` and never a separate reject map.
  - The existing no-op catch stays. Dropping it is caught by `npm test` as an unhandled rejection, but saying so costs nothing.
- Survivor assertions are under Verifiability. The loading flip is under Completeness.

**X6 Operability & observability [ADVISORY]: CONCERN.**
- The persistent-502 rule is under Failure modes.
- **An assumption to keep in view.** The live request measures the deployed proxy rather than a CDN copy only because `netlify.toml:10-12` declares the edge function without `cache = "manual"`. Netlify's documented default is not to cache edge-function responses, even though the proxy sends `public, max-age=604800`. This was not probed live.

## Stress tests

**Pre-mortem (three months out, it failed).**
1. *The layer that went quiet.*
   - Q1 surfaces fish-streams. The implementation had registered each reject at the top of the executor and walked the reject map. Every surviving request therefore rejects as superseded, and DataLayer swallows it: the layer never draws after the first pan, shows no error, and reports status `ok`.
   - Every new row was green. Only the old supersede test could have caught it, and that test was edited in the same batch.
   - This is the worst case for this item type: a fix to a data client that empties a layer while every instrument certifies it. Survivor assertions and the explicit single-entry wording prevent it.
2. *The outage that was ours.*
   - A later proxy change breaks the CQL composition, the D3 failure, and the fish-streams check gets a 502 "temporarily unavailable".
   - It is recorded `unverified` and re-run, and it is still 502. Both lanes stay halted, and Lee hears that BC's map server is down while the defect sits in our own edge function.
   - We should have had a persistence rule.
3. *The Parking Lot that still said M1a.*
   - `ROADMAP.md:135` and TRACEABILITY R0.3 still say `audit:live` cannot read green until M1a.
   - M1a re-plans a retarget that already shipped. Worse, a session reads a genuine `audit:live` red as "known by construction" and waves it through.

**Load-bearing assumptions.**
1. *Ted implements the captured reject in the single-entry form.* Medium-high confidence: the wording points there, and the old supersede test catches the bad form. If it is wrong, WFS-only layers go silently blank. Resolve before implementation with one sentence and the survivor assertions.
2. *After item 3, `ensureMapInstance` finds the map and a duration-0 `flyTo` lands.* Medium-high confidence, as in round 2. The camera witness turns a miss into an explicit red, and item 3's release settles the question before item 4 runs.
3. *The Campbell River request reads the live proxy.* High confidence on the shape: the bbox lies inside the proven box, and the CQL embeds the bbox. Medium-high on freshness (no `cache = "manual"`, not probed). Upstream availability is outside our control, hence the 502 rule.
4. *The footer is not a public-number change.* It holds: same digits, the band's own direction, the factor pinned.

**Inversion.**
- *Leave debounced-away promises unsettled (park R2-02's second half).* This wins if the loading-status flip matters more than settled promises. Today neither reaches a visitor. Settling is still the better default, and it removes retained closures. The cost is the flip, which the plan should name. That condition is not already true.
- *Keep the old fish-streams test and surface the layer instead.* This wins only if Q1 had cleared fish-streams. It has not (Q1: "Keep hidden. Verify layer-by-layer before surfacing."), so the direct request is right.
- *Fix panel `:609` here rather than route it to K.* This wins if K slips past the beta label. K is a pre-beta gate (DECISIONS 2026-10-23), and routing is now by name, so routing stands.

## Close

**Overall verdict: CONCERN (round 3).** Nothing in this plan blocks the gate. Round 2's gating defect, the wrong error type for superseded requests, is fixed. The harness shows four things:
- Superseded requests now reject the way DataLayer ignores.
- A rejection cannot reach a newer request in the form the plan describes.
- Each new test turns red on exactly the mutation it claims.
- The footer says what its own band says.

What is left is a handful of non-gating fixes the author folds before the relay, with no further critic round. Two of them matter more than their size: the new tests never check that the request which survives a supersede actually resolves, and two documents outside the plan will keep saying M1a owns the retarget after item 4 ships it. Earlier rounds also missed that the plan is Standard tier, not Simple, so it owes a short Review Focus section. For Lee, in plain words: the plan is sound, it can go ahead under the standing yes, and the remaining items are tidy-ups that the plan's author makes before implementation.

**Must-fix, in priority order (all non-gating):**
1. **Verifiability / X5:**
   - Add survivor assertions to S1, S4 and the in-flight row: the newest request resolves with the mocked data.
   - State the single-entry captured-reject form in item 3 (reject stored in the `pending` entry after the constructor; `rejectPendingForLayer` walks `pending`; the no-op catch stays).
   - Name the in-flight row's mutant and the DataLayer-level test's red proof (a `DataFetchError("abort")` rejection in each) in the revert record.
2. **Maintainability (class sweep):** strike or annotate `ROADMAP.md:135` and `research/ui-perf-audit-2026-10-02/TRACEABILITY.md:188` (R0.3) in item 4's docs step.
3. **Right-sizing / Verifiability:** relabel the tier as Standard, and add `## Review Focus` with up to five items, each pinned to a task (suggested list under dimension 9).
4. **Completeness:** one line accepting or parking the debounced-away status flip from `loading` to `ok`.
5. **Failure modes / X6:** a 502 that persists on a re-run at least 15 minutes later is red, because a CQL regression also returns 502. Apply the same reading to `:323`.
6. **Verifiability:** name how forced red (d) drops the CQL filter: a direct upstream GET, or a local proxy under `netlify dev`.
7. **Maintainability (residue):**
   - Plan line 15: "routed there in the hand-off" becomes `ROADMAP.md:151`.
   - Line 36: `:286` becomes `:224-241`.
   - Line 3 and the Gates line mention r2.
   - Cite spec tests by title where item 4 moves their lines (`:283`, `:313`).
   - Add `BAND_LOW_FACTOR` to `src/lib/carbon/index.ts`.
8. **X3 / X4 (advisory):**
   - Quote `:632` exactly in the Parking Lot note, and state the pool-comparison point plainly.
   - Fix the em-dash count.
   - Optionally drop the repeated "estimate".
   - Record the Part 1 re-run on the text that ships.
