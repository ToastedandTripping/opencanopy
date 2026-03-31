#!/usr/bin/env python3
"""
Water body subtraction using GDAL/OGR (compiled GEOS).

Subtracts lake polygons from source NDJSON features. Uses GDAL's spatial
index for candidate lookup and GEOS for polygon difference — 10-100x faster
than the JavaScript/turf equivalent.

Usage:
    python3 scripts/water-subtract-gdal.py <input.ndjson> <output.ndjson> [--lakes <lakes.gpkg>] [--min-area 5]

The lakes GPKG must be pre-built with a spatial index:
    ogr2ogr -f GPKG lakes.gpkg fwa-lakes.ndjson -where "AREA_HA >= 5" -nln lakes -lco SPATIAL_INDEX=YES
"""

import json
import os
import sys
import time
from pathlib import Path

try:
    from osgeo import ogr, osr
    ogr.UseExceptions()
except ImportError:
    print("ERROR: GDAL Python bindings not available. Install with: pip install GDAL", file=sys.stderr)
    sys.exit(1)

# ── Configuration ─────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LAKES = PROJECT_ROOT / "data" / "geojson" / "reference" / "fwa-lakes.gpkg"
MIN_AREA_M2 = 10_000  # 1 hectare in square metres

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Subtract water bodies from NDJSON features using GDAL/GEOS")
    parser.add_argument("input", help="Input NDJSON file")
    parser.add_argument("output", help="Output NDJSON file")
    parser.add_argument("--lakes", default=str(DEFAULT_LAKES), help="Lakes GeoPackage (with spatial index)")
    parser.add_argument("--min-area", type=float, default=5, help="Minimum lake area in hectares (default: 5)")
    args = parser.parse_args()

    input_path = args.input
    output_path = args.output
    lakes_path = args.lakes

    if not os.path.exists(input_path):
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(lakes_path):
        print(f"ERROR: Lakes GPKG not found: {lakes_path}", file=sys.stderr)
        print(f"Build it with: ogr2ogr -f GPKG {lakes_path} <fwa-lakes.ndjson> -where 'AREA_HA >= {args.min_area}' -nln lakes -lco SPATIAL_INDEX=YES", file=sys.stderr)
        sys.exit(1)

    # Open lakes layer (with spatial index)
    lakes_ds = ogr.Open(lakes_path)
    if lakes_ds is None:
        print(f"ERROR: Cannot open lakes GPKG: {lakes_path}", file=sys.stderr)
        sys.exit(1)
    lakes_layer = lakes_ds.GetLayer("lakes")
    if lakes_layer is None:
        # Try first layer if "lakes" doesn't exist
        lakes_layer = lakes_ds.GetLayer(0)
    if lakes_layer is None:
        print(f"ERROR: No layer found in lakes GPKG", file=sys.stderr)
        sys.exit(1)

    lake_count = lakes_layer.GetFeatureCount()
    print(f"  Lakes: {lake_count:,} polygons from {lakes_path}")

    # Count input lines for ETA
    print(f"  Counting input features...", end="", flush=True)
    total_features = 0
    with open(input_path, 'r') as f:
        for _ in f:
            total_features += 1
    print(f" {total_features:,}")

    # Process
    start = time.time()
    processed = 0
    intersected = 0
    modified = 0
    dropped = 0
    failed = 0
    written = 0

    write_buf = []
    WRITE_BATCH = 1000

    with open(input_path, 'r') as fin, open(output_path, 'w') as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue

            processed += 1

            # Progress every 100K
            if processed % 100_000 == 0:
                elapsed = time.time() - start
                rate = processed / elapsed if elapsed > 0 else 0
                pct = (processed / total_features * 100) if total_features > 0 else 0
                remaining = (total_features - processed) / rate / 60 if rate > 0 else 0
                print(f"\r  [water-subtract] {processed:,} / {total_features:,} ({pct:.1f}%) | "
                      f"{rate:.0f} f/s | ETA {remaining:.0f}m | "
                      f"{modified} modified, {dropped} dropped     ", end="", flush=True)

            try:
                feature_json = json.loads(line)
            except json.JSONDecodeError:
                write_buf.append(line)
                if len(write_buf) >= WRITE_BATCH:
                    fout.write("\n".join(write_buf) + "\n")
                    write_buf.clear()
                continue

            geom_json = feature_json.get("geometry")
            if not geom_json or geom_json.get("type") not in ("Polygon", "MultiPolygon"):
                write_buf.append(line)
                if len(write_buf) >= WRITE_BATCH:
                    fout.write("\n".join(write_buf) + "\n")
                    write_buf.clear()
                continue

            # Create OGR geometry from GeoJSON
            try:
                feature_geom = ogr.CreateGeometryFromJson(json.dumps(geom_json))
            except Exception:
                write_buf.append(line)
                if len(write_buf) >= WRITE_BATCH:
                    fout.write("\n".join(write_buf) + "\n")
                    write_buf.clear()
                failed += 1
                continue

            if feature_geom is None or feature_geom.IsEmpty():
                write_buf.append(line)
                if len(write_buf) >= WRITE_BATCH:
                    fout.write("\n".join(write_buf) + "\n")
                    write_buf.clear()
                continue

            # Spatial filter: find lakes that intersect this feature's envelope
            envelope = feature_geom.GetEnvelope()  # (minX, maxX, minY, maxY)
            lakes_layer.SetSpatialFilterRect(envelope[0], envelope[2], envelope[1], envelope[3])

            # Collect intersecting lake geometries
            lake_geoms = []
            for lake_feat in lakes_layer:
                lake_geom = lake_feat.GetGeometryRef()
                if lake_geom is not None and feature_geom.Intersects(lake_geom):
                    lake_geoms.append(lake_geom.Clone())
            lakes_layer.ResetReading()

            if not lake_geoms:
                # No intersecting lakes — pass through unchanged
                write_buf.append(line)
                if len(write_buf) >= WRITE_BATCH:
                    fout.write("\n".join(write_buf) + "\n")
                    write_buf.clear()
                continue

            intersected += 1

            # Subtract all intersecting lakes
            try:
                result_geom = feature_geom
                for lake_geom in lake_geoms:
                    result_geom = result_geom.Difference(lake_geom)
                    if result_geom is None or result_geom.IsEmpty():
                        dropped += 1
                        break
                else:
                    # Check if remaining area > 1 hectare
                    if result_geom.GetArea() < MIN_AREA_M2 * 1e-10:  # approx sq degrees
                        # More accurate area check using the geometry
                        # GetArea() in WGS84 returns sq degrees, rough conversion
                        # At ~50° lat, 1° ≈ 111km, so 1 sq degree ≈ 111*71 = 7,881 km²
                        # 1 ha = 0.01 km², so threshold ≈ 0.01/7881 ≈ 1.27e-6 sq degrees
                        if result_geom.GetArea() < 1.27e-6:
                            dropped += 1
                            continue

                    # Update feature geometry
                    result_json = json.loads(result_geom.ExportToJson())
                    feature_json["geometry"] = result_json
                    modified += 1
                    write_buf.append(json.dumps(feature_json, separators=(',', ':')))
                    if len(write_buf) >= WRITE_BATCH:
                        fout.write("\n".join(write_buf) + "\n")
                        write_buf.clear()
                    continue

                # If we broke out of the loop (feature entirely in lake)
                continue

            except Exception as e:
                failed += 1
                # Write original feature on error
                write_buf.append(line)
                if len(write_buf) >= WRITE_BATCH:
                    fout.write("\n".join(write_buf) + "\n")
                    write_buf.clear()
                continue

            written += 1

        # Flush remaining buffer
        if write_buf:
            fout.write("\n".join(write_buf) + "\n")

    elapsed = time.time() - start
    rate = processed / elapsed if elapsed > 0 else 0
    print(f"\n  [water-subtract] Complete: {processed:,} features in {elapsed:.0f}s ({rate:.0f} f/s)")
    print(f"  Intersected: {intersected:,} | Modified: {modified:,} | Dropped: {dropped:,} | Failed: {failed:,}")

    # Write stats JSON
    stats_path = output_path + ".stats.json"
    stats = {
        "total": processed,
        "intersected": intersected,
        "modified": modified,
        "dropped": dropped,
        "failed": failed,
        "elapsedSeconds": round(elapsed),
        "featuresPerSecond": round(rate),
    }
    with open(stats_path, 'w') as f:
        json.dump(stats, f, indent=2)
    print(f"  Stats written to: {stats_path}")


if __name__ == "__main__":
    main()
