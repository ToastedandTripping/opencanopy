Overall verdict: FAIL (round 2)

# Critic, round 2 of at most 3: HEAVY, the heavy-build lock (flock design)

Plan: `.claude/plans/2026-11-heavy-run.md` at d4192fc, read whole. Diff read: `git diff 8522075 d4192fc -- .claude/plans/2026-11-heavy-run.md`. Round 1: `-critic-r1.md`, read whole. Reviewer: plan-reviewer agent (Opus, xhigh), rubric v2. Review started 2026-11-11 05:06 UTC (`date -u`).

**Sources read.** The binding section, `.claude/plans/2026-10-p0b-release-tooling.md:255-264`. `scripts/release-ledger.mjs:120-152` (the guard the plan copies). `vitest.config.ts`. `src/test/pipeline/release-harness.ts:1-80`, and `release-ledger.test.ts:17` (`testTimeout: 30_000`). `package.json` scripts. `scripts/pipeline/rebuild.sh`, plus the process calls in `scripts/pipeline/preprocess.ts` and `build-tiles.ts` (`execSync` only). The import lines and process calls of both Python build scripts: neither imports `subprocess`, `multiprocessing` or `os.fork`. `.claude/DECISIONS.md`: every heading, plus Operating constraints in full. `decisions-check.sh` reports `29 entries | HEAD 29 | history: 0 removed`, `ref=origin/main@b5c0753 2026-11-10`. ROADMAP:39,130. A `git grep` of `~/marvin` for `heavy-build`, for lock deletions under `state/` and for `git clean`. `git -C ~/marvin check-ignore -v` on the lock and the sidecar.

**Probes.** All of them ran in `.../scratchpad/heavy2/`, with short `sleep` children and never a build. Each "probe" is a third-party `flock -n -E 240 <lock> true`: 240 means the lock is held, 0 means it is free. Host: util-linux `flock` 2.39.3 (`/usr/bin/flock`), Node v22.22.1 (nvm, `~/.nvm/versions/node/v22.22.1/bin/node`). I wrote two models:

- `plan-heavy.mjs` models the plan's design as written. An outer Node process spawns `flock --nonblock --conflict-exit-code 240 <lock> node <self> --inner …`. The outer forwards SIGINT, SIGTERM and SIGHUP to flock. The inner reads meminfo, writes the sidecar, spawns the command with `stdio: "inherit"` and forwards signals to it. It exits with the command's code, or 128 plus the signal number. `FLOCK_CLOSE=1` is the `flock -o` mutant.
- `fix-heavy.mjs` is the alternative this round recommends (core 2).

One side effect outside scratch: `npm run -s` in a scratch package wrote a debug log under `~/.npm/_logs/` (2026-11-11T05:19:55Z). Nothing else outside scratch and this file was written.

**Claims re-verified true this round:**

- `flock` 2.39.3 is at `/usr/bin/flock`.
- `~/marvin/.gitignore:71 state/heavy-build.lock*` covers both `heavy-build.lock` and `heavy-build.lock.json`.
- No `~/marvin` script deletes `state/*.lock` or runs `git clean`.
- Neither Python build script spawns processes.
- `preprocess:v2` and `rebuild.sh` are synchronous chains (`execSync`, sequential bash).
- Run directly from flock, `sh -c 'sleep 2 & exit 0'` and `sh -c 'setsid sleep 2 & exit 0'` keep the lock until the sleep ends (probe 240), which is round 1's inversion result, reproduced.
- SIGKILL of the plan model's whole process group releases the lock at once (probe 240 before, 0 after, no survivors).
- Not verified: the util-linux version on GitHub's `ubuntu-latest`, since I had no network read. That is not load-bearing, because a missing `flock` turns the tests red, not silent.

## The finding that changes the design: Node drops the descriptor

**Node marks every inherited descriptor close-on-exec at startup, so the lock never reaches the command.** Measured as follows:

- **The descriptor flags.** Under `flock <lock> node -e …`, `/proc/self/fdinfo/3` reads `flags: 02100000`, which is `O_CLOEXEC` set. Under `flock <lock> sh -c 'cat /proc/$$/fdinfo/3'` it reads `flags: 0100000`, which is not.
- **The plan model.** I listed `/proc/<pid>/fd` and `fdinfo` for each process in a `--job g -- sleep 3` run. flock and the inner Node hold fd 3 with `lock: FLOCK ADVISORY WRITE`, and the `sleep 3` command has **no** lock descriptor.
- **Backgrounded and detached grandchildren** (`sh -c 'sleep 3 & exit 0'`, `sh -c 'setsid sleep 3 & exit 0'`, `sh -c 'nohup sleep 3 … & exit 0'`). For each, the launcher exits 0 and the probe reads **0 while the sleep runs**: the lock is lost.
- **The Node hop in isolation.** `flock L node -e 'spawnSync("sh",["-c","sleep 2 & exit 0"],{stdio:"inherit"})'` gives probe 0. The same call with `stdio:["inherit","inherit","inherit",3]` gives probe 240. Passing the descriptor explicitly survives the hop.
- **The npm hop.** `flock L sh -c 'npm run -s bg'`, where `bg` is `sleep 2 & exit 0`, gives probe 0. npm is Node, so it drops the descriptor as well.

The plan's "spawns the command (inheriting the lock descriptor)" is therefore false on this host's Node. That puts the plan's own test 2 red as designed. Its named mutant, "FD_CLOEXEC on the command", is the shipped behaviour rather than a mutant. And the crash case the amendment says it removes is back:

- **K1.** SIGKILL the inner (the PID the sidecar names) while `sleep 4` runs. The build keeps running, the outer exits 137, and the probe reads **0**, so a second heavy build may start beside the first. This is round 1's "crash, then a second build" class, now reached through the inner instead of the pgid window.

Round 1 owns part of this. Its inversion probe ran `flock … sh -c …` with no Node process between flock and the command, and the plan generalised it to a tree that has one. A relayed probe is a lead until it is rerun on the real shape, and it did not survive.

**flock does not forward signals.**

- **flock alone.** `setsid flock -n -E 240 L sh -c 'trap … TERM; sleep 5 & wait'`, then SIGTERM to flock. flock dies, the child never gets TERM (the trap log stays empty), and the probe reads 240 until the sleep ends.
- **K3, the plan model.** SIGTERM to the outer, which forwards it to flock as the plan says. The outer exits **143**, the build is still running and never got TERM, and the lock stays held by the inner. The documented stop ("signal the heavy-run launcher, which forwards") reports the build as killed while it runs on holding its memory.
- **K2.** SIGKILL of the outer alone leaves flock and the inner holding the lock (probe 240). The build's eventual exit status reaches nobody.

**flock's own exit codes collide with the command's** (measured, no Node involved):

| Case | flock exit |
|---|---|
| lock held | 240, with nothing printed |
| lock directory missing | 66 (`cannot open lock file … No such file or directory`) |
| lock directory not writable | 66 |
| command not found or not executable | 69 (`failed to execute …`) |
| child killed by SIGKILL / SIGTERM | 137 / 143 |
| child exits 240 itself | 240 |
| the lock path is a directory | 0 (flock locks the directory) |

The plan's wrapper passes every one of these through as though the command had produced it.

**The alternative works.** `fix-heavy.mjs` is one Node process with no flock wrapper and no inner process:

1. It opens the lock file itself.
2. It runs `flock --nonblock --conflict-exit-code 240 3` with that descriptor as `stdio[3]`, so flock locks the open file description that Node holds and then exits.
3. It checks memory.
4. It spawns the command with `detached: true` and the descriptor passed explicitly as `stdio[3]`.
5. It forwards signals to `-pgid`.

Measured results:

- Backgrounded, `setsid` and `nohup` grandchildren hold the lock until they end (240, then 0 after).
- **FK1:** SIGKILL of the only launcher leaves the build holding the lock (240).
- **FK3:** SIGTERM to the launcher reaches the build (the trap log reads `build-got-TERM`), and the launcher exits with the build's own code, 7.
- A second run while the first holds the lock gives 240.
- A missing state dir gives `heavy-run: REFUSED 244 cannot open lock file: ENOENT`.
- A command that is not found gives `REFUSED 244 cannot start command: ENOENT`.
- A command that exits 240 gives 240 with no REFUSED line, so the launcher can tell a refusal from a command result.
- A command killed by SIGKILL gives 137.
- The residual limit is measured too. A Node command that spawns a detached child and exits loses the lock (probe 0), because Node drops the descriptor for its own children.

## Round-1 fold check

| r1 must-fix | Status under the flock design |
|---|---|
| 1. Tests in `src/test/pipeline/`, node env, `OC_HEAVY_*` scrubbed, meminfo defaulted, groups killed | **Folded.** The afterEach needs the launcher spawned `detached` (own group) or it kills vitest's group; in the recommended design the command has its own group too, so both are killed (core 9) |
| 2. Release only when the group is gone; background test; docs | **Moot in principle, reopened in fact.** Test 2 and the docs line are folded, but the design as written loses the lock at the Node hop (measured), so the rule's purpose is unmet (core 2) |
| 3. Crash window | **Moot in principle, reopened through the inner.** SIGKILL of the inner leaves the build running and the lock free (K1, measured) |
| 4. Code table | **Partly folded.** The 242/243 retirement is sound and 128+signal is adopted. But 244-for-nothing-started and the REFUSED line cannot be produced through the flock wrapper for a missing or unwritable state dir (flock prints its own 66), and a command's own 240/241 is indistinguishable from a refusal, so `--retry` re-runs a build that ran (core 3, core 6) |
| 5. Path guard verbatim, seams refused outside `VITEST`, Review Focus 3 | **Folded.** The guard description matches `release-ledger.mjs:134-151` in shape, and refusing the override outside `VITEST` is the right tightening for a tool whose "run" is the GO. Not folded: the "argument array, no shell" line (minor). New exposure: `--inner` (core 5) |
| 6. Malformed-ledger test | **Folded** (test 13) |
| 7. Review Focus 4/5 owned; multiprocessing premise | **Premise corrected.** RF4 owned by test 11. RF5 is owned in name only: test 2's `sh` shape is not the `npm`/`npx`/`tsx`/`node` chain, which drops the descriptor at every hop (measured on the npm hop) (core 9) |
| 8. Deterministic interleave for the reclaimer test | **Moot** (the kernel arbitrates; no read-then-write). Test 6 now needs a hold barrier instead (core 9) |
| 9. Wrong-shaped lock reads live | **Moot** (nothing decides on file content). Test 7 keeps the sidecar property |
| 10. Out of scope + Parking Lot; `dir-mutex.mjs` untouched | **Folded** |
| 11. Docs | **Partly folded.** Dead-holder line fixed; pointers added; DECISIONS proposal declined with a reason I accept (it is the coordinator's host rule, not Lee's, and spans projects). Wrong: the stop procedure (K3). Missing: "never delete the lock file" (core 7), the canonical invocation's actual content (core 10) |
| 12. Verbatim relayed approval | **Folded** |

Round-1 items outside the must-fix list, still open: "each revert-proven" overclaims (r1 core 4; now 13 tests, 6 mutants, 5 tests with none); refusals naming the holder and the channel behind "goes to Lee" (r1 X6); the nesting behaviour stated, not only parked (r1 core 3); a child that ignores SIGTERM keeps the lock, stated as accepted (r1 core 6d).

**Binding rules: what the amendment keeps and what it drops without saying so.** The amendment itself is within the session's authority: the bullets are introduced as "the rules three critic rounds settled" (p0b:257), and a lock primitive is plumbing (working-with-lee: plumbing calls are the session's, with provenance). One ambiguity, named so nobody trips on it later: the clause "reusing `dir-mutex`" sits in the paragraph that opens "Lee, 2026-11-01:". Read in context it is the plan author's description of the relay, not a technical ruling of Lee's, and the plan's provenance line is enough; if anyone reads it as Lee's, it is a one-line amendment to put to him, not a reason to keep the broken mechanism. Kept: the memory floor, refusals reserved at 240-244, retry of the retriable codes, the path guard, the malformed-ledger test. Moot and rightly dropped: PID/start-tick liveness, pgid record, unparseable-reads-live, PID reuse, the reclaimer race. Stated as a limit: "another host reads live" became "per host" (acceptable; `~/marvin/state` is local). **Dropped silently:** "spawn as its own group" and "Signals forward to the group" (the plan forwards to flock, then to the direct child only). **Claimed kept but not kept:** "never a second build after a crash" (K1), and the "crash before pgid" test has no flock-era equivalent, since test 4 as worded kills the one process whose death never mattered.

## Applicability

Developer tooling: a mutual-exclusion and admission control for heavy data builds on one shared 32 GB, 4-core host, shipped as a site release with no runtime change. Same classification as round 1.

| Dim | Fires | Tag | Why |
|---|---|---|---|
| Core 1-10 | always | GATING | |
| X5 Concurrency | yes | **GATING (adjusted)** | Mutual exclusion is the product; a concurrency defect is the product failing |
| X6 Operability | yes | ADVISORY | A launcher runs unattended for ~35 min; its refusals and stops are acted on by sessions and the coordinator |
| X8 Dependencies, cost | yes | ADVISORY | New reliance on a system binary (`flock`); a polling retry; process-spawning tests |
| X1 Physical safety | **does not fire** | | No hardware or hazardous output; host memory exhaustion is judged under core 6 and X5 |
| X2 Privacy | **does not fire** | | The sidecar holds a PID, host, job name, command line and timestamps; no personal, client or child data |
| X3 Evidence | **does not fire** | | No research or public claims; the plan's factual claims are checked under core 2 and 9 |
| X7 Self-modification | **does not fire** | | An OpenCanopy script writing two ignored runtime files under `~/marvin/state`; no MARVIN gate, hook, skill or automation changes |
| X4 Audience/money | N/A | | Nothing public changes |

## Verdicts

**1. Problem-fit [GATING]: CONCERN.** The goal matches the Anchor, the anti-goals hold, the Intent skip line stands, and no DECISIONS entry is contradicted (29 entries, `ref=origin/main@b5c0753`). The amendment is a legitimate plumbing call with provenance. The concern is the binding bookkeeping: "the rules' purpose … the behavioural test list stand" is stated, but "spawn as its own group" and "Signals forward to the group" are dropped without a word, and "never a second build after a crash" is claimed preserved when the design does not preserve it (core 2). **Fix:** list, in the Design's "what stays" paragraph, each binding bullet as kept, moot (with the one-word reason), or amended; restore "the command runs in its own process group and signals go to the group".

**2. Approach soundness [GATING]: FAIL.**
- **a. The lock does not reach the command.** Node v22.22.1 sets `O_CLOEXEC` on inherited descriptors at startup (`fdinfo` flags `02100000` under Node, `0100000` under `sh`), and the inner spawns with `stdio: "inherit"`. Measured on the plan model: the command holds no lock descriptor; backgrounded, `setsid` and `nohup` grandchildren run with the lock free (probe 0); SIGKILL of the inner leaves the build running with the lock free (K1). The design's premise ("every child inherits") holds for `flock → sh`, which round 1 probed, and fails for `flock → node → command`, which is what the plan builds. The same holds for every Node process inside a command (`npm`, `npx`, `tsx`): the npm hop drops it (measured).
- **b. Signals go to the wrong process.** flock(1) does not forward signals; SIGTERM kills flock and orphans the inner and the build (measured directly and as K3). The outer then exits 143 while the build runs on.
- **c. The two-process wrapper is the source of both, and of the exit-code ambiguity (core 6).** It also adds an undocumented `--inner` entry that skips the lock (core 5).

**Fix (recommended, measured in `fix-heavy.mjs`):** one launcher process. It opens `<state>/heavy-build.lock` itself (`O_RDONLY|O_CREAT`; failure is 244 with the errno), runs `flock --nonblock --conflict-exit-code 240 3` with the descriptor as `stdio[3]` (0 locked, 240 held, anything else or a spawn error is 244), reads meminfo while holding (241 closes the descriptor before returning, so nothing is held during a retry sleep), writes the sidecar, spawns the command with `detached: true` and `stdio: ["inherit","inherit","inherit", fd]`, forwards SIGINT/SIGTERM/SIGHUP to `-pgid`, and exits with the command's code or 128 plus the signal. No `--inner`, no flock wrapper process, no relative `node scripts/…` path. **Minimal alternative** if the wrapper is kept: the inner finds the lock descriptor (scan `/proc/self/fd` for the lock path) and passes it in the command's `stdio` array; the outer spawns flock `detached` and forwards to `-pgid` of flock's group; flock's own codes and "inner started" are disambiguated by a side channel; `process.execPath` and the absolute script path replace `node scripts/heavy-run.mjs`; `--inner` proves it holds the lock or refuses. The minimal path fixes more things in more places; the single process is smaller and was measured green on every case here.
- **d. Stated limits need one correction:** "Python's `subprocess` closes fds in its children … but the parent Python process keeps the lock" is true only once the descriptor is passed explicitly. Add the measured Node limit: a Node command (including `npm run …`) holds the lock itself but passes it to none of its children, so a Node command that detaches work and exits loses the lock (measured, probe 0). For `preprocess:v2` this is harmless because the chain is synchronous; say so.

**3. Completeness [GATING]: CONCERN.**
- **Exit-code states the wrapper cannot express** (measured, table above): a missing or unwritable state dir surfaces as flock's 66 with flock's own message, not `heavy-run: REFUSED 244`; `node` not on flock's PATH would surface as 69; a command that exits 240 or 241 is read as a refusal and, under `--retry`, **re-run**; test 12's "242 and 243 are never emitted" is false whenever the command itself exits 242 (pass-through). **Fix:** adopt core 2's design (the launcher knows which codes are its own), or a side channel. State that the command's own exit codes pass through even inside 240-244, are never retried, and are followed by a `heavy-run: command exited N` line so a caller can tell them from a refusal. Rephrase test 12 as "heavy-run's own refusals never use 242 or 243".
- **The lock-path-is-a-directory case** (flock locks a directory without complaint, measured 0): harmless, but the opener should require a regular file or create one.
- **Nesting:** parked, but its behaviour is not stated. A nested call opens a new description and gets 240 against its own parent; with `--retry` it waits an hour on itself. **Fix:** one docs line, "wrap the outermost command only; a nested heavy-run refuses 240".
- **SIGTERM during the retry sleep:** unstated. **Fix:** exits 128 plus the signal without another attempt; one assertion in test 11.

**4. Right-sizing and reuse [GATING]: PASS.** 69 lines for a new tool, its test and docs is proportionate; Out of scope is present with Parking Lot lines; `dir-mutex.mjs` is "not used and not edited", so the "No `install`" line holds. One batch, under eight files. The "each revert-proven" overclaim is judged under core 9. Advisory: the single-process design in core 2 is also the smaller one (no second Node process, no `--inner` path to guard).

**5. Security [GATING]: CONCERN.** The path guard is now the release tool's in shape, refuses the override and the seams outside `VITEST`, and keeps tests off the real lock. New exposure: `--inner` is a public flag that runs the command without taking the lock, exactly the one-flag shortcut round 1 closed for the env override; a session refused 240 that reads the source can reach it. Also the wrapper execs `node` by PATH. **Fix:** remove `--inner` (core 2's design), or make it refuse unless `/proc/self/fdinfo` shows a held `FLOCK` on the lock path's inode; use `process.execPath` and an absolute script path; state "argument array, never a shell" for the command spawn. Accepted, and worth one line: `VITEST=1` plus a fake override bypasses both halves, which is no worse than not calling heavy-run (it is opt-in).

**6. Failure modes [GATING]: FAIL.**
- **a. A stopped build reports stopped and keeps running** (K3, measured): the documented stop exits 143 to the caller while the build continues, holding its memory and the lock. **Fix:** signals go to the command's process group (core 2); test 9 asserts a grandchild that only a group signal reaches is gone.
- **b. flock's own failures masquerade as build results** (66, 69, measured). **Fix:** core 2/3.
- **c. A launcher-side death loses the lock** under the design as written (K1). **Fix:** core 2.
- **d. Unchanged and fine:** a signal death exits 128 plus the signal (flock itself does the same, measured 137/143); unreadable or missing `MemAvailable` is 241. **State as accepted:** a command that ignores SIGTERM keeps the lock while it lives; a SIGKILLed launcher loses the build's exit status (the build runs to completion unobserved).

**7. Change safety [GATING]: CONCERN.** Reversible relay; the release path is unchanged. One new hazard the flock design introduces: **deleting `heavy-build.lock` while a build holds it lets the next run create and lock a fresh inode and start beside it.** The P0b design made `rm` of the lock the documented manual clear, and the P0b briefs under `~/marvin/state/relay/` still describe that design, so the habit has a source. Nothing in `~/marvin` deletes state lock files today (grep: no `rm`/`unlink` of `state/*.lock`, no `git clean`). **Fix:** the docs say "never delete or replace `heavy-build.lock`; it is an empty file whose presence means nothing; the sidecar may be deleted freely"; the 240 refusal line names `fuser -v <lock>` (present at `/usr/bin/fuser`) as the way to see the real holders.

**8. Data integrity and compatibility [GATING]: PASS.** The kernel lock is the single source of truth; the sidecar is explicitly informational; no migration (nothing was ever written at the lock path). Advisory: write the sidecar by temp-and-rename (a torn sidecar only misleads a human), and say it can be stale after a SIGKILL.

**9. Verifiability [GATING]: FAIL.** Two of the six named revert proofs cannot turn their named test red, one named mutant is the design's own behaviour, and two tests depend on timing the plan does not control.

| # | Test | Discriminates its mutant? |
|---|---|---|
| 1 | held lock | Yes against "drop `--nonblock`", if the first run is confirmed holding (sidecar present, or a ready file from the child) before the second starts. Without that handshake a loaded host can start the second first |
| 2 | backgrounded | **Red on the design as written** (measured). Under core 2's fix it discriminates "descriptor not passed" (measured both ways: explicit pass 240, inherit 0) |
| 3 | tree SIGKILL | No mutant; a regression guard against any presence-file lock. Must kill the launcher's group and (core 2) the command's group |
| 4 | parent killed | **No, as worded.** "SIGKILL only the launcher" kills the outer; flock still holds the lock, so the `-o`/CLOEXEC mutant passes (measured M4: 240). The process whose death mattered is the inner (K1: 0). Under core 2 there is one launcher and the test is meaningful |
| 5 | memory | Yes (`<=`). Add: `MemAvailable` line absent is 241 |
| 6 | two racers | Yes against "drop `--nonblock`" only if the attempts overlap. Each holder's child must block on a barrier until the loser has returned; otherwise sequential non-overlap on a loaded host makes both run and the correct code goes red |
| 7 | sidecar ownership | Yes against "remove unconditionally" only if the test writes a foreign sidecar during the run and asserts it survives. Say so |
| 8 | exit status | Yes (`null` as 0) |
| 9 | signals | **Red on the design as written** (K3). No mutant named; pin "signal the direct child only" and assert on a grandchild |
| 10 | 244 paths | No mutant. Add the missing state dir (the flock-66 path) and a PATH without `flock` |
| 11 | retry | **No against "retry on 244"**: test 11 contains no 244 case. Also an off-by-one: "retried … six times" is seven attempts, "six refusals end with the last code" is six. **Fix:** a 244 under `--retry` makes exactly one attempt; a command's own 240 is not retried; a never-free lock makes exactly the binding's count (pick one: 1 + 6) with the "goes to Lee" line; after a 241 a third caller takes the lock during the sleep (Review Focus 4) |
| 12 | 242/243 | Rephrase (core 3); no mutant possible |
| 13 | malformed ledger | No mutant; binding regression guard, fine |

- **The heading still says "each revert-proven"** with five tests (3, 9, 10, 12, 13) that have no mutant (r1 core 4, unfolded). **Fix:** "the tests below with a named mutant are revert-proven; 3, 10, 12 and 13 are regression guards", and give test 9 its mutant.
- **Review Focus 5 is owned in name only.** Test 2's `sh` shape is the one case where descriptors pass; the `preprocess:v2` chain is Node at every hop. **Fix:** restate RF5 as "a Node command holds the lock itself and passes it to no child; a synchronous Node chain therefore holds it to the end" and own it with a short test: command `node -e` that runs `spawnSync('sleep', ['1'])` holds the lock during the sleep, and (as the documented limit) one that detaches a child and exits does not.
- **Timing.** The repo already lost a live check to host load (commit `dc48115`, "pointer click timed out under host load"). Every hold window should be a barrier the test releases, not a `sleep 3`; set an explicit per-file timeout as `release-ledger.test.ts:17` does.

**10. Maintainability [GATING]: CONCERN.**
- **The P0b binding text is left pointing the wrong way.** ROADMAP:130 says "Binding rules: `.claude/plans/2026-10-p0b-release-tooling.md`, 'Relay HEAVY'", and that section prescribes `O_CREAT|O_EXCL`. A later session auditing heavy-run against its binding rules will read the flock design as a violation, or "restore" it. **Fix:** the ARCHITECTURE paragraph says the kernel lock supersedes P0b's mechanism (critic r1, r2) and the ROADMAP shipped entry says the same; optionally one pointer line under the P0b section.
- **The canonical invocation is promised but not chosen.** Name it in the plan (for example the primary checkout's `scripts/heavy-run.mjs` on `main`), since a worktree forked before HEAVY merged has no script. The lock path is absolute, so copies agree on the lock; only the script's presence varies.
- **The stop procedure** in the docs is wrong as designed (core 6a); with core 2's fix it is right, and the sidecar should carry the command's pgid so `kill -TERM -- -<pgid>` works after a launcher is gone.

## Conditional dimensions

**X5 Concurrency and re-entrancy [GATING, adjusted]: FAIL.** "What if a second run starts mid-flight?" has a wrong answer in two measured places: a backgrounded or detached grandchild runs with the lock free (probe 0), and a SIGKILLed inner leaves the build running with the lock free (K1). A nested call refuses itself (unstated). **Fix:** core 2 and core 3.

**X6 Operability [ADVISORY]: CONCERN.**
- **Stop:** the documented stop does not stop (K3).
- **Who holds it:** 240 is silent from flock (measured); the launcher's REFUSED line should print the sidecar's `job`, `pid`, `startedAt` marked "may be stale", and `fuser -v <lock>` for the live holders (r1 X6, unfolded).
- **Channel:** name who "goes to Lee" means: the coordinator, or `/notify` (r1 X6, unfolded).
- **Launcher SIGKILLed:** the build's exit status is lost; the docs say to read the build's own log.

**X8 Dependencies, performance and cost [ADVISORY]: PASS.** `flock` is util-linux, present on the host (2.39.3) and in every Ubuntu image; no npm packages. Each test spawns a launcher, a short `flock` and a child; test 6's twenty trials are a few seconds at the measured 0.02 s Node start (05:18 UTC, load 2.68 on 4 cores).

## Stress tests

**Pre-mortem.** It is February, and HEAVY has failed.

1. **The gate failed open through a Node hop.** MEASURE wrapped the overlay build as `heavy-run --job overlays -- npm run …`, or the overlay build hung and a session stopped it by SIGKILL of the PID the sidecar names (the inner). In the first case, anything the npm script backgrounded ran without the lock. In the second, the build kept running with the lock free (K1). Either way S0b's raster build passed the lock and the memory check while the first build was still allocating, and the OOM killer took sessions with it. We should have seen it at plan time: Node drops inherited descriptors, and the design put a Node process between flock and every command.
2. **"Stopped" was a lie.** The coordinator asked for the overlay build to stop. The session signalled the launcher as the docs say. It got 143 and announced the build stopped, but the build ran on for 25 minutes holding 12 GB (K3). The next heavy job got a silent 240 that named no holder. A session that remembered P0b's "manual clear" deleted `heavy-build.lock`, and the next run locked a fresh inode and started beside the build. **The type-specific worst case is the gate failing open on a host shared by four other sessions.**
3. **The suite stayed green over the hole.** Test 2 went red during implementation, and the docs already say "never detach the command", so test 2 was dropped as out of contract. Test 4, which kills only the outer, stayed green under every mutant. The inner-crash hole shipped with "13 tests, revert-proven" in the hand-off.

**Load-bearing assumptions.**

1. *The command and its descendants inherit the lock descriptor.* **This is false across any Node process** (measured: flags, the plan model, the npm hop). If it is wrong, the lock lives only as long as the launcher side. **Resolve before implementation** with core 2's design.
2. *The launcher's forwarded signal reaches the build.* **False for flock** (measured). If wrong, stops misreport and builds outlive their launchers. **Resolve before implementation.**
3. *Nobody deletes the lock file.* Unstated. Nothing in `~/marvin` does it (grep). The risk is habit, and P0b's design supplies that habit. If wrong, there are two builds. **One docs line resolves it.**
4. *flock's exit code is the command's exit code.* **False at the edges** (measured: 66, 69, and a command's own 240). If wrong, refusals masquerade as build results and `--retry` re-runs a finished build. Resolved by core 2's design.

**Inversion.**

- **The P0b `O_EXCL` design** would win only if descriptor loss at a Node hop could not be fixed. It can be fixed by passing the descriptor explicitly in `stdio` (measured 240). That was the defect round 1 found in the old design, and the kernel lock remains the right choice.
- **The plan's flock-wrapper with `--inner`, against the single-process design**:
  - The wrapper would win if Node could not hold a flock itself. Node has no `flock` call, but `flock N` run as a child on a passed descriptor locks the description Node holds (measured: FK1, FK3, FK5 all correct).
  - The wrapper would also need every command to be a non-Node program, with nothing ever killing the inner. The inner is always Node, and `preprocess:v2` is npm, so its conditions are already false.
- **A cgroup memory cap instead of a lock** (`rebuild.sh` already runs Phase 4 under `systemd-run --user --scope -p MemoryMax=20G`) would win if the goal were bounding one build's memory. The Anchor is one build at a time, so a cap complements the lock and does not replace it.

## Close

**Overall verdict: FAIL.** Moving to a kernel lock is the right call, the amendment is within the session's authority, and most of round 1 is folded or genuinely moot. Four gating dimensions still fail on measured defects in the new design:

- The lock never reaches the command, because Node marks inherited descriptors close-on-exec. A backgrounded build therefore runs unlocked, and a killed inner leaves the build running with the lock free (core 2, X5).
- flock does not forward signals, so the documented stop reports a running build as killed (core 6).
- flock's own exit codes collide with the command's, so refusals pass as results and `--retry` can re-run a build that already ran (core 3, core 6).
- Two named revert proofs cannot turn their tests red, and one named mutant is the design's own behaviour (core 9).

All four are fixed by one change, measured green here: a single launcher that holds the descriptor, locks it with `flock -n 3`, passes it explicitly to a command running in its own group, and signals that group.

**Must-fix, in priority order:**

1. **Adopt the single-process design** (core 2, measured in `fix-heavy.mjs`). The launcher opens the lock and runs `flock --nonblock --conflict-exit-code 240 3` on that descriptor. It holds the lock through the memory check, and a 241 closes the descriptor before any retry sleep. It spawns the command with `detached: true` and passes the descriptor in `stdio[3]`, then forwards signals to `-pgid`. Delete `--inner`. If the wrapper is kept instead, apply every item of core 2's minimal alternative.
2. **Make the exit codes unambiguous** (core 3):
   - 244 covers an unopenable lock path, flock failing or missing, and a command that cannot start.
   - The command's own exit codes pass through, are never retried, and are followed by a `heavy-run: command exited N` line.
   - Test 12 is rephrased as "own refusals never use 242 or 243".
3. **Rebuild the tests that cannot fail** (core 9):
   - Test 4 kills the launcher, which is every process on the launcher side, leaving only the command.
   - Test 9 asserts that a grandchild receives the signal, pinned to the mutant "signal the direct child only".
   - Test 11 adds:
     - a 244 under `--retry` makes exactly one attempt;
     - the command's own 240 is not retried;
     - the attempt count is exact (one count, matching the binding);
     - a third caller takes the lock during the sleep after a 241;
     - SIGTERM during the sleep exits.
   - Tests 1 and 6 hold through a barrier, not a sleep.
   - Test 7 writes a foreign sidecar mid-run.
   - The heading drops "each revert-proven" and names which tests are regression guards.
4. **Own Review Focus 5 with a Node-shaped test** (core 9): a synchronous `node -e` command holds the lock, and one that detaches a child and exits does not, which is the documented limit. Correct the stated limits to name Node's close-on-exec.
5. **Docs** (core 7, core 10, X6):
   - Never delete `heavy-build.lock`.
   - Stop the build by signalling the launcher, which signals the group; after a lost launcher, use `kill -TERM -- -<pgid>` with the pgid from the sidecar.
   - A 240 names the sidecar holder, which may be stale, and `fuser -v`.
   - Wrap the outermost command only, because a nested call refuses itself.
   - Name the canonical invocation.
   - Say that the kernel lock supersedes P0b's mechanism, here and in the ROADMAP shipped entry.
6. **Binding bookkeeping** (core 1): list each P0b "Relay HEAVY" bullet as kept, moot or amended, and restore "the command runs in its own group; signals go to the group".
7. **Name the channel** behind "goes to Lee" (X6).
