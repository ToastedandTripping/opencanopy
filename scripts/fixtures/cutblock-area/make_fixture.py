#!/usr/bin/env python3
"""
Regenerates the committed cutblock-area fixture (area-contract v1). Shapes are laid out
in BC Albers (EPSG:3005) metres, where their areas are exact, and written as lon/lat
GeoJSON the way the FTEN checkpoint is. C5b's TypeScript twin reuses the same files.

Writes, beside this script:
  tenure-cutblocks.ndjson   one feature per line (plus one malformed line)
  _manifest.json            the checkpoint manifest the builder reads its identity from
  expected.json             the acceptance profile (check 0's buckets, the box, the band)
                            plus the expected per-year union (annualHa) and total

  python3 scripts/fixtures/cutblock-area/make_fixture.py

Every expected number below is worked by hand from the square sizes; nothing is taken
from a builder run.
"""

import json
from pathlib import Path

from pyproj import Transformer

HERE = Path(__file__).parent
TO_LONLAT = Transformer.from_crs("EPSG:3005", "EPSG:4326", always_xy=True)
Y0 = 1_001_000  # every group sits on this Albers northing, 20 km apart in easting


def ring(origin, pts):
    ox, oy = origin
    out = []
    for x, y in pts:
        lon, lat = TO_LONLAT.transform(ox + x, oy + y)
        out.append([lon, lat])
    return out


def square(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]


def poly(origin, *rings):
    return {"type": "Polygon", "coordinates": [ring(origin, r) for r in rings]}


def feature(geom, year, recorded_ha):
    date = None if year is None else f"{year:04d}-01-01"
    return {"type": "Feature", "geometry": geom,
            "properties": {"company_id": "fixture", "DISTURBANCE_START_DATE": date,
                           "PLANNED_GROSS_BLOCK_AREA": recorded_ha}}


def main():
    o = lambda k: (1_101_000 + 20_000 * k, Y0)  # noqa: E731
    lines = []
    # Two same-year squares overlapping by 50 ha, and a later one overlapping both by 50 ha:
    # 2000 = 100 + 50 = 150; 2010 = 100 - 50 = 50.
    lines.append(feature(poly(o(0), square(0, 0, 1000, 1000)), 2000, 100))
    lines.append(feature(poly(o(0), square(500, 0, 1500, 1000)), 2000, 100))
    lines.append(feature(poly(o(0), square(0, 500, 1000, 1500)), 2010, 100))
    # Drawn 2,500 ha, recorded 0.1 ha: a tenure boundary by its drawn area only.
    lines.append(feature(poly(o(1), square(0, 0, 5000, 5000)), 1991, 0.1))
    # Self-intersecting bowtie: unrepaired its signed area is 0; make_valid gives two
    # triangles of 25 ha. 1975 = 50.
    lines.append(feature(poly(o(2), [(0, 0), (1000, 1000), (1000, 0), (0, 1000), (0, 0)]), 1975, 50))
    # MultiPolygon of two disjoint 25 ha squares. 1980 = 50.
    lines.append(feature({"type": "MultiPolygon", "coordinates": [
        [ring(o(3), square(0, 0, 500, 500))], [ring(o(3), square(700, 0, 1200, 500))]]}, 1980, 50))
    # 100 ha with a 25 ha hole (1985 = 75), and a later 16 ha square inside the hole that
    # overlaps nothing (1986 = 16).
    lines.append(feature(poly(o(4), square(0, 0, 1000, 1000), square(250, 250, 750, 750)), 1985, 75))
    lines.append(feature(poly(o(4), square(300, 300, 700, 700)), 1986, 16))
    # A same-year pair straddling the 10 km grid line at easting 1,210,000:
    # 100 + 100 - 35 (700 x 500 m overlap) = 165.
    lines.append(feature(poly((1_200_000, Y0), square(9500, 0, 10500, 1000)), 1995, 100))
    lines.append(feature(poly((1_200_000, Y0), square(9800, 500, 10800, 1500)), 1995, 100))
    # Recorded exactly 2,000 ha: a tenure boundary by its recorded area.
    lines.append(feature(poly(o(6), square(0, 0, 1000, 1000)), 2001, 2000))
    # The year edges: 1949 out, 1950 and 2025 in (10 ha each), 2026 out.
    lines.append(feature(poly(o(7), square(0, 0, 100, 1000)), 1949, 10))
    lines.append(feature(poly(o(8), square(0, 0, 100, 1000)), 1950, 10))
    lines.append(feature(poly(o(9), square(0, 0, 100, 1000)), 2025, 10))
    lines.append(feature(poly(o(10), square(0, 0, 100, 1000)), 2026, 10))
    # Undated.
    lines.append(feature(poly(o(11), square(0, 0, 1000, 1000)), None, 100))
    # Dated, degenerate ring (two distinct points, out and back): invalid, nothing
    # polygonal after repair, zero drawn area.
    lines.append(feature(poly(o(12), [(0, 0), (1000, 0), (1000, 0), (0, 0)]), 1990, 5))

    # A malformed date VALUE (the line itself parses): no 4-digit year, so undated.
    bad = feature(poly(o(13), square(0, 0, 1000, 1000)), None, 100)
    bad["properties"]["DISTURBANCE_START_DATE"] = "19xx-01-01"
    lines.append(bad)

    out = [json.dumps(f) for f in lines]
    out.insert(5, '{"type":"Feature","geometry":')  # malformed: a truncated line
    (HERE / "tenure-cutblocks.ndjson").write_text("\n".join(out) + "\n")
    (HERE / "_manifest.json").write_text(json.dumps(
        {"layers": ["tenure-cutblocks"], "timestamp": "fixture-area-contract-v1", "validateOnly": False}, indent=1) + "\n")

    # The box around the first group: lon/lat bounds of its Albers extent padded by 2 km
    # (no other group is within 18 km). The 2025 union inside it is 150 + 50 = 200 ha.
    corners = [TO_LONLAT.transform(1_101_000 + x, Y0 + y) for x in (-2000, 3500) for y in (-2000, 3500)]
    lons = [c[0] for c in corners]
    lats = [c[1] for c in corners]
    annual = {"1950": 10, "1975": 50, "1980": 50, "1985": 75, "1986": 16, "1995": 165,
              "2000": 150, "2010": 50, "2025": 10}
    expected = {
        "buckets": {"read": 19, "kept": 11, "undated": 2, "preStart": 1, "postEnd": 1,
                    "boundaryRecorded": 1, "boundaryDrawn": 1, "zeroArea": 1, "unparseable": 1},
        "repaired": 2,
        "emptyAfterRepair": 1,
        "sumDrawnKeptHa": 711.0,
        "drawnOnlyBoundaryHa": 2500.0,
        "shippedTotalHa": 600.0,
        "band": [570.0, 580.0],
        "box": {"name": "fixture group 0", "bounds": [min(lons), min(lats), max(lons), max(lats)],
                "year": 2025, "expectHa": 200.0, "tolerancePct": 0.5},
        "annualHa": annual,
        "totalHa": sum(annual.values()),
    }
    (HERE / "expected.json").write_text(json.dumps(expected, indent=1) + "\n")
    print(f"wrote {len(out)} lines; expected total {expected['totalHa']} ha")


if __name__ == "__main__":
    main()
