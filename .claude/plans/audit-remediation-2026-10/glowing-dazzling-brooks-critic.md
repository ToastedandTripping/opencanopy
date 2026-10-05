## Applicability

Project type: multi-release remediation program for a public civic-data website, including geospatial data builds, analytics, scientific estimates, and MARVIN-operated release coordination. This is a program review, not approval of its future child implementations.

Active core dimensions: 1 Problem-fit [GATING]; 2 Approach soundness [GATING]; 3 Completeness [GATING]; 4 Right-sizing & reuse [GATING]; 5 Security [GATING]; 6 Failure modes [GATING]; 7 Change safety [GATING]; 8 Data integrity & compatibility [GATING]; 9 Verifiability [GATING]; 10 Maintainability [GATING].

- X1 Physical & human safety — N/A; does not fire: browser rendering and data processing do not control hazardous hardware or physical outputs.
- X2 Privacy & data stewardship — fires [GATING]: analytics handles location-bearing URLs, identifiers, and receiver-added IP addresses.
- X3 Evidence & source integrity — fires [GATING]: the public story, area totals, carbon estimates, and comment-period counts inform civic decisions.
- X4 Audience, brand & money accuracy — fires [GATING]: the program includes public dollar estimates and generated PDFs, including an explicitly authorized temporary exception.
- X5 Concurrency & re-entrancy — fires [ADVISORY]: parallel worktrees share release state, host build resources, and production.
- X6 Operability & observability — fires [ADVISORY]: production deployments, recovery, timers, and receiver changes require operational ownership.
- X7 Self-modification safety — fires [GATING]: P0b adds MARVIN's release-scheduling/check-push automation and shared state under `~/marvin/state`, even though the script resides in OpenCanopy; the automation must fail closed and preserve human recovery.
- X8 Dependencies, performance & cost — fires [ADVISORY]: large raster builds, new packages, live APIs, and animation budgets.

Review basis: the complete supplied plan, plus read-only inspection of OpenCanopy `origin/main` at `3db58239a9dbabaf13c59121e9eecb82974191e5`, including its standing decisions and tracker/crash-report code. Line references below refer to the supplied plan unless explicitly marked as code. No production receiver inspection or live deployment test was performed; those claims remain unverified.

## Dimension verdicts

PASS — 1 Problem-fit [GATING]: The grilled intent addresses the audit remediation and calculator redesign, and Phase 0 explicitly amends the relevant standing decisions rather than silently overriding them.

PASS — 2 Approach soundness [GATING]: Separate just-in-time child plans, plumbing before Phase B, and an independently shipped S1-lite are coherent program boundaries; the creative spike no longer owns the honesty repair.

CONCERN — 3 Completeness [GATING]: “After that date, the story reader omits the coarse cutblock overlays” (670–674) lacks continuously visible and resumed-tab expiry criteria, while “the counters” remain (673) despite “counter render-gated on the data” (815); require active expiry/resume fixtures and define which independently sourced counters remain in the fallback.

CONCERN — 4 Right-sizing & reuse [GATING]: S0a's authoritative list says eight files across `src/`, `public/`, and root (438–440), but its waiver covers “two roots” (640–641), and S0 detail still says “About 6 files” (711); consolidate the actual list and explicitly waive all three roots before child-plan sizing.

PASS — 5 Security [GATING]: The FOM proxy has a fixed upstream, rejects parameters, limits method/size/time, and the map probe exposes no setters; the concrete personal-data defect is assessed under X2.

CONCERN — 6 Failure modes [GATING]: C4 allows data resolution only from “loading or slow” (294), leaving an errored source's later successful response without a defined transition; promote the carried M3a “error-to-recovery” concern (1378) into the binding table and test retry, recovery, and stale-generation success separately.

PASS — 7 Change safety [GATING]: WIP preservation, versioned external data, known-good deploy recording, human-owned rollback, and corrective-release authorization provide explicit recovery boundaries; the plan candidly states that a failed candidate remains live until Lee acts.

CONCERN — 8 Data integrity & compatibility [GATING]: C1 versions “overlays, /raster, story data JSON” (120), but its rollback failure contract only handles “a missing overlay” (137–139); extend graceful degradation and lazy-load-after-rollback fixtures to missing totals JSON and raster resources, including preventing stale counters paired with unrelated imagery.

CONCERN — 9 Verifiability [GATING]: The payload test merely asserts the sentinel fragment and token query do not appear “anywhere in any payload” (415–416); URL-encoded mail bodies can evade literal matching, so exercise actual crash-report clicks and inspect decoded payload values and stored rows, with a negative control retaining the old email-click handler.

CONCERN — 10 Maintainability [GATING]: “One overlay build” (893) and the pre-mortem's “S1 does one build” retain obsolete scope after S0b became a separate rebuild, while 0.6 still lists unsplit “S0” (613); remove or label obsolete operative statements and make the graph and child-plan catalogue the sole current schedule.

FAIL — X2 Privacy & data stewardship [GATING]: “S0 fixes all of them” (411) omits `email_click.email`, which currently receives a crash-report mailto body containing the full page URL; add client and legacy-receiver handling for this field, encoded-location fixtures, and historical-record discovery beyond top-level URL fragments before claiming C6 containment.

CONCERN — X3 Evidence & source integrity [GATING]: The 21-day coarse-picture bound (669–675) is only tested “on both sides of the date,” which can pass with mount-only checks; require a mounted reader crossing the deadline, bfcache/background resume, and no automatic renewal of the original deadline on unrelated rebuilds or redeploys.

PASS — X4 Audience, brand & money accuracy [GATING]: New copy requires Lee's approval and sourced derivations; the existing dollar figure is explicitly grandfathered by Lee in both panel and PDF, with removal/replacement required in K.4, so that authorized exception is not itself a new blocker.

CONCERN — X5 Concurrency & re-entrancy [ADVISORY]: “Reclamation is serialized through the same mkdir lock” (194) does not explain how two reclaimers serialize removal of an already-existing stale directory; P0b must specify an atomic reclaim protocol and crash points around persistent token allocation, and prove that a losing reclaimer cannot remove a successor's live lease.

CONCERN — X6 Operability & observability [ADVISORY]: SO1 has an owner and closure artifact, but “no OpenCanopy release depends on it” (454) and the revision log's bare “an overdue state” (1379) leave ongoing exposure without an actionable overdue threshold; set a date, escalation owner, and recurring visible open-status report without treating elapsed time as authorization to delete records.

CONCERN — X7 Self-modification safety [GATING]: `check-push`'s four GO predicates (180–184) omit the halt state and corrective-release authorization that C2 otherwise requires; explicitly require readable reconciled state, a green predecessor or a recorded one-shot corrective authorization bound to this candidate, and nonzero NO-GO exits with executable command-level tests and documented human repair.

CONCERN — X8 Dependencies, performance & cost [ADVISORY]: “Only one heavy build (8 GB or more)” (475) is circular if classification depends on observed peak after launch; require conservative pre-launch classification of unmeasured builds and account for child-process ownership before treating a dead launcher PID as a recovered resource lock.

## Stress test 1 — Pre-mortem

It is three months out and the program has failed. The type-specific worst cases are a location leak declared contained, misleading public harvest imagery persisting beyond its authorized exception, and release automation approving a push during a halted incident.

1. **The privacy report says contained while crash reports still disclose location to analytics.** The user clicks “Report this issue”; telemetry is emitted before the user decides whether to send the email. At the inspected commit, `src/components/ui/MapErrorBoundary.tsx:28–38` embeds `window.location.href` in the encoded mail body. `public/tracker.js:162–165` emits `email_click` with `emailLink.href.replace('mailto:', '')`, preserving the query and body. C6 enumerates page/referrer/link fields but not this email field. A literal `#lat=...` assertion can pass while `%23lat%3D...` is stored. The client inventory and SO1 acceptance need to include this real producer, not merely a fabricated legacy pageview. Existing-record counts at 464–465 also need to recognize encoded mail bodies. This finding concerns analytics transmission, separately from an intentional user-sent bug-report email.
2. **The 21-day exception quietly becomes longer.** A reader opened before the deadline continues displaying its already-mounted map; tests that freshly mount immediately before and after the date are green. An unrelated deployment may also reset a deadline calculated as “release date plus 21 days.” The missing warning was the absence of the explicit expiry/resume behavior already demanded for the FOM count in C4. Preserve the original sunset and test a live reader crossing it; do not simply assert two clock snapshots.
3. **A red deploy is followed by a routine release.** A new holder has a current token, matching local SHA/parent, and no deploy in flight, so an implementation following the enumerated GO checks can approve it even though the ledger is halted. General prose says to halt, but the actual authorization predicate must include that state and the narrow corrective exception. A harness test must invoke the CLI with those otherwise-valid conditions and prove NO-GO.

## Stress test 2 — Load-bearing assumptions

- **The named tracker fields exhaust location-bearing telemetry — confidence: low, contradicted by inspected code.** Consequence: S0a and SO1 can pass their current fixtures while the crash-report path continues leaking coordinates. Resolve before implementing the privacy changes: expand the producer inventory and test both client payloads and legacy receiver storage.
- **A reader-enforced sunset bounds the coarse-picture exception — confidence: medium.** Feasible, but continuous display, resume, and preservation of the first deadline are unspecified. Consequence: a public overstatement survives the stated bound. Resolve the acceptance contract before S0b implementation.
- **The release tool makes C2's prose executable — confidence: medium-low until P0b's child plan.** Lease reclamation and the complete authorization predicate are still deferred. Consequence: either stale owners can alter shared state, or recovery deadlocks, or a halted program emits GO. Resolve before implementing P0b, using real subprocess/CLI tests rather than mocked successful ledger calls.
- **Every aggregate can adopt the area contract without semantic drift — confidence: medium.** Consumer inventory, shared fixtures, and the label-preserving mutation are useful evidence requirements, but the TypeScript/Python implementations and independent totals do not yet exist. Consequence: apparently consistent public values disagree numerically or use different harvest/overlap semantics. Child acceptance must prove this before S1-lite, M2, and B′ release.

## Stress test 3 — Inversion

Writing every child plan now would beat just-in-time planning if cross-cutting interfaces were stable and resolving them up front eliminated repeated work. That condition is only partly true: privacy telemetry schema, release authorization, and sunset behavior are already shared contracts and should be settled now; late-phase visual and map implementation details will still change, so writing all C′/D′/E′ plans now remains unattractive. Folding plumbing into B–E would win if the audit defects were not independently reproducible or if B could ship without relying on broken map entry points; the plan's evidence and dependencies do not establish either condition. A single active release lane would beat two lanes if manual coordination and about 22 pushes dominate throughput; the admitted shared surfaces make that plausible, so measure it after the first few releases rather than assuming two worktrees guarantee faster delivery.

## Overall verdict

FAIL — the gate remains blocked by X2. The supplied plan has a concrete omitted telemetry producer: encoded crash-report mail bodies bypass its named URL-field controls. Its current payload and storage fixtures could therefore certify an incomplete privacy repair. The remaining concerns are bounded contract corrections that belong in the named child plans; they do not justify redesigning the program or re-litigating Lee's dollar exception. Approval should follow correction of the privacy inventory and acceptance criteria, with the release and sunset requirements made unambiguous before their child implementations.

## Prioritized must-fix list

1. **Gating: close the actual email-click leak.** Add `email_click.email` to S0a, SO1, privacy disclosures, and historical exposure discovery. Prefer dropping mailto payload content from analytics. Exercise the real crash-report link, decode encoded values, and verify legacy-format storage behavior with a failing old-handler control.
2. **Make release authorization executable.** Include halted/unverified state and candidate-bound corrective authorization in `check-push`; require nonzero failure exits and real CLI tests. Specify crash-safe reclaim/token persistence and preserve explicit human repair.
3. **Make the sunset a runtime boundary.** Preserve the first S0b deadline, expire an already-visible reader, recheck on resume, and define counter behavior when imagery is deliberately omitted.
4. **Complete failure acceptance.** Cover missing JSON/raster assets after rollback and error-to-recovery layer transitions.
5. **Close the remaining operational/specification concerns.** Give SO1 an overdue threshold and owner; classify heavy builds before launching; reconcile S0a roots/file counts and remove obsolete build/schedule statements.
