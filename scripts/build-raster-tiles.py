#!/usr/bin/env python3
"""
Rasterize forest-age NDJSON into PNG overview tiles (z4-z9).

Generates multiple themed raster overlays:
  1. forest-age: 4-class coloring (registry palette)
  2. old-growth / mature / young / harvested: per-class isolation
     (one class in its canonical palette color, all others transparent)
  3. conservation-gap: red where old growth is unprotected

Each theme produces a directory of PNG tiles in XYZ layout (z/x/y.png)
that MapLibre can render as raster sources at z4-z9, replacing the
vector tile approach that crashes Chrome at province scale.

Usage:
  python3 scripts/build-raster-tiles.py [options]

  --theme THEME     One of: forest-age, binary, old-growth, mature, young,
                    harvested, conservation-gap, all  (default: forest-age)
  --input PATH      NDJSON input file (default: data/checkpoint/preprocessed/forest-age.ndjson
                    relative to the repo root)
  --output-dir DIR  Tile output directory (default: data/raster-tiles relative to repo root)
  --zoom-start Z    Lowest zoom to generate (default: 4)
  --zoom-end Z      Highest TILE zoom to generate, inclusive (default: 10).
                    The raster overlay spans DISPLAY zooms 4-9, but 256px
                    tiles fetch tile zoom = display zoom + 1, so the display
                    band z9-10 reads z10 TILES — do not stop at z9.
  --dump-themes     Print build_themes(load_palette()) as JSON to stdout and exit.
                    No heavy imports (rasterio/numpy/shapely) are needed for this path.

Dependencies: rasterio, numpy, shapely (pip3 install --user rasterio numpy shapely)
  (only required for actual tile building; --dump-themes has no heavy dependencies)

Color authority: src/lib/layers/forest-age-palette.json (canonical).
This script reads that file at startup so both client and raster tiles
share the same hex values without a manual sync step.
"""

import argparse
import json
import sys
from pathlib import Path

# NOTE: math, os, time, collections.defaultdict, numpy, rasterio, and shapely
# are imported inside the functions that need them so that --dump-themes can
# run without requiring any heavy packages to be installed.

# ── Repo root & palette ───────────────────────────────────────────

REPO_ROOT = Path(__file__).parent.parent

# Canonical color palette shared with the TypeScript registry.
# Do not hardcode hex values here; always read from the palette file.
_PALETTE_PATH = REPO_ROOT / "src" / "lib" / "layers" / "forest-age-palette.json"

def load_palette() -> dict:
    """Load the canonical forest-age class palette from the shared JSON file."""
    with open(_PALETTE_PATH) as f:
        return json.load(f)

def hex_to_rgba(hex_color: str, alpha: int) -> tuple:
    """Convert a 6-char hex color string to an (R, G, B, alpha) tuple."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        raise ValueError(f"Invalid hex color: {hex_color!r}")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)

# ── Configuration ────────────────────────────────────────────────

# Default paths (overridable via CLI flags)
_DEFAULT_NDJSON_PATH = REPO_ROOT / "data" / "checkpoint" / "preprocessed" / "forest-age.ndjson"
_DEFAULT_PARKS_PATH  = REPO_ROOT / "data" / "checkpoint" / "preprocessed" / "parks.ndjson"
_DEFAULT_OGMA_PATH   = REPO_ROOT / "data" / "checkpoint" / "preprocessed" / "ogma.ndjson"
_DEFAULT_OUTPUT_DIR  = REPO_ROOT / "data" / "raster-tiles"

# BC extent in WGS84 (approximate, covers all VRI data)
BC_BOUNDS = (-139.5, 48.0, -114.0, 60.5)  # west, south, east, north

# Tile resolution (pixels per tile)
TILE_SIZE = 512

# Paint order: most-intact classes first, disturbance LAST so disturbance
# wins overlaps. With all_touched=True a low-zoom pixel spans many polygons;
# the class painted last survives. Painting old-growth/mature last (the old
# order) made green win every mixed pixel, so the province-scale view falsely
# read as intact forest and the logging footprint only emerged on zoom-in.
# Reversed (2026-06-20): harvested/young paint last → any pixel touched by
# logging reads red at province scale. This intentionally favours showing
# disturbance *reach* over exact area in mixed pixels — the honest framing for
# a forest-loss map. Any class not listed here is painted first (loses).
PAINT_ORDER = [
    "old-growth-protected", "old-growth-unprotected", "old-growth",
    "mature", "young", "harvested",
]


def build_themes(palette: dict) -> dict:
    """
    Build the THEMES dictionary from the canonical palette.

    The forest-age default theme and all four per-class isolation themes
    derive their hex values from ``palette`` so there is one source of truth.
    The conservation-gap theme uses fixed colors (unrelated to class palette).
    """
    # Alpha values used in the default overview theme
    OVERVIEW_ALPHA = 200

    themes = {
        "forest-age": {
            "old-growth": hex_to_rgba(palette["old-growth"], OVERVIEW_ALPHA),
            "mature":     hex_to_rgba(palette["mature"],     OVERVIEW_ALPHA),
            "young":      hex_to_rgba(palette["young"],      OVERVIEW_ALPHA),
            "harvested":  hex_to_rgba(palette["harvested"],  OVERVIEW_ALPHA),
            "background": (0, 0, 0, 0),
        },
        # Binary end-reveal: old-growth = palette["old-growth"], everything else = palette["harvested"].
        # Colors are derived from forest-age-palette.json (SSOT) — if the palette changes,
        # binary follows automatically. Tile pixels are fully opaque (alpha=255); the 0.85
        # visual opacity is the MapLibre raster-opacity set in setup-layers.ts — do not bake
        # it into the pixel alpha.
        # Eyeball-gate locked per the Jen visual spec (Phase 1b):
        #   old-growth luminance 0.095 / red luminance 0.244 → ~2:1 ratio, max
        #   deuteranopia separation within a green-vs-red palette at raster patch scale.
        # Do NOT adjust palette["old-growth"] or palette["harvested"] without triggering
        # the Jen Stage 3 gate again.
        "binary": {
            "old-growth":            hex_to_rgba(palette["old-growth"], 255),
            "old-growth-protected":  hex_to_rgba(palette["old-growth"], 255),
            "old-growth-unprotected": hex_to_rgba(palette["old-growth"], 255),
            "mature":                hex_to_rgba(palette["harvested"],  255),
            "young":                 hex_to_rgba(palette["harvested"],  255),
            "harvested":             hex_to_rgba(palette["harvested"],  255),
            "background": (0, 0, 0, 0),
        },
        "conservation-gap": {
            # Protected old growth = green; unprotected = red.
            # Colors fixed — not derived from the class palette.
            "old-growth-protected":   (34, 197, 94, 200),   # #22c55e
            "old-growth-unprotected": (239, 68, 68, 230),   # #ef4444
            "mature":     (0, 0, 0, 0),
            "young":      (0, 0, 0, 0),
            "harvested":  (0, 0, 0, 0),
            "background": (0, 0, 0, 0),
        },
    }

    # Per-class isolation themes: one class painted in its palette color,
    # all other classes fully transparent.  Theme name == class slug so
    # the client's {class} URL substitution resolves correctly.
    for cls in ("old-growth", "mature", "young", "harvested"):
        isolation: dict = {"background": (0, 0, 0, 0)}
        for other in ("old-growth", "mature", "young", "harvested"):
            if other == cls:
                isolation[other] = hex_to_rgba(palette[cls], OVERVIEW_ALPHA)
            else:
                isolation[other] = (0, 0, 0, 0)
        themes[cls] = isolation

    return themes


# ── Tile math ────────────────────────────────────────────────────

def lng_to_tile_x(lng: float, zoom: int) -> int:
    import math
    return int((lng + 180) / 360 * (1 << zoom))

def lat_to_tile_y(lat: float, zoom: int) -> int:
    import math
    lat_rad = math.radians(lat)
    n = 1 << zoom
    return int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)

def tile_bounds(z: int, x: int, y: int) -> tuple:
    """Return (west, south, east, north) in WGS84 for a tile."""
    import math
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
    from shapely.geometry import shape
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
            except Exception:
                continue
    print(f"  Total: {count:,} features loaded from {path.name}")
    return features


def load_protection_polygons(parks_path: Path, ogma_path: Path) -> list:
    """Load parks + OGMA polygons for conservation gap analysis."""
    from shapely.geometry import shape
    polys = []
    for path in [parks_path, ogma_path]:
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
                except Exception:
                    continue
    print(f"  Loaded {len(polys):,} protection polygons (parks + OGMA)")
    return polys


# ── Rasterization ────────────────────────────────────────────────

def rasterize_tile(features: list, theme: dict, bounds: tuple, size: int = TILE_SIZE, all_touched: bool = True) -> "np.ndarray":
    """Rasterize features into an RGBA numpy array for a single tile.

    all_touched: when True (default), any pixel touched by a polygon edge is filled —
    shows disturbance *reach* at province scale (honest for a forest-loss map).
    Pass False for center-of-pixel coverage; default True matches the v3 forest-age behavior.
    Controlled via --no-all-touched CLI flag; the decision belongs to the operator
    running the pipeline, not to this function.
    """
    import numpy as np
    from collections import defaultdict
    from rasterio.transform import from_bounds
    from rasterio.features import rasterize
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
                all_touched=all_touched,
            )
            # Apply color where mask is 1
            for band in range(4):
                rgba[band][mask == 1] = color[band]
        except Exception:
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

def write_tile_png(rgba: "np.ndarray", path: Path):
    """Write an RGBA numpy array as a PNG file."""
    import numpy as np
    import rasterio
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

def build_theme(theme_name: str, themes: dict, features: list, output_dir: Path,
                zoom_range: range = range(4, 10), all_touched: bool = True):
    """Build all PNG tiles for a theme across zoom levels."""
    import time
    theme = themes[theme_name]
    theme_dir = output_dir / theme_name

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
                rgba = rasterize_tile(tile_features, theme, bounds, all_touched=all_touched)

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
    parser = argparse.ArgumentParser(
        description="Build raster overview tiles for OpenCanopy forest-age layer.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--theme",
        default="forest-age",
        help=(
            "Theme to build: forest-age, binary, old-growth, mature, young, harvested, "
            "conservation-gap, or all (default: forest-age)"
        ),
    )
    parser.add_argument(
        "--no-all-touched",
        dest="all_touched",
        action="store_false",
        default=True,
        help=(
            "Disable rasterio all_touched=True for this run. Default is all_touched=True "
            "(any pixel touched by a polygon edge is filled — shows disturbance reach). "
            "Useful for eyeball-gate comparison: run once with and once without to judge "
            "whether edge-touched pixels misrepresent the forest/harvested boundary. "
            "The binary theme requires a deliberate operator decision — use this flag "
            "for that per-run gate."
        ),
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=_DEFAULT_NDJSON_PATH,
        help="Path to the forest-age NDJSON input file (default: %(default)s)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=_DEFAULT_OUTPUT_DIR,
        help="Tile output root directory (default: %(default)s)",
    )
    parser.add_argument(
        "--zoom-start",
        type=int,
        default=4,
        help="Lowest zoom level to generate (default: %(default)s)",
    )
    parser.add_argument(
        "--zoom-end",
        type=int,
        default=10,
        # The raster overlay covers DISPLAY zooms 4-9, but the client uses
        # 256px tiles, which request tile zoom = display zoom + 1 — the
        # display band z9-10 reads z10 TILES (live-verified 2026-06-12).
        # Stopping at z9 blanks that band.
        help="Highest TILE zoom to generate, inclusive (default: %(default)s)",
    )
    parser.add_argument(
        "--dump-themes",
        action="store_true",
        help=(
            "Print build_themes(load_palette()) as JSON to stdout and exit. "
            "Does not require rasterio/numpy/shapely."
        ),
    )

    args = parser.parse_args()

    # ── --dump-themes: lightweight path, no heavy imports ────────────────────
    # Used by color-audit.test.ts to verify actual RGBA tuples against the palette.
    if args.dump_themes:
        palette = load_palette()
        themes = build_themes(palette)
        # Convert tuple values to lists for JSON serialisation
        serialisable = {
            theme_name: {
                cls: list(rgba)
                for cls, rgba in theme.items()
            }
            for theme_name, theme in themes.items()
        }
        print(json.dumps(serialisable, indent=2))
        sys.exit(0)

    # ── Early validation (before the expensive data load) ────────────────────

    # N3: Zoom range sanity check
    if args.zoom_start > args.zoom_end:
        print(
            f"Error: --zoom-start {args.zoom_start} is greater than "
            f"--zoom-end {args.zoom_end}. Nothing to generate.",
            file=sys.stderr,
        )
        sys.exit(1)

    # N2: Theme validation — resolve before loading 9.8 GB of features
    palette = load_palette()
    themes = build_themes(palette)

    if args.theme != "all":
        if args.theme not in themes:
            print(
                f"Error: unknown theme {args.theme!r}. "
                f"Available: {', '.join(sorted(themes.keys()))}",
                file=sys.stderr,
            )
            sys.exit(1)
        if args.theme == "conservation-gap":
            print("  (conservation-gap requires spatial intersection -- not yet implemented)")
            sys.exit(0)

    zoom_range = range(args.zoom_start, args.zoom_end + 1)

    print("=== OpenCanopy Raster Tile Builder ===\n")
    print(f"  Palette source: {_PALETTE_PATH}")
    print(f"  Input NDJSON:   {args.input}")
    print(f"  Output dir:     {args.output_dir}")
    print(f"  Zoom range:     z{args.zoom_start}-z{args.zoom_end}")
    print(f"  Theme:          {args.theme}")
    print(f"  all_touched:    {args.all_touched}  (use --no-all-touched to toggle)")
    print()

    # Load forest-age features
    print("Loading forest-age features...")
    features = load_features(args.input)

    if args.theme == "all":
        for name in themes:
            if name == "conservation-gap":
                print("\n  (conservation-gap requires spatial intersection -- skipping for now)")
                continue
            build_theme(name, themes, features, args.output_dir, zoom_range, all_touched=args.all_touched)
    else:
        build_theme(args.theme, themes, features, args.output_dir, zoom_range, all_touched=args.all_touched)

    print("\n=== Done ===")


if __name__ == "__main__":
    main()
