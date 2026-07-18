#!/usr/bin/env python3
"""
Build nonlinear scrub tables for the scrollytelling timeline + fire beats.

Each table maps scroll progress [0,1] -> year by INVERTING the cumulative
disturbed-area curve. The story scrub then spends screen time in proportion
to how much was lost in each period: sparse early decades compress, the
modern acceleration stretches. The pacing IS the data.

Emits one JSON per dataset:
  src/data/scrub/cutblocks-scrub.json   cumulative PLANNED_GROSS_BLOCK_AREA by DISTURBANCE_START_DATE year (1950-2025)
  src/data/scrub/fire-scrub.json        cumulative FIRE_SIZE_HECTARES by FIRE_YEAR (1917-2025)

Shape:
  { "start": 1950, "end": 2025, "cumulativeNorm": [ ... one float per year, monotonic 0..1 ... ], "total": 1234567.89 }

`cumulativeNorm[i]` is the fraction of total area disturbed by year `start+i`,
inclusive. `cumulativeNorm[0]` is pinned to 0.0 and `[last]` to 1.0 so the
runtime inverse lookup yields exactly `start` at progress 0 and `end` at
progress 1 (boundary invariant the unit test asserts).

`total` is the absolute area (hectares) the normalized curve is a fraction
of -- `total * cumulativeNorm[i]` recovers a real "X ha through year Y"
figure (Phase A honest-timeline readout). Added 2026-07 -- older consumers
that only read cumulativeNorm are unaffected.

The dataset start/end MUST match the matching *_OVERLAY_RANGE constant in
src/lib/story/setup-layers.ts (a TS-side assertion enforces this at import).

Usage:
  python3 scripts/build-scrub-tables.py            # both datasets
  python3 scripts/build-scrub-tables.py --dataset fire
"""

import argparse
import json
import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).parent.parent
_OUTPUT_DIR = _PROJECT_ROOT / "src" / "data" / "scrub"


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
        "area_field": "PLANNED_GROSS_BLOCK_AREA",
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

    # Report a few inflection points so the pacing is reviewable.
    print(f"  features: {rows:,} dated ({folded:,} folded into {start}, {undated_skipped:,} undated skipped)")
    print(f"  total area: {total:,.0f}")
    for probe in (start, start + 30, start + 50, end - 8, end):
        if start <= probe <= end:
            print(f"    by {probe}: {cumulative_norm[probe - start] * 100:5.1f}% of total")
    return table


def main():
    parser = argparse.ArgumentParser(description="Build nonlinear scrub tables")
    parser.add_argument("--dataset", choices=sorted(DATASETS.keys()), default=None,
                        help="Build only this dataset (default: both)")
    args = parser.parse_args()

    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    targets = [args.dataset] if args.dataset else list(DATASETS.keys())

    for ds in targets:
        table = build(ds)
        out_path = _OUTPUT_DIR / DATASETS[ds]["out"]
        with open(out_path, "w") as f:
            json.dump(table, f, separators=(",", ":"))
            f.write("\n")
        print(f"  wrote {out_path} ({out_path.stat().st_size} bytes)\n")


if __name__ == "__main__":
    main()
