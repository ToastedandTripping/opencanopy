#!/usr/bin/env python3
"""
Build nonlinear scrub tables for the scrollytelling timeline + fire beats.

Each table maps scroll progress [0,1] -> year by INVERTING the cumulative
disturbed-area curve. The story scrub then spends screen time in proportion
to how much was lost in each period: sparse early decades compress, the
modern acceleration stretches. The pacing IS the data.

Emits one JSON per dataset:
  src/data/scrub/cutblocks-scrub.json   logged hectares by DISTURBANCE_START_DATE year (1950-2025),
                                        the dissolved union of drawn area (see below)
  src/data/scrub/fire-scrub.json        cumulative FIRE_SIZE_HECTARES by FIRE_YEAR (1917-2025)
and, for cutblocks, the evidence file research/measure-2026-11/crosscheck.json.

Shape:
  { "start": 1950, "end": 2025, "cumulativeNorm": [ ... one float per year, monotonic 0..1 ... ], "total": 1234567.89, ... }

`cumulativeNorm[i]` is the fraction of total area disturbed by year `start+i`,
inclusive. `cumulativeNorm[0]` is pinned to 0.0 and `[last]` to 1.0 so the
runtime inverse lookup yields exactly `start` at progress 0 and `end` at
progress 1 (boundary invariant the unit test asserts).

`total` is the absolute area (hectares) the normalized curve is a fraction
of -- `total * cumulativeNorm[i]` recovers a real "X ha through year Y"
figure (Phase A honest-timeline readout).

Logged hectares (cutblocks), since 2026-11 (plan 2026-11-measure-fix):
  - Kept set: FTEN cutblocks dated 1950-2025 by DISTURBANCE_START_DATE. Undated,
    pre-1950 and post-2025 blocks are out (a pre-1950 block is no longer folded
    into 1950). Tenure boundaries are out: max(recorded, drawn) >= 2,000 ha, the
    shared rule in scripts/lib/cutblock_area.py, drawn area measured on the
    repaired geometry in EPSG:3005.
  - Area: the dissolved union of drawn area, so overlapping and re-harvested
    blocks count once. Each kept polygon has a rank (year, then input order) and
    contributes new(p) = area(p - union(intersecting polygons of lower rank));
    annual[y] is the sum of new(p) over year y and total is the sum of annual.
  - Acceptance checks run inside the build and stop it (exit 3, nothing written)
    on any failure: 0 the bucket accounting equals the measured counts for this
    checkpoint; 1 every annual[y] equals an independent tile-union method's
    per-year increment within 1 ha; 2 total is under the shipped figure and
    under the plain sum of drawn area; 3 the two totals agree within 1 ha;
    4 the 2026-10-08 Fort Nelson box reproduces within 0.5%; plus the
    plausibility band. The JSON and crosscheck.json are written last.
  - Fire is unchanged (fires are dated and capless).

Every geometry error is fatal; only an unparseable JSON line is skipped, and it is
counted in the accounting line:
  read = kept + undated + pre-1950 + post-2025 + tenure-boundary + zero-area + unparseable

Test seams (the same fence shape as scripts/heavy-run.mjs): OC_SCRUB_INPUT,
OC_SCRUB_EXPECT, OC_SCRUB_OUT and OC_SCRUB_CROSSCHECK are honoured only when VITEST
is set, and refused otherwise. Under VITEST both output overrides are required
and may not point at the committed files.

The dataset start/end MUST match the matching *_OVERLAY_RANGE constant in
src/lib/story/setup-layers.ts (a TS-side assertion enforces this at import).

Usage:
  python3 scripts/build-scrub-tables.py            # both datasets
  python3 scripts/build-scrub-tables.py --dataset fire
  node scripts/heavy-run.mjs --job scrub-cutblocks -- python3 scripts/build-scrub-tables.py --dataset cutblocks
"""

import argparse
import hashlib
import json
import math
import os
import resource
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import shapely
from shapely import STRtree, box

_PROJECT_ROOT = Path(__file__).parent.parent
_OUTPUT_DIR = _PROJECT_ROOT / "src" / "data" / "scrub"
_CROSSCHECK_PATH = _PROJECT_ROOT / "research" / "measure-2026-11" / "crosscheck.json"

sys.path.insert(0, str(Path(__file__).parent / "lib"))
import cutblock_area as ca  # noqa: E402  (the shared rule lives beside the TS libs)


def _data_path(filename: str) -> Path:
    candidates = [
        _PROJECT_ROOT / "data" / "checkpoint" / "preprocessed" / filename,
        Path.home() / "Projects" / "opencanopy" / "data" / "checkpoint" / "preprocessed" / filename,
    ]
    return next((p for p in candidates if p.exists()), candidates[0])


# Mirrors the build-year-overlays.py / setup-layers.ts ranges. Keep in sync.
DATASETS = {
    "cutblocks": {
        "filename": "tenure-cutblocks.ndjson",
        "out": "cutblocks-scrub.json",
        "year_field": "DISTURBANCE_START_DATE",
        "year_kind": "date",
        "start": 1950,
        "end": 2025,
    },
    "fire": {
        "filename": "fire-history.ndjson",
        "out": "fire-scrub.json",
        "year_field": "FIRE_YEAR",
        "year_kind": "int",
        "area_field": "FIRE_SIZE_HECTARES",
        "start": 1917,
        "end": 2025,
    },
}

AREA_MEASURE = "dissolved-union-drawn-ha"
AREA_CAP_RULE = "max(recorded, drawn) >= 2000"
TILE_M = 10_000            # the second method's fixed grid, EPSG:3005 metres from the origin
AGREE_HA = 1.0             # checks 1 and 3: per-year and total agreement
EXACT_HA = 0.005           # check 0's measured areas, compared at 0.01 ha

EXIT_REFUSED = 2           # a test seam outside VITEST, or a VITEST run aimed at committed files
EXIT_ACCEPTANCE = 3        # an acceptance check failed: nothing written

# Check 0 and the real-data checks, keyed on the checkpoint's identity (manifest
# timestamp, file bytes). Measured independently by critic r2, 2026-11-10
# (.claude/plans/2026-11-measure-fix-critic-r2.md); the plan's Design, "Acceptance".
# A checkpoint with no entry here stops the run: a new pull is measured first.
_FORT_NELSON = {
    # The 2026-10-08 sparse box (accuracy report 1.2): regions.py cells 674-708 x 68-85
    # of the 1024 x 501 grid from (-139.5, 60.5), cell 25.5/1024 deg by 12.5/501 deg.
    "name": "Fort Nelson, 2026-10-08 accuracy report 1.2",
    "bounds": [-122.7158203125, 58.37924151696607, -121.869140625, 58.80339321357285],
    "year": 2025,
    "expectHa": 1418.0,
    "tolerancePct": 0.5,
}
ACCEPTANCE = {
    ("2026-05-06T15:26:00.354Z", 1863260083): {
        "buckets": {
            "read": 220745,
            "kept": 183725,
            "undated": 36608,
            "preStart": 1,            # dated year 1200, an entry error
            "postEnd": 332,
            "boundaryRecorded": 70,
            "boundaryDrawn": 9,       # the nine: drawn >= 2,000 ha, recorded under it
            "zeroArea": 0,
            "unparseable": 0,
        },
        # Counted among dated 1950-2025 blocks recorded under the cap, the set whose
        # geometry is measured (the recorded-area test needs no geometry).
        "repaired": 431,
        "emptyAfterRepair": 0,
        "sumDrawnKeptHa": 5875854.39,
        "drawnOnlyBoundaryHa": 83233.26,
        "shippedTotalHa": 5888477.44,
        "band": [5_650_000.0, 5_810_000.0],
        "box": _FORT_NELSON,
    },
}

BUCKETS = ["kept", "undated", "preStart", "postEnd", "boundaryRecorded", "boundaryDrawn", "zeroArea", "unparseable"]


def parse_year(raw, kind: str):
    if raw is None:
        return None
    s = str(raw)
    token = s[:4] if kind == "date" else s.strip()
    return int(token) if token.isdigit() else None


def build(dataset: str) -> dict:
    cfg = DATASETS[dataset]
    path = _data_path(cfg["filename"])
    if not path.exists():
        print(f"  ERROR: {path} not found", file=sys.stderr)
        sys.exit(1)

    start, end = cfg["start"], cfg["end"]
    year_field, year_kind, area_field = cfg["year_field"], cfg["year_kind"], cfg["area_field"]
    max_area = cfg.get("max_area")

    # Annual area drives the pacing. UNDATED features (no parseable year) are
    # EXCLUDED — their timing is unknown, so they can't inform when the scrub
    # should linger; they're shown spatially in the baseline beat instead.
    # Including them would inflate the early-year curve and defeat the whole
    # point (compress the sparse early decades). Dated features before `start`
    # fold into `start` (they belong to the first frame).
    annual = {y: 0.0 for y in range(start, end + 1)}
    rows = 0
    folded = 0
    undated_skipped = 0
    capped_skipped = 0

    print(f"=== scrub table: {dataset} ===")
    print(f"  input: {path}")
    with open(path) as f:
        for line in f:
            try:
                feat = json.loads(line)
                props = feat.get("properties", {})
                yr = parse_year(props.get(year_field), year_kind)
                area = props.get(area_field)
                area = float(area) if area is not None else 0.0
                if area <= 0:
                    continue
                if max_area is not None and area >= max_area:
                    capped_skipped += 1
                    continue
                if yr is None:
                    undated_skipped += 1
                    continue
                if yr < start:
                    yr = start
                    folded += 1
                elif yr > end:
                    continue
                annual[yr] += area
                rows += 1
            except Exception:
                continue

    total = sum(annual.values())
    if total <= 0:
        print(f"  ERROR: zero total area for {dataset}", file=sys.stderr)
        sys.exit(1)

    # Cumulative, normalized, endpoints pinned exactly to 0.0 / 1.0.
    cumulative_norm = []
    running = 0.0
    years = list(range(start, end + 1))
    for i, y in enumerate(years):
        running += annual[y]
        if i == 0:
            cumulative_norm.append(0.0)            # pin start -> 0
        elif i == len(years) - 1:
            cumulative_norm.append(1.0)            # pin end -> 1
        else:
            cumulative_norm.append(round(running / total, 6))

    # Monotonic non-decreasing guard (rounding can't break it, but assert anyway).
    for i in range(1, len(cumulative_norm)):
        if cumulative_norm[i] < cumulative_norm[i - 1]:
            cumulative_norm[i] = cumulative_norm[i - 1]

    table = {"start": start, "end": end, "cumulativeNorm": cumulative_norm, "total": round(total, 2)}
    if max_area is not None:
        table["areaCap"] = max_area

    # Report a few inflection points so the pacing is reviewable.
    print(f"  features: {rows:,} dated ({folded:,} folded into {start}, {undated_skipped:,} undated skipped, {capped_skipped:,} at/over the {max_area} ha cap skipped)")
    print(f"  total area: {total:,.0f}")
    for probe in (start, start + 30, start + 50, end - 8, end):
        if start <= probe <= end:
            print(f"    by {probe}: {cumulative_norm[probe - start] * 100:5.1f}% of total")
    return table


class AcceptanceFailure(Exception):
    """An acceptance check failed. The run stops and writes nothing."""


def _fail(check: str, msg: str):
    raise AcceptanceFailure(f"check {check}: {msg}")


# ── Test seams (fenced) ─────────────────────────────────────────

SEAMS = ["OC_SCRUB_INPUT", "OC_SCRUB_EXPECT", "OC_SCRUB_OUT", "OC_SCRUB_CROSSCHECK"]


def _refuse(msg: str):
    print(f"  REFUSED (nothing read, nothing written): {msg}", file=sys.stderr)
    sys.exit(EXIT_REFUSED)


def resolve_paths(targets: list) -> dict:
    """The input, profile and output paths, after the VITEST fence."""
    env = os.environ
    committed_scrub = (_OUTPUT_DIR / DATASETS["cutblocks"]["out"]).resolve()
    committed_cross = _CROSSCHECK_PATH.resolve()
    if not env.get("VITEST"):
        set_ = [name for name in SEAMS if env.get(name) is not None]
        if set_:
            _refuse(f"{', '.join(set_)} set without VITEST")
        return {"input": None, "expect": None, "scrub": committed_scrub, "crosscheck": committed_cross}
    if targets != ["cutblocks"]:
        _refuse("VITEST is set: only --dataset cutblocks may run (fire would write the committed fire-scrub.json)")
    for name in ("OC_SCRUB_OUT", "OC_SCRUB_CROSSCHECK"):
        if not env.get(name):
            _refuse(f"VITEST is set and {name} is absent")
    scrub = Path(env["OC_SCRUB_OUT"]).resolve()
    cross = Path(env["OC_SCRUB_CROSSCHECK"]).resolve()
    for out in (scrub, cross):
        if out in (committed_scrub, committed_cross):
            _refuse(f"{out} is a committed output")
    return {
        "input": Path(env["OC_SCRUB_INPUT"]).resolve() if env.get("OC_SCRUB_INPUT") else None,
        "expect": Path(env["OC_SCRUB_EXPECT"]).resolve() if env.get("OC_SCRUB_EXPECT") else None,
        "scrub": scrub,
        "crosscheck": cross,
    }


# ── Stream: classify every line into exactly one bucket ─────────

def stream_cutblocks(path: Path, cfg: dict):
    """One pass. Returns (kept, counts, stats, identity). kept is a list of
    (year, input_index, albers_geometry) for the kept set."""
    start, end = cfg["start"], cfg["end"]
    year_field, year_kind = cfg["year_field"], cfg["year_kind"]
    counts = {b: 0 for b in BUCKETS}
    counts["read"] = 0
    stats = ca.RepairStats()
    sum_drawn_kept = 0.0
    drawn_only_ha = 0.0
    kept = []
    digest = hashlib.sha256()
    nbytes = 0
    t0 = time.time()

    with open(path, "rb") as f:
        for i, line in enumerate(f):
            digest.update(line)
            nbytes += len(line)
            counts["read"] += 1
            try:
                feat = json.loads(line)
            except (json.JSONDecodeError, UnicodeDecodeError):
                counts["unparseable"] += 1
                continue
            props = feat.get("properties") or {}
            yr = parse_year(props.get(year_field), year_kind)
            if yr is None:
                counts["undated"] += 1
                continue
            if yr < start:
                counts["preStart"] += 1
                continue
            if yr > end:
                counts["postEnd"] += 1
                continue
            recorded = ca.recorded_area_ha(props)
            # The recorded side of the cap needs no geometry; test it first so the
            # drawn area (and the repair count) cover only blocks recorded under it.
            if ca.is_tenure_boundary(recorded, 0.0):
                counts["boundaryRecorded"] += 1
                continue
            _, geom = ca.prepare(feat.get("geometry"), stats, where=f"line {i + 1}")
            drawn = ca.geometry_area_ha(geom)
            if ca.is_tenure_boundary(recorded, drawn):
                counts["boundaryDrawn"] += 1
                drawn_only_ha += drawn
                continue
            if drawn <= 0.0:
                counts["zeroArea"] += 1
                continue
            kept.append((yr, i, geom))
            counts["kept"] += 1
            sum_drawn_kept += drawn
            if counts["read"] % 50000 == 0:
                print(f"  {counts['read']:,} lines read ({time.time() - t0:.0f}s)", flush=True)

    identity = {"bytes": nbytes, "sha256": digest.hexdigest()}
    return kept, counts, stats, sum_drawn_kept, drawn_only_ha, identity


# ── Method 1: rank-filtered STRtree union ───────────────────────

def rank_union_annual(geoms, years):
    """new(p) = area(p - union(hits of lower rank)); geoms are in rank order.
    Summing new(p) over a total order is the area of the union (telescoping), so
    same-year overlaps are subtracted and the order changes no total."""
    tree = STRtree(geoms)
    annual = defaultdict(float)
    for r in range(len(geoms)):
        p = geoms[r]
        hits = tree.query(p, predicate="intersects")
        lower = hits[hits < r]
        if len(lower) == 0:
            new = p.area
        else:
            new = shapely.difference(p, shapely.union_all(geoms[lower])).area
        annual[int(years[r])] += new / ca.M2_PER_HA
        if (r + 1) % 50000 == 0:
            print(f"  rank union: {r + 1:,}/{len(geoms):,}", flush=True)
    return annual


# ── Method 2: fixed tile grid, union per tile, per-year increments ──

def tile_union_annual(geoms, years, tile_m: int = TILE_M):
    """Independent of method 1: clip every kept polygon to a fixed grid (intersection
    with a box, on the repaired geometry; never clip_by_rect), union per tile, and
    record each year's increment of the cumulative per-tile union."""
    tree = STRtree(geoms)
    minx, miny, maxx, maxy = shapely.total_bounds(geoms)
    annual = defaultdict(float)
    tiles = 0
    for ix in range(math.floor(minx / tile_m), math.floor(maxx / tile_m) + 1):
        for iy in range(math.floor(miny / tile_m), math.floor(maxy / tile_m) + 1):
            b = box(ix * tile_m, iy * tile_m, (ix + 1) * tile_m, (iy + 1) * tile_m)
            idx = tree.query(b, predicate="intersects")
            if len(idx) == 0:
                continue
            tiles += 1
            pieces = shapely.intersection(geoms[idx], b)
            ys = years[idx]
            union = None
            prev = 0.0
            for y in np.unique(ys):
                sel = list(pieces[ys == y])
                union = shapely.union_all(sel if union is None else [union, *sel])
                area = union.area
                annual[int(y)] += (area - prev) / ca.M2_PER_HA
                prev = area
    return annual, tiles


# ── Check 4: a fixed box, cumulative union through a year ───────

def box_union_ha(geoms, years, box_spec: dict) -> float:
    w, s, e, n = box_spec["bounds"]
    # Densify the lon/lat box before projecting so its edges follow the meridians and
    # parallels in Albers (a 4-corner box would cut straight chords).
    b = ca.to_albers(shapely.segmentize(box(w, s, e, n), 0.001))
    sel = geoms[years <= box_spec["year"]]
    idx = STRtree(sel).query(b, predicate="intersects")
    if len(idx) == 0:
        return 0.0
    return shapely.union_all(sel[idx]).intersection(b).area / ca.M2_PER_HA


# ── The cutblocks build ─────────────────────────────────────────

def _load_profile(identity: dict, expect_path):
    if expect_path is not None:
        with open(expect_path) as f:
            return json.load(f), str(expect_path)
    key = (identity["manifestTimestamp"], identity["bytes"])
    if key not in ACCEPTANCE:
        _fail("0", f"no measured acceptance profile for checkpoint {key}; measure this pull before any number is built from it")
    return ACCEPTANCE[key], "ACCEPTANCE (build-scrub-tables.py)"


def _write_json_atomic(path: Path, obj: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
        f.write("\n")
    os.replace(tmp, path)


def build_cutblocks(paths: dict) -> None:
    cfg = DATASETS["cutblocks"]
    start, end = cfg["start"], cfg["end"]
    path = paths["input"] or _data_path(cfg["filename"])
    if not path.exists():
        print(f"  ERROR: {path} not found", file=sys.stderr)
        sys.exit(1)
    manifest_path = path.parent / "_manifest.json"
    if not manifest_path.exists():
        print(f"  ERROR: {manifest_path} not found (the checkpoint identity needs it)", file=sys.stderr)
        sys.exit(1)
    with open(manifest_path) as f:
        manifest_ts = json.load(f)["timestamp"]

    t_start = time.time()
    print("=== scrub table: cutblocks (dissolved union of drawn area) ===")
    print(f"  input: {path}")
    kept, counts, stats, sum_drawn_kept, drawn_only_ha, identity = stream_cutblocks(path, cfg)
    stat_bytes = path.stat().st_size
    if identity["bytes"] != stat_bytes:
        print(f"  ERROR: read {identity['bytes']} bytes but the file is {stat_bytes}", file=sys.stderr)
        sys.exit(1)
    checkpoint = {"manifestTimestamp": manifest_ts, "bytes": identity["bytes"], "sha256": identity["sha256"]}
    identity["manifestTimestamp"] = manifest_ts

    parts = " + ".join(f"{b} {counts[b]:,}" for b in BUCKETS)
    closes = counts["read"] == sum(counts[b] for b in BUCKETS)
    print(f"  accounting: read {counts['read']:,} = {parts} ({'closes' if closes else 'DOES NOT CLOSE'})")
    print(f"  repair: {stats.repaired:,} repaired, {stats.empty_after_repair:,} empty after repair, "
          f"{stats.nonpolygonal_parts:,} non-polygonal parts dropped, {stats.reprojected_repairs:,} repaired after projection")
    print(f"  sum of drawn area, kept set: {sum_drawn_kept:,.2f} ha; drawn-only tenure boundaries: {drawn_only_ha:,.2f} ha")

    if not closes:
        _fail("0", "the accounting line does not close")
    profile, profile_src = _load_profile(identity, paths["expect"])
    print(f"  acceptance profile: {profile_src}")

    # Check 0: the kept set is right (both methods share it; this is its only check).
    exp = profile["buckets"]
    got = {"read": counts["read"], **{b: counts[b] for b in BUCKETS}}
    diffs = [f"{k} {got[k]} != {exp[k]}" for k in exp if got.get(k) != exp[k]]
    if stats.repaired != profile["repaired"]:
        diffs.append(f"repaired {stats.repaired} != {profile['repaired']}")
    if stats.empty_after_repair != profile["emptyAfterRepair"]:
        diffs.append(f"emptyAfterRepair {stats.empty_after_repair} != {profile['emptyAfterRepair']}")
    if abs(sum_drawn_kept - profile["sumDrawnKeptHa"]) > EXACT_HA:
        diffs.append(f"sumDrawnKeptHa {sum_drawn_kept:.2f} != {profile['sumDrawnKeptHa']}")
    if abs(drawn_only_ha - profile["drawnOnlyBoundaryHa"]) > EXACT_HA:
        diffs.append(f"drawnOnlyBoundaryHa {drawn_only_ha:.2f} != {profile['drawnOnlyBoundaryHa']}")
    if diffs:
        _fail("0", "kept set differs from the measured counts: " + "; ".join(diffs))
    print("  check 0 PASS: bucket counts, repairs and drawn sums equal the measured profile")

    # Rank order: year, then input order.
    kept.sort(key=lambda k: (k[0], k[1]))
    geoms = np.array([g for _, _, g in kept], dtype=object)
    years = np.array([y for y, _, _ in kept], dtype=np.int64)
    del kept

    t1 = time.time()
    annual_rank = rank_union_annual(geoms, years)
    print(f"  method 1 (rank union) done in {time.time() - t1:.0f}s")
    t2 = time.time()
    annual_tile, tiles = tile_union_annual(geoms, years)
    print(f"  method 2 (tile union, {TILE_M} m, {tiles:,} tiles) done in {time.time() - t2:.0f}s")

    year_range = range(start, end + 1)
    annual = {y: annual_rank.get(y, 0.0) for y in year_range}
    tile_annual = {y: annual_tile.get(y, 0.0) for y in year_range}
    stray = sorted((set(annual_rank) | set(annual_tile)) - set(year_range))
    if stray:
        _fail("1", f"years outside {start}-{end} in the kept set: {stray}")
    total = sum(annual.values())
    tile_total = sum(tile_annual.values())
    print(f"  total, method 1 (rank union): {total:,.2f} ha")
    print(f"  total, method 2 (tile union): {tile_total:,.2f} ha")

    # Check 1: per-year agreement.
    year_diffs = {y: annual[y] - tile_annual[y] for y in year_range}
    worst = max(year_diffs, key=lambda y: abs(year_diffs[y]))
    if abs(year_diffs[worst]) > AGREE_HA:
        _fail("1", f"annual[{worst}] differs between methods by {year_diffs[worst]:,.4f} ha (rank {annual[worst]:,.4f}, tile {tile_annual[worst]:,.4f})")
    print(f"  check 1 PASS: every year agrees within {AGREE_HA} ha (worst {worst}, {year_diffs[worst]:+.6f} ha)")

    # Check 2: the number falls, and the union is below the plain sum.
    if not total < profile["shippedTotalHa"]:
        _fail("2", f"total {total:,.2f} is not below the shipped {profile['shippedTotalHa']:,.2f}: ship nothing, report to the coordinator for Lee")
    if not total < sum_drawn_kept:
        _fail("2", f"total {total:,.2f} is not below the sum of drawn area {sum_drawn_kept:,.2f} (a sum, not a union)")
    print(f"  check 2 PASS: total below the shipped {profile['shippedTotalHa']:,.2f} and below the drawn sum {sum_drawn_kept:,.2f}")

    # Check 3: the second method's total.
    if abs(total - tile_total) > AGREE_HA:
        _fail("3", f"totals differ by {total - tile_total:,.4f} ha")
    print(f"  check 3 PASS: totals agree within {AGREE_HA} ha ({total - tile_total:+.6f})")

    # Check 4: the fixed box.
    box_spec = profile["box"]
    box_ha = box_union_ha(geoms, years, box_spec)
    box_pct = 100.0 * (box_ha - box_spec["expectHa"]) / box_spec["expectHa"]
    if abs(box_pct) > box_spec["tolerancePct"]:
        _fail("4", f"{box_spec['name']}: {box_ha:,.2f} ha vs {box_spec['expectHa']:,.2f} ({box_pct:+.3f}%)")
    print(f"  check 4 PASS: {box_spec['name']} {box_ha:,.2f} ha ({box_pct:+.3f}% of {box_spec['expectHa']:,.2f})")

    # Plausibility band: outside it the run stops and the figure is never adjusted.
    lo, hi = profile["band"]
    if not lo <= total <= hi:
        _fail("band", f"total {total:,.2f} outside the plausibility band {lo:,.0f}-{hi:,.0f}: report to the coordinator for Lee")
    print(f"  band PASS: {total:,.2f} within {lo:,.0f}-{hi:,.0f}")

    table = scrub_table(annual, start, end)
    table.update({
        "areaCap": ca.CAP_HA,
        "areaMeasure": AREA_MEASURE,
        "areaCapRule": AREA_CAP_RULE,
        "checkpoint": checkpoint,
    })
    crosscheck = {
        "measure": "logged hectares: FTEN cutblocks dated 1950-2025, tenure boundaries out by max(recorded, drawn) >= 2000 ha, dissolved union of drawn area in EPSG:3005",
        "areaMeasure": AREA_MEASURE,
        "areaCapRule": AREA_CAP_RULE,
        "areaCap": ca.CAP_HA,
        "checkpoint": checkpoint,
        "accounting": {**got, "repaired": stats.repaired, "emptyAfterRepair": stats.empty_after_repair,
                       "nonPolygonalPartsDropped": stats.nonpolygonal_parts, "repairedAfterProjection": stats.reprojected_repairs},
        "sumDrawnKeptHa": round(sum_drawn_kept, 2),
        "drawnOnlyBoundaryHa": round(drawn_only_ha, 2),
        "methods": {
            "rankUnion": {
                "description": "STRtree over the kept set ranked (year, input order); new(p) = area(p - union(lower-ranked hits))",
                "totalHa": round(total, 2),
                "annualHa": {str(y): round(annual[y], 4) for y in year_range},
            },
            "tileUnion": {
                "description": "kept set intersected with a fixed EPSG:3005 grid, unary union per tile, cumulative per-year increments",
                "tileSizeM": TILE_M,
                "tiles": tiles,
                "totalHa": round(tile_total, 2),
                "annualHa": {str(y): round(tile_annual[y], 4) for y in year_range},
            },
        },
        "agreement": {"toleranceHa": AGREE_HA, "totalDiffHa": round(total - tile_total, 6),
                      "worstYear": worst, "worstYearDiffHa": round(year_diffs[worst], 6)},
        "shippedTotalHa": profile["shippedTotalHa"],
        "band": profile["band"],
        "box": {**box_spec, "measuredHa": round(box_ha, 2), "diffPct": round(box_pct, 4)},
    }

    # Outputs last: a run killed before this line leaves the committed files standing.
    _write_json_atomic(paths["crosscheck"], crosscheck)
    _write_json_atomic(paths["scrub"], table)
    peak_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    print(f"  wrote {paths['crosscheck']}")
    print(f"  wrote {paths['scrub']} (total {table['total']:,.2f} ha)")
    print(f"  wall {time.time() - t_start:.0f}s, peak RSS {peak_kb / 1024 / 1024:.2f} GiB (getrusage)\n")


def scrub_table(annual: dict, start: int, end: int) -> dict:
    """Cumulative, normalized, endpoints pinned exactly to 0.0 / 1.0 (shape unchanged)."""
    total = sum(annual.values())
    if total <= 0:
        _fail("2", "zero total area")
    cumulative_norm = []
    running = 0.0
    years = list(range(start, end + 1))
    for i, y in enumerate(years):
        running += annual[y]
        if i == 0:
            cumulative_norm.append(0.0)
        elif i == len(years) - 1:
            cumulative_norm.append(1.0)
        else:
            cumulative_norm.append(round(running / total, 6))
    for i in range(1, len(cumulative_norm)):
        if cumulative_norm[i] < cumulative_norm[i - 1]:
            cumulative_norm[i] = cumulative_norm[i - 1]
    for probe in (start, start + 30, start + 50, end - 8, end):
        if start <= probe <= end:
            print(f"    by {probe}: {cumulative_norm[probe - start] * 100:5.1f}% of total")
    return {"start": start, "end": end, "cumulativeNorm": cumulative_norm, "total": round(total, 2)}


def main():
    parser = argparse.ArgumentParser(description="Build nonlinear scrub tables")
    parser.add_argument("--dataset", choices=sorted(DATASETS.keys()), default=None,
                        help="Build only this dataset (default: both)")
    args = parser.parse_args()

    targets = [args.dataset] if args.dataset else list(DATASETS.keys())
    paths = resolve_paths(targets)

    for ds in targets:
        if ds == "cutblocks":
            try:
                build_cutblocks(paths)
            except AcceptanceFailure as e:
                print(f"\n  ACCEPTANCE FAILED, {e}. Nothing written.", file=sys.stderr)
                sys.exit(EXIT_ACCEPTANCE)
            continue
        _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        table = build(ds)
        out_path = _OUTPUT_DIR / DATASETS[ds]["out"]
        with open(out_path, "w") as f:
            json.dump(table, f, separators=(",", ":"))
            f.write("\n")
        print(f"  wrote {out_path} ({out_path.stat().st_size} bytes)\n")


if __name__ == "__main__":
    main()
