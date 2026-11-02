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
  ADOPTABLE,
  READ_TIMEOUT_MS,
  ReadFailed,
  boundedRun,
  classifyInFlight,
  listDeploys,
  newestBuildOf,
  readPublished,
} from "./lib/netlify-read.mjs";
import {
  LedgerError,
  closesHalt,
  fold,
  guardTransition,
  liveDoorOpen,
  parseLedger,
  parseLedgerText,
  reconcileActions,
  verdictOf,
} from "./lib/release-state.mjs";

const STALE_MS = 2 * 60 * 60 * 1000;
const REQUEST_MAX_AGE_MS = 60 * 60 * 1000;
const READ_REDOS = 3;
const DEFAULT_POLL_MS = 15_000;
const DEFAULT_SITE_URL = "https://opencanopy.ca/";
const SHA_RE = /^[0-9a-f]{40}$/;
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

  install --lee "LEE'S WORDS"          (Lee's yes every time)
  init --evidence TEXT
  status [--json]
  summary (--sha S | --unrecorded)
  claim --lane M|S|session (--sha S | --deploy D) --kind instrumentation|behaviour|corrective [--data-version V]
  release --token N [--abandon]
  reconcile
  takeover --lane L --observed-token N
  request --token N --sha S --parent P --approval "LEE'S WORDS" --checks EVIDENCE
  check-push --token N [--pushed-sha S --remote-sha R]
  record-push --token N --sha S
  await-live --token N --sha S --source netlify|meta [--timeout-min 10]
  guard [--token N] [--sha S] --deploy D --result green|red|unverified|negative-control --evidence PATH [--lee "LEE'S WORDS"]
  authorize-corrective [--token N] --sha S --lee "LEE'S WORDS"
  record-rollback [--token N] --deploy D --lee "LEE'S WORDS"
  ack-deploy --deploy D --lee "LEE'S WORDS"
  repair-note --aside A --fixed F --reason TEXT

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
const toolDir = () => path.join(stateDir(), "opencanopy-release-tool");
const installedFile = () => path.join(toolDir(), "installed.json");
const hooksDir = () => path.join(toolDir(), "hooks");
const STATE_PATHS = ["opencanopy-releases.jsonl", "opencanopy-release.lock", "opencanopy-release.mutex", "opencanopy-release-tool"];

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
    const err = new LedgerError("malformed", `lease token ${lease.token} above ledger maximum ${state.token}`);
    err.leaseAhead = true;
    throw err;
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

/**
 * The no-mutex read. A torn last line may be a writer mid-line, and a lease above
 * the maximum may be a claim landing between our two reads, so either is re-read
 * once under the mutex before it is declared malformed.
 */
function readUnlocked() {
  try {
    return snapshot();
  } catch (err) {
    if (!(err instanceof LedgerError)) throw err;
    if (err.kind !== "torn" && !err.leaseAhead) throw ledgerHalt(err);
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

const readTimeoutMs = () => Number(seam("OC_RELEASE_READ_TIMEOUT_MS") ?? READ_TIMEOUT_MS);
const netlifyOpts = () => ({ bin: seam("OC_RELEASE_NETLIFY_BIN") ?? "netlify", timeoutMs: readTimeoutMs() });

/** A failed read exits nonzero and writes nothing. */
function exitOnFailedRead(promise) {
  return promise.catch((err) => {
    if (err instanceof ReadFailed) throw new Exit(1, `READ FAILED: ${err.message}; nothing written`);
    throw err;
  });
}
const published = () => exitOnFailedRead(readPublished(netlifyOpts()));
const deploysList = () => exitOnFailedRead(listDeploys(netlifyOpts()));

/** Git's repo-local variables, set inside a hook: they would override any -C. */
const GIT_LOCAL_ENV = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE", "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE", "GIT_PREFIX",
  "GIT_SHALLOW_FILE", "GIT_COMMON_DIR",
];

function gitEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  for (const name of GIT_LOCAL_ENV) delete env[name];
  return env;
}

const git = (dir, args) =>
  boundedRun("git", ["-C", dir, ...args], { env: gitEnv(), timeoutMs: readTimeoutMs() });

const text = (run) => run.stdout.toString("utf8").trim();

function readInstalled() {
  try {
    const installed = JSON.parse(fs.readFileSync(installedFile(), "utf8"));
    return typeof installed?.common_dir === "string" ? installed : null;
  } catch (err) {
    // Absent is normal before the first install; anything else also reads as P8 off.
    if (err.code !== "ENOENT") process.stderr.write(`warning: ${installedFile()}: ${err.message}\n`);
    return null;
  }
}

/** The tool has no fixed cwd: git reads go to the repo install recorded, else the caller's. */
const repoDir = () => readInstalled()?.common_dir ?? process.cwd();

/** {sha} when live origin main answered (null: it has no main), {failed} when it did not. */
async function readOriginMain(dir) {
  const run = await git(dir, ["ls-remote", "origin", "refs/heads/main"]);
  if (!run.ok) return { failed: run.why };
  return { sha: text(run).split(/\s+/)[0] || null };
}

async function liveOriginMain() {
  return (await readOriginMain(repoDir())).sha ?? null;
}

/** P8: asked of the repo install recorded, or GATE OFF cries wolf from any other. */
async function gateState() {
  const installed = readInstalled();
  if (!installed) return { ok: false, why: `no readable ${installedFile()}` };
  const run = await git(installed.common_dir, ["config", "core.hooksPath"]);
  const actual = run.ok ? text(run) : "unset";
  if (actual !== hooksDir()) return { ok: false, why: `core.hooksPath is ${actual}, not ${hooksDir()}` };
  try {
    fs.accessSync(path.join(hooksDir(), "pre-push"), fs.constants.X_OK);
  } catch (err) {
    return { ok: false, why: `the installed hook is not executable (${err.code})` };
  }
  return { ok: true, sourceSha: installed.source_sha };
}

/* ---------- output and notices ---------- */

const notices = [];

/** send.mjs defaults to parse_mode HTML and Telegram rejects over 4096, so words are escaped and capped. */
const NOTICE_WORDS_MAX = 3900;
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function noticeLee(door, words) {
  const noticeText = (recorded) => `OpenCanopy release door "${door}" used. Lee's recorded words: "${recorded}"`;
  const kept = words.length > NOTICE_WORDS_MAX ? `${words.slice(0, NOTICE_WORDS_MAX)} [cut here; the ledger has them all]` : words;
  notices.push({ payload: noticeText(escapeHtml(kept)), plain: noticeText(words) });
}

/** Best effort and never blocking; runs after the mutex is released. */
function flushNotices() {
  for (const { payload, plain } of notices.splice(0)) {
    const [bin, ...lead] = override
      ? [seam("OC_RELEASE_NOTIFY_BIN")]
      : [process.execPath, path.join(os.homedir(), "marvin", "skills", "notify", "send.mjs")];
    if (!bin) continue;
    // One argument list, so the real channel gets exactly the bytes the tests see.
    const run = spawnSync(bin, [...lead, payload], { timeout: NOTIFY_TIMEOUT_MS, stdio: "ignore" });
    if (run.error || run.status !== 0) {
      process.stderr.write(`warning: notice to Lee failed; tell him directly: ${plain}\n`);
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

const ledgerLength = () => {
  try {
    return fs.statSync(ledgerPath()).size;
  } catch {
    return -1; // Absent: locked() then reports it, under the mutex.
  }
};

const MOVED = Symbol("ledger moved");

/**
 * A Netlify read is only acted on if the ledger did not move during it. Otherwise
 * a read from just before another lane's deploy record logs a rollback that never
 * happened.
 */
async function withFreshRead(read, act) {
  for (let attempt = 0; attempt <= READ_REDOS; attempt += 1) {
    const before = ledgerLength();
    const observed = await read();
    const result = locked((ctx) => {
      if (ledgerLength() !== before) return MOVED;
      return act(ctx, observed);
    });
    if (result !== MOVED) return result;
  }
  throw new Exit(4, "BUSY: the ledger moved during every Netlify read; nothing was acted on");
}

async function cmdReconcile(flags) {
  only(flags, []);
  readUnlocked();
  const gate = await gateState();
  process.stdout.write(gate.ok ? `gate on, running from ${gate.sourceSha}\n` : `GATE OFF: ${gate.why}\n`);
  await withFreshRead(published, (ctx, site) => {
    applyObservation(ctx, site);
    if (ctx.state.openHalts.length > 0) throw halted(ctx.state);
    process.stdout.write(`reconciled: published ${site.id} is current\n`);
  });
}

/* ---------- lease commands ---------- */

function eligibleLiveDeploy(state, deploy) {
  const cur = state.current;
  if (!cur || cur.deploy !== deploy || !liveDoorOpen(state)) return false;
  return Boolean(cur.rollback || cur.sha === null);
}

async function cmdClaim(flags) {
  only(flags, ["lane", "sha", "deploy", "kind", "data-version"]);
  const lane = need(flags, "lane");
  const kind = need(flags, "kind");
  if (!LANES.has(lane)) throw refuse(`unknown lane ${lane}`);
  if (!KINDS.has(kind)) throw refuse(`unknown kind ${kind}`);
  if (Boolean(flags.sha) === Boolean(flags.deploy)) throw refuse("exactly one of --sha, --deploy");
  readUnlocked();
  await withFreshRead(published, (ctx, site) => {
    const newHalt = applyObservation(ctx, site);
    if (newHalt) throw halted(ctx.state);
    const { state } = ctx;
    const cur = state.current;
    const ackedSha = Boolean(flags.sha && cur?.acked && cur.sha === flags.sha && liveDoorOpen(state));
    const liveDeploy = Boolean(flags.deploy && eligibleLiveDeploy(state, flags.deploy));
    if (flags.deploy && !liveDeploy) {
      throw refuse(`--deploy ${flags.deploy} is neither an acked deploy with no commit ref nor one record-rollback made current, still answering its halt`);
    }
    // A corrective is a new commit. What is already live changes nothing and closes nothing.
    if (kind === "corrective" && flags.deploy) throw refuse("a corrective claims a new --sha, never a live --deploy");
    const auth = kind === "corrective" ? state.correctives[flags.sha] : null;
    if (kind === "corrective" && (!auth || auth.consumed)) {
      throw refuse(`no unconsumed corrective authorization for ${flags.sha}`);
    }
    if (kind === "corrective" && state.deployedShas.has(flags.sha)) {
      throw refuse(`${flags.sha} has already been deployed, so it cannot be a corrective`);
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

/**
 * Takeover's in-flight rule: the candidate's own deploy still building is adopted;
 * anything else in flight halts until `ack-deploy`. Returns the adoption, or null.
 */
function settleInFlight(ctx, deploys, site) {
  const blocking = classifyInFlight(deploys, site, ctx.state.stranded, nowMs());
  let adopted = null;
  let unresolved = false;
  let newHalt = false;
  for (const d of blocking) {
    const ref = d.commit_ref ?? null;
    if (ADOPTABLE.has(d.state) && ref && ref === ctx.state.holder?.sha) {
      adopted = { sha: ref, deploy: d.id };
      continue;
    }
    unresolved = true;
    if (!ctx.state.openHalts.some((h) => h.kind === "unclassifiable" && h.deploy === d.id)) {
      append(ctx, { type: "halt", reason: `deploy in flight (${d.state})`, deploy: d.id, sha: ref });
      newHalt = true;
    }
  }
  if (newHalt) announceHalt();
  if (unresolved) throw halted(ctx.state);
  return adopted;
}

async function cmdTakeover(flags) {
  only(flags, ["lane", "observed-token"]);
  const lane = need(flags, "lane");
  if (!LANES.has(lane)) throw refuse(`unknown lane ${lane}`);
  const observed = tokenFlag(flags, "observed-token");
  if (observed === null) throw refuse("--observed-token is required");
  readUnlocked();
  const read = async () => ({ site: await published(), deploys: await deploysList() });
  await withFreshRead(read, (ctx, { site, deploys }) => {
    // An open halt does not block a takeover (a red waits on Lee, and sessions end); a new one does.
    if (applyObservation(ctx, site)) throw halted(ctx.state);
    const { state, lease } = ctx;
    if (!fs.existsSync(leaseDir()) || !state.held || !lease) throw refuse("no lease to take over");
    if (observed !== state.token) {
      throw refuse(`observed token ${observed} is not the current token ${state.token}: lost`);
    }
    const age = nowMs() - Date.parse(lease.ts);
    if (!(age > STALE_MS)) throw refuse(`lease is ${Math.round(age / 1000)} s old, not past 2 h`);
    const adopted = settleInFlight(ctx, deploys, site);
    const token = nextToken(ctx);
    const rec = { type: "takeover", token, lane, observed_token: observed };
    if (adopted) rec.adopted = adopted;
    append(ctx, rec);
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
    if (request && request.token === token && request.approval === approval && request.parent === parent && request.checks === checks) {
      process.stdout.write("request unchanged\n");
      return;
    }
    append(ctx, { type: "request", sha, parent, approval, checks });
    process.stdout.write(`requested sha=${sha} parent=${parent}\n`);
  });
}

async function cmdRecordPush(flags) {
  only(flags, ["token", "sha"]);
  const token = tokenFlag(flags);
  if (token === null) throw refuse("--token is required");
  const sha = need(flags, "sha");
  readUnlocked();
  const origin = await liveOriginMain();
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
    if (ctx.state.deployedShas.has(sha)) {
      throw refuse(`${sha} has already been deployed, so it cannot be a corrective`);
    }
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
    // An ack still answering its halt may gain a rollback's words; anything else current never rolled back.
    if (onCurrent && !cur.rollback && !(cur.acked && liveDoorOpen(ctx.state))) {
      throw refuse(`${deploy} is the current deploy, not a rollback`);
    }
    const known = knownDeploySha(ctx.records, deploy);
    if (!known) throw refuse(`the ledger has never recorded deploy ${deploy}`);
    append(ctx, { type: "rollback", deploy, sha: known.sha, lee });
    noticeLee("record-rollback", lee);
    process.stdout.write(`rollback to ${deploy} recorded; a green guard on it closes the halt\n`);
  });
}

async function cmdAckDeploy(flags) {
  only(flags, ["deploy", "lee"]);
  const deploy = need(flags, "deploy");
  const lee = words(flags, "lee");
  readUnlocked();
  const site = await published();
  locked((ctx) => {
    const isPublished = site.id === deploy;
    const { current, stranded } = ctx.state;
    if (isPublished && current.deploy === deploy && current.acked) {
      process.stdout.write("already acked\n");
      return;
    }
    // A deploy record can make a halted deploy current, and its halt closes only on an ack.
    // A worded rollback already answers that halt; an ack would replace it and drop Lee's words.
    const owesAck =
      !(current.rollback && current.worded) &&
      ctx.state.openHalts.some((h) => h.kind === "unclassifiable" && h.deploy === deploy);
    if (isPublished && current.deploy === deploy && !owesAck) throw refuse(`${deploy} is already current`);
    if (!isPublished && stranded.includes(deploy)) {
      process.stdout.write("already acked\n");
      return;
    }
    const rec = { type: "ack-deploy", deploy, lee, published: isPublished };
    rec.sha = isPublished ? (site.commit_ref ?? null) : null;
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
    // The lease may be why it failed to parse, and its holder's token must not come back.
    let leaseText = "";
    try {
      leaseText = fs.readFileSync(leaseFile(), "utf8");
    } catch (err) {
      if (err.code !== "ENOENT" && err.code !== "ENOTDIR") throw err;
    }
    const leaseTokens = [...leaseText.matchAll(/"token"\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
    const token = Math.max(0, ...asideTokens, ...leaseTokens, fold(fixedRecords).token) + 1;
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

async function originHandoff() {
  const dir = repoDir();
  const fetched = await git(dir, ["fetch", "--quiet", "origin", "refs/heads/main"]);
  if (!fetched.ok) throw new Exit(1, "READ FAILED: could not fetch origin main");
  const shown = await git(dir, ["show", "FETCH_HEAD:.claude/handoff.md"]);
  // A branch with no handoff.md holds no records, so every release is unrecorded.
  return shown.ok ? shown.stdout.toString("utf8") : "";
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

async function cmdSummary(flags) {
  only(flags, ["sha", "unrecorded"]);
  if (Boolean(flags.sha) === Boolean(flags.unrecorded)) throw refuse("exactly one of --sha, --unrecorded");
  const { records } = readUnlocked();
  if (flags.sha) {
    process.stdout.write(`${summaryFor(records, flags.sha)}\n`);
    return;
  }
  const handoff = await originHandoff();
  for (const sha of shippedShas(records)) {
    if (!handoff.includes(sha)) process.stdout.write(`${summaryFor(records, sha)}\n`);
  }
}

/* ---------- check-push ---------- */

/** The bound corrective: authorized for exactly this SHA, unconsumed, and the holder's own. */
function boundCorrective(state, pushed) {
  const auth = pushed ? state.correctives[pushed] : null;
  return Boolean(auth && !auth.consumed && state.holder?.kind === "corrective" && state.holder.sha === pushed);
}

/** Why P1 fails, or null. The request must be un-pushed, under this token, and under an hour old. */
function requestProblem(state, token) {
  if (token === null || token !== state.token || !state.held) {
    return `token ${token ?? "absent"} is not the current lease (ledger token ${state.token})`;
  }
  const { request } = state;
  if (!request) return "no un-pushed request";
  if (request.token !== token) return `the request was made under token ${request.token}, not ${token}`;
  if (state.holder?.pushed) return "the candidate has already been pushed";
  if (!(nowMs() - Date.parse(request.ts) < REQUEST_MAX_AGE_MS)) {
    return "the request is 60 minutes old or more; ask Lee again";
  }
  return null;
}

async function ancestorProblem(dir, parent, pushed) {
  if (!SHA_RE.test(parent ?? "") || !SHA_RE.test(pushed ?? "")) return `cannot compare ${parent} and ${pushed}`;
  const run = await git(dir, ["merge-base", "--is-ancestor", parent, pushed]);
  return run.ok ? null : `parent ${parent} is not an ancestor of ${pushed}`;
}

const settledRead = (promise) => promise.then((value) => ({ value }), (error) => ({ error }));

/** Writes nothing. Every failed predicate is reported; any failed read is NO-GO. */
async function cmdCheckPush(flags) {
  only(flags, ["token", "pushed-sha", "remote-sha"]);
  let snap;
  try {
    snap = readUnlocked();
  } catch (err) {
    if (err instanceof Exit) throw new Exit(err.code, `NO-GO\n${err.message}`);
    throw err;
  }
  const { state } = snap;
  const token = /^[0-9]+$/.test(flags.token ?? "") ? Number(flags.token) : null;
  const dir = repoDir();
  const { request } = state;

  let pushed = flags["pushed-sha"] ?? null;
  let headFailed = null;
  if (pushed === null) {
    const head = await git(process.cwd(), ["rev-parse", "HEAD"]);
    if (head.ok) pushed = text(head);
    else headFailed = head.why;
  }

  const [origin, site, deploys, gate, ancestor] = await Promise.all([
    readOriginMain(dir),
    settledRead(published()),
    settledRead(deploysList()),
    gateState(),
    request ? ancestorProblem(dir, request.parent, pushed) : null,
  ]);

  const failures = [];
  const fail = (id, why) => failures.push(`${id}: ${why}`);

  const p1 = requestProblem(state, token);
  if (p1) fail("P1", p1);

  if (headFailed) fail("P2", `could not read HEAD (${headFailed})`);
  else if (!request) fail("P2", "no request to compare the pushed SHA with");
  else {
    if (pushed !== request.sha) fail("P2", `pushing ${pushed}, but the request names ${request.sha}`);
    if (ancestor) fail("P2", ancestor);
  }

  if (origin.failed || !origin.sha) fail("P3", `live origin main unreadable (${origin.failed ?? "empty"})`);
  else {
    if (!request) fail("P3", "no request names a parent");
    else if (origin.sha !== request.parent) fail("P3", `live origin main is ${origin.sha}, not the parent ${request.parent}`);
    if (flags["remote-sha"] !== undefined && flags["remote-sha"] !== origin.sha) {
      fail("P3", `the push expects origin at ${flags["remote-sha"]}, live is ${origin.sha}`);
    }
  }

  if (site.error || deploys.error) {
    fail("P4", `in-flight read failed (${(deploys.error ?? site.error).message})`);
  } else {
    const inFlight = classifyInFlight(deploys.value, site.value, state.stranded, nowMs());
    if (inFlight.length > 0) {
      fail("P4", `deploy in flight: ${inFlight.map((d) => `${d.id} (${d.state})`).join(", ")}; if it is stuck, ack-deploy on Lee's word`);
    }
  }
  if (site.value?.locked === true) {
    fail("P4", `published deploy ${site.value.id} is locked; netlify api unlockDeploy on Lee's word`);
  }

  if (site.error) fail("P5", `published read failed (${site.error.message})`);
  else if (site.value.id !== state.current?.deploy) {
    fail("P5", `published ${site.value.id} is not the ledger's current ${state.current?.deploy}`);
  }

  const corrective = boundCorrective(state, pushed);
  const predecessor = state.current ? verdictOf(state, state.current.sha, state.current.deploy) : null;
  if (predecessor !== "green" && !corrective) {
    fail("P6", `predecessor is ${predecessor ?? "pending"}, and no corrective is bound to this SHA`);
  }

  // Read here, not only from the ledger: await-live is the one recorder of a failed
  // build, and a session can leave the lease without ever running it.
  const tipBuild = origin.sha && deploys.value ? newestBuildOf(deploys.value, origin.sha) : null;
  if (tipBuild?.state === "error" && site.value?.commit_ref !== origin.sha && !corrective) {
    fail("P6", `live origin main ${origin.sha} failed its build (deploy ${tipBuild.id}); the only way on is a corrective, authorize-corrective on Lee's word`);
  }

  const passable = corrective ? new Set(["red", "unverified", "build-failed"]) : new Set();
  const blockingHalts = state.openHalts.filter((h) => !passable.has(h.kind));
  if (blockingHalts.length > 0) {
    fail("P7", `open halt: ${blockingHalts.map((h) => `${h.kind} sha=${h.sha ?? "none"} deploy=${h.deploy ?? "none"}`).join("; ")}`);
  }

  if (!gate.ok) fail("P8", `the gate is off: ${gate.why}`);

  if (failures.length > 0) throw new Exit(1, `NO-GO\n${failures.join("\n")}`);
  process.stdout.write(`GO sha=${pushed} parent=${request.parent} rollback=${state.knownGood?.deploy ?? "none"}\n`);
}

/* ---------- await-live ---------- */

function metaBuildId(html) {
  const tag = /<meta\b[^>]*\bname="oc-build"[^>]*>/.exec(html);
  return tag ? (/\bcontent="([^"]*)"/.exec(tag[0])?.[1] ?? null) : null;
}

/** The site's own oc-build tag, or null on any failure: a poll that learned nothing. */
async function fetchBuildId() {
  const url = seam("OC_RELEASE_SITE_URL") ?? DEFAULT_SITE_URL;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(readTimeoutMs()) });
    return res.ok ? metaBuildId(await res.text()) : null;
  } catch {
    return null;
  }
}

async function observeCandidate(sha, source) {
  const [site, deploys, buildId] = await Promise.all([
    settledRead(published()),
    settledRead(deploysList()),
    source === "meta" ? fetchBuildId() : null,
  ]);
  const pub = site.value ?? null;
  const live = Boolean(pub && pub.commit_ref === sha && pub.state === "ready");
  const newest = newestBuildOf(deploys.value ?? [], sha);
  return {
    live,
    deployId: live ? pub.id : null,
    match: live && (source !== "meta" || buildId === sha),
    failed: !live && newest?.state === "error" ? newest.id : null,
  };
}

function recordLive(ctx, sha, deployId) {
  if (ctx.state.current?.deploy !== deployId) {
    append(ctx, { type: "deploy", deploy: deployId, sha, source: "await-live" });
  }
}

async function cmdAwaitLive(flags) {
  only(flags, ["token", "sha", "source", "timeout-min"]);
  const token = tokenFlag(flags);
  if (token === null) throw refuse("--token is required");
  const sha = need(flags, "sha");
  const source = need(flags, "source");
  if (source !== "netlify" && source !== "meta") throw refuse(`unknown source ${source}`);
  const minutes = flags["timeout-min"] === undefined ? 10 : Number(flags["timeout-min"]);
  if (!(minutes > 0)) throw refuse("--timeout-min must be a positive number of minutes");
  const fenced = (ctx) => {
    fence(ctx, token);
    if (sha !== ctx.state.holder.sha) throw refuse(`--sha ${sha} differs from the lease's ${ctx.state.holder.sha}`);
  };
  locked(fenced);
  // A real monotonic clock, never OC_RELEASE_NOW: this deadline is about waiting.
  const deadline = performance.now() + minutes * 60_000;
  const pollMs = Number(seam("OC_RELEASE_POLL_MS") ?? DEFAULT_POLL_MS);
  for (;;) {
    const seen = await observeCandidate(sha, source);
    if (seen.failed) {
      locked((ctx) => {
        fenced(ctx);
        if (!ctx.state.openHalts.some((h) => h.kind === "build-failed" && h.sha === sha)) {
          append(ctx, { type: "build-failed", sha, deploy: seen.failed });
          announceHalt();
        }
      });
      throw haltedExit(`the build of ${sha} failed; production is unchanged; the known-good deploy is still live`);
    }
    if (seen.match) {
      locked((ctx) => {
        fenced(ctx);
        recordLive(ctx, sha, seen.deployId);
      });
      process.stdout.write(`live deploy=${seen.deployId} sha=${sha}\n`);
      return;
    }
    if (performance.now() >= deadline) {
      locked((ctx) => {
        fenced(ctx);
        if (seen.deployId) recordLive(ctx, sha, seen.deployId);
        const prev = verdictOf(ctx.state, sha, seen.deployId);
        const transition = guardTransition(prev, "unverified", false);
        if (transition === "refuse") throw new Exit(1, `await-live timed out; verdict ${prev} stands`);
        if (transition === "ok") {
          append(ctx, { type: "guard", sha, deploy: seen.deployId, result: "unverified", evidence: "await-live timeout" });
          announceHalt();
        }
      });
      throw haltedExit(`await-live timed out on ${sha}: unverified, deploy ${seen.deployId ?? "none"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

/* ---------- init and install ---------- */

/** `init` and `install` refuse until ~/marvin ignores every state path. */
async function requireIgnored() {
  const root = override ? seam("OC_RELEASE_MARVIN_ROOT") : path.join(os.homedir(), "marvin");
  if (!root) return; // Skipped under the override unless a fixture names a root.
  for (const name of STATE_PATHS) {
    const run = await git(root, ["check-ignore", "-q", `state/${name}`]);
    if (!run.ok) throw refuse(`${root} does not ignore state/${name}; commit the ignore patterns first`);
  }
}

async function cmdInit(flags) {
  only(flags, ["evidence"]);
  const evidence = words(flags, "evidence");
  if (fs.existsSync(ledgerPath())) throw refuse("a ledger already exists");
  await requireIgnored();
  const installed = readInstalled();
  if (!installed) throw refuse("run install first: genesis carries the first install's words");
  const [site, deploys] = await Promise.all([published(), deploysList()]);
  const inFlight = classifyInFlight(deploys, site, [], nowMs());
  if (inFlight.length > 0) throw refuse(`a deploy is in flight: ${inFlight.map((d) => d.id).join(", ")}`);
  withMutex(mutexDir(), () => {
    if (fs.existsSync(ledgerPath())) throw refuse("a ledger already exists");
    const rec = {
      v: 1,
      ts: nowIso(),
      type: "genesis",
      token: 1,
      deploy: site.id,
      sha: site.commit_ref ?? null,
      evidence,
      install: { source_sha: installed.source_sha, lee: installed.lee },
    };
    const fd = fs.openSync(ledgerPath(), "wx");
    try {
      fs.writeSync(fd, `${JSON.stringify(rec)}\n`);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    process.stdout.write(`initialized: known-good ${site.id}\n`);
  });
}

const LIB_FILES = [
  ["scripts/release-ledger.mjs", "release-ledger.mjs"],
  ["scripts/lib/dir-mutex.mjs", "lib/dir-mutex.mjs"],
  ["scripts/lib/release-state.mjs", "lib/release-state.mjs"],
  ["scripts/lib/netlify-read.mjs", "lib/netlify-read.mjs"],
];
const HOOK_FILE = ["scripts/hooks/pre-push", "hooks/pre-push"];
/** The hook lands last: while a copy is half done, the old hook still gates. */
const TOOL_FILES = [...LIB_FILES, HOOK_FILE];

/** Each path's bytes at this commit, or null if any is missing. Objects only, never the tree. */
async function readToolObjects(dir, sha) {
  const out = [];
  for (const [src, dest] of TOOL_FILES) {
    const run = await git(dir, ["show", `${sha}:${src}`]);
    if (!run.ok) return null;
    out.push({ dest, bytes: run.stdout });
  }
  return out;
}

/** Live origin main's exact SHA; the first install alone may use HEAD. */
async function installSource(dir, first) {
  const origin = await readOriginMain(dir);
  if (origin.failed) throw new Exit(1, `READ FAILED: live origin main (${origin.failed})`);
  if (origin.sha) {
    const fetched = await git(dir, ["fetch", "--quiet", "origin", "refs/heads/main"]);
    if (!fetched.ok) throw new Exit(1, `READ FAILED: could not fetch origin main (${fetched.why})`);
    const files = await readToolObjects(dir, origin.sha);
    if (files) return { sha: origin.sha, files };
  }
  if (!first) throw refuse(`origin main ${origin.sha ?? "(empty)"} lacks the tool paths`);
  const head = await git(process.cwd(), ["rev-parse", "HEAD"]);
  if (!head.ok) throw refuse(`cannot read HEAD (${head.why})`);
  const files = await readToolObjects(dir, text(head));
  if (!files) throw refuse(`HEAD ${text(head)} lacks the tool paths`);
  return { sha: text(head), files };
}

function placeFile(dest, bytes) {
  const full = path.join(toolDir(), dest);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, bytes);
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, full);
}

function recordInstall(sourceSha, lee) {
  let records;
  try {
    records = parseLedger(ledgerPath());
  } catch (err) {
    // A bad tool must be replaceable: a bad or absent ledger does not stop the install.
    if (!(err instanceof LedgerError)) throw err;
    process.stderr.write(`note: no install record (ledger ${err.kind})\n`);
    return;
  }
  const last = records.findLast((r) => r.type === "install") ?? records.find((r) => r.install)?.install;
  if (last?.source_sha === sourceSha && last.lee === lee) return;
  append({ records, state: fold(records) }, { type: "install", source_sha: sourceSha, lee });
}

async function cmdInstall(flags) {
  only(flags, ["lee"]);
  const lee = words(flags, "lee");
  const probe = await git(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!probe.ok) throw refuse("install runs from inside the repo it gates");
  const commonDir = text(probe);
  if (override && !isInside(resolveReal(commonDir), resolveReal(path.dirname(path.resolve(override))))) {
    throw refuse(`under the override the repo must sit under the temp root; ${commonDir} does not`);
  }
  await requireIgnored();
  // Presence, not parse: an unreadable record must not reopen the HEAD exception.
  const source = await installSource(commonDir, !fs.existsSync(installedFile()));
  withMutex(mutexDir(), () => {
    if (fs.existsSync(leaseDir())) {
      throw refuse(
        `a lease is held at ${leaseDir()}: the tool that authorizes a push does not change under the push. Release it, or on Lee's word remove the lease dir`,
      );
    }
    source.files.forEach(({ dest, bytes }, i) => {
      placeFile(dest, bytes);
      if (i === 0) crashAt("install-mid-copy");
    });
    fs.accessSync(path.join(hooksDir(), "pre-push"), fs.constants.X_OK);
    const set = spawnSync("git", ["-C", commonDir, "config", "core.hooksPath", hooksDir()], {
      env: gitEnv(),
      encoding: "utf8",
      timeout: readTimeoutMs(),
    });
    if (set.error || set.status !== 0) throw new Exit(1, `could not set core.hooksPath: ${set.stderr ?? set.error}`);
    const tmp = `${installedFile()}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ source_sha: source.sha, lee, common_dir: commonDir, ts: nowIso() }));
    fs.renameSync(tmp, installedFile());
    recordInstall(source.sha, lee);
    noticeLee("install", lee);
    process.stdout.write(`installed from ${source.sha}; core.hooksPath is ${hooksDir()}\n`);
  });
}

/* ---------- entry ---------- */

const COMMANDS = {
  install: cmdInstall,
  init: cmdInit,
  status: cmdStatus,
  summary: cmdSummary,
  claim: cmdClaim,
  release: cmdRelease,
  reconcile: cmdReconcile,
  takeover: cmdTakeover,
  request: cmdRequest,
  "check-push": cmdCheckPush,
  "record-push": cmdRecordPush,
  "await-live": cmdAwaitLive,
  guard: cmdGuard,
  "authorize-corrective": cmdAuthorizeCorrective,
  "record-rollback": cmdRecordRollback,
  "ack-deploy": cmdAckDeploy,
  "repair-note": cmdRepairNote,
};

async function main(argv) {
  const [command, ...rest] = argv;
  guardPaths(command);
  if (!command || command === "--help") {
    process.stdout.write(HELP);
    return;
  }
  const run = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : null;
  if (!run) throw refuse(`unknown command ${command}`);
  await run(parseArgs(rest));
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
  await main(process.argv.slice(2));
} catch (err) {
  code = exitCodeFor(err);
}
flushNotices();
process.exitCode = code;
