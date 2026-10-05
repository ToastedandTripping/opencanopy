# Applicability

Project type: public civic-data application remediation program, with parallel worktrees, analytics, generated geographic assets and new automation governing MARVIN release sessions. I read the supplied plan and checked standing decisions using `git show origin/main:.claude/DECISIONS.md` in the target repository. This reviews program contracts, not unwritten child implementations.

Active core dimensions: 1 Problem-fit [GATING]; 2 Approach soundness [GATING]; 3 Completeness [GATING]; 4 Right-sizing & reuse [GATING]; 5 Security [GATING]; 6 Failure modes [GATING]; 7 Change safety [GATING]; 8 Data integrity & compatibility [GATING]; 9 Verifiability [GATING]; 10 Maintainability [GATING].

X1 Physical & human safety — N/A; does not fire: maps and software builds do not control hardware or hazardous physical output.
X2 Privacy & data stewardship [GATING] — fires: location-bearing analytics, receiver-added IPs, geolocation and stored personal records are in scope.
X3 Evidence & source integrity [GATING] — fires: harvest, carbon and comment-period claims inform public civic decisions.
X4 Audience, brand & money accuracy [GATING] — fires: public copy and calculator dollar figures/PDF are in scope; money makes this gating despite the explicit temporary exception.
X5 Concurrency & re-entrancy [ADVISORY] — fires: parallel sessions, shared ledgers, lease reclamation and detached builds.
X6 Operability & observability [ADVISORY] — fires: deployed endpoints, production guards and release recovery.
X7 Self-modification safety [GATING] — fires: P0b adds automation controlling MARVIN sessions’ authority to release; placing the script in the application repository does not remove that function.
X8 Dependencies, performance & cost [ADVISORY] — fires: packages, WebGL prototypes, expensive builds and performance budgets.

# Dimension verdicts

PASS — 1 Problem-fit [GATING]: The grilled intent matches the remediation program, and Phase 0 explicitly amends conflicting story rulings while retaining Lee’s deploy authority and calculator exception.
CONCERN — 2 Approach soundness [GATING]: Reclamation is “serialized through the same `mkdir` lock,” but an occupied stale directory cannot itself admit a reclaimer; specify an atomic reclaim protocol, persistent token allocation and crash recovery in P0b’s child plan.
FAIL — 3 Completeness [GATING]: S0b orders removal if S1-lite “fails its truth checks and stops,” while X says in that case “the story stays as S0 left it”; replace these competing instructions with one authoritative fallback, an owner and a release/recovery path.
CONCERN — 4 Right-sizing & reuse [GATING]: P0b is “Simple tier” despite combining identity, durable state, fencing, takeover and heavy-build locking; require a concrete file/dependency table and a justified split or shared primitive before implementation.
PASS — 5 Security [GATING]: The fixed-upstream, bounded endpoint and read-only probe establish appropriate program-level boundaries, with edge security review assigned to child plans.
CONCERN — 6 Failure modes [GATING]: C4 permits data resolution from “loading” or “slow” but does not define recovery when an errored tile later loads in the same generation; add explicit retry/recovery transitions and fixtures so recovery does not require a pan or toggle.
PASS — 7 Change safety [GATING]: Versioned external objects, retained assets, rollback-tab fixtures, preserved checkout edits and human recovery cover the principal changes; publication fencing is separately blocking under X7.
FAIL — 8 Data integrity & compatibility [GATING]: C5b says raw popup area “is not a contract consumer,” then says “Every consumer ... (story, map legend and popups, leaderboard) reads that version” and assigns popup migration to M2; reconcile the inventory, migration table, labels and mixed-version test around aggregate versus raw-feature semantics.
FAIL — 9 Verifiability [GATING]: The timeline oracle samples a fire from “year+1, which must be unpainted”; hiding the fire layer satisfies this while probe and readout agree, so require positive and negative fire witnesses across year changes and mutation-test hidden/frozen rendering independently of the probe.
CONCERN — 10 Maintainability [GATING]: “Single binding scope” still leaves competing S0 file counts and X’s contradictory failure instruction; consolidate current requirements and remove executable-looking superseded instructions rather than relying on readers to infer precedence.
PASS — X2 Privacy & data stewardship [GATING]: C6 correctly remains open until legacy payloads are sanitized in storage, includes receiver-added fields and leaves historical disposition with Lee; SO1 is an unresolved dependency, not a completed fix.
CONCERN — X3 Evidence & source integrity [GATING]: “Coarse imagery never stays up open-ended” cannot be guaranteed by an unscheduled future human-pushed corrective release; enforce the sunset in the shipped reader or state the human-dependent limitation and track exposure until removal is verified.
PASS — X4 Audience, brand & money accuracy [GATING]: Copy requires approval, comparisons depend on sourced totals, and K.4 must replace the expressly accepted dollar figure in both panel and PDF; the exception does not establish that figure’s accuracy.
CONCERN — X5 Concurrency & re-entrancy [ADVISORY]: “A lock whose PID is dead (`kill -0`) is stale” does not establish that detached descendants stopped and is vulnerable to PID reuse; track process start identity and actual build lifetime, with parent-killed/child-survives and PID-reuse fixtures.
CONCERN — X6 Operability & observability [ADVISORY]: SO1 has no scheduling bound and the overlay sunset has no durable trigger or named acting owner; add overdue states and require evidence or explicit unresolved disposition at program close.
FAIL — X7 Self-modification safety [GATING]: “`release-ledger.mjs` rejects any write or release ... so a resumed former owner cannot act” does not fence Lee’s separate shell push or an already-issued request; require a fresh token/SHA/remote-head check at the human push boundary and test delayed requests after takeover, or explicitly withdraw the fail-closed claim and describe cooperative enforcement.
CONCERN — X8 Dependencies, performance & cost [ADVISORY]: “Only one heavy build (8 GB or more)” leaves classification of unmeasured jobs unspecified; enumerate covered commands and conservatively reserve the host lock for new raster jobs until their process trees finish.

# Stress test 1 — Pre-mortem

It is three months out and the program failed. The type-specific worst case is public civic evidence overstating harvested area, legacy analytics continuing to collect location data, and release automation failing open at publication.

1. S1-lite fails reconciliation. One session follows S0b’s removal instruction; another follows X’s instruction to retain S0’s picture. Lee is unavailable for a corrective push. Known coarse overstatement remains indefinitely. A caption mitigates interpretation but does not make the extent accurate; contradictory fallback text and the missing removal trigger were the warning signs.
2. Lane A issues a push request, stalls and loses its lease. Lane B takes over. Lee later follows A’s old instructions, triggering Netlify outside the ledger tool. Rejecting A’s subsequent ledger writes cannot prevent that deployment. The request/publication gap was visible in the plan.
3. Fire rendering disappears while global year and text remain correct. The future-fire absence test passes, while the separate province test finds another enabled layer. The “independent” oracle never required the timeline’s intended positive rendering outcome.

# Stress test 2 — Load-bearing assumptions

- **Every publication passes an effective authority check. Confidence: low as written.** The actual push is outside the proposed tool. If false, stale requests publish despite green fencing tests. Resolve the consumption-time token/SHA check and reclaim protocol before P0b implementation.
- **Aggregate and raw hectares have one unambiguous contract. Confidence: medium conceptually, low in the text.** If false, M2 either changes raw popup meaning incorrectly or omits an aggregate while label-only tests pass. Resolve the consumer inventory before S1-lite/M2 implementation.
- **Truth-check failure or day 21 causes prompt removal. Confidence: low.** It needs another human deployment and has competing instructions. If false, known coarse exaggeration persists. Resolve mechanism and ownership before S0b ships.
- **SO1 can be authorized, delivered and verified in storage. Confidence: medium, unverified.** It depends on a separate session, access and Lee’s approval. If false, old-client exposure continues after S0a. Resolve before SO1 implementation and never call S0a containment.

# Stress test 3 — Inversion

The rejected “write every relay plan now” alternative wins where interfaces are stable and operational contracts must be settled before any lane can proceed. Those conditions already hold for P0b’s authority protocol, SO1’s cross-repository boundary and the interim-story removal mechanism. That justifies resolving these foundations now, not writing all of C–E early. Folding everything into B–E would win only if those phases could ship the urgent plumbing and honesty work promptly without violating Ruling A; the plan supplies no evidence that this condition holds.

# Overall verdict

**FAIL — the gate remains blocked.** The staged program fits the request, and this review does not reopen Lee’s calculator exception or demand full implementations of future relays. The blockers are specific program-contract defects: mutually exclusive fallback instructions, incompatible area-consumer definitions, a timeline oracle that passes blank rendering, and fencing that stops at the ledger rather than publication. Resolve these before approval; carry the remaining concerns into explicit child-plan acceptance conditions.

# Prioritized must-fix list

1. **P0 — Publication authority:** bind the human push to a fresh token, exact candidate SHA and reconciled remote/deploy state; test stale queued requests and atomic reclaim/crash behavior, and accurately state human-enforcement limits.
2. **P0 — Interim story fallback:** choose one failure/timeout outcome, remove X’s conflicting instruction, and assign an enforceable removal mechanism or an honestly stated human commitment with durable ownership.
3. **P1 — Area semantics:** reconcile C5b’s consumer inventory, migration table and route tests; include Discover explicitly and distinguish raw popup values from aggregate-version assertions.
4. **P1 — Timeline proof:** assert both visible and absent known fire features across year changes; prove hidden and frozen layers fail even when probe/readout state changes correctly.
5. **P2 — Operational follow-through:** specify build process identity/lifetime, status recovery, SO1 scheduling and close criteria; consolidate S0 scope and size P0b’s child plan to its actual coordination risk.
