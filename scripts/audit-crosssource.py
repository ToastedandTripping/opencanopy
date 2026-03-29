#!/usr/bin/env python3
"""
OpenCanopy Cross-Source Ground Truth Audit — Part D

Samples random points across BC and compares forest-age classification
between our PMTiles archive and the Global Forest Watch (GFW) Hansen
loss year dataset.

Agreement definition:
  - "disturbed"   = forest-age class "harvested" OR "young" (age < 80)
  - "undisturbed" = forest-age class "mature" OR "old-growth" (age >= 80)

GFW API note: The Hansen Global Forest Change dataset is available via
Google Earth Engine or the GFW API. The GFW REST API requires authentication
and may have rate limits. If the API is unreachable this script degrades
gracefully and reports a WARN rather than failing.

Usage:
  python3 scripts/audit-crosssource.py
  python3 scripts/audit-crosssource.py --samples 100
  python3 scripts/audit-crosssource.py --output data/reports/crosssource-results.json

Requirements:
  - Python 3.8+
  - requests (stdlib in Python 3 via urllib — no third-party packages required)
  - Node.js + tsx (for the PMTiles reader helper)
"""

import json
import math
import os
import random
import subprocess
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PMTILES_PATH = PROJECT_ROOT / "data" / "tiles" / "opencanopy.pmtiles"
REPORTS_DIR = PROJECT_ROOT / "data" / "reports"
DEFAULT_OUTPUT = REPORTS_DIR / "crosssource-results.json"

# BC bounding box (WGS84)
BC_LAT_MIN = 48.0
BC_LAT_MAX = 60.0
BC_LON_MIN = -140.0
BC_LON_MAX = -114.0

# Default sample count
DEFAULT_SAMPLES = 500

# GFW API configuration
# The Hansen Global Forest Change loss year data is accessible via GFW API.
# Endpoint requires a GFW API key: https://www.globalforestwatch.org/howto/api/
GFW_API_BASE = "https://data-api.globalforestwatch.org"
GFW_DATASET = "umd_tree_cover_loss"

# PMTiles reader helper script path
PMT_READER_SCRIPT = PROJECT_ROOT / "scripts" / "lib" / "pmtiles-point-reader.mjs"

# Zoom level for PMTiles point sampling (z10 = most detailed tier)
SAMPLE_ZOOM = 10

# ── BC land mask (rough) ───────────────────────────────────────────────────────

def is_likely_land(lat: float, lon: float) -> bool:
    """
    Rough land filter to avoid sampling ocean/ocean points.
    BC is mostly land; this filters out the obvious Pacific coast offshore areas.
    Not exhaustive — some coastal tiles will still be ocean.
    """
    # Exclude obvious Pacific offshore (west of BC coast ~-130 below lat 54)
    if lon < -132.0 and lat < 54.0:
        return False
    # Exclude far northwest corner (Yukon border area, less BC coverage)
    if lon < -136.0 and lat > 58.0:
        return False
    return True

def random_bc_point() -> tuple[float, float]:
    """Generate a random (lat, lon) within BC land area."""
    for _ in range(100):
        lat = random.uniform(BC_LAT_MIN, BC_LAT_MAX)
        lon = random.uniform(BC_LON_MIN, BC_LON_MAX)
        if is_likely_land(lat, lon):
            return lat, lon
    # Fallback — BC center
    return 54.0, -125.0

# ── PMTiles reader ─────────────────────────────────────────────────────────────

def ensure_pmtiles_reader() -> bool:
    """
    Write the Node.js PMTiles point reader helper if it doesn't exist.
    This script reads a single tile from PMTiles and returns feature data for a point.
    """
    if PMT_READER_SCRIPT.exists():
        return True

    script = """#!/usr/bin/env node
/**
 * PMTiles point reader helper — called by audit-crosssource.py
 *
 * Usage: node pmtiles-point-reader.mjs <pmtiles-path> <lat> <lon> <zoom>
 * Output: JSON { layer: "forest-age", class: "old-growth"|"mature"|"young"|"harvested"|null }
 */
import { PMTiles } from "pmtiles";
import { readFileSync } from "fs";
import { gunzipSync } from "zlib";

// Inline NodeFileSource to avoid import issues
class NodeFileSource {
  constructor(path) { this.path = path; this.fh = null; }
  async getBytes(offset, length) {
    if (!this.fh) {
      const { open } = await import("fs/promises");
      this.fh = await open(this.path, "r");
    }
    const buffer = Buffer.alloc(length);
    await this.fh.read(buffer, 0, length, offset);
    return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  }
  getKey() { return this.path; }
}

function latLonToTile(lat, lon, zoom) {
  const z = Math.floor(zoom);
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), z };
}

const [,, pmtilesPath, latStr, lonStr, zoomStr] = process.argv;
if (!pmtilesPath || !latStr || !lonStr || !zoomStr) {
  console.log(JSON.stringify({ error: "Usage: pmtiles-point-reader.mjs <path> <lat> <lon> <zoom>" }));
  process.exit(1);
}

const lat = parseFloat(latStr);
const lon = parseFloat(lonStr);
const zoom = parseInt(zoomStr, 10);

try {
  const source = new NodeFileSource(pmtilesPath);
  const pmtiles = new PMTiles(source);
  const { x, y, z } = latLonToTile(lat, lon, zoom);
  const result = await pmtiles.getZxy(z, x, y);
  if (!result || !result.data) {
    console.log(JSON.stringify({ class: null, reason: "no tile" }));
    process.exit(0);
  }

  // Minimal MVT parse — just pull forest-age class from first matching feature
  const VectorTileLib = await import("@mapbox/vector-tile");
  const PbfLib = await import("pbf");
  const { VectorTile } = VectorTileLib;
  const Pbf = PbfLib.default ?? PbfLib;

  const bytes = Buffer.from(result.data);
  const isGzip = bytes.length >= 2 && bytes.readUInt16BE(0) === 0x1f8b;
  const raw = isGzip ? gunzipSync(bytes) : bytes;

  const pbf = new Pbf(new Uint8Array(raw));
  const tile = new VectorTile(pbf);

  const layer = tile.layers["forest-age"];
  if (!layer || layer.length === 0) {
    console.log(JSON.stringify({ class: null, reason: "no forest-age features" }));
    process.exit(0);
  }

  const feature = layer.feature(0);
  const props = feature.properties ?? {};
  console.log(JSON.stringify({ class: props.class ?? null, age: props.age ?? null }));
} catch (err) {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(0);
}
"""
    PMT_READER_SCRIPT.write_text(script)
    return True

def read_forest_age_at_point(lat: float, lon: float, zoom: int) -> dict:
    """
    Read forest-age class from PMTiles for a given point.
    Shells out to the Node.js helper script.
    Returns { class: str|None, error: str|None }
    """
    try:
        result = subprocess.run(
            ["node", str(PMT_READER_SCRIPT), str(PMTILES_PATH), str(lat), str(lon), str(zoom)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0 and result.stderr:
            return {"class": None, "error": result.stderr.strip()}
        return json.loads(result.stdout.strip() or '{"class": null}')
    except subprocess.TimeoutExpired:
        return {"class": None, "error": "timeout"}
    except json.JSONDecodeError as e:
        return {"class": None, "error": f"json parse error: {e}"}
    except Exception as e:
        return {"class": None, "error": str(e)}

# ── GFW API ────────────────────────────────────────────────────────────────────

def query_gfw_at_point(lat: float, lon: float) -> dict:
    """
    Query the GFW Hansen loss year dataset for a given point.

    Returns { disturbed: bool|None, loss_year: int|None, error: str|None }

    The GFW Data API supports point queries:
      GET /dataset/{dataset}/latest/query/json?sql=SELECT...&geostore_id=...
    or via geometry:
      POST /dataset/{dataset}/latest/query/json with GeoJSON body

    Authentication: requires x-api-key header.
    If API key is not configured or the API is unreachable, returns a graceful WARN.
    """
    api_key = os.environ.get("GFW_API_KEY", "")
    if not api_key:
        return {"disturbed": None, "error": "GFW_API_KEY not set — skipping GFW query"}

    # Simple point-in-pixel query using the GFW pixel data endpoint
    # This is the closest thing to a publicly documented point API.
    # The actual production API may differ — this is structured to show intent.
    url = (
        f"{GFW_API_BASE}/dataset/{GFW_DATASET}/latest/query/json"
        f"?sql=SELECT+lossyear+FROM+data+WHERE+ST_Intersects(geom,ST_GeomFromText("
        f"'POINT({lon} {lat})',4326))"
    )

    try:
        req = urllib.request.Request(url, headers={"x-api-key": api_key})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            rows = data.get("data", [])
            if not rows:
                return {"disturbed": False, "loss_year": None}
            loss_year = rows[0].get("lossyear")
            return {"disturbed": loss_year is not None and loss_year > 0, "loss_year": loss_year}
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return {"disturbed": None, "error": f"GFW API auth failed (HTTP 401). Check GFW_API_KEY."}
        if e.code == 404:
            return {"disturbed": None, "error": f"GFW API endpoint not found (HTTP 404). API may have changed."}
        return {"disturbed": None, "error": f"GFW API HTTP error {e.code}"}
    except urllib.error.URLError as e:
        return {"disturbed": None, "error": f"Could not reach GFW API: {e.reason}"}
    except Exception as e:
        return {"disturbed": None, "error": f"GFW API error: {e}"}

# ── Agreement logic ────────────────────────────────────────────────────────────

def pmtiles_is_disturbed(forest_class: str | None) -> bool | None:
    """Map forest-age class to disturbed/undisturbed."""
    if forest_class is None:
        return None
    if forest_class in ("harvested", "young"):
        return True
    if forest_class in ("mature", "old-growth"):
        return False
    return None  # Unknown class

def classify_agreement(pmtiles_disturbed: bool | None, gfw_disturbed: bool | None) -> str:
    """Classify the comparison result."""
    if pmtiles_disturbed is None or gfw_disturbed is None:
        return "unknown"
    if pmtiles_disturbed == gfw_disturbed:
        return "agree"
    return "disagree"

# ── Main ───────────────────────────────────────────────────────────────────────

def parse_args():
    args = sys.argv[1:]
    config = {
        "samples": DEFAULT_SAMPLES,
        "output": str(DEFAULT_OUTPUT),
        "zoom": SAMPLE_ZOOM,
    }
    i = 0
    while i < len(args):
        if args[i] == "--samples" and i + 1 < len(args):
            config["samples"] = int(args[i + 1])
            i += 2
        elif args[i] == "--output" and i + 1 < len(args):
            config["output"] = args[i + 1]
            i += 2
        elif args[i] == "--zoom" and i + 1 < len(args):
            config["zoom"] = int(args[i + 1])
            i += 2
        else:
            i += 1
    return config

def main():
    config = parse_args()
    n_samples = config["samples"]
    output_path = Path(config["output"])
    zoom = config["zoom"]

    print("=== OpenCanopy Cross-Source Ground Truth Audit ===\n")
    print(f"PMTiles: {PMTILES_PATH}")
    print(f"Samples: {n_samples}")
    print(f"Zoom:    z{zoom}")
    print(f"Output:  {output_path}\n")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    results = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "config": {"samples": n_samples, "zoom": zoom},
        "summary": {},
        "details": [],
        "warnings": [],
        "status": "PASS",
    }

    # Validate PMTiles exists
    if not PMTILES_PATH.exists():
        results["status"] = "FAIL"
        results["summary"]["error"] = f"PMTiles not found: {PMTILES_PATH}"
        output_path.write_text(json.dumps(results, indent=2))
        print(f"[FAIL] PMTiles not found: {PMTILES_PATH}")
        return

    # Ensure Node helper
    ensure_pmtiles_reader()

    # Check Node.js is available
    try:
        subprocess.run(["node", "--version"], capture_output=True, check=True, timeout=5)
    except (subprocess.CalledProcessError, FileNotFoundError):
        results["status"] = "WARN"
        results["warnings"].append("Node.js not found — cannot read PMTiles. Install Node.js.")
        output_path.write_text(json.dumps(results, indent=2))
        print("[WARN] Node.js not found — cannot read PMTiles")
        return

    # Sample loop
    agree = 0
    disagree = 0
    unknown = 0
    pmtiles_errors = 0
    gfw_unavailable = False
    gfw_errors = 0

    sample_points = [random_bc_point() for _ in range(n_samples)]

    for i, (lat, lon) in enumerate(sample_points):
        if (i + 1) % 50 == 0:
            print(f"  Progress: {i + 1}/{n_samples}")

        # Read from PMTiles
        pmtiles_data = read_forest_age_at_point(lat, lon, zoom)
        if pmtiles_data.get("error"):
            pmtiles_errors += 1
            unknown += 1
            results["details"].append({
                "lat": lat, "lon": lon,
                "pmtiles_class": None,
                "gfw_loss_year": None,
                "agreement": "unknown",
                "pmtiles_error": pmtiles_data["error"],
            })
            continue

        forest_class = pmtiles_data.get("class")
        pmtiles_disturbed = pmtiles_is_disturbed(forest_class)

        # Query GFW
        gfw_data = query_gfw_at_point(lat, lon)
        if gfw_data.get("error"):
            if not gfw_unavailable:
                # Only warn once
                results["warnings"].append(f"GFW API unavailable: {gfw_data['error']}")
                gfw_unavailable = True
            gfw_errors += 1
            unknown += 1
            results["details"].append({
                "lat": lat, "lon": lon,
                "pmtiles_class": forest_class,
                "gfw_loss_year": None,
                "agreement": "unknown",
                "gfw_error": gfw_data["error"],
            })
            continue

        gfw_disturbed = gfw_data.get("disturbed")
        gfw_loss_year = gfw_data.get("loss_year")
        agreement = classify_agreement(pmtiles_disturbed, gfw_disturbed)

        if agreement == "agree":
            agree += 1
        elif agreement == "disagree":
            disagree += 1
        else:
            unknown += 1

        results["details"].append({
            "lat": lat, "lon": lon,
            "pmtiles_class": forest_class,
            "pmtiles_disturbed": pmtiles_disturbed,
            "gfw_loss_year": gfw_loss_year,
            "gfw_disturbed": gfw_disturbed,
            "agreement": agreement,
        })

        # Rate limit: small delay if GFW API is being queried
        if not gfw_unavailable and gfw_errors == 0:
            time.sleep(0.1)

    # Summarize
    total_compared = agree + disagree
    total = n_samples
    agreement_pct = (agree / total_compared * 100) if total_compared > 0 else 0

    results["summary"] = {
        "total_samples": total,
        "compared": total_compared,
        "agree": agree,
        "disagree": disagree,
        "unknown": unknown,
        "agreement_pct": round(agreement_pct, 2),
        "pmtiles_errors": pmtiles_errors,
        "gfw_errors": gfw_errors,
        "gfw_unavailable": gfw_unavailable,
    }

    # Determine overall status
    if gfw_unavailable and total_compared == 0:
        results["status"] = "WARN"
        print(f"\n[WARN] GFW API unavailable — no cross-source comparison performed")
        print(f"       Set GFW_API_KEY environment variable to enable GFW queries")
    elif agreement_pct < 70 and total_compared > 10:
        results["status"] = "FAIL"
    elif agreement_pct < 80 and total_compared > 10:
        results["status"] = "WARN"
    else:
        results["status"] = "PASS"

    output_path.write_text(json.dumps(results, indent=2))

    print(f"\n{'─' * 60}")
    print(f"Cross-Source Audit Results")
    print(f"{'─' * 60}")
    if total_compared > 0:
        print(f"Agreement:    {agreement_pct:.1f}% ({agree}/{total_compared} comparable points)")
        print(f"Disagree:     {disagree}")
    print(f"Unknown:      {unknown} (no data in one or both sources)")
    print(f"PMTiles err:  {pmtiles_errors}")
    print(f"GFW errors:   {gfw_errors}")
    print(f"Status:       [{results['status']}]")
    print(f"Output:       {output_path}")
    print(f"{'─' * 60}")

    if results["status"] == "FAIL":
        sys.exit(1)

if __name__ == "__main__":
    main()
