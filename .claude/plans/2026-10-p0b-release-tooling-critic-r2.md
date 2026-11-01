# Critic: P0b release tooling (round 2 of at most 3)

Plan: `.claude/plans/2026-10-p0b-release-tooling.md`, revision 2, read whole. Reviewer: plan-reviewer agent (Opus, xhigh). Round 1: `-critic-r1.md` beside it. Binding spec read: `glowing-dazzling-brooks.md` C1, C2, C7, step 0.5b; DECISIONS, all headings, Deploy entry in full. Live reads only: `git config`, `netlify api getSite`, `listSiteDeploys`, `listSiteBuildHooks`, marvin skills and hooks. Probes ran in a scratch repo under the session scratchpad. Nothing was written outside this file and that scratch directory.

**Overall: FAIL, narrowly.** Two gating FAILs (X5, X7), both with small fixes. All ten round-1 must-fixes are closed or closed with a residue named below. The hook is the right call and the rejection stands. What remains is a halt that a session can lift without Lee, a mutex rule that reads a live holder as dead, and a list of one-line gaps. No fix below changes the architecture.

## Applicability

**Project type:** release-control tooling for a public site, plus one public meta tag.

| Dimension | Fires? | Tag | Why |
|---|---|---|---|
| Core 1-10 | yes | GATING | Always |
| X1 Physical safety | no | N/A | No hardware or hazardous output. A memory refusal injures nobody |
| X2 Privacy | no | N/A | The ledger holds SHAs, deploy ids and Lee's approval words in ignored files under private `~/marvin`. `summary` reaches the public hand-off with no personal data |
| X3 Evidence integrity | no | N/A | No research or public claim. The fact table is checked below under core 8 |
| X4 Audience and brand | no | N/A | The tag is not copy; no money or legal terms |
| X5 Concurrency | yes | **GATING, raised from advisory** | As in round 1: concurrency is this plan's whole job |
| X6 Operability | yes | ADVISORY | Every later release runs through it |
| X7 Self-modification | yes | **GATING** | A push gate over MARVIN sessions, with state under `~/marvin/state`, and now a repo-wide git hook |
| X8 Dependencies, cost | yes | ADVISORY | No new packages; depends on the global `netlify` CLI and sets a host memory floor |

## Round-1 must-fixes, checked in substance

| # | Round-1 item | Status | Evidence |
|---|---|---|---|
| 1 | X7: not-halted predicate | **Closed** | P7, its test with every other predicate true, M13. Residue: a halt can be lifted from inside, see X7a |
| 2 | 3a `/save` path | **Closed** | Hook at line 169. `/save` G.4 reads a decline as a failed push, retries once, then "report + leave unmerged"; read at `save/SKILL.md`. Residue: X7c, X7d |
| 2 | 3b close records | **Closed** | P0b-5 is pre-merge only; line 184 rules where records go. Residue: core 3f |
| 3 | Core 2 lanes on `main` | **Closed** | Claim before landing, P2 bound to the pushed SHA, `refs/heads/main` untouched until step 8. Step 8 still fires git-safety's ask once per release, the same as `/save` today, and Lee is in his window by then. Acceptable |
| 4 | X5a crash tests | **Closed in substance** | Tests run the printed command. Residue: `rmdir` cannot work as printed, core 6b |
| 4 | X5b release residue | **Closed** | Line 115, M10 |
| 4 | X5c pgid gap | **Closed** | Spawn under the mutex, M28 |
| 5 | 7a `check-ignore` | **Closed** | `init` refusal, its test, bootstrap step 0. Re-verified: all six paths are not ignored in `~/marvin` today, so step 0 is still owed |
| 6 | 8a `NETLIFY_LOCAL` | **Closed** | Line 72, M3. Re-verified: `env/main.js` returns early for buildbot mode and sets `NETLIFY_LOCAL` otherwise |
| 6 | 8b guard binding | **Closed** | Line 148, M12. Residue: binds the target, not the transition, X7a |
| 7 | 3c-3h | **Closed** | Each traced to lines 198, 118, 150, 188, 190, 119 and test rows. Residue: core 3 |
| 8 | Item 3 | **Closed** | P0b-5 C2 line and `owed_add`; honest `init` evidence at bootstrap step 2 |
| 9 | Core 4 cuts | **Closed** | `--light`, `--wait-min`, `heavy-status`, `--owner-lost` are gone; Intent is two rows; tier is Standard |
| 10 | Core 5, 6, 9, 10, X6, X8 | **Closed** | Each row present. Residue: core 6a, core 9 |

## The two judgements asked for

**The rejection (CI run as a pre-push condition): upheld, with two conditions.** Verified: `ci.yml` triggers on `push: main` and `pull_request` only, with no `workflow_dispatch`, so a branch push runs nothing, and opening a PR on a public repo is a real outward step. These suites touch nothing shipped, so a flake costs a red CI run and not a broken site. The author's reading is right. Round 1 also said "before close", not "before push". That is where it goes wrong: the sequence has `relay-close` leaving the branch unpushed (read at `relay-close/SKILL.md:229`), so the relay is closed before the only CI run exists, and line 337's "close condition" has no owner and no red path. Conditions:
1. P0b-5's post-release `owed_add` names the first CI run, with the route if red: the fix goes out as the next release, and the bar's three-run count restarts.
2. The five local runs are done once under constraint, `taskset -c 0,1 npm test` (present on this host), so the likely flake class is seen before the push, with no outward step at all.

**`core.hooksPath` to an absolute installed copy: sound, keep it.** Probed and read:
- No global, system or local `core.hooksPath` exists today. `.git/hooks` holds samples only. No LFS. `extensions.worktreeConfig` is unset, so one config covers every worktree, including the live `session-27d0c0`.
- With an absolute path, the hook fired from a linked worktree, read `core.hooksPath` correctly, and `git ls-remote origin` worked inside it, with `GIT_DIR` exported to the worktree's git dir. A SHA refspec arrives as `<sha> <sha> refs/heads/main <remote-sha>`, which is what line 169 needs.
- Nothing in marvin's skills, scripts or `~/.claude/hooks` touches `hooksPath` as config, and no `git-safety`, `destructive-guard` or `outward-action-gate` rule refuses `--no-verify`, so the valve stands. `git clean` appears in no marvin skill, script or hook, so the installed copy is not being swept. `/housekeeping` archives only what Lee confirms.
- The author's objection to a tracked relative path is correct.

It does need four repairs, all below: a non-executable hook passes (X7c), a URL-named remote passes (X7d), `install` is not atomic and can downgrade (X7b, X7e), and it takes effect before Lee has been told (core 1).

## Verdicts

**1. Problem-fit [GATING]: CONCERN.** The plan serves its two rows and contradicts no DECISIONS entry. The amendment is quoted accurately and rollback stays Lee's. One gap: the hook changes two things Lee does himself. `/save` on this repo now stops at the push, and a push from his own terminal is refused without `--no-verify`. C2 as written says "Nothing technically stops a direct push". The amendment supports moving him off pushing, but nobody has told him, and P0b-5 only proposes a DECISIONS entry after the fact, while bootstrap step 1 sets the config before the sequence's yes at step 4. **Fix:** bootstrap gains a step before `install`: Lee is asked in plain words, per the structured-decision shape, whether the hook goes on, naming `/save` and his terminal. It is cheap to ask and its answer is the DECISIONS entry P0b-5 already proposes.

**2. Approach soundness [GATING]: PASS.** Ledger as token authority, a short mutex under a long lease, a hook behind a cooperative gate, fold-derived state and fail-closed reads are all right for the job. The lanes no longer share a ref. Defects below are in the edges.

**3. Completeness [GATING]: CONCERN.**
- **a. A tool fix never reaches the installed copy.** Line 228 freezes the tool during a lease; sequence lines 175-182 never say to re-`install`. A relay that fixes `check-push` ships it to `scripts/` while every session keeps running the old one. **Fix:** sequence step 9: if the release touched the tool paths, `install` after `release`.
- **b. `record-push` believes what it is told.** Push fails on the network after the hook passed, the session records it anyway, `--abandon` is now refused (line 119), and the lane sits until `await-live` times out and halts both lanes. **Fix:** `record-push` confirms `git ls-remote origin refs/heads/main` equals the SHA, else exit 2; add a row.
- **c. Acked stranded deploys have semantics but no test.** Line 190 says "simply excluded". `ack-deploy` has two meanings by whether D is published. Nothing exercises the non-published one, and a stuck `new` deploy newer than published is exactly what would need it. **Fix:** a P4 row, stuck deploy blocks, ack, GO; and a mutant.
- **d. A deploy with no `commit_ref` breaks the bypass recovery.** Line 190 says `claim --sha <its commit_ref>`. A CLI deploy can have none: the March deploy has none, and so does the live `6acbff3c` draft. Row 3's "by id or commit ref" also must not treat null equal to null. **Fix:** state that an acked deploy with no ref is guarded by deploy id, with a `claim` spelling for it; add a row.
- **e. Takeover adoption is undefined past the word.** Line 196 "adopted" names no record, and fold has no statement that the adopted candidate counts as pushed. So the new owner's `record-push` under a new token against a request under the old one is unspecified. **Fix:** adoption is recorded on the `takeover` record and marks the candidate pushed; the row continues through `await-live` to `guard`.
- **f. Docs and rulings have no stated route.** Line 40 notes a docs commit is a release. Measured: 8 of the last 19 production deploys are docs-only by title (`decisions:` 4, `docs:` 3, `charter:` 1). `decisions-check.sh` reads canonical rulings from origin's default branch, so a ruling held on one lane's branch until its next release is invisible to the other lane. **Fix:** one runbook line: a ruling the other lane must see goes as a docs-only `behaviour` release through the normal sequence, with its blocking guard named, and everything else rides. Also say who rides another lane's record: step 1 runs `summary` for every release since the last one recorded on origin, since the lane that next releases may not be the one that shipped.
- **g. `await-live` timing out in `netlify` mode has no deploy id.** Line 150 appends `guard unverified`, and line 99 requires fields per type, while the test covers only `meta`. Measured build times are 22-38 s, so this is rare, and it is the path a stalled Netlify takes. **Fix:** `unverified` on a timeout binds SHA with a null deploy; add the row, then the row where the deploy later publishes and reconcile row 2 picks it up.
- **h. Approval has no shelf life.** `request` records Lee's yes and nothing expires it. C2 wants him present for about 20 minutes; a session stalled by quota or compaction can push on a morning's yes that evening. **Fix:** P1 also requires the request younger than 60 minutes, by `OC_RELEASE_NOW` in tests. Past that, ask again.

**4. Right-sizing and reuse [GATING]: PASS.** No code bodies. 428 lines against a binding spec of roughly 110, and the growth is folded findings, so it is not a transcript. Batches are within limits. One line: line 428's marvin-side `/save` change is out of scope but missing from line 22's Parking Lot list; add it.

**5. Security [GATING]: PASS.** The SHA in HTML is harmless on a public repo. `check-push` refuses a fake universe outside tests. Secrets stay with the CLI's own auth, and no token goes on a command line. Setting `VITEST` and the override together on a real push remains possible and is within the stated cooperative boundary.

**6. Failure modes [GATING]: CONCERN.**
- **a. Round 1's exit-code collision survives for the mutex.** Line 93 reserves 240 and 241 for `heavy-run`, but a dead build mutex and a busy one use the shared primitive's 3 and 4, which also pass through as child codes, and line 215's retry rule fires only on 240 and 241. A build exiting 3 and a dead mutex look alike. **Fix:** reserve 242 (mutex dead) and 243 (busy, retried as 240), and 244 for a command that cannot spawn. Add a row: command not found removes the lock and returns 244.
- **b. The printed `rmdir` cannot work.** Lines 82, 116, 213 and 389: both directories hold a file, and measured, `rmdir` on them fails "Directory not empty". The crash tests would catch the primitive's text, but not the lock text or the rollback section. **Fix:** print and document the exact `rm -r <path>`, in all four places.
- **c. A hanging CLI costs 30 s against a 30 s test limit.** See core 9.

**7. Change safety [GATING]: CONCERN.**
- **a.** `install` is not stated as atomic. The plan's own probe shows a missing hooks directory lets a push through silently, so a crash mid-copy, or a remove-then-copy, opens the gate. **Fix:** write each file to a temp name and rename into place, the hook last, under the release mutex so that "refuses while a lease is held" is not check-then-act. Add a crash row.
- **b.** `install` writes under `~/marvin/state` with no `check-ignore`, while `init` has one. **Fix:** the same refusal in `install`.
- **c. Runbook spelling, measured:** the shell here is zsh, where `git push origin $TIP:refs/heads/main` applies the `:r` modifier and pushes nothing (`src refspec <sha>efs/heads/main does not match any`). It fails loudly, but it would be the first thing every session trips on. **Fix:** the runbook spells `"${TIP}:refs/heads/main"`.

**8. Data integrity and compatibility [GATING]: CONCERN.** Fact table spot-checked and correct: `published_deploy` shape and values, no build hooks (`[]`), `stop_builds: false`, the two `audit:live` lines, `layout.tsx:20`. Today's top 20 deploys are all settled, so the March deploy is already outside the window by count as well as age.
- **a. Repair with a lease in place.** Line 115's reclaim rule covers "no `lease.json`" and "released". After a repair burns past the old holder, the lease is neither, so claims refuse until it goes stale, and the `Repair` row tests only the empty case. **Fix:** `repair-note` removes the lease dir as part of the repair, and the row runs with a lease present.
- **b. Verdict records are not idempotent.** See X5c.

**9. Verifiability [GATING]: CONCERN.** Named tests are strong, the hook test uses real `git push`, and the negative control is natural. Review Focus present, each item pinned to a batch.
- **a. No read-timeout seam.** Line 281's "hangs past the timeout" takes the full 30 s on each of two reads, against line 252's 30 s test limit. It will time out, or cost 30 s per mutant. **Fix:** `OC_RELEASE_READ_TIMEOUT_MS`. Have the test's fake bin hang through a grandchild, since killing only the shell leaves the pipe held.
- **b. `await-live` under a fixed clock.** With `OC_RELEASE_NOW` frozen, its deadline never arrives. **Fix:** its deadline uses a real monotonic clock, with `--timeout-min` fractional in tests.
- **c. Mutants missing for things the plan says matter** (Lee's standing rule: a guard is not one until it is broken and goes red): takeover skips reconcile, which is C2 binding; `check-push` with the override and no `VITEST`; P8 not checking the executable bit; each `install` refusal; `init`'s `check-ignore`; negative control on `behaviour`; each edge refusal; stranded ack; plus one for each new rule in X5 and X7. **Fix:** add them to the table.
- **d. Hook test from a linked worktree.** Line 286's push should run from a fixture worktree as well as the main one, because that is the real case and it is where `GIT_DIR` differs.
- **e. Verification goes blind after bootstrap.** Line 337 says `core.hooksPath` is "still unset until bootstrap". After that, relays still run this suite on this host, and a harness bug that runs `install` with the wrong cwd sets the real path to a temp dir that is then deleted, silently ungating every push. **Fix:** under the override, `install` refuses unless the repo's common dir sits under the test's temp root, with a row; and the check reads "unchanged", not "unset".
- **f. CI.** See the rejection above.

**10. Maintainability [GATING]: PASS.** The runbook is in `ARCHITECTURE.md` with `--help` pointing at it; seams are clean; the installed copy ends version skew. The stale effort flag is gone. Line 3 says critic round 1 is `-critic.md`; it is now `-critic-r1.md`.

**X5 Concurrency [GATING]: FAIL.**
- **a. The mutex reads a live holder as dead.** Line 82: "Missing `owner` reads as a dead holder", and line 263 pins it. `mkdir` then write is two steps, so a second caller in that gap gets exit 3 and a printed removal command, with the real owner alive. Eight processes contending in the `Concurrent claims` row is how to hit it, and that row allows only 2 or 4, so it is a flake on small runners against "green three runs running". In production it is worse: exit 3 tells Lee to clear a mutex someone holds, which gives two holders. The same primitive backs the build lock. **Fix:** make the holder atomic with its content: create a temp sibling, write `owner`, `rename` it onto the mutex path. Measured on this host: renaming onto a non-empty directory fails `ENOTEMPTY`, so the loser knows, and renaming onto an empty one succeeds, so a stray empty directory is simply taken. No grace timer, which is the reason line 414 chose its other fix. A leftover temp sibling is harmless and matches the ignore pattern. Line 263's no-owner case then goes away; an unparseable `owner` stays exit 3. Keep the name `mkdir-mutex` or not; r8 asked for a shared primitive, not a syscall.
- **b. Reconcile can record a rollback that never happened.** Line 110 reads Netlify before the mutex, correctly, but nothing checks the ledger did not move during the read. Lane B reads published = K. Lane A's `await-live` appends deploy X as the site flips. B takes the mutex, sees published K as known-good and not current, and row 3 appends `rollback`, so X is no longer current and A's `guard` refuses. The next reconcile sees X published and current K, which at best re-appends and at worst halts both lanes. It fails closed, but it writes a false rollback into the durable ledger and tells Lee his site moved. A `netlify` call takes seconds, so the window is real. **Fix:** take the ledger's byte length before the read; under the mutex, if it changed, drop the read and retry, at most three times, then exit 4. Test with a fake bin that appends a valid record while answering. Applies to `takeover` too.
- **c. "What if this runs twice" is unanswered for records.** Reconcile row 2 and `await-live` can both append `deploy` for one deploy. Row 3 and `record-rollback` can both record one rollback. A coordinator polling a stuck state appends a `halt` per tick. **Fix:** under the mutex, append only on a state change, and one test per pair.
- **d. A torn read outside the mutex.** `check-push` and `status` read without it, and a torn last line is a halt (line 101). A write crossing a page boundary can be seen partly written. Rare, and it would produce a false exit 3 to Lee. **Fix:** a torn last line read outside the mutex is re-read once under it before being declared malformed.
- **e.** Heavy lock release at line 213: "only if it is still its own" is check-then-unlink. **Fix:** do it under the build mutex; if that is dead, leave the lock, as liveness will free it.

**X6 Operability [ADVISORY]: CONCERN.** Exit 3, `/notify`, the named owner and the stated daemon limit are good. Two gaps. A lost hook (P8 false) surfaces only on an explicit `check-push`, so a session that goes straight to `git push` passes and is noticed only by reconciliation afterwards. **Fix:** `reconcile` also evaluates P8 and reports it, so the coordinator sees the gate is off before it matters. And Lee has no door to freeze releases by his own word; `halt` is a record type with no command. **Fix:** `halt --lee "WORDS"`, one subcommand reusing the existing record; or state the omission in the runbook.

**X7 Self-modification [GATING]: FAIL.**
- **a. A session can lift a red halt on its own.** Line 148 binds a green guard to the current deploy and requires only that the evidence path exists. Nothing refuses a second verdict. So `guard --result red`, then a re-run, then `guard --result green` on the same deploy, same token, lifts the halt and makes that deploy known-good, with no word from Lee. C2 is explicit: on red, "Lee chooses one of two recoveries". Live guards run a real browser against a network, so a re-run after a red is the natural next move for a session under pressure, and this is the type-specific worst case. Two related paths: a build-failed halt (line 188 says "the only way on is a corrective") lifts on a green guard against the unchanged known-good, since it is the current deploy; so does a direct-push halt until the next reconcile. The CLI also has no guard name, while C2 speaks of "every guard the release lists", so calling it per guard makes the first green the known-good. **Fix:** a small table in the plan, and test rows and mutants for it:
  - `guard` is the release's single aggregate verdict; individual results go in the evidence file.
  - Allowed: pending to green, red or unverified; unverified to green or red; negative-control as now.
  - Red to green on one deploy needs `--lee "WORDS"`, which covers the genuine flake.
  - A green guard lifts a halt only when the deploy became current through a Lee-worded record since that halt (rollback, corrective, ack), or the halt came from `unverified` on that deploy. Otherwise it records and the halt stays.
  - A later red on a known-good deploy moves known-good back to the previous green.
- **b. `install` can downgrade the gate.** Line 89 refuses unless `HEAD` is an **ancestor** of live origin main. Every stale worktree passes that test, since an old commit is an ancestor, and `install` then replaces the tool with older code, including older predicates. It also copies from the working tree, so a dirty file installs as the gate. This is the exact hazard line 89 says the canonical tool exists to prevent, and stale forks are recorded here. **Fix:** except on first install, require `HEAD` to equal live origin main and the tool paths to be clean, or install from the objects at that SHA. Rows: one commit behind refused; dirty refused.
- **c. A non-executable hook passes, measured.** With the hook `chmod -x`, `git push` printed a hint and moved origin. P8 says only "the hook exists". This is the same class as the missing directory the plan probed. **Fix:** P8 also requires the executable bit; `install` sets and verifies it; add a row; and track the file as `100755` in P0b-3.
- **d. A push by URL passes, measured.** Line 169 gates a push "on `origin`", but `$1` to the hook is the URL when one is typed, and `origin` is then not what it receives. **Fix:** gate on the remote ref in every stdin line, whatever the remote is called; the only remote today is `origin`. Rows: by URL; `main` as one line of a multi-ref push; deleting `main`.
- **e.** See core 7a for `install` atomicity. It belongs here too: it is the one ordinary operation that can silently remove the gate.

The escape valve is preserved: fail-closed reads, repair text, `--no-verify` with `ack-deploy`, and no marvin hook refuses it. Self-lockout is answered, since `install` does not read the ledger and a bad tool can be replaced after a bypass push. Real harness semantics are tested with a real `git push`.

**X8 Dependencies, cost [ADVISORY]: PASS.** No new packages, Node 22 on host and in CI, GiB choice and retry rule stated. Netlify reads are cheap at this rate.

## Review Focus, answered

1. **P0b-2 crash points.** No path reuses a token or deletes a successor's lease; takeover, claim and release crash paths all recover as written. Two owners are reachable only through the mkdir-to-owner gap and a human following the printed command (X5a). Repair with a lease present is unspecified (8a).
2. **`check-push` and hook.** GO on a read failure, stale `origin/main` or halted ledger: no. Hook failure letting a push through other than by the stated bypasses: yes, two not stated, the executable bit and a URL-named remote (X7c, X7d). A bigger hole sits upstream of `check-push`: the halted state it reads can be cleared from inside (X7a).
3. **`classifyInFlight`.** Sound against the March deploy, rollback (failed candidate is `ready`, so settled) and clock order, using Netlify's timestamps. Blocks on unknown. The one way out of a stuck newer deploy, the ack, is untested (3c).
4. **Liveness.** False-dead is closed by the spawn under the mutex. Residue is exit codes (6a) and the release race (X5e).
5. **Path guard and seams.** Real state is safe. Real `core.hooksPath` is safe only by the harness's cwd, with no refusal behind it, and the check goes blind after bootstrap (9e).

## Stress tests

**Pre-mortem.**
- **The gate fails open from inside (type-specific worst case).** A guard flakes red on a Tuesday. The session re-runs, gets green, records it, and the halt lifts with a known-good that nobody chose. It works, so it becomes the habit. In week six a real red is re-run until green, and the next release stacks on a broken site with the rollback target pointing at it. Visible now: line 148 has no transition rule.
- **False alarms teach reflex.** An `rm` printed against a live mutex, a false rollback in the ledger, a CI flake on `Concurrent claims`. Each is rare, each reaches Lee as "a decision", and acks become automatic. Visible now in line 82 and line 110.
- **Ceremony erodes the hook.** Eight of the last nineteen deploys were docs. Each now costs a full release or waits, while a lane needs a ruling the other lane has not seen. `--no-verify` plus `ack-deploy` is the short way, and it works, so it stops being a valve. Visible now in line 40 with no route.

**Load-bearing assumptions.**

| Assumption | Confidence | If wrong |
|---|---|---|
| Sessions release by the runbook and not `/save` | High now; the hook enforces it and `/save` fails safely, read in G.4 | Loud stop, no harm |
| A guard yields one honest verdict per release | **Low: unspecified.** Resolve before implementation | Halt lifted without Lee, wrong known-good |
| The installed hook stays present and executable | Medium: nothing sweeps it, but two silent-pass modes exist and only an explicit check sees them | Ungated pushes, seen only after the fact |
| Buildbot sets `COMMIT_REF` and not `NETLIFY_LOCAL` | High from CLI source; proved by P0b's own live guard | Tag reads `local`, guard fails closed, P0b halts visibly |
| A console rollback keeps auto-publish and the deploy id | Unknown, stated as unprobed | P4 and row 3 fail closed, with repair text |

**Inversion.**
- **CI before the push:** wins if `ci.yml` had `workflow_dispatch`. It does not, and main is red on audit until the CI relay lands. Conditions not met.
- **Relative tracked hook path:** wins if no worktree predates P0b. `session-27d0c0` already does. Not met.
- **Netlify auto-publish lock:** the only server-side boundary, and it would dissolve the docs ceremony. Still needs Lee's amendment. Parked correctly.
- **A `netlify.toml` `ignore` for docs-only commits:** new, and worth one Parking Lot line. Docs pushes would stop being production deploys, which answers the 8-of-19 cost. Against it: the hook still sees them, and origin moving under a lane forces a rebase. It wins if the docs route in 3f proves too heavy in practice. Not now.

## Must-fix, in order

1. **X7a:** the guard transition table, single aggregate verdict, Lee's word for red to green, and which records lift a halt; tests and mutants.
2. **X5a:** atomic mutex holder by rename; a no-owner directory never read as dead during normal contention.
3. **X5b:** ledger-moved check around the Netlify read in reconcile and takeover.
4. **X7b, X7c, X7d, core 7a:** `install` from origin's exact SHA, atomic, under the mutex; the executable bit in P8; gate on the remote ref.
5. **Core 1:** Lee's plain-words yes before `install`.
6. **Core 3a, b, c, d, e, g, h:** re-install step, `record-push` verification, stranded ack test, null `commit_ref`, adoption record, the timeout row, request age.
7. **Core 3f:** the docs and rulings route, and who rides another lane's record.
8. **X5c, X5d, X5e, core 6a, 6b, 7b, 7c, 8a:** idempotent records, torn read, lock release under the mutex, reserved exit codes, `rm -r`, `install`'s `check-ignore`, the zsh spelling, repair with a lease.
9. **Core 9:** read-timeout seam, real-clock deadline, missing mutants, linked-worktree push, the `install` refusal under override.
10. **Rejection conditions:** the first CI run owned in `owed_add` with a red path; one constrained local run. **X6:** P8 in `reconcile`; `halt --lee` or a stated omission. **Core 4:** the Parking Lot line.

**Round 3 scope.** Round 3 is the last. Folding this list changes tests, one table and a handful of rules, not the design, so a pass is realistic if X7a and X5a land as written. If either is rejected, the rejection should state what prevents a session lifting a red halt alone, and what prevents exit 3 against a live holder.
