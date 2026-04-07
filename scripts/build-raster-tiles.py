#!/usr/bin/env python3
"""
Rasterize forest-age NDJSON into PNG overview tiles (z4-z10).

Generates multiple themed raster overlays:
  1. forest-age: 4-class coloring (green/light-green/orange/red)
  2. old-growth: gold old growth on dark background
  3. conservation-gap: red where old growth is unprotected

Each theme produces a directory of PNG tiles in XYZ layout (z/x/y.png)
that MapLibre can render as raster sources at z4-z10, replacing the
vector tile approach that crashes Chrome at province scale.

Usage:
  python3 scripts/build-raster-tiles.py [--theme forest-age|old-growth|all]
  python3 scripts/build-raster-tiles.py --theme all

Dependencies: rasterio, numpy, shapely (pip3 install --user rasterio numpy shapely)
"""

import json
import math
import os
import sys
import time
from pathlib import Path
from collections import defaultdict

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.features import rasterize
from shapely.geometry import shape

# ── Configuration ────────────────────────────────────────────────

NDJSON_PATH = Path(__file__).parent.parent / "data" / "geojson" / "forest-age.ndjson"
PARKS_PATH = Path(__file__).parent.parent / "data" / "geojson" / "parks.ndjson"
OGMA_PATH = Path(__file__).parent.parent / "data" / "geojson" / "ogma.ndjson"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raster-tiles"

# BC extent in WGS84 (approximate, covers all VRI data)
BC_BOUNDS = (-139.5, 48.0, -114.0, 60.5)  # west, south, east, north

# Color themes: RGBA tuples
THEMES = {
    "forest-age": {
        "old-growth": (21, 128, 61, 200),     # #15803d green
        "mature": (74, 222, 128, 200),          # #4ade80 light green
        "young": (249, 115, 22, 200),            # #f97316 orange
        "harvested": (239, 68, 68, 200),         # #ef4444 red
        "background": (0, 0, 0, 0),              # transparent
    },
    "old-growth": {
        "old-growth": (234, 179, 8, 230),        # #eab308 gold
        "mature": (30, 30, 30, 80),              # faint dark
        "young": (30, 30, 30, 60),               # faint dark
        "harvested": (30, 30, 30, 60),           # faint dark
        "background": (0, 0, 0, 0),
    },
    "conservation-gap": {
        # Will be filled dynamically: protected old growth = green, unprotected = red
        "old-growth-protected": (34, 197, 94, 200),   # #22c55e green
        "old-growth-unprotected": (239, 68, 68, 230),  # #ef4444 bright red
        "mature": (0, 0, 0, 0),
        "young": (0, 0, 0, 0),
        "harvested": (0, 0, 0, 0),
        "background": (0, 0, 0, 0),
    },
}

# Tile resolution (pixels per tile)
TILE_SIZE = 512

# Paint order: background classes first, ecologically important last.
# Old-growth must always win overlaps. Any class not listed here is
# painted before the ordered classes (insertion order, as fallback).
PAINT_ORDER = [
    "harvested", "young", "mature", "old-growth",
    "old-growth-unprotected", "old-growth-protected",
]

# ── Tile math ────────────────────────────────────────────────────

def lng_to_tile_x(lng: float, zoom: int) -> int:
    return int((lng + 180) / 360 * (1 << zoom))

def lat_to_tile_y(lat: float, zoom: int) -> int:
    lat_rad = math.radians(lat)
    n = 1 << zoom
    return int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)

def tile_bounds(z: int, x: int, y: int) -> tuple:
    """Return (west, south, east, north) in WGS84 for a tile."""
    n = 1 << z
    west = x / n * 360 - 180
    east = (x + 1) / n * 360 - 180
    north = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    south = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return (west, south, east, north)


# ── Feature loading ──────────────────────────────────────────────

def load_features(path: Path, class_field: str = "class") -> list:
    """Load NDJSON features, return list of (geometry, class_name, bbox) tuples.

    bbox is (minx, miny, maxx, maxy) pre-computed from the shapely geometry so
    that features_in_bounds does not need to re-parse geometry on every tile check.
    """
    features = []
    count = 0
    with open(path) as f:
        for line in f:
            try:
                feat = json.loads(line)
                geom = feat.get("geometry")
                cls = feat.get("properties", {}).get(class_field)
                if geom and cls:
                    bbox = shape(geom).bounds  # (minx, miny, maxx, maxy)
                    features.append((geom, cls, bbox))
                    count += 1
                    if count % 500000 == 0:
                        print(f"  Loaded {count:,} features...")
            except (json.JSONDecodeError, KeyError):
                continue
    print(f"  Total: {count:,} features loaded from {path.name}")
    return features


def load_protection_polygons() -> list:
    """Load parks + OGMA polygons for conservation gap analysis."""
    polys = []
    for path in [PARKS_PATH, OGMA_PATH]:
        if not path.exists() or path.stat().st_size == 0:
            print(f"  Skipping {path.name} (missing or empty)")
            continue
        with open(path) as f:
            for line in f:
                try:
                    feat = json.loads(line)
                    geom = feat.get("geometry")
                    if geom:
                        polys.append(shape(geom))
                except:
                    continue
    print(f"  Loaded {len(polys):,} protection polygons (parks + OGMA)")
    return polys


# ── Rasterization ────────────────────────────────────────────────

def rasterize_tile(features: list, theme: dict, bounds: tuple, size: int = TILE_SIZE) -> np.ndarray:
    """Rasterize features into an RGBA numpy array for a single tile."""
    west, south, east, north = bounds
    transform = from_bounds(west, south, east, north, size, size)

    # Initialize transparent RGBA
    rgba = np.zeros((4, size, size), dtype=np.uint8)

    # Group features by class for batch rasterization
    by_class = defaultdict(list)
    for geom, cls in features:
        color = theme.get(cls)
        if color and color[3] > 0:  # Skip transparent
            by_class[cls].append(geom)

    # Paint in explicit order: unrecognised classes first, then PAINT_ORDER.
    # This ensures old-growth always wins overlaps regardless of NDJSON order.
    unknown_classes = [c for c in by_class if c not in PAINT_ORDER]
    ordered_classes = unknown_classes + [c for c in PAINT_ORDER if c in by_class]

    for cls in ordered_classes:
        geometries = by_class[cls]
        color = theme[cls]
        # Rasterize all geometries of this class at once
        shapes = [(g, 1) for g in geometries]
        try:
            mask = rasterize(
                shapes,
                out_shape=(size, size),
                transform=transform,
                fill=0,
                dtype=np.uint8,
                all_touched=True,
            )
            # Apply color where mask is 1
            for band in range(4):
                rgba[band][mask == 1] = color[band]
        except Exception as e:
            # Skip tiles that fail (empty geometry, etc.)
            pass

    return rgba


def features_in_bounds(features: list, bounds: tuple) -> list:
    """Filter features whose bounding box intersects the tile bounds (with buffer).

    Expects features as (geom, cls, bbox) 3-tuples from load_features.
    Returns (geom, cls) 2-tuples so rasterize_tile is unaffected.
    """
    west, south, east, north = bounds
    buffer = max(east - west, north - south) * 0.3
    bwest, bsouth, beast, bnorth = west - buffer, south - buffer, east + buffer, north + buffer
    result = []
    for geom, cls, bbox in features:
        minx, miny, maxx, maxy = bbox
        # Standard bbox overlap test
        if maxx >= bwest and minx <= beast and maxy >= bsouth and miny <= bnorth:
            result.append((geom, cls))
    return result


# ── PNG tile writing ─────────────────────────────────────────────

def write_tile_png(rgba: np.ndarray, path: Path):
    """Write an RGBA numpy array as a PNG file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    h, w = rgba.shape[1], rgba.shape[2]
    with rasterio.open(
        str(path),
        "w",
        driver="PNG",
        width=w,
        height=h,
        count=4,
        dtype=np.uint8,
    ) as dst:
        dst.write(rgba)


# ── Main pipeline ────────────────────────────────────────────────

def build_theme(theme_name: str, features: list, zoom_range: range = range(4, 11)):
    """Build all PNG tiles for a theme across zoom levels."""
    theme = THEMES[theme_name]
    theme_dir = OUTPUT_DIR / theme_name

    print(f"\n=== Building {theme_name} raster tiles (z{zoom_range.start}-z{zoom_range.stop - 1}) ===")

    total_tiles = 0
    total_written = 0
    start = time.time()

    for z in zoom_range:
        # Calculate tile range for BC
        x_min = lng_to_tile_x(BC_BOUNDS[0], z)
        x_max = lng_to_tile_x(BC_BOUNDS[2], z)
        y_min = lat_to_tile_y(BC_BOUNDS[3], z)  # Note: y is inverted
        y_max = lat_to_tile_y(BC_BOUNDS[1], z)

        z_tiles = (x_max - x_min + 1) * (y_max - y_min + 1)
        total_tiles += z_tiles
        z_written = 0

        print(f"\n  z{z}: {z_tiles} tiles ({x_min}-{x_max} x, {y_min}-{y_max} y)")

        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                bounds = tile_bounds(z, x, y)

                # Filter features for this tile
                tile_features = features_in_bounds(features, bounds)
                if not tile_features:
                    continue

                # Rasterize
                rgba = rasterize_tile(tile_features, theme, bounds)

                # Skip empty tiles (all transparent)
                if rgba[3].max() == 0:
                    continue

                # Write PNG
                tile_path = theme_dir / str(z) / str(x) / f"{y}.png"
                write_tile_png(rgba, tile_path)
                z_written += 1

        total_written += z_written
        elapsed = time.time() - start
        print(f"    Written: {z_written} tiles ({elapsed:.0f}s elapsed)")

    print(f"\n  Total: {total_written} tiles written for {theme_name}")
    return total_written


def main():
    theme_arg = "forest-age"
    if "--theme" in sys.argv:
        idx = sys.argv.index("--theme")
        if idx + 1 < len(sys.argv):
            theme_arg = sys.argv[idx + 1]

    print("=== OpenCanopy Raster Tile Builder ===\n")

    # Load forest-age features
    print("Loading forest-age features...")
    features = load_features(NDJSON_PATH)

    if theme_arg == "all":
        for name in THEMES:
            if name == "conservation-gap":
                print("\n  (conservation-gap requires spatial intersection -- skipping for now)")
                continue
            build_theme(name, features)
    else:
        if theme_arg not in THEMES:
            print(f"Unknown theme: {theme_arg}. Available: {', '.join(THEMES.keys())}")
            sys.exit(1)
        build_theme(theme_arg, features)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
