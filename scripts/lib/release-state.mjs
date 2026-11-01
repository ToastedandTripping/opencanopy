/**
 * release-state.mjs -- the ledger's parser and fold. Pure apart from the read in
 * parseLedger. Plan: .claude/plans/audit-remediation-2026-10/ (P0b).
 *
 * The ledger is the authority for tokens, verdicts and halts; lease.json is a
 * cache. Anything the parser cannot vouch for halts every release.
 */
import fs from "node:fs";

/** Required fields per type, beyond {v, ts, type, token}. */
export const RECORD_FIELDS = {
  genesis: ["deploy", "evidence"],
  claim: ["lane", "kind"],
  takeover: ["lane", "observed_token"],
  request: ["sha", "parent", "approval", "checks"],
  push: ["sha"],
  deploy: ["deploy"],
  "build-failed": ["sha"],
  guard: ["result"],
  "negative-control": ["deploy", "evidence"],
  "corrective-auth": ["sha", "lee"],
  rollback: ["deploy"],
  "ack-deploy": ["deploy", "lee"],
  release: [],
  halt: ["reason"],
  repair: ["reason"],
  install: ["source_sha", "lee"],
};

const ALLOCATING = new Set(["genesis", "claim", "takeover", "repair"]);

/** kind: "missing", "unreadable", "malformed" or "torn". */
export class LedgerError extends Error {
  constructor(kind, detail) {
    super(detail);
    this.name = "LedgerError";
    this.kind = kind;
  }
}

function validate(rec, lineNo) {
  const bad = (why) => new LedgerError("malformed", `line ${lineNo}: ${why}`);
  if (rec === null || typeof rec !== "object" || Array.isArray(rec)) throw bad("not an object");
  if (rec.v !== 1) throw bad(`unknown v ${JSON.stringify(rec.v)}`);
  const fields = Object.hasOwn(RECORD_FIELDS, rec.type) ? RECORD_FIELDS[rec.type] : null;
  if (!fields) throw bad(`unknown type ${JSON.stringify(rec.type)}`);
  if (!Number.isInteger(rec.token) || rec.token < 1) throw bad("bad token");
  if (typeof rec.ts !== "string" || Number.isNaN(Date.parse(rec.ts))) throw bad("bad ts");
  for (const f of fields) {
    if (rec[f] === undefined || rec[f] === null) throw bad(`${rec.type} lacks ${f}`);
  }
}

/** Parses bytes already read; `parseLedger` is the path form. */
export function parseLedgerText(text) {
  const lines = text.split("\n");
  const tail = lines.pop();
  if (tail !== "") {
    throw new LedgerError("torn", `torn last line: ${tail.length} bytes with no newline`);
  }
  const records = [];
  let last = 0;
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      throw new LedgerError("malformed", `line ${lineNo}: not JSON`);
    }
    validate(rec, lineNo);
    if (rec.token < last || (ALLOCATING.has(rec.type) && rec.token === last)) {
      throw new LedgerError("malformed", `line ${lineNo}: token ${rec.token} after ${last}`);
    }
    last = rec.token;
    records.push(rec);
  });
  if (records.length === 0) throw new LedgerError("malformed", "empty ledger");
  if (records[0].type !== "genesis") throw new LedgerError("malformed", "line 1: not genesis");
  return records;
}

export function parseLedger(path) {
  let text;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") throw new LedgerError("missing", "not initialized");
    throw new LedgerError("unreadable", `${err.code}: ${path}`);
  }
  return parseLedgerText(text);
}

/** The key one commit's verdict lives under; a null ref falls back to the deploy. */
const shaKey = (sha) => `sha:${sha}`;
const deployKey = (id) => `deploy:${id}`;

/**
 * May a claim come in on the current deploy itself, bypassing a halt? Only for a
 * door still answering what opened it: not once green, not after a later halt.
 */
export function liveDoorOpen(state) {
  const cur = state.current;
  return Boolean(cur && (cur.acked || (cur.rollback && cur.worded)) && !cur.spent && cur.doorAt === state.haltSeq);
}

export function verdictOf(state, sha, deploy) {
  return (sha && state.verdicts[shaKey(sha)]) || (deploy && state.verdicts[deployKey(deploy)]) || null;
}

function sameCommit(halt, sha, deploy) {
  if (halt.sha && sha) return halt.sha === sha;
  return Boolean(halt.deploy) && halt.deploy === deploy;
}

/**
 * Would a green on (sha, deploy), the current deploy, close this halt? Each kind
 * has its own door: any-green-closes-any-halt is the bug this exists to prevent.
 */
export function closesHalt(halt, state, sha, deploy) {
  const current = state.current;
  const onCurrent = current && current.deploy === deploy;
  // A rollback's words answer the halts open when they were given, never a later one.
  const worded = Boolean(onCurrent && current.rollback && current.worded && halt.id <= current.doorAt);
  const corrective =
    state.held && state.holder?.kind === "corrective" && Boolean(sha) && state.holder.sha === sha;
  switch (halt.kind) {
    case "red":
    case "unverified":
      return (
        sameCommit(halt, sha, deploy) ||
        worded ||
        corrective
      );
    case "build-failed":
      return corrective;
    case "unclassifiable":
      return Boolean((onCurrent && current.acked) || worded) && halt.deploy === deploy;
    default:
      return false;
  }
}

/**
 * The verdict table. "ok" appends, "noop" appends nothing (unless it closes a
 * halt, the caller's check), "refuse" is exit 2. Anything unlisted refuses.
 */
export function guardTransition(prev, next, hasLee) {
  if (prev === next) return "noop";
  if (prev === null) return "ok";
  if (prev === "unverified" && (next === "green" || next === "red")) return "ok";
  if (prev === "red" && next === "green") return hasLee ? "ok" : "refuse";
  if (prev === "green" && next === "red") return "ok";
  return "refuse";
}

function openHalt(s, halt) {
  s.haltSeq += 1;
  s.openHalts.push({ id: s.haltSeq, ...halt });
}

function setVerdict(s, sha, deploy, result) {
  if (sha) s.verdicts[shaKey(sha)] = result;
  if (deploy) s.verdicts[deployKey(deploy)] = result;
}

function sameDeployOrCommit(entry, sha, deploy) {
  return (sha && entry.sha === sha) || (deploy && entry.deploy === deploy);
}

function dropGreen(s, sha, deploy) {
  s.greens = s.greens.filter((g) => !sameDeployOrCommit(g, sha, deploy));
  s.pendingGreens = s.pendingGreens.filter((g) => !sameDeployOrCommit(g, sha, deploy));
}

/** A green that waited on another halt becomes known-good when the last halt closes. */
function promotePending(s) {
  if (s.openHalts.length > 0) return;
  for (const g of s.pendingGreens.splice(0)) {
    s.greens = s.greens.filter((e) => !sameDeployOrCommit(e, g.sha, g.deploy));
    s.greens.push(g);
  }
}

function applyGuard(s, rec) {
  const { sha = null, deploy = null, result } = rec;
  if (result === "red" || result === "unverified") {
    // unverified -> red replaces the halt on that commit; never stacks a second.
    s.openHalts = s.openHalts.filter(
      (h) => !(h.kind === "unverified" && sameCommit(h, sha, deploy)),
    );
    setVerdict(s, sha, deploy, result);
    if (!s.openHalts.some((h) => h.kind === result && sameCommit(h, sha, deploy))) {
      openHalt(s, { kind: result, sha, deploy, ts: rec.ts });
    }
    if (result === "red") dropGreen(s, sha, deploy);
    return;
  }
  s.openHalts = s.openHalts.filter((h) => !closesHalt(h, s, sha, deploy));
  setVerdict(s, sha, deploy, "green");
  if (s.current?.deploy === deploy) s.current.spent = true;
  s.pendingGreens = s.pendingGreens.filter((g) => !sameDeployOrCommit(g, sha, deploy));
  s.pendingGreens.push({ deploy, sha });
  promotePending(s);
}

export function fold(records) {
  const s = {
    token: 0,
    held: false,
    holder: null,
    request: null,
    current: null,
    greens: [],
    pendingGreens: [],
    deployedShas: new Set(),
    verdicts: {},
    openHalts: [],
    haltSeq: 0,
    registrations: {},
    correctives: {},
    stranded: [],
    negativeControls: [],
  };
  for (const rec of records) {
    s.token = Math.max(s.token, rec.token);
    switch (rec.type) {
      case "genesis":
        s.current = { deploy: rec.deploy, sha: rec.sha ?? null, ts: rec.ts };
        if (rec.sha) s.deployedShas.add(rec.sha);
        setVerdict(s, rec.sha, rec.deploy, "green");
        s.greens.push({ deploy: rec.deploy, sha: rec.sha ?? null });
        break;
      case "claim":
        s.held = true;
        s.request = null;
        s.holder = {
          token: rec.token,
          lane: rec.lane,
          sha: rec.sha ?? null,
          deploy: rec.deploy ?? null,
          kind: rec.kind,
          data_version: rec.data_version ?? null,
          pushed: Boolean(rec.live),
        };
        if (rec.sha && !rec.live) s.registrations[rec.sha] = { abandoned: false };
        break;
      case "takeover":
        s.held = true;
        s.request = null;
        s.holder = {
          ...s.holder,
          token: rec.token,
          lane: rec.lane,
          pushed: Boolean(s.holder?.pushed || rec.adopted),
        };
        break;
      case "request":
        s.request = {
          token: rec.token,
          sha: rec.sha,
          parent: rec.parent,
          approval: rec.approval,
          checks: rec.checks,
          ts: rec.ts,
        };
        break;
      case "push":
        if (s.holder) s.holder.pushed = true;
        s.request = null;
        if (s.correctives[rec.sha]) s.correctives[rec.sha].consumed = true;
        break;
      case "deploy":
        s.current = { deploy: rec.deploy, sha: rec.sha ?? null, ts: rec.ts };
        if (rec.sha) s.deployedShas.add(rec.sha);
        if (s.held && s.holder?.sha && s.holder.sha === rec.sha) s.holder.pushed = true;
        if (rec.sha && s.correctives[rec.sha]) s.correctives[rec.sha].consumed = true;
        break;
      case "build-failed":
        openHalt(s, { kind: "build-failed", sha: rec.sha, deploy: rec.deploy ?? null, ts: rec.ts });
        break;
      case "guard":
        applyGuard(s, rec);
        break;
      case "negative-control":
        s.negativeControls.push({ deploy: rec.deploy, sha: rec.sha ?? null });
        break;
      case "corrective-auth":
        s.correctives[rec.sha] = { consumed: false };
        break;
      case "rollback":
        s.current = {
          deploy: rec.deploy,
          sha: rec.sha ?? null,
          ts: rec.ts,
          rollback: true,
          worded: Boolean(rec.lee),
          doorAt: s.haltSeq,
        };
        if (rec.sha) s.deployedShas.add(rec.sha);
        break;
      case "ack-deploy":
        if (rec.published) {
          s.current = { deploy: rec.deploy, sha: rec.sha ?? null, ts: rec.ts, acked: true, doorAt: s.haltSeq };
          if (rec.sha) s.deployedShas.add(rec.sha);
        } else {
          s.stranded.push(rec.deploy);
          s.openHalts = s.openHalts.filter(
            (h) => !(h.kind === "unclassifiable" && h.deploy === rec.deploy),
          );
          promotePending(s);
        }
        break;
      case "release":
        s.held = false;
        if (rec.abandon && s.holder?.sha && s.registrations[s.holder.sha]) {
          s.registrations[s.holder.sha].abandoned = true;
        }
        s.holder = null;
        s.request = null;
        break;
      case "halt":
        openHalt(s, {
          kind: "unclassifiable",
          reason: rec.reason,
          sha: rec.sha ?? null,
          deploy: rec.deploy ?? null,
          ts: rec.ts,
        });
        break;
      case "repair":
        s.held = false;
        s.holder = null;
        s.request = null;
        break;
      case "install":
        break;
    }
  }
  s.knownGood = s.greens.at(-1) ?? null;
  return s;
}

/**
 * What one successful read of the published deploy adds to the ledger. Pure: the
 * read and its failure handling belong to the caller, since a failed read must
 * write nothing. A null commit_ref never equals another null.
 */
export function reconcileActions(state, published) {
  const { current, knownGood } = state;
  const ref = published.commit_ref ?? null;
  if (current && published.id === current.deploy) return [];
  const candidate = state.held ? state.holder?.sha : null;
  if (ref && candidate && ref === candidate && published.state === "ready") {
    return [{ type: "deploy", deploy: published.id, sha: ref, source: "reconcile" }];
  }
  if (knownGood && (published.id === knownGood.deploy || (ref && ref === knownGood.sha))) {
    return [{ type: "rollback", deploy: published.id, sha: ref, observed: true }];
  }
  if (state.openHalts.some((h) => h.kind === "unclassifiable" && h.deploy === published.id)) {
    return [];
  }
  return [{ type: "halt", reason: "unclassifiable published deploy", deploy: published.id, sha: ref }];
}
