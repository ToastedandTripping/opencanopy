#!/usr/bin/env python3
"""
Generate the fail-open tile-presence manifest for the story's binary
end-reveal raster (story-binary-reveal).

R2 404s for tiles that don't exist within the z4-z9 bbox (ocean/off-coast
squares a rectangular `bounds` field can't exclude, since BC's coastline is
irregular) -- these show up as console 404 spam on the live site. This
script lists the tiles that ACTUALLY EXIST in the R2 bucket and writes an
allow-list manifest that the browser-side fail-open protocol wrapper
(src/lib/story/tile-manifest.ts) uses to skip requesting tiles it can prove
are missing -- WITHOUT ever risking suppressing a real tile. If this script
is never run (or its output is deleted), the wrapper's fail-open contract
means every tile request just passes straight through, exactly as it does
today -- nothing breaks.

Usage (this repo's R2 remote is "r2", bucket "opencanopy-tiles" -- see
deploy-tiles.sh):

  rclone lsf --recursive r2:opencanopy-tiles/raster/v3/binary/ | \\
    python3 scripts/generate-tile-manifest.py --version v3

  # or, if rclone is configured and reachable from this shell, this also
  # works (the script invokes rclone itself when no stdin is piped in):
  python3 scripts/generate-tile-manifest.py --version v3

Output: public/raster/binary-tile-manifest.json (committed + deployed with
the static site; same-origin, so there's no R2 CORS issue reading it back).

IMPORTANT: --version must match the "v<N>" segment of the deployed
BINARY_RASTER_URL (src/lib/r2-config.ts). The browser wrapper treats a
version mismatch as a stale manifest and ignores it (fail-open) -- so if you
rebuild the binary tileset under a new version, regenerate the manifest with
the matching --version or it will simply be ignored (safe, but pointless).
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
DEFAULT_OUTPUT = REPO_ROOT / "public" / "raster" / "binary-tile-manifest.json"
DEFAULT_REMOTE = "r2:opencanopy-tiles/raster/v3/binary/"

# Matches rclone lsf --recursive output lines like "4/2/3.png"
TILE_LINE_RE = re.compile(r"^(\d+)/(-?\d+)/(-?\d+)\.png$")


def parse_tile_lines(lines):
    """Parse rclone lsf output lines into a sorted list of 'z/x/y' keys.

    Silently skips lines that don't match the expected tile path shape
    (blank lines, unexpected entries) rather than failing the run -- this is
    a listing tool, not a validator of the whole bucket layout.
    """
    tiles = set()
    for line in lines:
        line = line.strip()
        if not line:
            continue
        m = TILE_LINE_RE.match(line)
        if m:
            z, x, y = m.groups()
            tiles.add(f"{z}/{x}/{y}")
    return sorted(tiles)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--version",
        required=True,
        help=(
            "Raster version tag this manifest applies to -- must match the "
            "{v?} segment in BINARY_RASTER_URL (src/lib/r2-config.ts), e.g. "
            "'v3'. The browser wrapper fails open on a version mismatch."
        ),
    )
    parser.add_argument(
        "--remote",
        default=DEFAULT_REMOTE,
        help=f"rclone remote path to list if no stdin is piped in (default: {DEFAULT_REMOTE})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Manifest output path (default: {DEFAULT_OUTPUT})",
    )
    args = parser.parse_args()

    if not sys.stdin.isatty():
        lines = sys.stdin.readlines()
    else:
        print(f"No stdin detected -- invoking: rclone lsf --recursive {args.remote}", file=sys.stderr)
        result = subprocess.run(
            ["rclone", "lsf", "--recursive", args.remote],
            capture_output=True,
            text=True,
            check=True,
        )
        lines = result.stdout.splitlines()

    tiles = parse_tile_lines(lines)
    if not tiles:
        print(
            "ERROR: no tiles parsed -- refusing to write an empty manifest "
            "(an empty allow-list would make the wrapper treat EVERY tile as "
            "missing). Check the rclone listing output.",
            file=sys.stderr,
        )
        sys.exit(1)

    manifest = {
        "version": args.version,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "tiles": tiles,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")

    print(f"Wrote {len(tiles)} tile entries to {args.output}")


if __name__ == "__main__":
    main()
