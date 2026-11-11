"""
The one cutblock area rule, shared by build-scrub-tables.py and build-year-overlays.py
(area-contract v1; the Python twin of C5b's TypeScript contract).

A cutblock polygon is a tenure boundary, not a cutblock, when EITHER its recorded area
(PLANNED_GROSS_BLOCK_AREA) OR its drawn area reaches CAP_HA. Drawn area is measured on
the repaired geometry in BC Albers (EPSG:3005). Before 2026-11 the builders tested only
the recorded attribute, which kept nine polygons drawn at 2,532-18,561 ha that record
0.1-1,000 ha (83,233 ha together in EPSG:3005).

Repair: shapely.make_valid on an invalid geometry, then keep the polygonal parts only.
Any non-polygonal remainder is counted and logged, never silently dropped. Geometry
errors are NOT caught here: a geometry that cannot be built, repaired or projected
raises, and the builder that called us stops. Only an unparseable JSON line is ever
skipped, and the builders count it.

CAP_HA must equal CUTBLOCK_AREA_CAP_HA in src/lib/layers/registry.ts;
src/test/lib/hero-figure.test.ts reads this file's source and pins the two together.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field

import numpy as np
import shapely
from shapely.geometry import Polygon, shape
from pyproj import Transformer

CAP_HA = 2000
AREA_FIELD = "PLANNED_GROSS_BLOCK_AREA"
AREA_CRS = "EPSG:3005"
M2_PER_HA = 10_000.0

_TO_ALBERS = Transformer.from_crs("EPSG:4326", AREA_CRS, always_xy=True)
_POLYGONAL = ("Polygon", "MultiPolygon")
_LOG_EXAMPLES = 5


@dataclass
class RepairStats:
    """Counts what repair did, so every run can print it."""

    repaired: int = 0               # invalid on input, passed through make_valid
    empty_after_repair: int = 0     # nothing polygonal left (null, empty or degenerate input)
    nonpolygonal_parts: int = 0     # line/point parts dropped from a repaired geometry
    reprojected_repairs: int = 0    # valid in lon/lat but invalid once projected, repaired again
    examples: list = field(default_factory=list)

    def note(self, msg: str) -> None:
        if len(self.examples) < _LOG_EXAMPLES:
            self.examples.append(msg)
            print(f"  repair: {msg}", file=sys.stderr)


def _polygonal(geom, stats: RepairStats | None, where: str):
    """Keep the polygonal parts of a (valid) geometry; log anything else."""
    parts = shapely.get_parts(geom)
    keep = [p for p in parts if p.geom_type in _POLYGONAL]
    dropped = len(parts) - len(keep)
    if dropped and stats is not None:
        stats.nonpolygonal_parts += dropped
        kinds = sorted({p.geom_type for p in parts if p.geom_type not in _POLYGONAL})
        stats.note(f"{where}: dropped {dropped} non-polygonal part(s) ({', '.join(kinds)})")
    if not keep:
        return None
    return shapely.union_all(keep) if len(keep) > 1 else keep[0]


def repair(geom, stats: RepairStats | None = None, where: str = "feature"):
    """make_valid an invalid geometry, keep polygonal parts. Returns an empty Polygon
    when nothing polygonal is left (counted in stats.empty_after_repair)."""
    if geom is None or geom.is_empty:
        if stats is not None:
            stats.empty_after_repair += 1
        return Polygon()
    if not geom.is_valid:
        geom = shapely.make_valid(geom)
        if stats is not None:
            stats.repaired += 1
    out = _polygonal(geom, stats, where)
    if out is None:
        if stats is not None:
            stats.empty_after_repair += 1
            stats.note(f"{where}: empty after repair")
        return Polygon()
    return out


def to_albers(geom, stats: RepairStats | None = None, where: str = "feature"):
    """Project a repaired lon/lat geometry to EPSG:3005. Projection can in principle make a
    valid ring invalid; such a geometry is repaired again in the projected frame (same rule)."""
    if geom.is_empty:
        return geom
    out = shapely.transform(geom, lambda xy: np.column_stack(_TO_ALBERS.transform(xy[:, 0], xy[:, 1])))
    if not out.is_valid:
        if stats is not None:
            stats.reprojected_repairs += 1
            stats.note(f"{where}: invalid after projection, repaired in {AREA_CRS}")
        fixed = _polygonal(shapely.make_valid(out), stats, where)
        out = fixed if fixed is not None else Polygon()
    return out


def prepare(geojson, stats: RepairStats | None = None, where: str = "feature"):
    """GeoJSON geometry dict -> (repaired lon/lat geometry, repaired EPSG:3005 geometry)."""
    raw = shape(geojson) if geojson else None
    lonlat = repair(raw, stats, where)
    return lonlat, to_albers(lonlat, stats, where)


def geometry_area_ha(albers_geom) -> float:
    """Drawn area in hectares of a repaired geometry already in EPSG:3005."""
    return float(albers_geom.area) / M2_PER_HA


def recorded_area_ha(props: dict) -> float:
    """PLANNED_GROSS_BLOCK_AREA as a float; absent counts as 0. A present value that is
    not a number raises: a bad attribute must stop the run, not pass as 0."""
    raw = props.get(AREA_FIELD)
    return 0.0 if raw is None else float(raw)


def is_tenure_boundary(recorded_ha: float, drawn_ha: float) -> bool:
    """The cap: a polygon at or above CAP_HA by its recorded OR its drawn area."""
    return max(recorded_ha, drawn_ha) >= CAP_HA
