# Applicability

Project type: a multi-relay remediation program for a deployed public civic-data website, with geospatial builds, analytics, carbon estimates and concurrent worktree sessions.

- Core 1–10: all active [GATING].
- X1 Physical & human safety: N/A — does not fire; no hardware, hazardous output or physical actuation is changed.
- X2 Privacy & data stewardship: fires [GATING] — visitor coordinates, URL queries and existing analytics records are handled.
- X3 Evidence & source integrity: fires [GATING] — public harvest, carbon and comment-window claims inform civic decisions.
- X4 Audience, brand & money accuracy: fires [GATING] — public copy and monetary calculator/PDF outputs are in scope; the explicit dollar exception does not exempt new output from accuracy.
- X5 Concurrency & re-entrancy: fires [ADVISORY] — two lanes share releases, a ledger, leases and memory-intensive builds.
- X6 Operability & observability: fires [ADVISORY] — production deployments, edge endpoints, recovery and guard execution change.
- X7 Self-modification safety: N/A — does not fire on the stated scope; this program uses existing MARVIN gates and writers, but specifies no modification to their implementation, hooks or skills. Project-specific release bookkeeping is not itself a change to MARVIN's gate machinery.
- X8 Dependencies, performance & cost: fires [ADVISORY] — new packages, heavy builds, network requests and agent budgets are specified.

Review basis: the complete supplied plan, the target repository's AGENTS.md, standing decisions and relevant source at local origin/main (`3db58239a9dbabaf13c59121e9eecb82974191e5`), and the local audit synthesis. The primary checkout is an older branch; source comparisons below use origin/main. This is a program review, not an independent revalidation of the scientific literature or a production audit.

# Dimension verdicts

PASS — 1. Problem-fit [GATING]: The Intent section and written grill skip address the requested audit program, calculator redesign and Opus implementation; Phase 0 explicitly proposes amendments to the affected standing decisions.
CONCERN — 2. Approach soundness [GATING]: S0b retains coarse binary rendering while importing final area-accuracy requirements; resolve the staged-rendering contradiction in finding A before child plans inherit it.
FAIL — 3. Completeness [GATING]: C5b requires K.4 after B′, but the dependency graph permits K.4 after M3b and the waves put it before B′; establish one authoritative ordering and define every “S0” dependency as completion of S0b (finding C).
CONCERN — 4. Right-sizing & reuse [GATING]: “S0a … roots src/ and public/” omits the cache-header configuration required by C6 and the separately owned ingestion patch; enumerate those files, repo owners and waivers instead of treating privacy as an eight-file local batch.
CONCERN — 5. Security [GATING]: The fixed-upstream endpoint has explicit input and timeout boundaries, but the cross-repo analytics sanitizer has no specified site scope or compatibility checks; require an OpenCanopy-scoped policy or explicit tests for other tenants before changing a shared receiver.
CONCERN — 6. Failure modes [GATING]: C4 says any viewport change returns a layer to loading while its table puts out-of-range layers in zoom-in; define event precedence for disabled/out-of-range layers and fixtures for panning there, so they cannot regress to permanent slow.
CONCERN — 7. Change safety [GATING]: C1's three-version retention supports bounded upgrades, but “an already-open old page keeps working” is broader than that retention; define the supported tab/version window and test missing-asset degradation after the third subsequent deployment as well as rollback.
FAIL — 8. Data integrity & compatibility [GATING]: “A v1 figure is never shown beside a pre-v1 figure on the same screen” has no implementation or display gate while M2 migrates map figures and the calculator remains frozen until K.4; specify an approved compatibility policy and test the mixed-version interval (finding C).
FAIL — 9. Verifiability [GATING]: S0b's “the C5 aggregate checks” imports ±15% painted-area accuracy before the rasterization change assigned to S1-lite; these controls cannot be claimed achievable from a dated-only rebuild (finding A).
CONCERN — 10. Maintainability [GATING]: Binding scope, migration table, waves and graph disagree despite the declaration “the graph's release edges enforce it”; consolidate prerequisites and acceptance ownership into one table and remove contradictory restatements.
FAIL — X2. Privacy & data stewardship [GATING]: “Cache-Control: no-cache so the window is a single page view” is not a valid bound on already-loaded or previously cached tracker code, and ingestion sanitization has no release prerequisite; replace that claim and verify server-side protection before calling exposure contained (finding B).
CONCERN — X3. Evidence & source integrity [GATING]: Final C5 derivations are specified, but S0b can neither satisfy those checks nor honestly be treated as equivalent to S1-lite; name and bound the interim coarse-picture exception explicitly, without reporting final truth checks green (finding A).
PASS — X4. Audience, brand & money accuracy [GATING]: New copy requires approval and sourced derivations; the existing dollar overstatement is explicitly frozen in panel and PDF by the user and removed or replaced in both at K.4.
CONCERN — X5. Concurrency & re-entrancy [ADVISORY]: C7 copies the release lease for detached builds, but Netlify reconciliation cannot establish that an old build has stopped; give heavy builds process-liveness ownership, guarded stale-lock recovery and kill/restart tests (finding D).
CONCERN — X6. Operability & observability [ADVISORY]: C2 introduces a durable ledger and takeover but names no owner/batch for their implementation or malformed-ledger recovery; assign these foundations before the first coordinated release and require an unreadable ledger to halt scheduling.
CONCERN — X8. Dependencies, performance & cost [ADVISORY]: The “about 12 pushes” estimate is below the listed release nodes, and the 16 GB build requirement relies on an incompletely specified lock; recount the minimum operator load and verify available memory when acquiring the build lease.

## A. The first overlay release is gated on the second release's implementation

S0b changes `undated_proxy_year: None`, rebuilds PNGs and adds “the coarse-cell caption” (plan lines 553–561). Its acceptance then imports “the C5 aggregate checks” (567–568). C5 requires “each frame's area-weighted painted area is within ±15% of its source total.” But S1-lite owns the actual change: “Rasterize finely without all_touched, block-average, alpha proportional to covered fraction.”

The current generator at origin/main still rasterizes binary masks with `all_touched=True`. The synthesis §7 identifies that mechanism as the source of the approximately fivefold harvest-area inflation; it also reports fire-area inflation. Removing undated cutblocks does not change cell coverage, fix fire rendering, or establish the unique-area semantics assigned to S1-lite. A caption does not change the measured painted area. At minimum, no evidence supports the claim that this restricted rebuild can pass the imported checks.

The geographic rule “undated-only polygons, never painted” also needs spatially unambiguous fixtures: a coarse cell can legitimately contain both dated and undated-only ground. Without selecting isolated cells or comparing coverage against a defined rasterization oracle, the test can reject the intended interim renderer for a defect this batch cannot fix.

Fix: either bring area semantics and fractional rendering forward into S0b, with an honest file/build waiver, or explicitly give S0b limited interim acceptance and reserve final C5 checks for S1-lite. In the latter case, record the remaining overpaint and its release owner; do not weaken the final area test or bless a regenerated golden. Reconcile the “After S0 and S1-lite” milestone accordingly.

## B. The claimed privacy bound does not exist

C6 states: “S0a sets tracker.js to Cache-Control: no-cache so the window is a single page view” and “Until (b) lands, the residual exposure is bounded by (a)” (lines 375–383).

A response header cannot replace JavaScript already executing in an open document. Nor does changing today's response retroactively alter the freshness metadata of an older cached response. The current tracker attaches click handlers and exposes `window.analyticsTracker.trackPageView`; old code can continue sending URLs after the client release. “Single page view” is neither a duration nor a bound on events.

The actual control is the receiver, but it is only “drafted here, applied by an ssc-ops session with Lee's approval.” It has no node, release order, completion criterion or verified storage test in this program. In addition, the receiver promises only query/fragment stripping, whereas the client promises hostname-only outbound URLs; old clients can therefore retain more outbound-path detail than the new policy.

Fix: add a named ingestion work item and explicit cross-repo approval/deployment dependency for claiming containment. Use the same field policy at ingestion, scoped to the intended site, and test an old tracker kept open across S0a, previously cached code, and direct legacy payloads through the actual receiving boundary to stored records. If that deployment is delayed, describe the residual honestly and obtain a dated disposition; do not represent cache headers as remediation of old clients. Report access and retention evidence with that decision.

## C. The area-contract migration cannot follow all three schedules

C5b says “calculator | K.4 | after B′” (line 354). The graph says “K.4 | K.3, M3a released | M3b” (986), while the waves place K.4 in Wave 3 and B′ in Wave 4. These are operationally different orders.

The same contract says “A v1 figure is never shown beside a pre-v1 figure on the same screen” (357–358), but migrates map legend/popups in M2 and exempts the frozen calculator until K.4. Recording `pre-v1` in a contract file does not enforce a UI invariant. The plan must establish whether simultaneous display is possible and how it is prevented or explicitly accepted without violating the calculator freeze.

Fix: choose the release order, update graph/waves/migration table together, and add a mixed-version integration fixture. If preventing simultaneous display changes the frozen calculator's behavior, propose the narrow amendment explicitly; do not smuggle it into M2. Replace the graph's undefined aggregate “S0” with S0b completion or define that alias once.

## D. A release lease is not a build-liveness protocol

C7 says the heavy-build lock has “the same lease shape as the release lock.” C2 expires a release lease after two hours and reconciles against Netlify. Neither elapsed age nor Netlify's published deploy proves that a detached Python process stopped. Breaking such a lock can launch a second memory-heavy process while the first still runs; preserving it indefinitely can strand the program after a crashed owner.

Fix: specify separate build ownership including host and process identity/start time, liveness checks, owner-safe release and serialized stale recovery. Test owner-session loss while the detached build remains alive, process death and two reclaimers. Keep these requirements in a named foundation batch, not an unassigned global-state convention.

# Three stress tests

## 1. Pre-mortem

It is three months out, and the program has failed:

1. S0a is celebrated as closing the analytics leak, but visitors with old tabs still send coordinates to the unchanged receiver. The privacy page describes a policy production does not enforce. **Type-specific worst case: visitor location/query data continues entering retained analytics despite a claimed containment control.** The warning was the unbounded cross-repo dependency disguised by “single page view.”
2. S0b cannot pass painted-area checks, so both map and story progress stall behind it—or an implementer relaxes the test to ship. The public animation then inherits an inflated raster blessed as honest. **The civic-data worst case is a false public harvest-area claim influencing decisions.** The warning was final C5 acceptance attached to a coarse-cell interim build.
3. Different sessions follow different K.4 prerequisites, leaving map, story and calculator on inconsistent semantics. A long detached rebuild survives its coordinator, its lock is reclaimed, and overlapping builds fail under memory pressure. The warnings were contradictory release tables and copied lease semantics.

## 2. Load-bearing assumptions

| Assumption | Confidence | Consequence if wrong / required resolution |
|---|---|---|
| A dated-only coarse rebuild passes the C5 area checks. | Low; contradicted by the stated renderer and audit mechanism. | S0b blocks or its tests are weakened. Resolve acceptance scope before implementation. |
| New tracker cache headers bound old-client exposure. | Very low; the control cannot replace executing code. | Continuing sensitive analytics collection is misreported as contained. Resolve ingestion ownership and acceptance before claiming privacy closure. |
| The migration table, waves and release graph produce the same order. | Low; K.4 is a concrete counterexample. | Consumers ship on incompatible semantics. Resolve the authoritative dependency graph before lane dispatch. |
| The pixel-oracle popstate workaround produces the intended target view independently of the repaired path. | Medium; asserted as audit-proven, not reproduced in this review. | Negative controls can validate the wrong reference view. Verify and retain the workaround capture, target identity and baseline SHA before accepting M1a controls. |

## 3. Inversion

The rejected “write every relay plan now” alternative would win if future interfaces were stable enough that comprehensive upfront design cost less than repeated integration repairs. They are not established as stable here. However, the narrower alternative—settle shared contracts, release tooling and migration order before dispatch—is already justified by the contradictions above and does not require writing every future child plan.

Likewise, a single early honest-overlay build would beat the two-stage S0b/S1-lite sequence if the interim build must already meet final area accuracy. That condition is currently true in S0b's written acceptance. Either combine that work or genuinely separate interim and final acceptance; retaining both formulations is not a viable third option.

# Overall verdict

**FAIL — gate blocked.** The program has sufficient intent and structure to review, but it still promises privacy containment its control cannot provide, binds an interim renderer to acceptance requiring a later implementation, and gives incompatible release/migration orders. These are program-level defects that child critics cannot safely resolve independently. The user's explicit calculator exception is respected; it does not authorize inconsistent new figures or an invented bound on analytics exposure. Fix the shared contracts and prerequisites before dispatching Wave 1.

Prioritized must-fix list:

1. **P0 — Privacy:** remove the false cache bound; assign and gate the receiving-side sanitization, test legacy clients through storage, and record access/retention/disposition evidence.
2. **P0 — Overlay acceptance:** make S0b's implementation and truth checks achievable together; retain final C5 accuracy and independent geographic checks in the relay that implements them.
3. **P1 — Migration:** reconcile K.4/B′ across all schedules, define S0 completion, and specify/test the mixed-version display policy.
4. **P1 — Operational foundations:** assign ledger/lease implementation and recovery before use; distinguish build liveness from release reconciliation and test crash/takeover paths.
5. **P2 — Contract precision:** resolve status-event precedence, bound old-tab asset support, enumerate privacy configuration/cross-repo scope and recount deployments.
