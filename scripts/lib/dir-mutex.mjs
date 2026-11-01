/**
 * dir-mutex.mjs -- a short-held directory mutex whose holder is atomic with its
 * content. Shared primitive: the release ledger uses it, relay HEAVY reuses it.
 *
 * Acquire makes a temp sibling, writes `owner` into it, and renames it onto the
 * mutex path. ENOTEMPTY or EEXIST means held; a stray empty directory is simply
 * taken. So a held mutex always has an `owner`, and ENOENT on reading it means
 * the holder just released: retry, never read that as a death.
 *
 * A dead holder is never auto-broken, because breaking it has the same race one
 * level down. The caller surfaces the printed `rm -r` to a human. False-live is
 * acceptable here; false-dead is not.
 *
 * Synchronous on purpose: held for milliseconds, and `fn` must not await.
 */
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const DEFAULT_TIMEOUT_MS = 5000;

/** kind: "busy" (live holder past the timeout), "dead", or "corrupt". */
export class MutexError extends Error {
  constructor(kind, dir, detail) {
    super(detail);
    this.name = "MutexError";
    this.kind = kind;
    this.dir = dir;
    this.manual = `rm -r ${dir}`;
  }
}

const sleepCell = new Int32Array(new SharedArrayBuffer(4));
function sleep(ms) {
  Atomics.wait(sleepCell, 0, 0, ms);
}

/** Field 22 of /proc/<pid>/stat and the state letter; null when unreadable. */
export function procInfo(pid) {
  let raw;
  try {
    raw = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  } catch {
    return null;
  }
  // comm may contain spaces and parens: fields restart after the LAST ')'.
  const rest = raw.slice(raw.lastIndexOf(")") + 2).split(" ");
  return { state: rest[0], startTicks: rest[19] };
}

export function holderAlive(owner) {
  try {
    process.kill(owner.pid, 0);
  } catch (err) {
    if (err.code !== "EPERM") return false;
  }
  const info = procInfo(owner.pid);
  // /proc unreadable with the PID answering: false-live is the safe side.
  if (!info) return true;
  if (info.state === "Z") return false;
  return String(info.startTicks) === String(owner.startTicks);
}

function selfOwner() {
  return {
    pid: process.pid,
    startTicks: procInfo(process.pid)?.startTicks ?? null,
    ts: new Date().toISOString(),
    nonce: randomBytes(8).toString("hex"),
  };
}

function tryAcquire(dir, owner) {
  const tmp = `${dir}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  fs.mkdirSync(tmp);
  fs.writeFileSync(path.join(tmp, "owner"), JSON.stringify(owner));
  try {
    fs.renameSync(tmp, dir);
    return true;
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (err.code === "ENOTEMPTY" || err.code === "EEXIST") return false;
    throw err;
  }
}

function acquire(dir, timeoutMs) {
  const owner = selfOwner();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (tryAcquire(dir, owner)) return owner;
    let raw;
    try {
      raw = fs.readFileSync(path.join(dir, "owner"), "utf8");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      // Released under us: retry the acquire, within the same deadline.
      if (Date.now() >= deadline) {
        throw new MutexError("busy", dir, `mutex still contended past ${timeoutMs} ms`);
      }
      continue;
    }
    let held;
    try {
      held = JSON.parse(raw);
      if (!Number.isInteger(held.pid)) throw new Error("no pid");
    } catch {
      throw new MutexError("corrupt", dir, `mutex owner is unparseable at ${dir}`);
    }
    if (!holderAlive(held)) {
      throw new MutexError("dead", dir, `mutex holder pid ${held.pid} is dead at ${dir}`);
    }
    if (Date.now() >= deadline) {
      throw new MutexError("busy", dir, `mutex held by live pid ${held.pid} past ${timeoutMs} ms`);
    }
    sleep(5 + Math.floor(Math.random() * 20));
  }
}

function release(dir, owner) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(dir, "owner"), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return; // removed by hand; nothing of ours is left
    throw err;
  }
  let nonce = null;
  try {
    nonce = JSON.parse(raw).nonce;
  } catch {
    // An unparseable owner is not ours: leave it for the manual text.
  }
  if (nonce !== owner.nonce) return; // a successor's mutex is never touched
  const gone = `${dir}.tmp.${process.pid}.${randomBytes(6).toString("hex")}`;
  fs.renameSync(dir, gone);
  fs.rmSync(gone, { recursive: true, force: true });
}

export function withMutex(dir, fn, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const owner = acquire(dir, timeoutMs);
  try {
    return fn();
  } finally {
    release(dir, owner);
  }
}
