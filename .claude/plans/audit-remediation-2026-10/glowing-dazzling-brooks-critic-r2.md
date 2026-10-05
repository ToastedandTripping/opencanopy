## Applicability

Project type: multi-relay remediation of a deployed public geospatial application, including environmental claims, carbon estimates, analytics, data builds and parallel worktrees. This is a program-level review: implementation detail may move into child plans, but contradictory program contracts and missing release prerequisites cannot.

Active core dimensions, all [GATING]: 1 Problem-fit; 2 Approach soundness; 3 Completeness; 4 Right-sizing & reuse; 5 Security; 6 Failure modes; 7 Change safety; 8 Data integrity & compatibility; 9 Verifiability; 10 Maintainability.

- X1 Physical & human safety — N/A; does not fire: mapping and raster generation do not control hardware or hazardous physical output.
- X2 Privacy & data stewardship — FIRES [GATING]: geolocation, shared coordinates and analytics collection handle personal location data.
- X3 Evidence & source integrity — FIRES [GATING]: public logging, carbon and comment-window claims inform civic decisions.
- X4 Audience, brand & money accuracy — FIRES [GATING]: public copy and calculator/PDF monetary figures are in scope; money makes this gating.
- X5 Concurrency & re-entrancy — FIRES [ADVISORY]: two worktrees, shared release state, asynchronous map loads and detached data builds.
- X6 Operability & observability — FIRES [ADVISORY]: production deploys, live guards and rollback operations.
- X7 Self-modification safety — N/A; does not fire: this plan consumes MARVIN's existing relay, critic and document writers without changing MARVIN gates, hooks, skills or automation. OpenCanopy tests and application scripts are not MARVIN self-modification.
- X8 Dependencies, performance & cost — FIRES [ADVISORY]: new packages, large raster builds, WebGL and explicit loading budgets.

Reviewed the supplied plan and the target repository's locally available `origin/main:.claude/DECISIONS.md`, `public/tracker.js` and `netlify.toml`. Line references below refer to the supplied plan unless a source is named. Scientific claims and live service behavior are not independently certified by this review.

## Dimension verdicts

FAIL — 1. Problem-fit [GATING]: The intent section exists, but Ruling A says “story-honesty relays run **before** Phase B” (L23), while B′ depends only on M3b (L663), allowing it to ship while X/S1-lite is stalled; additionally “Lee's own checks are cut to three” (L689) contradicts the canonical decision requiring Lee's live visual/map QA. Fix: make accepted story-honesty deployment an explicit B′ prerequisite and preserve that QA obligation unless Lee explicitly amends it.

CONCERN — 2. Approach soundness [GATING]: C4 calls “slow” a “terminal” state (L154–159) while requiring it to keep listening, and M3a reintroduces “ok or empty from `queryRenderedFeatures` on idle” (L535–536), which cannot distinguish no data from unloaded or filtered data. Fix: specify one revisitable transition contract, replace the inconsistent M3a wording, and bind async results to the current viewport/source/filter generation.

FAIL — 3. Completeness [GATING]: “S1-lite (as soon as X step 2 produces the area-true frames)” (L381) has no path when those frames fail to materialize; the fallback clock starts only after videos arrive (L385), and the seven-day time box (L201) names no expiry action. S1-lite is also absent from the waves table (L216–224), and L386 resumes only S2 while L653 resumes S1 plus S2. Fix: schedule S1-lite explicitly, set an outcome on spike timeout/build failure independent of video delivery, and reconcile fallback ownership so unfinished honesty work resumes without duplicate rebuilds.

CONCERN — 4. Right-sizing & reuse [GATING]: Phase 0 is “docs only, one commit; waiver for two roots” (L243), but its table enumerates at least 15 files once the ten audit files and two calculator reports are counted; the waiver addresses roots, not the eight-file limit. Fix: enumerate actual files and give an explicit size waiver or split dependency-ordered batches; use that enumeration to resolve the duplicate synthesis destinations at L251 and L259.

PASS — 5. Security [GATING]: The program limits the production probe to a read-only surface, requires Razor review of that surface and the edge function, and assigns registry/licence checks to dependency-introducing child plans; the distinct location-exposure defect is assessed under X2.

FAIL — 6. Failure modes [GATING]: The count is supposedly shown only when “less than 15 minutes old” (L165), but C4 supplies neither a verifiable response-generation timestamp nor expiry/revalidation on a long-open or resumed page; arrival in this view does not establish source freshness. Its close-date-only predicate (L167) also needs a verified guarantee that the response excludes future, withdrawn and incomplete records. Fix: define freshness provenance, timeout/invalid-schema/partial-response behavior, expiry and resume handling, and fixtures proving the count disappears when validity cannot be established.

CONCERN — 7. Change safety [GATING]: “Netlify instant rollback restores those together” (L110) describes deploy contents, not already cached browser assets or open tabs; S2 adds raster/image caching (L523), yet L796 concludes “Versioning is therefore required only for R2.” Fix: require content-versioned generated assets or an explicit cache/revalidation compatibility strategy for Netlify assets too, and test an old open page across upgrade and rollback. Do not assume changing the deployed files retracts cached responses.

CONCERN — 8. Data integrity & compatibility [GATING]: M3b introduces “one view-state parser” with year and class filters (L548), but the old-tab/saved-link fixtures in C1 are scoped to R2-changing releases (L111–117), leaving the actual URL-format change without an explicit compatibility contract. Fix: require M1a/M3b fixtures for existing public hashes, absent/new fields, malformed values and browser back/forward, with documented defaults and unchanged existing link meaning.

FAIL — 9. Verifiability [GATING]: “Every new live guard” must fail on the pre-fix production build (L149), but “The read-only probe ... lands here” in M1a (L348). A failure caused by missing `__ocProbe` proves no camera, render or timeline defect, and new regression guards need not fail on an otherwise-correct baseline. Fix: separate behavior-negative controls from missing-instrumentation failures; use identical instrumentation on broken/fixed builds, an independent browser-visible oracle, or a deployed controlled revert retaining the probe, and record the precise failing assertion plus deployed SHA for each claimed regression.

CONCERN — 10. Maintainability [GATING]: The conflict matrix acknowledges many shared files (L130–137), while L213 and the pre-mortem at L673 still claim “the only shared file is `registry.ts`”; Phase 0 also defines two audit-copy layouts (L251 versus L259). Fix: remove superseded instructions and select one canonical evidence index and schedule so future child authors do not have to arbitrate contradictory contracts.

FAIL — X2. Privacy & data stewardship [GATING]: “S0 changes `pageUrl` to origin + pathname” (L189) closes only one field: target `origin/main:public/tracker.js` still sends `referrer` (L56), raw CTA/navigation `href` values (L140/L150), and outbound `url` values (L180), which can carry query/fragment data; C3's center/zoom probe also makes “no user data” (plan L143) an inaccurate claim for a geolocated camera. Fix: allowlist and sanitize every emitted URL-bearing field, test actual beacon/fetch payloads with sentinel coordinates and sensitive queries, document the probe's coordinate exposure, and name the existing analytics records' access/retention owner and disposition. Rounding future hashes does not address already-collected records.

FAIL — X3. Evidence & source integrity [GATING]: “the floor must exceed 5,528,400 ha” (L475), inherited through X's “hero floor guard” (L396), encodes a preferred comparison as an acceptance condition; C5's required overlap dissolution (L178) can legitimately reduce the result. A smaller valid total must change the comparison, not fail the honesty gate. Fix: assert agreement with an independently derived, versioned total and make the comparison conditional on that total; define whether each year's figure is unique area or repeated harvest-event area before reconciling it with scrub tables to 2%.

CONCERN — X4. Audience, brand & money accuracy [GATING]: The recorded dollar-bar/PDF exception is explicit and is not itself a new blocker, but S0's rationale “The 'less than' floors it” (L306) confuses an upper-bound statement with flooring: 0.07% rounded down to one decimal is not 0.1%. Fix: retain the upper-bound phrasing only with its denominator, source date and derivation documented, and describe it accurately; keep K.4's paired panel/PDF removal acceptance.

CONCERN — X5. Concurrency & re-entrancy [ADVISORY]: C2 says S2-pages rebases after M2 and T follows S2-pages (L131–132), but the graph allows S2-pages alongside “anything in Lane M” (L658) and gives T only M1b as a prerequisite (L665); serial pushes alone do not enforce these semantic dependencies. Fix: distinguish build dependencies from merge/release dependencies in the graph, include all C2 edges, and assign one release coordinator to record the guarded deploy SHA and block both lanes after a red result.

CONCERN — X6. Operability & observability [ADVISORY]: “after deploy ... guards ... green” (L733) does not explicitly prove that the production URL serves the candidate being approved, and “retries plus ... 75 s” (L711) can silently weaken the 30-second guard (L344). Fix: wait for the intended deploy identity, retain attempt-level timings, distinguish infrastructure retries from performance acceptance, and specify the action when guards cannot run or Lee cannot perform the required rollback.

PASS — X8. Dependencies, performance & cost [ADVISORY]: C7 assigns package verification, lockfile pinning, 16 GB build capacity and a bounded prototype agent budget; the program also names landing byte and first-frame budgets. The missing timeout outcome is already a completeness blocker, rather than a reason to duplicate a cost failure.

## Stress test 1 — Pre-mortem

Three months out, the type-specific worst case is a persuasive public environmental story presenting unsupported land/carbon figures or a false open-comment opportunity, while location-bearing analytics remain collected despite the claimed privacy fix.

1. **A false-negative control certifies another ineffective fix.** M1a's old build fails because the probe is missing; the new build passes because its probe exists or reports intended rather than observed state. Subsequent deploys repeat the audit's original “shipped but not fixed” failure. The warning was the instrumentation change sharing the same boundary as the supposed behavioral negative control.
2. **The spike stalls, but the map lane keeps shipping.** Step 2 cannot reconcile dissolved totals with existing scrub tables, videos never arrive, and the 14-day clock never starts. B′ still becomes eligible after M3b; exaggerated coarse imagery survives behind its explanatory caption. The warning was the absence of a story-honesty dependency and a failure-triggered fallback, despite the claim that honesty no longer waits on the experiment.
3. **Privacy and civic freshness are fixed only on the happy path.** A shared URL is sanitized as a pageview but sent whole by another event; meanwhile a suspended tab resumes with an expired comment count. The warning was field-specific URL cleanup and response-arrival freshness without full egress tests or page-lifecycle expiry tests.

## Stress test 2 — Load-bearing assumptions

- **The new probe measures actual rendered state and supports a meaningful old-build comparison. Confidence: low until demonstrated.** Its absence on the baseline is explicit. If wrong, the main proof of remediation is invalid. Resolve before M1a implementation by specifying the instrumentation-neutral negative control and its expected assertion.
- **X's reusable data products will complete within the spike budget. Confidence: medium-low.** Builds are known to be large, and new dissolve/reconciliation constraints can expose differing area definitions. If wrong, S1-lite and the video-triggered fallback have no guaranteed start. Resolve before implementation with a failure exit and a separately owned minimum honesty deliverable.
- **The FOM response supports complete, current and unambiguous open-window counting. Confidence: unverified in this review.** The plan cites a prior endpoint probe, not a schema/completeness/freshness contract. If wrong, the CTA invents an actionable count. Resolve before implementation by preserving a representative response and testing pagination, dates, status, malformed data, age and midnight/resume behavior; otherwise show the numberless link.
- **Current decisions permit reducing Lee's live QA to three checks. Confidence: low.** The inspected canonical decision expressly assigns visual/map QA to Lee. If wrong, the plan substitutes automation for a standing acceptance requirement without authorization. Resolve before releases by preserving the requirement or recording an explicit amendment.

## Stress test 3 — Inversion

Writing every child plan now would win if interfaces and data definitions were stable; the plan itself establishes that they are not, so that rejected alternative remains weak. Folding repairs into B–E would win if they could ship just as early without violating Ruling A; those conditions are also absent. But the plan's inversion at L719 asks only whether the audit findings were false positives, which misses a credible alternative: complete a small, independently scheduled honesty/data release while keeping the creative spike separate. That alternative wins when the spike can stall, area definitions need reconciliation, or the animation is rejected. All three are already recognized possibilities. Parallel lanes remain justified; making truthful public imagery depend on successful prototype preparation does not.

## Overall verdict

FAIL — the gate is blocked. The program has the right stated target and can defer implementation detail to critiqued child plans, but its current contracts still permit Phase B before story honesty, meaningless regression evidence, incomplete privacy remediation and unsupported freshness claims. The prior revision log's claim that the waves and graph are reconciled is contradicted by the executable dependencies. Fix the program-level contradictions first; downstream critics should not have to choose which binding instruction to ignore. This verdict does not overturn Lee's explicit temporary dollar-bar exception or require abandoning the animation experiment.

## Prioritized must-fix list

1. **P0 — Make verification falsifiable:** define instrumentation-neutral negative controls, exact observed outcomes and deploy identity; missing probes and relaxed timeouts cannot count as proof.
2. **P0 — Complete location-data containment:** sanitize all analytics URL fields, test actual outgoing payloads, account for probe coordinates and assign existing-record retention/access disposition.
3. **P1 — Repair the execution graph:** gate B′ on shipped story honesty, add S1-lite to the waves, handle spike failure/timeout independently of video delivery, and encode C2 merge/release dependencies.
4. **P1 — Make civic claims conditional on evidence:** remove the forced hero threshold, settle unique-area versus event-area semantics, and define FOM freshness/completeness/expiry fixtures and the numberless failure path.
5. **P1 — Reconcile acceptance and recovery contracts:** preserve or explicitly amend Lee's live-QA ruling; unify layer-state transitions; specify URL compatibility and cached-asset behavior across upgrade/rollback.
6. **P2 — Remove operational ambiguity:** enumerate/waive or split Phase 0's oversized batch, choose one evidence destination, remove the false single-shared-file claim, correct the flooring rationale, and define inconclusive-guard handling without relaxing performance budgets.
