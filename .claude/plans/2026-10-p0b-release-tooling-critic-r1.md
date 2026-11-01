# Critic: P0b release tooling (round 1 of at most 3)

Plan: `.claude/plans/2026-10-p0b-release-tooling.md`, read whole, at `bdf0d2b`. Reviewer: plan-reviewer agent (Opus, xhigh). Binding spec read: `glowing-dazzling-brooks.md` C1, C2, C7, step 0.5b, r7 and r8 on P0b; `beta-resequence.md`; DECISIONS, all headings, Deploy entry in full. Live reads only; nothing was written outside this file.

**Overall: FAIL.** Four gating FAILs (2, 3, X5, X7). The lock, token and fencing design is sound. What fails is the path from that design to a real push.

## Applicability

**Project type:** release-control tooling for a public site, plus one public meta tag.

| Dimension | Fires? | Tag | Why |
|---|---|---|---|
| Core 1-10 | yes | GATING | Always |
| X1 Physical safety | no | N/A | No hardware or hazardous output. A memory refusal on a build host injures nobody |
| X2 Privacy | no | N/A | The ledger holds SHAs, deploy ids and Lee's approval words in private `~/marvin`. `summary` reaches the public `handoff.md` with SHA, deploy id, data version and guard results only. No personal data |
| X3 Evidence integrity | no | N/A | Produces no research or public claim. The plan's own fact table is checked under core 8 and below |
| X4 Audience and brand | no | N/A | The tag is not copy; no money or legal terms |
| X5 Concurrency | yes | **GATING, raised from advisory** | Concurrency is this plan's whole job. Advisory severity would exempt its main risk |
| X6 Operability | yes | ADVISORY | Every later release runs through it |
| X7 Self-modification | yes | **GATING** | r7 and r8 both ruled that P0b fires X7 though the script lives in this repo. It is a push gate over MARVIN sessions, with state under `~/marvin/state` |
| X8 Dependencies, cost | yes | ADVISORY | No new packages, but it depends on the global `netlify` CLI and sets a host memory floor |

## The three flagged items

**1. `/save` pushing without `check-push`: must be inside. As written, this is not a bypass risk but a deterministic break.** Read `~/marvin/.claude/skills/save/SKILL.md` G.1 to G.5: it detaches a scratch worktree at `origin/main`, merges `--no-ff`, adds ROADMAP and handoff commits, runs `git -C "$TMP" push origin HEAD:refs/heads/main`, and only afterwards fast-forwards the primary's local `main`. Three consequences:
- **The owed line cannot be obeyed.** At the moment `/save` could run `check-push`, the candidate SHA exists only in `$TMP`. P2 compares against `refs/heads/main`, which has not moved, so a truthful `/save` gets NO-GO on every run. Its non-fast-forward retry also mints a new SHA after any check.
- **It is the default landing path, not an edge case.** `relay-close` says "The relay branch is not pushed" and stops. Plan line 156 says the sequence is "each step a step in `/relay` close"; no such steps exist, and the plan changes no skill. The next session will follow the skill it has.
- **The first `/save` after any release halts both lanes.** `netlify.toml` has no `ignore`, so a docs-only push is a production deploy, which the reconcile table files under "Anything else, including a direct push".

An owed line cannot carry this. It fits inside P0b without touching MARVIN: see fix 3a.

**2. Gitignore: must be inside, as a blocking precondition.** The plan already says it is "needed before `init` on the real path", and `init` is a step of this plan's bootstrap (line 325). A prerequisite of one's own step has no business under Open items. Verified: all five paths are not ignored, and `state/` has 1,619 tracked files, so a broad `git add` in `~/marvin` is a live hazard. Once tracked, a branch switch in the primary can rewind the ledger, which is worse than the `git clean` the plan names. The edit is a marvin-session commit, so the plan cannot make it from here, but it can refuse to proceed without it: see fix 7a. Also, the five paths need two patterns, `state/opencanopy-release*` and `state/heavy-build.lock*`, not "three ignore lines".

**3. M1a's `audit:live` acceptance: the fix stays outside, the routing goes inside.** Verified at `e2e/monitoring/live-health.spec.ts:187` (tenure-cutblocks) and `:243` (fish-streams). Retargeting those tests belongs to M1a batch 0 or the handoff's routed fixes. But nothing currently carries the obligation to M1a's author: no M1a plan exists yet, and P0b-5's only `owed_add` is about `/save`. P0b-5 already edits C2, so it costs one line there and one `owed_add`. **Inside P0b outright:** line 325's `init --evidence "<audit:live and curl results...>"` would make a known-red suite the recorded basis of the genesis known-good, while line 323 refuses that same suite for P0b's own guard. Name the evidence as "`audit:live`, N passed, two named failures by construction, plus curl", or drop it.

## Proportion: the Simple label is wrong, the plan's size mostly is not

The relay's own table (`relay-load` Step 3) says Simple is "1-3 files: Ted -> Razor -> Report", with no fix stage, no batches and no dependency graph. This plan has 15 unique files, five batches, a dependency graph, 19 subcommands, 14 record types and 31 mutants, plus new primitives, which is the table's Architectural criterion. Line 211 defends the label because "nothing runtime changes except one meta tag". That measures production runtime risk, and the tool's risk is coordination: it can halt or wrongly authorize every later release. Run as Simple, the one tool that governs all releases gets no fix stage.

The body is largely owed: C2 alone is about 75 binding lines, and r7/r8 added five acceptance conditions. 345 lines against roughly 110 of spec is high but carries no code bodies, so it is not a transcript. See core 4 for the tier change and the cuts.

## Verdicts

**1. Problem-fit [GATING]: PASS.** Serves the two named rows. The binding correction quotes the Deploy amendment accurately and keeps rollback unamended. No DECISIONS entry is contradicted. The gap between tool and real path is scored under 3.

**2. Approach soundness [GATING]: FAIL.** Line 159's order, "Merge to local `main`; `claim`", leaves the shared ref outside the lease it exists to protect.
- **a. Lanes collide on `refs/heads/main`.** Lane A merges and claims. Lane B merges, moving the shared ref, then loses the claim. A's P2 now says NO-GO; `main` holds B's unreviewed work on top of A's; the only exits are re-claiming a SHA nobody tested or rewinding a shared ref. This is the exact two-lane case P0b is for.
- **b. Checks run on the wrong tree.** Step 1 runs checks before the merge, then `--checks` attests them for a merge commit they never saw.
- **c. Moving local `main` is unprobed.** The primary has `main` checked out (verified), so `git fetch . HEAD:main` refuses, as `/save`'s own comment notes. The only route is a merge inside Lee's primary working tree, which also fires git-safety's "ask" on every release, ahead of the yes in step 3.
- **Fix:** rebase the branch on `main`, run checks, `claim --sha <branch tip>`, and fast-forward only under the lease, with non-fast-forward refusing. Or bind P2 to the exact SHA being pushed (fix 3a), which removes the need to touch the primary at all. That changes C2's "equals local `main`" wording; note it beside the C2 amendment.

**3. Completeness [GATING]: FAIL.**
- **a. `/save` (item 1).** Fix, recommended: a tracked `scripts/hooks/pre-push` with `core.hooksPath` set by `init` (shared across worktrees; verified none is set today). For a push to `refs/heads/main` it reads the pushed SHA and remote SHA from stdin and runs `check-push` with `OC_RELEASE_TOKEN`. No token means NO-GO. `/save` then fails loudly, and its own rule stops it reporting "merged". No MARVIN edit. `--no-verify` on Lee's yes, followed by `ack-deploy`, is the valve line 331 already describes. Enforcement stays cooperative and the plan should keep saying so: GitHub web merges and `--no-verify` remain open. Add three cases on the bare-origin fixture: no token rejected, valid token passes, wrong SHA rejected. Alternative if the hook is refused: state that `/save` never pushes OpenCanopy `main` during the program, and replace the owed line with that, knowing nothing enforces it.
- **b. Close records regress.** P0b-5 is a pre-release batch, yet its `log_entry` holds guard results that exist only after the push, and its ROADMAP `shipped` is written before anything has shipped. Pushing the record is itself a production deploy, which needs a release, which needs a record. This recurs on every relay under C1. Fix: split P0b-5 into pre-merge docs and a post-release record, and rule that post-release records ride in the next release's first commit, with the ledger as the durable record meanwhile. Say the same in the C2 note.
- **c. Bypass detection is not wired.** Line 31 says a bypass "halts scheduling". Only `reconcile` and `takeover` append a halt. The sequence never calls `reconcile`, `status` is not stated to read Netlify, and `check-push` writes nothing. A direct push yields one lane's NO-GO while the other lane claims freely. C2 also requires reconciling before publishing. Fix: `claim` runs the reconcile read before its mutex, and the coordinator's scheduling read does too.
- **d. `reconcile` breaks the fencing rule.** It appends `deploy`, `rollback` and `halt` with no `--token`, and it is not among the named exceptions at line 114. Fix: add it, and state which token its records carry.
- **e. Nothing owns the `deploy` record.** P5 and `guard --deploy D` need the current deploy, but only reconcile's row 2 appends one. The `await-live` test asserts no append. Fix: `await-live` appends `deploy`, with the id read from Netlify in both `--source` modes, and the test asserts it.
- **f. Candidate build failure is unspecified.** History shows `error` is real (`6a2b9099`). Today: `await-live` waits the full 10 minutes, writes `unverified`, halts, and the plan then tells Lee "the failed candidate stays live", which is false, because the known-good is still published. Rollback there is meaningless. Fix: `await-live` exits fast on `error` for its `commit_ref`, records it, the halt text says production is unchanged, and a test covers it.
- **g. No lift path after `ack-deploy`.** A direct push acked "becomes current, pending", so P6 stays NO-GO until a green guard, but the plan never says who runs it or under which token, and the test row merely says ack "clears". The same path follows the line 331 valve, so it will be used. Fix: state the sequence and test ack, guard, then GO.
- **h. Takeover and release edge cases missing:** `takeover` when no lease exists (after `release`, observed token equals maximum, then the rename hits ENOENT); `request --sha` differing from the claim's SHA; any token-carrying write after `release`; `release --abandon` after `record-push`, which could erase a pushed candidate. Each should be an exit 2 with a test.
- **i. Parking Lot.** Line 35's out-of-scope items and the Open items are not indexed in the ROADMAP Parking Lot, and P0b-5 does not add them. See also core 4.

**4. Right-sizing and reuse [GATING]: CONCERN.** Reuses `mkdir` cleanly with one shared primitive; the two-directory answer to r7 is right. Fixes:
- **Tier:** relabel Standard with `batches[]` in the pack, and Razor after P0b-3 and after P0b-4, since the batches carry the races. Waive the Architectural spec and design stages, as there is no UI and these critic rounds do the architect's work. Record it as correcting the program's label.
- **Cut `--light`.** A job that needs no lock simply does not call `heavy-run`; a wrapper that runs it unlocked after an evidence ceremony does nothing. "Unmeasured is heavy" survives as the wiring rule. Removes two test rows.
- **Cut `--wait-min`.** Nothing in C7 needs it, a caller can retry on exit 5, and its 60 s poll breaks the test budget (core 9).
- **Cut `heavy-status`:** the lock is one readable file.
- **Cut `--owner-lost`.** C2 allows takeover of a stale lease only, this flag lets any session seize a fresh one by typing a reason, and no test covers it. A dead session costs the other lane at most 2 h.
- **Cut the 16-row Intent table** to the two rows served, with a pointer to the program plan.

**5. Security [GATING]: CONCERN.** The SHA in HTML is harmless: the repo is PUBLIC (verified). Ledger writes go through JSON serialization. One gap: outside tests, setting `OC_RELEASE_STATE_DIR` plus `OC_RELEASE_NETLIFY_BIN` makes `check-push` print a real-looking GO from a fake universe. Fix: with the override set and `VITEST` unset, `check-push` refuses with exit 2, and a test proves it.

**6. Failure modes [GATING]: CONCERN.** "Any read failure is NO-GO" is right and untested in places. Fixes:
- `netlify` and `git ls-remote` subprocesses have no stated timeout, so a hung CLI hangs the gate. Name one (30 s) and test it.
- Add rows: `ls-remote` fails or returns empty; Netlify returns valid JSON with no `published_deploy`.
- A transient read failure in `reconcile` or `takeover` must exit nonzero and write nothing. "Anything else: append `halt`" reads as a durable halt from a network blip, which then needs human repair. Separate "could not read" from "read and could not classify".
- An empty or unparseable `heavy-build.lock`, from a crash mid-write under the mutex, has no defined reading. Fix: treat it as live with a printed manual clear, and test it.
- `heavy-run` "returns the child's exit code", which collides with its own 1-6. A build exiting 5 reads as "lock held". Fix: tool refusals move to a reserved range, or print a distinct marker that wrappers read.
- `heavy-run` killed by Ctrl-C leaves the detached build running. Forward SIGINT and SIGTERM to the group, and test it.

**7. Change safety [GATING]: CONCERN.** The release is well gated, with the Lee yes, named rollback and the 20-minute window, and rollback stays Lee's. Fixes:
- **a.** `init` refuses unless `git -C ~/marvin check-ignore` passes for all five paths, skipped under the test override. The bootstrap gains a step 0 naming a marvin session as owner.
- **b.** After a rollback, `origin/main` still contains the failed candidate. Say that the next release must revert it, because `check-push` will not notice.
- **c.** Whether a console rollback sets `locked` is unprobed. P4 would fail closed with no documented unlock. Add a line to the repair text.

**8. Data integrity and compatibility [GATING]: CONCERN.** The ledger as sole token authority is right. Fixes:
- **a. A false claim on deploy identity.** Line 78 says `netlify deploy` from a laptop reads `local`, so a dirty tree can never claim a SHA. Verified otherwise in the installed CLI: `@netlify/config/lib/env/git.js` sets `COMMIT_REF` from `git rev-parse HEAD` with no dirty check, and `env/main.js` applies it to every non-buildbot build, alongside `NETLIFY_LOCAL: 'true'`. So `netlify build` and `netlify deploy --build` stamp HEAD on whatever is in the tree. C3 explicitly plans controlled-revert draft deploys, the exact case: a reverted tree claiming its unreverted SHA. Fix: `resolveBuildId` also returns `local` when `NETLIFY_LOCAL` is set, with a test row and a mutant.
- **b. `guard --result green` is the only door to known-good, and nothing binds it.** Fix: refuse unless `--sha` and `--deploy` match fold's current deploy and `--evidence` exists, with tests. Today a mistyped SHA can certify.
- **c. The documented repair can reuse a token.** Removing the last `claim` line lowers the ledger maximum, against "Tokens never repeat". Fix: `repair-note` takes the highest token from the aside copy and burns past it.
- **d. Version skew.** "From any checkout" plus a closed `type` list means a newer record halts every older worktree's tool, in a repo with a recorded stale-worktree history. Fail-closed but noisy. Fix: name one canonical invocation path.
- **e. Fact row 48 is wrong in detail.** Measured: 69 deploys exist, and the four `deploy-preview`s are one on `main` and three on other branches. No effect on the rule, but the fixture should copy reality.

**9. Verifiability [GATING]: CONCERN.** The named tests and mutation table are strong, the live guard has a natural negative control (the tag is absent today), and the built-HTML check covers all four routes in `src/app`. Fixes:
- **M22 can reach real state.** With the path guard mutated out, the row "`VITEST` set, no override" runs against the real `~/marvin/state` unless `HOME` is faked for that case too. Fix: all path-safety cases fake `HOME`.
- **Polling has no seam.** `OC_RELEASE_NOW` is a fixed clock, so `await-live`'s timeout needs a real wait unless the poll interval is overridable. `--wait-min`'s 60 s poll exceeds the 30 s test limit. Add a seam, or cut per core 4.
- **Battery budget.** Default `TOTAL_RUN_TIMEOUT_MS` is 30 minutes and the full four-file line runs per mutant, for 31 mutants. Anything near 60 s per suite times out and yields no verdict. Set `total_timeout_ms` or scope each mutant's command.
- **Named gaps:** exit 4 BUSY has no test; a mutex with no `owner` file; malformed ledger plus `heavy-run` succeeding, which line 100 promises and no row proves; takeover crash points (line 232 covers claim only); a green guard with no halt-lift assertion after rollback.
- **CI flake.** These suites enter `npm test`, so CI runs 8-process races and real-signal fixtures on small runners, against a beta bar of "green three runs running". "Run 5 times" is local only. Fix: assert on outcomes rather than timing, and require one CI run before close. Harness commits need `-c user.name` because the scrub removes `GIT_*` identity.
- **"Exactly once"** must count `<meta name="oc-build"` elements. The SHA itself may also appear in the RSC payload in the same HTML.

**10. Maintainability [GATING]: CONCERN.** Clean seams, and the matrix row freezing the tool during a release is right. But the six-step sequence and the red-path recovery live only in this plan, which no later session loads. `--help` covers repair only. Fix: P0b-5 adds a release section to the project's architecture doc, covering sequence, red path and bypass recovery, and the `--help` text points at it. Line 3's `--effort xhigh` is a stale astra flag; the current reviewer is pinned.

**X5 Concurrency [GATING]: FAIL.**
- **a. The crash test contradicts the mutex rule.** Line 232: `OC_RELEASE_CRASH_AT=after-mkdir` and `after-append`, "next claimant recovers". Both crash points sit inside the mutex, so exit 137 leaves a dead holder. Line 112 then says exit 3 with a printed `rmdir` and no auto-break. The implementer must either break the mutex, which the plan rejects, or change the test. This is a carried r8 condition. Fix: the test performs the printed `rmdir`, then asserts recovery; line 110 says so; and "immediately reclaimable" is qualified.
- **b. Release crash point missing.** Append `release`, crash before removing the lease: the ledger says free, the directory says held, and `claim` gets EEXIST until the 2 h stale takeover. Fix: `claim` under mutex treats a lease whose token the ledger shows released as reclaimable, and a test covers it.
- **c. The pgid gap is a real false-dead.** Launcher dies between spawn and recording the pgid: the lock names a dead PID and no group, so a second heavy build starts while the first runs. That is the one thing line 338 calls unacceptable and it has no answer in the plan. Fix: spawn under the build mutex and treat a lock with no pgid as live for a bounded grace period, with a test; or state the window as accepted.
- Merge-before-claim is scored under 2.

**X6 Operability [ADVISORY]: CONCERN.** Nobody is told. A halt sits in a file until a session reads `status`, while C2 needs Lee to act on it. Fix: the coordinator surfaces any exit 3 as a decision for Lee, in plain words, with a `/notify` on `halt`. Name the owner: the program's release coordinator is "this session", which will end.

**X7 Self-modification [GATING]: FAIL.** No predicate reads the halted state, which is exactly what r8 demanded ("Include halted/unverified state in `check-push`", with a CLI test on otherwise-valid conditions). Concrete path to GO while halted: a takeover sees an in-flight deploy with another `commit_ref`, so it appends `halt` and exits 3, leaving token and lease unchanged. That deploy later settles `error`. Now P1 passes for the original holder with its request, P4 is clear, P5 published equals current, and P6 predecessor is green. GO, on a halted ledger. Review Focus 2 asks this question and no row answers it. Fix: P7, fold not halted, unless a corrective bound to this SHA applies; a named test with every other predicate true; and a mutant. The escape valve is otherwise preserved: fail-closed, human repair text, Lee's override route.

**X8 Dependencies, cost [ADVISORY]: CONCERN.** No new packages. PASS on that. The memory floor reads C7's "16 GB" as 16 GiB, which is about 1.2 GB stricter, unstated as a choice. Live: `MemAvailable` 17,584,360 kB against a floor of 16,777,216, under 5% of margin, so refusals will be routine in G4-G5, when both lanes build. Exit 6 has no wait or retry. Fix: state the GiB choice with its reason, and give the caller a retry rule.

## Review Focus, answered

1. **Claim and takeover crash points:** no token reuse in the normal paths. Reuse is reachable through repair (8c). A dead mutex needs a human at every crash point (X5a); release crash wedges the lease (X5b). No path deletes a successor's lease.
2. **`check-push`:** yes, GO on a halted ledger is reachable (X7). The queued-request test does exercise a real pre-takeover request. The cached-ref mutant is sound.
3. **`classifyInFlight`:** sound against the March deploy and rollback, and it uses Netlify's timestamps, so no local clock matters. `published_deploy.created_at` exists (verified, though the fact row omits it). One gap: an older deploy still building is excluded, against C2's plain "no deploy in flight", and could publish over a newer one. Add non-terminal deploys under 24 h old regardless of order; the March deploy stays excluded.
4. **Liveness:** the gap between spawn and recording is an unanswered false-dead (X5c). `setsid` is stated. pgid reuse is an accepted false-live.
5. **Path guard:** M22 can reach real state (core 9). `OC_RELEASE_NOW` cannot fake staleness in production. The fake-bin GO is covered under core 5.

## Stress tests

**Pre-mortem.**
- **The gate fails open and everyone stops believing it (type-specific worst case).** Relay closes, `/save` pushes a docs commit, both lanes halt. It happens again. `ack-deploy` becomes reflex, then a real red release gets acked or a routine release prints GO on a halted ledger, and it stacks on a broken production with the known-good recorded wrongly. Visible now in `/save` G.4 and the P1-P6 table.
- **Lanes wedge on local `main`.** The first week both lanes run, one merges during the other's lease. Each NO-GO is correct and neither lane can proceed without rewinding a shared ref or shipping untested code.
- **A silent halt.** A dead mutex or torn line stops all releases while the sessions that could read it have ended. Nobody tells Lee, and the beta slips by days to an `rmdir`.

**Load-bearing assumptions.**
| Assumption | Confidence | If wrong |
|---|---|---|
| Sessions land releases through the plan's sequence, not `/save` | **Low, contradicted by the skills.** Resolve before implementation | Every close halts the program |
| A lane worktree can move `refs/heads/main` safely | Low, unprobed; primary has `main` checked out | Sequence step 2 is not executable as written |
| `COMMIT_REF` is trustworthy on every path | **Refuted for local Netlify builds**; holds for the buildbot, whose build is what P0b-1's guard checks | Guards pass on content the SHA does not describe |
| Netlify rollback leaves auto-publish on | Unknown. Fails closed through P4 with no documented unlock | The corrective after a rollback stalls |

**Inversion.**
- **Technical enforcement.** The plan rejects it by asserting nothing can stop a direct push. The conditions for a local hook to win are already true: one host, one shared `.git`, no hooks configured, and all pushes local. Take it (3a).
- **Fix `/save` in MARVIN.** Wins if a second project needs a release gate. None does yet, so the repo-local hook is cheaper. Revisit if one appears.
- **Netlify-side lock.** Lock auto-publish; pushes build but do not publish; a release is an explicit publish after Lee's yes. This is the only real server-side boundary, and it also dissolves the close-record regress, since docs pushes would never go live. It needs an amendment to "Deploy is git-triggered", which only Lee can make, and its behaviour is unprobed. Not now. It is the escalation if the hook proves insufficient, and worth one Parking Lot line.
- **Simple tier.** Wins if the work were 1-3 files with no new primitives. Neither is true.

## Must-fix, in order

1. **X7:** add a not-halted predicate with its test and mutant.
2. **Core 3a, 3b:** bring the `/save` path inside via the pre-push hook or an explicit prohibition; replace the unobeyable owed line; split P0b-5 and rule where post-release records go.
3. **Core 2:** claim before moving `main`, run checks on the candidate SHA, and settle how `main` moves or bind P2 to the pushed SHA.
4. **X5:** resolve the crash-test contradiction; handle the release crash point and the pgid gap.
5. **Core 7a:** the `init` refusal on `check-ignore`, plus the marvin-session prerequisite.
6. **Core 8a, 8b:** `NETLIFY_LOCAL` in `resolveBuildId`; bind green guards to the current deploy.
7. **Core 3c-3h:** wire reconcile, the fencing exception, `deploy` ownership, the build-failure path, the ack lift path, and the edge refusals.
8. **Item 3:** one C2 line, one `owed_add`, and honest `init` evidence.
9. **Core 4:** Standard tier with batches; cut `--light`, `--wait-min`, `heavy-status`, `--owner-lost`, and the Intent rows; index the Parking Lot.
10. **Core 5, 6, 9, 10, X6, X8:** the remaining test rows, timeouts, seams, the runbook section, and the halt notification.
