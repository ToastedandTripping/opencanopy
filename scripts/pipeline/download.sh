#!/usr/bin/env bash
# download.sh — Phase 1 of the OpenCanopy rebuild pipeline
#
# Downloads VRI as bulk FGDB + converts via ogr2ogr.
# Downloads 11 other layers directly from BC WFS using ogr2ogr pagination.
#
# Output: data/downloads/{layer}-raw.ndjson for all 12 layers
#
# Usage:
#   bash scripts/pipeline/download.sh
#   bash scripts/pipeline/download.sh --skip-vri   # Skip VRI (for re-running WFS only)

set -euo pipefail
cd "$(dirname "$0")/../.."

mkdir -p data/downloads

# ── VRI (bulk FGDB download) ──────────────────────────────────────────────────

VRI_URL="https://pub.data.gov.bc.ca/datasets/02dba161-fdb7-48ae-a4bb-bd6ef017c36d/current/VEG_COMP_LYR_R1_POLY_2024.gdb.zip"
VRI_ZIP="data/downloads/VEG_COMP_LYR_R1_POLY_2024.gdb.zip"
VRI_GDB_DIR="data/downloads/VEG_COMP_LYR_R1_POLY_2024.gdb"
VRI_RAW="data/downloads/vri-raw.ndjson"
VRI_RAW_TMP="${VRI_RAW}.tmp"

SKIP_VRI=false
for arg in "$@"; do
  if [ "$arg" = "--skip-vri" ]; then
    SKIP_VRI=true
  fi
done

if [ "$SKIP_VRI" = false ]; then
  echo ""
  echo "=== VRI: Bulk FGDB Download ==="
  echo "  URL: $VRI_URL"
  echo "  Destination: $VRI_ZIP"
  echo "  Note: file is ~4GB, this will take 15-20 minutes on a fast connection"
  echo ""

  # BC Kong gateway blocks HEAD — use -L to follow redirects, -o to save
  curl -L -o "$VRI_ZIP" "$VRI_URL" --progress-bar

  echo "  Download complete. Unzipping..."
  unzip -o "$VRI_ZIP" -d data/downloads/

  echo "  Converting FGDB → GeoJSONSeq (NDJSON), reprojecting to WGS84..."
  echo "  Selecting: FEATURE_ID, PROJ_AGE_1, HARVEST_DATE, SPECIES_CD_1"
  echo "  This will take 30-60 minutes..."

  # Clean up VRI temp file if ogr2ogr fails or script is interrupted
  trap '[ -f "$VRI_RAW_TMP" ] && rm -f "$VRI_RAW_TMP"' EXIT

  # -f GeoJSONSeq: one feature per line (NDJSON)
  # -t_srs EPSG:4326: reproject from BC Albers (EPSG:3005) to WGS84
  # -select: drop ~196 unneeded columns to reduce output from ~15GB to ~4GB
  ogr2ogr -f GeoJSONSeq "$VRI_RAW_TMP" "$VRI_GDB_DIR" VEG_COMP_LYR_R1_POLY \
    -t_srs EPSG:4326 \
    -select "FEATURE_ID,PROJ_AGE_1,HARVEST_DATE,SPECIES_CD_1" \
    -progress

  # ogr2ogr succeeded — clear the trap before moving the file
  trap - EXIT
  mv "$VRI_RAW_TMP" "$VRI_RAW"

  VRI_COUNT=$(wc -l < "$VRI_RAW")
  echo ""
  echo "  VRI downloaded: $VRI_COUNT features"
  echo "  Expected: ~6,872,386 features"
  if [ "$VRI_COUNT" -lt 6500000 ]; then
    echo "  WARNING: VRI feature count is significantly below expected (~6.87M)!"
  fi
  echo ""
else
  echo ""
  echo "=== VRI: Skipped (--skip-vri) ==="
  echo ""
fi

# ── WFS layers (ogr2ogr with auto-pagination) ─────────────────────────────────

download_wfs() {
  local LAYER_NAME=$1
  local TYPE_NAME=$2
  local OUTPUT="data/downloads/${LAYER_NAME}-raw.ndjson"
  local OUTPUT_TMP="${OUTPUT}.tmp"
  local WFS_URL="WFS:https://openmaps.gov.bc.ca/geo/pub/ows?SORTBY=OBJECTID"

  echo "  Checking expected feature count for $LAYER_NAME..."

  # resultType=hits returns the total count without downloading features
  # Suppress curl errors for this pre-check; download proceeds regardless
  EXPECTED=$(curl -s \
    "https://openmaps.gov.bc.ca/geo/pub/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=${TYPE_NAME}&resultType=hits" \
    | grep -oP 'numberMatched="\K[0-9]+' || echo "unknown")
  echo "  $LAYER_NAME: expecting $EXPECTED features..."

  # OGR_WFS_PAGE_SIZE=10000 matches BC WFS server CountDefault=10000.
  # ogr2ogr WFS driver handles pagination automatically (requires GDAL >= 3.8.4).
  # SORTBY=OBJECTID in the URL enables pagination for layers without a registered
  # primary key (e.g. cutblocks, fire history, forestry roads).
  if OGR_WFS_PAGE_SIZE=10000 ogr2ogr -f GeoJSONSeq "$OUTPUT_TMP" \
    "$WFS_URL" "pub:${TYPE_NAME}" \
    -t_srs EPSG:4326 \
    -progress; then

    mv "$OUTPUT_TMP" "$OUTPUT"

    ACTUAL=$(wc -l < "$OUTPUT")
    echo "  $LAYER_NAME: expected=$EXPECTED, got=$ACTUAL"

    if [ "$EXPECTED" != "unknown" ] && [ "$ACTUAL" -lt "$((EXPECTED * 95 / 100))" ]; then
      echo "  WARNING: $LAYER_NAME downloaded <95% of expected features!"
      echo "  WARNING: expected=$EXPECTED actual=$ACTUAL"
    fi
  else
    echo "  ERROR: ogr2ogr failed for $LAYER_NAME (type: $TYPE_NAME)"
    echo "  Continuing to next layer..."
    # Remove partial tmp file if it exists
    [ -f "$OUTPUT_TMP" ] && rm -f "$OUTPUT_TMP"
  fi
}

echo ""
echo "=== WFS Layers ==="
echo ""

download_wfs "tenure-cutblocks"       "WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW"
download_wfs "fire-history"           "WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP"
download_wfs "parks"                  "WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW"
download_wfs "conservancies"          "WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW"
download_wfs "ogma"                   "WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW"
download_wfs "wildlife-habitat-areas" "WHSE_WILDLIFE_MANAGEMENT.WCP_WILDLIFE_HABITAT_AREA_POLY"
download_wfs "ungulate-winter-range"  "WHSE_WILDLIFE_MANAGEMENT.WCP_UNGULATE_WINTER_RANGE_SP"
download_wfs "community-watersheds"   "WHSE_WATER_MANAGEMENT.WLS_COMMUNITY_WS_PUB_SVW"
download_wfs "mining-claims"          "WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW"
download_wfs "forestry-roads"         "WHSE_FOREST_TENURE.FTEN_ROAD_SECTION_LINES_SVW"
download_wfs "conservation-priority"  "WHSE_FOREST_VEGETATION.OGSR_PRIORITY_DEF_AREA_CUR_SP"

echo ""
echo "=== Download Complete ==="
echo ""
echo "Downloaded files in data/downloads/:"
ls -lh data/downloads/*.ndjson 2>/dev/null || echo "  (no .ndjson files found)"
