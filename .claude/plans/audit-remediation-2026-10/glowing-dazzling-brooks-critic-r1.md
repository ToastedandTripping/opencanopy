## Applicability

Project type: multi-relay remediation of a deployed public forestry map, civic data story, and carbon calculator; includes geospatial data generation, research, public monetary comparisons, and parallel deployment work.

Active universal dimensions: 1 Problem-fit [GATING]; 2 Approach soundness [GATING]; 3 Completeness [GATING]; 4 Right-sizing & reuse [GATING]; 5 Security [GATING]; 6 Failure modes [GATING]; 7 Change safety [GATING]; 8 Data integrity & compatibility [GATING]; 9 Verifiability [GATING]; 10 Maintainability [GATING].

- X1 Physical & human safety — N/A; does not fire: this plan changes software and data displays, not hazardous equipment or physical control paths.
- X2 Privacy & data stewardship — fires [GATING]: geolocation, shared map URLs, drawn selections, and session analytics handle potentially identifying visitor information; the privacy page is itself in scope.
- X3 Evidence & source integrity — fires [GATING]: public claims about harvest, old forest, carbon, company attribution, and open comment periods inform civic decisions.
- X4 Audience, brand & money accuracy — fires [GATING]: public calculator dollar comparisons and exported PDFs involve money, beyond ordinary visual branding.
- X5 Concurrency & re-entrancy — fires [ADVISORY]: parallel worktrees, long data builds, asynchronous map state, and shared production deployment.
- X6 Operability & observability — fires [ADVISORY]: a deployed website, edge proxy, live upstream counts, and per-relay production checks.
- X7 Self-modification safety — N/A; does not fire: the plan invokes existing MARVIN gates and writers but does not propose changing their implementations, skills, hooks, or automation. Application test-harness changes do not alone trigger this dimension.
- X8 Dependencies, performance & cost — fires [ADVISORY]: new development packages, possible rendering libraries, model lookups, large raster builds, and live service calls.

Review basis: the complete supplied plan, the local audit synthesis, both calculator research sidecars, MARVIN's available DECISIONS file, and relevant local project files. The target project's `.claude/DECISIONS.md` was not present at the specified checkout; conformity to its historical rulings is therefore not independently established. This is a program-level review: implementation details may be deferred, but dependencies, acceptance contracts, and release boundaries cannot.

## Dimension verdicts

1. Problem-fit — CONCERN [GATING]: The Intent matches the requested remediation program, but Phase 0 records A–H while omitting the new X1–X5 animation rulings; fix the decision-record inventory and identify the authoritative project decision history before amendments.
2. Approach soundness — FAIL [GATING]: “S1 and S2 are held” while “The pictures behind those sentences change in S1” leaves the known false pictures serving throughout an unbounded prototype/selection process; add an immediate honest static fallback or removal of misleading frames, independent of concept selection.
3. Completeness — FAIL [GATING]: “Write and critique the three Wave-1 relay plans: S0, M1 (a and b), S1” contradicts the actual Wave-1 X spike, and the graph omits the rejected-prototype S1/S2 path; reconcile all schedules, specify X's review entry point, and map every finding to an acceptance criterion or explicit parking ruling.
4. Right-sizing & reuse — CONCERN [GATING]: “batches of at most 8 files and one subsystem root” is imposed on children but Phase 0's own cross-root documentation work is not batched or waived; add its file/dependency table or a justified waiver, and make the storyboard/spike resource cap explicit.
5. Security — CONCERN [GATING]: “read-only React hook in place of the dev-only handle” introduces production inspection surface without defining what it exposes, while “Razor at high effort” supplies review but no proxy security contract; specify a narrow immutable inspection API and bounded, validated upstream requests before the relevant relays.
6. Failure modes — FAIL [GATING]: The FOM fallback “never shows a stale number” cannot hold without an expiry and response-freshness policy, and “loading, ok or empty from queryRenderedFeatures on idle” can misclassify not-yet-loaded or filtered data as empty; require explicit freshness, timeout, partial-data, cancellation, and terminal-state contracts with failure fixtures.
7. Change safety — FAIL [GATING]: “rollback (Netlify instant rollback to the previous deploy)” does not restore separately published r2.dev tile/data objects; retain versioned assets and manifests, bind each release to them, and prove restoration of a complete app/data release before any asset replacement.
8. Data integrity & compatibility — FAIL [GATING]: “per-layer archives” and “renderer keyed by tile URL” change the reader/data contract without specifying how old tabs, cached clients, and saved links remain usable; introduce immutable compatible versions, retention, and migration/legacy-link fixtures before T.
9. Verifiability — FAIL [GATING]: “a fresh-context search moves the hash” does not prove the camera moved, and “requests .pmtiles within 20 s” does not prove a data tile rendered; require independent camera/visible-feature assertions, known-defect negative controls, and explicit milestone gates for both S1′ and fallback S1/S2.
10. Maintainability — CONCERN [GATING]: “Leave the evidence in ~/marvin/research/...” makes tracked claims depend on a machine-local directory, while “Jen reviews against non-goal 3” references no defined non-goal; archive a portable evidence bundle/index and repair dangling references and methodology-document ownership.
X2. Privacy & data stewardship — CONCERN [GATING]: “geolocate capped at z12” limits display zoom, not coordinate precision or telemetry exposure; document coordinate flow through links, analytics, requests, and logs, then verify minimization, access and retention against the privacy page.
X3. Evidence & source integrity — FAIL [GATING]: “carbon fraction 0.5; roots per Li et al. 2003), stated as a floor” promotes an estimate into an unsupported lower bound, and “every frame derives in code” cannot ensure area or temporal truth; require uncertainty-aware wording and independently reconciled geometry/time/coverage fixtures before approving public claims.
X4. Audience, brand & money accuracy — CONCERN [GATING]: The explicit exception that the dollar bar “stays until the redesign ships” is accepted user scope, but the synthesis says “The PDF repeats the comparison” and the plan never defines that export's interim treatment; specify the exception's UI/PDF scope, disclosure and final removal checks, without silently overruling Lee.
X5. Concurrency & re-entrancy — FAIL [ADVISORY]: “The lanes share one file” and “T can run alongside D, since it touches the pipeline, not the UI” ignore shared release/data contracts, metadata, tests and documentation; replace these claims with an ownership/conflict matrix and serialize merge–deploy–verify–rollback transactions.
X6. Operability & observability — CONCERN [ADVISORY]: “after deploy ... green” names checks but no failed-release owner, stop rule or deploy identity; record commit/deploy/data versions with results, halt subsequent releases on failure, and name who restores and rechecks service.
X8. Dependencies, performance & cost — CONCERN [ADVISORY]: “@mapbox/vector-tile pbf @types/geojson,” possible regl, and “pinned libcbm” have no package-verification or bounded spike/service budget contract; require verified identities, locked versions/licences, build-memory headroom, request limits, and a time/resource cap before their introducing plans run.

## Three stress tests

### 1. Pre-mortem

It is three months out and the remediation has failed. The type-specific worst case is a persuasive public film and calculator publishing false civic and monetary claims with apparent test-backed authority.

1. **The correction is indefinitely deferred.** S0 removes sentences, but the fivefold inflated overlays and undated baseline persist while Lee chooses a concept and S1′ waits for implementation. “If Lee picks neither” covers rejection, not no decision or a delayed build. The early warning was treating honest production imagery as dependent on a creative experiment. Ship a minimal truthful interim view first; do not impose the calculator's specifically accepted delay on the story.
2. **A tile release breaks both current and rolled-back clients.** T publishes reorganized archives while D or another lane deploys a reader. A guard fails; Lee rolls Netlify back, but the old asset layout is gone. Worktrees and serialized pushes do not isolate remote objects, deployment completion, or CDN caches. The warning was equating file independence with runtime independence.
3. **The tests certify the wrong thing.** Search updates the URL but the map stays put; an archive request succeeds while data remains invisible; a stale FOM count says people can still comment. Mutation tests pass because they exercise these proxies. The warning was acceptance criteria that never observe the actual user outcome or time-dependent validity.

### 2. Load-bearing assumptions

- **A Netlify rollback restores the whole release — low confidence; resolve before asset publication.** The plan itself puts tiles on r2.dev. Unless app and immutable data versions are coupled, rollback restores only one side and can worsen incompatibility. Demonstrate an old client and a rolled-back deploy reading retained assets.
- **The lanes and late tile work are independent — low confidence; resolve before concurrent execution.** M2 edits root app metadata; S2-pages changes fonts/cache configuration; every relay writes ROADMAP/handoff and tests; K.4 and M3b share map integration. The consequence is lost updates or verification against a superseded release, even without a textual merge conflict.
- **The chosen story inherits every honesty/performance requirement — low confidence; resolve before X's data work.** The inherited list omits explicit record-coverage/start-year requirements and the verification milestone still says “After S2.” Reproducible animation can faithfully reproduce biased records. Specify shared acceptance criteria for both branches, including dated-only baselines, overlapping polygons, fire/harvest overlap, per-year totals and visible composition.
- **A default carbon conversion plus omitted pools proves a floor — low confidence; resolve before K.3 approves labels.** The research sidecar calls live above-ground and root carbon “SUPPORTED WITH RANGE,” with conversion uncertainty, while the teardown says biomass fields are derived. Omitting pools does not prove all remaining estimates are conservative for every selection. Preserve model provenance, units, uncertainty, and the distinction between rounding down and establishing a scientific lower bound.

### 3. Inversion

The rejected alternative “Write every relay plan now” wins only for interfaces and release contracts that later work must share. Those conditions already hold for URL state, the shared panel, tile manifests, source-total semantics and deploy rollback. Fix those contracts now; leave per-file implementation plans just in time. The rejected idea of folding everything into B–E remains a poor fit for immediate plumbing, but the plan also implicitly rejects a minimal correction before the animation experiment. That minimal path wins whenever concept selection is slower than the time acceptable for known false imagery to remain public; the plan provides no bound that makes the opposite true. Its current inversion—whether the audit P0s were false positives—does not test these actual design choices.

## Overall verdict

FAIL — block approval until the program's honesty, release-safety and verification contracts are repaired. Just-in-time relay plans are reasonable, but they cannot retroactively make the program's false independence claim, incomplete fallback graph, or code-only rollback safe. This review does not demand every implementation detail now or revoke Lee's explicit dollar-bar exception; it requires truthful interim story output, branch-complete sequencing, versioned data releases, observable user outcomes, and evidence labels no stronger than their sources before downstream plans inherit them.

## Prioritized must-fix list

1. Decouple an immediate honest production story fallback from X/S1′; define delayed selection as well as rejection, and reconcile Phase 0, waves, graph and milestones.
2. Define immutable app/data release identities, backwards compatibility, retained assets and tested rollback; replace claimed lane independence with a conflict matrix and serialized deployment verification.
3. Strengthen guards to observe camera movement and rendered data; specify load/error/partial states and expiring FOM counts, with independent negative controls.
4. Replace unsupported carbon “floor” language with sourced ranges; define area/time/overlap truth checks across both story outcomes and clarify the dollar exception's PDF scope.
5. Complete Phase 0's decision and batching inventory; archive portable evidence, resolve missing references, and set concrete privacy, production-inspection, dependency and operational contracts for the child plans.
