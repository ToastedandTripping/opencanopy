/**
 * netlify-read.mjs -- the release tool's external reads and the in-flight rule.
 *
 * Every read has a timeout and kills the reader's whole process group, so a
 * grandchild holding the pipe cannot outlive it. Reads never run under the mutex.
 * A failed read throws ReadFailed; only the caller decides what that means, and
 * it must write nothing on the strength of one.
 */
import { spawn } from "node:child_process";

export const SITE_ID = "6b007878-a00d-4ada-86d4-5cf84e9acc2a";
export const READ_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Settled for in-flight purposes. Anything else, known or not, blocks a push. */
const SETTLED = new Set(["ready", "error"]);
/** C2's states a takeover may adopt when the deploy is the candidate's own. */
export const ADOPTABLE = new Set(["enqueued", "building", "processing"]);

export class ReadFailed extends Error {
  constructor(what, why) {
    super(`${what} ${why}`);
    this.name = "ReadFailed";
  }
}

/**
 * Runs a reader in its own process group. Resolves on close, so output is complete;
 * a child that exits while a grandchild still holds the pipe runs into the timeout
 * and reads as failed. Never rejects.
 */
export function boundedRun(cmd, args, { timeoutMs = READ_TIMEOUT_MS, cwd, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const errs = [];
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(out), stderr: Buffer.concat(errs).toString("utf8"), ...result });
    };
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (err) {
        // ESRCH: the group is already gone. The read has failed either way.
        if (err.code !== "ESRCH") process.stderr.write(`warning: could not kill reader group: ${err.message}\n`);
      }
      child.stdout.destroy();
      child.stderr.destroy();
      child.unref();
      finish({ ok: false, status: null, why: `timed out after ${timeoutMs} ms` });
    }, timeoutMs);
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => errs.push(d));
    child.on("error", (err) => finish({ ok: false, status: null, why: err.message }));
    child.on("close", (status) => finish({ ok: status === 0, status, why: `exited ${status}` }));
  });
}

async function netlifyApi(method, data, { bin = "netlify", timeoutMs = READ_TIMEOUT_MS } = {}) {
  const what = `netlify ${method}`;
  const run = await boundedRun(bin, ["api", method, "--data", JSON.stringify(data)], { timeoutMs });
  if (!run.ok) throw new ReadFailed(what, run.why);
  try {
    return JSON.parse(run.stdout.toString("utf8"));
  } catch {
    throw new ReadFailed(what, "printed non-JSON");
  }
}

/** The published deploy. Valid JSON without one is a failed read, never "nothing published". */
export async function readPublished(opts = {}) {
  const site = await netlifyApi("getSite", { site_id: SITE_ID }, opts);
  if (!site?.published_deploy?.id) throw new ReadFailed("netlify getSite", "has no published_deploy");
  return site.published_deploy;
}

/** The last 20 deploys, newest first. `state` is a free string: classify client-side. */
export async function listDeploys(opts = {}) {
  const deploys = await netlifyApi("listSiteDeploys", { site_id: SITE_ID, per_page: 20 }, opts);
  if (!Array.isArray(deploys)) throw new ReadFailed("netlify listSiteDeploys", "did not print a list");
  return deploys;
}

/** The newest production deploy of this commit: the list is newest first. A rebuild outranks its failure. */
export function newestBuildOf(deploys, sha) {
  return deploys.find((d) => d.context === "production" && d.commit_ref === sha) ?? null;
}

/**
 * The deploys that block a push: production, not settled, not acked as stranded,
 * and newer than the published deploy or under 24 h old (an older deploy still
 * building could publish over a newer one). The stranded March `new` falls outside
 * both. An unparseable date counts as newer: blocks on unknown.
 */
export function classifyInFlight(deploys, published, acks, now) {
  const stranded = new Set(acks);
  const publishedAt = Date.parse(published.created_at);
  return deploys.filter((d) => {
    if (d.context !== "production") return false;
    if (d.id === published.id || stranded.has(d.id)) return false;
    if (SETTLED.has(d.state)) return false;
    const created = Date.parse(d.created_at);
    const newer = !(created <= publishedAt);
    const young = now - created < DAY_MS;
    return newer || young;
  });
}
