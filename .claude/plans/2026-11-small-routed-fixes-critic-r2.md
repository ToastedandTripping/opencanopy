Overall verdict: FAIL (round 2)

# Plan critic, round 2: Small routed fixes (PDF methodology pointer, audit:live non-public tests, wfs-client cleanup race)

Plan: `.claude/plans/2026-11-small-routed-fixes.md` as committed at 5531af6 (unchanged at HEAD 11b7233). Round 1: `2026-11-small-routed-fixes-critic-r1.md` (FAIL). Reviewer: plan-reviewer agent (Opus, xhigh), 2026-11-10. Rubric: `rules/plan-critic-rubric.md` v2. DECISIONS read at `origin/main@4de59d7` (29 entries, working tree identical, `decisions-check.sh` 2026-11-10).

One gating FAIL, on **Approach soundness**: the new orphan-rejection rejects with `DataFetchError("abort")` "(the error type callers already treat as an abort)". No caller treats it as an abort. The only caller of `fetchLayerData`, `DataLayer.tsx:1258`, ignores only `DOMException` named `AbortError`; anything else clears the layer's features, logs `console.error` and sets status `error`. As specified, the change also converts the in-flight supersede path, which is handled correctly today, into that error path, and the planned test pins the wrong type. Proven in two scratch harnesses (below). The fix is one constructor plus two tests. Every round-1 must-fix is otherwise folded, and the folds hold up. The remaining findings are CONCERNs, listed at the end.

## Applicability

Project type: a public web app (Next.js static export on Netlify) with a client-generated PDF, a production monitor (Playwright against opencanopy.ca, read-only), and a client data-fetch module with shared timer and abort state.

| Dimension | Fires | Tag | Why |
|---|---|---|---|
| Core 1-10 | always | GATING | |
| X1 Physical safety | no | | No hardware or hazardous output. |
| X2 Privacy | no | | The PDF is built client-side from selection stats. None of the three changes holds or handles personal, health, child or client data. |
| X3 Evidence & source integrity | yes | GATING | The PDF footer is a public factual claim about the calculator's accuracy, and the plan re-authors it. |
| X4 Audience, brand & money | yes | ADVISORY | Public copy on a printed artifact. No money figure, legal term or signature changes. |
| X5 Concurrency | yes | ADVISORY | wfs-client is module-level shared state with timers, aborts and re-entrant calls. |
| X6 Operability | yes | ADVISORY | Ships a release and changes the production monitor that later releases read as blocking. |
| X7 Self-modification | no | | No change to MARVIN's gates, hooks or skills. `audit:live` is this project's monitor. |
| X8 Dependencies | no | | Nothing is added or moved. The devDependencies were verified in round 1. |

## Round-1 must-fixes: folded?

| # | Must-fix | Folded | Note |
|---|---|---|---|
| 1 | X3 footer phrased the way the band works; 20% named inherited and routed; standing-yes reasoning | Yes, with residue | The wording and arithmetic are right. The routing destination is misnamed, and the live panel still carries the contradiction the plan's own arithmetic condemns (X3 below). |
| 2 | `:187`: discover the map first, camera witness, forced reds, judged blocking, premise corrected | Yes | The premise is corrected in item 2. Forced reds (b) and (c) overlap (Verifiability). |
| 3 | wfs scenarios in the right file, same-key test, per-check reverts, "maps empty" dropped | Yes | All five scenarios discriminate, verified per mutant below. S4 pins the wrong error type (Approach). |
| 4 | `:289`, reject orphaned pendings, panel em dashes, `:243` per R4-02, cache-hit parked | Mostly | The orphan rejection is folded with the wrong error type. The plan diverges from round 1's stated fix (`DOMException` `AbortError`) on a false premise. |
| 5 | Map-not-found fails in the retargeted test | Yes | Round 1's dimension text also asked to name the same `test.skip()` at `:177` and `:313` for M1a. That is not folded (Maintainability). |
| 6 | Hand-off, M1a plan, spec comments, single-sourced URL | Partly | The hand-off line it targets was rewritten at HEAD. An `owed_remove` on the obvious substring deletes an unrelated M1a bullet (Maintainability). |
| 7 | X4 opener and join, URL linked, Fable state | Yes, with residue | The opener is fixed. A hedge stack and a semicolon join of unrelated facts remain (X4). |

## What was verified, and how

- **No caller treats `DataFetchError("abort")` as an abort.**
  - `fetchLayerData` has one importer outside tests: `DataLayer.tsx:8`, which awaits it at `:1249`. Its catch, `:1258`, returns early only for `err instanceof DOMException && err.name === "AbortError"`. Everything else runs `console.error`, then `setData(EMPTY_FC)`, then `setLayerStatus(layer.id, "error")` at `:1259-1264`.
  - The `"abort"` kind of `FetchErrorKind` (`fetch-errors.ts:9`) has no producer and no consumer anywhere in `src/` (grep of `"abort"` across `src/`, `e2e/` and `netlify/`). It appears only in the union and in `fetch-errors.test.ts:22`.
  - The codebase's convention is the opposite of the plan's. `forest-carbon-client.ts:209-217` leaves aborts as `DOMException("Aborted", "AbortError")` and types only timeouts. `page.tsx:225-228` tests `name === "AbortError"`, and `DataFetchError`'s name is `"DataFetchError"` (`fetch-errors.ts:17`).
- **The regression is real, and the current suite cannot see it.** Scratch harness `.../scratchpad/race/r2/r2.test.ts`, vitest 4.1.12, 2026-11-10. It uses the real module with the round-1 identity fix, plus a captured `reject` that `rejectPendingForLayer` calls. `plan` is the plan's `DataFetchError("abort")`, `plandom` is the same fix rejecting with `DOMException("Superseded", "AbortError")`, and there is one mutant per check:
  - **In-flight supersede** (A fetching, B issued). Today A rejects `DOMException/AbortError` (DataLayer ignores it). Under `plan`, A rejects `DataFetchError/abort` (DataLayer errors). Under `plandom`, A rejects `DOMException/AbortError`. The rejection from `rejectPendingForLayer` is synchronous, so it beats the fetch's own abort rejection by a microtask.
  - **Debounced away** (call 1 never fetched): never settles today, `DataFetchError/abort` under `plan`, `DOMException/AbortError` under `plandom`.
  - **Through DataLayer itself.** A scratch copy of `pmtiles-layers-lifecycle.test.tsx` adds a probe beside its test 10 (`:390`), where `fetchLayerData` rejects. Results: `DataFetchError("abort")` leaves the WFS-only layer at status `error` with 4 `Failed to load layer` console errors; `DOMException("…","AbortError")` leaves it not in error with 0 console errors (`.../race/r2/dl/dl-probe.test.tsx`).
  - The existing 11 tests in `wfs-client-fetch.test.ts` pass unchanged on **both** variants, `plan` and `plandom` (22/22). Its supersede test checks only `instanceof Error` (`:187`). Nothing in the suite notices the type change.
- **Each of the five planned wfs scenarios discriminates its own check** (same harness; cells show the scenario's reading under each variant):

  | Variant | S1 fetch count | S2 B aborted sync | S3 a3===a2 | S4 call 1 | S5 refetch count |
  |---|---|---|---|---|---|
  | today | 3 (red) | false (red) | false (red) | unsettled (red) | 2 |
  | plan, fixed | 2 | true | true | rejects | 2 |
  | timer check reverted | **3** | **false** | true | rejects | 2 |
  | controller check reverted | 2 | **false** | true | rejects | 2 |
  | pending check reverted | 2 | true | **false** | rejects | 2 |
  | rejection reverted | 2 | true | true | **unsettled** | 2 |
  | pending over-guard (never deletes) | 2 | true | true | rejects | **1** |

  So the timer revert turns S1 and S2 red, the controller revert turns only S2 red, the pending revert only S3, the rejection revert only S4. S5 is green on today's code and on every per-check revert, and goes red only on an over-guard mutant the plan does not name.
- **Two setup traps in the table** (same harness): S4 with the same bbox twice dedupes (`a === b`, no supersede happens). S1 needs A's debounce elapsed (A in flight) before B. With A, B and C all inside the debounce, only C fetches, on today's code and fixed alike.
- **The footer's direction, against every place the figure is said.**
  - PDF band: `pdf-generator.ts:250` prints "may be as low as" `bandLow = roundToSigFigs(rounded * 0.8, 3)` (`calculator.ts:296`). "Up to about 20% lower" is that band. Consistent.
  - Share text: `CalculatorPanel.tsx:373`, "(may be up to ~20% lower)", pinned at `CalculatorPanel.test.tsx:171`. Consistent.
  - METHODOLOGY.md: `:73` reads "typically 10-20% lower ... estimates lean toward the high end". Same direction.
  - **Live panel, not consistent.** `src/components/panels/CalculatorPanel.tsx:567` prints the same band ("may be as low as {bandLow}"), and `:609`, a few lines below, prints "Approximate — may overestimate by up to ~20%". `:632` says "may overestimate by 10–20%". By the plan's own arithmetic (item 1: "'May run up to about 20% high' would contradict the band"), `:609` contradicts the band beside it. Round 1 quoted `:609` only as an em-dash line and missed this.
  - **Number change or not.** No printed digit changes, and the band is untouched. The footer's implied bound moves from "estimate ≤ 1.2 × true" (true ≥ 0.833 × headline) to the band's own "true ≥ 0.8 × headline". That is a correction toward the figure already printed above it, and toward understating. It is not a change to a public number under the 2026-11-10 standing yes's exclusion. The plan's "changes no number" holds.
- **The 20% has a subtler provenance problem, for K.** METHODOLOGY's "10-20% lower" compares two different carbon pools ("above-ground biomass alone" against total ecosystem carbon), and `calculator.ts:22-25` says the same. Turning that into "the true figure may be up to 20% lower" reads a pool-definition difference as an error bound. This is inherited across the band, the Share text and now the footer. It is not this plan's to fix, but it belongs in what is routed to K.
- **The fish-streams direct request.**
  - The proxy answers this shape. It takes `layer`, `bbox` (WGS84 west,south,east,north) and `zoom`, with no bbox-area limit. It clamps to valid ranges (`wfs-proxy.ts:685-693`), converts both corners to BC Albers (`:694-696`), caps features at 5000 for z9-10 (`:699`), and embeds the bbox in `CQL_FILTER` for fish-streams (`lib/wfs-bbox-url.ts:46-49`).
  - The bbox-in-CQL form is recorded as proven live on 2026-06-10, at Albers 1035926,542789 to 1071379,576537 (`wfs-bbox-url.ts:10-11`), which is the Campbell River area. A z10 Campbell River viewport (roughly 60 x 35 km) is far inside every limit. The 50,000 km² guard lives in DataLayer (`:1204-1208`), not the proxy.
  - Fish-streams has no property whitelist (`wfs-proxy.ts:352-380`), so `STREAM_ORDER` comes back on every feature. The request can assert that the filter was applied, not just that something came back.
  - The proxy's only per-request limits are the 60-requests-per-window rate limit (`:512`) and upstream availability, which returns a 502, "Data source temporarily unavailable" (`:810`).
  - Not run against production, per the brief.
- **`:187` retarget.** `cutblocks` is public (`registry.ts:896`) and `defaultEnabled: false` (`registry.ts:247`). Its fill id is `layer-cutblocks-tiles-fill` (`DataLayer.tsx:300`). A `#layers=` hash without lat/lng triggers no deep-link fly (`useMapState.ts:143-148`), so nothing snaps the camera after the test's flyTo. Layer resolution is hash, then localStorage, then defaults (`useLayerState.ts:116`). A fresh Playwright context has empty storage, so forced reds (b) and (c) both resolve to "cutblocks disabled".
- **HEAD moved since round 1.** HEAD is now 11b7233 (react-map-gl 8.1.3 merged at f341faf, hand-off rewritten). The hand-off line the plan targets, "M1a batch 0 retargets the two `audit:live` tests" (`:43` at 8608f00), no longer exists. `.claude/handoff.md:55` now reads "audit:live :187 and :243 are retargeted by item 4 ...; M1a keeps :118, :130, :152, :283", inside the bullet that also carries the URL-hash subscription defect. `owed_remove` deletes every whole bullet containing its pattern (`scripts/update-handoff.mjs:373-391`).

## Core dimensions

**1. Problem-fit: PASS.** The anchor is met. The PDF points at a page that exists and its footer now agrees with its band. The monitor's two by-construction failures are retargeted to things the public can see. The WFS bookkeeping race is fixed. The grill-skip line is present (Simple tier). No DECISIONS entry is contradicted: the footer keeps the 20% under "A public number must be reproducible ...", with its sourcing routed, and the standing yes's "changing a public number" exclusion does not fire (verified above). Anti-goal "no change to any ... visual": the new `<a>` in the footer is a small visual change; see X4.

**2. Approach soundness: FAIL.** The wfs identity checks are right (re-verified in the matrix). The orphan rejection is wrong as specified:
- **The premise is false.** No code treats `DataFetchError("abort")` as an abort, and the repo's convention is `DOMException` `AbortError` (see "What was verified").
- **The consequence is a regression in the module the item exists to fix.** Every superseded request becomes a layer error: features cleared, status `error`, a console error. That covers the debounced-away case (silent today) and, because `rejectPendingForLayer` settles the in-flight promise synchronously before the fetch's own abort lands, the in-flight case too. That case works correctly today. WFS-only layers are not public, so nobody sees it today. Anyone who surfaces one (Q1, "verify layer by layer") gets an error toast on every pan.
- **The safety net does not catch it.** Pre-mortem 3's mitigation ("Ted confirms DataLayer's catch path treats it as such and adds a test if it does not") leaves the remedy undecided, and the planned S4 test asserts the wrong type.

Fix:
- `rejectPendingForLayer` rejects with `new DOMException("Superseded", "AbortError")`, the type `DataLayer.tsx:1258`, `page.tsx:226` and `forest-carbon-client.ts:209-217` already use. Do not change DataLayer, which stays out of this plan's file set.
- S4 asserts `DOMException` with name `AbortError`.
- Add the in-flight assertion: A fetching, then B issued; A rejects with a `DOMException` `AbortError`. It is red under `DataFetchError` and green under `DOMException`.
- Add one DataLayer-level test in `src/test/pipeline/pmtiles-layers-lifecycle.test.tsx` beside test 10: `fetchLayerData` rejects with that `DOMException`, and the WFS-only layer's status is not `error`, with no `Failed to load layer` log. The harness probe above shows it red for `DataFetchError("abort")` and green for `DOMException`.
- Name the mechanism. `pending` holds promises, so rejecting from outside needs the executor's `reject` captured (for example a `Map<key, reject>`), deleted under the same identity rule as `pending`.
- Correct the pre-mortem 3 line.

**3. Completeness: CONCERN.**
- **Loading indicator.** Once a debounced-away promise settles, `DataLayer.tsx`'s `finally` (`:1266-1271`) clears the layer's loading state while the newer request is still in its debounce or fetch. Today this happens only on the in-flight path. Fix: name it as accepted (WFS-only, non-public) in item 3, or park it with the cache-hit lead.
- **Green baseline before the push.** The plan runs the forced reds against production after item 3's release but never says that the unmutated retargeted `:187` and the fish-streams request are run green there before item 4 is pushed. Both are blocking at item 4's release, and both are test-only changes that can run against production as soon as item 3 is live. Fix: one line, "run both unmutated against production after item 3's release, record green, then push item 4".

**4. Right-sizing & reuse: PASS.** Small, uses existing harnesses (`captureReportHtml` pattern, the fake-timer harness, the lifecycle DataLayer harness), reuses the landing footer's URL, and parks the cache-hit lead. Simple tier, no dependency graph required.

**5. Security: PASS.** A constant URL in the footer, no user input; the live checks are read-only GETs; `fetchLayerData` is unreachable from public layers.

**6. Failure modes: CONCERN.**
- **Upstream outage.** The fish-streams request is judged blocking, and a red guard halts both lanes and can be lifted only with Lee's words ("Re-running a guard until it passes is not a recovery", ARCHITECTURE.md Verdicts). The request depends on openmaps.gov.bc.ca. An upstream outage returns the proxy's 502 "Data source temporarily unavailable", which is not an item-4 defect. Fix: state the reading. A 502 from the proxy is `unverified` (re-run; unverified to green needs no `--lee`). A 200 with zero features, or any non-502 error, is `red`. The existing `:323` cutblocks request has the same exposure; the same sentence can cover both.
- The `DataFetchError` regression is counted under Approach.

**7. Change safety: PASS.** Each change is a revertible commit. The release is serialized after item 3, under the 2026-11-10 standing yes cited verbatim with its relayed attribution. The number classification is stated and holds (verified above). Any change to the percentage itself goes to Lee.

**8. Data integrity & compatibility: PASS.** No stored data. Already-exported PDFs keep the dead pointer, which is unavoidable. The METHODOLOGY URL is single-sourced.

**9. Verifiability: CONCERN.** The wfs matrix discriminates (verified). What is left:
- **S4 pins the wrong type.** It is counted under Approach and corrected there.
- **S5 has no named mutant and empty Today/Fixed cells.** It is green on today's code and on every per-check revert, so the plan's revert protocol never shows it red. Fix: fill the cells (2 / 2), name its target ("an over-guarded pending delete that never fires"), and revert-prove it with that mutant (it reads 1 there).
- **Setup precision.** S1: A's debounce has elapsed (A in flight) before B is issued, then a microtask flush, then C inside B's debounce. S4: calls 1 and 2 use different bboxes, because the same bbox dedupes and nothing is superseded.
- **The fish-streams request proves only that something came back.** "features > 0" passes with the CQL filter dropped (a bbox-only query returns more features, not fewer). Fix: also assert every feature's `properties.STREAM_ORDER >= 3`. The proxy returns all properties for fish-streams. Name the literal bbox in the plan (it is a placeholder today) and give the request `{ timeout: 30000 }` as `:323` does.
- **Forced reds (b) and (c) test the same mechanism.** An invalid id in the hash filters to `[]`, which falls through to the defaults, where `cutblocks` is off, the same as (b). If (c) means a misspelled query id instead, say so. Either way, list (c) as a duplicate of (b) or replace it with a distinct failure: the witness tolerance tightened to prove it can fire on a 0.5-zoom miss, for example.
- **The footer test pins "lower" but not the figure.** DECISIONS "A public number must be reproducible from the shipped data" asks that every figure in the PDF be pinned by a test that reads its source. Fix: export the band factor from `calculator.ts` (today an inline `0.8` at `:296`), and assert that the footer's percentage equals `(1 - factor) × 100` in the same sentence as "lower". A future band change then cannot leave the footer behind.
- **Test path.** `src/test/lib/pdf-generator.test.ts` does not exist; the file is `src/lib/export/pdf-generator.test.ts`. Name it.

**10. Maintainability: CONCERN.**
- **The hand-off step is stale and has a deletion hazard.** "`owed_remove` ... 'M1a batch 0 retargets the two audit:live tests' (`:43`)": that text is gone at HEAD, so the call refuses (exit 2). The likely improvisation, a pattern such as "audit:live", also matches `.claude/handoff.md:55`, the "M1a after item 3 ships" bullet. `owed_remove` deletes every whole matching bullet, which loses the URL-hash subscription defect, the deep-link snap and the negative-control re-baseline note. Fix: name exact patterns. `owed_remove "**Small routed fixes**"` (`:19`) and `"**Next (brief 2026-11-10, item 4):**"` (`:59`). Leave the `:55` bullet in place, and correct its "`:243` ... retargeted" to "replaced by a direct proxy request" by re-adding the bullet through the writer, never by hand.
- **The 20% routing destination is misnamed.** "That sourcing belongs to the calculator redesign's follow-up ..., routed there in the hand-off" is wrong. The hand-off carries no such item, and the home is the ROADMAP Parking Lot line "**CO2 calculator follow-ups:** k/C_max yield-curve data sourcing ..." (`ROADMAP.md:151`). Fix: amend that line to name the 20% band basis (`calculator.ts:22`, `calculator.ts:296`, `METHODOLOGY.md:73`) and the pool-comparison point above.
- **There is no such module as "the other site constants".** `src/lib/` holds `mapConfig.ts`, `r2-config.ts`, `build-id.ts` and folders. Fix: name the file (for example `src/lib/site-links.ts`), and say whether the other GitHub URLs in `Footer.tsx` move too or stay.
- **The spec comments are named loosely.** The D3 block comment is `:224-241` (its "Navigates ... Enables the layer and waits for WFS data" goes false for fish-streams). `:286` is the old-growth test's line, which stays true once the direct request exists. Fix: name `:224-241`.
- **The fail-open `test.skip()` is not handed to M1a.** It remains at `:177` and `:313`, in tests M1a keeps (`:152`, `:283`). Round 1 asked to name it for M1a. Fix: add it to the M1a plan amendment.

## Conditional dimensions

**X3 Evidence & source integrity [GATING]: CONCERN.** The footer fold is correct. "The true figure may be up to about 20% lower" matches the band printed above it, the Share text and METHODOLOGY, and it changes no public number (verified above). Three things remain, none blocking:
1. **The live panel still contradicts its own band.** `CalculatorPanel.tsx:609` ("may overestimate by up to ~20%", printed under `:567`'s "may be as low as") and `:632` ("may overestimate by 10–20%") carry exactly the phrasing the plan's item 1 shows to contradict the band. The plan lists the surfaces that agree and omits the one that does not. That claim is shown on every calculation. Fix: route `:609` and `:632` by name with the panel em dashes (Parking Lot and K's copy), with the arithmetic sentence, so K's redesign does not inherit it. Or fix `:609` here as a one-line copy change inside the same standing-yes reasoning, with the Share-text test pattern.
2. **Routing.** Correct the destination and add the pool-comparison point (Maintainability).
3. **Pin.** Pin the footer's percentage to the band factor (Verifiability).

**X4 Audience, brand & money [ADVISORY]: CONCERN.** Checked against Part 1 of the copy rules (`~/marvin/knowledge/email-voice.md`, Part 1, tells checklist items 9 and 14, and the Rhythm section). The opener is fixed and there are no em dashes.
- **Hedge stack (item 9: one qualifier per sentence).** "is approximate, and the true figure may be up to about 20% lower" stacks four softeners on one figure. "Up to" is the bound; "may" and "about" are redundant with it, and the band is exactly 0.8. One possible shape: "The CO&#8322; figure in this report is an estimate, and the true amount could be as much as 20% lower."
- **Semicolon join of unrelated ideas (Rhythm: join related ideas).** "It is not audited carbon accounting; the method behind it is published at ..." joins a disclaimer and a pointer. Two plain sentences read better: "It is not audited carbon accounting. The method is published at github.com/…".
- **CO2 against CO&#8322;.** The same page prints "tonnes CO&#8322;" (`pdf-generator.ts:249`). Use `CO&#8322;` in the footer. The plain-text Share line keeps "CO2".
- **Link styling.** A bare `<a>` renders default blue and underlined in a `#aaa` 10px footer, which is a visual change despite "no Jen". Fix: `style="color:inherit"` (underline optional), and say so.
- The orchestrator re-runs the Part 1 checklist on the final text, as the plan already says.

**X5 Concurrency & re-entrancy [ADVISORY]: CONCERN.** The identity checks are right. The rejection type is the open re-entrancy defect (Approach). The captured-`reject` map must follow the same identity-guarded cleanup as `pending`. The early loading clear is under Completeness. The cache-hit lead is parked.

**X6 Operability & observability [ADVISORY]: CONCERN.** Covered by the upstream-outage reading (Failure modes) and the green baseline before the push (Completeness). The rest is sound: blocking judgement, the witness, and map-not-found failing.

## Stress tests

**Pre-mortem (three months out, it failed).**
1. *The superseded fetch that cries wolf.* M1a or Q1 surfaces a WFS-only layer after layer-by-layer verification. On the first real pan session the status toast flashes "error" and the layer blanks on every move, because each superseded request now rejects with a `DataFetchError` that DataLayer does not recognise. The suite was green throughout, because its supersede test checks only `instanceof Error` and S4 pinned the wrong type. The worst case for this type of item: the client fix ships a regression in the module it was fixing, and the instrument meant to catch it certifies it.
2. *The halt nobody caused.* openmaps.gov.bc.ca has a maintenance window during item 4's release. The proxy returns 502 for fish-streams, the blocking guard reads red, both lanes halt, and only Lee's words lift it. We should have written down that a 502 is `unverified`.
3. *The panel that still says 20% high.* The beta opens and a journalist sets the panel's "may overestimate by up to ~20%" beside "may be as low as", the exact contradiction this plan fixed in the PDF. We fixed the instance, not the class.

**Load-bearing assumptions.**
1. *`DataFetchError("abort")` is treated as an abort by callers.* **False** (verified). Resolve before implementation; the fix is under Approach.
2. *After item 3, `ensureMapInstance` finds the map and a flyTo lands the camera on react-map-gl 8.1.3.* Medium-high confidence: item 3's own deeplink and interact guards exercise the same path. If it is wrong, the camera witness turns it into an explicit red instead of a silent zero. Resolved at item 3's release, before item 4 runs.
3. *The Campbell River fish-streams request returns features from production.* High confidence on shape and limits (code, and the 2026-06-10 live record). Availability is outside our control (Failure modes).
4. *The new footer is not a public-number change.* Holds: the same digits and the band's own semantics, moving toward understating.

**Inversion.**
- *Change DataLayer's catch to also accept `kind === "abort"` instead of changing the error type.* That wins if typed errors are the direction the codebase is going. They are not: forest-carbon-client deliberately leaves aborts as `DOMException`, and DataLayer is the highest-risk file. The `DOMException` route touches one line in the file already in scope.
- *Leave debounced-away promises unsettled (park R2-02's second half).* That wins if nothing awaits them in a way that matters. Today DataLayer's awaiting call just never finishes, which is benign apart from a retained closure. Rejecting with `AbortError` is still better (settled promises, no leak), but parking is a legitimate fallback if Lee wants this item smaller. The plan should not ship the `DataFetchError` middle ground.
- *Fix panel `:609` here rather than route it.* That wins if K slips past the beta label. K is a pre-beta gate (DECISIONS 2026-10-23), so routing is acceptable, provided it is routed by name.

## Close

**Overall verdict: FAIL (round 2).** Round 1's must-fixes are folded, and most folds are sound. The footer now says what its band says and changes no number, the `:187` retarget can no longer pass without reaching its camera, and the five wfs scenarios each turn red on exactly the check they claim (proven per mutant). One gating defect remains, and it is new to this revision. The orphan rejection uses an error type that no caller recognises as an abort. That turns every superseded WFS request, including the in-flight case that works today, into a layer error, and the planned test locks it in. It is a one-constructor fix with two small tests, and it is the fix round 1 named. The rest are CONCERNs that fit inside the plan without changing its scope. This is round 2 of at most three.

**Must-fix, in priority order:**
1. **Approach (gating):** reject orphaned pendings with `new DOMException("Superseded", "AbortError")`, not `DataFetchError("abort")`. S4 asserts that type. Add the in-flight assertion (a superseded fetching request rejects `AbortError`). Add one DataLayer-level test in `pmtiles-layers-lifecycle.test.tsx`: no `error` status and no `Failed to load layer` log on that rejection. Name the captured-`reject` mechanism and its identity-guarded cleanup. Correct pre-mortem 3.
2. **Maintainability (hand-off):** replace the stale `:43` instruction with exact `owed_remove` patterns (`"**Small routed fixes**"`, `"**Next (brief 2026-11-10, item 4):**"`). Keep the `:55` M1a bullet and correct its `:243` wording through the writer.
3. **X3:** route `CalculatorPanel.tsx:609` and `:632` by name to K with the arithmetic, or fix `:609` here. Point the 20% routing at `ROADMAP.md:151` with the band basis and the pool-comparison point. Pin the footer's percentage to an exported band factor.
4. **Failure modes / X6:** a proxy 502 is `unverified`; a 200 with zero features is `red`. Run both new live checks green against production after item 3's release, before item 4's push.
5. **Verifiability:** add the `STREAM_ORDER >= 3` assertion and the literal bbox and timeout. Fill S5's cells and revert-prove it with an over-guard mutant. State the S1 and S4 setups. De-duplicate forced reds (b) and (c). Name the PDF test's real path.
6. **Maintainability (rest):** name the constants file. Name spec comment `:224-241`. Hand `test.skip()` at `:177` and `:313` to M1a.
7. **X4 (advisory):** one hedge per sentence, two sentences instead of the semicolon join, `CO&#8322;`, and `color:inherit` on the link.
