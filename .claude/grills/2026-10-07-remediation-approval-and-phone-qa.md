# Grill: the two open calls on the 2026-10 remediation program -- approve after critic round 8, and whether to relax the phone-check rule

**Date:** 2026-10-07
**Goal:** Lee decides both open questions with the consequences in view, so Phase 0 can start or not, and the QA load of ~22 releases is known in advance.
**Status:** confirmed (2026-10-07, gate: "Yes, this is it")
**Mode:** standalone

## Summary / key decisions
<!-- rewritten from scratch after every round -->
- The 2026-10 remediation program is approved as it stands, with round 8's privacy fix folded in and no round 9. The S0a child critic is where the fix gets reviewed. (R1, recommended taken)
- The live email-click leak gets a one-line patch today, ahead of the program, pushed by the session after Lee's yes; S0a keeps the tests and historical-record search. (R1, recommended taken)
- Lee checks visual releases only (story, film, colours, phone layout, new layers; about 13 of 22); the live guards gate the rest. The 2026-07-17 constraint is amended accordingly. (R1, recommended taken)
- An owed phone check never blocks a release, and the backlog has no cap. (R1, Lee overrode: "Owed, no limit")
- The July backlog shrinks to two phone checks (Batch 1 labels and colours; the 2026-09-02 story changes). Agents verify a11y P2 and audit P0+P1 on production; the timeline lockstep check (Phase A, global-state year) becomes M1a's timeline guard; the CO2 calculator check is retired because K rebuilds it. (R2, recommended taken)
- Each child plan gets at most three critic rounds; a plan still failing after round three goes to Lee in plain words. Round one runs at xhigh effort (corrected after the gate: Lee, "Let's set critic to xhigh instead as I think max actually has diminishing returns") and is briefed to catch everything on the first pass, so later rounds are not spent on what round one should have found. (R2, Lee overrode: "Three rounds but be sure to deploy adequately high level plan critics to avoid repeated critics for things that could have been caught right away")

## Facts established
<!-- looked up, never asked -->
- All nine critic files on the program (the unnumbered one is a copy of r8) carry an overall verdict of FAIL. The plan has never had a clean pass. -- source: `.claude/plans/audit-remediation-2026-10/*-critic*.md`, "Overall verdict"
- Round 8 failed on one gating dimension only (X2 privacy). Every core dimension is PASS or CONCERN, and the critic itself says the remaining concerns "do not justify redesigning the program". -- source: `-critic-r8.md`
- The X2 defect is live in production today: `public/tracker.js:165` on origin/main sends the whole `mailto:` link as `email_click.email`, and the crash-report link (`MapErrorBoundary.tsx:35-38`) puts `window.location.href` in the mail body. So a person who clicks "report this issue" on a crashed map sends the map URL (the view they were looking at) to our analytics before they decide whether to send the email. -- source: `git show origin/main:public/tracker.js`, `:src/components/ui/MapErrorBoundary.tsx`
- The round-8 fix is folded into the plan (lines 415-480, revision log 1409-1420): email_click keeps the recipient address only, the real link is clicked in a test with decoded checks, and the historical discovery searches that field. -- source: `glowing-dazzling-brooks.md`
- The plan gate's hook only checks that a critic file exists with at least five verdicts; it does not read the overall verdict. Mechanically the gate already passes; the FAIL is a judgement call left to Lee. The rubric's normal flow is "author folds the fixes, then ExitPlanMode". -- source: `~/marvin/.claude/hooks/lib/resolve-critic.sh:56-64`, `~/marvin/rules/plan-critic-rubric.md:165-167`
- Every child plan (S0a, P0b, M1a, ...) gets its own critic before any code. S0a owns the email_click fix. -- source: plan, "Relay specifications" + revision log
- Codex quota: the last reading on disk is from 2026-10-05 (5-hour window 97%, weekly 66%, weekly resets Sun Oct 11). It is not a live reading; the 5-hour window has certainly reset since. -- source: `node ~/marvin/scripts/codex-quota.mjs`
- The 2026-07-17 constraint reads: "The agent sandbox cannot render the map; all visual and map QA happens on the live deploy, by Lee." Its premise is half true: a worktree still cannot render tiles on localhost (no R2 CORS), but the 2026-10 audit rendered production in headless Chromium. -- source: `.claude/DECISIONS.md:68-70`, plan line 1155
- Under the plan as written, Lee's phone check is an owed item, not a release blocker. Releases are gated by the live guards: one push in flight, the next waits for green guards, a red guard halts both lanes. -- source: plan lines 211-214, 1150-1157
- The live guards do not exist yet. M1a builds them (camera, data-renders-in-30s, timeline lockstep, each with a pixel check). P0, P0b, S0a and S0b ship before they exist. -- source: plan lines 759-778
- Roughly 22 pushes. MARVIN's reading of the relay descriptions (a classification, not stated in the plan): about 4 change nothing visible (P0, P0b, M1a batch 0, plus M1a/M1b's behaviour checks that guards can cover), about 5 are map plumbing, and about 13 are visual (S0b, S1-lite, S1-prime film, S2-pages, M2, M3a, M3b, K.4, B-prime, C-prime x2, D-prime, T, E-prime). -- source: plan line 1147-1149 + relay specs
- The phone-QA backlog today: seven items owed, the oldest from 2026-07-11. -- source: `.claude/handoff.md`, open questions

## Rounds
### Round 1
- Q1: Approve now or review again? | Rec: Approve now | Answered: Approve now | Flags: none
- Q2: Hotfix the live leak today? | Rec: Patch it today | Answered: Patch it today | Flags: none
- Q3: Which releases get Lee's phone check? | Rec: Visual ones only | Answered: Visual ones only | Flags: none
- Q4: Does an owed check block releases? | Rec: Pause at three owed | Answered: Owed, no limit | Flags: overrode-rec
### Round 2
- Q5: Apply visual-only to the July backlog? | Rec: Shrink it to two | Answered: Shrink it to two | Flags: none
- Q6: Critic rounds per child plan? | Rec: Three rounds | Answered: Other: "Three rounds but be sure to deploy adequately high level plan critics to avoid repeated critics for things that could have been caught right away" | Flags: overrode-rec (extends it)

### Post-gate correction
- Critic effort: summary said highest effort; Lee set it to xhigh, not max. | Flags: overrode-rec

## Open flags -> owner
| Flag | Owner | Route |
|---|---|---|
| Two July phone checks remain (Batch 1 labels and colours; 2026-09-02 story changes) | Lee | handoff owed |
| Agent production checks owed for a11y P2 and audit P0+P1 | session | handoff owed, before Phase 0 closes |
| Timeline lockstep (Phase A, global-state year) folds into M1a's timeline guard | M1a child plan | acceptance condition |

## Graduation (proposed)
- DECISIONS.md (amend): "The agent sandbox cannot render the map..." -- visual-only phone checks, owed never blocks, no cap, premise half true, July backlog cut to two. Dry-run clean.
- DECISIONS.md (add, operating): "Each child plan of the 2026-10 remediation program gets at most three critic rounds, and the first runs at the critic's highest effort." Dry-run clean.
- Handoff: remove the two answered open questions; replace the July QA owed line with the two remaining checks plus the agent checks; log the grill; owed: email_click hotfix.
- Plan: no change to scope. P0's child-plan template carries the critic cap and the round-one brief; the plan's line 1149-1157 statement "The plan assumes no amendment" is superseded by the amendment.
- Rule edit (MARVIN, cross-project, not applied): `rules/plan-critic-rubric.md` -- round one must list every finding, not stop at the first blocker. Lee's comment was about this program; making it global is his call.
- Memory: none. The ruling lives in DECISIONS.

