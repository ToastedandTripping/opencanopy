#!/usr/bin/env python3
"""Probe D — real total-old-growth share of BC's forest (Phase 0,
sharded-finding-beacon). This is the NO-FABRICATION gate for the Phase-5 gold
reveal: no old-growth percentage ships in story copy unless it comes from this
probe (or a better source). "35,000 ha / 0.3%" (Price/Holt/Daust 2020) stays
the big-tree subfigure regardless — this probe measures the BROADER class.

Streams data/checkpoint/preprocessed/forest-age-rasterizable.ndjson (the slim
raster-build NDJSON, ~2.4GB / ~6.2M features, box-local) and accumulates area
per `class` (the same classification the map renders: bucket boundaries are
OURS — >=250yr = old-growth per the coastal standard, >=80 = mature;
"harvested" = BC's HARVEST_DATE present; see scripts/lib/extractors.ts).

Area method: per-ring shoelace in a cos(latitude)-corrected local equirect
frame (stdlib-only, fast). For a SHARE of forest area this is accurate to well
under 1% — the same systematic error applies to numerator and denominator.
Pass --exact to also compute BC-Albers (EPSG:3005) areas via pyproj+shapely if
installed; use that path if the number is going into shipped copy verbatim.

Caveats to carry into the decision memo:
  - The slim NDJSON's geometry was simplified for rasterization (half-pixel at
    z9); class areas shift by well under 1%.
  - Denominator #1 is VRI forest polygon area (what the map paints), NOT total
    BC land. Denominator #2 uses ~94.47M ha (BC total incl. freshwater,
    944,735 km2, BC gov figure) for a province-scale share.

Run on the build machine:
  python3 scripts/probes/probe-old-growth-pct.py
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parents[2]

M_PER_DEG_LAT = 110_540.0
M_PER_DEG_LON = 111_320.0
BC_TOTAL_HA = 94_473_500  # 944,735 km2, total area incl. freshwater (BC gov)


def _find_input(filename: str) -> Path:
    candidates = [
        _PROJECT_ROOT / "data" / "checkpoint" / "preprocessed" / filename,
        Path.home() / "Projects" / "opencanopy" / "data" / "checkpoint" / "preprocessed" / filename,
    ]
    return next((p for p in candidates if p.exists()), candidates[0])


def _ring_area_m2(ring: list) -> float:
    if len(ring) < 4:
        return 0.0
    lat_mid = sum(p[1] for p in ring) / len(ring)
    kx = M_PER_DEG_LON * math.cos(math.radians(lat_mid))
    ky = M_PER_DEG_LAT
    s = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i][0] * kx, ring[i][1] * ky
        x2, y2 = ring[i + 1][0] * kx, ring[i + 1][1] * ky
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0


def geom_area_m2(geom: dict) -> float:
    gtype = geom.get("type")
    if gtype == "Polygon":
        polys = [geom["coordinates"]]
    elif gtype == "MultiPolygon":
        polys = geom["coordinates"]
    else:
        return 0.0
    total = 0.0
    for poly in polys:
        if not poly:
            continue
        area = _ring_area_m2(poly[0]) - sum(_ring_area_m2(r) for r in poly[1:])
        total += max(area, 0.0)
    return total


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--exact", action="store_true",
                    help="also compute BC-Albers areas via pyproj+shapely (slow)")
    args = ap.parse_args()

    path = _find_input("forest-age-rasterizable.ndjson")
    if not path.exists():
        print(f"ERROR: {path} not found — run on the build machine.", file=sys.stderr)
        return 1

    exact = None
    if args.exact:
        try:
            from pyproj import Transformer  # type: ignore
            from shapely.geometry import shape  # type: ignore
            from shapely.ops import transform as shp_transform  # type: ignore

            tfm = Transformer.from_crs("EPSG:4326", "EPSG:3005", always_xy=True)
            exact = (tfm, shape, shp_transform)
        except ImportError:
            print("WARN: --exact requested but pyproj/shapely not installed; "
                  "falling back to the approximate method only.", file=sys.stderr)

    counts: dict[str, int] = defaultdict(int)
    area_ha: dict[str, float] = defaultdict(float)
    exact_area_ha: dict[str, float] = defaultdict(float)
    total = 0

    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            feat = json.loads(line)
            props = feat.get("properties") or {}
            cls = str(props.get("class") or "UNKNOWN")
            geom = feat.get("geometry") or {}
            counts[cls] += 1
            area_ha[cls] += geom_area_m2(geom) / 10_000.0
            if exact is not None:
                tfm, shape_fn, shp_tfm = exact
                exact_area_ha[cls] += shp_tfm(tfm.transform, shape_fn(geom)).area / 10_000.0
            total += 1
            if total % 500_000 == 0:
                print(f"  ...{total:,} features", file=sys.stderr)

    forest_ha = sum(area_ha.values())
    # Match every old-growth variant the tile build recognizes
    # (old-growth, old-growth-protected, old-growth-unprotected).
    og_classes = sorted(c for c in area_ha if c.startswith("old-growth"))
    og_ha = sum(area_ha[c] for c in og_classes)

    print("=== Probe D: total old-growth share (VRI >=250yr classes) ===")
    print(f"source:            {path}")
    print(f"features:          {total:,}")
    print(f"{'class':<28}{'features':>12}{'area (ha)':>16}{'% of forest':>14}")
    for cls in sorted(area_ha, key=lambda c: -area_ha[c]):
        pct = 100.0 * area_ha[cls] / forest_ha if forest_ha else 0.0
        print(f"{cls:<28}{counts[cls]:>12,}{area_ha[cls]:>16,.0f}{pct:>13.2f}%")
    print("-" * 70)
    print(f"VRI forest total:  {forest_ha:,.0f} ha")
    print(f"old-growth classes matched: {', '.join(og_classes) or 'NONE — check class values above!'}")
    print(f"old-growth area:   {og_ha:,.0f} ha")
    if forest_ha:
        print(f"share of VRI forest area:   {100.0 * og_ha / forest_ha:.2f}%")
    print(f"share of BC total (~{BC_TOTAL_HA / 1e6:.1f}M ha incl. freshwater): "
          f"{100.0 * og_ha / BC_TOTAL_HA:.2f}%")
    if exact is not None:
        og_exact = sum(exact_area_ha[c] for c in og_classes)
        forest_exact = sum(exact_area_ha.values())
        print(f"[exact/BC-Albers] forest {forest_exact:,.0f} ha, old-growth "
              f"{og_exact:,.0f} ha, share {100.0 * og_exact / forest_exact:.2f}%")
    print("\nReminder: bucket boundaries are ours (>=250 = old-growth, coastal "
          "standard); cite as 'stands the provincial inventory ages at 250+ "
          "years'. No copy ships without this number in the decision memo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
