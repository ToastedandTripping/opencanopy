## Applicability

Project type: Complex, multi-relay remediation of a public civic-data website, including geospatial calculations, public monetary estimates/PDFs, browser analytics, and human-operated deployment coordination. This reviews the current program, including its r5 revisions; child plans remain subject to their own gates.

- Core 1–10: all active [GATING]: Problem-fit; Approach soundness; Completeness; Right-sizing & reuse; Security; Failure modes; Change safety; Data integrity & compatibility; Verifiability; Maintainability.
- X1 Physical & human safety: N/A — does not fire; no hardware, hazardous output, or physical fabrication is changed.
- X2 Privacy & data stewardship: fires [GATING] — browser coordinates, analytics records, receiver storage, and retention/access decisions are in scope.
- X3 Evidence & source integrity: fires [GATING] — harvest, forest-age, carbon and comment-period claims inform public decisions.
- X4 Audience, brand & money accuracy: fires [GATING] — public copy includes monetary calculator claims and downloadable PDFs, even though the existing dollar overstatement is explicitly accepted temporarily.
- X5 Concurrency & re-entrancy: fires [ADVISORY] — worktrees, shared release state, detached builds and coordinator takeover overlap.
- X6 Operability & observability: fires [ADVISORY] — production releases, live guards, an edge endpoint and rollback require operational ownership.
- X7 Self-modification safety: N/A — does not fire on the stated scope; P0b adds OpenCanopy deployment tooling, but the plan does not modify MARVIN's own hooks, skills or gate implementations. Using MARVIN writers and storing coordination files under its state directory is not itself such a modification.
- X8 Dependencies, performance & cost: fires [ADVISORY] — new packages, expensive raster builds, public edge requests and an agent-heavy prototype have resource costs.

Line references below refer to `/home/leesalo/.claude/plans/glowing-dazzling-brooks.md`. Repository checks used OpenCanopy `origin/main` at `3db58239a9dbabaf13c59121e9eecb82974191e5`, plus local source inspections identified explicitly below. No production storage inspection or live deployment was performed.

## Dimension verdicts

PASS — 1. Problem-fit [GATING]: The grilled intent, explicit calculator exception, just-in-time relay plans and proposed DECISIONS amendments address the requested audit program without silently restoring the docked dolly.

CONCERN — 2. Approach soundness [GATING]: C5b assigns a version to consumers without specifying how existing tile-derived properties acquire unique-area semantics; define the data transformation or distinguish raw feature area from contract-derived logged area before M2.

At lines 356–360, the map legend and popups get logged hectares from “FTEN tiles” and migrate in M2. Lines 341–346 define dissolve and first-harvest semantics. A frontend constant cannot convert a raw polygon area into that polygon's unique contribution after overlaps and earlier harvests are removed. `MapPopup.tsx` currently formats source properties such as `PLANNED_GROSS_BLOCK_AREA`; M2's specification at lines 855–861 is label/format/UI work. Require the M2 child plan to identify the actual derived artifact or computation, spatial scope, overlap ownership and release dependency. A relabelled old value is not a migration.

FAIL — 3. Completeness [GATING]: C3's identity prerequisite is unavailable for releases that must precede M1a batch 0; move identity instrumentation earlier or explicitly define an equally strong bootstrap verification path.

Lines 221–222 require: “A guard run starts only once `oc-build` on production equals the candidate SHA.” Lines 205–208 introduce that tag in M1a batch 0. But the graph at lines 1019–1023 requires P0 → P0b → S0a before that batch can release. S0a is a behaviour release, and C2 requires green guards before the next push. As written, its verification waits for a tag it cannot have, becomes unverified, and halts the release that would introduce the tag. Local S0 negative controls at lines 590–591 do not establish production deployment identity. Put a SHA identity mechanism in P0/P0b with explicit bootstrap acceptance; retain the probe-only negative-control deployment separately if useful.

PASS — 4. Right-sizing & reuse [GATING]: The program reuses existing relay/audit infrastructure, defers detailed batch design to child plans, supplies foundation/artifact waivers, and assigns named deferrals to ROADMAP/TRACEABILITY.

PASS — 5. Security [GATING]: The proposed new FOM endpoint has a fixed upstream, rejects client parameters, limits methods/time/size, and the probe excludes mutation handles; receiver data minimization remains a separate X2 failure.

CONCERN — 6. Failure modes [GATING]: Release recovery checks only the published deploy, leaving queued/building candidates and a resumed former owner unresolved; require pending-deploy reconciliation and ownership validation before recovery completes.

C2 says a lease older than two hours can be broken after reconciling “Netlify's live published deploy” (lines 174–178). That is insufficient evidence that an earlier push cannot still publish. A candidate may be building or queued while the published deploy remains unchanged. A new coordinator may then authorize another candidate; the old build can finish later. Enumerate in-flight deploys associated with the old candidate, cancel or await them under Lee's deploy authority, and keep scheduling halted until their disposition is known. A CLI timeout or ambiguous build status must not mean “safe to reclaim.”

PASS — 7. Change safety [GATING]: The plan preserves existing work, gives Lee recovery authority, versions external data, retains prior assets and explicitly tests rollback-related missing assets rather than promising impossible reverse retention.

CONCERN — 8. Data integrity & compatibility [GATING]: C5b's per-screen version policy permits an undocumented cross-route semantic split between S1-lite and M2; define that interval and verify the underlying data, not merely declarations.

“Every consumer ... reads that version” (lines 348–350) conflicts with the staged table: landing migrates in S1-lite, `/map` later in M2. The claim “no mixed interval exists on any screen” (lines 366–369) deliberately narrows the guarantee; a reader following the landing's map link can still encounter different definitions. Either release the shared semantics together or explicitly version/disclose the interim difference, with a bounded migration and an end-to-end comparison using the same geography and year. This is not a demand to change the frozen calculator, which is correctly excluded.

FAIL — 9. Verifiability [GATING]: The area-version test can pass with stale calculations and missing consumers, and the identity bootstrap prevents early live verification; add semantic negative controls and repair the release prerequisite.

Lines 366–369 say each component “declares `areaContractVersion`” and a test “fails if one screen shows figures with differing versions ... The test proves it.” It proves matching labels among whatever the test discovers. It does not prove matching calculations or discover an undeclared component automatically. A component can declare v1 while rendering its old raw area and pass. Require an explicit inventory of public area outputs and an integration fixture whose overlapping/re-harvest polygons yield different raw versus unique-area answers. Render actual output from each consumer and compare with an independently derived expected result; reverting its computation while leaving its version tag intact must fail. Preserve the existing twin-equivalence tests, which test another seam.

CONCERN — 10. Maintainability [GATING]: Repeated obsolete scope statements still disagree with the claimed binding sections; consolidate them so child authors cannot select different obligations.

The opening strategy names six Wave-1 plans (lines 80–81), while step 0.6 names “S0, M1a, M1b, S1-lite and X” (line 555). C6 correctly enumerates eight S0a files across three locations (lines 405–407), but S0a's waiver names two roots (582–583), and S0 detail later says “About 6 files in two roots” (648–650). Replace these restatements with references to the authoritative S0a/S0b scopes and graph. Also resolve the C2 sentence mandating rollback at lines 189–190 against its earlier authorized corrective-release option; recovery instructions should have one authority.

FAIL — X2. Privacy & data stewardship [GATING]: C6 covers client URL fields but misses receiver-added IP storage that contradicts the privacy page; inventory actual stored fields and reconcile policy, minimization and retention before declaring privacy complete.

The plan promises “the privacy page names exactly the fields sent” (line 384), and tests `sendBeacon`/`fetch` payloads (382–383). That boundary misses data added after receipt. Local `/home/leesalo/Projects/ssc-ops/netlify/functions/track.js` inserts `ip_address: ip` into both `sessions` (line 166) and `page_views` (183), also storing the user agent. Its `lib/rate-limit.js:35–39` reads client-IP headers. OpenCanopy `origin/main:src/app/privacy/page.tsx:36` says “No IP addresses are stored”; line 55 also excludes “IP addresses or precise location.” This is a concrete source contradiction, not proof of current production rows, and it must be resolved against the deployed receiver. Query/fragment stripping cannot fix it. Extend the receiver plan and storage test to server-derived fields, document the chosen collection/access/retention policy, and put existing IP-bearing records into Lee's disposition decision. Do not silently delete them.

The client policy also says outbound URLs keep “the hostname only” (381), whereas the receiver patch promises only query/fragment stripping (391–392). Thus legacy clients can still persist outbound paths after the stated containment test passes. Make the receiver enforce the same field-specific minimization contract and test legacy nested event payloads, not only `pageUrl`.

CONCERN — X3. Evidence & source integrity [GATING]: The coarse-picture exception is bounded only by an event that can fail indefinitely; add an elapsed-time limit and a truthful fallback when S1-lite cannot pass.

Lines 611–612 call it “bounded until S1-lite releases.” Lines 743–745 then explicitly allow S1-lite to stop while the story stays in S0's coarse form. The audit synthesis identifies roughly fivefold painted-area inflation, and lines 607–609 admit S0b cannot meet the final area check. A caption discloses the defect but does not limit its duration. Unlike the dollar bar, the quoted user rulings do not explicitly accept this indefinitely. Set a deadline from S0b deployment after which the overstating layer is hidden or replaced by sourced totals/stills until corrected. Keep the interim waiver distinct from final truth-check acceptance.

CONCERN — X4. Audience, brand & money accuracy [GATING]: The explicitly authorized dollar exception is not a blocker, but the revised privacy page needs a receiver-backed assertion for its public promises; fix the IP contradiction and verify every “we do not collect/store” statement.

CONCERN — X5. Concurrency & re-entrancy [ADVISORY]: Atomic `mkdir` establishes initial ownership but does not fence a former owner after takeover; require owner tokens, serialized reclamation and rejection of stale writes/releases.

The stated two-claim and duplicate-SHA tests (lines 177–178) do not cover a paused owner resuming after its lease expires. Specify that every ledger mutation, approval request and lease removal verifies the current acquisition token; an old coordinator must not clear a successor's lock or register green results for a superseded candidate. Test two reclaimers plus resumed-owner writes, alongside the pending-Netlify-build case. For the heavy-build lock, verify process identity/start time as well as PID before treating `kill -0` as ownership evidence.

CONCERN — X6. Operability & observability [ADVISORY]: The cross-repo ingestion repair is a completion requirement without a scheduled program node; add an owner, dependency and tracked storage-verification artifact so C6 cannot disappear at S0a close.

Lines 391–403 defer the patch to an `ssc-ops` session with Lee's approval, while the graph contains no corresponding work item. The program correctly reports exposure as open until that patch lands; keep that rule, but make the open obligation schedulable and part of program-close acceptance. Human approval is not a reason to omit its dependency or accountable owner.

PASS — X8. Dependencies, performance & cost [ADVISORY]: C7 assigns package verification/pinning, memory headroom and single-heavy-build admission, while X and the final landing have explicit agent/time/byte budgets.

## Stress test 1: Pre-mortem

It is three months out and this program failed:

1. **Personal data persists behind a false privacy promise.** URL-sanitization fixtures pass and the new page ships, but the receiver continues storing IP addresses and legacy outbound paths. The type-specific privacy worst case is identifying/location-related records exposed to an unintended reader while visitors were told those records did not exist. The warning was testing only browser payloads and one legacy coordinate sentinel, despite an accessible receiver implementation.
2. **The deployment coordinator either deadlocks or admits overlapping releases.** S0a cannot satisfy the identity check, so an operator bypasses it. Later a two-hour lease is reclaimed while the first Netlify build is still pending. The old build or coordinator resumes and changes production after the successor's recorded green state. The operational worst case is a bad live release marked known-good, with an unreliable recovery target. The warnings were late identity instrumentation and published-deploy-only reconciliation.
3. **Public harvest claims disagree while every version test passes.** The story computes dissolved first-harvest area, popups retain raw tile properties marked v1, and a failed S1-lite leaves inflated coarse pictures for months. The civic-data worst case is a false public land-use claim influencing a comment submission or attribution to a forestry company. The warning was replacing proof of numerical semantics with a version label and calling “until success” a bound.

## Stress test 2: Load-bearing assumptions

| Assumption | Confidence | Consequence if wrong / required resolution |
|---|---|---|
| The first coordinated releases can satisfy C3 before M1a batch 0. | Low; the written graph contradicts it. | Verification halts its own prerequisite. Resolve the bootstrap before P0b/S0a implementation. |
| Browser URL sanitization plus the named receiver patch matches the privacy page's collection claims. | Low; receiver source explicitly inserts IP fields and uses a weaker outbound policy. | False policy and continuing collection survive green tests. Resolve deployed storage behavior and policy before privacy acceptance. |
| Consumer version labels imply unique-area calculations over equivalent inputs. | Low; no such implication exists, and current popups format raw properties. | Public totals diverge undetected. Resolve the actual data path and semantic negative controls before M2 implementation. |
| A stale lease plus an unchanged published deploy means the former release cannot act again. | Low; a pending build or paused coordinator can still resume. | Split ownership and out-of-order publication. Resolve takeover fencing and in-flight-deploy handling before P0b implementation. |

These are resolve-before-implementation risks for the named work, not permission to defer the shared contracts to unrelated future child critics.

## Stress test 3: Inversion

Writing every relay plan now would win if interfaces and source data were stable enough that advance detail would survive the early plumbing and area changes. The plan's own history argues against that, so full upfront planning is not justified. A narrower alternative already wins: establish and test the release bootstrap, receiver/storage policy and shared area-data boundary before dispatching dependent relays. Likewise, retaining the corrected scroll indefinitely would win if it already met honesty and performance acceptance and the animation offered little benefit; that condition has not been established, so the prototype/fallback choice remains appropriate. No inversion justifies restarting Phase B ahead of the explicit plumbing/story prerequisites.

## Overall verdict

**FAIL — gate blocked.** The intent and relay structure are reviewable, but the program still has an unsatisfiable early release-verification prerequisite, an area-consistency test that can certify unchanged wrong calculations, and a privacy contract that omits server-side collection contradicted by the public page. These are shared program defects, not details independent child plans can safely decide differently. Preserve the approved calculator exception and completed revisions; repair these specific contracts and make takeover and cross-repo completion explicit before dispatch.

## Prioritized must-fix list

1. **P0 — Privacy:** inspect the deployed receiver and storage schema/behavior, reconcile IP collection with the public policy, align legacy outbound minimization, and track the `ssc-ops` patch plus storage evidence as a program dependency. Include existing IP records in Lee's disposition decision.
2. **P0 — Release bootstrap:** provide deploy identity before the first identity-gated release; prove P0/P0b/S0a can pass without introducing or bypassing a dependency cycle.
3. **P1 — Area semantics:** name the map's actual unique-area data path, test displayed values against independent overlap/re-harvest fixtures, and fail a reverted calculation with an unchanged version label. State the cross-route migration policy.
4. **P1 — Recovery/concurrency:** reconcile pending builds before lease takeover, fence former coordinators, and test resumed owners and competing reclaimers. Keep unknown state halted.
5. **P1 — Interim honesty and specification:** add a deadline/fallback for coarse overstating imagery, then remove conflicting S0 scope, Wave-1 and recovery restatements so every child plan inherits one contract.
