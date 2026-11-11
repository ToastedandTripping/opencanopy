Overall verdict: CONCERN (round 3)

# Critic, round 3 of 3 (final): HEAVY, the heavy-build lock

Plan: `.claude/plans/2026-11-heavy-run.md` at 5eaaf92, read whole. Diff since round 2 read (`git diff d4192fc HEAD`). Rounds 1 and 2 read. Reviewer: plan-reviewer agent (Opus, xhigh), rubric v2. Started 2026-11-11 05:27 UTC (`date -u`).

**Sources read this round.** P0b "Relay HEAVY", `.claude/plans/2026-10-p0b-release-tooling.md:255-264`. `scripts/release-ledger.mjs:120-155` (the guard the plan copies in shape). `vitest.config.ts`. `~/marvin/.gitignore:71` with `git check-ignore -v` on the lock and the sidecar (both ignored). `.claude/DECISIONS.md` Operating constraints in full; `decisions-check.sh`: `29 entries | HEAD 29 | history: 0 removed, 0 shrinks | ref=origin/main@b5c0753 2026-11-10`. ARCHITECTURE.md Releases (236-332). ROADMAP:130, handoff:39. Round 2's scratch model `scratchpad/heavy2/fix-heavy.mjs`.

## How this round checked the design: a model of the plan as written, re-run

Round 2's `fix-heavy.mjs` covered steps 2, 3, 4 and 6 to 8 only. It had no retry loop, no sidecar, no `command exited` line and no 241-then-wait. So this round wrote a fresh model of the plan **as written now**: `scratchpad/heavy3/plan-r3.mjs`. It follows steps 1 to 8, the retry loop (1 + 6 attempts, the descriptor closed during every wait) and the sidecar with ownership-checked removal. Each named mutant is an env switch (`M=...`). One deliberate deviation is reported under core 3: the model writes the sidecar on the child's `spawn` event, because step 5 cannot know the pgid. The driver is `scratchpad/heavy3/drive.sh`, which runs each case in a fresh directory, plus `racers.sh` and `pipetrap.mjs`. Every run used a scratch `OC_HEAVY_STATE_DIR`: the model refuses without one, so it never touched `~/marvin/state`. Children were short `sleep`s and nothing was ever built. Host: Node v22.22.1, util-linux flock 2.39.3, load 1.5 to 1.7 on 4 cores (`uptime`, 05:29 UTC). A "probe" means a third-party `flock -n -E 240 <lock> true`, where 240 means held and 0 means free.

**Correct code, every case as the plan specifies:**

| Case (plan test) | Measured |
|---|---|
| 1, held lock | B 240 with `REFUSED 240` naming the sidecar holder and `fuser -v`; after release B 0 |
| 2, `sh -c 'sleep 2 & exit 0'` | A exits 0, then probe 240 and B 240 while the sleep runs; 0 after |
| 3, SIGKILL launcher + command group | probe 0 at once; B 0 |
| 4, SIGKILL launcher only | probe 240, B 240 while the command runs; 0 after |
| 5, memory | 16,777,215 kB: 241, command not started, probe 0 (lock released); 16,777,216: 0; unreadable: 241 |
| 6, two racers through a barrier | 10/10 trials exactly one ran and the other got 240 (`racers.sh`) |
| 7, sidecar | foreign sidecar written mid-run survives; malformed sidecar, next run 0 |
| 8, exit status | `sh -c 'exit 7'`: 7 with `command exited 7`; self-SIGKILL: 137 |
| 9, signals | SIGTERM to launcher: grandchild gone, launcher 143 |
| 10, 244 paths | missing command: `REFUSED 244 cannot start command: ENOENT`, no sidecar, probe 0; missing state dir: 244; lock path is a directory: 244 (`EISDIR` from `O_CREAT`, so round 2's directory case is closed); no command: 244 |
| 11, retry | 240 then free: runs on attempt 2; never free: exactly 7 `REFUSED` lines, then `giving up after 7 attempts; tell Lee`, exit 240; 244 under `--retry`: 1 attempt; command's own `exit 240`: 1 run, exit 240, `command exited 240`; after a 241 a third caller runs (0) during the wait; SIGTERM during the wait: 143 |
| Nesting | inner `REFUSED 240`; outer exits 240 with `command exited 240`, so it is told apart from a refusal |
| 14, Node-shaped | synchronous `node -e spawnSync(sleep)`: probe 240 during; `node -e` that detaches a child without fd 3 and exits: probe 0 while the child runs (the stated limit) |

**Every named mutant, run against its test's case:**

| Test | Mutant | Correct | Mutant | Red? |
|---|---|---|---|---|
| 1 | drop the flock call | B 240 | B 0 | yes |
| 2 | plain inheritance (`stdio: "inherit"`) | probe 240 | probe 0, B 0 | yes |
| 4 | plain inheritance | probe 240 | probe 0 | yes |
| 5 | `<=` for `<` | 16,777,216 runs | 16,777,216 is 241 | yes |
| 7 | remove the sidecar unconditionally | foreign kept | REMOVED | yes |
| 8 | `null` exit as 0 | 137 | 0 | yes |
| 9 | signal the direct child only | grandchild gone | grandchild ALIVE | yes |
| 11 | retry on 244 | 1 attempt | 7 | yes |
| 11 | keep the descriptor across the wait | third caller 0 | third caller 240 | yes |

Regression-guard labels are honest: none of tests 3, 6, 10, 12, 13 or 14 claims a mutant. Two of them could carry one; neither omission is a defect:

- **Test 6.** The drop-flock mutant turns it red 10/10. It is under-claimed, not over-claimed.
- **Test 14, first half.** It cannot tell plain inheritance apart while the launcher is alive, because the launcher holds the lock regardless. SIGKILL the launcher mid-run and it can: the Node command keeps the lock (probe 240), and the plain-inheritance mutant gives 0 (measured, `drive.sh n14k`).

**Conclusion on scope item 2:** the plan as written is the design round 2 measured, and the parts round 2 never ran (retry, sidecar, `command exited`, nesting) are now measured green too. There is one mismatch, the step-5 sidecar order (core 3).

## Round-2 fold check (scope item 1)

| r2 must-fix | Status |
|---|---|
| 1. Single-process design; delete `--inner` | **Folded.** Steps 1 to 8 are the measured design, and `--inner` is gone. 241 closes the descriptor before any wait (measured: a third caller takes the lock during the wait) |
| 2. Unambiguous exit codes | **Folded.** 244 covers arguments, the guard, the lock file, flock and spawn. The command's codes pass through with `command exited N` and are never retried (measured with a command's own 240). Test 12 is rephrased |
| 3. Tests that could not fail | **Folded.** Test 4 kills the only launcher. Test 9 asserts on a grandchild and pins "direct child only". Test 11 has its five additions and an exact count of 7. Tests 1 and 6 hold through a barrier, test 7 writes a foreign sidecar mid-run, and the heading no longer claims "each revert-proven". All named mutants are measured red (table above) |
| 4. Review Focus 5 with a Node-shaped test; Node limit in Stated limits | **Folded** (test 14; "Node's own children unless passed explicitly"). Test 14 could be made discriminating (advisory, core 9) |
| 5. Docs: never delete; stop by group; 240 names holder and `fuser`; outermost only; canonical invocation; supersedes P0b | **Folded except one part.** Round 2's point about the canonical invocation was which copy of the script a session runs, because a worktree forked before the merge has none. The plan names the command form but not the location (advisory, core 10) |
| 6. Binding bookkeeping; restore own group and signals to the group | **Folded in form, with one claim that has no carrier:** "Unmeasured is heavy, known heavy jobs: kept". That rule was deleted from the Design in 81dd3ef and is not in the Docs list (core 1, core 10; must-fix 1) |
| 7. Name the channel | **Folded** (coordinator plus `/notify`) |

Round-2 items outside its must-fix list:

- The directory-lock case is closed by `O_CREAT` (measured `EISDIR`).
- SIGTERM during the retry wait is now specified and tested.
- **Still unfolded, all advisory:**
  - "argument array, never a shell" (r2 core 5);
  - a command that ignores SIGTERM keeps the lock, and a SIGKILLed launcher loses the build's exit status (r2 core 6d, X6);
  - sidecar writes by temp-and-rename (r2 core 8);
  - an explicit per-file test timeout (r2 core 9).

## Binding bookkeeping against P0b "Relay HEAVY" (scope item 4; p0b:257-264, read)

| P0b bullet | Plan says | Accurate? |
|---|---|---|
| Lock at `~/marvin/state/heavy-build.lock` by `O_CREAT\|O_EXCL`, fields PID/host/start/job/startTicks/pgid | amended; "the fields survive as the informational sidecar" | **Mostly.** Same path. The sidecar drops `startTicks` (moot with no liveness), adds `command`, and turns PID into the launcher PID and pgid into the command's pgid. "The fields survive" overstates it by one field. Cosmetic |
| `.mutex` beside it | moot | Yes |
| Own state-dir override, same path guard | kept | Yes, and tighter: the override and the seams are refused without `VITEST`, which the release tool does not do for every command (`release-ledger.mjs:139-148`). Accepted in r2 |
| Unmeasured is heavy; known heavy: `build-year-overlays.py`, `build-raster-tiles.py`, `preprocess:v2` | **kept** | **No.** The plan no longer states the rule anywhere: not in the Design (the r2-era "Which jobs use it" bullet was deleted in 81dd3ef), and not in the Docs list. `build-raster-tiles.py` and the 8 GB threshold appear nowhere in the plan. The tool is opt-in, so this rule is the only thing that makes the lock apply to anything |
| Under the mutex: live refused, dead replaced, memory floor "with no lock left", lock, own group, record pgid, release "only if still its own"; unparseable reads live | amended | **Yes**, with two sub-clauses unmentioned but covered: "release only if still its own" is test 7's ownership check, and "unparseable reads live" is moot (test 7's malformed case). "With no lock left" is kept: 241 closes the descriptor (measured) |
| Liveness (`kill -0`, start ticks, other host reads live; limits "setsid escapes", "pgid reuse") | moot | Yes. "Per host only" is stated. The old "setsid escapes" limit is now false in the safe direction (round 1 measured setsid grandchildren holding the lock) |
| Exit code passes through; 240-244 with a marked line | kept, 242/243 reserved | Yes (measured) |
| Signals forward to the group | kept | Yes (measured, test 9 mutant red) |
| Retry 240, 241, 243 every 10 min, 6 times, then Lee | kept for 240/241 | Yes. 1 + 6 = 7 attempts, measured exact |
| Tests: live respected; killed recovered; parent killed, child surviving; PID reuse; crash before pgid; corrupt lock; memory boundary; two reclaimers; owner-safe release; other host; exit status; signals; malformed ledger | "kept where the case still exists" | **Yes, but unmapped.** Mapping: 1, 3, 4, moot, see below, 7, 5, 6, 7, moot (per host), 8, 9, 13. "Crash before pgid" has an exact flock-era analogue: SIGKILL the launcher between flock and spawn, after which the lock must be free and nothing started. It is true by construction (the kernel releases it) and has no test. Advisory |
| Mutants on start time, group check, spawn under the mutex, memory boundary, release ownership | (implicit) | Moot; test 9 "direct child only"; test 1 "drop flock"; test 5; test 7. All present |

Bookkeeping verdict: accurate except one row. That row claims a binding rule is kept when the plan has dropped it.

## Applicability

Developer tooling: a mutual-exclusion and admission lock for heavy data builds on one shared 32 GB, 4-core host. It ships as a site release with no runtime change. The classification is unchanged from rounds 1 and 2.

| Dim | Fires | Tag | Why |
|---|---|---|---|
| Core 1-10 | always | GATING | |
| X5 Concurrency | yes | **GATING (adjusted, as r1/r2)** | Mutual exclusion is the product, so a concurrency defect is the product failing |
| X6 Operability | yes | ADVISORY | The launcher runs unattended for about 35 min, and sessions and the coordinator act on its refusals and stops |
| X8 Dependencies, cost | yes | ADVISORY | System binary `flock`, a polling retry, process-spawning tests |
| X1 Physical safety | **does not fire** | | No hardware or hazardous output. Host memory exhaustion is judged under core 6 and X5 |
| X2 Privacy | **does not fire** | | The sidecar holds a job name, PIDs, host, a timestamp and a build command line. No personal, client or child data |
| X3 Evidence | **does not fire** | | No research or public claim. The plan's factual claims are checked by measurement above |
| X7 Self-modification | **does not fire** | | An OpenCanopy script writing two git-ignored runtime files under `~/marvin/state`. No MARVIN gate, hook, skill or automation changes |
| X4 Audience/money | N/A | | Nothing public changes |

## Verdicts

**1. Problem-fit [GATING]: CONCERN.**
- **What holds.** The goal matches the Anchor, and all three anti-goals hold (tests run short children; the release tool and `dir-mutex.mjs` are untouched). The Intent skip line stands: the intent was settled in P0b, and only the mechanism changed, which is a plumbing call with provenance. No DECISIONS entry is contradicted (29 entries, `ref=origin/main@b5c0753`). That includes the 2026-11-10 Deploy amendment, which this plan's Release section cites correctly, and the three-round cap, which this round honours.
- **The concern.** The binding bookkeeping claims "Unmeasured is heavy, known heavy jobs: kept", but the rule no longer appears anywhere in the plan (see the bookkeeping table). Because heavy-run is opt-in and wrapping the entry points is parked, this rule is what decides whether the lock protects anything.
- **Fix.** Restore one Design line: "Which jobs use it: unmeasured is heavy. Known heavy: `scripts/build-year-overlays.py` (about 12 GB), `scripts/build-raster-tiles.py`, the `preprocess:v2` chain and `rebuild.sh`, which wraps them. A job measured below 8 GB need not use it." Carry it into ARCHITECTURE (core 10).
- **Cosmetic.** "The fields survive" should read "the fields that still mean something survive (no `startTicks`)".

**2. Approach soundness [GATING]: PASS.** The plan as written is the single-launcher design, and the model of it was measured green on every case and red under every named mutant (tables above). The lock lives on the open file description that the launcher created and passed explicitly as fd 3. It survives the launcher's death, backgrounding and Node commands, and it is released by the kernel when the last holder dies. flock(1) is used only to lock, so its exit codes never mix with the command's. The command runs in its own group, and signals go to `-pgid`.

**3. Completeness [GATING]: CONCERN.**
- **a. Step order cannot be implemented as written.** Step 5 writes the sidecar, including "command `pgid`", before step 6 spawns the command, so the pgid does not exist yet. Taken literally, step 5 also leaves a sidecar behind when step 6's spawn fails, which contradicts test 10's "no sidecar". **Fix:** write the sidecar on the child's `spawn` event (pgid = `child.pid`, since `detached` makes it a group leader); a spawn error writes none. That is what the model does, and test 10 passed with it (no sidecar, probe 0 after a missing command).
- **b. A backgrounded build loses its sidecar.** When the top command exits while descendants still hold the lock (test 2's shape, and any build that daemonises), step 8 removes the sidecar. B's 240 then names no holder, and the documented stop ("`kill -TERM -- -<pgid>` with the pgid from the sidecar") has no pgid to use. Measured: c2, `sidecar (may be stale): none`. **Fix (pick one):**
  - The docs line "if a 240 names no holder, `fuser -v <lock>` lists the holders and `ps -o pgid= -p <pid>` gives the group to signal".
  - Or step 8 re-probes the lock on a fresh descriptor before removing the sidecar. If the lock is still held, it rewrites the sidecar with `commandExited` and prints `heavy-run: command exited N; its descendants still hold the lock (pgid P)`.
- **c. Two exit details are unspecified.** The exit code for SIGTERM during the retry wait (the model gives 143; state 128 plus the signal so test 11 asserts a number), and whether every attempt prints a `REFUSED` line (test 11 needs a per-attempt observable to count 7).
- **d. When the signal handlers are installed.** Step 7 reads as installing them after the spawn. Install them before the first attempt, so that a signal while no command is running exits 128 plus the signal and a signal after the spawn goes to the group. Otherwise, a SIGTERM that lands between `spawn()` and the handler install kills the launcher by default and orphans the build. That window is microseconds and the build still holds the lock, so this is advisory.

**4. Right-sizing and reuse [GATING]: PASS.** 81 lines for a new tool, its tests and docs. One batch of three files (`scripts/heavy-run.mjs`, `src/test/pipeline/heavy-run.test.ts`, `ARCHITECTURE.md`) plus the writer-driven ROADMAP and hand-off edits. No code bodies beyond one `spawnSync` signature, which is load-bearing (the `stdio[3]` detail is the whole fix). Out of scope is listed with Parking Lot lines. Nothing is gold-plated.

**5. Security [GATING]: PASS.** The path guard copies the release tool's shape and is stricter: the override and both seams are refused without `VITEST`, so a session refused 240 cannot reach a bypass flag (`--inner` is gone). The sidecar is git-ignored (`check-ignore -v`, line 71). `VITEST=1` plus a fake override bypasses the lock, but that is no worse than not calling an opt-in tool. Advisory: state "argument array, never a shell" for the command spawn (Node's default, but the plan should pin it); consider `/usr/bin/flock` by absolute path.

**6. Failure modes [GATING]: PASS.** Measured:
- A launcher SIGKILL leaves the build holding the lock (240).
- Killing the whole group releases the lock at once.
- An unopenable or missing state dir, a lock path that is a directory, a missing command, and bad arguments all give 244 with nothing started.
- Unreadable meminfo gives 241.
- A signal death gives 128 plus the signal, never 0.
- A command's own 240 is passed through and not retried.

Advisory, unchanged from r2 core 6d: state as accepted that a command which ignores SIGTERM keeps the lock while it lives, and that a SIGKILLed launcher loses the build's exit status (read the build's own log).

**7. Change safety [GATING]: PASS.** The relay is reversible, the release sequence and the installed tool are untouched, and "never delete `heavy-build.lock`" is in the Stated limits and in the Docs list. Nothing in `~/marvin` deletes it: the housekeeping skill touches plans, hand-offs and worktrees only (SKILL.md:53-149, read), and r2's grep stands.

**8. Data integrity and compatibility [GATING]: PASS.** The kernel lock is the single source of truth and the sidecar is informational (a malformed sidecar changes nothing, measured). No migration: nothing was ever written at the lock path. Advisory: write the sidecar by temp-and-rename.

**9. Verifiability [GATING]: CONCERN.** All nine named mutants turn their tests red (measured), the regression-guard labels are honest, and Review Focus has five items, each owned by a test. One must-fix and four advisories.

- **Must-fix: test 2 goes red on correct code if it is written with this repo's own harness pattern.** `src/test/pipeline/release-harness.ts` runs the tool through `spawnSync` with pipes (line 138) and resolves on `child.on("close")` (line 61). Both wait until every holder of the launcher's stdout and stderr pipes has exited, and test 2's backgrounded `sleep` inherits those pipes. Measured with `pipetrap.mjs` on the plan model:
  - `spawnSync` with pipes returns after 2064 ms, and the probe reads **0**;
  - `'close'` fires after 2091 ms, and the probe reads 0;
  - `'exit'` fires after 104 ms, and the probe reads **240**.

  A worker who reuses the harness therefore sees test 2 red on a correct implementation. That is round 2's pre-mortem 3 ("test 2 was dropped as out of contract") with a new route in. **Fix, one line in the Tests preamble:** "tests that background work await the launcher's `exit` event, never `close` or `spawnSync` with pipes; or the backgrounded job redirects its own output (`sleep 3 >/dev/null 2>&1 &`)". The same applies to test 4 if B is started after awaiting A's `close`.
- **Advisory: test 2's hold window is a `sleep 3`,** against the preamble's "never on sleeps". Use a barrier: `sh -c '(while [ ! -e rel ]; do sleep 0.05; done) & exit 0'`.
- **Advisory: give test 14 a mutant.** Run its first half with the launcher SIGKILLed mid-run. The Node command keeps the lock (probe 240), and the plain-inheritance mutant gives 0 (measured, `drive.sh n14k`). That is the property Review Focus 5 actually cares about (an `npm` chain whose launcher died). As written, the launcher's own descriptor satisfies the test.
- **Advisory: test 10's no-`VITEST` cases are the one place a guard regression reaches the real lock.** A regressed guard would open and briefly lock `~/marvin/state/heavy-build.lock` and run the test's command against it. Run those cases with `HOME` set to a temp home that contains `marvin/state/`, and assert the refusal line names the guard and that nothing appeared under the temp home. Without the message assertion, a fake HOME with no `marvin/state` makes a regressed guard fail with ENOENT, which is 244 for the wrong reason and stays green.
- **Advisory, unchanged from round 2:** an explicit per-file timeout (`vi.setConfig({ testTimeout: 30_000 })`, as `release-ledger.test.ts:17`). Test 3's "B runs at once" waits for both kills to be reaped before B starts.

**10. Maintainability [GATING]: CONCERN.**
- **The Docs list does not say which jobs must use the tool** (the same gap as core 1). ARCHITECTURE is the runbook ("no later session loads the P0b plan", ARCHITECTURE:243-244), so if the rule is not there it is gone. **Fix:** add to the Docs list "which jobs use it (unmeasured is heavy; the known heavy list; below 8 GB need not)" and "which entry points do not take the lock yet": `rebuild.sh` (Lee's quarterly one command, DECISIONS 2026-10-23) and the npm scripts, until the parked wrapping lands, so a session wraps them by hand.
- **Advisory: canonical location** (r2 core 10, partly folded). One line: "run from a checkout at or after the merge; a worktree forked earlier runs the primary checkout's `scripts/heavy-run.mjs`". The lock path is absolute, so any two copies agree on the lock.
- **Advisory: "run it as a background job".** The r2-era docs line ("run in the foreground or as a background shell job") was dropped. A foreground Bash tool call times out at 10 minutes at most, which equals the retry interval, so a foreground `--retry` is killed before its second attempt. A 35-minute build is killed in the foreground too, and the launcher forwards the SIGTERM to the build.

## Conditional dimensions

**X5 Concurrency and re-entrancy [GATING, adjusted]: PASS.** "What if a second run starts mid-flight?" now has the right answer in every case measured:
- held lock: 240;
- backgrounded grandchild: 240;
- launcher killed: 240;
- free lock raced by two: exactly one ran in 10/10 trials;
- nested call: 240, and it is told apart from a refusal by `command exited 240`;
- retry: holds nothing during the wait (a third caller ran).

**X6 Operability [ADVISORY]: CONCERN.**
- The backgrounded case leaves no sidecar (core 3b).
- The foreground timeout trap (core 10).
- Unstated: a SIGKILLed launcher loses the build's exit status (core 6).
- `rebuild.sh` and Lee's quarterly command do not take the lock until the parked wrapping lands, which is the one way two 12 GB-class builds can still overlap on this host by accident. Say so in the docs (core 10).

**X8 Dependencies, performance and cost [ADVISORY]: PASS.** `flock` is util-linux (2.39.3 here, `--conflict-exit-code` present since 2.25), and there are no npm packages. The racers' ten trials ran in a few seconds.

## Stress tests

**Pre-mortem.** It is February, and HEAVY has shipped and failed.

1. **The suite lost test 2.** The worker reused `release-harness.ts`'s `spawnSync` runner. Test 2 went red on a correct launcher because the harness waited for the backgrounded sleep's pipes, so the worker rewrote it as "B after A returns runs", which passes. Later a refactor passed the descriptor by plain inheritance "to simplify", and nothing went red: test 4 was the only other guard, and it had been loosened in the same commit. The overlay build backgrounded a step, S0b's raster build started beside it, and the OOM killer took two sessions. **Type-specific worst case: the lock fails open on a host shared by five sessions.** We should have seen it in the harness file the plan points the worker toward. (Core 9 must-fix.)
2. **The rule nobody could find.** MEASURE wrapped the overlay build correctly. In March a session ran `build-raster-tiles.py` unwrapped, because ARCHITECTURE's "Heavy builds" paragraph said how to call heavy-run but not when, and the P0b text that listed the heavy jobs is a plan no session loads. Lee's quarterly `rebuild.sh` ran into the same gap. (Core 1 and 10 must-fix.)
3. **The stop with no handle.** A build that daemonised a step outlived its launcher. The sidecar was gone, the 240 named no holder, and the documented stop needed a pgid that nobody had. The session `rm`'d nothing (the docs held), but waited 40 minutes for a build it could have stopped in one command. (Core 3b, advisory.)

**Load-bearing assumptions.**

1. *A descriptor passed in `stdio[3]` reaches the command, and every non-Node descendant keeps it.* **Verified** (the model, tests 2 and 4, and their mutants). High confidence on this host's Node 22 and util-linux 2.39.
2. *The jobs that need the lock actually call it.* **Unverified and unenforced by design**: the tool is opt-in and wrapping is parked. If this is wrong, the lock is correct and protects nothing. This is resolved by documentation only (must-fix 1), which is the plan's chosen scope; the risk is accepted, not removed.
3. *The test harness observes the launcher's exit, not its pipes.* **False for the repo's existing harness pattern** (measured). If wrong, test 2 is red on correct code and gets weakened. Resolve before implementation with the one-line preamble fix (must-fix 2).
4. *Nobody deletes `heavy-build.lock`.* The docs say never, and nothing in `~/marvin` does it (housekeeping read, r2 grep). Medium-high confidence. If wrong, two builds run.

**Inversion.**

- **The P0b `O_EXCL` file** wins only if the explicit-descriptor pass could not be made to work. It works (measured), so the kernel lock stands.
- **A launcher that waits for the lock to come free before it exits**, rather than returning when the top command exits, would win if a caller needed "done" to mean "every descendant is gone" (for example, MEASURE timing a build's wall clock or peak memory). Neither build script backgrounds anything (r2: no `subprocess`, `multiprocessing` or fork), so the condition is false today. It becomes true if a future build daemonises a step. Worth one Parking Lot line beside the core 3b re-probe.
- **A cgroup memory cap instead of a lock.** `rebuild.sh:50` already runs Phase 4 under `systemd-run --user --scope -p MemoryMax=20G`. A cap bounds one build; it does not stop two. It complements the lock and does not replace it.

## Close

**Overall verdict: CONCERN (round 3). No gating dimension fails.** Round 2's four FAILs (core 2, 6 and 9, and X5) are closed. The plan as written is the single-launcher design: it holds the flock on the open file description, passes it as fd 3 through `stdio`, runs the command in its own detached group, sends signals to `-pgid`, and closes the descriptor on a 241 before any wait. A model built from the plan's own steps, retry loop and sidecar was measured green on all fourteen test cases plus nesting, and every one of the nine named mutants turned its test red. The regression guards are labelled honestly. The binding bookkeeping is accurate except for one row: it claims "unmeasured is heavy" is kept when the rule was deleted from the plan. That row and three smaller defects are must-fix. All four are text edits to the plan that the author can fold without another critic round: the CONCERN verdict does not block the gate, and DECISIONS caps child plans at three rounds. **For Lee, in plain words: the lock design is right and measured; what remains is four missing sentences, and nothing here needs his decision.** The 2026-11-10 standing yes excludes only work at critic FAIL, so it covers this release once the folds are in.

**Must-fix (gating dimensions at CONCERN; fold before the relay starts), in priority order:**

1. **Restore the "which jobs" rule** (core 1, core 10). Add a Design line: "unmeasured is heavy; known heavy: `build-year-overlays.py`, `build-raster-tiles.py`, the `preprocess:v2` chain, and `rebuild.sh`, which wraps them; below 8 GB need not". Add it to the ARCHITECTURE Docs list too, with "`rebuild.sh` and the npm scripts do not take the lock yet; wrap them by hand until the parked wrapping lands".
2. **Test harness preamble** (core 9). Tests that background work await the launcher's `exit` event, never `close` or `spawnSync` with pipes, or the backgrounded job redirects its own output. Measured: `spawnSync` and `close` both miss test 2's window (probe 0), while `exit` sees it (probe 240). `release-harness.ts:61,138` uses both of the wrong patterns.
3. **Sidecar order** (core 3a). Write the sidecar on the child's `spawn` event, carrying `pgid = child.pid`; a spawn error writes none (test 10).
4. **No-holder 240 and the stop handle** (core 3b, core 3c). Add the docs line "a 240 with no holder named: `fuser -v <lock>`, then `ps -o pgid= -p <pid>` for the group to signal". Optionally, step 8 re-probes and keeps the sidecar while descendants still hold the lock. Specify that SIGTERM during the retry wait exits 143, and that each attempt prints its `REFUSED` line (test 11 counts them).

**Advisory (non-gating; fold if cheap):**

- Make test 14 discriminating with a launcher SIGKILL mid-run (measured 240 against the mutant's 0).
- Replace test 2's `sleep 3` with a barrier.
- Run test 10's no-`VITEST` cases under a temp `HOME`, with a message assertion.
- Install the signal handlers before the first attempt.
- Add a per-file test timeout.
- Pin "argument array, never a shell".
- Write the sidecar by temp-and-rename.
- State the accepted limits: a command that ignores SIGTERM keeps the lock, and a SIGKILLed launcher loses the exit status.
- Name the canonical location: the primary checkout's script when a worktree predates the merge.
- Docs: run builds and `--retry` as background jobs, because the foreground tool timeout equals the retry interval.
- Map the P0b test list to tests 1 to 13, including the untested "launcher dies between flock and spawn" case.
- Change "the fields survive" to "the fields that still mean something survive".
- Add a Parking Lot line for "launcher waits for descendants" (Inversion).
