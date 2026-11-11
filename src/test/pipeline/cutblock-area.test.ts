// @vitest-environment node
/**
 * MEASURE (plan 2026-11-measure-fix): the logged-hectares count. Runs the real Python
 * builder, scripts/build-scrub-tables.py, as a subprocess on the committed fixture
 * (scripts/fixtures/cutblock-area/, shared with C5b's TypeScript twin) and checks its
 * output against expected values worked by hand from the fixture's square sizes.
 *
 * The fixture covers: two overlapping same-year squares, one overlapping an earlier
 * year, a large-drawn small-recorded boundary, a self-intersecting bowtie, a
 * MultiPolygon, a polygon with a hole (and a later block inside the hole), a same-year
 * pair straddling a 10 km tile edge, recorded area exactly 2,000, the years 1949, 1950,
 * 2025, 2026, a malformed line, an undated block, a malformed date value ("19xx-01-01",
 * undated) and a degenerate ring.
 *
 * Outputs go to a temp dir through the builder's VITEST-fenced overrides; the committed
 * cutblocks-scrub.json and crosscheck.json are asserted byte-identical before and after.
 *
 * Needs python3 with shapely and pyproj (CI pins shapely 2.1.2, pyproj 3.7.2). Under CI
 * a missing interpreter or library FAILS this file; elsewhere it skips with a reason.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

const ROOT = path.resolve(__dirname, "../../..");
const BUILDER = path.join(ROOT, "scripts/build-scrub-tables.py");
const OVERLAYS = path.join(ROOT, "scripts/build-year-overlays.py");
const FIXTURE_DIR = path.join(ROOT, "scripts/fixtures/cutblock-area");
const FIXTURE = path.join(FIXTURE_DIR, "tenure-cutblocks.ndjson");
const EXPECTED_PATH = path.join(FIXTURE_DIR, "expected.json");
const COMMITTED = [
  path.join(ROOT, "src/data/scrub/cutblocks-scrub.json"),
  path.join(ROOT, "research/measure-2026-11/crosscheck.json"),
];
const PY = "python3";

const probe = spawnSync(PY, ["-c", "import shapely, pyproj; print(shapely.__version__, pyproj.__version__)"], {
  encoding: "utf8",
});
const pythonReady = probe.status === 0;
if (!pythonReady && process.env.CI) {
  throw new Error(`CI must run the cutblock-area fixture test: python3 with shapely and pyproj is missing (${probe.stderr || probe.error})`);
}

type Expected = {
  buckets: Record<string, number>;
  repaired: number;
  emptyAfterRepair: number;
  sumDrawnKeptHa: number;
  drawnOnlyBoundaryHa: number;
  shippedTotalHa: number;
  annualHa: Record<string, number>;
  totalHa: number;
};
const EXPECTED: Expected = JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf8"));

const tmpRoots: string[] = [];
afterAll(() => {
  for (const d of tmpRoots.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "cutblock-area-"));
  tmpRoots.push(d);
  return d;
}

/** The builder's environment: this process's, minus any stray seams, plus `extra`. */
function env(extra: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith("OC_SCRUB_") && k !== "VITEST") out[k] = v;
  }
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) out[k] = v;
  return out as unknown as NodeJS.ProcessEnv;
}

function runBuilder(extra: Record<string, string | undefined>) {
  const r = spawnSync(PY, [BUILDER, "--dataset", "cutblocks"], { cwd: ROOT, env: env(extra), encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` };
}

function fixtureRun(expectPath = EXPECTED_PATH) {
  const dir = tmpDir();
  const scrub = path.join(dir, "scrub.json");
  const cross = path.join(dir, "crosscheck.json");
  const r = runBuilder({
    VITEST: "1",
    OC_SCRUB_INPUT: FIXTURE,
    OC_SCRUB_EXPECT: expectPath,
    OC_SCRUB_OUT: scrub,
    OC_SCRUB_CROSSCHECK: cross,
  });
  return { ...r, dir, scrub, cross };
}

const snapshot = () => COMMITTED.map((p) => (fs.existsSync(p) ? fs.readFileSync(p).toString("base64") : null));

function expectAnnual(annual: Record<string, number>) {
  for (let y = 1950; y <= 2025; y++) {
    const want = EXPECTED.annualHa[String(y)] ?? 0;
    expect(annual[String(y)], `annual ${y}`).toBeCloseTo(want, 2);
  }
}

describe.skipIf(!pythonReady)("logged hectares: the builder on the committed fixture", () => {
  let before: (string | null)[] = [];
  let after: (string | null)[] = [];
  let run: ReturnType<typeof fixtureRun>;
  beforeAll(() => {
    before = snapshot();
    run = fixtureRun();
    after = snapshot();
  });

  it("exits 0 and prints a closing accounting line and both totals", () => {
    expect(run.status, run.out).toBe(0);
    expect(run.out).toMatch(/accounting: read 19 = kept 11 \+ undated 2 \+ preStart 1 \+ postEnd 1 \+ boundaryRecorded 1 \+ boundaryDrawn 1 \+ zeroArea 1 \+ unparseable 1 \(closes\)/);
    expect(run.out).toMatch(/total, method 1 \(rank union\): 576\.00 ha/);
    expect(run.out).toMatch(/total, method 2 \(tile union\): 576\.00 ha/);
  });

  it("leaves the committed scrub table and crosscheck byte-identical", () => {
    expect(after).toEqual(before);
  });

  it("the total is the dissolved union: overlaps once, holes respected, boundaries and out-of-range years out", () => {
    const table = JSON.parse(fs.readFileSync(run.scrub, "utf8"));
    expect(table.total).toBeCloseTo(EXPECTED.totalHa, 2);
    expect(table.total).toBeLessThan(EXPECTED.sumDrawnKeptHa);
    expect(table.start).toBe(1950);
    expect(table.end).toBe(2025);
    expect(table.cumulativeNorm).toHaveLength(76);
    expect(table.cumulativeNorm[0]).toBe(0);
    expect(table.cumulativeNorm[75]).toBe(1);
    // 1995 is the straddling pair; through 1995 the cumulative is 10+50+50+75+16+165.
    expect(table.cumulativeNorm[1995 - 1950]).toBeCloseTo(366 / 576, 5);
  });

  it("declares its measure, cap rule, cap and checkpoint identity", () => {
    const table = JSON.parse(fs.readFileSync(run.scrub, "utf8"));
    const bytes = fs.readFileSync(FIXTURE);
    expect(table.areaMeasure).toBe("dissolved-union-drawn-ha");
    expect(table.areaCapRule).toBe("max(recorded, drawn) >= 2000");
    expect(table.areaCap).toBe(2000);
    expect(table.checkpoint).toEqual({
      manifestTimestamp: "fixture-area-contract-v1",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  });

  it("both methods agree year by year with the hand-worked union", () => {
    const cross = JSON.parse(fs.readFileSync(run.cross, "utf8"));
    expectAnnual(cross.methods.rankUnion.annualHa);
    expectAnnual(cross.methods.tileUnion.annualHa);
    expect(cross.methods.tileUnion.tiles).toBeGreaterThan(1);
    expect(cross.methods.rankUnion.totalHa).toBe(JSON.parse(fs.readFileSync(run.scrub, "utf8")).total);
  });

  it("a malformed date value lands in the undated bucket, not in a year", () => {
    const cross = JSON.parse(fs.readFileSync(run.cross, "utf8"));
    const lines = fs.readFileSync(FIXTURE, "utf8").trim().split("\n");
    expect(lines.some((l) => l.includes('"DISTURBANCE_START_DATE": "19xx-01-01"'))).toBe(true);
    expect(cross.accounting.undated).toBe(2);
    expect(cross.accounting.unparseable).toBe(1);
  });

  it("buckets every line exactly once, repairs the bowtie, measures the boundaries", () => {
    const cross = JSON.parse(fs.readFileSync(run.cross, "utf8"));
    for (const [k, v] of Object.entries(EXPECTED.buckets)) expect(cross.accounting[k], k).toBe(v);
    expect(cross.accounting.repaired).toBe(2);
    expect(cross.accounting.emptyAfterRepair).toBe(1);
    expect(cross.sumDrawnKeptHa).toBeCloseTo(711, 2);
    expect(cross.drawnOnlyBoundaryHa).toBeCloseTo(2500, 2);
    expect(cross.box.measuredHa).toBeCloseTo(200, 2);
  });
});

describe.skipIf(!pythonReady)("logged hectares: the run stops, and writes nothing, when a check fails", () => {
  function withProfile(patch: (e: Record<string, unknown>) => void) {
    const e = JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf8"));
    patch(e);
    const p = path.join(tmpDir(), "expect.json");
    fs.writeFileSync(p, JSON.stringify(e));
    return fixtureRun(p);
  }

  it("check 0: a bucket count that differs from the measured profile", () => {
    const r = withProfile((e) => ((e.buckets as Record<string, number>).kept = 12));
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/check 0: kept set differs from the measured counts: kept 11 != 12/);
    expect(fs.existsSync(r.scrub) || fs.existsSync(r.cross)).toBe(false);
  });

  it("check 2: a total that does not fall below the shipped figure", () => {
    const r = withProfile((e) => (e.shippedTotalHa = 575.9));
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/check 2: total 576\.00 is not below the shipped 575\.90/);
    expect(fs.existsSync(r.scrub) || fs.existsSync(r.cross)).toBe(false);
  });

  it("check 4 and the band: a box that does not reproduce, a total outside the band", () => {
    const box = withProfile((e) => ((e.box as Record<string, number>).expectHa = 210));
    expect(box.status, box.out).toBe(3);
    expect(box.out).toMatch(/check 4: fixture group 0: 200\.00 ha vs 210\.00/);
    const band = withProfile((e) => (e.band = [580, 590]));
    expect(band.status, band.out).toBe(3);
    expect(band.out).toMatch(/check band: total 576\.00 outside the plausibility band/);
  });

  it("an unknown checkpoint with no profile stops at check 0", () => {
    const dir = tmpDir();
    const r = runBuilder({
      VITEST: "1",
      OC_SCRUB_INPUT: FIXTURE,
      OC_SCRUB_OUT: path.join(dir, "s.json"),
      OC_SCRUB_CROSSCHECK: path.join(dir, "c.json"),
    });
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/check 0: no measured acceptance profile for checkpoint \('fixture-area-contract-v1', \d+\)/);
  });
});

/**
 * One test per hard stop that the profile alone cannot make fire. Check 0's clauses are
 * driven by the expectations profile; checks 1, 2b and 3 by a harness that imports the
 * real builder, wraps ONE method's result, and runs main() on the fixture. Each case is
 * built so that only the check under test fails: with that check deleted the run
 * completes (exit 0), so the test goes red.
 */
describe.skipIf(!pythonReady)("logged hectares: every hard stop is seen to fire", () => {
  function patchedProfile(patch: (e: Record<string, unknown>) => void): string {
    const e = JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf8"));
    patch(e);
    const p = path.join(tmpDir(), "expect.json");
    fs.writeFileSync(p, JSON.stringify(e));
    return p;
  }

  /** Runs the builder in-process with `wrap` (Python statements) applied to the module `m`. */
  function harness(wrap: string, expectPath = EXPECTED_PATH) {
    const dir = tmpDir();
    const scrub = path.join(dir, "scrub.json");
    const cross = path.join(dir, "crosscheck.json");
    const code = [
      "import importlib.util, sys",
      `spec = importlib.util.spec_from_file_location('scrub', ${JSON.stringify(BUILDER)})`,
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      wrap,
      "sys.argv = ['build-scrub-tables.py', '--dataset', 'cutblocks']",
      "m.main()",
    ].join("\n");
    const r = spawnSync(PY, ["-c", code], {
      cwd: ROOT,
      env: env({ VITEST: "1", OC_SCRUB_INPUT: FIXTURE, OC_SCRUB_EXPECT: expectPath, OC_SCRUB_OUT: scrub, OC_SCRUB_CROSSCHECK: cross }),
      encoding: "utf8",
    });
    return { status: r.status, out: `${r.stdout}\n${r.stderr}`, scrub, cross };
  }

  const nothingWritten = (r: { scrub: string; cross: string }) =>
    expect(fs.existsSync(r.scrub) || fs.existsSync(r.cross)).toBe(false);

  it("the harness itself, unwrapped, completes (so a red below is the check, not the harness)", () => {
    const r = harness("pass");
    expect(r.status, r.out).toBe(0);
    expect(fs.existsSync(r.scrub)).toBe(true);
  });

  it.each([
    ["repaired", (e: Record<string, unknown>) => (e.repaired = 3), /measured counts: repaired 2 != 3\. Nothing written/],
    ["emptyAfterRepair", (e: Record<string, unknown>) => (e.emptyAfterRepair = 2), /measured counts: emptyAfterRepair 1 != 2\. Nothing written/],
    ["sumDrawnKeptHa", (e: Record<string, unknown>) => (e.sumDrawnKeptHa = 711.01), /measured counts: sumDrawnKeptHa 711\.00 != 711\.01\. Nothing written/],
    ["drawnOnlyBoundaryHa", (e: Record<string, unknown>) => (e.drawnOnlyBoundaryHa = 2500.01), /measured counts: drawnOnlyBoundaryHa 2500\.00 != 2500\.01\. Nothing written/],
  ])("check 0, %s clause", (_name, patch, message) => {
    const r = fixtureRun(patchedProfile(patch));
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(message);
    nothingWritten(r);
  });

  it("check 1: one year disagrees between methods while the totals still agree", () => {
    // Move 2 ha of the tile method's 2000 into 2010: totals unchanged (check 3 passes).
    const r = harness(
      [
        "orig = m.tile_union_annual",
        "def wrapped(g, y, *a):",
        "    annual, tiles = orig(g, y, *a)",
        "    annual[2000] -= 2.0; annual[2010] += 2.0",
        "    return annual, tiles",
        "m.tile_union_annual = wrapped",
      ].join("\n")
    );
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/check 1: annual\[2000\] differs between methods by 2\.0000 ha \(rank 150\.0000, tile 148\.0000\)/);
    nothingWritten(r);
  });

  it("check 3: every year within 1 ha, the totals 1.8 ha apart", () => {
    const r = harness(
      [
        "orig = m.tile_union_annual",
        "def wrapped(g, y, *a):",
        "    annual, tiles = orig(g, y, *a)",
        "    annual[1980] += 0.9; annual[1985] += 0.9",
        "    return annual, tiles",
        "m.tile_union_annual = wrapped",
      ].join("\n")
    );
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/check 1 PASS/);
    expect(r.out).toMatch(/check 3: totals differ by -1\.8000 ha/);
    nothingWritten(r);
  });

  it("check 2, drawn-sum half: both methods report a union at or above the plain sum", () => {
    // Both methods inflated alike (checks 1 and 3 agree); shipped figure and band widened
    // so only the drawn-sum comparison can stop the run.
    const expectPath = patchedProfile((e) => {
      e.shippedTotalHa = 10000;
      e.band = [0, 10000];
    });
    const r = harness(
      [
        "o_rank, o_tile = m.rank_union_annual, m.tile_union_annual",
        "def rank(g, y):",
        "    a = o_rank(g, y); a[2000] += 200.0; return a",
        "def tile(g, y, *x):",
        "    a, t = o_tile(g, y, *x); a[2000] += 200.0; return a, t",
        "m.rank_union_annual, m.tile_union_annual = rank, tile",
      ].join("\n"),
      expectPath
    );
    expect(r.status, r.out).toBe(3);
    expect(r.out).toMatch(/check 2: total 776\.00 is not below the sum of drawn area 711\.00 \(a sum, not a union\)/);
    nothingWritten(r);
  });
});

describe.skipIf(!pythonReady)("logged hectares: the output overrides are fenced", () => {
  it("refuses a seam without VITEST, before reading anything", () => {
    const r = runBuilder({ OC_SCRUB_OUT: path.join(tmpDir(), "s.json") });
    expect(r.status, r.out).toBe(2);
    expect(r.out).toMatch(/REFUSED \(nothing read, nothing written\): OC_SCRUB_OUT set without VITEST/);
  });

  it("under VITEST, refuses a run with no output overrides or one aimed at a committed file", () => {
    const none = runBuilder({ VITEST: "1", OC_SCRUB_INPUT: FIXTURE });
    expect(none.status, none.out).toBe(2);
    expect(none.out).toMatch(/VITEST is set and OC_SCRUB_OUT is absent/);
    const aimed = runBuilder({
      VITEST: "1",
      OC_SCRUB_INPUT: FIXTURE,
      OC_SCRUB_OUT: COMMITTED[0],
      OC_SCRUB_CROSSCHECK: path.join(tmpDir(), "c.json"),
    });
    expect(aimed.status, aimed.out).toBe(2);
    expect(aimed.out).toMatch(/cutblocks-scrub\.json is a committed output/);
  });
});

describe.skipIf(!pythonReady)("the overlay builder applies the same cap and repair", () => {
  it("drops both boundaries, paints the repaired bowtie, bins undated and 1949 as baseline", () => {
    const code = [
      "import importlib.util, json, sys",
      `spec = importlib.util.spec_from_file_location('ov', ${JSON.stringify(OVERLAYS)})`,
      "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
      "cfg = m.DATASETS['cutblocks']",
      `by, counts, st = m.load_year_groups(${JSON.stringify(FIXTURE)}, cfg, cfg['start'], cfg['end'])`,
      "print(json.dumps({'counts': counts, 'years': {str(k): len(v) for k, v in by.items()}, 'repaired': st.repaired,",
      "  'bowtie': by[1975][0]['type'], 'raster_libs': 'rasterio' in sys.modules}))",
    ].join("\n");
    const r = spawnSync(PY, ["-c", code], { cwd: ROOT, env: env({}), encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const got = JSON.parse(r.stdout.trim().split("\n").pop()!);
    expect(got.counts).toMatchObject({
      read: 19,
      unparseable: 1,
      capped_recorded: 1,
      capped_drawn: 1,
      empty_after_repair: 1,
      undated: 3,
      after_end: 1,
      painted: 14,
    });
    expect(got.years).toEqual({
      "1949": 3, "1950": 1, "1975": 1, "1980": 1, "1985": 1, "1986": 1, "1995": 2, "2000": 2, "2010": 1, "2025": 1,
    });
    expect(got.repaired).toBe(2);
    expect(got.bowtie).toBe("MultiPolygon");
    expect(got.raster_libs).toBe(false);
  });
});
