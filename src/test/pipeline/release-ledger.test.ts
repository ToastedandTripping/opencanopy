// @vitest-environment node
/**
 * P0b-2: ledger, lease, fencing. Every case runs the real CLI as a subprocess
 * against temp state and a fake HOME; assertions are on exit code, reason and
 * bytes, never timing. Build-failed and takeover-adoption records are seeded here;
 * their writers are exercised in release-check-push.test.ts.
 *
 * "Every halt reaches GO" ends on the real `check-push` printing GO, against a real
 * fixture repo and installed gate.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOUR, LEE, MUTEX_LIB, RunResult, Universe, cleanupUniverses, runModule, sha } from "./release-harness";

vi.setConfig({ testTimeout: 30_000 });
afterEach(cleanupUniverses);

const S = sha("aa");
const S2 = sha("bb");
const G = sha("9");

function universe(token = 1): Universe {
  const u = new Universe();
  u.seed(token);
  return u;
}

function refused(res: RunResult): void {
  expect(res.code, res.out).toBe(2);
}

describe("concurrent claims", () => {
  it("admits exactly one of 8 distinct SHAs", async () => {
    const u = universe();
    const shas = Array.from({ length: 8 }, (_, i) => sha(`c${i}`));
    const results = await Promise.all(
      shas.map((s) => u.runAsync(["claim", "--lane", "M", "--sha", s, "--kind", "behaviour"])),
    );
    const winners = results.flatMap((r, i) => (r.code === 0 ? [shas[i]] : []));
    expect(winners).toHaveLength(1);
    for (const r of results) expect([0, 2, 4], r.out).toContain(r.code);
    expect(u.count("claim")).toBe(1);
    expect(JSON.parse(u.leaseBytes()!).sha).toBe(winners[0]);
  });
});

describe("duplicate SHA", () => {
  it("refuses a registered SHA after release, with the ledger unchanged", () => {
    const u = universe();
    const token = u.claim(S);
    expect(u.run(["release", "--token", String(token)]).code).toBe(0);
    const before = u.bytes();
    refused(u.run(["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"]));
    expect(u.bytes()).toBe(before);
  });

  it("accepts the SHA again after --abandon", () => {
    const u = universe();
    const token = u.claim(S);
    expect(u.run(["release", "--token", String(token), "--abandon"]).code).toBe(0);
    expect(u.claim(S)).toBeGreaterThan(token);
  });

  it("records one claim from 2 processes at once", async () => {
    const u = universe();
    const args = ["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"];
    const results = await Promise.all([u.runAsync(args), u.runAsync(args)]);
    expect(results.filter((r) => r.code === 0)).toHaveLength(1);
    expect(u.count("claim")).toBe(1);
  });
});

describe("stale lease", () => {
  it("is taken over only past exactly 2 h", () => {
    const u = universe();
    const token = u.claim(S);
    const leaseTs = Date.parse(JSON.parse(u.leaseBytes()!).ts);
    const args = ["takeover", "--lane", "S", "--observed-token", String(token)];
    u.now = leaseTs + 2 * HOUR - 1000;
    refused(u.run(args));
    expect(u.count("takeover")).toBe(0);
    u.now = leaseTs + 2 * HOUR + 1000;
    expect(u.run(args).code).toBe(0);
    expect(u.count("takeover")).toBe(1);
  });
});

describe("malformed ledger", () => {
  const good = (token: number, type = "claim", extra: object = { lane: "M", kind: "behaviour" }) =>
    JSON.stringify({ v: 1, ts: "2026-11-01T12:00:00.000Z", type, token, ...extra });
  const genesis = good(1, "genesis", { deploy: "dep-genesis", evidence: "fixture", sha: G });

  const cases: Array<[string, (u: Universe) => void]> = [
    ["bad JSON mid-file", (u) => fs.writeFileSync(u.ledgerPath, `${genesis}\n{not json\n${good(2)}\n`)],
    ["torn last line", (u) => fs.writeFileSync(u.ledgerPath, `${genesis}\n${good(2).slice(0, 20)}`)],
    ["unknown type", (u) => fs.writeFileSync(u.ledgerPath, `${genesis}\n${good(2, "frobnicate", {})}\n`)],
    [
      "unknown v",
      (u) => fs.writeFileSync(u.ledgerPath, `${genesis}\n${JSON.stringify({ ...JSON.parse(good(2)), v: 2 })}\n`),
    ],
    ["descending token", (u) => fs.writeFileSync(u.ledgerPath, `${good(3, "genesis", { deploy: "d", evidence: "e" })}\n${good(2)}\n`)],
    [
      "lease token above the maximum",
      (u) => {
        fs.writeFileSync(u.ledgerPath, `${genesis}\n`);
        fs.mkdirSync(u.leaseDir);
        fs.writeFileSync(u.leaseFile, JSON.stringify({ token: 99, ts: "2026-11-01T12:00:00.000Z" }));
      },
    ],
    [
      "path is a directory",
      (u) => {
        fs.rmSync(u.ledgerPath, { force: true });
        fs.mkdirSync(u.ledgerPath);
      },
    ],
    ["missing file", (u) => fs.rmSync(u.ledgerPath, { force: true })],
  ];

  const snapshot = (u: Universe) =>
    fs.existsSync(u.ledgerPath) && fs.statSync(u.ledgerPath).isFile() ? u.bytes() : "not-a-file";

  it.each(cases)("%s halts every command and writes nothing", (_name, corrupt) => {
    const u = universe();
    corrupt(u);
    const before = snapshot(u);
    const evidence = u.evidence("dep-genesis");
    const commands = [
      ["status"],
      ["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"],
      ["request", "--token", "1", "--sha", S, "--parent", G, "--approval", LEE, "--checks", "ok"],
      ["guard", "--token", "1", "--deploy", "dep-genesis", "--result", "green", "--evidence", evidence],
      ["takeover", "--lane", "M", "--observed-token", "1"],
    ];
    for (const command of commands) {
      const res = u.run(command);
      expect(res.code, `${command[0]}: ${res.out}`).toBe(3);
      expect(res.out).toContain("SCHEDULING HALTED");
      expect(snapshot(u)).toBe(before);
    }
  });

  it("says a missing ledger is not initialized, and does not recreate it", () => {
    const u = new Universe();
    const res = u.run(["status"]);
    expect(res.code).toBe(3);
    expect(res.out).toContain("not initialized");
    expect(fs.existsSync(u.ledgerPath)).toBe(false);
  });
});

describe("repair", () => {
  function brokenWithTokens(): { u: Universe; genesisLine: string } {
    const u = universe();
    const genesisLine = u.bytes();
    const first = u.claim(S);
    u.run(["release", "--token", String(first), "--abandon"]);
    u.claim(S2); // the removed line is this last claim, holding the highest token
    fs.appendFileSync(u.ledgerPath, "{broken\n");
    return { u, genesisLine };
  }

  function repair(u: Universe, genesisLine: string): RunResult {
    const aside = path.join(u.root, "aside.jsonl");
    const fixed = path.join(u.root, "fixed.jsonl");
    fs.renameSync(u.ledgerPath, aside);
    const during = u.run(["status"]);
    expect(during.code).toBe(3);
    expect(u.run(["claim", "--lane", "M", "--sha", sha("dd"), "--kind", "behaviour"]).code).toBe(3);
    fs.writeFileSync(fixed, genesisLine);
    const res = u.run(["repair-note", "--aside", aside, "--fixed", fixed, "--reason", "bad line removed"]);
    expect(res.code, res.out).toBe(0);
    return res;
  }

  it("recovers with a lease present: the claim token clears every aside token", () => {
    const { u, genesisLine } = brokenWithTokens();
    expect(fs.existsSync(u.leaseDir)).toBe(true);
    const asideMax = 3;
    repair(u, genesisLine);
    expect(fs.existsSync(u.leaseDir)).toBe(false);
    expect(u.claim(sha("ee"))).toBeGreaterThan(asideMax);
  });

  it("recovers with no lease", () => {
    const { u, genesisLine } = brokenWithTokens();
    fs.rmSync(u.leaseDir, { recursive: true });
    repair(u, genesisLine);
    expect(u.claim(sha("ee"))).toBeGreaterThan(3);
  });

  it("refuses while the ledger is still in place, or on a corrected copy that does not validate", () => {
    const { u, genesisLine } = brokenWithTokens();
    const fixed = path.join(u.root, "fixed.jsonl");
    const broken = u.bytes();
    fs.writeFileSync(fixed, genesisLine);
    refused(u.run(["repair-note", "--aside", u.ledgerPath, "--fixed", fixed, "--reason", "r"]));
    expect(u.bytes()).toBe(broken);
    fs.writeFileSync(fixed, "{still broken\n");
    const aside = path.join(u.root, "aside.jsonl");
    fs.renameSync(u.ledgerPath, aside);
    refused(u.run(["repair-note", "--aside", aside, "--fixed", fixed, "--reason", "r"]));
    expect(fs.existsSync(u.ledgerPath)).toBe(false);
  });
});

describe("resumed former owner", () => {
  it("is fenced from every token write, ledger and lease unchanged", () => {
    const u = universe(4);
    const old = u.claim(S);
    expect(old).toBe(5);
    u.now += 3 * HOUR;
    expect(u.run(["takeover", "--lane", "S", "--observed-token", "5"]).code).toBe(0);
    expect(u.state().token).toBe(6);
    const ledger = u.bytes();
    const lease = u.leaseBytes();
    const evidence = u.evidence("dep-genesis");
    const writes = [
      ["request", "--token", "5", "--sha", S, "--parent", G, "--approval", LEE, "--checks", "ok"],
      ["record-push", "--token", "5", "--sha", S],
      ["release", "--token", "5"],
      ["guard", "--token", "5", "--deploy", "dep-genesis", "--sha", G, "--result", "red", "--evidence", evidence],
      ["authorize-corrective", "--token", "5", "--sha", S, "--lee", LEE],
      ["record-rollback", "--token", "5", "--deploy", "dep-genesis", "--lee", LEE],
    ];
    for (const write of writes) {
      refused(u.run(write));
      expect(u.bytes()).toBe(ledger);
      expect(u.leaseBytes()).toBe(lease);
    }
  });
});

describe("crash-safe tokens", () => {
  const crash = (point: string) => ({ env: { OC_RELEASE_CRASH_AT: point } });

  /** The next caller stops at the dead mutex; running what it printed clears the way. */
  function clearDeadMutex(u: Universe, next: string[]): void {
    const before = u.leaseBytes();
    const stopped = u.run(next);
    expect(stopped.code, stopped.out).toBe(3);
    expect(stopped.out).toContain("rm -r");
    expect(u.leaseBytes()).toBe(before);
    u.runPrintedRecovery(stopped.out);
  }

  function allTokens(u: Universe): number[] {
    return u
      .records()
      .filter((r) => ["genesis", "claim", "takeover", "repair"].includes(String(r.type)))
      .map((r) => Number(r.token));
  }

  it("claim-after-mkdir: the next claim recovers", () => {
    const u = universe();
    expect(u.run(["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"], crash("claim-after-mkdir")).code).toBe(137);
    expect(u.count("claim")).toBe(0);
    clearDeadMutex(u, ["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"]);
    expect(u.claim(S)).toBe(2);
    expect(JSON.parse(u.leaseBytes()!).token).toBe(2);
  });

  it("claim-after-append: burns the token, and the same SHA may retry", () => {
    const u = universe();
    expect(u.run(["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"], crash("claim-after-append")).code).toBe(137);
    expect(u.count("claim")).toBe(1);
    expect(u.leaseBytes()).toBeNull();
    clearDeadMutex(u, ["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"]);
    expect(u.claim(S)).toBe(3);
  });

  it("release-after-append: the released residue is reclaimable", () => {
    const u = universe();
    const token = u.claim(S);
    expect(u.run(["release", "--token", String(token)], crash("release-after-append")).code).toBe(137);
    expect(fs.existsSync(u.leaseDir)).toBe(true);
    clearDeadMutex(u, ["claim", "--lane", "M", "--sha", S2, "--kind", "behaviour"]);
    expect(u.claim(S2)).toBe(token + 1);
  });

  it("takeover-after-append: the former holder is fenced by the ledger, and the lease stays stale", () => {
    const u = universe();
    const old = u.claim(S);
    u.now += 3 * HOUR;
    const args = ["takeover", "--lane", "S", "--observed-token", String(old)];
    expect(u.run(args, crash("takeover-after-append")).code).toBe(137);
    expect(JSON.parse(u.leaseBytes()!).token).toBe(old);
    const burned = old + 1;
    clearDeadMutex(u, ["takeover", "--lane", "S", "--observed-token", String(burned)]);
    refused(u.run(["request", "--token", String(old), "--sha", S, "--parent", G, "--approval", LEE, "--checks", "ok"]));
    expect(u.run(["takeover", "--lane", "S", "--observed-token", String(burned)]).code).toBe(0);
    expect(u.state().token).toBe(burned + 1);
  });

  it("tokens strictly increase across 10 crash cycles", () => {
    const u = universe();
    const points = ["claim-after-mkdir", "claim-after-append", "release-after-append", "takeover-after-append"];
    for (let i = 0; i < 10; i += 1) {
      const point = points[i % points.length];
      const commit = sha(`f${i}`);
      const claimArgs = ["claim", "--lane", "M", "--sha", commit, "--kind", "behaviour"];
      let token: number;
      if (point.startsWith("claim")) {
        expect(u.run(claimArgs, crash(point)).code).toBe(137);
        clearDeadMutex(u, claimArgs);
        token = u.claim(commit);
      } else if (point.startsWith("release")) {
        const first = u.claim(commit);
        expect(u.run(["release", "--token", String(first)], crash(point)).code).toBe(137);
        const next = sha(`e${i}`);
        clearDeadMutex(u, ["claim", "--lane", "M", "--sha", next, "--kind", "behaviour"]);
        token = u.claim(next);
      } else {
        const first = u.claim(commit);
        u.now += 3 * HOUR;
        const args = ["takeover", "--lane", "S", "--observed-token", String(first)];
        expect(u.run(args, crash(point)).code).toBe(137);
        const again = ["takeover", "--lane", "S", "--observed-token", String(first + 1)];
        clearDeadMutex(u, again);
        expect(u.run(again).code).toBe(0);
        token = first + 2;
      }
      expect(u.run(["release", "--token", String(token)]).code).toBe(0);
    }
    const tokens = allTokens(u);
    expect(tokens.length).toBeGreaterThan(10);
    tokens.reduce((prev, cur) => {
      expect(cur).toBeGreaterThan(prev);
      return cur;
    });
  });
});

describe("mutex", () => {
  const claim = ["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"];

  function deadPid(): number {
    const res = spawnSync("true");
    return res.pid;
  }

  it("a dead holder exits 3 with the manual text, lease untouched", () => {
    const u = universe();
    u.claim(S2);
    const lease = u.leaseBytes();
    const ledger = u.bytes();
    u.plantMutex(JSON.stringify({ pid: deadPid(), startTicks: "1", ts: "t" }));
    const res = u.run(claim);
    expect(res.code, res.out).toBe(3);
    expect(res.out).toContain(`rm -r ${u.mutexDir}`);
    expect(u.leaseBytes()).toBe(lease);
    expect(u.bytes()).toBe(ledger);
    expect(fs.existsSync(u.mutexDir)).toBe(true);
  });

  it("a live PID with another start time is a dead holder (PID reuse)", () => {
    const u = universe();
    u.plantMutex(JSON.stringify({ pid: process.pid, startTicks: "1", ts: "t" }));
    expect(u.run(claim).code).toBe(3);
  });

  it("an unparseable owner exits 3, lease untouched", () => {
    const u = universe();
    u.claim(S2);
    const lease = u.leaseBytes();
    u.plantMutex("{not json");
    const res = u.run(claim);
    expect(res.code, res.out).toBe(3);
    expect(res.out).toContain("rm -r");
    expect(u.leaseBytes()).toBe(lease);
  });

  it("a live holder past 5 s exits 4, never 3", () => {
    const u = universe();
    u.holdMutex();
    const before = u.bytes();
    const res = u.run(claim);
    expect(res.code, res.out).toBe(4);
    expect(u.bytes()).toBe(before);
  });

  it("takes a stray empty directory", () => {
    const u = universe();
    fs.mkdirSync(u.mutexDir);
    expect(u.claim(S)).toBe(2);
  });

  it("release leaves a successor's mutex alone", async () => {
    const u = universe();
    const successor = JSON.stringify({ pid: 1, startTicks: "1", ts: "t", nonce: "successor" });
    const res = await runModule(
      `import fs from "node:fs";
       import { withMutex } from ${JSON.stringify(MUTEX_LIB)};
       const dir = ${JSON.stringify(u.mutexDir)};
       withMutex(dir, () => {
         fs.rmSync(dir, { recursive: true });
         fs.mkdirSync(dir);
         fs.writeFileSync(dir + "/owner", ${JSON.stringify(successor)});
       });`,
    );
    expect(res.code, res.out).toBe(0);
    expect(fs.readFileSync(path.join(u.mutexDir, "owner"), "utf8")).toBe(successor);
  });

  it("an acquire-and-release loop under contention never reads a live release as dead", async () => {
    const u = universe();
    const source = `import { withMutex, MutexError } from ${JSON.stringify(MUTEX_LIB)};
      for (let i = 0; i < 150; i += 1) {
        try {
          withMutex(${JSON.stringify(u.mutexDir)}, () => {}, { timeoutMs: 20000 });
        } catch (err) {
          console.error(err.kind, err.message);
          process.exit(err instanceof MutexError && err.kind === "busy" ? 4 : 3);
        }
      }`;
    const results = await Promise.all(Array.from({ length: 8 }, () => runModule(source)));
    for (const r of results) {
      expect(r.code, r.out).not.toBe(3);
      expect(r.code, r.out).toBe(0);
    }
    expect(fs.existsSync(u.mutexDir)).toBe(false);
  });
});

describe("edge refusals", () => {
  it("request with another SHA", () => {
    const u = universe();
    const token = u.claim(S);
    refused(u.run(["request", "--token", String(token), "--sha", S2, "--parent", G, "--approval", LEE, "--checks", "ok"]));
    expect(u.count("request")).toBe(0);
    expect(
      u.run(["request", "--token", String(token), "--sha", S, "--parent", G, "--approval", LEE, "--checks", "ok"]).code,
    ).toBe(0);
    expect(u.count("request")).toBe(1);
  });

  it("token write after release", () => {
    const u = universe();
    const token = u.claim(S);
    expect(u.run(["release", "--token", String(token)]).code).toBe(0);
    refused(u.run(["request", "--token", String(token), "--sha", S, "--parent", G, "--approval", LEE, "--checks", "ok"]));
    refused(u.run(["release", "--token", String(token)]));
  });

  it("--abandon after record-push; record-push needs origin at the SHA, and a failed push can still abandon", () => {
    const u = universe();
    const repo = u.repo();
    const parent = repo.commit("a.txt", "one");
    repo.pushMain();
    const tip = repo.commit("a.txt", "two");
    const token = u.claim(tip);

    refused(u.run(["record-push", "--token", String(token), "--sha", tip], { cwd: repo.dir }));
    expect(u.count("push")).toBe(0);
    expect(parent).not.toBe(tip);

    repo.pushMain();
    expect(u.run(["record-push", "--token", String(token), "--sha", tip], { cwd: repo.dir }).code).toBe(0);
    expect(u.count("push")).toBe(1);
    refused(u.run(["release", "--token", String(token), "--abandon"]));
    expect(u.count("release")).toBe(0);
  });

  it("a failed push can be abandoned", () => {
    const u = universe();
    const repo = u.repo();
    repo.commit("a.txt", "one");
    repo.pushMain();
    const tip = repo.commit("a.txt", "two");
    const token = u.claim(tip);
    refused(u.run(["record-push", "--token", String(token), "--sha", tip], { cwd: repo.dir }));
    expect(u.run(["release", "--token", String(token), "--abandon"]).code).toBe(0);
  });

  it("--abandon after reconcile's pushed row", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    refused(u.run(["release", "--token", String(token), "--abandon"]));
  });

  it("--abandon after adoption (the record P0b-3's takeover writes)", () => {
    const u = universe();
    const token = u.claim(S);
    u.appendRecord({ type: "takeover", token: token + 1, lane: "S", observed_token: token, adopted: { sha: S, deploy: "dep-a" } });
    refused(u.run(["release", "--token", String(token + 1), "--abandon"]));
  });
});

describe("fold honesty", () => {
  it("pending and unverified leave known-good on the previous deploy; green moves it", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    let st = u.state();
    expect(st.current.deploy).toBe("dep-a");
    expect(st.known_good.deploy).toBe("dep-genesis");
    expect(u.guard("dep-a", S, "unverified", { token }).code).toBe(0);
    st = u.state();
    expect(st.known_good.deploy).toBe("dep-genesis");
    expect(st.open_halts).toHaveLength(1);
    expect(u.guard("dep-a", S, "green", { token }).code).toBe(0);
    st = u.state();
    expect(st.known_good.deploy).toBe("dep-a");
    expect(st.open_halts).toHaveLength(0);
  });
});

describe("guard binding", () => {
  function setUp(): { u: Universe; token: number; before: string } {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    return { u, token, before: u.bytes() };
  }

  function expectUnchanged(u: Universe, before: string): void {
    expect(u.bytes()).toBe(before);
    expect(u.state().known_good.deploy).toBe("dep-genesis");
  }

  it("refuses the wrong --sha", () => {
    const { u, token, before } = setUp();
    refused(u.guard("dep-a", S2, "green", { token }));
    expectUnchanged(u, before);
  });

  it("refuses a missing --sha when the deploy has a ref", () => {
    const { u, token, before } = setUp();
    refused(u.guard("dep-a", null, "green", { token }));
    expectUnchanged(u, before);
  });

  it("refuses the wrong --deploy", () => {
    const { u, token, before } = setUp();
    // The evidence is good for the current deploy, so only the binding can refuse this.
    refused(u.guard("dep-other", S, "green", { token, evidence: u.evidence("dep-a") }));
    expectUnchanged(u, before);
  });

  it("refuses missing evidence", () => {
    const { u, token, before } = setUp();
    refused(u.guard("dep-a", S, "green", { token, evidence: path.join(u.root, "absent.txt") }));
    expectUnchanged(u, before);
  });

  it("refuses empty evidence", () => {
    const { u, token, before } = setUp();
    const file = u.evidence("dep-a");
    fs.writeFileSync(file, "");
    fs.utimesSync(file, u.now / 1000, u.now / 1000);
    refused(u.guard("dep-a", S, "green", { token, evidence: file }));
    expectUnchanged(u, before);
  });

  it("refuses evidence older than the deploy record", () => {
    const { u, token, before } = setUp();
    refused(u.guard("dep-a", S, "green", { token, evidence: u.evidence("dep-a", u.now - 3600_000) }));
    expectUnchanged(u, before);
  });

  it("refuses evidence naming another deploy", () => {
    const { u, token, before } = setUp();
    refused(u.guard("dep-a", S, "green", { token, evidence: u.evidence("dep-other") }));
    expectUnchanged(u, before);
  });

  it("accepts no --sha on a null-ref deploy", () => {
    const u = universe();
    u.publish("dep-null", null);
    expect(u.run(["reconcile"]).code).toBe(3);
    expect(u.run(["ack-deploy", "--deploy", "dep-null", "--lee", LEE]).code).toBe(0);
    const claim = u.run(["claim", "--lane", "M", "--deploy", "dep-null", "--kind", "behaviour"]);
    expect(claim.code, claim.out).toBe(0);
    const token = u.state().token;
    const res = u.guard("dep-null", null, "green", { token });
    expect(res.code, res.out).toBe(0);
    expect(u.state().known_good.deploy).toBe("dep-null");
  });
});

describe("red halt cannot self-lift", () => {
  it("red then green with no words: refused; with --lee: lifts, words recorded", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    expect(u.guard("dep-a", S, "red", { token }).code).toBe(0);
    const before = u.bytes();
    refused(u.guard("dep-a", S, "green", { token }));
    expect(u.bytes()).toBe(before);
    let st = u.state();
    expect(st.open_halts).toHaveLength(1);
    expect(st.known_good.deploy).toBe("dep-genesis");

    expect(u.guard("dep-a", S, "green", { token, lee: "Lee: a flake, lift it" }).code).toBe(0);
    st = u.state();
    expect(st.open_halts).toHaveLength(0);
    expect(st.known_good.deploy).toBe("dep-a");
    const lifted = u.records().filter((r) => r.type === "guard").at(-1)!;
    expect(lifted.lee).toBe("Lee: a flake, lift it");
  });

  it("red, unverified, green with no words: exit 2 at the second step", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    expect(u.guard("dep-a", S, "red", { token }).code).toBe(0);
    const before = u.bytes();
    refused(u.guard("dep-a", S, "unverified", { token }));
    expect(u.bytes()).toBe(before);
    refused(u.guard("dep-a", S, "green", { token }));
    expect(u.state().open_halts).toHaveLength(1);
  });

  it("a rebuild of a red SHA inherits the red: green with no words refused, known-good unchanged", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    expect(u.guard("dep-a", S, "red", { token }).code).toBe(0);
    expect(u.land("dep-a2", S).code).toBe(3); // still halted, deploy recorded
    expect(u.state().current.deploy).toBe("dep-a2");
    refused(u.guard("dep-a2", S, "green", { token }));
    expect(u.state().known_good.deploy).toBe("dep-genesis");
  });
});

describe("transition table", () => {
  const none = () => {
    const u = universe();
    return { u, token: u.deployed(S, "dep-a") };
  };

  it.each(["green", "red", "unverified"])("none to %s: allowed", (result) => {
    const { u, token } = none();
    expect(u.guard("dep-a", S, result, { token }).code).toBe(0);
    expect(u.count("guard")).toBe(1);
  });

  it.each(["green", "red"])("unverified to %s: allowed", (result) => {
    const { u, token } = none();
    u.guard("dep-a", S, "unverified", { token });
    expect(u.guard("dep-a", S, result, { token }).code).toBe(0);
    expect(u.count("guard")).toBe(2);
  });

  it("green to red: known-good is the previous green, halted", () => {
    const { u, token } = none();
    u.guard("dep-a", S, "green", { token });
    expect(u.state().known_good.deploy).toBe("dep-a");
    expect(u.guard("dep-a", S, "red", { token }).code).toBe(0);
    const st = u.state();
    expect(st.known_good.deploy).toBe("dep-genesis");
    expect(st.open_halts.map((h: { kind: string }) => h.kind)).toEqual(["red"]);
  });

  it("green to red with no previous green: known-good is null and the text says so", () => {
    const u = universe();
    const res = u.guard("dep-genesis", G, "red");
    expect(res.code, res.out).toBe(0);
    expect(res.out).toContain("No rollback target exists");
    expect(u.state().known_good).toBeNull();
  });

  it.each(["red", "unverified", "green"])("same verdict twice (%s): one record", (result) => {
    const { u, token } = none();
    expect(u.guard("dep-a", S, result, { token }).code).toBe(0);
    expect(u.guard("dep-a", S, result, { token }).code).toBe(0);
    expect(u.count("guard")).toBe(1);
  });

  it("red to unverified: refused", () => {
    const { u, token } = none();
    u.guard("dep-a", S, "red", { token });
    refused(u.guard("dep-a", S, "unverified", { token }));
    expect(u.count("guard")).toBe(1);
  });

  it("green to unverified: refused", () => {
    const { u, token } = none();
    u.guard("dep-a", S, "green", { token });
    refused(u.guard("dep-a", S, "unverified", { token }));
    expect(u.count("guard")).toBe(1);
  });

  it("red with no lease and no token: accepted", () => {
    const { u, token } = none();
    u.guard("dep-a", S, "green", { token });
    u.run(["release", "--token", String(token)]);
    const res = u.guard("dep-a", S, "red");
    expect(res.code, res.out).toBe(0);
    expect(u.state().open_halts).toHaveLength(1);
  });

  it("anything but a red needs a token; a red needs one while a lease is held", () => {
    const { u, token } = none();
    refused(u.guard("dep-a", S, "green"));
    refused(u.guard("dep-a", S, "unverified"));
    refused(u.guard("dep-a", S, "red"));
    u.guard("dep-a", S, "green", { token });
    u.run(["release", "--token", String(token)]);
    refused(u.guard("dep-a", S, "unverified"));
  });
});

describe("every halt reaches GO", () => {
  /** No open halt, predecessor green, and the next release gets a real GO. */
  function expectClear(u: Universe, heldToken?: number): void {
    const st = u.state();
    expect(st.open_halts).toEqual([]);
    expect(st.predecessor).toBe("green");
    if (heldToken !== undefined) expect(u.run(["release", "--token", String(heldToken)]).code).toBe(0);
    const repo = u.repo();
    const parent = u.commitTool(repo);
    repo.pushMain();
    const installed = u.run(["install", "--lee", LEE], { cwd: repo.dir });
    expect(installed.code, installed.out).toBe(0);
    const next = repo.commit("next.txt", "next\n");
    const token = u.claim(next);
    const req = u.run(["request", "--token", String(token), "--sha", next, "--parent", parent, "--approval", LEE, "--checks", "ok"]);
    expect(req.code, req.out).toBe(0);
    const go = u.run(["check-push", "--token", String(token), "--pushed-sha", next]);
    expect(go.code, go.out).toBe(0);
    expect(go.stdout).toContain(`GO sha=${next}`);
    expect(go.stdout).toContain(`rollback=${st.known_good.deploy}`);
  }

  it("red, holder alive: green with --lee", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    expect(u.guard("dep-a", S, "green", { token, lee: LEE }).code).toBe(0);
    expectClear(u, token);
  });

  it("red, holder dead: takeover during the halt, then green with --lee", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    u.now += 3 * HOUR;
    const taken = u.run(["takeover", "--lane", "S", "--observed-token", String(token)]);
    expect(taken.code, taken.out).toBe(0);
    expect(u.guard("dep-a", S, "green", { token: token + 1, lee: LEE }).code).toBe(0);
    expectClear(u, token + 1);
  });

  it("red after release, no token: record-rollback, claim --deploy, green on the restored deploy", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    expect(u.run(["release", "--token", String(token)]).code).toBe(0);
    expect(u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]).code).toBe(0);
    u.publish("dep-genesis", G);
    expect(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]).code).toBe(0);
    const held = u.state().token;
    expect(u.state().open_halts).toHaveLength(1);
    expect(u.guard("dep-genesis", G, "green", { token: held }).code).toBe(0);
    expectClear(u, held);
  });

  it("red after release, no token: authorize-corrective, claim --kind corrective, green on it", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    expect(u.run(["release", "--token", String(token)]).code).toBe(0);
    expect(u.run(["authorize-corrective", "--sha", S2, "--lee", LEE]).code).toBe(0);
    const held = u.claim(S2, "corrective");
    expect(u.land("dep-b", S2).code).toBe(3); // deploy recorded; the halt stays until its green
    expect(u.guard("dep-b", S2, "green", { token: held }).code).toBe(0);
    expectClear(u, held);
  });

  it("unverified: green on that commit", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "unverified", { token });
    expect(u.guard("dep-a", S, "green", { token }).code).toBe(0);
    expectClear(u, token);
  });

  it("build-failed: authorize-corrective, green on the corrective release", () => {
    const u = universe();
    const token = u.claim(S);
    u.appendRecord({ type: "build-failed", token, sha: S });
    expect(u.state().open_halts).toHaveLength(1);
    expect(u.run(["authorize-corrective", "--token", String(token), "--sha", S2, "--lee", LEE]).code).toBe(0);
    expect(u.run(["release", "--token", String(token)]).code).toBe(0);
    const held = u.claim(S2, "corrective");
    u.land("dep-b", S2);
    expect(u.guard("dep-b", S2, "green", { token: held }).code).toBe(0);
    expectClear(u, held);
  });

  it("unclassifiable published: ack-deploy makes it current, claim its ref, green", () => {
    const u = universe();
    u.publish("dep-direct", S);
    const stopped = u.run(["reconcile"]);
    expect(stopped.code).toBe(3);
    expect(u.run(["ack-deploy", "--deploy", "dep-direct", "--lee", LEE]).code).toBe(0);
    expect(u.state().current.deploy).toBe("dep-direct");
    expect(u.state().open_halts).toHaveLength(1);
    const held = u.claim(S);
    expect(u.guard("dep-direct", S, "green", { token: held }).code).toBe(0);
    expectClear(u, held);
  });

  it("unclassifiable, then settled: ack-deploy on it alone", () => {
    const u = universe();
    u.appendRecord({ type: "halt", token: 1, reason: "in flight, unclassifiable", deploy: "dep-stuck", sha: S });
    expect(u.state().open_halts).toHaveLength(1);
    expect(u.run(["ack-deploy", "--deploy", "dep-stuck", "--lee", LEE]).code).toBe(0);
    expect(u.state().stranded).toEqual(["dep-stuck"]);
    expectClear(u);
  });

  it("rebuild of a red SHA: green with --lee", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    u.land("dep-a2", S);
    expect(u.guard("dep-a2", S, "green", { token, lee: LEE }).code).toBe(0);
    expect(u.state().known_good.deploy).toBe("dep-a2");
    expectClear(u, token);
  });

  it("a halted claim that is no door exits 3, with nothing written", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    u.run(["release", "--token", String(token)]);
    const before = u.bytes();
    const res = u.run(["claim", "--lane", "S", "--sha", S2, "--kind", "behaviour"]);
    expect(res.code).toBe(3);
    expect(res.out).toContain("SCHEDULING HALTED");
    expect(u.bytes()).toBe(before);
  });
});

describe("open-halt set", () => {
  it("a direct push during an unverified halt: green on the first leaves the second open, known-good unmoved", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "unverified", { token });
    u.publish("dep-direct", S2);
    expect(u.run(["reconcile"]).code).toBe(3);
    expect(u.state().open_halts).toHaveLength(2);

    expect(u.guard("dep-a", S, "green", { token }).code).toBe(0);
    const st = u.state();
    expect(st.open_halts.map((h: { kind: string }) => h.kind)).toEqual(["unclassifiable"]);
    expect(st.known_good.deploy).toBe("dep-genesis");
  });

  it("green on the unchanged known-good after build-failed: ledger unchanged, halt stays", () => {
    const u = universe();
    const token = u.claim(S);
    u.appendRecord({ type: "build-failed", token, sha: S });
    const before = u.bytes();
    expect(u.guard("dep-genesis", G, "green", { token }).code).toBe(0);
    expect(u.bytes()).toBe(before);
    expect(u.state().open_halts).toHaveLength(1);
  });

  it("an observed rollback with no words closes nothing until record-rollback", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    u.publish("dep-genesis", G);
    expect(u.run(["reconcile"]).code).toBe(3);
    const observed = u.records().at(-1)!;
    expect(observed.type).toBe("rollback");
    expect(observed.lee).toBeUndefined();
    expect(u.state().current.deploy).toBe("dep-genesis");

    expect(u.guard("dep-genesis", G, "green", { token }).code).toBe(0);
    expect(u.state().open_halts).toHaveLength(1);

    expect(u.run(["record-rollback", "--token", String(token), "--deploy", "dep-genesis", "--lee", LEE]).code).toBe(0);
    expect(u.state().open_halts).toHaveLength(1);
    expect(u.guard("dep-genesis", G, "green", { token }).code).toBe(0);
    expect(u.state().open_halts).toHaveLength(0);
    expect(u.state().known_good.deploy).toBe("dep-genesis");
  });

  it("with an unclassifiable open, green on a bound corrective closes only its own kinds", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    u.appendRecord({ type: "halt", token, reason: "x", deploy: "dep-stuck", sha: null });
    u.run(["authorize-corrective", "--token", String(token), "--sha", S2, "--lee", LEE]);
    u.run(["release", "--token", String(token)]);
    const held = u.claim(S2, "corrective");
    u.land("dep-b", S2);
    expect(u.guard("dep-b", S2, "green", { token: held }).code).toBe(0);
    expect(u.state().open_halts.map((h: { kind: string }) => h.kind)).toEqual(["unclassifiable"]);
  });
});

describe("doors refuse halts they do not own", () => {
  const OTHER = sha("cc");
  type Foreign = "red" | "unverified" | "build-failed" | "unclassifiable";

  /** Opens a halt on a commit and deploy nothing else in the test touches. */
  function openForeign(u: Universe, kind: Foreign): void {
    const token = u.state().token;
    if (kind === "red" || kind === "unverified") {
      u.appendRecord({ type: "guard", token, sha: OTHER, deploy: "dep-other", result: kind, evidence: "e" });
    } else if (kind === "build-failed") {
      u.appendRecord({ type: "build-failed", token, sha: OTHER });
    } else {
      u.appendRecord({ type: "halt", token, reason: "foreign", deploy: "dep-other", sha: OTHER });
    }
  }

  function expectOnly(u: Universe, kind: Foreign, knownGood = "dep-genesis"): void {
    const st = u.state();
    expect(st.open_halts.map((h: { kind: string }) => h.kind)).toEqual([kind]);
    expect(st.known_good.deploy).toBe(knownGood);
  }

  const ALL: Foreign[] = ["red", "unverified", "build-failed", "unclassifiable"];

  it.each(ALL)("green on an unverified commit leaves a foreign %s", (kind) => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "unverified", { token });
    openForeign(u, kind);
    expect(u.guard("dep-a", S, "green", { token }).code).toBe(0);
    expectOnly(u, kind);
  });

  it.each(ALL)("green with --lee on a red commit leaves a foreign %s", (kind) => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    openForeign(u, kind);
    expect(u.guard("dep-a", S, "green", { token, lee: LEE }).code).toBe(0);
    expectOnly(u, kind);
  });

  it.each(ALL)("green on an acked published deploy leaves a foreign %s", (kind) => {
    const u = universe();
    u.publish("dep-direct", S);
    u.run(["reconcile"]);
    u.run(["ack-deploy", "--deploy", "dep-direct", "--lee", LEE]);
    const held = u.claim(S);
    openForeign(u, kind);
    expect(u.guard("dep-direct", S, "green", { token: held }).code).toBe(0);
    expectOnly(u, kind);
  });

  it.each(ALL)("a halted claim on an acked SHA is refused once a foreign %s opens after the ack", (kind) => {
    const u = universe();
    u.publish("dep-direct", S);
    u.run(["reconcile"]);
    u.run(["ack-deploy", "--deploy", "dep-direct", "--lee", LEE]);
    openForeign(u, kind);
    expect(u.run(["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"]).code).toBe(3);
    expect(u.count("claim")).toBe(0);
  });

  it.each(ALL)("ack-deploy of a stranded deploy leaves a foreign %s", (kind) => {
    const u = universe();
    u.appendRecord({ type: "halt", token: 1, reason: "stuck", deploy: "dep-stuck", sha: null });
    openForeign(u, kind);
    expect(u.run(["ack-deploy", "--deploy", "dep-stuck", "--lee", LEE]).code).toBe(0);
    expectOnly(u, kind);
  });

  it.each<Foreign>(["build-failed", "unclassifiable"])(
    "green on a worded rollback leaves an earlier foreign %s",
    (kind) => {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "red", { token });
      openForeign(u, kind);
      u.publish("dep-genesis", G);
      u.run(["record-rollback", "--token", String(token), "--deploy", "dep-genesis", "--lee", LEE]);
      expect(u.guard("dep-genesis", G, "green", { token }).code).toBe(0);
      expectOnly(u, kind);
    },
  );

  it("green on a bound corrective leaves a foreign unclassifiable, and closes the rest", () => {
    const u = universe();
    const token = u.claim(S);
    for (const kind of ["red", "unverified", "build-failed", "unclassifiable"] as Foreign[]) openForeign(u, kind);
    u.run(["authorize-corrective", "--token", String(token), "--sha", S2, "--lee", LEE]);
    u.run(["release", "--token", String(token)]);
    const held = u.claim(S2, "corrective");
    u.land("dep-b", S2);
    expect(u.guard("dep-b", S2, "green", { token: held }).code).toBe(0);
    expectOnly(u, "unclassifiable");
  });

  describe("C1: a corrective is a new commit", () => {
    function buildFailedAfterRollback(): { u: Universe; token: number } {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "red", { token });
      u.run(["release", "--token", String(token)]);
      u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]);
      u.publish("dep-genesis", G);
      u.appendRecord({ type: "build-failed", token: u.state().token, sha: OTHER });
      return { u, token };
    }

    it("claim --deploy --kind corrective is refused, with an authorization on another SHA", () => {
      const { u } = buildFailedAfterRollback();
      u.run(["authorize-corrective", "--sha", S2, "--lee", LEE]);
      const before = u.bytes();
      refused(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "corrective"]));
      expect(u.bytes()).toBe(before);
    });

    it("a corrective --deploy is refused on a rollback still answering its own halt", () => {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "red", { token });
      u.run(["release", "--token", String(token)]);
      u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]);
      u.publish("dep-genesis", G);
      refused(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "corrective"]));
      expect(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]).code).toBe(0);
    });

    it("authorize-corrective refuses a live known-good SHA", () => {
      const u = universe();
      u.appendRecord({ type: "build-failed", token: 1, sha: OTHER });
      const before = u.bytes();
      refused(u.run(["authorize-corrective", "--sha", G, "--lee", LEE]));
      expect(u.bytes()).toBe(before);
      expect(u.state().open_halts).toHaveLength(1);
    });

    it("an authorization that was deployed afterwards cannot claim as a corrective", () => {
      const u = universe();
      u.run(["authorize-corrective", "--sha", S, "--lee", LEE]);
      u.publish("dep-direct", S);
      u.run(["reconcile"]);
      u.run(["ack-deploy", "--deploy", "dep-direct", "--lee", LEE]);
      refused(u.run(["claim", "--lane", "M", "--sha", S, "--kind", "corrective"]));
    });
  });

  describe("C2: a rollback's words do not outlive the halts they answered", () => {
    function greenedRollback(): { u: Universe } {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "red", { token });
      u.run(["release", "--token", String(token)]);
      u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]);
      u.publish("dep-genesis", G);
      u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]);
      const held = u.state().token;
      expect(u.guard("dep-genesis", G, "green", { token: held }).code).toBe(0);
      expect(u.state().open_halts).toEqual([]);
      u.run(["release", "--token", String(held)]);
      return { u };
    }

    it.each<Foreign>(["red", "unverified", "build-failed"])("a later %s stays open through green on the old deploy", (kind) => {
      const { u } = greenedRollback();
      const held = u.claim(S2);
      openForeign(u, kind);
      expect(u.guard("dep-genesis", G, "green", { token: held }).code).toBe(0);
      expect(u.state().open_halts.map((h: { kind: string }) => h.kind)).toEqual([kind]);
    });

    it("an unverified with a null deploy, opened after an unspent rollback, stays open", () => {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "red", { token });
      u.run(["record-rollback", "--token", String(token), "--deploy", "dep-genesis", "--lee", LEE]);
      u.publish("dep-genesis", G);
      u.appendRecord({ type: "guard", token, sha: S2, deploy: null, result: "unverified", evidence: "timeout" });
      expect(u.guard("dep-genesis", G, "green", { token }).code).toBe(0);
      const st = u.state();
      expect(st.open_halts.map((h: { kind: string; sha: string }) => h.sha)).toEqual([S2]);
    });

    it("claim --deploy is refused once the rollback was greened", () => {
      const { u } = greenedRollback();
      const before = u.bytes();
      refused(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]));
      expect(u.bytes()).toBe(before);
    });

    it("claim --deploy is refused after a later halt, even on a rollback never greened", () => {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "red", { token });
      u.run(["release", "--token", String(token)]);
      u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]);
      u.publish("dep-genesis", G);
      openForeign(u, "build-failed");
      refused(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]));
    });

    it("an acked SHA's bypass is spent by its green", () => {
      const u = universe();
      u.publish("dep-direct", S);
      u.run(["reconcile"]);
      u.run(["ack-deploy", "--deploy", "dep-direct", "--lee", LEE]);
      const held = u.claim(S);
      u.guard("dep-direct", S, "green", { token: held });
      u.run(["release", "--token", String(held)]);
      openForeign(u, "build-failed");
      const res = u.run(["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"]);
      expect(res.code).toBe(3);
    });

    it("an acked null-ref deploy's --deploy door is spent by its green", () => {
      const u = universe();
      u.publish("dep-null", null);
      u.run(["reconcile"]);
      u.run(["ack-deploy", "--deploy", "dep-null", "--lee", LEE]);
      u.run(["claim", "--lane", "M", "--deploy", "dep-null", "--kind", "behaviour"]);
      const held = u.state().token;
      u.guard("dep-null", null, "green", { token: held });
      u.run(["release", "--token", String(held)]);
      refused(u.run(["claim", "--lane", "M", "--deploy", "dep-null", "--kind", "behaviour"]));
    });
  });

  describe("R1: a door shuts only for a later halt still open", () => {
    function rolledBackThenStranded(): Universe {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "red", { token });
      u.run(["release", "--token", String(token)]);
      u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]);
      u.publish("dep-genesis", G);
      u.appendRecord({ type: "halt", token: u.state().token, reason: "in flight", deploy: "dep-y", sha: S2 });
      expect(u.run(["ack-deploy", "--deploy", "dep-y", "--lee", LEE]).code).toBe(0);
      expect(u.state().open_halts.map((h: { kind: string }) => h.kind)).toEqual(["red"]);
      return u;
    }

    it("a rollback's door stays open after a later halt closed, and its green clears the red", () => {
      const u = rolledBackThenStranded();
      const claimed = u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]);
      expect(claimed.code, claimed.out).toBe(0);
      expect(u.guard("dep-genesis", G, "green", { token: u.state().token }).code).toBe(0);
      expect(u.state().open_halts).toEqual([]);
    });

    it("an ack's door stays open after a later halt closed", () => {
      const u = universe();
      u.publish("dep-x", S);
      u.run(["reconcile"]);
      u.run(["ack-deploy", "--deploy", "dep-x", "--lee", LEE]);
      u.appendRecord({ type: "halt", token: u.state().token, reason: "in flight", deploy: "dep-y", sha: S2 });
      u.run(["ack-deploy", "--deploy", "dep-y", "--lee", LEE]);
      const claimed = u.run(["claim", "--lane", "M", "--sha", S, "--kind", "behaviour"]);
      expect(claimed.code, claimed.out).toBe(0);
      expect(u.guard("dep-x", S, "green", { token: u.state().token }).code).toBe(0);
      expect(u.state().open_halts).toEqual([]);
    });

    it("a later halt still open shuts the door, and closing it reopens the same door", () => {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "red", { token });
      u.run(["release", "--token", String(token)]);
      u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]);
      u.publish("dep-genesis", G);
      u.appendRecord({ type: "halt", token: u.state().token, reason: "in flight", deploy: "dep-y", sha: S2 });
      refused(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]));
      u.run(["ack-deploy", "--deploy", "dep-y", "--lee", LEE]);
      expect(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]).code).toBe(0);
    });

    it("a green on the door still cannot close the later halt it did not answer", () => {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "red", { token });
      u.run(["record-rollback", "--token", String(token), "--deploy", "dep-genesis", "--lee", LEE]);
      u.publish("dep-genesis", G);
      u.appendRecord({ type: "halt", token, reason: "in flight", deploy: "dep-y", sha: S2 });
      expect(u.guard("dep-genesis", G, "green", { token }).code).toBe(0);
      expect(u.state().open_halts.map((h: { deploy: string }) => h.deploy)).toEqual(["dep-y"]);
    });
  });

  describe("R2: record-rollback needs a rollback, or an ack still answering its halt", () => {
    function spentAck(): { u: Universe; held: number } {
      const u = universe();
      u.publish("dep-x", S);
      u.run(["reconcile"]);
      u.run(["ack-deploy", "--deploy", "dep-x", "--lee", LEE]);
      const acked = u.claim(S);
      u.guard("dep-x", S, "green", { token: acked });
      u.run(["release", "--token", String(acked)]);
      return { u, held: u.claim(S2) };
    }

    it("a spent ack is refused, nothing recorded, no notice, and the later halt stays open", () => {
      const { u, held } = spentAck();
      u.appendRecord({ type: "guard", token: held, sha: S2, deploy: null, result: "unverified", evidence: "timeout" });
      const before = u.bytes();
      const noticed = fs.existsSync(u.notifyLog) ? fs.readFileSync(u.notifyLog, "utf8") : "";
      refused(u.run(["record-rollback", "--token", String(held), "--deploy", "dep-x", "--lee", "words about something else"]));
      expect(u.bytes()).toBe(before);
      expect(fs.readFileSync(u.notifyLog, "utf8")).toBe(noticed);
      expect(u.guard("dep-x", S, "green", { token: held }).code).toBe(0);
      expect(u.state().open_halts.map((h: { sha: string }) => h.sha)).toEqual([S2]);
    });

    it("a spent ack with no halt open is refused too", () => {
      const { u, held } = spentAck();
      refused(u.run(["record-rollback", "--token", String(held), "--deploy", "dep-x", "--lee", LEE]));
    });

    it("an unspent ack with a later halt open is refused until that halt closes", () => {
      const u = universe();
      u.publish("dep-x", S);
      u.run(["reconcile"]);
      u.run(["ack-deploy", "--deploy", "dep-x", "--lee", LEE]);
      u.appendRecord({ type: "halt", token: u.state().token, reason: "in flight", deploy: "dep-y", sha: S2 });
      refused(u.run(["record-rollback", "--deploy", "dep-x", "--lee", LEE]));
      u.run(["ack-deploy", "--deploy", "dep-y", "--lee", LEE]);
      expect(u.run(["record-rollback", "--deploy", "dep-x", "--lee", LEE]).code).toBe(0);
    });
  });

  describe("W1: rolling back to an older green has a door in either order", () => {
    function olderGreenUnclassifiable(): Universe {
      const u = universe();
      const a = u.deployed(S, "dep-a");
      u.guard("dep-a", S, "green", { token: a });
      u.run(["release", "--token", String(a)]);
      const b = u.deployed(S2, "dep-b");
      u.guard("dep-b", S2, "green", { token: b });
      u.run(["release", "--token", String(b)]);
      expect(u.state().known_good.deploy).toBe("dep-b");
      u.guard("dep-b", S2, "red");
      expect(u.state().known_good.deploy).toBe("dep-a");
      return u;
    }

    it("reconcile, record-rollback, then green closes the red and the unclassifiable", () => {
      const u = olderGreenUnclassifiable();
      u.publish("dep-genesis", G); // older than known-good dep-a: reconcile cannot classify it
      expect(u.run(["reconcile"]).code).toBe(3);
      expect(u.state().open_halts.map((h: { kind: string }) => h.kind)).toEqual(["red", "unclassifiable"]);
      expect(u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]).code).toBe(0);
      expect(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]).code).toBe(0);
      const held = u.state().token;
      expect(u.guard("dep-genesis", G, "green", { token: held }).code).toBe(0);
      expect(u.state().open_halts).toEqual([]);
      expect(u.state().known_good.deploy).toBe("dep-genesis");
    });

    it("reconcile, ack-deploy, record-rollback, then green closes both", () => {
      const u = olderGreenUnclassifiable();
      u.publish("dep-genesis", G);
      u.run(["reconcile"]);
      expect(u.run(["ack-deploy", "--deploy", "dep-genesis", "--lee", LEE]).code).toBe(0);
      expect(u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]).code).toBe(0);
      expect(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]).code).toBe(0);
      const held = u.state().token;
      expect(u.guard("dep-genesis", G, "green", { token: held }).code).toBe(0);
      expect(u.state().open_halts).toEqual([]);
    });

    it("R3: after a worded record-rollback, ack-deploy is refused and the rollback still closes the red", () => {
      const u = olderGreenUnclassifiable();
      u.publish("dep-genesis", G);
      u.run(["reconcile"]);
      expect(u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", LEE]).code).toBe(0);
      const bytes = u.bytes();
      const ack = u.run(["ack-deploy", "--deploy", "dep-genesis", "--lee", LEE]);
      refused(ack);
      expect(ack.out).toContain("already current");
      expect(u.bytes()).toBe(bytes);
      expect(u.state().current.rollback).toBe(true);
      expect(u.run(["claim", "--lane", "M", "--deploy", "dep-genesis", "--kind", "behaviour"]).code).toBe(0);
      const held = u.state().token;
      expect(u.guard("dep-genesis", G, "green", { token: held }).code).toBe(0);
      expect(u.state().open_halts).toEqual([]);
      expect(u.state().known_good.deploy).toBe("dep-genesis");
    });
  });

  it("W2: repair burns past the lease's token too, so it is never issued again", () => {
    const u = universe();
    const genesisLine = u.bytes();
    fs.mkdirSync(u.leaseDir);
    fs.writeFileSync(u.leaseFile, JSON.stringify({ token: 5, ts: "2026-11-01T12:00:00.000Z" }));
    expect(u.run(["status"]).code).toBe(3);
    const aside = path.join(u.root, "aside.jsonl");
    const fixed = path.join(u.root, "fixed.jsonl");
    fs.renameSync(u.ledgerPath, aside);
    fs.writeFileSync(fixed, genesisLine);
    expect(u.run(["repair-note", "--aside", aside, "--fixed", fixed, "--reason", "lease ahead"]).code).toBe(0);
    expect(u.state().token).toBe(6);
    expect(u.claim(S)).toBe(7);
  });

  describe("W3: a green that waited on another halt", () => {
    function greenWaiting(): Universe {
      const u = universe();
      const token = u.deployed(S, "dep-a");
      u.appendRecord({ type: "halt", token, reason: "x", deploy: "dep-stuck", sha: null });
      expect(u.guard("dep-a", S, "green", { token }).code).toBe(0);
      expect(u.state().known_good.deploy).toBe("dep-genesis");
      return u;
    }

    it("becomes known-good when the last halt closes", () => {
      const u = greenWaiting();
      expect(u.run(["ack-deploy", "--deploy", "dep-stuck", "--lee", LEE]).code).toBe(0);
      const st = u.state();
      expect(st.open_halts).toEqual([]);
      expect(st.known_good.deploy).toBe("dep-a");
    });

    it("does not, if it went red meanwhile", () => {
      const u = greenWaiting();
      const token = u.state().token;
      expect(u.guard("dep-a", S, "red", { token }).code).toBe(0);
      u.run(["ack-deploy", "--deploy", "dep-stuck", "--lee", LEE]);
      expect(u.state().known_good.deploy).toBe("dep-genesis");
    });

    it("a green that went red while waiting is never promoted by a later close", () => {
      const u = greenWaiting();
      const token = u.state().token;
      u.guard("dep-a", S, "red", { token });
      u.run(["ack-deploy", "--deploy", "dep-stuck", "--lee", LEE]);
      u.run(["authorize-corrective", "--token", String(token), "--sha", S2, "--lee", LEE]);
      u.run(["release", "--token", String(token)]);
      const held = u.claim(S2, "corrective");
      u.land("dep-b", S2);
      expect(u.guard("dep-b", S2, "green", { token: held }).code).toBe(0);
      expect(u.state().known_good.deploy).toBe("dep-b");
      // The stack beneath dep-b shows up when it goes red: dep-a must not be there.
      expect(u.guard("dep-b", S2, "red", { token: held }).code).toBe(0);
      expect(u.state().known_good.deploy).toBe("dep-genesis");
    });
  });
});

describe("words and notices", () => {
  const notifyLines = (u: Universe) =>
    fs.existsSync(u.notifyLog) ? fs.readFileSync(u.notifyLog, "utf8").trim().split("\n") : [];

  it.each(["", "   "])("--lee %j is refused at every door", (bad) => {
    const u = universe();
    const before = u.bytes();
    refused(u.run(["authorize-corrective", "--sha", S, "--lee", bad]));
    refused(u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", bad]));
    refused(u.run(["ack-deploy", "--deploy", "dep-x", "--lee", bad]));
    refused(u.guard("dep-genesis", G, "red", { lee: bad }));
    expect(u.bytes()).toBe(before);
  });

  it("red to green notifies with door and words", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    expect(notifyLines(u)).toEqual([]);
    u.guard("dep-a", S, "green", { token, lee: "Lee: lift it" });
    const lines = notifyLines(u);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("red to green");
    expect(lines[0]).toContain("Lee: lift it");
  });

  it("ack-deploy, record-rollback and authorize-corrective each notify", () => {
    const u = universe();
    u.run(["authorize-corrective", "--sha", S, "--lee", "words one"]);
    u.publish("dep-x", S2);
    u.run(["reconcile"]);
    u.run(["ack-deploy", "--deploy", "dep-x", "--lee", "words two"]);
    u.run(["record-rollback", "--deploy", "dep-genesis", "--lee", "words three"]);
    const lines = notifyLines(u);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("authorize-corrective");
    expect(lines[0]).toContain("words one");
    expect(lines[1]).toContain("ack-deploy");
    expect(lines[1]).toContain("words two");
    expect(lines[2]).toContain("record-rollback");
    expect(lines[2]).toContain("words three");
  });

  it("Lee's words reach the HTML channel escaped, and parse back to exactly what he said", () => {
    const u = universe();
    const said = `Lee: x<y & <b>ship</b> if a>b, "really" &amp; not`;
    expect(u.run(["authorize-corrective", "--sha", S, "--lee", said]).code).toBe(0);
    const [payload] = notifyLines(u);
    expect(payload).toContain(`Lee: x&lt;y &amp; &lt;b&gt;ship&lt;/b&gt; if a&gt;b, "really" &amp;amp; not`);
    expect(payload).not.toMatch(/<|>/);
    expect(u.records().at(-1)?.lee).toBe(said);
  });

  it("the failure fallback prints his words raw, for a human, not the escaped payload", () => {
    const u = universe();
    fs.writeFileSync(u.notifyFail, "");
    const res = u.run(["authorize-corrective", "--sha", S, "--lee", "a<b"]);
    expect(res.stderr).toContain(`"a<b"`);
  });

  it("words past Telegram's limit still deliver a notice, cut; the ledger keeps them whole", () => {
    const u = universe();
    const said = "L".repeat(5000);
    expect(u.run(["authorize-corrective", "--sha", S, "--lee", said]).code).toBe(0);
    const [payload] = notifyLines(u);
    expect(payload.length).toBeLessThanOrEqual(4096);
    expect(payload).toContain("[cut here; the ledger has them all]");
    expect(u.records().at(-1)?.lee).toBe(said);
  });

  it("a failing notifier blocks nothing, and says so", () => {
    const u = universe();
    fs.writeFileSync(u.notifyFail, "");
    const res = u.run(["authorize-corrective", "--sha", S, "--lee", "words"]);
    expect(res.code).toBe(0);
    expect(u.count("corrective-auth")).toBe(1);
    expect(res.stderr).toContain("notice to Lee failed");
  });

  it("request does not notify", () => {
    const u = universe();
    const token = u.claim(S);
    u.run(["request", "--token", String(token), "--sha", S, "--parent", G, "--approval", LEE, "--checks", "ok"]);
    expect(u.count("request")).toBe(1);
    expect(notifyLines(u)).toEqual([]);
  });

  it("summary --sha carries no words", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    u.guard("dep-a", S, "green", { token, lee: "PRIVATE WORDS" });
    const res = u.run(["summary", "--sha", S]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(S);
    expect(res.stdout).toContain("dep-a");
    expect(res.stdout).toContain("red,green");
    expect(res.out).not.toContain("PRIVATE WORDS");
    expect(u.bytes()).toContain("PRIVATE WORDS");
  });
});

describe("summary --unrecorded", () => {
  it("lists an unrecorded release, omits a recorded one and an abandoned one", () => {
    const u = universe();
    const repo = u.repo();
    const recorded = sha("a1");
    const unrecorded = sha("a2");
    const abandoned = sha("a3");
    repo.commit(".claude/handoff.md", `## Log\nreleased ${recorded}\n`);
    repo.pushMain();
    for (const [commit, id] of [
      [recorded, "dep-1"],
      [unrecorded, "dep-2"],
    ]) {
      const token = u.deployed(commit, id);
      u.guard(id, commit, "green", { token });
      u.run(["release", "--token", String(token)]);
    }
    const token = u.claim(abandoned);
    u.run(["release", "--token", String(token), "--abandon"]);
    const res = u.run(["summary", "--unrecorded"], { cwd: repo.dir });
    expect(res.code, res.out).toBe(0);
    expect(res.stdout).toContain(unrecorded);
    expect(res.stdout).not.toContain(recorded);
    expect(res.stdout).not.toContain(abandoned);
  });

  it("a failed origin read is nonzero", () => {
    const u = universe();
    const res = u.run(["summary", "--unrecorded"], { cwd: u.home });
    expect(res.code).toBe(1);
  });
});

describe("idempotence", () => {
  it("the same deploy twice: one record", () => {
    const u = universe();
    u.claim(S);
    u.publish("dep-a", S);
    expect(u.run(["reconcile"]).code).toBe(0);
    expect(u.run(["reconcile"]).code).toBe(0);
    expect(u.count("deploy")).toBe(1);
  });

  it("the same rollback twice: one record, words added once", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    u.publish("dep-genesis", G);
    u.run(["reconcile"]);
    u.run(["reconcile"]);
    expect(u.count("rollback")).toBe(1);
    expect(u.run(["record-rollback", "--token", String(token), "--deploy", "dep-genesis", "--lee", LEE]).code).toBe(0);
    expect(u.count("rollback")).toBe(2);
    expect(u.run(["record-rollback", "--token", String(token), "--deploy", "dep-genesis", "--lee", "again"]).code).toBe(0);
    expect(u.count("rollback")).toBe(2);
  });

  it("a repeated halt: one record, and NEW HALT printed once, while every read still exits 3", () => {
    const u = universe();
    u.publish("dep-direct", S);
    const first = u.run(["reconcile"]);
    const second = u.run(["reconcile"]);
    const third = u.run(["status"]);
    expect([first.code, second.code, third.code]).toEqual([3, 3, 3]);
    expect(u.count("halt")).toBe(1);
    expect(first.out).toContain("NEW HALT");
    expect(second.out).not.toContain("NEW HALT");
    expect(second.out).toContain("SCHEDULING HALTED");
    expect(third.out).not.toContain("NEW HALT");
  });

  it("the same request twice: one record; new words renew it", () => {
    const u = universe();
    const token = u.claim(S);
    const req = (approval: string) =>
      u.run(["request", "--token", String(token), "--sha", S, "--parent", G, "--approval", approval, "--checks", "ok"]);
    req(LEE);
    req(LEE);
    expect(u.count("request")).toBe(1);
    req("Lee, later: yes again");
    expect(u.count("request")).toBe(2);
  });
});

describe("reconcile's write rule", () => {
  it("a failed read is nonzero, writes nothing and is not a halt", () => {
    const u = universe();
    // Valid JSON naming an unknown deploy: only the exit status marks this read as failed.
    const body = JSON.stringify({ published_deploy: { id: "dep-unknown", state: "ready", commit_ref: S2 } });
    fs.writeFileSync(u.env().OC_RELEASE_NETLIFY_BIN, `#!/bin/sh\necho '${body}'\nexit 1\n`, { mode: 0o755 });
    const before = u.bytes();
    const res = u.run(["reconcile"]);
    expect(res.code).toBe(1);
    expect(u.bytes()).toBe(before);
    expect(u.run(["status"]).code).toBe(0);
  });
});

describe("torn read", () => {
  it("a writer completing its line under the mutex is not malformed", async () => {
    const u = universe();
    const line = `${JSON.stringify({ v: 1, ts: "2026-11-01T12:00:00.000Z", type: "install", token: 1, source_sha: S, lee: "x" })}\n`;
    const cut = 20;
    fs.appendFileSync(u.ledgerPath, line.slice(0, cut));
    u.holdMutex();
    const pending = u.runAsync(["status"]);
    await new Promise((resolve) => setTimeout(resolve, 800));
    fs.appendFileSync(u.ledgerPath, line.slice(cut));
    fs.rmSync(u.mutexDir, { recursive: true });
    const res = await pending;
    expect(res.code, res.out).toBe(0);
  });

  it("a line still torn under the mutex is malformed", async () => {
    const u = universe();
    fs.appendFileSync(u.ledgerPath, '{"v":1,"ts"');
    u.holdMutex();
    const pending = u.runAsync(["status"]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    fs.rmSync(u.mutexDir, { recursive: true });
    const res = await pending;
    expect(res.code, res.out).toBe(3);
    expect(res.out).toContain("SCHEDULING HALTED");
  });
});

describe("corrective", () => {
  it("is bound to its SHA and consumed by record-push", () => {
    const u = universe();
    const repo = u.repo();
    repo.commit("a.txt", "one");
    repo.pushMain();
    const A = repo.commit("a.txt", "two");
    const token = u.deployed(S, "dep-a");
    u.guard("dep-a", S, "red", { token });
    u.run(["release", "--token", String(token)]);
    expect(u.run(["authorize-corrective", "--sha", A, "--lee", LEE]).code).toBe(0);

    const claimFor = (commit: string) => u.run(["claim", "--lane", "M", "--sha", commit, "--kind", "corrective"]);
    refused(claimFor(S2));
    const accepted = claimFor(A);
    expect(accepted.code, accepted.out).toBe(0);
    const held = u.state().token;
    expect(u.state().correctives[A].consumed).toBe(false);

    repo.pushMain();
    expect(u.run(["record-push", "--token", String(held), "--sha", A], { cwd: repo.dir }).code).toBe(0);
    expect(u.state().correctives[A].consumed).toBe(true);
    expect(u.run(["release", "--token", String(held)]).code).toBe(0);
    const before = u.count("claim");
    refused(claimFor(A));
    expect(u.count("claim")).toBe(before);
  });
});

describe("negative control", () => {
  it("is accepted on instrumentation, with no halt", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a", "instrumentation");
    const res = u.guard("dep-a", S, "negative-control", { token });
    expect(res.code, res.out).toBe(0);
    expect(u.count("negative-control")).toBe(1);
    expect(u.state().open_halts).toEqual([]);
    expect(u.state().predecessor).toBeNull();
  });

  it("is refused on behaviour", () => {
    const u = universe();
    const token = u.deployed(S, "dep-a", "behaviour");
    refused(u.guard("dep-a", S, "negative-control", { token }));
    expect(u.count("negative-control")).toBe(0);
  });
});

describe("path safety", () => {
  const fakeReal = (u: Universe) => path.join(u.home, "marvin", "state");

  it("VITEST with no override: exit 2, nothing written under HOME", () => {
    const u = new Universe();
    const res = u.run(["status"], { unset: ["OC_RELEASE_STATE_DIR"] });
    expect(res.code, res.out).toBe(2);
    expect(fs.existsSync(fakeReal(u))).toBe(false);
  });

  it("an override inside the real state dir: exit 2", () => {
    const u = new Universe();
    const res = u.run(["status"], { env: { OC_RELEASE_STATE_DIR: path.join(fakeReal(u), "inner") } });
    expect(res.code, res.out).toBe(2);
    expect(res.out).toContain("real state dir");
  });

  it("no override and no VITEST: writes land under the fake HOME, proving the default, and seams are ignored", () => {
    const u = new Universe();
    const stateDir = fakeReal(u);
    fs.mkdirSync(stateDir, { recursive: true });
    const ledger = path.join(stateDir, "opencanopy-releases.jsonl");
    const genesis = { v: 1, ts: "2026-11-01T12:00:00.000Z", type: "genesis", token: 1, deploy: "d", sha: G, evidence: "e" };
    fs.writeFileSync(ledger, `${JSON.stringify(genesis)}\n`);
    const res = u.run(["authorize-corrective", "--sha", S, "--lee", "words"], {
      unset: ["VITEST", "OC_RELEASE_STATE_DIR"],
      env: { OC_RELEASE_NOW: "2001-01-01T00:00:00.000Z", OC_RELEASE_CRASH_AT: "claim-after-mkdir" },
    });
    expect(res.code, res.out).toBe(0);
    const lines = fs.readFileSync(ledger, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const written = JSON.parse(lines[1]);
    expect(written.type).toBe("corrective-auth");
    expect(written.ts.startsWith("2001")).toBe(false);
    expect(fs.existsSync(u.ledgerPath)).toBe(false);
    expect(fs.existsSync(u.notifyLog)).toBe(false);
  });

  it("override set and no VITEST: check-push exits 2", () => {
    const u = universe();
    const res = u.run(["check-push", "--token", "1"], { unset: ["VITEST"] });
    expect(res.code, res.out).toBe(2);
  });

  it("check-push in a universe with no lease and no gate reads NO-GO, never a GO", () => {
    const u = universe();
    const res = u.run(["check-push", "--token", "1"]);
    expect(res.code).toBe(1);
    expect(res.out).toContain("NO-GO");
    expect(res.stdout).not.toContain("GO sha=");
  });
});
