#!/usr/bin/env python3
"""
Produce a rasterization-friendly derivative of a preprocessed NDJSON layer.

Why this exists: build-raster-tiles.py loads every feature into memory.
The full-fidelity preprocessed forest-age.ndjson (9.8 GB, ~6M features)
measures ~6.5x its text size as Python objects — a ~63 GB load, which does
not fit on the 32 GB build machine. Raster overview tiles top out at z9
(one pixel ≈ 0.00137°), so geometry detail below ~half a pixel is invisible
in the output. Simplifying at that tolerance cuts the file to ~22% and the
load to ~14 GB, which fits.

Fidelity rules:
  - Douglas-Peucker simplify at TOL (default 0.0006° ≈ 0.44 px at z9).
  - A feature whose simplified geometry is empty (sub-tolerance sliver)
    keeps its ORIGINAL geometry — no feature is ever dropped, so class
    coverage is preserved exactly; only vertex density changes.
  - Properties pass through untouched.

This feeds build-raster-tiles.py ONLY. Vector tiles (tippecanoe) keep
consuming the full-fidelity preprocessed file — do not point the PMTiles
pipeline at this output.

Usage:
  python3 scripts/pipeline/simplify-for-raster.py \
      --input data/checkpoint/preprocessed/forest-age.ndjson \
      --output data/checkpoint/preprocessed/forest-age-rasterizable.ndjson
"""

import argparse
import json
import sys
import time
from pathlib import Path

from shapely.geometry import shape, mapping

DEFAULT_TOL = 0.0006  # degrees; ~0.44 px at z9 (tile span 0.703° / 512 px)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--input", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--tolerance", type=float, default=DEFAULT_TOL)
    args = ap.parse_args()

    if not args.input.exists():
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    total = simplified = kept_original = errors = 0
    in_bytes = out_bytes = 0

    with open(args.input) as fin, open(args.output, "w") as fout:
        for line in fin:
            in_bytes += len(line)
            try:
                feat = json.loads(line)
                geom = shape(feat["geometry"])
                simp = geom.simplify(args.tolerance, preserve_topology=False)
                if simp.is_empty or not simp.is_valid:
                    kept_original += 1  # sub-tolerance sliver: keep as-is
                else:
                    feat["geometry"] = mapping(simp)
                    simplified += 1
                out = json.dumps(feat, separators=(",", ":"))
                fout.write(out + "\n")
                out_bytes += len(out) + 1
                total += 1
                if total % 500000 == 0:
                    print(
                        f"  {total:,} features ({time.time()-t0:.0f}s, "
                        f"{out_bytes/max(in_bytes,1)*100:.0f}% of input size)"
                    )
            except Exception:
                errors += 1
                continue

    print(
        f"Done: {total:,} features written ({simplified:,} simplified, "
        f"{kept_original:,} kept original, {errors} parse errors) "
        f"in {time.time()-t0:.0f}s"
    )
    print(f"  {in_bytes/1e9:.2f} GB -> {out_bytes/1e9:.2f} GB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
