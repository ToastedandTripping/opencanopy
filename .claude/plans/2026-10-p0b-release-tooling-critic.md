# Critic: P0b release tooling (round 3 of 3, the last)

Plan: `.claude/plans/2026-10-p0b-release-tooling.md`, revision 3, read whole. Reviewer: plan-reviewer agent (Opus, xhigh). Rounds 1 and 2: `-critic-r1.md`, `-critic-r2.md`. Binding spec read: `glowing-dazzling-brooks.md` C1, C2, C7, step 0.5b; `beta-resequence.md` wave table; DECISIONS whole. Scope as briefed: verify the round-2 folds, report what they broke, judge the `--lee` limit, judge the size. Settled points were not reopened. Probes ran in the session scratchpad only. Nothing else was written.

**Overall: FAIL, narrowly, on one gating dimension (X7).** The folds are honest and nearly all landed. The design stands, and the gate does not fail open by any route found once one table rule is stated (X7b). What fails is the reverse: the new red rules can reach a halt with no exit short of hand-editing the ledger, and the plan has a tested door in and no door out. The fix is about eight lines, five rows and three mutants. Under DECISIONS ("A child plan still failing after round three goes to Lee in plain words, never to a fourth round by default"), this goes to Lee; the plain words are at the end.

## Applicability

**Project type:** release-control tooling for a public site, plus one public meta tag.

| Dimension | Fires? | Tag | Why |
|---|---|---|---|
| Core 1-10 | yes | GATING | Always |
| X1 Physical safety | no | N/A | No hardware or hazardous output |
| X2 Privacy | no | N/A | SHAs, deploy ids and Lee's words, no personal or client data. Lee's words reaching a public file is scored under core 5 |
| X3 Evidence integrity | no | N/A | No research or public claim |
| X4 Audience and brand | no | N/A | The tag is not copy; no money or legal terms |
| X5 Concurrency | yes | **GATING, raised** | As in rounds 1 and 2 |
| X6 Operability | yes | ADVISORY | Every later release runs through it |
| X7 Self-modification | yes | **GATING** | A push gate over MARVIN sessions and a repo-wide git hook |
| X8 Dependencies, cost | yes | ADVISORY | No new packages; global `netlify` CLI, host memory floor |

## Round-2 folds, checked in substance

| Round-2 item | Status | Residue |
|---|---|---|
| X7a guard table, aggregate verdict, lift rules | **Landed, and broke things** | Unlisted transitions, halts with no exit, same-verdict conflict: X7 below |
| X5a mutex by rename | **Landed; one sentence is false** | "No caller can catch a live holder between two steps" misses the release: X5 |
| X5b ledger-moved check | **Closed** | Traced both orders against `await-live`; no false rollback survives |
| X5c idempotent records | **Closed, with a side effect** | Blocks renewing an expired request: core 3 |
| X5d torn read, X5e lock release | **Closed** | |
| X7b `install` from origin's objects | **Closed** | |
| X7c executable bit, X7d stdin ref | **Closed** | |
| Core 1, Lee's yes before `install` | **Landed too late** | Asked after five batches are built: core 1 |
| Core 3a, 3b, 3e, 3f, 3g, 3h | **Closed** | |
| Core 3c, 3d stranded ack, null `commit_ref` | **Partly** | Stranded ack cannot lift a halt (X7); `guard --sha` has no spelling for a null ref (core 3) |
| Core 4 Parking Lot, 6a, 6b, 7a-c, 8a | **Closed** | `rmdir` survives only in the revision log, as history |
| Core 9a-e | **Closed** | `summary` and `verify` have no row: core 9 |
| Core 10 header names | **Not closed** | Line 3 still calls round 2 `-critic.md`; it is `-critic-r2.md` |
| Rejection conditions; X6 | **Landed** | P8 in `reconcile` gives a false alarm from the coordinator's directory; `halt --lift` has a hole: X6, X7 |
| New: no-token red (line 130) | **Broke something** | The entry with no exit: X7a |

## The `--lee` limit

**The limit is real, correctly stated, and acceptable. Keep it. Two statements around it are wrong, and it is understated in one place.**

Why it is acceptable: no local tool can prove what Lee said without putting him back at a terminal, which his 2026-10-05 amendment removed ("Lee no longer pushes from his terminal"). The threat here is a mistaken or hurried session, not a hostile one, and the whole gate is cooperative already. Closing the re-run after a red is the job that was asked for, and it is closed.

What needs correcting:

1. **"Like `--no-verify`" (line 178) and "same standing" (line 496) are wrong on the point that matters.** `--no-verify` produces a published deploy the ledger never recorded, and reconcile catches it with no help from anyone's honesty. A false `--lee` produces a valid record, and nothing ever flags it. Its only detector is Lee reading it, and `summary` reaches him when the next release's hand-off rides, which can be days. So it is weaker than `--no-verify`, and the plan should say so.
2. **That gap has a cheap partial fix, and it is the one worth making.** Lee is the only party who can know, so tell him at once. On every record that relaxes the gate (red to green, `ack-deploy`, `record-rollback`, `authorize-corrective`, `install`), the tool runs `node ~/marvin/skills/notify/send.mjs` with the door and the verbatim words, best effort, never blocking, with a seam for the test. Not on `request`: he has just said yes, and about 28 pings would teach him to ignore them. Detection goes from days to seconds. It remains detection, not proof, and the plan should keep saying that.
3. **Understated: the first green needs no words at all.** Line 156 lists `--approval`, `--checks` and `--lee`, but the largest attestation is `guard --result green` itself. The tool runs no guard. "None to green" requires only that some evidence path exists (line 160), so a stale file from the last release certifies this one, and that is the natural mistake, more likely than invented words. Red to green is now better defended than the first verdict, which is where nearly every known-good comes from. **Fix:** state it in line 156, and require `--evidence` to be non-empty, newer than the deploy record and to contain the deploy id or SHA. It proves nothing about honesty, but it stops the stale-file mistake. One row, one mutant.
4. **Line 162's bold heading overclaims.** "A session cannot lift a red halt on its own" should read "without stating in writing that Lee said so", which is what line 178 then concedes.
5. **Say what counts as his words.** Runbook line: verbatim from his own message; never a paraphrase; a peer session's relay, which `rules/structured-decisions.md` allows, is recorded as relayed and by whom. `--lee ""` or whitespace is refused; the only row today is a missing flag.

Rejected, so nobody re-proposes them: a typed confirmation on `/dev/tty` (contradicts the amendment); matching words against the session transcript (fragile, fails closed on a format change, and halts releases over a logging detail).

## Is the size right?

**About one-fifth over, not several times over. A named smaller cut serves as well, and I recommend taking it. The core should not shrink.**

Measured: 508 lines against about 100 of binding spec (C2 75, step 0.5b 17, C7 6, the C1 identity lines), so 4.6 times, which trips the rubric's proportion test on its face. 20 subcommands, 16 record types, 8 seams, 53 named test rows, 53 mutant ids expanding to 76 mutants. The program's own counts give about 28 releases to and through the beta (22 at `glowing-dazzling-brooks.md:1175`, plus ten inserted and less four deferred per `beta-resequence.md`), plus docs routes. Round 1's reading holds: there are no code bodies, the Simple label was wrong, and C2 owes most of it. But two things have changed since that reading. The releases are attended, since Lee is present for every one. And both earlier rounds found defects at the same seam.

The cut:

| # | Cut | Why nothing is lost | Saves (my count) |
|---|---|---|---|
| A | **Move `heavy-run` to its own Simple relay and its own `scripts/heavy-run.mjs`, landed before S0b.** P0b keeps `dir-mutex` | `beta-resequence.md`: S0b is G2 and "C7's heavy-build lock covers G4-G5". Nothing consumes it in G0-G1. It reads no ledger and has no predicate in common. It also leaves the installed tool, so a build-lock fix never needs `install` and Lee's yes. Cost: one relay slot and a line in step 0.5b | 13 rows, 6 mutants, 1 subcommand |
| B | **Cut `halt --lee` and `--lift`** | Nothing ships without his yes, so his "no" is already the freeze. Round 2 offered this ("or state the omission"). It also removes a second kind of halt, the `--lift` hole and the freeze-versus-corrective question | 1 row, 1 subcommand, 1 record variant |
| C | **Cut `verify [--file F]`** | Line 137 is its only mention. Undefined, untested, no owner | 1 subcommand |
| D | **Reduce the Revision log to a pointer** | 46 lines of history; the folds live in the critic files, and no later session loads this plan anyway | 46 lines |
| E | **Make the lease a fold, and delete the lease directory.** Every state change already runs under the mutex and the ledger is already token authority, so `lease.json` is a self-described cache of something fold can derive. Claim, release and takeover each become one append | Same guarantee: one holder, serialized, durable. It removes the crash residue classes (`claim-after-mkdir`, lease with no JSON, released residue), the reclaim rules, the lease step in repair and "lease token above maximum". **The evidence is the defect history:** round 1 X5b and 3h and round 2 8a all sit where the lease directory and the ledger can disagree. Cost: C2's "`mkdir`" wording changes, the third C2 note in this plan; `install`'s lease refusal reads fold (malformed means nothing is in flight, so it proceeds) | About 2 crash points, 3 mutants, lines 123-127 halved |

Net, estimated: 17 subcommands, about 38 rows, about 66 mutants, about 90 fewer plan lines. **A to D are no-regret; take them. E is the only one with a real argument against it:** it changes a design three rounds have read, in the last round. It only deletes, Razor reads the batch, and the concurrent-claims and competing-reclaimers rows still bind. I would take it. If it is not taken, nothing below depends on it.

**Do not cut:** the hook, P1-P8, the fencing, the transition table, the ledger-moved check, or the mutation table; those are the plan. Considered and left alone: making takeover Lee-worded rather than any-session, which the attended releases would justify but which contradicts C2's "any session can take over" and is the program's to amend.

## Verdicts

**1. Problem-fit [GATING]: CONCERN.** Serves its two rows, contradicts no DECISIONS entry, and quotes the Deploy amendment accurately. The fold of round 2's core 1 put the question in the right shape and at the wrong time. Bootstrap step 1 asks Lee whether the hook goes on after all five batches are built, Razored and mutation-tested, and there is no branch for "no": without `install` there is no canonical tool and P8 is NO-GO forever. **Fix:** ask at plan approval, which is happening anyway. State the "no" branch: P8, the hook rows and `install`'s `core.hooksPath` step drop out, and enforcement is C2 as written. The words are still recorded at `install`.

**2. Approach soundness [GATING]: PASS.** Ledger as authority, short mutex, cooperative hook, fold-derived state, fail-closed reads. No fold changed that.

**3. Completeness [GATING]: CONCERN.** Halt exits are scored under X7. The rest:
- **a. An expired request cannot be renewed as written.** Line 190 says past 60 minutes "ask Lee again". Line 105 says a record is appended "only on a state change". Same SHA, same token, new words: an implementer can read it either way, and if the second `request` is a no-op, the lane can only abandon. **Fix:** a later `request` with new words is a state change; add the row expired, re-request, GO.
- **b. `--abandon` after a push by another route.** Line 129 refuses it after `record-push`, but adoption (line 229) and reconcile row 2 also mean "pushed" without one. **Fix:** refused once the candidate is pushed by any record. Add a row.
- **c. `guard` has no spelling for a null `commit_ref`.** Line 147 requires `--sha`; line 223 routes such a deploy through `claim --deploy`. **Fix:** `--sha` optional when fold's current deploy has no ref. Line 147 also shows `--token` as required where line 130 exempts one case; bracket it.
- **d. No previous green.** Line 169 moves known-good back "to the previous green". If the genesis deploy goes red there is none, and `rollback=` would print nothing. **Fix:** known-good becomes null, the text says no rollback target exists, and Lee is told.
- **e. P0b's own negative control is refused by its own rule.** Line 437 says to record it before pushing. Line 156 and row 307 accept `negative-control` on `instrumentation` only, and C2 says instrumentation is "M1a batch 0 only", so P0b is `behaviour`. **Fix:** say that P0b's control goes in the guard's evidence file, and that its `claim` is `--kind behaviour`.
- **f.** Bootstrap step 5 says "under the same yes"; line 93 says "every time". **Fix:** the question at core 1 names both installs, and both record the words.

**4. Right-sizing and reuse [GATING]: CONCERN.** See the size section. Batches are within limits, the Parking Lot is complete, and there are no code bodies. **Fix:** cuts A to D, and E on Lee's or the author's call.

**5. Security [GATING]: CONCERN.** Small and new. The repo is public. Line 156 has `summary` print Lee's words verbatim, and line 368 feeds `summary --sha` into `log_entry`, a public file, while the fold added more doors that carry his words. C1's close record needs only SHA, deploy id, data version and guard results (line 76). **Fix:** the `--sha` form prints those fields; the words print in `status` and on the terminal, and stay in the private ledger. Everything else stands.

**6. Failure modes [GATING]: PASS.** Read failures, timeouts, exit codes and `rm -r` text are consistent after the folds. The exit-3 notification loop is under X6.

**7. Change safety [GATING]: CONCERN.** Line 93 says `install` "does not read the ledger's state, so a bad tool can always be replaced", and also that it refuses while a lease is held and "appends an `install` record only when the ledger is healthy". So a bad tool with a held lease cannot be replaced, and the first install, which is the one Lee's question is about, records his words nowhere, since `init` comes after it (bootstrap steps 2 and 3). **Fix:** the lease refusal prints the manual route; `install` writes SHA and words to a file in the tool directory on every run, and `genesis` copies the first one into the ledger. That file also lets `reconcile` report which SHA the gate runs from, which costs a line and answers "did step 9 happen".

**8. Data integrity and compatibility [GATING]: CONCERN.**
- **a. A green that lifts nothing still moves known-good.** Line 103: "Only `guard --result green` makes known-good." Line 173: otherwise "it records the verdict and the halt stays". So red on D, a Netlify retry of the same commit as D2, reconcile row 2, and green on D2 leaves the halt in place and sets known-good to a rebuild of the failed SHA. Lee is then offered the wrong rollback target. This is the plan's stated worst case by a side door. **Fix:** key verdict history on `commit_ref` as well as deploy id, so a rebuild inherits red, and known-good moves only when no halt remains open.
- **b.** Row 302 says green on the unchanged known-good after `build-failed` is "recorded"; line 170 says the same verdict is a no-op. See X7c.

**9. Verifiability [GATING]: CONCERN.** Rows and mutants track the folds well, and M35 does die deterministically on the stray-directory row. Gaps:
- **a.** `summary` has no row, including `--unrecorded`, which the round-2 fold made load-bearing for carrying the other lane's records. Add: lists an unrecorded release; omits a recorded one; omits an abandoned one; the words are absent from the `--sha` form.
- **b.** New rows and mutants for X5a and X7 below, plus the evidence check above.
- **c.** Torn read, row 305: "completed before the re-read" has no seam. It can be done without one if the test holds the mutex, starts the command, then completes the line and releases. Say so, or M50's kill depends on start-up timing.

**10. Maintainability [GATING]: PASS.** Runbook home, `--help` pointer and the installed copy are all right. Fix line 3's critic names.

**X5 Concurrency [GATING]: CONCERN.** Most of the fold is right; the rename holder is sound: in the probe below, losers got only `ENOTEMPTY` or `EEXIST`, and no holder was ever seen with a bad `owner`.
- **a. Line 91's claim is false for the release.** "A held mutex always has an `owner`, and no caller can catch a live holder between two steps." A caller that loses the rename and then reads `owner` can find the path gone, because the holder just renamed it away. Measured with the protocol as written: 8 processes, 200 acquire-and-release cycles each, 4 runs including one under `taskset -c 0,1`: **56 to 79 `ENOENT` reads per run, about 6 to 10 percent of lost attempts, 0 parse failures.** One-shot contention across 60 rounds with no work in the hold: 0, so `Concurrent claims` may not catch this, or may catch it only as a rare flake on CI. If `ENOENT` falls into "unparseable", the result is round 2's outcome again, exit 3 with `rm -r` printed against a path a new holder may by then own. Frequency is low in production. **Fix:** one clause: `ENOENT` on reading `owner` means released, retry the acquire. A loop fixture in the Mutex row, and a mutant.
- **b.** Reading the lift rules with several causes open: see X7d.

**X6 Operability [ADVISORY]: CONCERN.**
- **a. The P8 fold cries wolf from the coordinator's directory.** Line 231 has `reconcile` evaluate P8, and the coordinator runs in `~/marvin`, where `git config core.hooksPath` returns `/home/leesalo/marvin/.git/hooks` (measured). So it prints `GATE OFF` on every tick, truthfully about the wrong repo, and a message that is always on says nothing. **Fix:** `install` records the repo's common dir in the tool directory; P8 reads `git -C` that path; add a row running `reconcile` from another repo.
- **b.** Line 99 sends `/notify` on any exit 3, and line 141 has `reconcile` exit 3 throughout a halt. Line 105 stopped the ledger filling per tick and left the pings. **Fix:** `reconcile` prints `NEW HALT` only when it appended one, and the notification follows that.

**X7 Self-modification [GATING]: FAIL.** Fail-closed holds on every read path, and the hook is tested against real git. No sequence without words lifts a red, provided (b) lands. What fails is "no self-lockout".

- **a. Halts with no exit.** Walked each halt to GO:

| Halt | Door the plan offers | Result |
|---|---|---|
| Red, holder alive | `record-rollback`, `authorize-corrective`, `--lee` | Fine |
| Red, holder dead, lease stale. **The common case: a red waits on Lee, and sessions end** | `takeover` "after a successful reconcile" (line 127), but `reconcile` is "exit 3 when halted" (line 141) | Unstated whether takeover may run. One reading strands it |
| **Red after `release`:** the line 130 no-token red, row 301, the fold's own addition; or a session that followed step 7 through a red, since nothing refuses `release` there | `record-rollback` and `authorize-corrective` need the current token, and a token write after `release` exits 2 (lines 128, 297). `takeover` with no lease exits 2 (line 127, row 328). `claim` while halted only for a bound corrective or an acked deploy (lines 219, 223, row 306), and the bound corrective needs a token to bind. `ack-deploy` is for unrecorded deploys only | **No door.** Only repair, meaning Lee hand-deletes a true red from the ledger |
| Unclassifiable, and that deploy later settles `error` (row 322's own path) | Stranded `ack-deploy` does not make it current, so lift rule 1 fails; green on the unchanged known-good is a no-op | Only a corrective, for a release with nothing to correct |
| Red on D, Netlify retry publishes D2, same SHA | Green on D2 is "none to green", and rule 2 needs red to green | Cannot lift even with `--lee`; see also core 8a |

Fix: (i) `record-rollback` and `authorize-corrective` take no token when no lease is held. They carry `--lee`, and `ack-deploy` already has this standing. (ii) `claim --deploy D` is allowed while halted, past the duplicate-SHA check, for a deploy `record-rollback` made current, so a green guard has a token. (iii) State that `takeover` may run during a halt: "successful" means the read succeeded and added no new halt. (iv) A stranded `ack-deploy` closes the halt that named that deploy. (v) One table-driven row: **every halt cause reaches GO by its named door.** That row is the guard against the next one of these.

- **b. The transition table does not say what it refuses.** Lines 164-171 list what is allowed and never state a default. Red to unverified is absent, and "unverified to green" is allowed, with lift rule 3 keyed on "the halt came from `unverified`". So if an implementer reads silence as permission, red, unverified, green lifts a red with no words: the path this fold exists to close, one step longer. M32 tests only the direct step. **Fix:** "anything not listed exits 2, nothing written"; explicit rows for red to unverified and green to unverified; a mutant.

- **c. The table contradicts the primary rollback path.** Line 170: same verdict again is a no-op. Line 219: after rollback, a green guard against the restored deploy lifts the halt. The restored deploy is the known-good, which is already green, so that guard is the same verdict. Row 333 would catch this at implementation, and the plan should not leave it to be caught. **Fix:** "no-op, unless it lifts a halt". Correct row 302's "recorded" to "ledger unchanged".

- **d. One `halted` flag cannot carry these rules.** Line 103 derives "halted and reason". Lift rules refer to "that halt", and line 151's `--lift` is "Lee's own freeze". With one flag, `halt --lift --lee` clears a red with no guard at all, and no row refuses it; a freeze plus a corrective passes P7; a direct push during an `unverified` halt is lifted by a green on the first. **Fix:** fold keeps a set of open halts, each closed by its own rule, and P7 fails while any is open. Cut B removes the freeze half. If `halt` stays, add: red plus `--lift`, still halted; and a freeze beats a corrective.

The escape valve is preserved: repair text and `--no-verify` with `ack-deploy`.

**X8 Dependencies, cost [ADVISORY]: PASS.** No new packages. `send.mjs` already exists at `~/marvin/skills/notify/`.

## Review Focus, answered

1. **Crash points.** No token reuse and no deleted successor found. A dead-holder mutex stays human-first and correct.
2. **`check-push`, hook, `guard`.** No GO on a read failure, stale ref, halted ledger or fake state. No hook pass beyond the stated bypasses. "Can any verdict sequence without `--lee` lift a red halt": not if unlisted means refused, which the plan must say (X7b).
3. **`classifyInFlight`.** Sound. The March deploy stays out; unknown states block. The stuck-deploy ack is now tested when no halt is open, but not when one is (X7a).
4. **Liveness.** Holds. The rename holder has the read race in X5a. No PID-namespace trap on this host: sessions share `pid:[4026531836]`.
5. **Path guard and seams.** Closed: `install`'s temp-root refusal and "unchanged" both landed.

## Stress tests

**Pre-mortem.**
- **The gate stops and the only way on destroys evidence (type-specific worst case for this round).** A known-good deploy goes red two days after its release, once M1a's guards are watching. Someone records it, as line 130 allows. Lee rolls back on the console. No session can record his words or get a token, so the fix is to hand-delete the red and the halt from the ledger. The durable record now says a broken deploy was never red, and the next rollback target rests on it. Visible now at lines 128 and 130.
- **The first green is the soft spot.** Sessions run guards, and one day a compacted session passes the previous release's evidence path, because the path exists. Everything downstream trusts that known-good. All the attention went to red to green. Visible now at line 160.
- **Ceremony erodes the hook.** Still live from round 2, and answered as far as a plan can: the docs route exists, and the Netlify `ignore` is parked for when it proves too heavy. `GATE OFF` on every tick (X6a) would add a second lesson in ignoring the tool.

**Load-bearing assumptions.**

| Assumption | Confidence | If wrong |
|---|---|---|
| Lee says yes to the hook | Unknown; asked after the build as written | Five batches reworked. Ask now |
| Sessions are mistaken, not hostile, so attestation suffices | High; the same assumption underlies `--no-verify` | Words he did not say in a durable record; detection in seconds with the notify line, days without |
| Every halt has a door | **Refuted by this round's walk.** Resolve before implementation | Repair by hand-editing a true red |
| A console rollback keeps the deploy id and auto-publish | Still unprobed, stated | P4 and row 3 fail closed with repair text |
| Lease directory and ledger never disagree in a new way | Medium; defects at that seam in both earlier rounds, each fixed | Another residue class. Cut E removes the question |

**Inversion.**
- **Lease as a directory (kept) against lease as a fold:** the directory wins only if something reads the lease without being able to read the ledger. `status` and `check-push` read the ledger anyway, and `install` tolerates a malformed one. Nothing found meets that condition.
- **`halt --lee` kept:** wins if a release can ship without Lee's yes. Under the 2026-10-05 amendment none can.
- **`heavy-run` in the release CLI:** wins if builds needed the lock before P0b's successor could land. The wave table puts the first consumer in G2 and the contention in G4-G5. Not met.
- **Netlify auto-publish lock:** still the only real server-side boundary, and it would turn `--lee` into something enforced elsewhere only for publishes. Needs Lee's amendment. Parked correctly.

## Must-fix, in order

1. **X7a:** tokenless `record-rollback` and `authorize-corrective` when no lease is held; `claim --deploy` for a rolled-back deploy; takeover during a halt; stranded ack closes its halt; the table-driven "every halt reaches GO" row.
2. **X7b, X7c, X7d:** unlisted transition exits 2 with explicit rows; "no-op unless it lifts"; fold keeps a set of open halts.
3. **Core 8a:** rebuild of a red SHA inherits red; known-good moves only when no halt stays open.
4. **Core 1:** ask Lee about the hook at plan approval, with a stated "no" branch.
5. **X5a:** `ENOENT` on `owner` retries; fixture and mutant.
6. **`--lee`:** correct lines 162, 178 and 496; state the first-green attestation; evidence freshness check; notify on relaxing records; what counts as his words; refuse empty words.
7. **X6:** P8 reads the recorded repo; `NEW HALT` drives the notification.
8. **Core 3a-f, 5, 7, 9a, 9c, 10:** the one-liners above.
9. **Size:** cuts A to D; E on the author's or Lee's call.

## For Lee, in plain words

This is the third and last round, so by your ruling it comes to you rather than to a fourth critic.

The release tool is sound, and once one rule in its table is stated it does not let a bad push through by any route I could find. The problem runs the other way. In one realistic case it locks up: if a deploy that had already been accepted later fails its checks, the tool stops all releases, correctly, and then no session can record your decision about it. The only way forward would be someone hand-editing the release log to remove a true failure. The repair is about eight lines and five tests, and it changes no design.

Two things need you. First, whether the push hook goes on at all: it means `/save` stops at the push on this repo and your own terminal push is refused without `--no-verify`. The plan asks you only after the tool is built, and it should ask now. Second, whether a fix list this mechanical needs another critic: my recommendation is no, fold it and let Razor read the batches, because each item is a stated rule with a named test. The cost of being wrong is one bad rule reaching implementation, where Razor and the mutation battery are the next two checks.

The plan is also about a fifth larger than the program needs. The build lock can be its own small relay, since nothing uses it before G2, and your personal freeze command can go, because nothing ships without your yes anyway.
