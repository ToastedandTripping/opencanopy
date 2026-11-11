Overall verdict: FAIL (round 1)

# Critic, round 1 of at most 3: HEAVY, the heavy-build lock

Plan: `.claude/plans/2026-11-heavy-run.md`, read whole. Reviewer: plan-reviewer agent (Opus, xhigh), rubric v2. Review time 2026-11-11 04:51 to 05:03 UTC (`date -u`).

**Sources read.** The binding section ("Relay HEAVY", `.claude/plans/2026-10-p0b-release-tooling.md:255-264`) and the P0b critic rounds that settled it (`-critic-r1.md:77-79,97,106`, `-critic-r2.md:33,77,105`). `scripts/lib/dir-mutex.mjs` (whole). `scripts/release-ledger.mjs:1-160,1340-1399` (path guard, seams, exit mapping, LANES and KINDS). `src/test/pipeline/release-harness.ts:1-80` and `release-ledger.test.ts:1-60`. `vitest.config.ts`, `package.json`, `.github/workflows/ci.yml`, `tsconfig.json`, `eslint.config.mjs`. ARCHITECTURE.md Pipeline, Layout and Releases. `.claude/DECISIONS.md` (all headings; Operating constraints in full). ROADMAP Parking Lot, and the hand-off's owed list plus its 2026-09-02 log entry. Both build scripts (imports and process calls), plus `scripts/pipeline/preprocess.ts` and `rebuild.sh`.

**Probes.** All ran in the session scratchpad `.../scratchpad/heavy/`, each with short `sleep` children and never a build. I wrote `mini-heavy.mjs`, a model of the plan's sequence on the real `dir-mutex.mjs` that implements the release rule exactly as the plan states it, along with two mutants of it. Node is v22.22.1. Nothing outside that directory and this file was written.

**Claims verified true.** I checked these and they hold:

- `git -C ~/marvin check-ignore -v` reports `.gitignore:71 state/heavy-build.lock*` for the lock, the `.mutex` directory, its `owner` file, the mutex temp siblings and a `heavy-build.lock.tmp.*` file. The line is committed on marvin `main`, not just present in the working tree.
- Lane `session` and kind `behaviour` are both valid for the ledger: `release-ledger.mjs:51-52` gives `LANES = M, S, session` and `KINDS = instrumentation, behaviour, corrective`.
- The "about 12 GB, about 35 min" figure is in the hand-off's 2026-09-02 log entry (`.claude/handoff.md:149`).
- The standing yes exists: DECISIONS, Deploy entry, amended per Lee 2026-11-10.
- The Intent skip line is present and gives its reason.
- No DECISIONS entry is contradicted.

## Applicability

The project type is developer tooling: a mutual-exclusion and admission control for heavy data builds on one shared 32 GB, 4-core host. It ships as a site release with no runtime change.

| Dim | Fires | Tag | Why |
|---|---|---|---|
| Core 1-10 | always | GATING | |
| X5 Concurrency | yes | **GATING (adjusted)** | Mutual exclusion is the whole product here, so a concurrency defect is the product failing, not a side issue |
| X6 Operability | yes | ADVISORY | A launcher runs unattended for about 35 minutes, and its refusals go to sessions, the coordinator and Lee |
| X8 Dependencies, cost | yes | ADVISORY | A polling retry loop, plus process spawning in tests |
| X1 Physical safety | **does not fire** | | No hardware or hazardous output. The worst case is host memory exhaustion killing sessions, which is a software failure judged under core 6 and X5 |
| X2 Privacy | **does not fire** | | The lock holds a PID, host name, job name and timestamps. No personal, client or child data |
| X3 Evidence | **does not fire** | | No research or public claims. The plan's own factual claims are checked under core 2 and core 9 |
| X7 Self-modification | **does not fire** | | It adds an OpenCanopy script that writes one runtime file under `~/marvin/state` (already ignored). No MARVIN gate, hook, skill or automation changes |
| X4 Audience/money | N/A | | Nothing public changes |

## Verdicts

**1. Problem-fit [GATING]: FAIL.** The goal matches the Anchor, the anti-goals hold and no DECISIONS entry is contradicted. The plan does, however, change or drop four of the binding rules:

- **a. The crash-before-pgid case.** The binding says the order is "lock, spawn as its own group, record pgid, release, so a launcher crash leaves a dead holder and a manual clear, never a second build" (p0b:261). P0b r1 X5c had named this window "a real false-dead", and r2 closed it with "spawn under the mutex". The plan instead says the next caller "replaces it after `kill(-pgid, 0)` cannot be checked; stated limit", and its test 5 asserts that replacement. That is the second build the rule exists to prevent; core 2b has the mechanism.
- **b. The settled exit-code scheme.** P0b r2 Failure modes 6a reserved 242 for a dead mutex and 244 for a command that cannot spawn (which also removes the lock); that is why the binding says "reserved at 240-244" and retries only 240, 241 and 243. The plan gives 242 and 244 to bad arguments and a refused state path, so a dead or corrupt mutex and a failed spawn get no code at all.
- **c. A binding test is dropped without comment.** "Malformed ledger irrelevant" is in the binding's test list (p0b:264; first raised at r1:97) and is missing from the plan's thirteen. It is the proof that HEAVY "reads no ledger", which is the reason the binding gives for HEAVY leaving P0b in the first place.
- **d. "Same path guard" is restated as a different guard.** The plan describes it as "refuses a path outside `~/marvin/state` unless the override is set". The release tool's guard (`release-ledger.mjs:135-148`) does something else. Under `VITEST`, the override is required and must not resolve, by realpath against both home directories, inside the real state dir. Seams are honoured only while the override is set. Read literally, the plan's version lets a test run with no override (or with the override pointed at the real dir) write or delete the host's real lock. Review Focus 3 then encodes that wrong guard as the thing to check.

**Fix:**
- a. Restore "never a second build" (core 2b).
- b. Restore the codes (core 3).
- c. Restore the test.
- d. Quote the release guard and adapt it as Security describes. Rewrite Review Focus 3 to match.

**2. Approach soundness [GATING]: FAIL.**

- **a. The lock is released when the direct child exits, even if the rest of the group is still running.** The plan says "On the child's exit the lock is removed". Measured with `mini-heavy.mjs A <dir> 0 -- sh -c 'sleep 5 & exit 0'`, the launcher exits 0, the lock is gone, `ps` shows `sleep 5` still running in pgid/sid 4129090, and a second caller runs at once. The hand-off records that the overlay build is run "detached" (`handoff.md:149`). So a session that wraps `nohup python3 … &`, or any shell line that backgrounds the work, gets no lock for the whole build. That breaks the Anchor in its most likely form. **Fix:** on the child's exit, remove the lock only once `kill(-pgid, 0)` reports ESRCH. Otherwise leave it in place: it reads live until the last group member exits, then dead, and is replaced. Add a test using `sh -c 'sleep N & exit 0'`: the caller gets 240 while the background member lives, and runs after it exits. The docs should say to run the launcher itself in the background and never put `&`, `nohup` or `setsid` inside the wrapped command.
- **b. The crash-window paragraph misreads its own primitive.** `withMutex` is synchronous, and `dir-mutex.mjs:10-12` says a dead holder "is never auto-broken". So a hard kill anywhere inside the critical section leaves a dead mutex, and the next caller fails on the mutex (MutexError `dead`), not on the lock. Measured with the plan's order and SIGKILL straight after spawn:
  - the first launcher exits 137;
  - the lock holds a dead PID and no pgid;
  - the mutex directory is still there and the orphaned build is alive;
  - the second caller gets MutexError `dead`;
  - after the printed `rm -r` of the mutex, the third caller **runs while the orphan is still alive**.

  There is a softer case too. An exception while recording the pgid (ENOSPC on a host that writes multi-GB outputs is plausible) lets `finally` release the mutex and leaves the same pgid-less lock, with the build running in its own session.

  **Fix:**
  - A lock with no pgid reads live: 240, with the manual text.
  - Recording the pgid is wrapped: on failure, SIGKILL the group, wait for it, remove the lock under the mutex, and exit 244.
  - The manual text for a dead mutex or a pgid-less lock names the lock's `job` and `startedAt` and tells the human to check whether that build is still running before clearing anything.
- **c. A lock that parses but has the wrong shape reads dead.** `holderAlive` returns false for `{}`. It also returns false for `{"pid":"<the live current pid>"}`: probed, the probing process's own PID as a string read dead. Without validation, a malformed-but-parseable lock is "replaced", which is the unsafe direction. **Fix:** any lock that is not JSON with an integer `pid`, a string `host`, a `startTicks`, and a `pgid` that is absent or an integer above 1 reads live, the same as an unparseable one. Extend test 6 with `{}` and a string PID.
- **d. Review Focus 5 rests on a false premise.** It says "the overlay build uses multiprocessing". Neither `build-year-overlays.py` nor `build-raster-tiles.py` imports `multiprocessing`, `concurrent`, `subprocess` or `os.fork`, or calls `setsid` or `setpgrp` (I grepped their import lines and process calls). Each is a single process, so the group trivially holds it. The multi-process case is `preprocess:v2`. Its chain is npm, then sh, then npx, then tsx, then node, then `execSync` of `python3` and `ogr2ogr` (`preprocess.ts:128,136`); `rebuild.sh:38` runs the same chain. **Fix:** restate Review Focus 5 around that chain and own it with the test from 2a.

**3. Completeness [GATING]: CONCERN.** Several states are left unstated:

- **A dead or corrupt mutex.** It has no exit code, and `--retry` must never retry it, because it never heals.
- **A spawn failure.** Probed: with `detached: true` and a missing command, `pid` is `undefined`, `error` fires, `exit` never fires, and `close` fires with -2. A release hooked on `exit` never runs.
- **A dead or busy mutex at release time.** It should leave the lock, since liveness frees it (P0b r2 7e).
- **`MemAvailable` missing or unparseable.**
- **Nested calls.** If `rebuild.sh` and `preprocess:v2` are ever both wrapped, the inner call refuses 240 against its own parent.
- **The opt-in hole.** No npm script or `rebuild.sh` goes through the lock, including the quarterly one command Lee runs (DECISIONS, "Tiles are rebuilt…"), which counts as heavy under "unmeasured is heavy".

**Fix:** use one table: 240 held; 241 memory, including an unreadable or missing `MemAvailable` (fail closed); 242 mutex dead or corrupt, with its exact `rm -r` text and never retried; 243 mutex busy, retried; 244 nothing started, covering bad arguments, a refused state path, a spawn failure and a failed pgid record, each with its own reason on the `heavy-run: REFUSED` line. State the nesting rule ("wrap the outermost command only; a nested call refuses"). Index the opt-in hole in the Parking Lot (core 4).

**4. Right-sizing and reuse [GATING]: CONCERN.** Reusing `dir-mutex` is right, and at 64 lines the plan is proportionate. Three faults:

- There is no out-of-scope list, so nothing is indexed in the Parking Lot. Candidates: wrapping `preprocess:v2`, `build-tiles:v2` and `rebuild.sh`; the load half of the host rule; nested runs; other projects' heavy jobs on the same host.
- "Each revert-proven" overclaims: thirteen tests are listed against five mutants.
- The plan does not say that `scripts/lib/dir-mutex.mjs` stays untouched, and it is an installed tool path (`release-harness.ts:16`, TOOL_PATHS). If it changes, so does the release: the "No `install`" line becomes false, and `install` needs Lee's yes every time (DECISIONS, Deploy entry, 2026-11-10 amendment).

**Fix:** add an Out of scope section with Parking Lot lines; say "every test has a named mutant", or name which ones do; and state that `dir-mutex.mjs` is read-only in this relay.

**5. Security [GATING]: CONCERN.** Heavy-run's run is the equivalent of check-push's GO. The release tool refuses an override outside `VITEST` because "a fake universe cannot print GO" (`release-ledger.mjs:143-145`). Here, `OC_HEAVY_STATE_DIR=/tmp/x` or a meminfo override would each switch off one half of the lock with a single environment variable, which is the shortcut a session under a 241 might reach for.

**Fix:**
- Outside `VITEST`, the override and every seam (meminfo path, retry interval, crash point, interleave pause) are refused with 244.
- Under `VITEST`, the release guard applies verbatim.
- The harness scrubs inherited `OC_HEAVY_*`, as `release-harness.ts:39-45` does for `OC_RELEASE_*`.
- The command is spawned as an argument array with no shell.

**6. Failure modes [GATING]: FAIL.**

- **a. A build killed by a signal reports success.** "The child's exit code is passed through". Probed on Node v22.22.1: a child killed with SIGKILL gives `exit` code `null` and signal `SIGKILL`, and `process.exit(code)` then exits **0**. An overlay build killed by the OOM killer at minute 30 would therefore report success, and MEASURE would go ahead on partial output. **Fix:** a signal death exits 128 plus the signal number (137, 143), and test 11 asserts it.
- **b.** The spawn-failure and pgid-record failure paths are covered in core 3 and core 2b.
- **c.** The plan does not say how `kill(-pgid, 0)` answers are read. Only ESRCH means dead; EPERM is live.
- **d.** A child that ignores the forwarded SIGTERM keeps the lock for as long as it lives. State that as the accepted behaviour; a second signal escalating to SIGKILL is optional.

**7. Change safety [GATING]: CONCERN.** The relay is reversible: one new script, a test and docs, released through the ledger with a named rollback. The exposure sits in the recovery texts and the guard.

**Fix:**
- Every manual-clear text checks for a running build first (core 2b).
- The path guard is fixed so the test suite can never touch the real lock (core 1d). As written, every session's `npm test` on this host would run next to real builds.
- `dir-mutex.mjs` stays untouched (core 4).

**8. Data integrity and compatibility [GATING]: PASS.** The lock file is the single source of truth, and no migration is needed. Advisory: say that replacing the lock means unlink, then an `O_EXCL` create under the mutex. Say that the pgid record is a temp-write-and-rename, and its temp name falls inside the ignored pattern (verified for `heavy-build.lock.tmp.*`). A torn in-place write would read live, which is the safe side, but costs a needless manual clear.

**9. Verifiability [GATING]: FAIL.**

- **a. The tests would never run.** `vitest.config.ts:7` collects only `src/**/*.test.ts` and `src/**/*.test.tsx`. `scripts/heavy-run.test.mjs` sits outside that pattern, so `npm test` and CI would pass while running none of the thirteen. **Fix:** put the tests in `src/test/pipeline/heavy-run.test.ts` with `// @vitest-environment node` (the default is happy-dom), next to `release-ledger.test.ts`, and reuse the harness pattern.
- **b. Two Review Focus items have no owning test**, which the rubric treats as a FAIL:
  - Item 4 (the retry never holds the mutex while sleeping). **Fix:** add a retry test with an interval seam in milliseconds. A held lock is freed after the first attempt, so the second attempt runs. While the launcher sleeps, another caller takes the mutex. A never-freed lock gives exactly seven attempts (one plus six retries) and then 240, plus the "goes to Lee" line.
  - Item 5. **Fix:** the group test from 2a.
- **c. The "spawn outside the mutex" mutant cannot fail test 8.** Model: two reclaimers on one dead lock, 15 trials each. The plan's order gives exactly one run 15/15, and so does the mutant, because writing the lock under the mutex already serializes reclaimers. What this mutant breaks is crash safety. With a SIGKILL straight after spawn, the mutant's second caller **runs** at once (no dead mutex), while the plan's is refused. **Fix:** pin this mutant to the rebuilt test 5. That test uses a crash seam (SIGKILL self after spawn, honoured only under `VITEST` with the override set), asserts that the next caller is refused, that no second child starts and that the manual text names the job. Do not pin it to test 8.
- **d. Test 8 catches its real mutant only by luck.** With "check outside the mutex", both reclaimers ran in 9 of 15 trials with no seam, and in 5 of 5 with a 300 ms widening seam. **Fix:** add a test-only pause between reading and writing, and name the mutant "check-and-replace outside the mutex".
- **e. Every "runs" test needs a memory stub.** The meminfo stub is mentioned only for test 7. On this host at 04:56:51 UTC, `/proc/meminfo` read 21,455,756 kB available out of 32,799,724 kB with no build running. One 12 GB build takes that under 16,777,216, and then tests 2, 5, 8, 9, 11 and 12 would get 241 and go red, precisely while a heavy build runs. CI runs on `ubuntu-latest` (`ci.yml:17`). I did not read that runner's memory, and a hosted runner should not be assumed to have 16 GiB free. **Fix:** the harness defaults the meminfo seam to a value above the floor for every test. Test 7 alone sets the boundary values.
- **f. Missing assertions and cleanup.** No test produces 242, 243 or 244, a spawn failure, a signal-death code or a wrong-shaped lock, and "refusal codes are 240-244" is not an assertion. Tests 3 and 12 leave surviving groups behind. **Fix:** one assertion per code, and an `afterEach` that SIGKILLs every recorded pgid.

**10. Maintainability [GATING]: CONCERN.**

- **The docs line contradicts the design.** "A dead holder is cleared by a human with the printed path", but the design replaces dead holders itself. The things that need a human are an unparseable or wrong-shaped lock, another host's lock, a pgid-less lock, and a dead or corrupt mutex. Print the exact `rm` or `rm -r` text for each (P0b r2 6b).
- **No canonical invocation.** A worktree forked before HEAVY merged has no `scripts/heavy-run.mjs`, and that failure tempts a bare run. Name one invocation, for example the primary checkout's copy on `main`, or state version skew as accepted.
- **Missing pointers.** Add `heavy-run.mjs` to the §Layout `scripts/` line and a pointer in §Pipeline, where the heavy jobs are described.
- **The coordinator's host rule belongs in DECISIONS.** The rule (1-minute load under 8, announce first) is relayed. It is a ruling that a future session could break without knowing, and no code shows it. Propose it as a DECISIONS operating constraint through `update-decisions.mjs`, marked relayed, rather than only in ARCHITECTURE.

## Conditional dimensions

**X5 Concurrency and re-entrancy [GATING, adjusted]: FAIL.** "What if this runs twice, or mid-flight?" has a wrong answer in three places:

- the lock is released while the group lives (2a, measured);
- a crash in the critical section leads to a second build once the mutex is cleared (2b, measured);
- a nested call refuses itself (3).

**Fix:** as in 2a, 2b and 3.

**X6 Operability [ADVISORY]: CONCERN.** Under the session harness a 35-minute build cannot run in the foreground, and nor can a `--retry` that waits up to an hour. **Fix:**
- Document the run pattern: the launcher goes in the background and the wrapped command contains no `&`, `nohup` or `setsid`.
- Document the stop procedure: signal the launcher, or `kill -TERM -- -<pgid>` from the lock.
- Every refusal prints the holder's `job`, `pid` and `startedAt`, so the coordinator can be told who holds the lock.
- Name the channel behind "goes to Lee" (the coordinator, or `/notify`).

The load half staying a session rule is defensible, because all five codes are taken and a 1-minute average is noisy. Say so in one line; alternatively, 241 could become "host resources short".

**X8 Dependencies, performance and cost [ADVISORY]: PASS.** No packages beyond Node's built-ins and `dir-mutex`. The retry is six sleeps, and the tests spawn short `node -e` children. The groups are cleaned up as in 9f.

## Stress tests

**Pre-mortem.** It is February and HEAVY has failed.

1. **The gate failed open.** MEASURE ran `heavy-run --job overlays -- bash -c 'nohup python3 scripts/build-year-overlays.py … &'`, following the habit recorded on 2026-09-02. The wrapper exited in a second and the lock went with it. A second session's raster build then passed the lock and the memory check together, because the first build was still allocating. With two heavy builds and four sessions on 32 GB, the OOM killer took out sessions. The release-on-direct-child-exit rule was visible at plan time and has been demonstrated here.
2. **A killed build reported success.** The overlay build was OOM-killed at minute 30. The launcher passed `null` through as 0, and the session committed a partial set of year PNGs to the story: a public visual made from incomplete data.
3. **The guard was never a guard.** The thirteen tests lived in `scripts/` and vitest never collected them. The revert proofs were run once by hand and recorded, and a later fix to `heavy-run.mjs` broke owner-safe release with CI green.

**Load-bearing assumptions.**

1. *A build lives as long as the launcher's direct child.* False for backgrounded wrappers and possible for npm chains (2a, measured). **Resolve before implementation.**
2. *Every heavy build goes through `heavy-run`.* Low confidence. Nothing wraps the npm scripts or `rebuild.sh`, and old worktrees lack the script. If wrong, the lock protects only the builds that ask. Park it explicitly.
3. *The tests run in `npm test`.* False as planned (9a). **Resolve before implementation.**
4. *A crash in the critical section is too rare to matter.* The rule was settled the other way, and an exception while writing the pgid (ENOSPC) is not rare on a build host. **Resolve before implementation** (2b).

**Inversion.** The rejected alternative is a kernel lock: `flock(1)` holding the lock file for the life of the build. It would win if the lock had to survive every descendant, including `nohup` and `setsid` ones, with no PID, start-tick or pgid heuristics. Its conditions are already true:

- `/usr/bin/flock` (util-linux 2.39.3) is on the host.
- `~/marvin/state` is on a local ext-family filesystem (`stat -f`).
- Probed: `flock -n -E 240 L sh -c 'setsid sleep 3 & exit 0'` makes a second `flock -n` on L exit 240 while the `setsid` grandchild runs, and 0 after it ends.

Under flock, the release-while-group-lives defect, both crash windows, the dead-holder manual clears, PID and pgid reuse, the `setsid` limit and the reclaimer race all disappear, because the kernel drops the lock when the last descendant holding the file descriptor exits. Its residual limit is a descendant that closes inherited file descriptors (a daemonizer), which is the same class as `setsid` today. It conflicts with the binding's `O_CREAT|O_EXCL`-plus-PID mechanism, so it would be a recorded amendment, a plumbing call the session can make with provenance, not a silent swap. This is not a must-fix, but it removes about half of this round's findings, and is worth the coordinator's look before Ted builds the harder version.

## Close

**Overall verdict: FAIL.** The design is close, and the reuse of `dir-mutex` and the order inside the mutex are right. Five gating dimensions fail on defects measured against the real primitive:

- The lock is dropped while a backgrounded build still runs.
- A crash after spawn becomes a second build once the printed mutex clear is followed.
- A signal-killed build reports exit 0.
- The test file would never be collected.
- Two settled binding items (the 242/244 codes and the malformed-ledger test) are silently changed or dropped, and the path guard is paraphrased into a different guard.

Each has a concrete fix that keeps the binding shape.

**Must-fix, in priority order:**

1. Put the tests in `src/test/pipeline/heavy-run.test.ts` (node environment, `OC_HEAVY_*` scrubbed, meminfo seam defaulted above the floor, groups killed in `afterEach`).
2. Release the lock only when the group is gone, not when the direct child exits, with the `sh -c 'sleep N & exit 0'` test and the run-in-background, no-`&` docs.
3. Crash window:
   - a pgid-less lock reads live;
   - a failed pgid record kills the group, removes the lock and exits 244;
   - the manual texts check for an orphaned build first;
   - test 5 is rebuilt with a crash seam asserting refusal, and owns the "spawn under the mutex" mutant.
4. Restore the code table: 242 mutex dead or corrupt, never retried; 243 busy, retried; 244 nothing started, covering spawn failure, bad arguments, refused path and pgid-record failure. A signal death exits 128 plus the signal number, `MemAvailable` unreadable gives 241, EPERM on the group check reads live, and every code gets a test.
5. Copy the release tool's path guard verbatim under `VITEST`, and refuse the override and every seam outside it. Rewrite Review Focus 3.
6. Restore the binding test "malformed ledger irrelevant".
7. Give Review Focus 4 and 5 owning tests (the retry with an interval seam; the group test), and correct the multiprocessing premise to the `preprocess:v2` chain.
8. Make test 8 deterministic with an interleave seam, and rename its mutant to "check-and-replace outside the mutex".
9. Wrong-shaped locks read live; extend test 6.
10. Add an Out of scope section with Parking Lot lines (wrapping npm scripts and `rebuild.sh`, nesting, the load half, other projects' builds). State that `dir-mutex.mjs` is not edited.
11. Docs: fix the "dead holder" line, give the exact `rm`/`rm -r` texts, the stop procedure, the canonical invocation, and the §Layout and §Pipeline pointers. Propose the coordinator's host rule to DECISIONS through the writer, marked relayed.
12. Release: the `request --approval` cites the 2026-11-10 standing-yes words verbatim, marked relayed, as that DECISIONS amendment requires.
