# Critic: beta-resequence.md (round 2 of 3)

Plan: `.claude/plans/audit-remediation-2026-10/beta-resequence.md` (amendment to `glowing-dazzling-brooks.md`), as revised after round 1 (`beta-resequence-critic-r1.md`).
Rubric: `~/marvin/rules/plan-critic-rubric.md` (v2)
Reviewer: separate Fable critic. Written incrementally; sections append as finished. Round 3 is the last, so every finding visible now is reported now.

## Applicability

Unchanged from round 1 and re-attested: a program-level re-sequencing amendment for a public civic web app, docs-only deliverable, now 11 inserted relays (CI, OPS, NUM, MERGE, MAPFIX, T-pre, PIPE, SPEED, BETA, MATRIX, plus Lee's REBUILD), four deferred.

- **X1 Physical safety — does not fire.** Software and documents only; nothing in the plan can injure, burn or damage.
- **X2 Privacy — FIRES [GATING].** Geolocated coordinates in the hash (rounding now in BETA), a public report form with optional email, client and edge error capture, the tracker.
- **X3 Evidence integrity — FIRES [GATING].** Repo and tooling facts child plans build on; NUM is the mechanism for every public figure.
- **X4 — fires [ADVISORY]** (public copy: label note, known-issues page, form text). **X5 — fires [ADVISORY]** (two lanes, heavy builds, a clock). **X6 — fires [ADVISORY]** (monitors, triage, quarterly rebuild). **X8 — fires [ADVISORY]** (free-tier services, dev bumps, three heavy builds).
- **X7 Self-modification — does not fire.** No MARVIN gate, hook, skill or automation is changed; SPEED's amendment is to a rule in the project's program plan.

Ground truth re-read this round: the revised plan, `git log` (ed4b8fa), DECISIONS.md (the two attribution amendments at lines 85 and 92), the grill, `npm ls @mapbox/vector-tile pbf`, a live import of `scripts/lib/mvt-reader.ts`, and the round-1 file.

## Round-1 must-fixes: closed or not

| r1 # | Item | Status | Evidence in the revised plan |
|---|---|---|---|
| 1 | K.4 release edge; S2 story half placed; film fallback; T-pre header edge; MAPFIX C1 | **Closed** | Graph rows K.4 → M3a, S2 story half (build on L = scroll story or X fail; release after S1-lite), the "If the spike fails" paragraph, T-pre "touches no netlify.toml… (if it must, after S2-pages)", MAPFIX "C1 versioned raster". |
| 2 | Defects (1) and (2) into S1-lite unconditionally | **Closed** | "S1-lite, scope added" with both defects and their figures; MERGE explicitly disclaims them. See Problem-fit (a) for a one-line consequence it should state. |
| 3 | REBUILD's story scope; NUM after REBUILD | **Closed, with a new edge gap** | PIPE rebuilds the story products; NUM's gate check runs after REBUILD. But PIPE's build edge does not include the relays that define those products (Completeness a). |
| 4 | PIPE after MAPFIX and T-pre, Complex; T-pre all four P3 items plus reader switch | **Closed** | PIPE row and tier; T-pre lists all four items, the reader switch in its own deploy, and the remainder of T. |
| 5 | Mailto; attribution; REBUILD reason; D bounded; coordinate rounding | **Closed** | BETA's mailto sentence quotes the ruling; the grill calls are a separate block in the plan and two attribution amendments in DECISIONS; REBUILD cites the 10-23 ruling and the R2 upload; Phase 0.2 records D bounded; rounding is BETA's. One process note on the DECISIONS amendments under Change safety. |
| 6 | NUM figure set, "traced" per kind, generated ledger, replaced check | **Closed** | All four present. One definitional loose end under Verifiability (b). |
| 7 | CI: three high groups; the MVT pin; audit:ci baseline; red fidelity consequence | **Closed** | Present. The baseline and "red is hidden and listed" are in the bar table and CI's stub. The hide consequence has a hole for core layers (Completeness b). |
| 8 | SPEED profile pinned; render backend | **Closed as decision S** | Profile becomes a Lee decision with both candidates named; renderer-string refusal on llvmpipe/SwiftShader. Timing conflict with "none needed before G3" (Completeness d). |
| 9 | Form cap, honeypot, retention, quota alert, request scrub, durable clock | **Closed** | All in BETA, OPS and "Durable state". |
| 10 | Parking Lot; file list; bug split; CI wording; durations; M3b parser as a decision | **Closed except two** | Parking Lot deferred to approval (acceptable, stated); file list present; M1a/M1b split stated; CI wording fixed; V added. **Not closed:** the one-line reason for M3a's chrome half staying inside the gate (r1 Right-sizing c) is absent. Durations: rejected, judged below. |

## The two rejections, on their merits

**Durations per wave — rejection sound.** No relay has a child plan, and a calendar guessed from tiers would be invented data, which Critical Rule 2 forbids and which Lee would then price his decisions on. The substitute, a critical path per branch, is the right instrument: it tells him which branch is longer and why without a number nobody can rerun. One improvement that is not invention: state each branch's added chain by tier (K = build adds K.2, K.3 Standard, K.4 Complex in series after M3a; L = film adds MERGE Standard then S1′ Complex in Lane S), so the comparison is concrete. And decision L should carry the trade the shortest road hides: the scroll story's weight budget was 5 MB against the film's 2 MB (program Verification), so the shortest road may also be the slowest landing on decision S's profile.

**"MapLibre 6 no longer carries the MVT packages" — rejection correct; the round-1 claim was wrong.** `npm ls` shows `maplibre-gl@6.15.0 → @mapbox/vector-tile@3.0.0` and `pbf@5.1.2`, and `scripts/lib/mvt-reader.ts` imports cleanly under tsx. I carried the handoff's prediction ("a MapLibre 6 bump breaks the tile audits otherwise") as a fact without running the check. The plan's correction, pin as hygiene with no urgency, is right. The load-bearing assumption that survives is the one the plan keeps: whether the suite is *green* on v10, resolved by the G0 baseline run.

## Verdicts

### 1. Problem-fit — CONCERN
No DECISIONS contradiction remains; the mailto, the attribution and the REBUILD reason are fixed; the charter is untouched. One consequence of must-fix 2 is unstated: the 2026-10-08 amendment says logged area "becomes a merge of both records … built and reconciled **before any public number changes**. Until then the public figure stays 5.8 million ha." S1-lite's defect (1) fix removes 82,920 ha from the capped FTEN total (5,888,000 − 82,920 ≈ 5,805,000, still "5.8 million" floored) and lowers the 1991-2003 per-year figures by up to 15% on the scroll story. Those are public numbers changing before the merge. The reading that this is permitted (the amendment holds the headline *down* at FTEN until the splice is reconciled; the 09-02 ruling requires an overstatement to be corrected) is the right one, but the plan should say it in one sentence, and say what happens if a correction ever pushes the floored headline below 5.8 million (the copy follows the data under 09-02; the amendment does not forbid a decrease).
**Fix.** One sentence under "S1-lite, scope added".

### 2. Approach soundness — PASS
PIPE is now the integration point, Complex, after the two data relays; T-pre is one build with its reader switch; SPEED's profile is Lee's call with both candidates named; the critical path is stated per branch without invented durations. The inversion's claim that per-layer archives stay in "because the same build closes the z10+ holes" slightly overstates the coupling (the holes are a flag change in the same tippecanoe run; per-layer adds the reader switch), but the conclusion holds for a different reason the plan also gives: SPEED.

### 3. Completeness — CONCERN
Four gaps, each small, none a deadlock: (a) **PIPE's story half has no edge to the relays that define it.** PIPE now rebuilds "scrub tables, overlay frames or dots, totals", whose methods are S1-lite's (G3) and, under L = film, MERGE/S1′'s (G4). Its build edge is "MAPFIX, T-pre" only, and the wave table puts it in G4 beside T-pre and S1′ — so it either packages a story pipeline S1′ is still changing, or it cannot actually start in G4. Those scripts (`scripts/build-year-overlays.py`, `scripts/build-raster-tiles.py`, `src/data/scrub/`) are Lane S files by the lane split, and PIPE is "this session": a third writer the C2 conflict matrix does not list. Also, REBUILD runs "the fidelity suite" on the tiles but nothing says the C5 story truth checks run on the rebuilt story products; a fresh pull that paints 20% off would pass the gate. (b) **Hide-don't-block has no floor.** "A red layer is hidden and listed" is right for a secondary layer and wrong for forest-age (the film's hand-off target by the 10-08 ruling; the map "wakes up on forest age"), cutblocks (the story's subject) or old-growth-250: hiding one of those is not a beta with a layer missing, it is a different product. The plan should name the core set that cannot be hidden and the route when one is red at REBUILD: the previous version stays live under C1 with its vintage shown, and the label waits on Lee's decision (fresh-rebuild bar versus the red layer), in the seven-part shape at that time. (c) **K = hide has no owning relay.** Decision K says what hiding removes (landing and nav references, the CO2 panel, the PDF route, old share links) but no relay does it; it spans Lane S (landing copy) and Lane M (panel, routes). Review Focus 3 names "K = hide" as a co-owner, which is a decision outcome, not a task. (d) **"None is needed before G3" is false for S.** SPEED is in G2 and runs "on the profile Lee rules (decision S)"; its child plan cannot be written without S.
**Fix.** (a) PIPE build after S1-lite and, per L, MERGE/S1′; PIPE to G5 in the wave table; add the story-product scripts and `scripts/pipeline/*` to the conflict matrix ("S1-lite/S1′ first; PIPE rebases"); REBUILD's acceptance includes the C5 truth checks on the rebuilt story products. (b) Name the non-hideable core set and the red-at-REBUILD route. (c) A small relay K-hide (Lane M with one Lane S copy touch, G5, before BETA, only if K = hide), and make it RF3's co-owner. (d) "S before SPEED's child plan (G2); L and K before G3."

### 4. Right-sizing & reuse — CONCERN
Still right-sized; the growth (247 → 328 lines) is all acceptance conditions and decisions, no code. Parking Lot indexing deferred to approval, stated. Residuals: the M3a chrome-half reason from round 1 is still missing (one line: BETA needs the bug button, K.4 the panel slot, or split the status machine from the chrome); PIPE's scope grew to include the story products, which is justified by the vintage rule but should carry a tier note that its first batch is the packaging of pipelines other relays built, not new pipeline work.
**Fix.** The M3a line; one sentence on PIPE's batches.

### 5. Security — PASS
OPS scrubs page URL, request URL and breadcrumbs, PII capture off, no IP retention, no replay, with C6's sentinel test extended to one client and one edge error. The form has a honeypot; the mailto fallback is unchanged surface. Nothing new.

### 6. Failure modes — PASS
Cap and over-cap probed, honeypot, quota alert at 80% with sampling, renderer refusal, MAPFIX shrink path, forms-vs-export probe, red fidelity consequence (with the floor gap filed under Completeness b). Two notes, not findings: the weekly test submission in pre-mortem 3 must be tagged so triage skips it and so it does not count against the cap unnoticed; an edge-function SDK may not exist on the chosen free tool (Netlify edge is Deno), which the named beacon fallback already covers.

### 7. Change safety — CONCERN
C1/C2 govern every data release; hide is config; D is recorded bounded through the writer. One process finding: the two DECISIONS amendments ("Amended, attribution note, plan critic r1, 2026-10-23") were written and committed (ed4b8fa) on a critic's finding, before Lee saw them. Their content is correct and tracks the grill capture, and append-and-amend makes them reversible by a further amendment, but the standing rule is propose, never auto-write, and the amender named is a critic, which is not a who. They sit on the session branch, not main, so the cost of fixing is nil.
**Fix.** Show both amendment paragraphs to Lee with the four decisions; re-attribute them to the session ("note by the project session on the r1 critic's finding") and record his nod in the same line, or strike them if he prefers the entries as they were.

### 8. Data integrity & compatibility — CONCERN
The generated ledger, the M1a/M1b split, Phase 0.2's reconciliation and the shared vintage are all in. Two things PIPE's story half must respect that the plan does not name: S0b's `COARSE_OVERLAYS_SUNSET` is "written once by S0b and never regenerated by later rebuilds or redeploys, which a test pins", and S1-lite's reader checks for "the area-true asset version"; PIPE's rebuilt story assets must publish under a new content-versioned path with the reader's constant bumped and the previous two versions retained (C1 retention applies to Netlify-served assets too). Otherwise REBUILD either trips the sunset test or ships new frames under the old path.
**Fix.** Two lines in PIPE's stub: never touches the sunset constant; story assets versioned and retained per C1.

### 9. Verifiability (incl. testing the tests) — CONCERN
Review Focus present; every item has an owning task (RF3's second owner is a decision, fixed under Completeness c). The gate conditions are now checkable, including "TRACEABILITY's serious set closed" and "NUM's gate check after REBUILD". Loose ends: (a) "a test outage reaches Lee" needs a definition that does not take production down: a monitor on a deliberately failing URL, or the uptime tool's test notification. (b) NUM's "figure-bearing string in the static copy" needs the figure-set *sources* named (chapters.ts, the hero, CtaSection, legend notes, share meta, the beta label note, the known-issues page) so the check reads source files, not rendered text, and "figure-bearing" defined (numeral tokens, with years and dates excluded by pattern). (c) Decision S's two candidates share nominal numbers (1.6 Mbps down, 750 kbps up, 150 ms RTT, 4x CPU) but DevTools applies multipliers (0.9 on throughput, 3.75 on latency: 562.5 ms) that Lighthouse's simulation does not; at a 10 s bar that difference can decide pass/fail. The SPEED child plan must state the raw values it passes to CDP, and S should be put to Lee with the applied numbers, not the preset names.
**Fix.** The three definitions, one line each.

### 10. Maintainability — CONCERN
File list present; Parking Lot on approval. Two internal inconsistencies left: PIPE sits in G4 in the wave table but builds after T-pre, which is also G4 (it belongs in G5, and after the Completeness a fix, after S1′ too); "None is needed before G3" versus SPEED in G2.
**Fix.** Move PIPE to G5; reword the decisions line.

### X2. Privacy & data stewardship — PASS [GATING]
Rounding in BETA, the form says the view is sent, retention and location of submissions on /privacy, optional email, error tool PII off and URLs scrubbed. One note: `research/beta-gate/clock.md` is a tracked file in a public repo; it must hold dates and bug ids, never a reporter's email or free text.

### X3. Evidence & source integrity — PASS [GATING]
Every new factual claim verified: the three high groups, the MVT packages transitive under 6.15.0, `rebuild.sh`'s shape, Lighthouse's mobile profile numbers, the defect figures from the handoff. The DevTools-versus-Lighthouse multiplier note (Verifiability c) is a precision point, not a wrong claim.

### X4. Audience, brand & money accuracy — PASS [ADVISORY]
Public copy in the new relays is shown to Lee before merge, as story copy is. NUM covers the figures.

### X5. Concurrency & re-entrancy — PASS [ADVISORY]
C7's lock named for G4-G5; the clock file has one writer plus the coordinator's daily pass (say which of them writes a pause when the coordinator finds a serious report). PIPE as a third writer on Lane S's scripts is the one real overlap, filed under Completeness (a).

### X6. Operability & observability — PASS [ADVISORY]
Durable clock, the coordinator's pass, a runbook from PIPE, the quota alert. Two notes: the GPU driver fix is a reboot, which only Lee can do, so it is an owed item before SPEED (G2), not a sentence in a relay stub; and the known-issues page's writer at each wave close should be named (the project session, from TRACEABILITY's cosmetic set).

### X8. Dependencies, performance & cost — PASS [ADVISORY]
Caps probed, the MVT pin is hygiene with no urgency, three heavy builds named as three. Nothing new.

## Focus questions (re-asked)

**1. Every bar item cleared with a checkable gate?** Yes. The two soft rows from round 1 are now hard: "no known serious bug" is sweep **and** TRACEABILITY's serious set; "tiles freshly rebuilt" is fidelity **green** with a stated consequence. The consequence has a floor gap for core layers (Completeness b).

**2. Inside but not required; outside but serious?** Inside, unexplained: M3a's chrome half (residual from r1). Outside and serious: nothing now unowned, provided K-hide gets a relay (Completeness c) and PIPE gets its story edge (Completeness a). V and the MapLibre 6 follow-through are now inside or Lee's.

**3. Dependency coherence.** No cycles. New rows are consistent with the original graph. The one misplacement is PIPE's wave (G4) against its own edges (after T-pre, G4) and its real inputs (S1-lite, S1′/MERGE). C1 is stated on MAPFIX, T-pre and REBUILD; C2 and C7 respected.

**4. The decisions.** Four now (L, K, S, V), each framed honestly and in Lee's terms; L quotes his 10-08 ruling; K names what hiding removes; S names both profiles; V names the journalist's link. Two things to add: L's weight-budget trade (above); S put to him with the applied numbers, not the preset names. No "(call)" remains that should be his.

**5. Proportion.** Right-sized. Growth is all acceptance and decisions.

## Pre-mortem (three months out)

1. **REBUILD shipped fresh tiles with stale story frames anyway.** PIPE was written in G4 against S1-lite's overlay scripts while S1′ was rewriting them for the film's dots; at the gate, PIPE's story stage ran the old method, the truth checks never ran on the result, and the film's 2025 frame disagreed with the map. We should have seen it in PIPE's build edge, which names MAPFIX and T-pre and not the relays that define the story products.
2. **A red forest-age audit at REBUILD, and the rule said hide.** The rebuild's area-true raster failed the fidelity suite on one zoom; "a red layer is hidden" was applied to the layer the film hands over to, and the beta opened on a map that woke up on nothing. We should have seen it when hide-don't-block was written without a floor.
3. **K = hide, and the calculator was still there.** Nobody owned the hiding: the panel went, the landing copy still invited readers to "see what it is worth", the PDF route still answered, and an old share link opened the CO2 panel with the $570M bar. Review Focus 3 had named "K = hide" as an owner, which is a decision, not a relay.

Type-specific worst case, unchanged: a figure the data does not support, screenshotted under a "Beta" tag.

## Load-bearing assumptions

1. **The fidelity suite is green on v10.** Still unverified; resolved by CI's G0 baseline run. Consequence if red on a core layer: a relay nobody has sized, inside the gate; the floor rule (Completeness b) is what makes that visible rather than hidden.
2. **PIPE can package three other relays' pipelines without re-deriving them.** True only if it builds after them (Completeness a). Consequence if not: a fourth build and a divergent vintage.
3. **Netlify Forms with `output: "export"`, and its cap.** Named; BETA's probe resolves both. Medium confidence; the fallback is a different no-backend form path.
4. **Lee's decisions arrive in time.** L and K before G3, S before G2 (not "G3", as written). Consequence if they slip: SPEED's child plan waits, nothing else does.

## Inversion

The approved order still loses on the ruling that goal (2) is not a precondition. The minimal gate (scroll story, calculator hidden) is now on the table through L and K, with its hidden cost named here (the 5 MB landing). One alternative the plan does not weigh, and need not: hold REBUILD's story half out and ship the story on its September vintage with the date shown. It would win if PIPE's story stage proves too costly in G5; the plan's own M2 provenance line is the fallback, so it should be named as the fallback rather than rejected silently.

## Overall verdict

**CONCERN, no gating FAIL.** Every round-1 must-fix is closed in substance except one line (M3a's chrome reason), and both rejections are right, one of them because my round-1 claim was wrong. What remains is one real edge (PIPE's story half must build after the relays that define it, and REBUILD must run the story truth checks), one missing floor (core layers cannot be hidden; name the route when one is red at the gate), one unowned path (K = hide needs a relay), one timing error (decision S is needed before G2), one unstated consequence (S1-lite's corrections versus the 10-08 "before any public number changes" clause), and a process step on the two DECISIONS amendments (show Lee, re-attribute to the session). All are a line to a paragraph each. Round 3 should verify the folds and nothing else; nothing here argues against the order or the gate.

## Must-fix (prioritized)

1. **PIPE's edges and REBUILD's checks:** build after S1-lite and, per L, MERGE/S1′; PIPE to G5; the story-product scripts and `scripts/pipeline/*` in the conflict matrix; REBUILD's acceptance includes the C5 story truth checks on the rebuilt products; PIPE never touches `COARSE_OVERLAYS_SUNSET` and versions story assets per C1 with two prior versions retained.
2. **The hide floor:** name the core layers that cannot be hidden (forest-age, cutblocks, old-growth-250 at least) and the route when one is red at REBUILD: previous version stays live under C1 with its vintage shown; the label waits on Lee's decision in the seven-part shape.
3. **K-hide as a relay** (Lane M plus one Lane S copy touch, G5, before BETA, only if K = hide), co-owner of Review Focus 3.
4. **Decision timing:** "S before SPEED's child plan (G2); L and K before G3."
5. **One sentence under S1-lite** on the 10-08 clause: the corrections lower figures, the floored headline stays 5.8 million, and a decrease is not what the amendment holds back.
6. **The DECISIONS amendments:** show Lee with the four decisions; attribute to the project session, not the critic; record his nod or strike.
7. **Definitions, one line each:** "test outage" without downtime; NUM's figure-set sources and "figure-bearing" (numeral tokens, years excluded); S put to Lee with the applied CDP numbers (DevTools' 562.5 ms versus Lighthouse's 150 ms RTT), and SPEED's plan states the raw values it passes.
8. **Residuals:** M3a's chrome-half reason; L's weight-budget trade (5 MB scroll story versus 2 MB film); the tier chain per branch in the critical path; the GPU reboot as an owed Lee item before SPEED; the clock file holds no reporter data; the weekly test submission tagged; the known-issues writer named.

## Not re-reviewed

C1-C7, the relay specs and the original graph rows the amendment leaves standing, per the brief. The C2/Phase 0.5 "Lee pushes" wording versus the 2026-10-05 DECISIONS amendment remains a pre-existing tension for the child plans to resolve in DECISIONS' favour.
