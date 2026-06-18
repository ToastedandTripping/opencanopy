#!/usr/bin/env python3
"""
Generate per-year overlay PNGs for the scrollytelling story.

Two datasets share this pipeline (select with --dataset):
  cutblocks  cumulative logging, age-graded fresh-red -> dark-maroon
             (1950-2025). Undated cutblocks (36K+ with no
             DISTURBANCE_START_DATE) are baked into every year as a
             low-opacity pre-1950 baseline.
  fire       cumulative wildfire, age-graded fresh-amber -> burnt-umber
             (1917-2025, the full recorded span). No undated bucket.

Each dataset produces one transparent PNG per year covering the BC
extent, age-graded by (target_year - feature_year). One PNG is written
for EVERY year in [start, end] even if its mask is empty, so the story
scrub never 404s on a sparse year.

Images are rasterized in equirectangular then resampled to Web Mercator
so they align with MapLibre's projection.

Usage:
  python3 scripts/build-year-overlays.py                      # cutblocks (default)
  python3 scripts/build-year-overlays.py --dataset fire
  python3 scripts/build-year-overlays.py --dataset fire --preview
  python3 scripts/build-year-overlays.py --width 2048 --start 1960 --end 2020

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


def _data_path(filename: str) -> Path:
    candidates = [
        _PROJECT_ROOT / "data" / "checkpoint" / "preprocessed" / filename,
        Path.home() / "Projects" / "opencanopy" / "data" / "checkpoint" / "preprocessed" / filename,
    ]
    return next((p for p in candidates if p.exists()), candidates[0])


# Per-dataset configuration. Each dataset is rasterized cumulatively and
# age-graded by (target_year - feature_year) through its own AGE_STOPS ramp.
DATASETS = {
    "cutblocks": {
        "filename": "tenure-cutblocks.ndjson",
        "output_subdir": "cutblocks-by-year",
        "year_field": "DISTURBANCE_START_DATE",
        "year_kind": "date",          # take [:4] of an ISO date string
        "start": 1950,
        "end": 2025,
        "age_stops": [
            (0, (239, 68, 68, 220)),   # #ef4444 bright red
            (25, (185, 28, 28, 200)),  # #b91c1c darker red
            (50, (127, 29, 29, 180)),  # #7f1d1d dark maroon
        ],
        # Undated cutblocks (no DISTURBANCE_START_DATE) + anything pre-start are
        # bucketed at the proxy year and painted into every frame as a muted
        # baseline, so loss that predates the records is visible from 1950.
        "undated_proxy_year": 1949,
        "undated_color": (127, 29, 29, 120),  # dark maroon, semi-transparent
    },
    "fire": {
        "filename": "fire-history.ndjson",
        "output_subdir": "fire-by-year",
        "year_field": "FIRE_YEAR",
        "year_kind": "int",           # already a 4-digit year string
        "start": 1917,                # full recorded span — pre-1985 is 45% of burned area
        "end": 2025,
        "age_stops": [
            (0, (245, 158, 11, 210)),  # #f59e0b fresh amber
            (25, (217, 119, 6, 180)),  # #d97706 mid amber
            (50, (146, 64, 14, 140)),  # #92400e burnt umber
        ],
        # Fires are all dated; no undated bucket.
        "undated_proxy_year": None,
        "undated_color": None,
    },
}

BC_BOUNDS = (-139.5, 48.0, -114.0, 60.5)  # west, south, east, north

DEFAULT_WIDTH = 1024


def lerp_color(age: int, age_stops: list) -> tuple[int, int, int, int]:
    if age <= age_stops[0][0]:
        return age_stops[0][1]
    if age >= age_stops[-1][0]:
        return age_stops[-1][1]
    for i in range(len(age_stops) - 1):
        a0, c0 = age_stops[i]
        a1, c1 = age_stops[i + 1]
        if a0 <= age <= a1:
            t = (age - a0) / (a1 - a0)
            return tuple(int(c0[j] + (c1[j] - c0[j]) * t) for j in range(4))
    return age_stops[-1][1]


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
    parser = argparse.ArgumentParser(description="Generate per-year story overlays")
    parser.add_argument(
        "--dataset",
        choices=sorted(DATASETS.keys()),
        default="cutblocks",
        help="Which dataset to rasterize (default: cutblocks)",
    )
    parser.add_argument("--width", type=int, default=DEFAULT_WIDTH)
    parser.add_argument("--start", type=int, default=None, help="Override dataset start year")
    parser.add_argument("--end", type=int, default=None, help="Override dataset end year")
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Only generate 4 sample years for quick testing",
    )
    args = parser.parse_args()

    cfg = DATASETS[args.dataset]
    start_year = args.start if args.start is not None else cfg["start"]
    end_year = args.end if args.end is not None else cfg["end"]
    year_field = cfg["year_field"]
    year_kind = cfg["year_kind"]
    age_stops = cfg["age_stops"]
    undated_proxy_year = cfg["undated_proxy_year"]
    undated_color = cfg["undated_color"]

    input_path = _data_path(cfg["filename"])
    output_dir = _PROJECT_ROOT / "public" / "raster" / cfg["output_subdir"]

    west, south, east, north = BC_BOUNDS
    width = args.width
    height = int(width * (north - south) / (east - west))

    target_years = list(range(start_year, end_year + 1))
    if args.preview:
        span = end_year - start_year
        target_years = sorted({start_year, start_year + span // 3, start_year + 2 * span // 3, end_year})

    print(f"=== OpenCanopy Year Overlay Builder ({args.dataset}) ===")
    print(f"  Input:  {input_path}")
    print(f"  Output: {output_dir}")
    print(f"  Frames: {width}x{height} PNGs (Mercator-corrected), {len(target_years)} years ({start_year}-{end_year})")
    print(f"  Bounds: {BC_BOUNDS}")

    if not input_path.exists():
        print(f"\n  ERROR: {input_path} not found")
        sys.exit(1)

    def parse_year(props: dict):
        """Return an int year from the dataset's year field, or None if unparseable."""
        raw = props.get(year_field, "")
        if raw is None:
            return None
        s = str(raw)
        token = s[:4] if year_kind == "date" else s.strip()
        return int(token) if token.isdigit() else None

    # ── Load features grouped by year ────────────────────────────
    print(f"\nLoading {args.dataset} features...")
    by_year: dict[int, list] = defaultdict(list)
    count = 0
    undated_count = 0

    with open(input_path) as f:
        for line in f:
            try:
                feat = json.loads(line)
                geom = feat.get("geometry")
                if not geom:
                    continue
                yr = parse_year(feat.get("properties", {}))

                if yr is None or yr < start_year:
                    # Undated or pre-start: bucket as baseline if the dataset
                    # supports it, otherwise drop (fire has no undated bucket).
                    if undated_proxy_year is not None:
                        by_year[undated_proxy_year].append(geom)
                        undated_count += 1
                        count += 1
                    continue
                if yr > end_year:
                    continue
                by_year[yr].append(geom)
                count += 1

                if count % 50000 == 0:
                    print(f"  {count:,} features...")
            except Exception:
                pass

    print(f"  Loaded {count:,} features ({undated_count:,} undated/pre-{start_year})")
    dated_years = [y for y in sorted(by_year.keys()) if y != undated_proxy_year]
    if dated_years:
        print(f"  Dated range: {dated_years[0]}-{dated_years[-1]}")
    if undated_proxy_year is not None:
        undated_bucket = len(by_year.get(undated_proxy_year, []))
        print(f"  Undated bucket ({undated_proxy_year}): {undated_bucket:,} features")

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
                label = "undated" if yr == undated_proxy_year else str(yr)
                print(f"  {label:>7}: {len(by_year[yr]):>6,} features -> {px:>7,} px")
        except Exception as e:
            print(f"  {yr}: FAILED ({e})")

    del by_year

    # ── Build Mercator resampling map ────────────────────────────
    print(f"\nBuilding Mercator row map ({height} rows)...")
    row_map = build_mercator_row_map(height, south, north)

    # ── Composite per-year overlay images ────────────────────────
    print(f"\nCompositing {len(target_years)} year images (with Mercator resampling)...")
    output_dir.mkdir(parents=True, exist_ok=True)

    start_time = time.time()
    written = 0
    mask_years = sorted(year_masks.keys())

    for target_year in target_years:
        rgba = np.zeros((4, height, width), dtype=np.uint8)

        # Paint undated/baseline features first (lowest priority, low opacity)
        if undated_proxy_year is not None and undated_proxy_year in year_masks:
            mask = year_masks[undated_proxy_year]
            if mask.max() > 0:
                where = mask == 1
                for band in range(4):
                    rgba[band][where] = undated_color[band]

        # Paint dated features on top, oldest first
        for yr in mask_years:
            if yr == undated_proxy_year:
                continue
            if yr > target_year:
                break
            mask = year_masks[yr]
            if mask.max() == 0:
                continue
            age = target_year - yr
            color = lerp_color(age, age_stops)
            where = mask == 1
            for band in range(4):
                rgba[band][where] = color[band]

        # Resample equirectangular -> Mercator
        rgba_merc = resample_to_mercator(rgba, row_map)

        out_path = output_dir / f"{target_year}.png"
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
    total_bytes = sum(f.stat().st_size for f in output_dir.glob("*.png"))
    avg_kb = total_bytes / max(written, 1) / 1024

    print(f"\n  Done: {written} PNGs in {elapsed:.1f}s")
    print(f"  Total: {total_bytes / 1024 / 1024:.1f} MB ({avg_kb:.0f} KB avg)")
    print(f"  Output: {output_dir}")


if __name__ == "__main__":
    main()
