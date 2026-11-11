# HEAVY: the heavy-build lock (`scripts/heavy-run.mjs`)

*Plan, 2026-11-11. Session marvin/canopy (driven by marvin session-f1a7d3), brief item 5, first of two relays. Tier: Standard (a new tool, its test, docs).*

## Intent (grilled)

Grill skipped: the design was ruled through three critic rounds of the P0b plan and is binding (`.claude/plans/2026-10-p0b-release-tooling.md`, "Relay HEAVY"; Lee, 2026-11-01: "`heavy-run` leaves P0b" as its own small relay). Anchor: no two 12 GB builds run at once on this host, and none starts when memory is short, so a heavy build never takes the machine (and four other sessions) down with it. Anti-goals: no change to any build script's output; no change to the release tool; no heavy run in this relay.

Why now: item 5's second relay (MEASURE) rebuilds `build-year-overlays.py` (about 12 GB, about 35 min; hand-off log 2026-09-02), and the program makes S0b and every overlay build wait on this lock. The coordinator's rule for this host (2026-11-11, relayed): heavy runs only when the 1-minute load is under 8 and at least 16 GiB is free, announced to the coordinator first. The lock enforces the memory half and the one-at-a-time half mechanically; the load half and the announcement stay a session rule (below).

## Design (the binding rules, made concrete)

New `scripts/heavy-run.mjs` (Node, ESM, no dependencies), reusing `scripts/lib/dir-mutex.mjs` (`withMutex`, `holderAlive`, `procInfo`, `MutexError`):

```
node scripts/heavy-run.mjs --job <name> -- <command> [args...]
```

- **Lock file** `~/marvin/state/heavy-build.lock`, created with `O_CREAT|O_EXCL`, JSON: `pid`, `host`, `startedAt`, `job`, `startTicks`, `pgid`; mutex directory `heavy-build.lock.mutex` beside it. State-dir override `OC_HEAVY_STATE_DIR` for tests, under the same path guard the release tool uses (refuses a path outside `~/marvin/state` unless the override is set). Both paths are already ignored by marvin (`git -C ~/marvin check-ignore`: `.gitignore:71 state/heavy-build.lock*`, checked 2026-11-11).
- **Under the mutex, in order:** read the lock. A live holder: refuse (exit 240). A dead holder: replace. Unparseable: treat as live (refuse 240, with the path printed for a human). Then read `MemAvailable` from `/proc/meminfo`; below 16,777,216 kB: refuse (exit 241), leaving no lock. Then write the lock, spawn the command as its own process group (`detached: true`), record its pgid into the lock, release the mutex. A launcher crash between spawn and pgid record leaves a lock whose holder is the launcher's PID: dead once the launcher is gone, so the next caller replaces it after `kill(-pgid, 0)` cannot be checked; stated limit.
- **Liveness:** `holderAlive` (`kill -0`, `/proc/<pid>/stat` start ticks match, not `Z`), or the group alive by `kill(-pgid, 0)`. A lock from another host reads live. Stated limits: a child that calls `setsid` escapes the group; pgid reuse reads as a false live (the safe side).
- **Exit and signals:** the child's exit code is passed through. Refusals are 240 (held), 241 (memory), 242 (bad arguments), 243 (mutex busy past its timeout), 244 (state path refused), each with one stderr line starting `heavy-run: REFUSED`. SIGINT/SIGTERM/SIGHUP are forwarded to the child's group. On the child's exit the lock is removed under the mutex, only if it is still this run's (pid and startTicks match).
- **Retry:** `--retry` makes 240, 241 and 243 retry every 10 minutes, six times, then exit with the last refusal and a line saying it goes to Lee. Default is no retry (a session decides).
- **Unmeasured is heavy.** Known heavy jobs: `scripts/build-year-overlays.py` (12 GB), `scripts/build-raster-tiles.py`, `preprocess:v2`. A job measured below 8 GB need not use the lock; nothing in this relay measures one.

## Tests (`scripts/heavy-run.test.mjs`, vitest, temp state dir; each revert-proven)

Each test spawns real short child processes (`node -e`), never a real build:
1. A live holder is respected (240), and the lock is untouched.
2. A killed build is recovered: holder PID dead, the next run replaces the lock and runs.
3. Parent killed, child surviving: the group is alive, so the lock reads live (240).
4. PID reuse: a lock naming a live PID with different start ticks reads dead.
5. Crash before pgid: a lock with no pgid and a dead launcher PID is replaced.
6. Corrupt lock: unparseable reads live (240), the file is not overwritten.
7. Memory boundary: a `/proc/meminfo` stub (the reader takes a path override in tests) at 16,777,215 kB refuses 241 and leaves no lock; at 16,777,216 kB runs.
8. Two reclaimers racing on one dead lock: exactly one runs, the other gets 240.
9. Owner-safe release: a run never deletes a lock another run has since written.
10. Another host: a lock with a different `host` reads live.
11. Exit status: the child's non-zero exit passes through; refusal codes are 240-244.
12. Signals: SIGTERM to the launcher reaches the child's group.
13. Bad arguments: no `--job` or no command is 242 with no lock written.

Revert proofs (mutants, each must turn a named test red): ignore start ticks (4); skip the group check (3); spawn outside the mutex (8); memory comparison `<=` for `<` (7); release without the ownership check (9). Recorded verbatim.

## Docs

ARCHITECTURE.md, a short "Heavy builds" paragraph beside Releases: the command, the refusal codes, the 16 GiB floor, the session rule for this host (1-minute load under 8 and announce to the coordinator before a 12 GB build; coordinator, 2026-11-11), and that a dead holder is cleared by a human with the printed path. ROADMAP: HEAVY moves from Parking Lot ("Owed in `.claude/handoff.md`") to its shipped entry at release; the hand-off's HEAVY line is removed through the writer.

## Release

A tooling-only change with no runtime effect on the site. It still ships through ARCHITECTURE.md Releases (every push to main deploys): lane `session`, kind `behaviour` (the tool kinds are instrumentation, behaviour, corrective; nothing on the site changes, but no instrumentation verdict applies). Guards: identity, console, and a site smoke (`/`, `/map`, `/privacy` 200). The standing yes covers it. No `install` (the release tool is untouched).

## Review Focus

1. The crash windows: between lock write and spawn, and between spawn and pgid record (tests 5, 2).
2. Signal forwarding when the launcher itself is killed with SIGKILL (cannot forward; the group survives and the lock reads live, test 3).
3. The path guard refuses a state dir outside `~/marvin/state` without the override (test 13 extended).
4. The retry loop's total wait (one hour) never holds the mutex while sleeping.
5. A Python child that forks workers (the overlay build uses multiprocessing): all stay in the group, so the lock stays live until the last exits.

## Gates

Plan-reviewer at xhigh, at most three rounds. Ted, Razor. No Jen. Checks: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
