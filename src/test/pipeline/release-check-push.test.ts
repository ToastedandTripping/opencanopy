// @vitest-environment node
/**
 * P0b-3: Netlify reads, check-push, the pre-push hook, takeover, reconcile, init,
 * install and await-live. Every case runs the real CLI (and, for the hook, real
 * `git push`) against temp state, a fake netlify bin and a fixture repo with a bare
 * origin. Assertions are on exit code, named reason and bytes, never timing.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Git, HOUR, LEE, RunResult, T0, TOOL_PATHS, Universe, cleanupUniverses, sha } from "./release-harness";

vi.setConfig({ testTimeout: 30_000 });
afterEach(cleanupUniverses);

const MINUTE = 60 * 1000;
const MARCH = "2026-03-29T12:00:00.000Z";
const MARCH_NEW = { id: "69c870ae", state: "new", context: "production", commit_ref: null, created_at: MARCH };
const FAST = { OC_RELEASE_POLL_MS: "10" };

interface Base {
  u: Universe;
  repo: Git;
  parent: string;
}

/** Real repo, tool committed and on origin, gate installed, ledger seeded at the parent. */
function base(): Base {
  const u = new Universe();
  const repo = u.repo();
  const parent = u.commitTool(repo);
  repo.pushMain();
  const res = u.run(["install", "--lee", LEE], { cwd: repo.dir });
  if (res.code !== 0) throw new Error(`install failed: ${res.out}`);
  u.seed(1, "dep-genesis", parent);
  return { u, repo, parent };
}

interface Ready extends Base {
  tip: string;
  token: number;
  check(extra?: string[], token?: number): RunResult;
}

function request(u: Universe, token: number, tip: string, parent: string, approval = LEE): RunResult {
  return u.run(["request", "--token", String(token), "--sha", tip, "--parent", parent, "--approval", approval, "--checks", "green"]);
}

/** Everything true: a claim and a request on a real tip. */
function ready(): Ready {
  const b = base();
  const tip = b.repo.commit("tip.txt", "tip\n");
  const token = b.u.claim(tip);
  const req = request(b.u, token, tip, b.parent);
  if (req.code !== 0) throw new Error(req.out);
  return {
    ...b,
    tip,
    token,
    check: (extra = [], t = token) => b.u.run(["check-push", "--token", String(t), "--pushed-sha", tip, ...extra]),
  };
}

function go(res: RunResult): void {
  expect(res.code, res.out).toBe(0);
  expect(res.stdout).toContain("GO sha=");
}

function noGo(res: RunResult, id: string): void {
  expect(res.code, res.out).toBe(1);
  expect(res.out).toContain("NO-GO");
  expect(res.out).toContain(`${id}:`);
}

/** Exactly this predicate failed. */
function onlyFails(res: RunResult, id: string): void {
  noGo(res, id);
  expect(res.out.match(/P[1-8]:/g)?.every((m) => m === `${id}:`), res.out).toBe(true);
}

/** A red (or unverified) on a deploy of a made-up SHA, released, origin untouched. */
function haltedOn(result: "red" | "unverified"): Base {
  const b = base();
  const X = sha("ab");
  const token = b.u.deployed(X, "dep-x");
  b.u.guard("dep-x", X, result, { token });
  b.u.run(["release", "--token", String(token)]);
  return b;
}

function correctiveOn(b: Base): { tip: string; token: number } {
  const tip = b.repo.commit("fix.txt", "fix\n");
  expect(b.u.run(["authorize-corrective", "--sha", tip, "--lee", LEE]).code).toBe(0);
  const token = b.u.claim(tip, "corrective");
  expect(request(b.u, token, tip, b.parent).code).toBe(0);
  return { tip, token };
}

describe("P1", () => {
  it("a stale token is NO-GO, exit 1, named", () => {
    const r = ready();
    onlyFails(r.check([], r.token - 1), "P1");
  });

  it("a current token with no request is NO-GO", () => {
    const b = base();
    const tip = b.repo.commit("tip.txt", "tip\n");
    const token = b.u.claim(tip);
    noGo(b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]), "P1");
  });

  it("the request's age: 60 min and 1 s is NO-GO, 59 min passes, a re-request with new words is GO", () => {
    const r = ready();
    const asked = Date.parse(String(r.u.records().at(-1)?.ts));
    r.u.now = asked + 59 * MINUTE;
    go(r.check());
    r.u.now = asked + 60 * MINUTE + 1000;
    onlyFails(r.check(), "P1");
    expect(request(r.u, r.token, r.tip, r.parent, "Lee, again: yes").code).toBe(0);
    go(r.check());
  });

  it("a candidate already pushed cannot be pushed again on the old request", () => {
    const r = ready();
    r.u.publish("dep-tip", r.tip);
    r.u.run(["reconcile"]);
    noGo(r.check(), "P1");
  });
});

describe("P2", () => {
  it("a pushed SHA other than the requested one is NO-GO", () => {
    const r = ready();
    const other = r.repo.commit("other.txt", "other\n");
    onlyFails(r.u.run(["check-push", "--token", String(r.token), "--pushed-sha", other]), "P2");
  });

  it("with no --pushed-sha it reads HEAD of the caller's repo", () => {
    const r = ready();
    go(r.u.run(["check-push", "--token", String(r.token)], { cwd: r.repo.dir }));
    r.repo.commit("later.txt", "later\n");
    onlyFails(r.u.run(["check-push", "--token", String(r.token)], { cwd: r.repo.dir }), "P2");
  });

  it("a parent that is not an ancestor is NO-GO", () => {
    const b = base();
    const tip = b.repo.commit("tip.txt", "tip\n");
    const child = b.repo.commit("child.txt", "child\n");
    const token = b.u.claim(tip);
    request(b.u, token, tip, child);
    b.u.gitRun(b.repo.dir, ["push", "--no-verify", b.repo.origin, `${child}:refs/heads/main`]);
    const res = b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]);
    onlyFails(res, "P2");
    expect(res.out).toContain("not an ancestor");
  });
});

describe("P3", () => {
  it("origin advanced with cached origin/main left old is NO-GO", () => {
    const r = ready();
    const cached = r.repo.git("rev-parse", "refs/remotes/origin/main");
    expect(cached).toBe(r.parent);
    expect(r.u.gitRun(r.repo.dir, ["push", "--no-verify", r.repo.origin, `${r.tip}:refs/heads/main`]).code).toBe(0);
    expect(r.repo.git("rev-parse", "refs/remotes/origin/main")).toBe(cached);
    onlyFails(r.check(), "P3");
  });

  it("ls-remote failing is NO-GO", () => {
    const r = ready();
    r.repo.git("remote", "set-url", "origin", path.join(r.u.root, "gone.git"));
    onlyFails(r.check(), "P3");
  });

  it("ls-remote returning empty is NO-GO", () => {
    const r = ready();
    const empty = path.join(r.u.root, "empty.git");
    r.repo.git("init", "--quiet", "--bare", empty);
    r.repo.git("remote", "set-url", "origin", empty);
    onlyFails(r.check(), "P3");
  });

  it("--remote-sha differing from live origin is NO-GO", () => {
    const r = ready();
    go(r.check(["--remote-sha", r.parent]));
    onlyFails(r.check(["--remote-sha", sha("ee")]), "P3");
  });
});

describe("P4", () => {
  const newer = () => new Date(T0 + HOUR).toISOString();
  const older = (u: Universe) => new Date(u.now - HOUR).toISOString();

  it.each(["enqueued", "building", "processing", "frobnicating"])("%s, newer than published: NO-GO", (state) => {
    const r = ready();
    r.u.deploys([{ id: "dep-z", state, context: "production", commit_ref: sha("cc"), created_at: newer() }]);
    onlyFails(r.check(), "P4");
  });

  it("older than published, non-terminal, under 24 h: NO-GO", () => {
    const r = ready();
    r.u.publish("dep-genesis", r.parent, { created_at: new Date(r.u.now).toISOString() });
    r.u.deploys([{ id: "dep-z", state: "building", context: "production", commit_ref: sha("cc"), created_at: older(r.u) }]);
    onlyFails(r.check(), "P4");
  });

  it("locked: true on the published deploy is NO-GO, and names the repair", () => {
    const r = ready();
    r.u.publish("dep-genesis", r.parent, { locked: true });
    const res = r.check();
    onlyFails(res, "P4");
    expect(res.out).toContain("unlockDeploy");
  });

  it("the stranded March new and a building preview do not block; settled deploys do not block", () => {
    const r = ready();
    r.u.deploys([
      { id: "dep-preview", state: "building", context: "deploy-preview", commit_ref: sha("cc"), created_at: newer() },
      { id: "dep-done", state: "ready", context: "production", commit_ref: sha("cd"), created_at: newer() },
      { id: "dep-bad", state: "error", context: "production", commit_ref: sha("ce"), created_at: newer() },
      { id: "dep-genesis", state: "building", context: "production", commit_ref: r.parent, created_at: newer() },
      MARCH_NEW,
    ]);
    go(r.check());
  });

  it("a stuck new newer than published blocks; after ack-deploy it does not", () => {
    const r = ready();
    r.u.deploys([{ id: "dep-stuck", state: "new", context: "production", commit_ref: null, created_at: newer() }]);
    onlyFails(r.check(), "P4");
    expect(r.u.run(["ack-deploy", "--deploy", "dep-stuck", "--lee", LEE]).code).toBe(0);
    go(r.check());
  });

  it("a failed list read is NO-GO", () => {
    const r = ready();
    r.u.netlifyScript(`[ "$2" = listSiteDeploys ] && exit 1\n`);
    onlyFails(r.check(), "P4");
  });

  it("a list read that is not a list is NO-GO", () => {
    const r = ready();
    r.u.netlifyScript(`[ "$2" = listSiteDeploys ] && { echo '{}'; exit 0; }\n`);
    onlyFails(r.check(), "P4");
  });

  it("newer than an old published deploy, non-terminal, past 24 h: still NO-GO", () => {
    const r = ready();
    r.u.publish("dep-genesis", r.parent, { created_at: new Date(T0 - 240 * HOUR).toISOString() });
    r.u.deploys([{ id: "dep-z", state: "building", context: "production", commit_ref: sha("cc"), created_at: new Date(T0 - 72 * HOUR).toISOString() }]);
    onlyFails(r.check(), "P4");
  });
});

describe("P5", () => {
  it("published not current is NO-GO", () => {
    const r = ready();
    r.u.publish("dep-other", sha("cc"));
    onlyFails(r.check(), "P5");
  });

  it.each([
    ["exits 1", `[ "$2" = getSite ] && exit 1\n`],
    ["prints non-JSON", `[ "$2" = getSite ] && { echo 'not json'; exit 0; }\n`],
    ["omits published_deploy", `[ "$2" = getSite ] && { echo '{"id":"site"}'; exit 0; }\n`],
  ])("the bin that %s is NO-GO", (_name, script) => {
    const r = ready();
    r.u.netlifyScript(script);
    const res = r.check();
    expect(res.code, res.out).toBe(1);
    expect(res.out).toContain("P5:");
  });

  it("a grandchild holding the pipe past the timeout is NO-GO, and the group is killed", () => {
    const r = ready();
    const pidFile = path.join(r.u.root, "grandchild.pid");
    r.u.netlifyScript(`[ "$2" = getSite ] && { sleep 60 & echo $! > '${pidFile}'; wait; }\n`);
    const res = r.u.run(["check-push", "--token", String(r.token), "--pushed-sha", r.tip], {
      env: { OC_RELEASE_READ_TIMEOUT_MS: "1500" },
    });
    expect(res.code, res.out).toBe(1);
    expect(res.out).toContain("P5:");
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    const alive = () => {
      try {
        return !/\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8"));
      } catch {
        return false;
      }
    };
    const deadline = Date.now() + 5000;
    while (alive() && Date.now() < deadline) spawnSync("sleep", ["0.05"]);
    expect(alive()).toBe(false);
  });
});

describe("P6", () => {
  it.each<"red" | "unverified">(["red", "unverified"])("predecessor %s is NO-GO", (result) => {
    const { u, repo, parent } = haltedOn(result);
    // Claimed before the verdict is the only way to hold a lease beside it.
    const tip = repo.commit("tip.txt", "tip\n");
    u.appendRecord({ type: "claim", token: u.state().token + 1, lane: "M", kind: "behaviour", sha: tip });
    fs.mkdirSync(u.leaseDir);
    fs.writeFileSync(u.leaseFile, JSON.stringify({ lane: "M", sha: tip, kind: "behaviour", token: u.state().token, ts: new Date(u.now).toISOString() }));
    const token = u.state().token;
    request(u, token, tip, parent);
    noGo(u.run(["check-push", "--token", String(token), "--pushed-sha", tip]), "P6");
  });

  it("a corrective for this SHA is GO", () => {
    const b = haltedOn("red");
    const { tip, token } = correctiveOn(b);
    go(b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]));
  });

  it("an authorization for another SHA is NO-GO", () => {
    const b = base();
    const tip = b.repo.commit("tip.txt", "tip\n");
    const token = b.u.claim(tip);
    b.u.guard("dep-genesis", b.parent, "red", { token });
    expect(b.u.run(["authorize-corrective", "--token", String(token), "--sha", sha("dd"), "--lee", LEE]).code).toBe(0);
    request(b.u, token, tip, b.parent);
    noGo(b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]), "P6");
  });

  it("a consumed corrective is NO-GO", () => {
    const b = haltedOn("red");
    const { tip, token } = correctiveOn(b);
    const pushed = b.u.gitRun(b.repo.dir, ["push", "origin", `${tip}:refs/heads/main`], { OC_RELEASE_TOKEN: String(token) });
    expect(pushed.code, pushed.out).toBe(0);
    expect(b.u.run(["record-push", "--token", String(token), "--sha", tip]).code).toBe(0);
    request(b.u, token, tip, tip);
    noGo(b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]), "P6");
  });
});

describe("P6: a failed build of live origin main, recorded by nobody", () => {
  /** Pushed with a valid token, the session dies before record-push, the build fails. */
  function failedAndTakenOver() {
    const r = ready();
    const pushed = r.u.gitRun(r.repo.dir, ["push", "origin", `${r.tip}:refs/heads/main`], { OC_RELEASE_TOKEN: String(r.token) });
    expect(pushed.code, pushed.out).toBe(0);
    r.u.deploys([{ id: "dep-bad", state: "error", context: "production", commit_ref: r.tip, created_at: new Date(T0 + HOUR).toISOString() }]);
    r.u.now += 3 * HOUR;
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(0);
    return { ...r, held: r.token + 1 };
  }

  function nextRelease(f: ReturnType<typeof failedAndTakenOver>, kind = "behaviour") {
    const tip = f.repo.commit("next.txt", "next\n");
    if (kind === "corrective") expect(f.u.run(["authorize-corrective", "--sha", tip, "--lee", LEE]).code).toBe(0);
    const token = f.u.claim(tip, kind);
    expect(request(f.u, token, tip, f.tip).code).toBe(0);
    return f.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]);
  }

  it.each([[["--abandon"]], [[]]])("takeover, then release %j: the next release is NO-GO, with the corrective named", (flags) => {
    const f = failedAndTakenOver();
    expect(f.u.run(["release", "--token", String(f.held), ...flags]).code).toBe(0);
    const res = nextRelease(f);
    onlyFails(res, "P6");
    expect(res.out).toContain(`${f.tip} failed its build (deploy dep-bad)`);
    expect(res.out).toContain("corrective");
  });

  it("the door: a bound corrective on top of the failed commit is GO", () => {
    const f = failedAndTakenOver();
    f.u.run(["release", "--token", String(f.held), "--abandon"]);
    go(nextRelease(f, "corrective"));
  });

  it("a rebuild that succeeded outranks the failure, and the order of the list is what says so", () => {
    const f = failedAndTakenOver();
    f.u.run(["release", "--token", String(f.held), "--abandon"]);
    const at = new Date(T0 + HOUR).toISOString();
    f.u.deploys([
      { id: "dep-rebuilt", state: "ready", context: "production", commit_ref: f.tip, created_at: at },
      { id: "dep-bad", state: "error", context: "production", commit_ref: f.tip, created_at: at },
    ]);
    go(nextRelease(f));
  });

  it("a failed preview of that commit is no failed build", () => {
    const f = failedAndTakenOver();
    f.u.run(["release", "--token", String(f.held), "--abandon"]);
    f.u.deploys([{ id: "dep-prev", state: "error", context: "deploy-preview", commit_ref: f.tip, created_at: new Date(T0 + HOUR).toISOString() }]);
    go(nextRelease(f));
  });

  it("a failed rebuild of the commit already live changes nothing: it did build", () => {
    const r = ready();
    r.u.deploys([{ id: "dep-rebuild", state: "error", context: "production", commit_ref: r.parent, created_at: new Date(T0 + HOUR).toISOString() }]);
    go(r.check());
  });
});

describe("P7", () => {
  it("halted with every other predicate true: the takeover that halted, its deploy later settled error", () => {
    const r = ready();
    const created = new Date(T0 + HOUR).toISOString();
    const deploy = { id: "dep-other", context: "production", commit_ref: sha("cc"), created_at: created };
    r.u.deploys([{ ...deploy, state: "building" }]);
    r.u.now += 3 * HOUR;
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(3);
    r.u.deploys([{ ...deploy, state: "error" }]);
    expect(request(r.u, r.token, r.tip, r.parent, "Lee, again: yes").code).toBe(0);
    onlyFails(r.check(), "P7");
    expect(r.u.run(["ack-deploy", "--deploy", "dep-other", "--lee", LEE]).code).toBe(0);
    go(r.check());
  });

  it.each<"red" | "unverified">(["red", "unverified"])("a bound corrective passes an open %s", (result) => {
    const b = haltedOn(result);
    const { tip, token } = correctiveOn(b);
    expect(b.u.state().open_halts).toHaveLength(1);
    go(b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]));
  });

  it("a bound corrective passes an open build-failed", () => {
    const b = base();
    const X = sha("ab");
    const held = b.u.claim(X);
    b.u.appendRecord({ type: "build-failed", token: held, sha: X });
    b.u.run(["release", "--token", String(held)]);
    const { tip, token } = correctiveOn(b);
    go(b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]));
  });

  it("an unclassifiable halt stops a bound corrective too", () => {
    const b = haltedOn("red");
    const { tip, token } = correctiveOn(b);
    b.u.appendRecord({ type: "halt", token, reason: "in flight", deploy: "dep-y", sha: sha("cc") });
    onlyFails(b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]), "P7");
  });

  it("a corrective authorization held by a behaviour lease passes nothing", () => {
    const b = base();
    const tip = b.repo.commit("tip.txt", "tip\n");
    const token = b.u.claim(tip);
    b.u.guard("dep-genesis", b.parent, "red", { token });
    b.u.run(["authorize-corrective", "--token", String(token), "--sha", tip, "--lee", LEE]);
    request(b.u, token, tip, b.parent);
    const res = b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]);
    noGo(res, "P7");
    noGo(res, "P6");
  });
});

describe("P8", () => {
  const cases: Array<[string, (r: Ready) => void]> = [
    ["core.hooksPath unset", (r) => r.repo.git("config", "--unset", "core.hooksPath")],
    ["core.hooksPath elsewhere", (r) => r.repo.git("config", "core.hooksPath", "/tmp/elsewhere")],
    ["hook missing", (r) => fs.rmSync(r.u.hookPath)],
    ["hook not executable", (r) => fs.chmodSync(r.u.hookPath, 0o644)],
  ];

  it.each(cases)("%s: NO-GO, and reconcile prints GATE OFF", (_name, breakIt) => {
    const r = ready();
    expect(r.u.run(["reconcile"]).stdout).not.toContain("GATE OFF");
    breakIt(r);
    onlyFails(r.check(), "P8");
    const res = r.u.run(["reconcile"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("GATE OFF");
  });

  it("reconcile from another repo with the gate on: no GATE OFF, and it names the gate's SHA", () => {
    const r = ready();
    const other = path.join(r.u.root, "other");
    fs.mkdirSync(other);
    r.repo.git("init", "--quiet", other);
    const res = r.u.run(["reconcile"], { cwd: other });
    expect(res.code, res.out).toBe(0);
    expect(res.stdout).not.toContain("GATE OFF");
    expect(res.stdout).toContain(`running from ${r.parent}`);
  });
});

describe("all pass; several fail", () => {
  it("GO exits 0, names the rollback, appends nothing", () => {
    const r = ready();
    const before = r.u.bytes();
    const res = r.check();
    go(res);
    expect(res.stdout).toContain(`GO sha=${r.tip} parent=${r.parent} rollback=dep-genesis`);
    expect(r.u.bytes()).toBe(before);
  });

  it("NO-GO prints every failed reason and appends nothing", () => {
    const r = ready();
    r.u.publish("dep-other", sha("cc"), { locked: true });
    r.repo.git("config", "--unset", "core.hooksPath");
    const before = r.u.bytes();
    const res = r.check(["--remote-sha", sha("ee")], r.token - 1);
    for (const id of ["P1", "P3", "P4", "P5", "P8"]) noGo(res, id);
    expect(r.u.bytes()).toBe(before);
  });

  it("a malformed ledger is exit 3 NO-GO with SCHEDULING HALTED", () => {
    const r = ready();
    fs.appendFileSync(r.u.ledgerPath, "{not json}\n");
    const res = r.check();
    expect(res.code).toBe(3);
    expect(res.out).toContain("NO-GO");
    expect(res.out).toContain("SCHEDULING HALTED");
  });

  it("a non-numeric token is NO-GO, not a crash", () => {
    const r = ready();
    const res = r.u.run(["check-push", "--token", "x", "--pushed-sha", r.tip]);
    noGo(res, "P1");
  });
});

describe("hook", () => {
  const originHead = (r: Base) => r.repo.git("ls-remote", "origin", "refs/heads/main").split(/\s+/)[0];

  it("no token: rejected and origin unmoved", () => {
    const r = ready();
    const res = r.u.gitRun(r.repo.dir, ["push", "origin", `${r.tip}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain("NO-GO");
    expect(originHead(r)).toBe(r.parent);
  });

  it("a valid token passes", () => {
    const r = ready();
    const res = r.u.gitRun(r.repo.dir, ["push", "origin", `${r.tip}:refs/heads/main`], { OC_RELEASE_TOKEN: String(r.token) });
    expect(res.code, res.out).toBe(0);
    expect(originHead(r)).toBe(r.tip);
  });

  it("the hook's own check fails closed: a wrong SHA is rejected, with the predicate named", () => {
    const r = ready();
    const wrong = r.repo.commit("wrong.txt", "wrong\n");
    const res = r.u.gitRun(r.repo.dir, ["push", "origin", `${wrong}:refs/heads/main`], { OC_RELEASE_TOKEN: String(r.token) });
    expect(res.code).not.toBe(0);
    expect(res.out).toContain("P2:");
    expect(originHead(r)).toBe(r.parent);
  });

  it("from a linked worktree: no token rejected, valid token passes", () => {
    const r = ready();
    const wt = path.join(r.u.root, "linked");
    r.repo.git("worktree", "add", "--quiet", "-b", "wt", wt, r.tip);
    expect(r.u.gitRun(wt, ["push", "origin", "wt:refs/heads/main"]).code).not.toBe(0);
    expect(originHead(r)).toBe(r.parent);
    const res = r.u.gitRun(wt, ["push", "origin", "wt:refs/heads/main"], { OC_RELEASE_TOKEN: String(r.token) });
    expect(res.code, res.out).toBe(0);
    expect(originHead(r)).toBe(r.tip);
  });

  it("a branch push passes with no token", () => {
    const r = ready();
    const res = r.u.gitRun(r.repo.dir, ["push", "origin", `${r.tip}:refs/heads/feature`]);
    expect(res.code, res.out).toBe(0);
  });

  it("pushed by URL: gated", () => {
    const r = ready();
    const res = r.u.gitRun(r.repo.dir, ["push", r.repo.origin, `${r.tip}:refs/heads/main`]);
    expect(res.code).not.toBe(0);
    expect(originHead(r)).toBe(r.parent);
  });

  it("main as one line of a multi-ref push: gated, in either position", () => {
    const r = ready();
    for (const refs of [
      [`${r.tip}:refs/heads/aaa`, `${r.tip}:refs/heads/main`],
      [`${r.tip}:refs/heads/main`, `${r.tip}:refs/heads/zzz`],
    ]) {
      expect(r.u.gitRun(r.repo.dir, ["push", "origin", ...refs]).code).not.toBe(0);
      expect(originHead(r)).toBe(r.parent);
    }
  });

  it("deleting main: refused, even with a valid token", () => {
    const r = ready();
    const res = r.u.gitRun(r.repo.dir, ["push", "origin", ":refs/heads/main"], { OC_RELEASE_TOKEN: String(r.token) });
    expect(res.code).not.toBe(0);
    expect(res.out).toContain("deleting main");
    expect(originHead(r)).toBe(r.parent);
  });

  it("the tracked hook carries the executable bit", () => {
    const tracked = spawnSync("git", ["ls-files", "--stage", "scripts/hooks/pre-push"], {
      cwd: path.resolve(__dirname, "../../.."),
      encoding: "utf8",
    });
    expect(tracked.stdout.startsWith("100755 ")).toBe(true);
  });
});

describe("request queued before takeover", () => {
  it("neither the old token nor the new owner's goes on the old request; the new owner's own does", () => {
    const r = ready();
    r.u.now += 3 * HOUR;
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(0);
    const next = r.token + 1;
    r.u.now = T0 + 3 * HOUR + 10 * MINUTE;
    noGo(r.check([], r.token), "P1");
    const res = r.check([], next);
    onlyFails(res, "P1");
    expect(res.out).toContain(`under token ${r.token}`);
    expect(request(r.u, next, r.tip, r.parent).code).toBe(0);
    go(r.check([], next));
  });
});

describe("takeover", () => {
  it("two competing reclaimers: 8 at once, one wins, one record, lease dir inode unchanged", async () => {
    const r = ready();
    r.u.now += 3 * HOUR;
    const inode = fs.statSync(r.u.leaseDir).ino;
    // Held open so a removed directory's inode cannot be reused by its re-creation.
    const pinned = fs.openSync(r.u.leaseDir, "r");
    const results = await Promise.all(
      Array.from({ length: 8 }, () => r.u.runAsync(["takeover", "--lane", "S", "--observed-token", String(r.token)])),
    );
    fs.closeSync(pinned);
    expect(results.filter((x) => x.code === 0)).toHaveLength(1);
    expect(results.every((x) => [0, 2, 4].includes(x.code)), results.map((x) => x.out).join("|")).toBe(true);
    expect(r.u.count("takeover")).toBe(1);
    expect(fs.statSync(r.u.leaseDir).ino).toBe(inode);
  });

  it("late reclaimer: observed 5 after a successor at 6 exits 2, lease intact", () => {
    const r = ready();
    r.u.now += 3 * HOUR;
    r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]);
    r.u.now += 3 * HOUR;
    const lease = r.u.leaseBytes();
    const before = r.u.bytes();
    expect(r.u.run(["takeover", "--lane", "M", "--observed-token", String(r.token)]).code).toBe(2);
    expect(r.u.leaseBytes()).toBe(lease);
    expect(r.u.bytes()).toBe(before);
  });

  it("no lease: takeover after release exits 2", () => {
    const r = ready();
    r.u.run(["release", "--token", String(r.token), "--abandon"]);
    r.u.now += 3 * HOUR;
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(2);
  });

  it("a failed reconcile read blocks it: nonzero, nothing written", () => {
    const r = ready();
    r.u.now += 3 * HOUR;
    r.u.netlifyScript("exit 1\n");
    const before = r.u.bytes();
    const lease = r.u.leaseBytes();
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(1);
    expect(r.u.bytes()).toBe(before);
    expect(r.u.leaseBytes()).toBe(lease);
  });

  it("it reconciles first: a direct push halts it", () => {
    const r = ready();
    r.u.now += 3 * HOUR;
    r.u.publish("dep-direct", sha("cc"));
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(3);
    expect(r.u.count("takeover")).toBe(0);
    expect(r.u.count("halt")).toBe(1);
  });

  it("in flight, the candidate building: adopted, and on through await-live to guard with no record-push", () => {
    const r = ready();
    const created = new Date(T0 + HOUR).toISOString();
    r.u.deploys([{ id: "dep-tip", state: "building", context: "production", commit_ref: r.tip, created_at: created }]);
    r.u.now += 3 * HOUR;
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(0);
    const taken = r.u.records().at(-1);
    expect(taken?.adopted).toEqual({ sha: r.tip, deploy: "dep-tip" });
    const held = r.token + 1;
    expect(r.u.run(["release", "--token", String(held), "--abandon"]).code).toBe(2);
    r.u.publish("dep-tip", r.tip);
    const live = r.u.run(["await-live", "--token", String(held), "--sha", r.tip, "--source", "netlify", "--timeout-min", "0.01"], { env: FAST });
    expect(live.code, live.out).toBe(0);
    expect(r.u.guard("dep-tip", r.tip, "green", { token: held }).code).toBe(0);
    expect(r.u.count("push")).toBe(0);
    expect(r.u.state().known_good.deploy).toBe("dep-tip");
  });

  it("in flight, another deploy: exit 3, a halt, lease unchanged, no takeover", () => {
    const r = ready();
    const created = new Date(T0 + HOUR).toISOString();
    r.u.deploys([{ id: "dep-z", state: "building", context: "production", commit_ref: sha("cc"), created_at: created }]);
    r.u.now += 3 * HOUR;
    const lease = r.u.leaseBytes();
    const res = r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]);
    expect(res.code).toBe(3);
    expect(res.out).toContain("NEW HALT");
    expect(r.u.leaseBytes()).toBe(lease);
    expect(r.u.count("takeover")).toBe(0);
    expect(r.u.count("halt")).toBe(1);
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(3);
    expect(r.u.count("halt")).toBe(1);
  });

  it("the candidate's commit in a state C2 does not name is not adopted", () => {
    const r = ready();
    const created = new Date(T0 + HOUR).toISOString();
    r.u.deploys([{ id: "dep-tip", state: "new", context: "production", commit_ref: r.tip, created_at: created }]);
    r.u.now += 3 * HOUR;
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(3);
  });

  describe("a halted deploy that a deploy record then makes current keeps its door", () => {
    /** Takeover halts on the candidate's own deploy in a state C2 does not name. */
    function haltedOnOwnDeploy() {
      const r = ready();
      const created = new Date(T0 + HOUR).toISOString();
      r.u.deploys([{ id: "dep-tip", state: "uploading", context: "production", commit_ref: r.tip, created_at: created }]);
      r.u.now += 3 * HOUR;
      expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(3);
      r.u.deploys([{ id: "dep-tip", state: "ready", context: "production", commit_ref: r.tip, created_at: created }]);
      r.u.publish("dep-tip", r.tip, { created_at: created });
      return r;
    }

    function liftThenNextGo(r: ReturnType<typeof haltedOnOwnDeploy>): void {
      expect(r.u.state().current.deploy).toBe("dep-tip");
      const ack = r.u.run(["ack-deploy", "--deploy", "dep-tip", "--lee", LEE]);
      expect(ack.code, ack.out).toBe(0);
      expect(fs.readFileSync(r.u.notifyLog, "utf8")).toContain("ack-deploy");
      expect(r.u.state().open_halts).toHaveLength(1);
      expect(r.u.guard("dep-tip", r.tip, "green", { token: r.token }).code).toBe(0);
      expect(r.u.state().open_halts).toEqual([]);
      expect(r.u.state().known_good.deploy).toBe("dep-tip");
      expect(r.u.run(["ack-deploy", "--deploy", "dep-tip", "--lee", LEE]).stdout).toContain("already acked");
      expect(r.u.run(["release", "--token", String(r.token)]).code).toBe(0);
      r.repo.git("push", "--quiet", "--no-verify", "origin", `${r.tip}:refs/heads/main`);
      const next = r.repo.commit("next.txt", "next\n");
      const token = r.u.claim(next);
      expect(request(r.u, token, next, r.tip).code).toBe(0);
      go(r.u.run(["check-push", "--token", String(token), "--pushed-sha", next]));
    }

    it("made current by reconcile: ack, green, and the next release is GO", () => {
      const r = haltedOnOwnDeploy();
      expect(r.u.run(["reconcile"]).code).toBe(3);
      expect(r.u.count("deploy")).toBe(1);
      liftThenNextGo(r);
    });

    it("made current by await-live under the old token: ack, green, and the next release is GO", () => {
      const r = haltedOnOwnDeploy();
      const live = r.u.run(["await-live", "--token", String(r.token), "--sha", r.tip, "--source", "netlify", "--timeout-min", "0.01"], { env: FAST });
      expect(live.code, live.out).toBe(0);
      expect(r.u.count("deploy")).toBe(1);
      liftThenNextGo(r);
    });

    it("the door opens only for that deploy's own halt: a current deploy with no halt on it is still refused", () => {
      const r = haltedOnOwnDeploy();
      r.u.run(["reconcile"]);
      r.u.run(["ack-deploy", "--deploy", "dep-tip", "--lee", LEE]);
      r.u.guard("dep-tip", r.tip, "green", { token: r.token });
      r.u.run(["release", "--token", String(r.token)]);
      const next = sha("dd");
      const token = r.u.deployed(next, "dep-next");
      r.u.appendRecord({ type: "halt", token, reason: "other", deploy: "dep-unrelated", sha: null });
      const before = r.u.count("ack-deploy");
      const res = r.u.run(["ack-deploy", "--deploy", "dep-next", "--lee", LEE]);
      expect(res.code).toBe(2);
      expect(res.out).toContain("already current");
      expect(r.u.count("ack-deploy")).toBe(before);
    });
  });
});

describe("no false rollback", () => {
  /** A deploy landing during the read, which answers with the older picture. */
  function landingDuringRead(u: Universe, token: number, tip: string, moveEveryTime: boolean): void {
    const flag = path.join(u.root, "moved");
    const line = JSON.stringify({ v: 1, ts: new Date(u.now).toISOString(), type: "deploy", token, deploy: "dep-tip", sha: tip, source: "other lane" });
    const appendLine = `printf '%s\\n' '${line}' >> '${u.ledgerPath}'`;
    u.netlifyScript(
      moveEveryTime
        ? `[ "$2" = getSite ] && ${appendLine}\n`
        : `if [ "$2" = getSite ] && [ ! -e '${flag}' ]; then touch '${flag}'; ${appendLine}; cat '${path.join(u.root, "site-old.json")}'; exit 0; fi\n`,
    );
  }

  function scenario() {
    const r = ready();
    // Published is the known-good; the racing record makes the candidate current.
    fs.writeFileSync(
      path.join(r.u.root, "site-old.json"),
      JSON.stringify({ published_deploy: { id: "dep-genesis", state: "ready", commit_ref: r.parent, context: "production", created_at: new Date(T0).toISOString() } }),
    );
    r.u.publish("dep-tip", r.tip);
    return r;
  }

  it("reconcile: the read is dropped and redone, no rollback", () => {
    const r = scenario();
    landingDuringRead(r.u, r.token, r.tip, false);
    const res = r.u.run(["reconcile"]);
    expect(res.code, res.out).toBe(0);
    expect(r.u.count("rollback")).toBe(0);
    expect(r.u.state().current.deploy).toBe("dep-tip");
  });

  it("reconcile: if it moves every time, exit 4 and nothing acted on", () => {
    const r = scenario();
    r.u.publish("dep-genesis", r.parent);
    landingDuringRead(r.u, r.token, r.tip, true);
    const res = r.u.run(["reconcile"]);
    expect(res.code).toBe(4);
    expect(r.u.count("rollback")).toBe(0);
  });

  it("takeover: the read is dropped and redone, no rollback", () => {
    const r = scenario();
    landingDuringRead(r.u, r.token, r.tip, false);
    r.u.now += 3 * HOUR;
    const res = r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]);
    expect(res.code, res.out).toBe(0);
    expect(r.u.count("rollback")).toBe(0);
    expect(r.u.count("takeover")).toBe(1);
  });

  it("takeover: if it moves every time, exit 4", () => {
    const r = scenario();
    r.u.publish("dep-genesis", r.parent);
    landingDuringRead(r.u, r.token, r.tip, true);
    r.u.now += 3 * HOUR;
    expect(r.u.run(["takeover", "--lane", "S", "--observed-token", String(r.token)]).code).toBe(4);
    expect(r.u.count("takeover")).toBe(0);
  });
});

describe("reconcile table", () => {
  it("published equals current: nothing", () => {
    const r = ready();
    const before = r.u.bytes();
    expect(r.u.run(["reconcile"]).code).toBe(0);
    expect(r.u.bytes()).toBe(before);
  });

  it("death between push and record-push: deploy appended, pending, never known-good", () => {
    const r = ready();
    r.u.publish("dep-tip", r.tip);
    expect(r.u.run(["reconcile"]).code).toBe(0);
    const st = r.u.state();
    expect(st.current.deploy).toBe("dep-tip");
    expect(st.predecessor).toBeNull();
    expect(st.known_good.deploy).toBe("dep-genesis");
  });

  it("published is the known-good and not current: rollback observed, restored deploy current, closes nothing", () => {
    const r = ready();
    r.u.publish("dep-tip", r.tip);
    r.u.run(["reconcile"]);
    r.u.guard("dep-tip", r.tip, "red", { token: r.token });
    r.u.publish("dep-genesis", r.parent);
    expect(r.u.run(["reconcile"]).code).toBe(3);
    const rec = r.u.records().at(-1);
    expect(rec?.type).toBe("rollback");
    expect(rec?.observed).toBe(true);
    expect(r.u.state().current.deploy).toBe("dep-genesis");
    expect(r.u.state().open_halts).toHaveLength(1);
  });

  it("a direct push: halt, exit 3, NEW HALT once", () => {
    const r = ready();
    r.u.publish("dep-direct", sha("cc"));
    const res = r.u.run(["reconcile"]);
    expect(res.code).toBe(3);
    expect(res.out).toContain("NEW HALT");
    const again = r.u.run(["reconcile"]);
    expect(again.code).toBe(3);
    expect(again.out).not.toContain("NEW HALT");
    expect(r.u.count("halt")).toBe(1);
  });

  it.each([
    ["exits 1", "exit 1\n"],
    ["prints non-JSON", "echo nope; exit 0\n"],
    ["omits published_deploy", `echo '{}'; exit 0\n`],
    ["prints good JSON but exits 1", `echo '{"published_deploy":{"id":"dep-direct","state":"ready"}}'; exit 1\n`],
  ])("a failed read (%s): nonzero, no bytes written, not halted", (_name, script) => {
    const r = ready();
    r.u.netlifyScript(script);
    const before = r.u.bytes();
    const res = r.u.run(["reconcile"]);
    expect(res.code).toBe(1);
    expect(res.out).toContain("READ FAILED");
    expect(r.u.bytes()).toBe(before);
    r.u.netlifyScript(null);
    expect(r.u.state().open_halts).toEqual([]);
  });

  it("claim after a direct push exits 3 via its reconcile read", () => {
    const b = base();
    b.u.publish("dep-direct", sha("cc"));
    const res = b.u.run(["claim", "--lane", "M", "--sha", sha("dd"), "--kind", "behaviour"]);
    expect(res.code).toBe(3);
    expect(b.u.count("halt")).toBe(1);
    expect(b.u.count("claim")).toBe(0);
  });
});

describe("ack lift", () => {
  it("direct push, ack, claim its SHA, green, release: the next release is GO; before the guard it is NO-GO", () => {
    const b = base();
    const direct = sha("cc");
    b.u.publish("dep-direct", direct);
    expect(b.u.run(["reconcile"]).code).toBe(3);
    expect(b.u.run(["ack-deploy", "--deploy", "dep-direct", "--lee", LEE]).code).toBe(0);
    const held = b.u.claim(direct);
    request(b.u, held, direct, b.parent);
    const pending = b.u.run(["check-push", "--token", String(held), "--pushed-sha", direct]);
    noGo(pending, "P6");
    noGo(pending, "P7");
    expect(b.u.guard("dep-direct", direct, "green", { token: held }).code).toBe(0);
    expect(b.u.run(["release", "--token", String(held)]).code).toBe(0);
    const tip = b.repo.commit("tip.txt", "tip\n");
    const token = b.u.claim(tip);
    request(b.u, token, tip, b.parent);
    go(b.u.run(["check-push", "--token", String(token), "--pushed-sha", tip]));
  });

  it("a deploy with a null commit_ref: claim --deploy, and null never matches null", () => {
    const b = base();
    const u = b.u;
    // A null ref known-good: published null must not read as a rollback to it.
    u.publish("dep-null", null);
    expect(u.run(["reconcile"]).code).toBe(3);
    u.run(["ack-deploy", "--deploy", "dep-null", "--lee", LEE]);
    u.run(["claim", "--lane", "M", "--deploy", "dep-null", "--kind", "behaviour"]);
    const held = u.state().token;
    expect(u.guard("dep-null", null, "green", { token: held }).code).toBe(0);
    u.run(["release", "--token", String(held)]);
    expect(u.state().known_good.deploy).toBe("dep-null");
    u.publish("dep-null2", null);
    expect(u.run(["reconcile"]).code).toBe(3);
    expect(u.count("rollback")).toBe(0);
  });
});

describe("rollback lift", () => {
  it("record-rollback: still halted; a green lifts it; known-good correct", () => {
    const b = base();
    const X = sha("ab");
    const token = b.u.deployed(X, "dep-x");
    b.u.guard("dep-x", X, "red", { token });
    expect(b.u.run(["record-rollback", "--token", String(token), "--deploy", "dep-genesis", "--lee", LEE]).code).toBe(0);
    b.u.publish("dep-genesis", b.parent);
    expect(b.u.state().open_halts).toHaveLength(1);
    expect(b.u.guard("dep-genesis", b.parent, "green", { token }).code).toBe(0);
    expect(b.u.state().open_halts).toEqual([]);
    expect(b.u.state().known_good.deploy).toBe("dep-genesis");
  });
});

describe("init", () => {
  function installed(): Base {
    const u = new Universe();
    const repo = u.repo();
    const parent = u.commitTool(repo);
    repo.pushMain();
    expect(u.run(["install", "--lee", "Lee: hook on"], { cwd: repo.dir }).code).toBe(0);
    u.publish("dep-live", parent);
    return { u, repo, parent };
  }

  it("empty state: genesis, carrying the first install's words, adopting the published deploy", () => {
    const { u, parent } = installed();
    const res = u.run(["init", "--evidence", "audit:live: 40 passed"]);
    expect(res.code, res.out).toBe(0);
    const [genesis] = u.records();
    expect(genesis.type).toBe("genesis");
    expect(genesis.deploy).toBe("dep-live");
    expect(genesis.sha).toBe(parent);
    expect(genesis.evidence).toBe("audit:live: 40 passed");
    expect((genesis.install as { lee: string }).lee).toBe("Lee: hook on");
    expect(u.state().known_good.deploy).toBe("dep-live");
  });

  it("a ledger exists: exit 2, unchanged", () => {
    const { u } = installed();
    u.run(["init", "--evidence", "first"]);
    const before = u.bytes();
    expect(u.run(["init", "--evidence", "second"]).code).toBe(2);
    expect(u.bytes()).toBe(before);
  });

  it("no install yet: exit 2", () => {
    const u = new Universe();
    expect(u.run(["init", "--evidence", "x"]).code).toBe(2);
    expect(fs.existsSync(u.ledgerPath)).toBe(false);
  });

  it("in flight: exit 2, no ledger", () => {
    const { u } = installed();
    u.deploys([{ id: "dep-z", state: "building", context: "production", commit_ref: null, created_at: new Date(T0 + HOUR).toISOString() }]);
    expect(u.run(["init", "--evidence", "x"]).code).toBe(2);
    expect(fs.existsSync(u.ledgerPath)).toBe(false);
  });

  it("the stranded March deploy does not stop it", () => {
    const { u } = installed();
    u.deploys([MARCH_NEW]);
    expect(u.run(["init", "--evidence", "x"]).code).toBe(0);
  });

  it("a failed read: exit 1, no ledger", () => {
    const { u } = installed();
    u.netlifyScript("exit 1\n");
    expect(u.run(["init", "--evidence", "x"]).code).toBe(1);
    expect(fs.existsSync(u.ledgerPath)).toBe(false);
  });

  function marvinRoot(u: Universe, ignore: string | null): string {
    const root = path.join(u.root, "marvin");
    fs.mkdirSync(root);
    expect(u.gitRun(u.root, ["init", "--quiet", root]).code).toBe(0);
    if (ignore) fs.writeFileSync(path.join(root, ".gitignore"), ignore);
    return root;
  }

  it("OC_RELEASE_MARVIN_ROOT repo without the ignores: exit 2; with them: passes", () => {
    const { u } = installed();
    const root = marvinRoot(u, null);
    const env = { OC_RELEASE_MARVIN_ROOT: root };
    expect(u.run(["init", "--evidence", "x"], { env }).code).toBe(2);
    expect(fs.existsSync(u.ledgerPath)).toBe(false);
    fs.writeFileSync(path.join(root, ".gitignore"), "state/opencanopy-release*\n");
    const res = u.run(["init", "--evidence", "x"], { env });
    expect(res.code, res.out).toBe(0);
  });

  it("install refuses without the ignores too", () => {
    const u = new Universe();
    const repo = u.repo();
    u.commitTool(repo);
    repo.pushMain();
    const root = marvinRoot(u, "state/opencanopy-release.lock\n");
    const res = u.run(["install", "--lee", LEE], { cwd: repo.dir, env: { OC_RELEASE_MARVIN_ROOT: root } });
    expect(res.code, res.out).toBe(2);
    expect(fs.existsSync(u.hookPath)).toBe(false);
    expect(spawnSync("git", ["-C", repo.dir, "config", "core.hooksPath"]).status).not.toBe(0);
  });
});

describe("install", () => {
  const hooksConfig = (repo: Git) => repo.git("config", "core.hooksPath");
  const installedBytes = (u: Universe, rel: string) => fs.readFileSync(path.join(u.toolDir, rel));
  const originBytes = (repo: Git, sha_: string, rel: string) =>
    spawnSync("git", ["-C", repo.dir, "show", `${sha_}:scripts/${rel}`]).stdout as Buffer;

  function fresh(): { u: Universe; repo: Git; base: string } {
    const u = new Universe();
    const repo = u.repo();
    const b = u.commitTool(repo);
    repo.pushMain();
    return { u, repo, base: b };
  }

  /** origin main moved past the worktree's HEAD by a commit changing tool bytes. */
  function originAhead(u: Universe, repo: Git, base: string): string {
    const lib = path.join(repo.dir, "scripts/lib/dir-mutex.mjs");
    const hook = path.join(repo.dir, "scripts/hooks/pre-push");
    fs.appendFileSync(lib, "// origin's version\n");
    fs.appendFileSync(hook, "# origin's version\n");
    const ahead = repo.commit("ahead.txt", "ahead\n");
    expect(u.gitRun(repo.dir, ["push", "--no-verify", "origin", `${ahead}:refs/heads/main`]).code).toBe(0);
    repo.git("reset", "--quiet", "--hard", base);
    return ahead;
  }

  it("no --lee, or empty words: exit 2, nothing installed", () => {
    const { u, repo } = fresh();
    expect(u.run(["install"], { cwd: repo.dir }).code).toBe(2);
    expect(u.run(["install", "--lee", "  "], { cwd: repo.dir }).code).toBe(2);
    expect(fs.existsSync(u.toolDir)).toBe(false);
  });

  it("installs from origin's exact SHA, sets an absolute hooks path in the fixture only, hook executable, installed.json written", () => {
    const { u, repo, base: b } = fresh();
    const res = u.run(["install", "--lee", LEE], { cwd: repo.dir });
    expect(res.code, res.out).toBe(0);
    expect(hooksConfig(repo)).toBe(path.join(u.toolDir, "hooks"));
    expect(path.isAbsolute(hooksConfig(repo))).toBe(true);
    fs.accessSync(u.hookPath, fs.constants.X_OK);
    for (const rel of TOOL_PATHS) expect(installedBytes(u, rel).equals(originBytes(repo, b, rel))).toBe(true);
    const recorded = JSON.parse(fs.readFileSync(path.join(u.toolDir, "installed.json"), "utf8"));
    expect(recorded.source_sha).toBe(b);
    expect(recorded.lee).toBe(LEE);
    expect(recorded.common_dir).toBe(path.join(repo.dir, ".git"));
    expect(fs.existsSync(path.join(u.home, ".gitconfig"))).toBe(false);
    expect(fs.readFileSync(u.notifyLog, "utf8")).toContain("install");
  });

  it("a worktree one commit behind: the installed bytes equal origin's, no downgrade", () => {
    const { u, repo, base: b } = fresh();
    u.run(["install", "--lee", LEE], { cwd: repo.dir });
    const ahead = originAhead(u, repo, b);
    expect(repo.head()).toBe(b);
    const res = u.run(["install", "--lee", LEE], { cwd: repo.dir });
    expect(res.code, res.out).toBe(0);
    expect(res.stdout).toContain(ahead);
    expect(installedBytes(u, "lib/dir-mutex.mjs").equals(originBytes(repo, ahead, "lib/dir-mutex.mjs"))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(u.toolDir, "installed.json"), "utf8")).source_sha).toBe(ahead);
  });

  it("a dirty tool file: the installed bytes equal origin's", () => {
    const { u, repo, base: b } = fresh();
    fs.appendFileSync(path.join(repo.dir, "scripts/lib/dir-mutex.mjs"), "// dirty\n");
    expect(u.run(["install", "--lee", LEE], { cwd: repo.dir }).code).toBe(0);
    expect(installedBytes(u, "lib/dir-mutex.mjs").equals(originBytes(repo, b, "lib/dir-mutex.mjs"))).toBe(true);
    expect(installedBytes(u, "lib/dir-mutex.mjs").toString()).not.toContain("dirty");
  });

  it("origin lacks the tool, one is installed: exit 2, the installed bytes stay", () => {
    const { u, repo } = fresh();
    u.run(["install", "--lee", LEE], { cwd: repo.dir });
    const before = installedBytes(u, "lib/dir-mutex.mjs");
    repo.git("rm", "--quiet", "-r", "scripts");
    repo.git("commit", "--quiet", "-m", "drop the tool");
    expect(u.gitRun(repo.dir, ["push", "--no-verify", "origin", "HEAD:refs/heads/main"]).code).toBe(0);
    repo.git("reset", "--quiet", "--hard", "HEAD~1");
    expect(u.run(["install", "--lee", LEE], { cwd: repo.dir }).code).toBe(2);
    expect(installedBytes(u, "lib/dir-mutex.mjs").equals(before)).toBe(true);
  });

  it("origin unreadable: refuses, even on the first install", () => {
    const { u, repo } = fresh();
    repo.git("remote", "set-url", "origin", path.join(u.root, "gone.git"));
    expect(u.run(["install", "--lee", LEE], { cwd: repo.dir }).code).toBe(1);
    expect(fs.existsSync(u.toolDir)).toBe(false);
  });

  it("first install: origin lacks the tool, so it uses the objects at HEAD, never the tree", () => {
    const u = new Universe();
    const repo = u.repo();
    const bare = repo.commit("readme.txt", "no tool\n");
    repo.pushMain();
    const tip = u.commitTool(repo);
    expect(tip).not.toBe(bare);
    fs.appendFileSync(path.join(repo.dir, "scripts/lib/dir-mutex.mjs"), "// dirty\n");
    const res = u.run(["install", "--lee", LEE], { cwd: repo.dir });
    expect(res.code, res.out).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(u.toolDir, "installed.json"), "utf8")).source_sha).toBe(tip);
    expect(installedBytes(u, "lib/dir-mutex.mjs").toString()).not.toContain("dirty");
  });

  it("a lease held: exit 2, prints the manual route, bytes unchanged", () => {
    const { u, repo, base: b } = fresh();
    u.run(["install", "--lee", LEE], { cwd: repo.dir });
    u.seed(1, "dep-genesis", b);
    u.claim(sha("cc"));
    originAhead(u, repo, b);
    const hook = installedBytes(u, "hooks/pre-push");
    const res = u.run(["install", "--lee", LEE], { cwd: repo.dir });
    expect(res.code).toBe(2);
    expect(res.out).toContain("remove the lease dir");
    expect(installedBytes(u, "hooks/pre-push").equals(hook)).toBe(true);
  });

  it("a common dir outside the temp root under the override: exit 2, that repo's config untouched", () => {
    const u = new Universe();
    const other = new Universe();
    const repo = other.repo();
    other.commitTool(repo);
    repo.pushMain();
    const res = u.run(["install", "--lee", LEE], { cwd: repo.dir });
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("temp root");
    expect(spawnSync("git", ["-C", repo.dir, "config", "core.hooksPath"]).status).not.toBe(0);
    expect(fs.existsSync(u.toolDir)).toBe(false);
  });

  it("a later run with a healthy ledger appends one install record; a bad ledger does not stop it", () => {
    const { u, repo, base: b } = fresh();
    u.run(["install", "--lee", LEE], { cwd: repo.dir });
    u.seed(1, "dep-genesis", b);
    expect(u.count("install")).toBe(0);
    const ahead = originAhead(u, repo, b);
    expect(u.run(["install", "--lee", LEE], { cwd: repo.dir }).code).toBe(0);
    expect(u.count("install")).toBe(1);
    expect(u.records().at(-1)?.source_sha).toBe(ahead);
    expect(u.run(["install", "--lee", LEE], { cwd: repo.dir }).code).toBe(0);
    expect(u.count("install")).toBe(1);
    fs.appendFileSync(u.ledgerPath, "{bad\n");
    const before = u.bytes();
    expect(u.run(["install", "--lee", "Lee: replace it"], { cwd: repo.dir }).code).toBe(0);
    expect(u.bytes()).toBe(before);
    expect(JSON.parse(fs.readFileSync(path.join(u.toolDir, "installed.json"), "utf8")).lee).toBe("Lee: replace it");
  });

  it("every file is renamed into place: a re-install gives the hook a new inode", () => {
    const { u, repo, base: b } = fresh();
    u.run(["install", "--lee", LEE], { cwd: repo.dir });
    originAhead(u, repo, b);
    const inode = fs.statSync(u.hookPath).ino;
    const keep = fs.readFileSync(u.hookPath); // Holds the old inode open against reuse.
    const fd = fs.openSync(u.hookPath, "r");
    expect(u.run(["install", "--lee", LEE], { cwd: repo.dir }).code).toBe(0);
    expect(fs.statSync(u.hookPath).ino).not.toBe(inode);
    fs.closeSync(fd);
    expect(keep.length).toBeGreaterThan(0);
  });

  it("OC_RELEASE_CRASH_AT=install-mid-copy: the old hook still present and executable, a re-run completes", () => {
    const { u, repo, base: b } = fresh();
    u.run(["install", "--lee", LEE], { cwd: repo.dir });
    const ahead = originAhead(u, repo, b);
    const oldHook = installedBytes(u, "hooks/pre-push");
    const crashed = u.run(["install", "--lee", LEE], { cwd: repo.dir, env: { OC_RELEASE_CRASH_AT: "install-mid-copy" } });
    expect(crashed.code).toBe(137);
    fs.accessSync(u.hookPath, fs.constants.X_OK);
    expect(installedBytes(u, "hooks/pre-push").equals(oldHook)).toBe(true);
    const recovery = u.run(["status"]);
    u.runPrintedRecovery(recovery.out.includes("rm -r") ? recovery.out : `rm -r ${u.mutexDir}`);
    const res = u.run(["install", "--lee", LEE], { cwd: repo.dir });
    expect(res.code, res.out).toBe(0);
    expect(installedBytes(u, "hooks/pre-push").equals(originBytes(repo, ahead, "hooks/pre-push"))).toBe(true);
    fs.accessSync(u.hookPath, fs.constants.X_OK);
  });

  it("a crash during the first install leaves no hooks path; a re-run from HEAD completes", () => {
    const { u, repo } = fresh();
    const crashed = u.run(["install", "--lee", LEE], { cwd: repo.dir, env: { OC_RELEASE_CRASH_AT: "install-mid-copy" } });
    expect(crashed.code).toBe(137);
    expect(spawnSync("git", ["-C", repo.dir, "config", "core.hooksPath"]).status).not.toBe(0);
    u.runPrintedRecovery(`rm -r ${u.mutexDir}`);
    expect(u.run(["install", "--lee", LEE], { cwd: repo.dir }).code).toBe(0);
    fs.accessSync(u.hookPath, fs.constants.X_OK);
  });
});

describe("await-live", () => {
  const live = (u: Universe, token: number, commit: string, source = "netlify", minutes = "0.005", env: Record<string, string> = {}) =>
    u.run(["await-live", "--token", String(token), "--sha", commit, "--source", source, "--timeout-min", minutes], {
      env: { ...FAST, ...env },
    });

  it("netlify: returns at the match and appends deploy, once", () => {
    const r = ready();
    r.u.publish("dep-tip", r.tip);
    const res = live(r.u, r.token, r.tip);
    expect(res.code, res.out).toBe(0);
    expect(res.stdout).toContain("dep-tip");
    const st = r.u.state();
    expect(st.current.deploy).toBe("dep-tip");
    expect(st.predecessor).toBeNull();
    expect(live(r.u, r.token, r.tip).code).toBe(0);
    expect(r.u.count("deploy")).toBe(1);
  });

  it("a wrong token or SHA is exit 2", () => {
    const r = ready();
    expect(live(r.u, r.token - 1, r.tip).code).toBe(2);
    expect(live(r.u, r.token, sha("cc")).code).toBe(2);
  });

  async function withServer<T>(body: () => string, run: (url: string) => Promise<T>): Promise<T> {
    const server = http.createServer((_req, res) => {
      res.setHeader("content-type", "text/html");
      res.end(body());
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      return await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  const page = (content: string) => `<html><head><meta name="oc-build" content="${content}"/></head></html>`;

  it("meta: the tag matching returns, with the deploy id from Netlify", async () => {
    const r = ready();
    r.u.publish("dep-tip", r.tip);
    await withServer(
      () => page(r.tip),
      async (url) => {
        const res = await r.u.runAsync(["await-live", "--token", String(r.token), "--sha", r.tip, "--source", "meta", "--timeout-min", "0.05"], {
          env: { ...FAST, OC_RELEASE_SITE_URL: url },
        });
        expect(res.code, res.out).toBe(0);
      },
    );
    expect(r.u.state().current.deploy).toBe("dep-tip");
  });

  it("meta: `local` until the fractional timeout: unverified on the deploy, halts", async () => {
    const r = ready();
    r.u.publish("dep-tip", r.tip);
    await withServer(
      () => page("local"),
      async (url) => {
        const res = await r.u.runAsync(["await-live", "--token", String(r.token), "--sha", r.tip, "--source", "meta", "--timeout-min", "0.01"], {
          env: { ...FAST, OC_RELEASE_SITE_URL: url },
        });
        expect(res.code, res.out).toBe(3);
        expect(res.out).toContain("NEW HALT");
      },
    );
    const st = r.u.state();
    expect(st.open_halts.map((h: { kind: string; deploy: string }) => [h.kind, h.deploy])).toEqual([["unverified", "dep-tip"]]);
    expect(st.known_good.deploy).toBe("dep-genesis");
  });

  it("netlify with no deploy by the timeout: unverified, null deploy; it later publishes, reconcile records it, green lifts", () => {
    const r = ready();
    const res = live(r.u, r.token, r.tip);
    expect(res.code).toBe(3);
    const rec = r.u.records().at(-1);
    expect(rec?.type).toBe("guard");
    expect(rec?.result).toBe("unverified");
    expect(rec?.deploy).toBeNull();
    expect(rec?.sha).toBe(r.tip);
    expect(live(r.u, r.token, r.tip).code).toBe(3);
    expect(r.u.count("guard")).toBe(1);
    r.u.publish("dep-tip", r.tip);
    expect(r.u.run(["reconcile"]).code).toBe(3);
    expect(r.u.state().current.deploy).toBe("dep-tip");
    expect(r.u.guard("dep-tip", r.tip, "green", { token: r.token }).code).toBe(0);
    const st = r.u.state();
    expect(st.open_halts).toEqual([]);
    expect(st.known_good.deploy).toBe("dep-tip");
  });

  it("state error: exits fast, build-failed, text says production unchanged", () => {
    const r = ready();
    r.u.deploys([{ id: "dep-bad", state: "error", context: "production", commit_ref: r.tip, created_at: new Date(T0).toISOString() }]);
    const res = live(r.u, r.token, r.tip, "netlify", "5");
    expect(res.code).toBe(3);
    expect(res.out).toContain("production is unchanged");
    expect(res.out).toContain("NEW HALT");
    expect(r.u.count("build-failed")).toBe(1);
    expect(r.u.state().open_halts.map((h: { kind: string }) => h.kind)).toEqual(["build-failed"]);
    expect(live(r.u, r.token, r.tip, "netlify", "5").code).toBe(3);
    expect(r.u.count("build-failed")).toBe(1);
  });

  it("an error on another commit, or a preview, does not fail this build", () => {
    const r = ready();
    r.u.deploys([
      { id: "dep-other", state: "error", context: "production", commit_ref: sha("cc"), created_at: new Date(T0).toISOString() },
      { id: "dep-prev", state: "error", context: "deploy-preview", commit_ref: r.tip, created_at: new Date(T0).toISOString() },
    ]);
    r.u.publish("dep-tip", r.tip);
    expect(live(r.u, r.token, r.tip).code).toBe(0);
    expect(r.u.count("build-failed")).toBe(0);
  });
});

describe("netlify-read: the request the real CLI receives", () => {
  it("getSite and listSiteDeploys carry the site id and per_page", () => {
    const r = ready();
    const log = path.join(r.u.root, "args.log");
    r.u.netlifyScript(`printf '%s %s %s\\n' "$1" "$2" "$4" >> '${log}'\n`);
    go(r.check());
    const lines = fs.readFileSync(log, "utf8");
    expect(lines).toContain(`api getSite {"site_id":"6b007878-a00d-4ada-86d4-5cf84e9acc2a"}`);
    expect(lines).toContain(`api listSiteDeploys {"site_id":"6b007878-a00d-4ada-86d4-5cf84e9acc2a","per_page":20}`);
  });
});

describe("git reads bind to the recorded repo", () => {
  it("check-push from another directory reads the recorded repo's origin", () => {
    const r = ready();
    go(r.u.run(["check-push", "--token", String(r.token), "--pushed-sha", r.tip], { cwd: r.u.root }));
  });

  it("record-push from another directory reads the recorded repo's origin", () => {
    const r = ready();
    expect(r.u.gitRun(r.repo.dir, ["push", "origin", `${r.tip}:refs/heads/main`], { OC_RELEASE_TOKEN: String(r.token) }).code).toBe(0);
    const res = r.u.run(["record-push", "--token", String(r.token), "--sha", r.tip], { cwd: r.u.root });
    expect(res.code, res.out).toBe(0);
  });

  it("summary --unrecorded from another directory reads the recorded repo's handoff", () => {
    const r = ready();
    r.u.publish("dep-tip", r.tip);
    r.u.run(["reconcile"]);
    r.u.guard("dep-tip", r.tip, "green", { token: r.token });
    r.u.run(["release", "--token", String(r.token)]);
    const res = r.u.run(["summary", "--unrecorded"], { cwd: r.u.root });
    expect(res.code, res.out).toBe(0);
    expect(res.stdout).toContain(r.tip);
  });
});
