#!/usr/bin/env node
/**
 * heavy-run.mjs -- the heavy-build lock for this host.
 *
 *   node scripts/heavy-run.mjs --job <name> [--retry] -- <command> [args...]
 *
 * Wrap the OUTERMOST command only. No two heavy builds (about 12 GB each) run at once on
 * this host, and none starts while MemAvailable is under 16 GiB. ARCHITECTURE.md, "Heavy
 * builds", is the runbook; this header is the mechanism.
 *
 * One launcher process owns the lock. It opens `<state>/heavy-build.lock`, has `flock(1)`
 * lock that open file description (passed to flock as fd 3), checks memory while holding
 * it, then spawns the command in its own process group with the SAME descriptor passed
 * explicitly as the command's fd 3. A kernel flock lives on the open file description, so
 * it is held until the last process holding that description exits or dies: the launcher,
 * the command, and every descendant that keeps fd 3 (a backgrounded `&` child included).
 * No stale lock, no liveness guessing. Plain inheritance would NOT work: Node opens files
 * close-on-exec, so only the explicit stdio[3] slot carries the lock into the command.
 *
 * Exit codes. Own refusals print `heavy-run: REFUSED <code> ...` and use only:
 *   240  lock held by another run
 *   241  MemAvailable below the floor, unreadable or unparseable (the lock is released)
 *   244  nothing started: arguments, path guard, lock file, flock, spawn
 * 242 and 243 are reserved and never used. Otherwise the exit is the command's own: its
 * code, or 128 plus the signal number if it was killed (never 0). A non-zero command exit
 * also prints `heavy-run: command exited N`, so a command's own 240-244 is never mistaken
 * for a refusal. `--retry` retries only own 240 and 241: seven attempts, ten minutes apart,
 * the descriptor closed during every wait, then `giving up after 7 attempts; tell Lee`.
 *
 * Never delete heavy-build.lock: a run that locks a fresh file starts beside the build
 * that still holds the old one.
 *
 * The sidecar `heavy-build.lock.json` is informational only; nothing reads it to decide.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REFUSED_HELD = 240;
const REFUSED_MEMORY = 241;
const REFUSED_NOTHING_STARTED = 244;
const MEM_FLOOR_KB = 16 * 1024 * 1024; // 16 GiB, in the kB /proc/meminfo reports
const MAX_ATTEMPTS = 7; // the initial attempt plus six retries
const RETRY_INTERVAL_MS = 10 * 60 * 1000;
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

const say = (line) => process.stderr.write(`heavy-run: ${line}\n`);

class Refusal {
  constructor(code, why) {
    this.code = code;
    this.why = why;
  }
}

/* ---------- arguments ---------- */

function parseArgs(argv) {
  const dash = argv.indexOf("--");
  if (dash < 0) return new Refusal(REFUSED_NOTHING_STARTED, "no `--` before the command");
  const command = argv.slice(dash + 1);
  if (command.length === 0 || command[0] === "") return new Refusal(REFUSED_NOTHING_STARTED, "no command after `--`");
  const own = argv.slice(0, dash);
  let job;
  let retry = false;
  for (let i = 0; i < own.length; i++) {
    if (own[i] === "--retry") {
      if (retry) return new Refusal(REFUSED_NOTHING_STARTED, "--retry given twice");
      retry = true;
    } else if (own[i] === "--job") {
      if (job !== undefined) return new Refusal(REFUSED_NOTHING_STARTED, "--job given twice");
      job = own[++i];
      if (!job || job.startsWith("-")) return new Refusal(REFUSED_NOTHING_STARTED, "--job needs a name");
    } else {
      return new Refusal(REFUSED_NOTHING_STARTED, `unknown argument: ${own[i]}`);
    }
  }
  if (job === undefined) return new Refusal(REFUSED_NOTHING_STARTED, "--job <name> is required");
  return { job, retry, command };
}

/* ---------- paths, seams and the path guard (same shape as release-ledger.mjs) ---------- */

function resolveReal(p) {
  const abs = path.resolve(p);
  let probe = abs;
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(probe), ...tail);
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) return abs;
      tail.unshift(path.basename(probe));
      probe = parent;
    }
  }
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Both homes: a faked HOME must not make the true state dir look harmless. */
function realStateDirs() {
  const homes = new Set([os.homedir(), os.userInfo().homedir]);
  return [...homes].map((h) => resolveReal(path.join(h, "marvin", "state")));
}

const SEAMS = ["OC_HEAVY_STATE_DIR", "OC_HEAVY_MEMINFO", "OC_HEAVY_INTERVAL_MS"];

/** Returns the resolved paths and seams, or a Refusal. Runs before anything is opened. */
function guardPaths() {
  const env = process.env;
  const underVitest = Boolean(env.VITEST);
  const override = env.OC_HEAVY_STATE_DIR;
  if (!underVitest) {
    const set = SEAMS.filter((name) => env[name] !== undefined);
    if (set.length > 0) return new Refusal(REFUSED_NOTHING_STARTED, `${set.join(", ")} set without VITEST`);
  } else {
    if (!override) return new Refusal(REFUSED_NOTHING_STARTED, "VITEST is set and OC_HEAVY_STATE_DIR is absent");
    if (realStateDirs().some((real) => isInside(resolveReal(override), real))) {
      return new Refusal(REFUSED_NOTHING_STARTED, "OC_HEAVY_STATE_DIR resolves inside the real state dir");
    }
  }
  let intervalMs = RETRY_INTERVAL_MS;
  if (env.OC_HEAVY_INTERVAL_MS !== undefined) {
    intervalMs = Number(env.OC_HEAVY_INTERVAL_MS);
    if (!Number.isInteger(intervalMs) || intervalMs < 0) {
      return new Refusal(REFUSED_NOTHING_STARTED, `OC_HEAVY_INTERVAL_MS is not a whole number: ${env.OC_HEAVY_INTERVAL_MS}`);
    }
  }
  const stateDir = override ? path.resolve(override) : path.join(os.homedir(), "marvin", "state");
  const lock = path.join(stateDir, "heavy-build.lock");
  return { lock, sidecar: `${lock}.json`, meminfo: env.OC_HEAVY_MEMINFO ?? "/proc/meminfo", intervalMs };
}

/* ---------- one attempt: open, lock, memory ---------- */

function describeHolder(sidecar, lock) {
  let holder;
  try {
    const s = JSON.parse(fs.readFileSync(sidecar, "utf8"));
    holder = `sidecar says job ${s.job}, launcher pid ${s.pid}, pgid ${s.pgid}, host ${s.host}, since ${s.startedAt} (may be stale)`;
  } catch (e) {
    holder = e.code === "ENOENT" ? "no sidecar" : "sidecar unreadable";
  }
  return `lock held; ${holder}; find the holders with: fuser -v ${lock}`;
}

function readMemAvailableKb(meminfo) {
  try {
    const m = /^MemAvailable:\s+(\d+) kB$/m.exec(fs.readFileSync(meminfo, "utf8"));
    return m ? Number(m[1]) : NaN;
  } catch {
    return NaN; // unreadable is refused 241 by the caller, with the path named
  }
}

/** Returns the locked descriptor, or a Refusal with every descriptor it opened closed. */
function attempt(paths) {
  let fd;
  try {
    fd = fs.openSync(paths.lock, fs.constants.O_RDONLY | fs.constants.O_CREAT, 0o644);
  } catch (e) {
    return new Refusal(REFUSED_NOTHING_STARTED, `cannot open lock file ${paths.lock}: ${e.code ?? e.message}`);
  }
  const f = spawnSync("flock", ["--nonblock", "--conflict-exit-code", String(REFUSED_HELD), "3"], {
    stdio: ["ignore", "inherit", "inherit", fd],
  });
  if (f.error) {
    fs.closeSync(fd);
    return new Refusal(REFUSED_NOTHING_STARTED, `cannot run flock: ${f.error.code ?? f.error.message}`);
  }
  if (f.status === REFUSED_HELD) {
    fs.closeSync(fd);
    return new Refusal(REFUSED_HELD, describeHolder(paths.sidecar, paths.lock));
  }
  if (f.status !== 0) {
    fs.closeSync(fd);
    return new Refusal(REFUSED_NOTHING_STARTED, `flock failed: status ${f.status}, signal ${f.signal}`);
  }
  const kb = readMemAvailableKb(paths.meminfo);
  if (!Number.isFinite(kb) || kb < MEM_FLOOR_KB) {
    fs.closeSync(fd);
    const seen = Number.isFinite(kb) ? `${kb} kB` : `unreadable or unparseable (${paths.meminfo})`;
    return new Refusal(REFUSED_MEMORY, `MemAvailable ${seen}, floor ${MEM_FLOOR_KB} kB; lock released`);
  }
  return fd;
}

/* ---------- the run ---------- */

function main() {
  let child = null;
  for (const sig of SIGNALS) {
    process.on(sig, () => {
      if (child) {
        try {
          process.kill(-child.pid, sig);
        } catch (e) {
          say(`could not forward ${sig} to group ${child.pid}: ${e.code ?? e.message}`);
        }
        return;
      }
      say(`${sig} while waiting to retry; nothing started`);
      process.exit(128 + os.constants.signals[sig]);
    });
  }

  const args = parseArgs(process.argv.slice(2));
  const refuse = (r) => {
    say(`REFUSED ${r.code} ${r.why}`);
    process.exit(r.code);
  };
  if (args instanceof Refusal) return refuse(args);
  const paths = guardPaths();
  if (paths instanceof Refusal) return refuse(paths);

  let attempts = 0;
  const go = () => {
    attempts++;
    const r = attempt(paths);
    if (r instanceof Refusal) {
      say(`REFUSED ${r.code} ${r.why}`);
      const retriable = r.code === REFUSED_HELD || r.code === REFUSED_MEMORY;
      if (args.retry && retriable && attempts < MAX_ATTEMPTS) {
        say(`attempt ${attempts} of ${MAX_ATTEMPTS}; retrying in ${paths.intervalMs} ms`);
        setTimeout(go, paths.intervalMs);
        return;
      }
      if (args.retry && retriable) say(`giving up after ${attempts} attempts; tell Lee`);
      process.exit(r.code);
    }
    run(r);
  };

  const run = (fd) => {
    let startedAt;
    try {
      child = spawn(args.command[0], args.command.slice(1), {
        stdio: ["inherit", "inherit", "inherit", fd],
        detached: true,
      });
    } catch (e) {
      return refuse(new Refusal(REFUSED_NOTHING_STARTED, `cannot start command: ${e.code ?? e.message}`));
    }
    child.on("spawn", () => {
      startedAt = new Date().toISOString();
      const record = { job: args.job, pid: process.pid, pgid: child.pid, host: os.hostname(), startedAt, command: args.command };
      try {
        fs.writeFileSync(paths.sidecar, `${JSON.stringify(record)}\n`);
      } catch (e) {
        say(`warning: could not write sidecar ${paths.sidecar}: ${e.code ?? e.message} (informational only; the lock is held)`);
      }
    });
    child.on("error", (e) => {
      if (startedAt === undefined) {
        child = null;
        refuse(new Refusal(REFUSED_NOTHING_STARTED, `cannot start command: ${e.code ?? e.message}`));
      } else {
        say(`command error: ${e.code ?? e.message}`);
      }
    });
    child.on("exit", (code, signal) => {
      if (startedAt === undefined) return; // a spawn failure; the error handler refuses
      try {
        const s = JSON.parse(fs.readFileSync(paths.sidecar, "utf8"));
        if (s.pid === process.pid && s.startedAt === startedAt) fs.unlinkSync(paths.sidecar);
      } catch {
        // absent, malformed or someone else's: informational only, so it is left as found
      }
      const status = signal ? 128 + os.constants.signals[signal] : code;
      if (status !== 0) say(`command exited ${status}`);
      process.exit(status);
    });
  };

  go();
}

main();
