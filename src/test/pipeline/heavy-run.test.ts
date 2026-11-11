// @vitest-environment node
/**
 * HEAVY: scripts/heavy-run.mjs, the heavy-build lock. Every case runs the real launcher
 * as a subprocess against a temp OC_HEAVY_STATE_DIR (never ~/marvin/state), with real
 * short children, synchronised on barrier files.
 *
 * Every launcher is awaited on its `exit` event, never `close` and never spawnSync with
 * pipes: both wait for a backgrounded child's inherited pipes, so the lock would already
 * read free when the check runs (critic r3, measured). The launcher's stderr goes to a
 * file instead of a pipe for the same reason; Node writes stderr to a file synchronously,
 * so the file is complete when `exit` fires.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

const CLI = path.resolve(__dirname, "../../../scripts/heavy-run.mjs");
const NODE = process.execPath;
const FLOOR_KB = 16_777_216;

/* ---------- harness ---------- */

const roots: string[] = [];
const launcherGroups = new Set<number>();

afterEach(() => {
  // Kill every group a test may have left: launchers (each spawned as its own group),
  // and every command group or detached child that recorded itself in a .pgid file.
  const targets = new Set<number>(launcherGroups);
  for (const root of roots) {
    for (const f of fs.readdirSync(root)) {
      if (!f.endsWith(".pgid")) continue;
      const n = Number(fs.readFileSync(path.join(root, f), "utf8").trim());
      if (Number.isInteger(n) && n > 1) targets.add(n);
    }
  }
  for (const pgid of targets) {
    for (const target of [-pgid, pgid]) {
      try {
        process.kill(target, "SIGKILL");
      } catch {
        // already gone: the normal case
      }
    }
  }
  launcherGroups.clear();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const meminfo = (kb: number) => `MemTotal:       32000000 kB\nMemFree:          100000 kB\nMemAvailable:   ${kb} kB\n`;

class Universe {
  readonly root: string;
  readonly state: string;
  readonly lock: string;
  readonly sidecar: string;
  readonly memOk: string;
  readonly memBelow: string;
  readonly memAt: string;

  constructor() {
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), "heavy-run-test-"));
    roots.push(this.root);
    this.state = path.join(this.root, "st");
    fs.mkdirSync(this.state);
    this.lock = path.join(this.state, "heavy-build.lock");
    this.sidecar = `${this.lock}.json`;
    this.memOk = this.write("mem-ok", meminfo(FLOOR_KB + 4_000_000));
    this.memBelow = this.write("mem-below", meminfo(FLOOR_KB - 1));
    this.memAt = this.write("mem-at", meminfo(FLOOR_KB));
  }

  write(name: string, content: string): string {
    const p = path.join(this.root, name);
    fs.writeFileSync(p, content);
    return p;
  }

  p(name: string): string {
    return path.join(this.root, name);
  }

  exists(name: string): boolean {
    return fs.existsSync(this.p(name));
  }

  touch(name: string): void {
    fs.writeFileSync(this.p(name), "");
  }

  /**
   * A shell command that records its group, signals `<name>.ready`, then holds until
   * `<name>.go` exists (bounded, so nothing outlives a broken test by more than 30 s).
   */
  hold(name: string): string[] {
    const q = (s: string) => `'${s}'`;
    return [
      "sh",
      "-c",
      `echo $$ > ${q(this.p(`${name}.pgid`))}; touch ${q(this.p(`${name}.ready`))}; ` +
        `i=0; while [ ! -e ${q(this.p(`${name}.go`))} ] && [ $i -lt 600 ]; do sleep 0.05; i=$((i+1)); done`,
    ];
  }

  /** 0 when the lock is free, 240 when someone holds it. */
  probe(): number | null {
    return spawnSync("flock", ["--nonblock", "--conflict-exit-code", "240", this.lock, "true"], { stdio: "ignore" })
      .status;
  }
}

interface Env {
  env?: Record<string, string>;
  unset?: string[];
}

interface Launched {
  pid: number;
  errPath: string;
  done: Promise<Result>;
  stderr(): string;
}

interface Result {
  code: number;
  stderr: string;
}

let seq = 0;

function environment(u: Universe, opts: Env): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("OC_HEAVY_")) env[k] = v;
  }
  env.VITEST = "1";
  env.OC_HEAVY_STATE_DIR = u.state;
  env.OC_HEAVY_MEMINFO = u.memOk;
  Object.assign(env, opts.env ?? {});
  for (const k of opts.unset ?? []) delete env[k];
  return env as unknown as NodeJS.ProcessEnv;
}

function launch(u: Universe, args: string[], opts: Env = {}): Launched {
  const errPath = u.p(`launcher-${++seq}.err`);
  const errFd = fs.openSync(errPath, "w");
  const child = spawn(NODE, [CLI, ...args], {
    stdio: ["ignore", "ignore", errFd],
    env: environment(u, opts),
    detached: true,
  });
  fs.closeSync(errFd);
  if (child.pid === undefined) throw new Error("launcher did not start");
  launcherGroups.add(child.pid);
  const stderr = () => {
    try {
      return fs.readFileSync(errPath, "utf8");
    } catch {
      return "<stderr file removed by cleanup>"; // only after afterEach killed a straggler
    }
  };
  const done = new Promise<Result>((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      resolve({ code: code ?? 128 + os.constants.signals[signal as NodeJS.Signals], stderr: stderr() }),
    );
  });
  return { pid: child.pid, errPath, done, stderr };
}

const run = (u: Universe, args: string[], opts: Env = {}): Promise<Result> => launch(u, args, opts).done;

async function waitFor(what: string, cond: () => boolean, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Alive and not a zombie. */
function alive(pid: number): boolean {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2)[0] !== "Z";
  } catch {
    return false;
  }
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
  } catch {
    return false;
  }
  return fs
    .readdirSync("/proc")
    .filter((d) => /^\d+$/.test(d))
    .some((d) => {
      try {
        const stat = fs.readFileSync(`/proc/${d}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        return Number(fields[2]) === pgid && fields[0] !== "Z";
      } catch {
        return false;
      }
    });
}

const refusals = (stderr: string) => stderr.split("\n").filter((l) => l.startsWith("heavy-run: REFUSED"));
const sidecar = (u: Universe) => JSON.parse(fs.readFileSync(u.sidecar, "utf8"));

/* ---------- 1-4: the lock itself ---------- */

describe("the lock", () => {
  it("1. a held lock is respected, and runs once released (mutant: no flock call)", async () => {
    const u = new Universe();
    const a = launch(u, ["--job", "A", "--", ...u.hold("a")]);
    await waitFor("A ready", () => u.exists("a.ready"));

    const b = await run(u, ["--job", "B", "--", "sh", "-c", `touch '${u.p("b.ran")}'`]);
    expect(b.code, b.stderr).toBe(240);
    expect(b.stderr).toContain("heavy-run: REFUSED 240 lock held");
    expect(b.stderr).toContain(`fuser -v ${u.lock}`);
    expect(b.stderr).toContain("job A");
    expect(u.exists("b.ran")).toBe(false);

    u.touch("a.go");
    expect((await a.done).code).toBe(0);
    const again = await run(u, ["--job", "B", "--", "sh", "-c", `touch '${u.p("b.ran")}'`]);
    expect(again.code, again.stderr).toBe(0);
    expect(u.exists("b.ran")).toBe(true);
  });

  it("2. a backgrounded build keeps the lock after its top process exits (mutant: plain inheritance)", async () => {
    const u = new Universe();
    const bg = `echo $$ > '${u.p("bg.pgid")}'; (touch '${u.p("bg.ready")}'; i=0; while [ ! -e '${u.p("bg.go")}' ] && [ $i -lt 600 ]; do sleep 0.05; i=$((i+1)); done) & exit 0`;
    const a = await run(u, ["--job", "A", "--", "sh", "-c", bg]);
    expect(a.code, a.stderr).toBe(0);
    await waitFor("background child ready", () => u.exists("bg.ready"));

    expect(u.probe()).toBe(240);
    const b = await run(u, ["--job", "B", "--", "true"]);
    expect(b.code, b.stderr).toBe(240);
    // The top process exited, so its sidecar is gone; the refusal says so and points at fuser.
    expect(fs.existsSync(u.sidecar)).toBe(false);
    expect(b.stderr).toContain("no sidecar");

    u.touch("bg.go");
    const pgid = Number(fs.readFileSync(u.p("bg.pgid"), "utf8"));
    await waitFor("background child gone", () => !groupAlive(pgid));
    expect(u.probe()).toBe(0);
  });

  it("3. a killed build releases the lock at once (regression guard)", async () => {
    const u = new Universe();
    const a = launch(u, ["--job", "A", "--", ...u.hold("a")]);
    await waitFor("A ready", () => u.exists("a.ready"));
    await waitFor("sidecar", () => fs.existsSync(u.sidecar));
    const { pgid } = sidecar(u);
    expect(u.probe()).toBe(240);

    process.kill(a.pid, "SIGKILL");
    process.kill(-pgid, "SIGKILL");
    await a.done;
    await waitFor("command group gone", () => !groupAlive(pgid));
    const b = await run(u, ["--job", "B", "--", "true"]);
    expect(b.code, b.stderr).toBe(0);
  });

  it("4. a lost launcher's surviving command keeps the lock (mutant: plain inheritance)", async () => {
    const u = new Universe();
    const a = launch(u, ["--job", "A", "--", ...u.hold("a")]);
    await waitFor("A ready", () => u.exists("a.ready"));
    await waitFor("sidecar", () => fs.existsSync(u.sidecar));
    const { pgid } = sidecar(u);

    // Every process on the launcher side: the launcher's own group holds only the launcher.
    process.kill(-a.pid, "SIGKILL");
    await a.done;
    expect(groupAlive(pgid)).toBe(true);

    const b = await run(u, ["--job", "B", "--", "true"]);
    expect(b.code, b.stderr).toBe(240);

    u.touch("a.go");
    await waitFor("command gone", () => !groupAlive(pgid));
    expect(u.probe()).toBe(0);
  });
});

/* ---------- 5-6: memory and racers ---------- */

describe("memory floor", () => {
  it("5. one kB under 16 GiB refuses 241, starts nothing and releases; exactly 16 GiB runs; unreadable is 241 (mutant: <=)", async () => {
    const u = new Universe();
    const below = await run(u, ["--job", "A", "--", "sh", "-c", `touch '${u.p("started")}'`], {
      env: { OC_HEAVY_MEMINFO: u.memBelow },
    });
    expect(below.code, below.stderr).toBe(241);
    expect(below.stderr).toContain("heavy-run: REFUSED 241");
    expect(below.stderr).toContain(`${FLOOR_KB - 1} kB`);
    expect(u.exists("started")).toBe(false);
    expect(fs.existsSync(u.sidecar)).toBe(false);
    expect(u.probe()).toBe(0);
    const third = await run(u, ["--job", "C", "--", "true"]);
    expect(third.code, third.stderr).toBe(0);

    const at = await run(u, ["--job", "A", "--", "sh", "-c", `touch '${u.p("at.ran")}'`], {
      env: { OC_HEAVY_MEMINFO: u.memAt },
    });
    expect(at.code, at.stderr).toBe(0);
    expect(u.exists("at.ran")).toBe(true);

    const unreadable = await run(u, ["--job", "A", "--", "true"], { env: { OC_HEAVY_MEMINFO: u.p("no-such-meminfo") } });
    expect(unreadable.code, unreadable.stderr).toBe(241);
    expect(unreadable.stderr).toContain("unreadable or unparseable");

    const garbled = await run(u, ["--job", "A", "--", "true"], {
      env: { OC_HEAVY_MEMINFO: u.write("mem-garbled", "MemTotal: 1 kB\nMemAvailable: lots\n") },
    });
    expect(garbled.code, garbled.stderr).toBe(241);
    expect(u.probe()).toBe(0);
  });

  it("6. two racers on a free lock: exactly one runs, the other is 240 (regression guard)", async () => {
    const u = new Universe();
    const cmd = (name: string) => [
      "sh",
      "-c",
      `touch '${u.p(`${name}.ran`)}'; ${u.hold(name)[2]}`,
    ];
    const x = launch(u, ["--job", "X", "--", ...cmd("x")]);
    const y = launch(u, ["--job", "Y", "--", ...cmd("y")]);
    const first = await Promise.race([x.done, y.done]);
    expect(first.code, first.stderr).toBe(240);
    await waitFor("the winner's command", () => u.exists("x.ready") || u.exists("y.ready"));
    expect([u.exists("x.ran"), u.exists("y.ran")].filter(Boolean)).toHaveLength(1);
    u.touch("x.go");
    u.touch("y.go");
    const codes = [(await x.done).code, (await y.done).code].sort();
    expect(codes).toEqual([0, 240]);
  });
});

/* ---------- 7-9: sidecar, exit status, signals ---------- */

describe("sidecar, exit status and signals", () => {
  it("7. a run removes its own sidecar but never a foreign one; a malformed one decides nothing (mutant: unconditional removal)", async () => {
    const u = new Universe();
    const own = launch(u, ["--job", "A", "--", ...u.hold("own")]);
    await waitFor("sidecar", () => fs.existsSync(u.sidecar));
    const record = sidecar(u);
    expect(record).toMatchObject({ job: "A", pid: own.pid, host: os.hostname(), command: u.hold("own") });
    expect(Number.isInteger(record.pgid)).toBe(true);
    expect(Number.isNaN(Date.parse(record.startedAt))).toBe(false);
    u.touch("own.go");
    expect((await own.done).code).toBe(0);
    expect(fs.existsSync(u.sidecar)).toBe(false);

    const a = launch(u, ["--job", "A", "--", ...u.hold("a")]);
    await waitFor("sidecar", () => fs.existsSync(u.sidecar));
    const foreign = '{"job":"foreign","pid":1,"pgid":1,"host":"elsewhere","startedAt":"2026-01-01T00:00:00.000Z"}\n';
    fs.writeFileSync(u.sidecar, foreign);
    u.touch("a.go");
    expect((await a.done).code).toBe(0);
    expect(fs.readFileSync(u.sidecar, "utf8")).toBe(foreign);

    fs.writeFileSync(u.sidecar, "not json{");
    const held = launch(u, ["--job", "H", "--", ...u.hold("h")]);
    await waitFor("H ready", () => u.exists("h.ready"));
    const refused = await run(u, ["--job", "B", "--", "true"]);
    expect(refused.code, refused.stderr).toBe(240);
    expect(refused.stderr).toContain("sidecar");
    u.touch("h.go");
    expect((await held.done).code).toBe(0);
    fs.writeFileSync(u.sidecar, "not json{");
    const free = await run(u, ["--job", "B", "--", "true"]);
    expect(free.code, free.stderr).toBe(0);
  });

  it("8. the command's exit passes through, and a killed command is 128 plus the signal (mutant: null as 0)", async () => {
    const u = new Universe();
    const seven = await run(u, ["--job", "A", "--", "sh", "-c", "exit 7"]);
    expect(seven.code).toBe(7);
    expect(seven.stderr).toContain("heavy-run: command exited 7");
    expect(refusals(seven.stderr)).toEqual([]);

    const killed = await run(u, ["--job", "A", "--", "sh", "-c", "kill -9 $$"]);
    expect(killed.code).toBe(137);
    expect(killed.stderr).toContain("heavy-run: command exited 137");

    const ok = await run(u, ["--job", "A", "--", "true"]);
    expect(ok.code).toBe(0);
    expect(ok.stderr).toBe("");
  });

  it("9. SIGTERM to the launcher reaches a grandchild in the command's group (mutant: direct child only)", async () => {
    const u = new Universe();
    const script = `echo $$ > '${u.p("cmd.pgid")}'; sleep 30 & echo $! > '${u.p("gc.pid")}'; wait`;
    const a = launch(u, ["--job", "A", "--", "sh", "-c", script]);
    await waitFor("grandchild", () => u.exists("gc.pid") && fs.readFileSync(u.p("gc.pid"), "utf8").trim() !== "");
    await waitFor("sidecar", () => fs.existsSync(u.sidecar));
    const gc = Number(fs.readFileSync(u.p("gc.pid"), "utf8"));
    expect(alive(gc)).toBe(true);

    process.kill(a.pid, "SIGTERM");
    const res = await a.done;
    expect(res.code, res.stderr).toBe(143);
    await waitFor("grandchild terminated", () => !alive(gc), 5_000);
  });
});

/* ---------- 10, 12, 13: refusals that start nothing ---------- */

describe("refusals that start nothing", () => {
  it("10. arguments, path guard, unopenable lock path and a missing command are 244, start nothing, leave no sidecar, and are never retried (regression guard)", async () => {
    const u = new Universe();
    const marker = `touch '${u.p("started")}'`;
    const fakeHome = fs.mkdtempSync(path.join(u.root, "home-"));
    fs.mkdirSync(u.p("dirstate"));
    fs.mkdirSync(path.join(u.p("dirstate"), "heavy-build.lock"));
    const cases: [string, string[], Env][] = [
      ["no --job", ["--", "sh", "-c", marker], {}],
      ["--job without a name", ["--job", "--", "sh", "-c", marker], {}],
      ["no --", ["--job", "A", "sh", "-c", marker], {}],
      ["no command", ["--job", "A", "--"], {}],
      ["unknown flag", ["--job", "A", "--wait", "--", "sh", "-c", marker], {}],
      ["VITEST without override", ["--job", "A", "--", "sh", "-c", marker], { unset: ["OC_HEAVY_STATE_DIR"] }],
      [
        "override inside the real state dir",
        ["--job", "A", "--", "sh", "-c", marker],
        { env: { OC_HEAVY_STATE_DIR: path.join(os.userInfo().homedir, "marvin", "state", "heavy-run-test-never-created") } },
      ],
      [
        "override without VITEST",
        ["--job", "A", "--", "sh", "-c", marker],
        { unset: ["VITEST", "OC_HEAVY_MEMINFO"], env: { HOME: fakeHome } },
      ],
      [
        "meminfo seam without VITEST",
        ["--job", "A", "--", "sh", "-c", marker],
        { unset: ["VITEST", "OC_HEAVY_STATE_DIR"], env: { HOME: fakeHome } },
      ],
      [
        "interval seam without VITEST",
        ["--job", "A", "--", "sh", "-c", marker],
        { unset: ["VITEST", "OC_HEAVY_STATE_DIR", "OC_HEAVY_MEMINFO"], env: { HOME: fakeHome, OC_HEAVY_INTERVAL_MS: "10" } },
      ],
      ["state dir missing", ["--job", "A", "--", "sh", "-c", marker], { env: { OC_HEAVY_STATE_DIR: u.p("no-such-dir") } }],
      ["lock path is a directory", ["--job", "A", "--", "sh", "-c", marker], { env: { OC_HEAVY_STATE_DIR: u.p("dirstate") } }],
      ["missing command", ["--job", "A", "--", u.p("no-such-command")], {}],
    ];
    for (const [label, args, opts] of cases) {
      for (const retry of [false, true]) {
        const argv = retry ? ["--retry", ...args] : args;
        // Under VITEST a short interval keeps a wrongly retried 244 a fast red, not a timeout;
        // the cases without VITEST carry only the seam they test.
        const interval: Record<string, string> = opts.unset?.includes("VITEST") ? {} : { OC_HEAVY_INTERVAL_MS: "10" };
        const res = await run(u, argv, { ...opts, env: { ...interval, ...opts.env } });
        expect(res.code, `${label} retry=${retry}: ${res.stderr}`).toBe(244);
        expect(refusals(res.stderr), label).toHaveLength(1);
        expect(res.stderr, label).toContain("heavy-run: REFUSED 244");
        expect(res.stderr, label).not.toContain("giving up");
        expect(u.exists("started"), label).toBe(false);
        expect(fs.existsSync(u.sidecar), label).toBe(false);
      }
    }
    // The fake HOME's state dir was never created: no case reached for a default path.
    expect(fs.existsSync(path.join(fakeHome, "marvin"))).toBe(false);
    // The lock stayed free throughout.
    expect(u.probe()).toBe(0);
  });

  it("12. own refusals never use 242 or 243, on every refusal path (regression guard)", async () => {
    const u = new Universe();
    const emptyBin = fs.mkdtempSync(path.join(u.root, "bin-empty-"));
    const badBin = fs.mkdtempSync(path.join(u.root, "bin-bad-"));
    fs.writeFileSync(path.join(badBin, "flock"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    fs.mkdirSync(u.p("dirstate"));
    fs.mkdirSync(path.join(u.p("dirstate"), "heavy-build.lock"));

    const a = launch(u, ["--job", "A", "--", ...u.hold("a")]);
    await waitFor("A ready", () => u.exists("a.ready"));
    const held = await run(u, ["--job", "B", "--", "true"]);
    u.touch("a.go");
    await a.done;

    const paths: [string, number, Result][] = [
      ["held", 240, held],
      ["memory", 241, await run(u, ["--job", "B", "--", "true"], { env: { OC_HEAVY_MEMINFO: u.memBelow } })],
      ["arguments", 244, await run(u, ["--job", "B"])],
      ["path guard", 244, await run(u, ["--job", "B", "--", "true"], { unset: ["OC_HEAVY_STATE_DIR"] })],
      ["lock file", 244, await run(u, ["--job", "B", "--", "true"], { env: { OC_HEAVY_STATE_DIR: u.p("dirstate") } })],
      ["flock missing", 244, await run(u, ["--job", "B", "--", "true"], { env: { PATH: emptyBin } })],
      ["flock fails", 244, await run(u, ["--job", "B", "--", "true"], { env: { PATH: `${badBin}:${process.env.PATH}` } })],
      ["spawn", 244, await run(u, ["--job", "B", "--", u.p("no-such-command")])],
    ];
    for (const [label, expected, res] of paths) {
      expect(res.code, `${label}: ${res.stderr}`).toBe(expected);
      expect(refusals(res.stderr), label).toEqual([expect.stringMatching(new RegExp(`^heavy-run: REFUSED ${expected} `))]);
      expect([242, 243], label).not.toContain(res.code);
    }
  });

  it("13. a malformed release ledger in the same state dir is irrelevant (regression guard)", async () => {
    const u = new Universe();
    const ledger = path.join(u.state, "opencanopy-releases.jsonl");
    fs.writeFileSync(ledger, "{not json\n");
    const res = await run(u, ["--job", "A", "--", "true"]);
    expect(res.code, res.stderr).toBe(0);
    expect(fs.readFileSync(ledger, "utf8")).toBe("{not json\n");
  });
});

/* ---------- 11: retry ---------- */

describe("--retry", () => {
  it("11a. 240, then the lock frees and the second attempt runs", async () => {
    const u = new Universe();
    const a = launch(u, ["--job", "A", "--", ...u.hold("a")]);
    await waitFor("A ready", () => u.exists("a.ready"));
    const b = launch(u, ["--job", "B", "--retry", "--", "sh", "-c", `touch '${u.p("b.ran")}'`], {
      env: { OC_HEAVY_INTERVAL_MS: "500" },
    });
    await waitFor("B's first refusal", () => refusals(b.stderr()).length === 1);
    u.touch("a.go");
    await a.done;
    const res = await b.done;
    expect(res.code, res.stderr).toBe(0);
    expect(refusals(res.stderr)).toEqual([expect.stringContaining("heavy-run: REFUSED 240")]);
    expect(u.exists("b.ran")).toBe(true);
  });

  it("11b. exactly 7 attempts, then the give-up line and the last code", async () => {
    const u = new Universe();
    const a = launch(u, ["--job", "A", "--", ...u.hold("a")]);
    await waitFor("A ready", () => u.exists("a.ready"));
    const res = await run(u, ["--job", "B", "--retry", "--", "true"], { env: { OC_HEAVY_INTERVAL_MS: "20" } });
    expect(res.code, res.stderr).toBe(240);
    expect(refusals(res.stderr)).toHaveLength(7);
    expect(res.stderr.trim().split("\n").at(-1)).toBe("heavy-run: giving up after 7 attempts; tell Lee");
    u.touch("a.go");
    await a.done;
  });

  it("11c. a 244 under --retry makes exactly one attempt (mutant: retry on 244)", async () => {
    const u = new Universe();
    const res = await run(u, ["--job", "B", "--retry", "--", "true"], {
      env: { OC_HEAVY_STATE_DIR: u.p("no-such-dir"), OC_HEAVY_INTERVAL_MS: "20" },
    });
    expect(res.code, res.stderr).toBe(244);
    expect(refusals(res.stderr)).toHaveLength(1);
    expect(res.stderr).not.toContain("giving up");
    expect(res.stderr).toContain("heavy-run: REFUSED 244 cannot open lock file");
  });

  it("11d. a command's own exit 240 is not retried", async () => {
    const u = new Universe();
    const res = await run(u, ["--job", "B", "--retry", "--", "sh", "-c", `echo x >> '${u.p("count")}'; exit 240`], {
      env: { OC_HEAVY_INTERVAL_MS: "20" },
    });
    expect(res.code).toBe(240);
    expect(fs.readFileSync(u.p("count"), "utf8")).toBe("x\n");
    expect(refusals(res.stderr)).toEqual([]);
    expect(res.stderr).toContain("heavy-run: command exited 240");
  });

  it("11e. after a 241 the descriptor is released during the wait, and SIGTERM during the wait exits 143 (mutant: keep the descriptor)", async () => {
    const u = new Universe();
    const b = launch(u, ["--job", "B", "--retry", "--", "true"], {
      env: { OC_HEAVY_MEMINFO: u.memBelow, OC_HEAVY_INTERVAL_MS: "60000" },
    });
    await waitFor("B's 241", () => b.stderr().includes("heavy-run: REFUSED 241"));
    expect(u.probe()).toBe(0);
    const third = await run(u, ["--job", "C", "--", "true"]);
    expect(third.code, third.stderr).toBe(0);

    process.kill(b.pid, "SIGTERM");
    const res = await b.done;
    expect(res.code, res.stderr).toBe(143);
    expect(res.stderr).toContain("SIGTERM while waiting");
  });
});

/* ---------- 14: Node-shaped commands ---------- */

describe("Node-shaped commands", () => {
  it("14. a synchronous node command holds the lock; a detached child started without fd 3 does not (regression guard, documented limit)", async () => {
    const u = new Universe();
    const holdScript = JSON.stringify(u.hold("sync")[2]);
    const sync = launch(u, ["--job", "A", "--", NODE, "-e", `require("child_process").spawnSync("sh", ["-c", ${holdScript}])`]);
    await waitFor("sync child ready", () => u.exists("sync.ready"));
    expect(u.probe()).toBe(240);
    u.touch("sync.go");
    expect((await sync.done).code).toBe(0);
    expect(u.probe()).toBe(0);

    const detachedScript = JSON.stringify(u.hold("det")[2]);
    const det = await run(u, [
      "--job",
      "A",
      "--",
      NODE,
      "-e",
      `require("child_process").spawn("sh", ["-c", ${detachedScript}], { detached: true, stdio: "ignore" }).unref()`,
    ]);
    expect(det.code, det.stderr).toBe(0);
    await waitFor("detached child ready", () => u.exists("det.ready"));
    const detPid = Number(fs.readFileSync(u.p("det.pgid"), "utf8"));
    expect(alive(detPid)).toBe(true);
    // The documented limit: the detached child outlives its parent without fd 3, so the lock is free.
    expect(u.probe()).toBe(0);
    u.touch("det.go");
  });
});
