# HEAVY: the heavy-build lock (`scripts/heavy-run.mjs`)

*Plan, 2026-11-11, revised after critic r1 and r2 (both FAIL; folded; the design is critic r2's tested single-launcher flock design). Session marvin/canopy (driven by marvin session-f1a7d3), brief item 5, first of two relays. Tier: Standard (a new tool, its test, docs).*

## Intent (grilled)

Grill skipped: the design was ruled through three critic rounds of the P0b plan and is binding (`.claude/plans/2026-10-p0b-release-tooling.md`, "Relay HEAVY"; Lee, 2026-11-01: "`heavy-run` leaves P0b" as its own small relay). Anchor: no two 12 GB builds run at once on this host, and none starts when memory is short, so a heavy build never takes the machine (and four other sessions) down with it. Anti-goals: no change to any build script's output; no change to the release tool; no heavy run in this relay.

Why now: item 5's second relay (MEASURE) rebuilds `build-year-overlays.py` (about 12 GB, about 35 min; hand-off log 2026-09-02), and the program makes S0b and every overlay build wait on this lock. The coordinator's rule for this host (2026-11-11, relayed): heavy runs only when the 1-minute load is under 8 and at least 16 GiB is free, announced to the coordinator first. The lock enforces the memory half and the one-at-a-time half mechanically; the load half and the announcement stay a session rule (below).

## Design (one launcher process holding a kernel lock; amended after critic r1 and r2)

**Why the binding mechanism changes.** The P0b rules specified an `O_CREAT|O_EXCL` lock file, a `dir-mutex`, PID/start-tick liveness and a recorded pgid. Critic r1 measured it failing at its one job (a backgrounded build released the lock; a crash plus the manual clear became a second build). Critic r2 measured that a Node step between `flock(1)` and the build also fails: Node marks inherited descriptors close-on-exec at startup, so a command spawned with plain inheritance holds nothing. The design below is the one critic r2 built and ran in scratch with every case correct (`scratchpad/heavy2/fix-heavy.mjs`): one Node launcher that owns the lock descriptor and hands it to the build explicitly. The kernel lock lives on the open file description, so it is held until the last process holding that description exits or dies: no stale lock, no liveness guessing, no backgrounding escape. Technical call within the session's authority; it supersedes the P0b mechanism (said here, in ARCHITECTURE and in the shipped entry). `dir-mutex.mjs` is not used and not edited.

New `scripts/heavy-run.mjs` (Node, ESM, no dependencies). Canonical invocation, wrapping the outermost command only:

```
node scripts/heavy-run.mjs --job <name> [--retry] -- <command> [args...]
```

1. Validate arguments and apply the path guard (below); failure: 244.
2. Open `<state>/heavy-build.lock` (`O_RDONLY|O_CREAT`, 0644); failure: 244.
3. `spawnSync("flock", ["--nonblock", "--conflict-exit-code", "240", "3"], { stdio: ["ignore", "inherit", "inherit", fd] })`: locks the shared open file description. `flock` missing or any non-0, non-240 status: 244. 240: refused, lock held (the stderr line names the sidecar's holder, which may be stale, and suggests `fuser -v <lock>`).
4. Holding the lock, read `MemAvailable` (`/proc/meminfo`, path seam for tests). Below 16,777,216 kB, unreadable or unparseable: close the descriptor (releasing the lock) and refuse 241.
5. Write the sidecar `<state>/heavy-build.lock.json` (`job`, launcher `pid`, command `pgid`, `host`, `startedAt`, `command`); informational only, never decides anything.
6. Spawn the command with `detached: true` (its own process group, restoring the P0b rule "the command runs in its own group; signals go to the group") and `stdio: ["inherit", "inherit", "inherit", fd]`, so the descriptor is passed explicitly as fd 3 and every descendant that does not close it keeps the lock. Spawn error: 244.
7. Forward SIGINT, SIGTERM and SIGHUP to the command's group (`process.kill(-pgid, sig)`).
8. On the command's exit: remove the sidecar if it still names this run; exit with the command's code, or 128 plus the signal number if it was killed (never 0). When the command's own code is non-zero, print `heavy-run: command exited N` so a command's 240-244 is never mistaken for a refusal.

**Refusals vs the command:** only the launcher's own refusals print `heavy-run: REFUSED <code>`. Own refusals use 240 (held), 241 (memory), 244 (nothing started: arguments, path guard, lock file, flock, spawn); 242 and 243 stay reserved and are never used as own refusals. `--retry` retries only own 240 and 241: an initial attempt plus six retries every 10 minutes (interval seam for tests), the descriptor closed during every wait, then the last code with a line `heavy-run: giving up after 7 attempts; tell Lee` (the channel: the session that ran it reports to its coordinator and sends `/notify`, as for a release halt). A 244 or any command exit is never retried.

**Path guard:** same shape as the release tool's (`scripts/release-ledger.mjs:132-151`): state dir `~/marvin/state` unless `OC_HEAVY_STATE_DIR` is set; under `VITEST` the override is required and must resolve outside the real state dir; the override and the meminfo and interval seams are refused (244) when `VITEST` is unset. The lock and sidecar are ignored by marvin (`~/marvin/.gitignore:71`, `state/heavy-build.lock*`).

**Stated limits:** a descendant that closes fd 3 or is started without it (Node's own children unless passed explicitly; any program that closes inherited descriptors) and outlives its parent escapes the lock; the build's own top process holds it, which covers both Python builds (neither starts subprocesses) and the `preprocess:v2` chain (it waits on its children). Per host only. The load half of the host rule is not enforced. **Never delete `heavy-build.lock`:** deleting it while a build holds it lets the next run lock a fresh file and start beside it.

**Binding bookkeeping (P0b "Relay HEAVY" bullets):** lock by `O_CREAT|O_EXCL` with PID/host/start/job/startTicks/pgid: amended (kernel lock; the fields survive as the informational sidecar). Mutex beside it: moot (no mutex). State-dir override and path guard: kept. Unmeasured is heavy, known heavy jobs: kept. Under-the-mutex order (live refused, dead replaced, memory floor, lock, spawn as own group, record pgid, release): amended (kernel decides live/dead; memory floor held under the lock; own group and pgid kept). Liveness via kill -0 and start ticks: moot. Child exit passes through, refusals 240-244 with a marked stderr line: kept (242/243 reserved). Signals to the group: kept. Retry 240, 241, 243 every 10 min six times then Lee: kept for 240 and 241 (243 no longer exists). Test list: kept where the case still exists (below).

## Tests (`src/test/pipeline/heavy-run.test.ts`, node environment)

In `src/test/` because `vitest.config.ts` collects only `src/**`. Every test sets `VITEST`, a temp `OC_HEAVY_STATE_DIR`, scrubs other `OC_HEAVY_*`, defaults the meminfo seam above the floor, spawns real short children, synchronises on barrier files (never on sleeps), and kills leftover groups in `afterEach`.

1. Held lock respected: run A holds (barrier); run B exits 240 with `REFUSED 240`; after A releases, B runs. Mutant: drop the flock call (red).
2. Backgrounded build keeps the lock: `sh -c 'sleep 3 & exit 0'`: B is 240 while the sleep runs. Mutant: pass the descriptor by plain inheritance instead of `stdio[3]` (red, critic r2's measurement).
3. Killed build releases: SIGKILL A's launcher and its command group; B runs at once. Regression guard.
4. Launcher lost, command surviving: SIGKILL only the launcher (every process on the launcher side); the command keeps the lock, B is 240. Mutant: plain inheritance (red).
5. Memory: 16,777,215 kB refuses 241, starts nothing, and releases the lock (a third run proceeds); 16,777,216 kB runs; unreadable is 241. Mutant: `<=` for `<` (red).
6. Two racers on a free lock through a barrier: exactly one runs, the other is 240. Regression guard.
7. Sidecar: a foreign sidecar written mid-run is not removed by this run; a malformed one changes nothing about who may run. Mutant: remove the sidecar unconditionally (red).
8. Exit status: the command's non-zero code passes through with the `command exited` line; a SIGKILLed command gives 137, not 0. Mutant: pass `null` through as 0 (red).
9. Signals: SIGTERM to the launcher reaches a grandchild in the command's group. Mutant: signal the direct child only (red).
10. Arguments, path guard, unopenable lock path, missing command: 244, nothing started, no sidecar, never retried. Regression guard.
11. Retry (interval seam): 240 then free runs on the second attempt; exactly 7 attempts then the give-up line; a 244 under `--retry` makes exactly one attempt; a command's own exit 240 is not retried; after a 241 the descriptor is released during the wait (a third caller takes the lock); SIGTERM during the wait exits. Mutants: retry on 244 (red); keep the descriptor open across the wait (red).
12. Own refusals never use 242 or 243 (every refusal path enumerated). Regression guard.
13. A malformed release ledger in the same state dir is irrelevant (binding test kept). Regression guard.
14. Node-shaped command (Review Focus 5): a synchronous `node -e` command holds the lock for its run; a `node -e` that starts a detached child without fd 3 and exits does not (the documented limit). Regression guard.

Revert proofs are recorded verbatim for every named mutant; tests marked "regression guard" have no mutant and say so.

## Out of scope (Parking Lot lines at close)

Wrapping the npm scripts and `rebuild.sh` so they call heavy-run themselves; nesting heavy-run inside heavy-run (a nested call refuses itself with 240); enforcing the load half of the host rule; other projects' builds on this host.

## Docs

ARCHITECTURE.md, a short "Heavy builds" paragraph beside Releases (with pointers from the layout and pipeline sections): that the kernel lock supersedes the P0b mechanism; the canonical invocation, wrapping the outermost command only (a nested call refuses itself); the refusal codes and the `command exited` line; the 16 GiB floor; never delete `heavy-build.lock`; why a crash never leaves a stale lock; how to stop a build (signal the launcher, which signals the group; if the launcher is gone, `kill -TERM -- -<pgid>` with the pgid from the sidecar); what a 240 prints (the sidecar's holder, possibly stale, and `fuser -v`); and the session rule for this host, recorded as the coordinator's (2026-11-11, relayed: 1-minute load under 8 and announce to the coordinator before a 12 GB build). It is an operating note, not a DECISIONS entry (not Lee's ruling). ROADMAP: HEAVY moves from Parking Lot ("Owed in `.claude/handoff.md`") to its shipped entry at release; the hand-off's HEAVY line is removed through the writer.

## Release

A tooling-only change with no runtime effect on the site. It still ships through ARCHITECTURE.md Releases (every push to main deploys): lane `session`, kind `behaviour` (the tool kinds are instrumentation, behaviour, corrective; nothing on the site changes, but no instrumentation verdict applies). Guards: identity, console, and a site smoke (`/`, `/map`, `/privacy` 200). The standing yes covers it; `request --approval` carries the full verbatim 2026-11-10 Deploy amendment, marked relayed. No `install` (the release tool is untouched).

## Review Focus

1. A backgrounded or detached-by-`&` build keeps the lock until it ends (test 2).
2. A launcher killed with SIGKILL cannot forward signals; its surviving child keeps the lock (test 4).
3. The path guard: the override and the seams are refused without `VITEST`, and under `VITEST` the override must sit outside the real state dir (test 10).
4. The retry loop holds nothing while it waits, and never retries a 244 or a command's own exit (test 11).
5. Node-shaped and multi-process commands: a synchronous Node command holds the lock, a detached child started without fd 3 does not (test 14); the `preprocess:v2` chain holds it because it waits on its children (noted at first real use).

## Gates

Plan-reviewer at xhigh, at most three rounds. Ted, Razor. No Jen. Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
