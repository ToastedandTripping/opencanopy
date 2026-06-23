#!/usr/bin/env python3
"""
Generate per-year overlay PNGs (and the static forest base) for the scrollytelling story.

Three datasets share this pipeline (select with --dataset):
  cutblocks    cumulative logging, age-graded fresh-red -> dark-maroon
               (1950-2025). Undated cutblocks (36K+ with no
               DISTURBANCE_START_DATE) are baked into every year as a
               low-opacity pre-1950 baseline.
  fire         cumulative wildfire, age-graded fresh-amber -> burnt-umber
               (1917-2025, the full recorded span). No undated bucket.
  forest-base  single-pass static green substrate from real VRI polygons.
               Runs an early-branch in main() and returns BEFORE the year
               loop — the cutblocks/fire code paths are byte-for-byte
               unchanged. All grid helpers (BC_BOUNDS, build_mercator_row_map,
               resample_to_mercator) are reused in-place; no extraction needed.

Per-year datasets produce one transparent PNG per year covering the BC extent,
age-graded by (target_year - feature_year). One PNG is written for EVERY year
in [start, end] even if its mask is empty, so the story scrub never 404s on a
sparse year.

Images are rasterized in equirectangular then resampled to Web Mercator so they
align with MapLibre's projection.

Usage:
  python3 scripts/build-year-overlays.py                          # cutblocks (default)
  python3 scripts/build-year-overlays.py --dataset fire
  python3 scripts/build-year-overlays.py --dataset fire --preview
  python3 scripts/build-year-overlays.py --width 2048 --start 1960 --end 2020
  python3 scripts/build-year-overlays.py --dataset forest-base --width 2048
  python3 scripts/build-year-overlays.py --dataset forest-base --limit 10000  # smoke run

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
    # forest-base is a single-pass dataset (no year loop). Its entry documents
    # the input filename and output location; the actual run is handled by
    # run_forest_base() via the early-branch in main(). year_field is None because
    # there is no per-feature year; all features are painted one solid green.
    "forest-base": {
        "filename": "forest-age-rasterizable.ndjson",
        "output_subdir": "cutblocks-by-year",
        "single_output": "forest-base.png",
        "year_field": None,
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


def _parse_hex_color(hex_str: str) -> tuple[int, int, int]:
    """Parse a '#rrggbb' hex string into an (r, g, b) int tuple."""
    h = hex_str.lstrip("#")
    if len(h) != 6:
        raise ValueError(f"Expected 6-digit hex color, got: {hex_str!r}")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def run_forest_base(args) -> None:
    """Single-pass rasterizer for the static green forest substrate.

    Reads forest-age-rasterizable.ndjson line-by-line (streaming — never
    materializes all features into a list) and rasterizes all forest polygons
    as a binary mask.  The mask is resampled equirect->Mercator via the shared
    build_mercator_row_map / resample_to_mercator helpers, then written as a
    paletted (2-color) PNG: index 0 = transparent, index 1 = green.

    The output is written to a .tmp.png sibling first; MARVIN inspects it and
    then moves it over the committed forest-base.png.  This function never
    overwrites the committed asset directly.

    all_touched=False (intentional divergence from the year overlays which use
    all_touched=True): the base wants forest *extent* (center-in-polygon), not
    disturbance *reach*.  This gives cleaner coastline and lake edges — a forest
    polygon ringing a small lake will not bleed green over the open water.
    Nearest-neighbour (order=0) Mercator resampling produces a 1-px jagged
    coastline; that is expected, not a defect.
    """
    cfg = DATASETS["forest-base"]
    input_path = _data_path(cfg["filename"])
    output_dir = _PROJECT_ROOT / "public" / "raster" / cfg["output_subdir"]
    output_dir.mkdir(parents=True, exist_ok=True)
    target_path = output_dir / cfg["single_output"]
    tmp_path = output_dir / (cfg["single_output"].replace(".png", ".tmp.png"))

    if not input_path.exists():
        print(f"\n  ERROR: {input_path} not found")
        print("  (forest-age-rasterizable.ndjson lives in data/checkpoint/preprocessed/")
        print("   and is NOT committed to the repo; run on the box holding the data checkpoint.)")
        sys.exit(1)

    try:
        r, g, b = _parse_hex_color(args.green)
    except ValueError as exc:
        print(f"\n  ERROR: invalid --green value: {exc}")
        sys.exit(1)

    west, south, east, north = BC_BOUNDS
    width = args.width
    # Use the builder's exact int(...) expression — NOT round().
    # int(2048 * 12.5 / 25.5) = int(1003.92...) = 1003.
    # round() would yield 1004 — a one-row misregistration vs the year overlays.
    height = int(width * (north - south) / (east - west))

    print(f"=== OpenCanopy Forest Base Builder ===")
    print(f"  Input:  {input_path}")
    print(f"  Output: {tmp_path}  (move to {target_path.name} after inspection)")
    print(f"  Grid:   {width}x{height} (equirect), Mercator-corrected")
    print(f"  Bounds: {BC_BOUNDS}")
    print(f"  Color:  #{r:02x}{g:02x}{b:02x} (index 1); index 0 = transparent")
    if args.limit:
        print(f"  Limit:  {args.limit:,} features (smoke run)")

    transform = from_bounds(west, south, east, north, width, height)

    # ── Stream features one at a time into rasterize ──────────────
    # Never collect into a list — forest-age-rasterizable.ndjson is 2.37 GB /
    # 6.2M features and json.loads produces a 6.5x object-blowup per the
    # simplify-for-raster.py docs.  rasterio.features.rasterize accepts any
    # iterable and consumes it lazily; feeding it a generator keeps peak RSS
    # bounded to the output array (~2 MB for 2048x1003 uint8) plus transient
    # per-feature GeoJSON dict overhead.

    null_geom_count = 0
    feature_count = 0

    def feature_shapes():
        """Yield (geom_dict, 1) one at a time from the NDJSON stream."""
        nonlocal null_geom_count, feature_count

        with open(input_path) as f:
            for line in f:
                if args.limit and feature_count >= args.limit:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    feat = json.loads(line)
                except Exception:
                    # Malformed JSON line — skip without aborting the whole run.
                    null_geom_count += 1
                    continue

                geom = feat.get("geometry")
                if not geom:
                    null_geom_count += 1
                    continue

                feature_count += 1
                if feature_count % 500000 == 0:
                    print(f"  {feature_count:,} features streamed...")

                yield (geom, 1)

    print("\nRasterizing forest mask (equirectangular, streaming)...")
    mask = rasterize(
        feature_shapes(),
        out_shape=(height, width),
        transform=transform,
        fill=0,
        dtype=np.uint8,
        all_touched=False,  # forest extent (center-in-polygon), NOT disturbance reach
    )

    if null_geom_count > 0:
        print(f"  Skipped {null_geom_count:,} null/malformed geometries")
    print(f"  Rasterized {feature_count:,} features -> {int(mask.sum()):,} px set")

    # ── Mercator resample ─────────────────────────────────────────
    print(f"\nBuilding Mercator row map ({height} rows)...")
    row_map = build_mercator_row_map(height, south, north)

    # resample_to_mercator expects (4, H, W) RGBA; broadcast the 1-band mask.
    # We'll write the resampled mask as a paletted PNG, so we only need
    # the alpha-expanded form to feed the shared helper.
    mask_rgba = np.zeros((4, height, width), dtype=np.uint8)
    mask_rgba[0] = mask * r    # R
    mask_rgba[1] = mask * g    # G
    mask_rgba[2] = mask * b    # B
    mask_rgba[3] = mask * 255  # A (fully opaque where forest, transparent elsewhere)

    print("Resampling equirectangular -> Mercator (order-0 nearest)...")
    rgba_merc = resample_to_mercator(mask_rgba, row_map)

    # Collapse back to a 1-band index mask (0 = transparent, 1 = forest).
    merc_mask = (rgba_merc[3] > 0).astype(np.uint8)  # alpha channel tells us where forest is
    merc_px = int(merc_mask.sum())
    print(f"  Mercator mask: {merc_px:,} forest px ({merc_px / (width * height) * 100:.1f}% of frame)")

    # ── Write paletted PNG ────────────────────────────────────────
    # 2-entry colormap: index 0 = (0,0,0,0) transparent, index 1 = (r,g,b,255) green.
    # Paletted keeps the file tiny (~50-100 KB vs ~8 MB truecolor-RGBA) and matches
    # the format of the committed year-overlay frames (which were post-quantized).
    print(f"\nWriting paletted PNG -> {tmp_path} ...")
    with rasterio.open(
        str(tmp_path),
        "w",
        driver="PNG",
        width=width,
        height=height,
        count=1,
        dtype=np.uint8,
    ) as dst:
        dst.write(merc_mask, 1)
        dst.write_colormap(1, {
            0: (0, 0, 0, 0),      # transparent (non-forest)
            1: (r, g, b, 255),    # solid green (forest)
        })

    file_kb = tmp_path.stat().st_size / 1024
    print(f"  Written: {width}x{height}, {file_kb:.0f} KB")
    print(f"\n  Inspect: open {tmp_path}")
    print(f"  Then:    mv {tmp_path} {target_path}")
    print(f"  (MARVIN will do the mv after visual inspection and full-data run)")


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
    parser.add_argument(
        "--green",
        default="#15803d",
        help="Forest fill color for --dataset forest-base (default: #15803d)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        metavar="N",
        help="Smoke-run: stop after N features (forest-base only)",
    )
    args = parser.parse_args()

    # ── Early branch: forest-base is a single-pass dataset ───────────────────
    # Returns before the year loop; cutblocks/fire code paths are unchanged.
    if args.dataset == "forest-base":
        run_forest_base(args)
        return

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
