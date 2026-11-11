Overall verdict: FAIL (round 1)

# Plan critic, round 1: Small routed fixes (PDF methodology pointer, audit:live non-public tests, wfs-client cleanup race)

Plan: `.claude/plans/2026-11-small-routed-fixes.md` (as committed at 8608f00). Reviewer: plan-reviewer agent (Opus, xhigh), 2026-11-10. Rubric: `rules/plan-critic-rubric.md` v2. DECISIONS read at `origin/main@4de59d7` (29 entries, working tree identical).

Two gating FAILs: **X3** (the re-authored PDF footer keeps a figure that contradicts the PDF's own band, and the plan certifies it "unchanged in substance") and **Verifiability** (the retargeted `:187` as specified can pass without ever reaching its camera, is never judged, and the wfs test as specified leaves one of its three checks unguarded). Everything else is fixable in place; the fixes are listed at the end.

## Applicability

Project type: public web app (Next.js static export on Netlify) with a client-generated PDF, a production monitor (Playwright against opencanopy.ca), and a client data-fetch module with shared timer and abort state.

| Dimension | Fires | Tag | Why |
|---|---|---|---|
| Core 1-10 | always | GATING | |
| X1 Physical safety | no | | No hardware or hazardous output. |
| X2 Privacy | no | | The PDF is built client-side from selection stats; none of the three changes holds or handles personal, health, child or client data. |
| X3 Evidence & source integrity | yes | GATING | The PDF footer is a public factual claim about the calculator's accuracy, and the plan re-authors it. |
| X4 Audience, brand & money | yes | ADVISORY | Public copy, but no money figure, legal term or signature changes ("not audited carbon accounting" keeps its meaning). |
| X5 Concurrency | yes | ADVISORY | wfs-client is module-level shared state with timers, aborts and re-entrant calls. |
| X6 Operability | yes | ADVISORY | Ships a release and changes the production monitor that later releases read. |
| X7 Self-modification | no | | No change to MARVIN's gates, hooks or skills; `audit:live` is this project's monitor. |
| X8 Dependencies | no | | Nothing added or moved; the devDependencies claim was verified (below). |

## What was verified, and how

- **devDependencies claim holds.** `package.json` devDependencies carries `@mapbox/vector-tile ^3.0.0`, `pbf ^5.1.2`, `@types/geojson ^7946.0.16`; 4bd41f0 (2026-11-01) is an ancestor of HEAD and of `origin/main`; the lockfile root lists all three as dev. The hand-off Owed item (`.claude/handoff.md:19`) still asks for the install.
- **No methodology route.** `src/app/` holds `map/`, `privacy/`, `page.tsx` only; no redirect in `netlify.toml`. The GitHub URL answered 200 to an unauthenticated HEAD today. The landing `Footer.tsx:29` already links the same URL, so the plan reuses an existing public pointer (as the refresh finding R3-04 recommended, `.refresh/2026-09-01.md:55`).
- **The wfs-client race exists as described, and the identity checks fix it without leaving entries behind.** Traced in code (`wfs-client.ts:35-49`, `:96-100`, `:102-110`, `:139-143`) and run in a scratch vitest harness (vitest 4.1.12, 2026-11-10): the real module copied verbatim, a copy with exactly the plan's three identity checks, and three single-check mutants. Results:
  - Realistic interleaving (fetch rejects on abort, as browsers do): B's issue aborts A; A's `finally` runs before B's timer fires and deletes **B's timer entry**; C issued during B's debounce therefore cannot clear it, so B fetches anyway. Fetch calls: 3 on today's code, 2 with the fix.
  - Plan's interleaving (A settles after B started): A's `finally` also deletes **B's controller**; C can never abort B (not at issue, not from its own callback). Fixed: B aborted synchronously at C's issue.
  - After the last request settles, `pending`, `debounceTimers`, `controllers` are all empty, on today's code and on the fixed copy alike. No leftover entries.
  - The existing 11 tests in `src/test/pipeline/wfs-client-fetch.test.ts` pass unchanged against the fixed copy. The fixed copy type-checks under the repo tsconfig with no annotations needed.
- **`fetchLayerData` is unreachable on the public site.** `DataLayer.tsx:1174` returns early for tile-backed layers; all six public data layers carry a `tileSource` (`registry.ts:893-901` against the definitions), `satellite` is raster. So item 3 changes no live behaviour.
- **`:243` and `:323`.** `:323` passes on production (release-4 candidate log). The proxy still serves `fish-streams` with its own CQL entry (`netlify/edge-functions/wfs-proxy.ts:105-108`); its URL composition is unit-tested in `src/test/pipeline/wfs-proxy-url.test.ts:38-69`. What deleting `:243` loses is the live GeoServer probe of that one entry and the only end-to-end run of the WFS-only client path, both non-public.
- **Why `:187` fails today.** Production never sets `window.__opencanopy_map` (`CanopyMap.tsx:125` returns under `NODE_ENV === "production"`); only `ensureMapInstance` (spec `:42-69`) finds the map. `:187` (and `:152`) call `page.evaluate(flyTo)` at `:192` before any `waitForMapIdle`, so the flyTo is a silent no-op and the count runs at the default camera (z5, `src/lib/mapConfig.ts:15`). The release-4 log agrees: `:187` fails on the count (`Received: 0`, `~/marvin/state/relay/datalayer-public-path-live/candidate-audit-live.log:266-273`), while `:243` and `:283`, which call `waitForMapIdle` first, throw on `center` (same log, `:348`, `:375`, `:402`, `:429`). **The plan's "its flyTo throws today" is true of `:243`/`:283`, not of `:187`.**
- **The 20% figure.** It is the band constant `rounded * 0.8` (`calculator.ts:296`), justified by an uncited comment (`calculator.ts:22`, "may overestimate by 10-20%") and by `METHODOLOGY.md:73` ("Published ranges for above-ground biomass alone are typically 10-20% lower"), which cites nothing for that range; its Sources list (`:37-39`) supports the densities, not the range. The ROADMAP 2026-07-16 entry the plan cites says the band is "per the model's own overestimate bias", i.e. the same comment. Not externally sourced.

## Core dimensions

**1. Problem-fit: CONCERN.** The anchor is met by the three changes and the grill-skip line is present (Simple tier). But the anti-goal "no change to any number" is written against DECISIONS "A public number must be reproducible from the shipped data; when in doubt, understate.", whose text covers "the PDF" and says "A figure that cannot be derived is not shown." The plan re-ships the 20% in rewritten copy without naming that tension. Verdicted as the X3 FAIL below, not double-counted here. Fix: carry the X3 fix; name the ruling in item 1.

**2. Approach soundness: CONCERN.** PDF: reusing the landing Footer's URL is right. wfs-client: identity checks are the correct fix (verified above). audit:live: retargeting through `#layers=cutblocks` is right, but the plan says "fly to the same Prince George view" without fixing the order that makes today's flyTo a no-op, and its premise ("its flyTo throws today") is wrong for `:187`. Copying the existing pattern yields a test that never leaves z5. Fix: specify `waitForMapIdle` (or `ensureMapInstance`) **before** the flyTo, then a camera witness (`map.getZoom()` within 0.5 of 11 and the centre within a stated tolerance of `[-122.7, 53.9]`) asserted before the feature count; correct the premise in item 2 and in pre-mortem 1.

**3. Completeness: CONCERN.** Gaps, each with its fix:
- `pdf-generator.ts:289` carries a second `&mdash;` in the same footer. The planned test ("footer ... contains no em dash") cannot go green after a one-line fix. Fix: bring `:289` into scope and through the same reviser pass.
- The em-dash class is wider than the PDF. The same calculator's live panel carries six: `CalculatorPanel.tsx:493`, `:494`, `:542`, `:573`, `:609` ("Approximate — may overestimate by up to ~20%") and `:623`. Fix: fix them here, or route them by name to the calculator redesign (DECISIONS "The carbon calculator is redesigned before the beta opens, not hidden for it.") in the ROADMAP Parking Lot.
- The routed finding R2-02 (`.refresh/2026-09-01.md:51`) prescribes "Identity-check before delete ..., **reject orphaned pendings**". The plan silently drops the second half. `rejectPendingForLayer` deletes but never rejects, so a request superseded during its debounce never settles (confirmed in the harness, today and fixed). The fix makes this path more frequent: in the realistic case B used to fire and reject with AbortError, and now its timer is cleared and its promise hangs. Fix: reject orphaned promises with a `DOMException("…", "AbortError")` (DataLayer `:1258` already treats that as benign), with a test; or park it with a reason.
- R4-02 (`.refresh/2026-09-01.md:56`) recommended hitting `/api/wfs?layer=fish-streams` directly instead of deleting `:243`. The plan deletes it and says `:323` covers it, but `:323` probes a different layer's CQL. Fix: either follow R4-02, or state what is lost (the live probe of the fish-streams entry) and why that is acceptable (non-public, Q1 "keep hidden", composition unit-tested in `wfs-proxy-url.test.ts`).
- Spec comments that go false: the file header (`live-health.spec.ts:9-17`, items 5 and 6) and `:286` ("still gated by the fish-streams + cutblocks tests above"), not only the block at `:224-241`.
- In-class lead, not in the plan: a cache hit (`wfs-client.ts:86-87`) returns before touching the debounce state, so it does not supersede an older pending fetch for the same layer; DataLayer applies whichever response lands last with no sequence guard (`DataLayer.tsx:1249-1250`). Same class as R2-02's "a superseded viewport's response can win". Fix: name it and park it (non-public today).

**4. Right-sizing & reuse: PASS.** Three small fixes, existing test harnesses reused (`captureReportHtml` in `pdf-generator.test.ts`, the fake-timer harness in `wfs-client-fetch.test.ts`), the existing public URL reused, the plan short. Simple tier, no dependency graph needed. New deferrals are covered under Completeness.

**5. Security: PASS.** A constant URL in the footer, no user input; the live test is read-only; `fetchLayerData` is not reachable publicly.

**6. Failure modes: CONCERN.** The retargeted test keeps `if (featureCount === -1) { test.skip(); }` (`:212-216`): if the map instance is never found, the production monitor reports *skipped*, not failed. That is a fail-open path in exactly the monitor this item exists to make honest. Fix: in the retargeted test, map-not-found is a failure (`expect(featureCount).not.toBe(-1)` with a message), and name the same pattern at `:177`, `:273`, `:313` for M1a. The hanging superseded promise is under Completeness.

**7. Change safety: PASS.** Each change is a revertible commit; the release follows the ledger sequence, after item 3's release, under the 2026-11-10 standing yes cited verbatim with its relayed attribution. One line owed: the standing yes "does not cover ... changing a public number before the measure-merge fixes". The plan should state why the footer edit is not one (the figure stays 20%); if the reviser drops or changes the percentage, that edit needs Lee's direct yes, not the standing one.

**8. Data integrity & compatibility: PASS.** No stored data. PDFs already exported keep the dead pointer, which is unavoidable and harmless. The URL is now hard-coded in two places (`Footer.tsx:29` and the new footer line); see Maintainability.

**9. Verifiability: FAIL.** Each part's proof has a hole:
- **audit:live `:187`.** The forced-red (a misspelled layer id) proves only the "layer missing" failure. It cannot catch the defect most likely to recur, a flyTo that silently never runs: a test that stays at z5 still fails on a misspelled id. And the retargeted test is only "recorded" at item 4's release, never judged, even though item 4 releases strictly after item 3 is live, so the reason for not judging it (item 3's throw) no longer applies by then. A hollow `:187` is the defect the 2026-09-01 refresh routed ("two hollow live-monitor tests", `.claude/handoff.md`, log 2026-09-02), and M1a's guard catalogue lists "existing `audit:live` (fixed)" as **blocking** (`.claude/plans/audit-remediation-2026-10/glowing-dazzling-brooks.md:815`). Fix: (a) the camera witness from dimension 2; (b) forced-reds that cover each way it can be hollow: no flyTo (the witness goes red), `#layers=` without `cutblocks` (count 0), misspelled id; (c) judge `:187` at item 4's release: blocking, or "a red is investigated before the verdict", as item 3 does for `:283`.
- **wfs test.** As written ("A settles; then request C is issued: B's fetch must receive an abort") the result depends on two things the plan does not pin, and the harness shows both matter:
  - **When the abort is asserted.** With the timer-only check reverted, B reads aborted = false synchronously after C's call but **true after C's debounce**, because C's own callback aborts B at `wfs-client.ts:107-108`. The file's existing tests always `await vi.advanceTimersByTimeAsync(...)` before asserting, so the natural implementation passes on reverted code.
  - **The fetch mock.** "A settles after B starts" cannot happen with the file's existing abort-respecting mock (`:149-167`), because A rejects the moment B aborts it. The plan's case needs a mock that ignores the abort for A. The realistic case needs the abort-respecting one, and it is the case that actually occurs in browsers.

  Fix: two scenarios, both in `src/test/pipeline/wfs-client-fetch.test.ts` (the plan names a non-existent "`src/lib/data/wfs-client` test file"):

  | Scenario | Mock | Assertion | Today | Fixed |
  |---|---|---|---|---|
  | Realistic: C issued during B's debounce | rejects on abort | `fetch` called exactly 2 times | 3 | 2 |
  | Late settle: A settles after B starts | ignores abort for A | `B.signal.aborted === true` immediately after C's call, before any timer advance | false | true |
- **The pending identity check is unguarded.** No planned scenario reaches it. With only that check reverted, every scenario above stays green. A test that does reach it: A in flight; B (another key) and A′ (A's key) issued in the same tick; flush; a fourth call with A's key must return A′'s promise. That reads false today and on the mutant, true when fixed. Fix: add it, and revert **each** identity check separately, recording which test goes red. A single "the unconditional deletes go red" revert proves the bundle, not each check.
- **The "maps are empty" mitigation (pre-mortem 3) proves nothing.** The maps are module-private; the file's convention is to reset the module, not reach into it (`wfs-client-fetch.test.ts:11`, `pdf-generator.test.ts:13-17`); and the maps empty out on today's code too. Fix: drop it, or replace it with an observable leak test, e.g. after a request that fails with HTTP 500, the same key re-requested calls `fetch` again.
- **PDF test.** It is sound once `:289` is in scope. Pin the URL as a constant shared with `Footer.tsx`, not as a literal copied into the test.

**10. Maintainability: CONCERN.** Docs the plan leaves stale:
- Hand-off Owed `.claude/handoff.md:19` (the whole "Small routed fixes" item, including its devDependencies clause) and `:43` ("M1a batch 0 retargets the two `audit:live` tests"). They should go through `update-handoff.mjs` (`owed_remove`), not "closed by this" in prose.
- The M1a plan still says M1a batch 0 owns retargeting `:187` and `:243` (`glowing-dazzling-brooks.md:251-252`, `:827-828`). Amend it to say item 4 retargeted `:187` and deleted `:243`, or M1a will plan the work again.
- Single-source the METHODOLOGY URL: one exported constant used by `Footer.tsx` and the PDF, with the test reading that constant.

## Conditional dimensions

**X3 Evidence & source integrity [GATING]: FAIL.** Quoting DECISIONS: "A public number must be reproducible from the shipped data; when in doubt, understate."
- **The draft contradicts the PDF's own band, and the plan smooths over it.** The PDF prints "may be as low as" `rounded × 0.8` (`pdf-generator.ts:250`, `calculator.ts:296`). A floor of 0.8 times the headline means the headline can be up to 25% high, not 20%. The surfaces that phrase it consistently say "lower": the Share text "(may be up to ~20% lower)" (`CalculatorPanel.tsx:373`, pinned by `CalculatorPanel.test.tsx:171`) and METHODOLOGY's "10-20% lower". The draft "may run up to about 20% high" keeps the inconsistent phrasing, and the plan certifies it "unchanged in substance". It errs on the confident side, so it does not understate.
- **The figure's provenance stops at an uncited comment** (see "What was verified"). The plan presents the ROADMAP entry as if it were the source.
- Fix:
  1. Phrase the figure the way the band works: the true figure may be up to about 20% lower. That keeps the number at 20%, consistent with the band, the Share text and METHODOLOGY.
  2. Add one line to item 1 naming the 20% as an inherited, uncited model assumption, not a sourced figure, and route its sourcing to the calculator redesign. The ROADMAP 2026-07-16 follow-up "k/C_max yield-curve sourcing" already exists; point at it.
  3. State the standing-yes classification from dimension 7.
- If the author would rather drop the percentage from the footer under the ruling, that changes public copy that is still shown in the panel and the Share text. Put it to Lee as one structured question, not a silent edit.

**X4 Audience, brand & money [ADVISORY]: CONCERN.**
- The draft opens "This is ...", which the copy rules list as a tell (`~/marvin/knowledge/email-voice.md:41`, `:76`).
- Its second sentence joins the URL to an unrelated disclaimer with "and it is", where "it" reads as "the method".
- The footer is collateral register (same file, `:19`).
- Make the URL an `<a href>` so a saved PDF is clickable, with the visible text kept short.
- Fable is blocked until 2026-11-12 03:00 Vancouver (`.claude/handoff.md:86`). The plan's "Fable reviser" must state the Opus fallback and say so in the report, as the brief requires (`.../session-f1a7d3/state/briefs/opencanopy-2026-11-10.md:16`).
- The orchestrator re-runs the Part 1 checklist on the reviser's output, as planned.

**X5 Concurrency & re-entrancy [ADVISORY]: CONCERN.** The fix is right and leaves no entries behind. The open re-entrancy items are the never-settling superseded promise and the cache-hit-does-not-supersede lead (Completeness), plus the two interleavings that need separate tests (Verifiability).

**X6 Operability & observability [ADVISORY]: CONCERN.** "Recorded, not judged" means a red retargeted `:187` after item 4's release has no owner and no consequence. Combined with `test.skip()` on map-not-found, the monitor can read clean while it measures nothing. Fix: as in Verifiability and Failure modes. If the plan keeps `:187` non-blocking, say who acts on a red and when.

## Stress tests

**Pre-mortem (three months out, it failed).**
1. *The false public claim.* The beta opens quietly and a short note reaches a local journalist (DECISIONS, beta launch entry). The journalist exports a PDF: the headline, "may be as low as 0.8×", and a footer saying the figure may run up to 20% high. They do the arithmetic, then open the linked METHODOLOGY, where the 10-20% has no citation. The calculator's accuracy claim becomes the story. We should have seen it in this plan: the footer was re-authored and called unchanged in substance.
2. *The hollow monitor, again.* The retargeted `:187` copies the old order, never leaves z5, and either passes on whatever cutblocks render at z5 (the fill layer has `minzoom 0`, `DataLayer.tsx:281`, and the registry gives cutblocks no `tileSource.minZoom`) or fails and is "recorded". M1a then reads `audit:live` as its blocking guard. A real z11 cutblocks regression ships under a green or ignored monitor. The repo has been here before: "six hollow audit tests replaced with mutation-proven guards" (hand-off log, 2026-09-02).
3. *The silent revert.* Someone later "simplifies" the `finally`. The new test asserts after advancing timers, or never reaches the pending check, so it stays green, and the race returns on the day a WFS-only layer is surfaced.

**Load-bearing assumptions.**
1. *On react-map-gl 8.1.3, a flyTo called after map discovery lands the camera.* This is item 3's claim; medium-high confidence. If it is wrong, `:187` stays red for a camera reason. The camera witness makes that visible instead of silent. Resolve at item 3's release.
2. *"20% high" is the same claim as the band.* False, as shown under X3. Resolve before implementation.
3. *`fetchLayerData` is unreachable publicly.* Verified (`DataLayer.tsx:1174`, `PUBLIC_LAYER_IDS`). If wrong, the fix only helps.
4. *The GitHub URL stays public at that path.* 200 today. If the repo moves, every printed PDF carries a dead pointer. That is low risk, but it is why the URL constant and the inversion below matter.

**Inversion.**
- *A `/methodology` redirect on opencanopy.ca instead of a GitHub URL.* It wins if printed PDFs outlive the repo's URL: the URL bakes in one GitHub account name and branch (`git remote`, `blob/main`), and a redirect keeps the original "at opencanopy.ca" copy true. Partly true today. The cost is one `netlify.toml` rule. The plan's choice is defensible because the landing footer already commits to the GitHub URL, but the plan should say it considered this.
- *Retargeting `:243` to a direct proxy request, as R4-02 proposed.* It wins if hidden layers are about to be surfaced (Q1: verify layer by layer first). Not true today, so deletion is acceptable once its loss is stated.
- *A per-layer request sequence instead of identity checks.* It wins if the cache-hit stale-overwrite matters, because it fixes both. Not true while no WFS-only layer is public. Identity checks are the right size now.

## Close

**Overall verdict: FAIL (round 1).** The diagnosis is mostly right and the code fixes are sound: the wfs-client race is real, the identity checks fix it without leaving entries behind, the devDependencies are already in, and the GitHub URL is the one the site already uses. Two things block. The PDF footer, the one piece of public copy here, is re-authored with a figure that contradicts the band printed two blocks above it and rests on an uncited comment, against the standing ruling on public numbers. And the proofs are weaker than the plan claims: the retargeted `:187` can pass without leaving the default camera and is never judged, and the wfs test as described can pass on reverted code and never reaches the pending check. Every fix below fits inside this plan without changing its scope.

**Must-fix, in priority order:**
1. **X3:** rephrase the footer figure the way the band works ("up to about 20% lower"). Name the 20% as an inherited, uncited assumption routed to the calculator redesign's sourcing follow-up. State why the edit sits inside the standing yes. Any other change to the percentage goes to Lee.
2. **Verifiability, `:187`:** discover the map before the flyTo; add the camera witness; forced-reds for no flyTo, `cutblocks` missing from the hash, and a misspelled id; judge `:187` at item 4's release. Correct "its flyTo throws today".
3. **Verifiability, wfs:** use the two scenarios in the table (realistic: count 2 vs 3; late settle: synchronous abort assertion) plus the same-key test for the pending check, in `src/test/pipeline/wfs-client-fetch.test.ts`. Revert each check separately and record which test goes red. Drop or replace the "maps empty" assertion.
4. **Completeness:** bring `pdf-generator.ts:289` into scope. Reject orphaned pendings with AbortError, or park them with a reason, as R2-02 prescribed. Fix or route the six panel em dashes (`CalculatorPanel.tsx:493`-`:623`). Justify deleting `:243` against R4-02's direct-proxy option. Park the cache-hit lead.
5. **Failure modes:** in the retargeted test, map-not-found fails instead of skipping.
6. **Maintainability:** `owed_remove` hand-off `:19` and `:43` through the writer. Amend `glowing-dazzling-brooks.md:251-252` and `:827-828`. Update spec comments `:9-17` and `:286`. Single-source the METHODOLOGY URL.
7. **X4 (advisory):** fix the draft's opener and its "and it is" join, link the URL, and state the Opus fallback while Fable is blocked.
