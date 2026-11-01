#!/usr/bin/env node
/**
 * release-ledger.mjs -- the OpenCanopy release ledger, lease and fencing.
 *
 * Runs on bare Node 22 with no dependencies. The release sequence, red path and
 * halt doors live in ARCHITECTURE.md (release section); `--help` points there.
 * Sessions run the INSTALLED copy under ~/marvin/state/opencanopy-release-tool/,
 * never a worktree's, so an older copy never meets a newer record type.
 *
 * Exit codes: 0 ok or GO; 1 NO-GO or a failed read; 2 refused; 3 HALTED; 4 BUSY.
 *
 * Every state change runs under the mutex. Netlify and git are read BEFORE taking
 * it, never during. `--lee`, `--approval`, `--checks` and `guard --result green`
 * are attestations by the session, not proof: the tool runs no guard and cannot
 * verify Lee said anything.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MutexError, withMutex } from "./lib/dir-mutex.mjs";
import {
  LedgerError,
  closesHalt,
  fold,
  guardTransition,
  parseLedger,
  parseLedgerText,
  reconcileActions,
  verdictOf,
} from "./lib/release-state.mjs";

const SITE_ID = "6b007878-a00d-4ada-86d4-5cf84e9acc2a";
const STALE_MS = 2 * 60 * 60 * 1000;
const READ_TIMEOUT_MS = 30_000;
const NOTIFY_TIMEOUT_MS = 10_000;
const LANES = new Set(["M", "S", "session"]);
const KINDS = new Set(["instrumentation", "behaviour", "corrective"]);
const RESULTS = new Set(["green", "red", "unverified", "negative-control"]);

const NEW_HALT_TEXT = [
  "NEW HALT: both lanes are stopped until Lee chooses.",
  "This command appended the halt, so this session (or the coordinator) tells Lee in",
  "plain words what stopped and what the choices are, and sends /notify. Any later",
  "exit 3 is reported, not re-notified.",
].join("\n");

const REPAIR_TEXT = [
  "Human repair keeps the ledger absent, so everything stays halted throughout, and",
  "cannot reuse a token:",
  "  1. mv the ledger to an aside file.",
  "  2. Produce a corrected copy.",
  "  3. repair-note --aside A --fixed F --reason TEXT",
].join("\n");

const HELP = `release-ledger: the OpenCanopy release ledger. Release sequence: ARCHITECTURE.md.

  status [--json]
  summary (--sha S | --unrecorded)
  claim --lane M|S|session (--sha S | --deploy D) --kind instrumentation|behaviour|corrective [--data-version V]
  release --token N [--abandon]
  reconcile
  takeover --lane L --observed-token N
  request --token N --sha S --parent P --approval "LEE'S WORDS" --checks EVIDENCE
  record-push --token N --sha S
  guard [--token N] [--sha S] --deploy D --result green|red|unverified|negative-control --evidence PATH [--lee "LEE'S WORDS"]
  authorize-corrective [--token N] --sha S --lee "LEE'S WORDS"
  record-rollback [--token N] --deploy D --lee "LEE'S WORDS"
  ack-deploy --deploy D --lee "LEE'S WORDS"
  repair-note --aside A --fixed F --reason TEXT

Not yet built (P0b-3): init, install, check-push, await-live.

Exit: 0 ok or GO; 1 NO-GO or failed read; 2 refused; 3 HALTED; 4 BUSY.
${REPAIR_TEXT}
`;

class Exit extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const refuse = (message) => new Exit(2, `REFUSED: ${message}`);
const haltedExit = (detail) => new Exit(3, `SCHEDULING HALTED: ${detail}`);

/* ---------- paths, seams and the path guard ---------- */

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

const override = process.env.OC_RELEASE_STATE_DIR;
const underVitest = Boolean(process.env.VITEST);

function guardPaths(command) {
  if (underVitest) {
    if (!override) throw refuse("VITEST is set and OC_RELEASE_STATE_DIR is absent");
    const resolved = resolveReal(override);
    if (realStateDirs().some((real) => isInside(resolved, real))) {
      throw refuse("OC_RELEASE_STATE_DIR resolves inside the real state dir");
    }
  }
  if (command === "check-push" && override && !underVitest) {
    throw refuse("check-push with OC_RELEASE_STATE_DIR and no VITEST: a fake universe cannot print GO");
  }
}

/** Test seams exist only with the override set. */
const seam = (name) => (override ? process.env[name] : undefined);

const stateDir = () => (override ? path.resolve(override) : path.join(os.homedir(), "marvin", "state"));
const ledgerPath = () => path.join(stateDir(), "opencanopy-releases.jsonl");
const leaseDir = () => path.join(stateDir(), "opencanopy-release.lock");
const leaseFile = () => path.join(leaseDir(), "lease.json");
const mutexDir = () => path.join(stateDir(), "opencanopy-release.mutex");

function nowMs() {
  const fake = seam("OC_RELEASE_NOW");
  if (fake !== undefined) {
    const ms = Date.parse(fake);
    if (Number.isNaN(ms)) throw refuse(`OC_RELEASE_NOW is not a date: ${fake}`);
    return ms;
  }
  return Date.now();
}
const nowIso = () => new Date(nowMs()).toISOString();

function crashAt(point) {
  if (seam("OC_RELEASE_CRASH_AT") === point) process.kill(process.pid, "SIGKILL");
}

/* ---------- ledger access ---------- */

function readLease() {
  let raw;
  try {
    raw = fs.readFileSync(leaseFile(), "utf8");
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return null;
    throw new LedgerError("unreadable", `lease: ${err.code}`);
  }
  try {
    const lease = JSON.parse(raw);
    if (!Number.isInteger(lease.token)) throw new Error("no token");
    return lease;
  } catch {
    throw new LedgerError("malformed", "lease.json is unparseable");
  }
}

function snapshot() {
  const records = parseLedger(ledgerPath());
  const state = fold(records);
  const lease = readLease();
  if (lease && lease.token > state.token) {
    throw new LedgerError("malformed", `lease token ${lease.token} above ledger maximum ${state.token}`);
  }
  return { records, state, lease };
}

function ledgerHalt(err) {
  if (err.kind === "missing") return haltedExit("not initialized");
  return haltedExit(`ledger ${err.kind}: ${err.message}\n${REPAIR_TEXT}`);
}

/** Runs fn under the mutex against a fresh read; there, a torn line is malformed. */
function locked(fn) {
  return withMutex(mutexDir(), () => {
    let ctx;
    try {
      ctx = snapshot();
    } catch (err) {
      if (err instanceof LedgerError) throw ledgerHalt(err);
      throw err;
    }
    return fn(ctx);
  });
}

/** The no-mutex read: a torn last line may be a writer mid-line, so re-read once under it. */
function readUnlocked() {
  try {
    return snapshot();
  } catch (err) {
    if (!(err instanceof LedgerError)) throw err;
    if (err.kind !== "torn") throw ledgerHalt(err);
  }
  return locked((ctx) => ctx);
}

function append(ctx, rec) {
  const full = { v: 1, ts: nowIso(), token: ctx.state.token, ...rec };
  const fd = fs.openSync(ledgerPath(), "a");
  try {
    fs.writeSync(fd, `${JSON.stringify(full)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  ctx.records.push(full);
  ctx.state = fold(ctx.records);
  return full;
}

const nextToken = (ctx) => ctx.state.token + 1;

/** Token authority is the ledger: lease.json is a cache and is never consulted here. */
function fence(ctx, token) {
  if (token !== ctx.state.token || !ctx.state.held) {
    throw refuse(`token ${token} is not the current lease (ledger token ${ctx.state.token}, held: ${ctx.state.held})`);
  }
}

/** For doors that carry `--lee`: no token with no lease; the normal fence otherwise. */
function fenceWhenHeld(ctx, token) {
  if (ctx.state.held || token !== null) fence(ctx, token);
}

function writeLease(body) {
  const tmp = `${leaseFile()}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(body));
  fs.renameSync(tmp, leaseFile());
}

/* ---------- external reads ---------- */

/**
 * The published-deploy read. P0b-3 replaces this with scripts/lib/netlify-read.mjs,
 * which adds the process-group kill, the in-flight read and the ledger-moved retry.
 */
function readPublished() {
  const bin = seam("OC_RELEASE_NETLIFY_BIN") ?? "netlify";
  const timeout = Number(seam("OC_RELEASE_READ_TIMEOUT_MS") ?? READ_TIMEOUT_MS);
  const run = spawnSync(bin, ["api", "getSite", "--data", JSON.stringify({ site_id: SITE_ID })], {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const fail = (why) => new Exit(1, `READ FAILED: netlify getSite ${why}; nothing written`);
  if (run.error) throw fail(run.error.message);
  if (run.status !== 0) throw fail(`exited ${run.status}`);
  let site;
  try {
    site = JSON.parse(run.stdout);
  } catch {
    throw fail("printed non-JSON");
  }
  if (!site?.published_deploy?.id) throw fail("has no published_deploy");
  return site.published_deploy;
}

function liveOriginMain() {
  const run = spawnSync("git", ["ls-remote", "origin", "refs/heads/main"], {
    encoding: "utf8",
    timeout: Number(seam("OC_RELEASE_READ_TIMEOUT_MS") ?? READ_TIMEOUT_MS),
  });
  if (run.error || run.status !== 0) return null;
  return run.stdout.trim().split(/\s+/)[0] || null;
}

/* ---------- output and notices ---------- */

const notices = [];

function noticeLee(door, words) {
  notices.push(`OpenCanopy release door "${door}" used. Lee's recorded words: "${words}"`);
}

/** Best effort and never blocking; runs after the mutex is released. */
function flushNotices() {
  for (const text of notices.splice(0)) {
    let bin;
    let args;
    if (override) {
      bin = seam("OC_RELEASE_NOTIFY_BIN");
      if (!bin) continue;
      args = [text];
    } else {
      bin = process.execPath;
      args = [path.join(os.homedir(), "marvin", "skills", "notify", "send.mjs"), text];
    }
    const run = spawnSync(bin, args, { timeout: NOTIFY_TIMEOUT_MS, stdio: "ignore" });
    if (run.error || run.status !== 0) {
      process.stderr.write(`warning: notice to Lee failed; tell him directly: ${text}\n`);
    }
  }
}

function announceHalt() {
  process.stderr.write(`${NEW_HALT_TEXT}\n`);
}

function describeHalts(state) {
  return state.openHalts
    .map((h) => `  ${h.kind}: sha=${h.sha ?? "none"} deploy=${h.deploy ?? "none"}`)
    .join("\n");
}

const halted = (state) =>
  haltedExit(`${state.openHalts.length} open halt(s), waiting on Lee\n${describeHalts(state)}`);

/* ---------- argument parsing ---------- */

const BOOLEAN_FLAGS = new Set(["json", "abandon", "unrecorded", "help"]);

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw refuse(`unexpected argument ${arg}`);
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
    } else {
      if (i + 1 >= argv.length) throw refuse(`--${name} needs a value`);
      flags[name] = argv[(i += 1)];
    }
  }
  return flags;
}

function only(flags, allowed) {
  for (const name of Object.keys(flags)) {
    if (!allowed.includes(name)) throw refuse(`unknown flag --${name}`);
  }
}

function need(flags, name) {
  if (flags[name] === undefined || flags[name] === "") throw refuse(`--${name} is required`);
  return flags[name];
}

function tokenFlag(flags, name = "token") {
  if (flags[name] === undefined) return null;
  if (!/^[0-9]+$/.test(flags[name])) throw refuse(`--${name} must be an integer`);
  return Number(flags[name]);
}

/** Words are attestations: verbatim from Lee, and never empty or whitespace. */
function words(flags, name) {
  const value = flags[name];
  if (value === undefined || value.trim() === "") throw refuse(`--${name} needs Lee's words, verbatim`);
  return value;
}

function optionalWords(flags, name) {
  return flags[name] === undefined ? null : words(flags, name);
}

/* ---------- reconcile ---------- */

function applyObservation(ctx, published) {
  let newHalt = false;
  for (const action of reconcileActions(ctx.state, published)) {
    append(ctx, action);
    if (action.type === "halt") newHalt = true;
  }
  if (newHalt) announceHalt();
  return newHalt;
}

function cmdReconcile(flags) {
  only(flags, []);
  readUnlocked();
  const published = readPublished();
  locked((ctx) => {
    applyObservation(ctx, published);
    if (ctx.state.openHalts.length > 0) throw halted(ctx.state);
    process.stdout.write(`reconciled: published ${published.id} is current\n`);
  });
}

/* ---------- lease commands ---------- */

function eligibleLiveDeploy(state, deploy) {
  const cur = state.current;
  if (!cur || cur.deploy !== deploy) return false;
  return Boolean((cur.rollback && cur.worded) || (cur.acked && cur.sha === null));
}

function cmdClaim(flags) {
  only(flags, ["lane", "sha", "deploy", "kind", "data-version"]);
  const lane = need(flags, "lane");
  const kind = need(flags, "kind");
  if (!LANES.has(lane)) throw refuse(`unknown lane ${lane}`);
  if (!KINDS.has(kind)) throw refuse(`unknown kind ${kind}`);
  if (Boolean(flags.sha) === Boolean(flags.deploy)) throw refuse("exactly one of --sha, --deploy");
  readUnlocked();
  const published = readPublished();
  locked((ctx) => {
    const newHalt = applyObservation(ctx, published);
    if (newHalt) throw halted(ctx.state);
    const { state } = ctx;
    const cur = state.current;
    const ackedSha = Boolean(flags.sha && cur?.acked && cur.sha === flags.sha);
    const liveDeploy = Boolean(flags.deploy && eligibleLiveDeploy(state, flags.deploy));
    if (flags.deploy && !liveDeploy) {
      throw refuse(`--deploy ${flags.deploy} is neither an acked deploy with no commit ref nor one record-rollback made current`);
    }
    const auth = kind === "corrective" ? state.correctives[flags.sha] : null;
    if (kind === "corrective" && !liveDeploy && (!auth || auth.consumed)) {
      throw refuse(`no unconsumed corrective authorization for ${flags.sha}`);
    }
    if (state.openHalts.length > 0 && !ackedSha && !liveDeploy && kind !== "corrective") {
      throw halted(state);
    }
    // A claim that died before lease.json never gave its holder a token, so its SHA may retry.
    const deadClaim = state.held && fs.existsSync(leaseDir()) && ctx.lease === null;
    const registered = flags.sha ? state.registrations[flags.sha] : null;
    const ownResidue = deadClaim && state.holder?.sha === flags.sha;
    if (registered && !registered.abandoned && !ackedSha && !ownResidue) {
      throw refuse(`${flags.sha} is already registered`);
    }
    let madeDir = true;
    try {
      fs.mkdirSync(leaseDir());
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      madeDir = false;
    }
    if (!madeDir) {
      if (state.held && !deadClaim) {
        throw refuse(`lease is held at token ${state.token} by lane ${state.holder?.lane}`);
      }
      if (deadClaim) append(ctx, { type: "release", abandon: true, residue: true });
    }
    crashAt("claim-after-mkdir");
    const live = ackedSha || liveDeploy;
    const token = nextToken(ctx);
    const sha = flags.sha ?? cur.sha;
    const rec = { type: "claim", token, lane, kind, sha };
    if (live) rec.live = true;
    if (live) rec.deploy = cur.deploy;
    if (flags["data-version"]) rec.data_version = flags["data-version"];
    append(ctx, rec);
    crashAt("claim-after-append");
    writeLease({ lane, sha, kind, token, ts: nowIso() });
    process.stdout.write(`claimed token=${token} sha=${sha ?? "none"}\n`);
  });
}

function cmdRelease(flags) {
  only(flags, ["token", "abandon"]);
  const token = tokenFlag(flags);
  if (token === null) throw refuse("--token is required");
  locked((ctx) => {
    fence(ctx, token);
    if (flags.abandon && ctx.state.holder?.pushed) {
      throw refuse("the candidate has been pushed and cannot be abandoned");
    }
    append(ctx, flags.abandon ? { type: "release", abandon: true } : { type: "release" });
    crashAt("release-after-append");
    fs.rmSync(leaseDir(), { recursive: true, force: true });
    process.stdout.write(`released token=${token}\n`);
  });
}

function cmdTakeover(flags) {
  only(flags, ["lane", "observed-token"]);
  const lane = need(flags, "lane");
  if (!LANES.has(lane)) throw refuse(`unknown lane ${lane}`);
  const observed = tokenFlag(flags, "observed-token");
  if (observed === null) throw refuse("--observed-token is required");
  readUnlocked();
  const published = readPublished();
  locked((ctx) => {
    // An open halt does not block a takeover (a red waits on Lee, and sessions end); a new one does.
    if (applyObservation(ctx, published)) throw halted(ctx.state);
    const { state, lease } = ctx;
    if (!fs.existsSync(leaseDir()) || !state.held || !lease) throw refuse("no lease to take over");
    if (observed !== state.token) {
      throw refuse(`observed token ${observed} is not the current token ${state.token}: lost`);
    }
    const age = nowMs() - Date.parse(lease.ts);
    if (!(age > STALE_MS)) throw refuse(`lease is ${Math.round(age / 1000)} s old, not past 2 h`);
    const token = nextToken(ctx);
    append(ctx, { type: "takeover", token, lane, observed_token: observed });
    crashAt("takeover-after-append");
    // Rename over lease.json; the directory stays, so a loser cannot remove a successor's lease.
    writeLease({ lane, sha: state.holder?.sha ?? null, kind: state.holder?.kind ?? null, token, ts: nowIso() });
    process.stdout.write(`took over token=${token}\n`);
  });
}

function cmdRequest(flags) {
  only(flags, ["token", "sha", "parent", "approval", "checks"]);
  const token = tokenFlag(flags);
  if (token === null) throw refuse("--token is required");
  const sha = need(flags, "sha");
  const parent = need(flags, "parent");
  const approval = words(flags, "approval");
  const checks = words(flags, "checks");
  locked((ctx) => {
    fence(ctx, token);
    const { holder, request } = ctx.state;
    if (sha !== holder.sha) throw refuse(`--sha ${sha} differs from the lease's ${holder.sha}`);
    if (request && request.approval === approval && request.parent === parent && request.checks === checks) {
      process.stdout.write("request unchanged\n");
      return;
    }
    append(ctx, { type: "request", sha, parent, approval, checks });
    process.stdout.write(`requested sha=${sha} parent=${parent}\n`);
  });
}

function cmdRecordPush(flags) {
  only(flags, ["token", "sha"]);
  const token = tokenFlag(flags);
  if (token === null) throw refuse("--token is required");
  const sha = need(flags, "sha");
  readUnlocked();
  const origin = liveOriginMain();
  locked((ctx) => {
    fence(ctx, token);
    const { holder } = ctx.state;
    if (sha !== holder.sha) throw refuse(`--sha ${sha} differs from the lease's ${holder.sha}`);
    if (origin !== sha) {
      throw refuse(`live origin main is ${origin ?? "unreadable"}, not ${sha}: a failed push cannot be recorded`);
    }
    if (holder.pushed) {
      process.stdout.write("push already recorded\n");
      return;
    }
    append(ctx, { type: "push", sha });
    process.stdout.write(`recorded push sha=${sha}\n`);
  });
}

/* ---------- verdicts ---------- */

function checkEvidence(file, current) {
  let stat;
  let body;
  try {
    stat = fs.statSync(file);
    body = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw refuse(`evidence ${file}: ${err.code}`);
  }
  if (body.trim() === "") throw refuse(`evidence ${file} is empty`);
  if (!(stat.mtimeMs > Date.parse(current.ts))) {
    throw refuse(`evidence ${file} is not newer than the deploy record`);
  }
  if (!body.includes(current.deploy) && !(current.sha && body.includes(current.sha))) {
    throw refuse(`evidence ${file} names neither the deploy id nor the SHA`);
  }
}

function cmdGuard(flags) {
  only(flags, ["token", "sha", "deploy", "result", "evidence", "lee"]);
  const token = tokenFlag(flags);
  const deploy = need(flags, "deploy");
  const result = need(flags, "result");
  const evidence = need(flags, "evidence");
  const lee = optionalWords(flags, "lee");
  const sha = flags.sha ?? null;
  if (!RESULTS.has(result)) throw refuse(`unknown result ${result}`);
  locked((ctx) => {
    const { state } = ctx;
    if (token !== null) fence(ctx, token);
    else if (result !== "red" || state.held) {
      throw refuse("--token is required, except for a red with no lease held");
    }
    const cur = state.current;
    if (deploy !== cur.deploy) throw refuse(`--deploy ${deploy} is not the current deploy ${cur.deploy}`);
    if (sha !== cur.sha) throw refuse(`--sha ${sha ?? "absent"} does not match the current deploy's ${cur.sha ?? "null ref"}`);
    checkEvidence(evidence, cur);

    if (result === "negative-control") {
      if (state.holder?.kind !== "instrumentation") {
        throw refuse("negative-control is accepted only on an instrumentation release");
      }
      if (state.negativeControls.some((n) => n.deploy === deploy)) {
        process.stdout.write("negative control already recorded\n");
        return;
      }
      append(ctx, { type: "negative-control", sha, deploy, evidence });
      process.stdout.write("negative control recorded\n");
      return;
    }

    const prev = verdictOf(state, sha, deploy);
    const transition = guardTransition(prev, result, lee !== null);
    if (transition === "refuse") {
      const hint = prev === "red" && result === "green" ? "; a red lifts only with --lee, Lee's words" : "";
      throw refuse(`verdict ${prev} to ${result} is not allowed${hint}`);
    }
    const closes = result === "green" && state.openHalts.some((h) => closesHalt(h, state, sha, deploy));
    if (transition === "noop" && !closes) {
      process.stdout.write(`verdict unchanged: ${result}\n`);
      return;
    }
    const rec = { type: "guard", sha, deploy, result, evidence };
    if (lee) rec.lee = lee;
    append(ctx, rec);
    if (result === "red" || result === "unverified") announceHalt();
    if (prev === "red" && result === "green") noticeLee("red to green", lee);
    const kg = ctx.state.knownGood;
    process.stdout.write(`guard ${result} recorded; known-good ${kg ? kg.deploy : "none"}\n`);
    if (!kg) process.stdout.write("No rollback target exists: no previous green deploy. Tell Lee.\n");
  });
}

function cmdAuthorizeCorrective(flags) {
  only(flags, ["token", "sha", "lee"]);
  const token = tokenFlag(flags);
  const sha = need(flags, "sha");
  const lee = words(flags, "lee");
  locked((ctx) => {
    fenceWhenHeld(ctx, token);
    const existing = ctx.state.correctives[sha];
    if (existing?.consumed) throw refuse(`the corrective for ${sha} is already consumed`);
    if (existing) {
      process.stdout.write("corrective already authorized\n");
      return;
    }
    append(ctx, { type: "corrective-auth", sha, lee });
    noticeLee("authorize-corrective", lee);
    process.stdout.write(`corrective authorized for ${sha}\n`);
  });
}

function knownDeploySha(records, deploy) {
  let found;
  for (const rec of records) {
    if (rec.deploy === deploy && ["genesis", "deploy", "rollback", "ack-deploy"].includes(rec.type)) {
      found = { sha: rec.sha ?? null };
    }
  }
  return found ?? null;
}

function cmdRecordRollback(flags) {
  only(flags, ["token", "deploy", "lee"]);
  const token = tokenFlag(flags);
  const deploy = need(flags, "deploy");
  const lee = words(flags, "lee");
  locked((ctx) => {
    fenceWhenHeld(ctx, token);
    const cur = ctx.state.current;
    const onCurrent = cur.deploy === deploy;
    if (onCurrent && cur.rollback && cur.worded) {
      process.stdout.write("rollback already recorded\n");
      return;
    }
    if (onCurrent && !cur.rollback) throw refuse(`${deploy} is the current deploy, not a rollback`);
    const known = knownDeploySha(ctx.records, deploy);
    if (!known) throw refuse(`the ledger has never recorded deploy ${deploy}`);
    append(ctx, { type: "rollback", deploy, sha: known.sha, lee });
    noticeLee("record-rollback", lee);
    process.stdout.write(`rollback to ${deploy} recorded; a green guard on it closes the halt\n`);
  });
}

function cmdAckDeploy(flags) {
  only(flags, ["deploy", "lee"]);
  const deploy = need(flags, "deploy");
  const lee = words(flags, "lee");
  readUnlocked();
  const published = readPublished();
  locked((ctx) => {
    const isPublished = published.id === deploy;
    const { current, stranded } = ctx.state;
    if (isPublished && current.deploy === deploy && current.acked) {
      process.stdout.write("already acked\n");
      return;
    }
    if (isPublished && current.deploy === deploy) throw refuse(`${deploy} is already current`);
    if (!isPublished && stranded.includes(deploy)) {
      process.stdout.write("already acked\n");
      return;
    }
    const rec = { type: "ack-deploy", deploy, lee, published: isPublished };
    rec.sha = isPublished ? (published.commit_ref ?? null) : null;
    append(ctx, rec);
    noticeLee("ack-deploy", lee);
    process.stdout.write(
      isPublished
        ? `acked ${deploy}: current and pending\n`
        : `acked ${deploy}: stranded, excluded from in-flight\n`,
    );
  });
}

function cmdRepairNote(flags) {
  only(flags, ["aside", "fixed", "reason"]);
  const aside = need(flags, "aside");
  const fixed = need(flags, "fixed");
  const reason = words(flags, "reason");
  withMutex(mutexDir(), () => {
    if (fs.existsSync(ledgerPath())) {
      throw refuse(`the ledger is still at ${ledgerPath()}; mv it aside first`);
    }
    let asideText;
    let fixedText;
    try {
      asideText = fs.readFileSync(aside, "utf8");
      fixedText = fs.readFileSync(fixed, "utf8");
    } catch (err) {
      throw refuse(`repair input: ${err.code} ${err.path}`);
    }
    let fixedRecords;
    try {
      fixedRecords = parseLedgerText(fixedText);
    } catch (err) {
      throw refuse(`--fixed does not validate: ${err.message}`);
    }
    // Tolerant on purpose: the aside is the file that failed to parse.
    const asideTokens = [...asideText.matchAll(/"token"\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
    const token = Math.max(0, ...asideTokens, fold(fixedRecords).token) + 1;
    const rec = { v: 1, ts: nowIso(), type: "repair", token, reason, aside };
    const fd = fs.openSync(fixed, "a");
    try {
      fs.writeSync(fd, `${JSON.stringify(rec)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(fixed, ledgerPath());
    // A repair fences the holder; its lease would otherwise block claims until stale.
    fs.rmSync(leaseDir(), { recursive: true, force: true });
    process.stdout.write(`repaired: token burned to ${token}\n`);
  });
}

/* ---------- reads ---------- */

function cmdStatus(flags) {
  only(flags, ["json"]);
  const { state, lease } = readUnlocked();
  const predecessor = state.current ? verdictOf(state, state.current.sha, state.current.deploy) : null;
  const view = {
    token: state.token,
    held: state.held,
    holder: state.holder,
    request: state.request,
    current: state.current,
    predecessor,
    known_good: state.knownGood,
    open_halts: state.openHalts,
    correctives: state.correctives,
    stranded: state.stranded,
    lease,
  };
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(view)}\n`);
  } else {
    process.stdout.write(
      `token ${state.token}, ${state.held ? `held by ${state.holder?.lane}` : "no lease"}; current ${state.current?.deploy} (${predecessor ?? "pending"}); known-good ${state.knownGood?.deploy ?? "none"}\n`,
    );
  }
  if (state.openHalts.length > 0) throw halted(state);
}

/** Public output: SHA, deploy id, data version and guard results. Never words. */
function summaryFor(records, sha) {
  const claim = records.find((r) => r.type === "claim" && r.sha === sha);
  const deploys = records.filter((r) => r.type === "deploy" && r.sha === sha).map((r) => r.deploy);
  const guards = records.filter((r) => r.type === "guard" && r.sha === sha).map((r) => r.result);
  return `sha=${sha} deploy=${deploys.join(",") || "none"} data_version=${claim?.data_version ?? "none"} guards=${guards.join(",") || "none"}`;
}

function originHandoff() {
  const fetched = spawnSync("git", ["fetch", "--quiet", "origin", "refs/heads/main"], {
    encoding: "utf8",
    timeout: Number(seam("OC_RELEASE_READ_TIMEOUT_MS") ?? READ_TIMEOUT_MS),
  });
  if (fetched.error || fetched.status !== 0) {
    throw new Exit(1, "READ FAILED: could not fetch origin main");
  }
  const shown = spawnSync("git", ["show", "FETCH_HEAD:.claude/handoff.md"], { encoding: "utf8" });
  // A branch with no handoff.md holds no records, so every release is unrecorded.
  return shown.status === 0 ? shown.stdout : "";
}

function shippedShas(records) {
  const shas = [];
  let holder = null;
  for (const rec of records) {
    if (rec.type === "claim") holder = { sha: rec.sha, pushed: Boolean(rec.live) };
    if (rec.type === "takeover" && holder && rec.adopted) holder.pushed = true;
    if (holder && (rec.type === "push" || rec.type === "deploy") && rec.sha === holder.sha) holder.pushed = true;
    if (rec.type === "release") {
      if (holder?.sha && holder.pushed && !rec.abandon && !shas.includes(holder.sha)) shas.push(holder.sha);
      holder = null;
    }
  }
  return shas;
}

function cmdSummary(flags) {
  only(flags, ["sha", "unrecorded"]);
  if (Boolean(flags.sha) === Boolean(flags.unrecorded)) throw refuse("exactly one of --sha, --unrecorded");
  const { records } = readUnlocked();
  if (flags.sha) {
    process.stdout.write(`${summaryFor(records, flags.sha)}\n`);
    return;
  }
  const handoff = originHandoff();
  for (const sha of shippedShas(records)) {
    if (!handoff.includes(sha)) process.stdout.write(`${summaryFor(records, sha)}\n`);
  }
}

/* ---------- entry ---------- */

const COMMANDS = {
  status: cmdStatus,
  summary: cmdSummary,
  claim: cmdClaim,
  release: cmdRelease,
  reconcile: cmdReconcile,
  takeover: cmdTakeover,
  request: cmdRequest,
  "record-push": cmdRecordPush,
  guard: cmdGuard,
  "authorize-corrective": cmdAuthorizeCorrective,
  "record-rollback": cmdRecordRollback,
  "ack-deploy": cmdAckDeploy,
  "repair-note": cmdRepairNote,
};

function main(argv) {
  const [command, ...rest] = argv;
  guardPaths(command);
  if (!command || command === "--help") {
    process.stdout.write(HELP);
    return;
  }
  // Fails closed until P0b-3 builds it: nothing may read this as a GO.
  if (command === "check-push") throw new Exit(1, "NO-GO: check-push is not built yet (P0b-3)");
  if (["init", "install", "await-live"].includes(command)) {
    throw refuse(`${command} is not built yet (P0b-3)`);
  }
  const run = COMMANDS[command];
  if (!run) throw refuse(`unknown command ${command}`);
  run(parseArgs(rest));
}

function exitCodeFor(err) {
  if (err instanceof Exit) {
    process.stderr.write(`${err.message}\n`);
    return err.code;
  }
  if (err instanceof MutexError) {
    if (err.kind === "busy") {
      process.stderr.write(`BUSY: ${err.message}\n`);
      return 4;
    }
    process.stderr.write(
      `SCHEDULING HALTED: ${err.message}\nA crashed tool left the release mutex. Tell Lee, then run exactly:\n  ${err.manual}\nAfter that, recovery is automatic.\n`,
    );
    return 3;
  }
  process.stderr.write(`release-ledger: internal error: ${err.stack ?? err}\n`);
  return 2;
}

let code = 0;
try {
  main(process.argv.slice(2));
} catch (err) {
  code = exitCodeFor(err);
}
flushNotices();
process.exitCode = code;
