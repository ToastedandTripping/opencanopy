# HEAVY: the heavy-build lock (`scripts/heavy-run.mjs`)

*Plan, 2026-11-11, revised after critic r1 (FAIL; folded, design amended to a kernel lock). Session marvin/canopy (driven by marvin session-f1a7d3), brief item 5, first of two relays. Tier: Standard (a new tool, its test, docs).*

## Intent (grilled)

Grill skipped: the design was ruled through three critic rounds of the P0b plan and is binding (`.claude/plans/2026-10-p0b-release-tooling.md`, "Relay HEAVY"; Lee, 2026-11-01: "`heavy-run` leaves P0b" as its own small relay). Anchor: no two 12 GB builds run at once on this host, and none starts when memory is short, so a heavy build never takes the machine (and four other sessions) down with it. Anti-goals: no change to any build script's output; no change to the release tool; no heavy run in this relay.

Why now: item 5's second relay (MEASURE) rebuilds `build-year-overlays.py` (about 12 GB, about 35 min; hand-off log 2026-09-02), and the program makes S0b and every overlay build wait on this lock. The coordinator's rule for this host (2026-11-11, relayed): heavy runs only when the 1-minute load is under 8 and at least 16 GiB is free, announced to the coordinator first. The lock enforces the memory half and the one-at-a-time half mechanically; the load half and the announcement stay a session rule (below).

## Design (amended after critic r1: a kernel lock, not a hand-built one)

**Why the binding mechanism changes, and what stays.** The P0b rules specified an `O_CREAT|O_EXCL` lock file plus a `dir-mutex`, PID/start-tick liveness and a recorded pgid. Critic r1 measured three ways that design fails at its one job against the real `dir-mutex.mjs`: the lock was released when the launcher's direct child exited, so a build that backgrounds itself (the overlay build has been run "detached", hand-off log 2026-09-02) let a second build start beside it; a crash between spawn and the pgid record, cleared by the printed manual `rm -r`, also became a second build; and every PID/pgid liveness check carries false-live and false-dead edges. util-linux `flock` (2.39.3, `/usr/bin/flock`, on this host and on GitHub's Ubuntu runners) holds a kernel lock on an open file descriptor that every child inherits, including backgrounded and `setsid` grandchildren (critic r1's scratch run), and the kernel releases it only when the last holder exits or dies. No crash window, no stale lock, no liveness guessing. This is a technical call within the session's authority; the rules' purpose (one heavy build at a time, never below the memory floor, never a second build after a crash), the memory floor, the refusal-code shape, the retry policy and the behavioural test list stand. `dir-mutex.mjs` is not used and not edited.

New `scripts/heavy-run.mjs` (Node, ESM, no dependencies):

```
node scripts/heavy-run.mjs --job <name> [--retry] -- <command> [args...]
```

- **Outer step:** validates arguments, applies the path guard, then spawns `flock --nonblock --conflict-exit-code 240 <state>/heavy-build.lock node scripts/heavy-run.mjs --inner --job <name> -- <command...>` with inherited stdio, forwarding SIGINT/SIGTERM/SIGHUP to it. With `--retry`, exit codes 240 and 241 are retried every 10 minutes (an interval seam for tests), six times, then the last code is returned with a line saying it goes to Lee. The outer step never sleeps while holding anything.
- **Inner step (runs only while the lock is held):** reads `MemAvailable` from `/proc/meminfo` (a path seam for tests); below 16,777,216 kB, or unreadable or unparseable, it exits 241 before starting anything. Otherwise it writes a sidecar `<state>/heavy-build.lock.json` for humans (`job`, `pid`, `host`, `startedAt`, `command`), spawns the command (inheriting the lock descriptor), forwards signals to it, and on exit removes the sidecar only if it still names this run. The sidecar is informational; nothing decides on it.
- **Exit codes:** the command's own exit code passes through; a command killed by a signal exits 128 plus the signal number (never 0); refusals are 240 (lock held), 241 (memory below the floor or unreadable), 244 (nothing started: bad arguments, refused state path, `flock` missing, command not found). 242 and 243 stay reserved (they named the dead and busy mutex, which no longer exist); a test pins that neither is ever emitted. Every refusal prints one stderr line starting `heavy-run: REFUSED`.
- **Path guard:** copied verbatim in shape from the release tool (`scripts/release-ledger.mjs:132-151`): state dir `~/marvin/state` unless `OC_HEAVY_STATE_DIR` is set; under `VITEST` the override is required and must resolve outside the real state dir; the override and the meminfo/interval seams are refused (244) when `VITEST` is unset. Lock paths are already ignored by marvin (`~/marvin/.gitignore:71`, `state/heavy-build.lock*`, covering the lock and the sidecar).
- **Stated limits:** a command that explicitly closes inherited file descriptors and keeps running in a detached child escapes the lock (Python's `subprocess` closes fds in its children by default, but the parent Python process keeps the lock until it exits, which is the build); the lock is per host (state is local); the 1-minute-load half of the host rule is not enforced by the tool.
- **Which jobs use it:** unmeasured is heavy. Known heavy: `scripts/build-year-overlays.py` (12 GB), `scripts/build-raster-tiles.py`, and the `preprocess:v2` chain (the multi-process case; neither build script forks workers, critic r1). A job measured below 8 GB need not use it.

## Tests (`src/test/pipeline/heavy-run.test.ts`, node environment, each revert-proven)

In `src/test/` because `vitest.config.ts` collects only `src/**` (critic r1). Every test sets `VITEST` with a temp `OC_HEAVY_STATE_DIR`, scrubs other `OC_HEAVY_*`, defaults the meminfo seam to a value above the floor, spawns real short children (`node -e`, `sh -c`), and kills any leftover process group in `afterEach`.
1. A held lock is respected: a second run exits 240 while the first runs, and runs after it ends.
2. A backgrounded build keeps the lock: `sh -c 'sleep 3 & exit 0'` holds it until the sleep ends (a second run is 240 inside that window).
3. A killed build releases it: SIGKILL the first run's whole tree; the next run proceeds at once (no stale lock, no manual clear).
4. Parent killed, child surviving: SIGKILL only the launcher; the surviving child keeps the lock (240).
5. Memory boundary: meminfo at 16,777,215 kB refuses 241 and starts nothing; at 16,777,216 kB runs; unreadable is 241.
6. Two racers on a free lock: exactly one runs, the other gets 240 (the kernel decides; run 20 times).
7. Sidecar ownership: a run never removes a sidecar another run has written; a malformed or wrongly shaped sidecar changes nothing about who may run.
8. Exit status: the child's non-zero exit passes through; a SIGKILLed child gives 137, not 0.
9. Signals: SIGTERM to the launcher reaches the child.
10. Bad arguments, refused path, missing command: 244, nothing started, no sidecar.
11. Retry: with a short interval seam, 240 then free runs on the second attempt; six refusals end with the last code and the "goes to Lee" line.
12. Codes 242 and 243 are never emitted (all refusal paths enumerated).
13. A malformed release ledger in the same state dir is irrelevant to heavy-run (binding test kept).

Revert proofs (each mutant turns a named test red): drop `--nonblock` handling so a held lock blocks (1, 6 time out); hold the lock only in the outer process with `FD_CLOEXEC` on the command (2, 4); `<=` for `<` at the memory floor (5); pass `null` exit through as 0 (8); remove the sidecar unconditionally (7); retry on 244 (11). Recorded verbatim.

## Out of scope (Parking Lot lines at close)

Wrapping the npm scripts and `rebuild.sh` so they call heavy-run themselves; nesting heavy-run inside heavy-run; enforcing the load half of the host rule; other projects' builds on this host.

## Docs

ARCHITECTURE.md, a short "Heavy builds" paragraph beside Releases (with pointers from the layout and pipeline sections): the canonical invocation, run in the foreground or as a background shell job but never with the command itself detached from heavy-run; the refusal codes; the 16 GiB floor; why a crash never leaves a stale lock (kernel lock); how to stop a build (signal the heavy-run launcher, which forwards); and the session rule for this host, recorded as the coordinator's (2026-11-11, relayed: 1-minute load under 8 and announce to the coordinator before a 12 GB build). It is an operating note, not a DECISIONS entry (not Lee's ruling). ROADMAP: HEAVY moves from Parking Lot ("Owed in `.claude/handoff.md`") to its shipped entry at release; the hand-off's HEAVY line is removed through the writer.

## Release

A tooling-only change with no runtime effect on the site. It still ships through ARCHITECTURE.md Releases (every push to main deploys): lane `session`, kind `behaviour` (the tool kinds are instrumentation, behaviour, corrective; nothing on the site changes, but no instrumentation verdict applies). Guards: identity, console, and a site smoke (`/`, `/map`, `/privacy` 200). The standing yes covers it; `request --approval` carries the full verbatim 2026-11-10 Deploy amendment, marked relayed. No `install` (the release tool is untouched).

## Review Focus

1. A backgrounded or detached-by-`&` build keeps the lock until it ends (test 2).
2. A launcher killed with SIGKILL cannot forward signals; its surviving child keeps the lock (test 4).
3. The path guard: the override and the seams are refused without `VITEST`, and under `VITEST` the override must sit outside the real state dir (test 10).
4. The retry loop holds nothing while it waits (test 11, run while another test holds and releases the lock).
5. The multi-process `preprocess:v2` case: every process that inherited the descriptor keeps the lock (test 2 is its shape; a real run is noted at first use).

## Gates

Plan-reviewer at xhigh, at most three rounds. Ted, Razor. No Jen. Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
