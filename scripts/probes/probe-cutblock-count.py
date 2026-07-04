#!/usr/bin/env python3
"""Probe C — province cutblock feature count (Phase 0, sharded-finding-beacon).

Streams data/checkpoint/preprocessed/tenure-cutblocks.ndjson and reports:
  - total feature count (the number that decides whether deck.gl's
    DataFilterExtension stays parked: it filters AFTER GPU buffer allocation,
    so province-scale counts far above ~100k keep it parked)
  - dated vs undated split (DISTURBANCE_START_DATE, same field the overlay
    build uses)
  - gross area sum (PLANNED_GROSS_BLOCK_AREA, hectares) as a cross-check
    against the published "8 million hectares" hero figure

Run on the build machine (the NDJSON checkpoints are box-local, not in git):
  python3 scripts/probes/probe-cutblock-count.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _find_input(filename: str) -> Path:
    candidates = [
        _PROJECT_ROOT / "data" / "checkpoint" / "preprocessed" / filename,
        Path.home() / "Projects" / "opencanopy" / "data" / "checkpoint" / "preprocessed" / filename,
    ]
    return next((p for p in candidates if p.exists()), candidates[0])


def main() -> int:
    path = _find_input("tenure-cutblocks.ndjson")
    if not path.exists():
        print(f"ERROR: {path} not found — run on the build machine.", file=sys.stderr)
        return 1

    total = 0
    dated = 0
    undated = 0
    out_of_range = 0
    gross_area_ha = 0.0
    area_missing = 0

    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            feat = json.loads(line)
            props = feat.get("properties") or {}
            total += 1

            raw = props.get("DISTURBANCE_START_DATE")
            if raw:
                try:
                    year = int(str(raw)[:4])
                    if 1950 <= year <= 2025:
                        dated += 1
                    else:
                        out_of_range += 1
                except ValueError:
                    undated += 1
            else:
                undated += 1

            area = props.get("PLANNED_GROSS_BLOCK_AREA")
            if area is None:
                area_missing += 1
            else:
                try:
                    gross_area_ha += float(area)
                except (TypeError, ValueError):
                    area_missing += 1

            if total % 500_000 == 0:
                print(f"  ...{total:,} features", file=sys.stderr)

    print("=== Probe C: province cutblock count ===")
    print(f"source:              {path}")
    print(f"total features:      {total:,}")
    print(f"dated 1950-2025:     {dated:,}")
    print(f"dated out-of-range:  {out_of_range:,}")
    print(f"undated:             {undated:,}")
    print(f"gross area sum:      {gross_area_ha:,.0f} ha "
          f"({area_missing:,} features without an area value)")
    verdict = (
        "deck.gl DataFilterExtension stays PARKED (count far above ~100k)"
        if total > 200_000
        else "count is low enough that deck.gl could be re-evaluated (see report.md 'Parked')"
    )
    print(f"verdict:             {verdict}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
