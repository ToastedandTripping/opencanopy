#!/usr/bin/env python3
"""
Generate per-year cutblock overlay PNGs for scrollytelling.

Produces one transparent PNG per year (1950-2025) covering the BC extent.
Each image shows all cutblocks logged by that year, age-graded from
bright red (fresh) to dark maroon (50+ years old).

Images are rasterized in equirectangular then resampled to Web Mercator
so they align correctly with MapLibre's projection.

Undated cutblocks (36K+ features with no DISTURBANCE_START_DATE) are
included in all years as low-opacity pre-1950 baseline logging.

Usage:
  python3 scripts/build-year-overlays.py
  python3 scripts/build-year-overlays.py --width 2048
  python3 scripts/build-year-overlays.py --start 1960 --end 2020
  python3 scripts/build-year-overlays.py --preview

Dependencies: rasterio, numpy, scipy (pip3 install --user rasterio numpy scipy)
"""

import argparse
import json
import math
import sys
import time
import warnings
from collections import defaultdict
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.features import rasterize
from scipy.ndimage import map_coordinates

warnings.filterwarnings("ignore", message=".*Dataset has no geotransform.*")

# ── Configuration ────────────────────────────────────────────────

_PROJECT_ROOT = Path(__file__).parent.parent
_DATA_CANDIDATES = [
    _PROJECT_ROOT / "data" / "checkpoint" / "preprocessed" / "tenure-cutblocks.ndjson",
    Path.home() / "Projects" / "opencanopy" / "data" / "checkpoint" / "preprocessed" / "tenure-cutblocks.ndjson",
]
CUTBLOCKS_PATH = next((p for p in _DATA_CANDIDATES if p.exists()), _DATA_CANDIDATES[0])
OUTPUT_DIR = Path(__file__).parent.parent / "public" / "raster" / "cutblocks-by-year"

BC_BOUNDS = (-139.5, 48.0, -114.0, 60.5)  # west, south, east, north

DEFAULT_WIDTH = 1024
DEFAULT_START_YEAR = 1950
DEFAULT_END_YEAR = 2025

UNDATED_PROXY_YEAR = 1949

# Age-grading: age (years) -> RGBA. Matches story timeline visual language.
AGE_STOPS = [
    (0, (239, 68, 68, 220)),   # #ef4444 bright red
    (25, (185, 28, 28, 200)),  # #b91c1c darker red
    (50, (127, 29, 29, 180)),  # #7f1d1d dark maroon
]

# Undated cutblocks get a muted red at low opacity
UNDATED_COLOR = (127, 29, 29, 120)  # dark maroon, semi-transparent


def lerp_color(age: int) -> tuple[int, int, int, int]:
    if age <= AGE_STOPS[0][0]:
        return AGE_STOPS[0][1]
    if age >= AGE_STOPS[-1][0]:
        return AGE_STOPS[-1][1]
    for i in range(len(AGE_STOPS) - 1):
        a0, c0 = AGE_STOPS[i]
        a1, c1 = AGE_STOPS[i + 1]
        if a0 <= age <= a1:
            t = (age - a0) / (a1 - a0)
            return tuple(int(c0[j] + (c1[j] - c0[j]) * t) for j in range(4))
    return AGE_STOPS[-1][1]


def mercator_y(lat_deg: float) -> float:
    return math.log(math.tan(math.pi / 4 + math.radians(lat_deg) / 2))


def build_mercator_row_map(height: int, south: float, north: float) -> np.ndarray:
    """For each output row, find which equirectangular input row has the right data.

    MapLibre linearly interpolates our image between Mercator-projected corners.
    Row k will be displayed at the latitude corresponding to a linear position
    in Mercator y-space. We need to find which equirectangular row holds that
    latitude's data so we can copy it to row k.

    Returns float row indices into the equirectangular source (same dimensions).
    """
    merc_north = mercator_y(north)
    merc_south = mercator_y(south)

    equirect_rows = np.zeros(height, dtype=np.float64)
    for k in range(height):
        merc_val = merc_north + k / (height - 1) * (merc_south - merc_north)
        lat = math.degrees(2 * math.atan(math.exp(merc_val)) - math.pi / 2)
        equirect_rows[k] = (north - lat) / (north - south) * (height - 1)

    return equirect_rows


def resample_to_mercator(rgba: np.ndarray, row_map: np.ndarray) -> np.ndarray:
    """Resample a (4, H, W) equirectangular RGBA image to Mercator y-spacing.

    Same output dimensions — only the y-axis row distribution changes.
    """
    height, width = rgba.shape[1], rgba.shape[2]
    out = np.zeros_like(rgba)
    col_coords = np.arange(width, dtype=np.float64)
    row_grid, col_grid = np.meshgrid(row_map, col_coords, indexing="ij")

    for band in range(4):
        out[band] = map_coordinates(
            rgba[band], [row_grid, col_grid], order=0, mode="constant", cval=0
        ).astype(np.uint8)

    return out


def main():
    parser = argparse.ArgumentParser(description="Generate per-year cutblock overlays")
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--start", type=int, default=DEFAULT_START_YEAR)
    parser.add_argument("--end", type=int, default=DEFAULT_END_YEAR)
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Only generate 4 sample years for quick testing",
    )
    args = parser.parse_args()

    west, south, east, north = BC_BOUNDS
    width = args.width
    height = int(width * (north - south) / (east - west))

    target_years = list(range(args.start, args.end + 1))
    if args.preview:
        target_years = [1950, 1975, 2000, 2025]
        target_years = [y for y in target_years if args.start <= y <= args.end]

    print("=== OpenCanopy Year Overlay Builder ===")
    print(f"  Output: {width}x{height} PNGs (Mercator-corrected), {len(target_years)} years")
    print(f"  Bounds: {BC_BOUNDS}")

    if not CUTBLOCKS_PATH.exists():
        print(f"\n  ERROR: {CUTBLOCKS_PATH} not found")
        sys.exit(1)

    # ── Load features grouped by year ────────────────────────────
    print("\nLoading cutblock features...")
    by_year: dict[int, list] = defaultdict(list)
    count = 0
    undated_count = 0

    with open(CUTBLOCKS_PATH) as f:
        for line in f:
            try:
                feat = json.loads(line)
                date_str = feat.get("properties", {}).get("DISTURBANCE_START_DATE", "")
                yr_str = date_str[:4] if date_str else ""
                geom = feat.get("geometry")
                if not geom:
                    continue

                if not yr_str.isdigit():
                    by_year[UNDATED_PROXY_YEAR].append(geom)
                    undated_count += 1
                    count += 1
                else:
                    yr = int(yr_str)
                    if yr > args.end:
                        continue
                    if yr < args.start:
                        by_year[UNDATED_PROXY_YEAR].append(geom)
                        undated_count += 1
                    else:
                        by_year[yr].append(geom)
                    count += 1

                if count % 50000 == 0:
                    print(f"  {count:,} features...")
            except Exception:
                pass

    print(f"  Loaded {count:,} features ({undated_count:,} undated/pre-{args.start})")
    dated_years = [y for y in sorted(by_year.keys()) if y != UNDATED_PROXY_YEAR]
    if dated_years:
        print(f"  Dated range: {dated_years[0]}-{dated_years[-1]}")
    undated_bucket = len(by_year.get(UNDATED_PROXY_YEAR, []))
    print(f"  Undated bucket ({UNDATED_PROXY_YEAR}): {undated_bucket:,} features")

    # ── Pre-rasterize each year-group as a binary mask ───────────
    print("\nRasterizing year masks (equirectangular)...")
    transform = from_bounds(west, south, east, north, width, height)
    year_masks: dict[int, np.ndarray] = {}

    for yr in sorted(by_year.keys()):
        shapes = [(g, 1) for g in by_year[yr]]
        try:
            mask = rasterize(
                shapes,
                out_shape=(height, width),
                transform=transform,
                fill=0,
                dtype=np.uint8,
                all_touched=True,
            )
            px = int(mask.sum())
            year_masks[yr] = mask
            if px > 0:
                label = "undated" if yr == UNDATED_PROXY_YEAR else str(yr)
                print(f"  {label:>7}: {len(by_year[yr]):>6,} features -> {px:>7,} px")
        except Exception as e:
            print(f"  {yr}: FAILED ({e})")

    del by_year

    # ── Build Mercator resampling map ────────────────────────────
    print(f"\nBuilding Mercator row map ({height} rows)...")
    row_map = build_mercator_row_map(height, south, north)

    # ── Composite per-year overlay images ────────────────────────
    print(f"\nCompositing {len(target_years)} year images (with Mercator resampling)...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    start_time = time.time()
    written = 0
    mask_years = sorted(year_masks.keys())

    for target_year in target_years:
        rgba = np.zeros((4, height, width), dtype=np.uint8)

        # Paint undated cutblocks first (lowest priority, low opacity)
        if UNDATED_PROXY_YEAR in year_masks:
            mask = year_masks[UNDATED_PROXY_YEAR]
            if mask.max() > 0:
                where = mask == 1
                for band in range(4):
                    rgba[band][where] = UNDATED_COLOR[band]

        # Paint dated cutblocks on top, oldest first
        for yr in mask_years:
            if yr == UNDATED_PROXY_YEAR:
                continue
            if yr > target_year:
                break
            mask = year_masks[yr]
            if mask.max() == 0:
                continue
            age = target_year - yr
            color = lerp_color(age)
            where = mask == 1
            for band in range(4):
                rgba[band][where] = color[band]

        # Resample equirectangular -> Mercator
        rgba_merc = resample_to_mercator(rgba, row_map)

        out_path = OUTPUT_DIR / f"{target_year}.png"
        with rasterio.open(
            str(out_path),
            "w",
            driver="PNG",
            width=width,
            height=height,
            count=4,
            dtype=np.uint8,
        ) as dst:
            dst.write(rgba_merc)

        written += 1
        if written % 10 == 0 or written == len(target_years):
            elapsed = time.time() - start_time
            print(f"  {written}/{len(target_years)} images ({elapsed:.1f}s)")

    elapsed = time.time() - start_time
    total_bytes = sum(f.stat().st_size for f in OUTPUT_DIR.glob("*.png"))
    avg_kb = total_bytes / max(written, 1) / 1024

    print(f"\n  Done: {written} PNGs in {elapsed:.1f}s")
    print(f"  Total: {total_bytes / 1024 / 1024:.1f} MB ({avg_kb:.0f} KB avg)")
    print(f"  Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
