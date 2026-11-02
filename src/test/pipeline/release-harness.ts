/**
 * Harness for the release tool's subprocess tests: a temp state dir and fake HOME,
 * a spawn helper with a scrubbed environment, a bare-origin fixture and a fake
 * netlify bin. Nothing here may ever reach the real ledger or the real .git config.
 */
import { ChildProcessByStdio, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

export const CLI = path.resolve(__dirname, "../../../scripts/release-ledger.mjs");
export const MUTEX_LIB = path.resolve(__dirname, "../../../scripts/lib/dir-mutex.mjs");
const SCRIPTS = path.resolve(__dirname, "../../../scripts");
/** Every path `install` copies, relative to scripts/. Read from disk so a mutant is what gets installed. */
export const TOOL_PATHS = ["release-ledger.mjs", "lib/dir-mutex.mjs", "lib/release-state.mjs", "lib/netlify-read.mjs", "hooks/pre-push"];

export const T0 = Date.parse("2026-11-01T12:00:00.000Z");
export const HOUR = 60 * 60 * 1000;
export const LEE = "Lee, in this conversation: yes";

/** A 40-char fake SHA from a short label. */
export const sha = (label: string): string => label.padEnd(40, "0");

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  out: string;
}

export interface RunOptions {
  env?: Record<string, string>;
  unset?: string[];
  cwd?: string;
}

function scrubbedBase(): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key.startsWith("GIT_") || key.startsWith("OC_RELEASE_")) continue;
    base[key] = value;
  }
  return base;
}

/** Next's types make NODE_ENV required on ProcessEnv; these maps are complete environments. */
const asEnv = (env: Record<string, string>) => env as unknown as NodeJS.ProcessEnv;

function toResult(status: number | null, stdout: string, stderr: string): RunResult {
  return { code: status ?? 137, stdout, stderr, out: `${stdout}\n${stderr}` };
}

function collect(child: ChildProcessByStdio<null, Readable, Readable>): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (status) => resolve(toResult(status, stdout, stderr)));
  });
}

const roots: string[] = [];

export function cleanupUniverses(): void {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
}

export interface Git {
  dir: string;
  origin: string;
  git(...args: string[]): string;
  commit(file: string, content: string): string;
  pushMain(): void;
  head(): string;
}

export class Universe {
  readonly root = fs.mkdtempSync(path.join(os.tmpdir(), "oc-release-"));
  readonly home = path.join(this.root, "home");
  readonly stateDir = path.join(this.root, "state");
  readonly binDir = path.join(this.root, "bin");
  readonly ledgerPath = path.join(this.stateDir, "opencanopy-releases.jsonl");
  readonly leaseDir = path.join(this.stateDir, "opencanopy-release.lock");
  readonly leaseFile = path.join(this.leaseDir, "lease.json");
  readonly mutexDir = path.join(this.stateDir, "opencanopy-release.mutex");
  readonly notifyLog = path.join(this.root, "notify.log");
  readonly notifyFail = path.join(this.root, "notify-fail");
  readonly toolDir = path.join(this.stateDir, "opencanopy-release-tool");
  readonly hookPath = path.join(this.toolDir, "hooks", "pre-push");
  private readonly siteFile = path.join(this.root, "site.json");
  private readonly deploysFile = path.join(this.root, "deploys.json");
  private readonly netlifyScriptFile = path.join(this.root, "netlify-script.sh");
  private evidenceCount = 0;
  /** The fake clock; each CLI run sees it, then it moves one second. */
  now = T0;

  constructor() {
    roots.push(this.root);
    fs.mkdirSync(this.home, { recursive: true });
    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.mkdirSync(this.binDir, { recursive: true });
    const netlify = path.join(this.binDir, "netlify");
    fs.writeFileSync(
      netlify,
      `#!/bin/sh\n[ -f '${this.netlifyScriptFile}' ] && . '${this.netlifyScriptFile}'\ncase "$2" in\n  listSiteDeploys) cat '${this.deploysFile}' ;;\n  *) cat '${this.siteFile}' ;;\nesac\n`,
      { mode: 0o755 },
    );
    fs.writeFileSync(this.deploysFile, "[]");
    const notify = path.join(this.binDir, "notify");
    fs.writeFileSync(
      notify,
      `#!/bin/sh\nprintf '%s\\n' "$1" >> '${this.notifyLog}'\n[ -e '${this.notifyFail}' ] && exit 7\nexit 0\n`,
      { mode: 0o755 },
    );
    this.publish("dep-none", null);
  }

  env(opts: RunOptions = {}): Record<string, string> {
    const env: Record<string, string> = {
      ...scrubbedBase(),
      PATH: `${this.binDir}:${process.env.PATH}`,
      HOME: this.home,
      VITEST: "true",
      OC_RELEASE_STATE_DIR: this.stateDir,
      OC_RELEASE_NETLIFY_BIN: path.join(this.binDir, "netlify"),
      OC_RELEASE_NOTIFY_BIN: path.join(this.binDir, "notify"),
      OC_RELEASE_NOW: new Date(this.now).toISOString(),
      ...opts.env,
    };
    for (const name of opts.unset ?? []) delete env[name];
    return env;
  }

  run(args: string[], opts: RunOptions = {}): RunResult {
    const res = spawnSync(process.execPath, [CLI, ...args], {
      env: asEnv(this.env(opts)),
      cwd: opts.cwd ?? this.root,
      encoding: "utf8",
      // spawnSync blocks vitest's own timeout, so a hung tool must be killed here.
      timeout: 25_000,
    });
    this.now += 1000;
    return toResult(res.status, res.stdout, res.stderr);
  }

  runAsync(args: string[], opts: RunOptions = {}): Promise<RunResult> {
    return collect(
      spawn(process.execPath, [CLI, ...args], {
        env: asEnv(this.env(opts)),
        cwd: opts.cwd ?? this.root,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  }

  /** What the fake netlify bin answers as the published deploy. */
  publish(id: string, commitRef: string | null, extra: Record<string, unknown> = {}): void {
    const published = {
      id,
      state: "ready",
      commit_ref: commitRef,
      context: "production",
      created_at: new Date(this.now).toISOString(),
      ...extra,
    };
    fs.writeFileSync(this.siteFile, JSON.stringify({ published_deploy: published }));
  }

  /** What the fake netlify bin answers to listSiteDeploys. */
  deploys(list: Array<Record<string, unknown>>): void {
    fs.writeFileSync(this.deploysFile, JSON.stringify(list));
  }

  /** Shell sourced by the fake netlify bin before it answers; `$2` is the API method. */
  netlifyScript(body: string | null): void {
    if (body === null) fs.rmSync(this.netlifyScriptFile, { force: true });
    else fs.writeFileSync(this.netlifyScriptFile, body);
  }

  /** The fixture's starting point. `init` itself arrives in P0b-3. */
  seed(token = 1, deploy = "dep-genesis", commit: string | null = sha("9")): void {
    this.appendRecord({ type: "genesis", token, deploy, sha: commit, evidence: "fixture" });
    this.publish(deploy, commit);
  }

  appendRecord(fields: Record<string, unknown>): void {
    const line = { v: 1, ts: new Date(this.now).toISOString(), ...fields };
    fs.appendFileSync(this.ledgerPath, `${JSON.stringify(line)}\n`);
    this.now += 1000;
  }

  records(): Array<Record<string, unknown>> {
    return fs
      .readFileSync(this.ledgerPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  }

  count(type: string): number {
    return this.records().filter((r) => r.type === type).length;
  }

  bytes(): string {
    return fs.readFileSync(this.ledgerPath, "utf8");
  }

  leaseBytes(): string | null {
    return fs.existsSync(this.leaseFile) ? fs.readFileSync(this.leaseFile, "utf8") : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state(): any {
    const res = this.run(["status", "--json"]);
    return JSON.parse(res.stdout);
  }

  /** Evidence naming `name`, with an mtime of the fake clock (newer than any record so far). */
  evidence(name: string, mtimeMs = this.now): string {
    this.evidenceCount += 1;
    const file = path.join(this.root, `evidence-${this.evidenceCount}.txt`);
    fs.writeFileSync(file, `checks passed against ${name}\n`);
    fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
    return file;
  }

  /** Claim a SHA; returns the token. Throws on anything but success. */
  claim(commit: string, kind = "behaviour", lane = "M"): number {
    const res = this.run(["claim", "--lane", lane, "--sha", commit, "--kind", kind]);
    if (res.code !== 0) throw new Error(`claim failed: ${res.out}`);
    return Number(/token=(\d+)/.exec(res.stdout)?.[1]);
  }

  /** The published deploy moves to (id, commit) and reconcile records it. */
  land(id: string, commit: string | null): RunResult {
    this.publish(id, commit);
    return this.run(["reconcile"]);
  }

  /** Claim and land: returns the token, with the deploy current and pending. */
  deployed(commit: string, id: string, kind = "behaviour"): number {
    const token = this.claim(commit, kind);
    const res = this.land(id, commit);
    if (res.code !== 0) throw new Error(`land failed: ${res.out}`);
    return token;
  }

  guard(
    id: string,
    commit: string | null,
    result: string,
    opts: { token?: number; lee?: string; evidence?: string } = {},
  ): RunResult {
    const args = ["guard", "--deploy", id, "--result", result];
    args.push("--evidence", opts.evidence ?? this.evidence(id));
    if (commit !== null) args.push("--sha", commit);
    if (opts.token !== undefined) args.push("--token", String(opts.token));
    if (opts.lee !== undefined) args.push("--lee", opts.lee);
    return this.run(args);
  }

  /** A mutex held by this live test process. */
  holdMutex(): void {
    const stat = fs.readFileSync(`/proc/${process.pid}/stat`, "utf8");
    const startTicks = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    fs.mkdirSync(this.mutexDir);
    fs.writeFileSync(
      path.join(this.mutexDir, "owner"),
      JSON.stringify({ pid: process.pid, startTicks, ts: "test", nonce: "test" }),
    );
  }

  /** A mutex whose owner file holds exactly these bytes. */
  plantMutex(ownerBytes: string): void {
    fs.mkdirSync(this.mutexDir);
    fs.writeFileSync(path.join(this.mutexDir, "owner"), ownerBytes);
  }

  /** Runs exactly the `rm -r` the tool printed, through a shell. */
  runPrintedRecovery(out: string): void {
    const printed = /^\s*(rm -r \S+)\s*$/m.exec(out);
    if (!printed) throw new Error(`no rm -r printed: ${out}`);
    const res = spawnSync("sh", ["-c", printed[1]], { encoding: "utf8" });
    if (res.status !== 0) throw new Error(`recovery failed: ${res.stderr}`);
  }

  /** A work tree with a bare origin, all git run scrubbed and under the fake HOME. */
  repo(): Git {
    const origin = path.join(this.root, "origin.git");
    const dir = path.join(this.root, "work");
    const env = asEnv({ ...scrubbedBase(), HOME: this.home });
    const git = (...args: string[]): string => {
      const res = spawnSync("git", ["-c", "user.name=Fixture", "-c", "user.email=f@example.invalid", ...args], {
        cwd: fs.existsSync(dir) ? dir : this.root,
        env,
        encoding: "utf8",
      });
      if (res.status !== 0) throw new Error(`git ${args.join(" ")}: ${res.stderr}`);
      return res.stdout.trim();
    };
    git("init", "--quiet", "--bare", "--initial-branch=main", origin);
    git("init", "--quiet", "--initial-branch=main", dir);
    git("remote", "add", "origin", origin);
    const head = () => git("rev-parse", "HEAD");
    const commit = (file: string, content: string): string => {
      const full = path.join(dir, file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      git("add", "--all");
      git("commit", "--quiet", "-m", `change ${file}`);
      return head();
    };
    const pushMain = () => {
      git("push", "--quiet", "origin", "HEAD:refs/heads/main");
    };
    return { dir, origin, git, commit, pushMain, head };
  }

  /** Commits the real tool (the bytes on disk, so a mutant) into a fixture repo. */
  commitTool(repo: Git): string {
    for (const rel of TOOL_PATHS) {
      const dest = path.join(repo.dir, "scripts", rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(SCRIPTS, rel), dest);
    }
    return repo.commit("app.txt", "base\n");
  }

  /** Real git in this universe's environment, so a hook sees the override. Returns the result. */
  gitRun(cwd: string, args: string[], env: Record<string, string> = {}): RunResult {
    const res = spawnSync("git", args, { cwd, env: asEnv(this.env({ env })), encoding: "utf8", timeout: 25_000 });
    return toResult(res.status, res.stdout, res.stderr);
  }
}

/** Spawns a node ES module body, for driving a library the way a caller would. */
export function runModule(source: string, env: Record<string, string> = {}): Promise<RunResult> {
  return collect(
    spawn(process.execPath, ["--input-type=module", "-e", source], {
      env: asEnv({ ...scrubbedBase(), ...env }),
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}
