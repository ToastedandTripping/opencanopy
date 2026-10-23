# Critic: beta-resequence.md (round 3 of 3, final)

Plan: `.claude/plans/audit-remediation-2026-10/beta-resequence.md`, as revised after round 2 (`beta-resequence-critic-r2.md`; round 1 in `-r1.md`).
Rubric: `~/marvin/rules/plan-critic-rubric.md` (v2). Scope this round, per the brief and my own round-2 close: verify the round-2 folds, check the new S1-lite arithmetic and framing, and report only where a verdict changed or a fold introduced a defect.

## Applicability

Unchanged from rounds 1 and 2, re-attested: X1 and X7 do not fire (software and documents only; no MARVIN gate, hook, skill or automation changed); X2 and X3 fire, gating; X4, X5, X6, X8 fire, advisory. Ground truth this round: the revised plan at `0cfdca5`, DECISIONS.md lines 80-93, `src/data/scrub/cutblocks-scrub.json` (`total = 5888477.44`, `areaCap = 2000`), `src/test/lib/hero-figure.test.ts`, the handoff's 2026-10-08 defect figures, and the round-2 file.

## Round-2 folds, verified

| r2 # | Item | Status | Where |
|---|---|---|---|
| 1 | PIPE after S1-lite and MERGE/S1′ or S2 story half; G5; conflict matrix; C5 truth checks at REBUILD; sunset constant untouched; story assets versioned with two prior | **Closed** | PIPE's stub and graph row; REBUILD's acceptance line; wave table G5. The dependence on S2 story half is unnecessary (it is a speed relay, not a data pipeline) but harmless, since PIPE is G5 anyway. |
| 2 | The hide floor | **Closed** | "The hide floor": forest age, cutblocks, fire, old-growth-250; previous version under C1 with vintage; label waits on Lee in the seven-part shape. |
| 3 | HIDE-K as a relay, RF3 co-owner | **Closed** | HIDE-K stub, graph row, G5 in both lanes, Review Focus 3. |
| 4 | Decision timing | **Closed** | "S before SPEED's child plan (G2); L, K and V before G3." |
| 5 | The 10-08 clause | **Closed, one framing wrinkle** | The quantified collision paragraph; checked below. |
| 6 | DECISIONS attribution notes to Lee, re-attributed | **Half closed** | The plan routes both notes to Lee for nod or strike and says who wrote them. The DECISIONS lines themselves still read "Amended, attribution note, plan critic r1"; the amender field becomes the session when Lee's nod is recorded. Not blocking. |
| 7 | Definitions: test outage, NUM sources and tokens, S applied numbers | **Closed** | OPS, NUM, decision S. S's "about 1.47 Mbps" is a midpoint: Chrome's applied Slow 4G download is 1.6 × 0.9 = 1.44 Mbps on a 1000 base or 1.51 on the 1024 base its source uses; write "about 1.5 Mbps" or quote bytes per second. The latency figure (562.5 ms) is exact. |
| 8 | Residuals (M3a reason, weight budgets, tier chains, GPU reboot owed, clock data rule, tagged test submission, known-issues writer) | **Closed** | Critical-path bullets, decision L, SPEED, "Durable state". Tier-chain note: the program never states M1a's or M1b's tier; "Standard, Standard" is the plan's assertion, harmless but unsourced. |

## The S1-lite arithmetic and framing

**Arithmetic: correct.** Shipped total 5,888,477.44 ha (`cutblocks-scrub.json`). Minus the nine polygons the attribute-cap lets through (82,920 ha, handoff 2026-10-08) = 5,805,557. The overlap correction (about 1.7%, same source) then gives 5,706,863 (subtractive) or 5,708,513 (divisive), both flooring to 5.7 million. For the floored figure to stay at 5.8 the remaining overlap would have to be under 0.096%; to fall to 5.6 it would have to exceed 1.82%. The 1.7% was measured with the nine polygons still in, and large tenure-shaped polygons are exactly the ones that overlap real blocks, so the post-cap overlap is at most 1.7% and probably less; 5.7 is therefore the likely outcome and "very likely" is the right hedge. The exact figure is S1-lite's output, and the plan does not claim otherwise. The hero guard enforces the consequence: `hero-figure.test.ts` asserts hero ≤ scrub total and hero ≥ total − 0.2, so a 5.8 hero against a 5.707 total goes red and the copy must move; "larger than Nova Scotia" (5,528,400 ha) survives at 5.7.

**Framing: right in substance, wrong in one clause.** Bringing the collision to Lee inside L, quoting the 10-08 clause, and refusing to hold an overstated figure through beta day are all correct. The clause "Under L = film, MERGE is in the gate and the hero changes once, to the merged measure" is not what the order produces: S1-lite ships in G3 with defects (1) and (2), MERGE in G4. The guard above forces the hero to 5.7 at S1-lite's release, then MERGE moves it again, so L = film yields two public changes unless S1-lite's measure corrections (scrub tables and hero copy) are held to release with MERGE, in which case a known overstatement stays live through G3-G4 (before beta day, so permitted by the bar, but a choice). The same applies to the per-year counters on the still-live scroll story, which drop up to 15% for 1991-2003 at S1-lite. So the options Lee is choosing between inside L are: (i) amend the 10-08 clause to allow downward corrections before the merge, the hero falls to 5.7 at S1-lite on every branch and moves again at MERGE where MERGE runs; or (ii) under L = film only, S1-lite's measure corrections release together with MERGE, one change, with the overstatement live until G4. The plan's "either MERGE runs anyway or the ruling is amended" is the correct pair for L = scroll story; L = film needs the sentence above.

## Verdict changes

- **1. Problem-fit — CONCERN** (unchanged in grade, narrowed): the one clause above. Fix: replace "the hero changes once, to the merged measure" with the (i)/(ii) pair, and say which the plan recommends (i, under the 09-02 ruling).
- **3. Completeness — PASS** (was CONCERN). All four gaps closed. One advisory note: if V = fix, the view-state parser needs a slot; say "a small Lane M relay in G5 beside HIDE-K", so V's "fix" outcome is placed the way K's "hide" outcome is.
- **4. Right-sizing & reuse — PASS** (was CONCERN). M3a's reason and PIPE's batch note are in.
- **7. Change safety — PASS** (was CONCERN). Both attribution notes go to Lee with the plan; the amender field on the DECISIONS lines follows his nod.
- **8. Data integrity — PASS** (was CONCERN). Sunset constant and C1 story-asset retention named.
- **9. Verifiability — PASS** (was CONCERN). Test outage, NUM's sources and tokens, and S's applied numbers defined; the 1.47 Mbps midpoint is a wording nit, not a method error.
- **10. Maintainability — PASS** (was CONCERN). PIPE in G5; the decision-timing line corrected.
- All other dimensions: unchanged from round 2 (Approach, Security, Failure modes, X2, X3, X4, X5, X6, X8: PASS).

## Overall verdict

**PASS with one CONCERN to fold; nothing blocking.** Every round-1 and round-2 must-fix is closed in substance; the two rejections stand; the new arithmetic is right and honestly hedged. The one thing to change before Lee reads it is a single clause in the S1-lite collision paragraph that promises one hero change under L = film when the order as written produces two, because the guard that Lee's 09-02 ruling put in place will not let a 5.8 hero sit on a 5.707 total. Fold the (i)/(ii) pair into L and the plan is ready for his look.

## For Lee, in one place

- **Four decisions** (L, K, S, V), with L now also settling the hero figure: amend the 2026-10-08 clause to allow a downward correction before the merge (the hero very likely falls to 5.7 million at S1-lite), or hold the corrections to ship with MERGE under L = film. S should be put to him with the applied numbers (562.5 ms round trip, about 1.5 Mbps down) and the landing interpretation read back.
- **Two attribution notes** in DECISIONS (2026-10-23 entries), written by the session on the critic's finding: nod or strike.
- **Two owed terminal items** before the waves need them: the dev-dependency install for CI (G0) and the GPU driver reboot before SPEED (G2).
