#!/usr/bin/env bash
# build-tiles-chunked.sh — Memory-safe chunked tile build
#
# Builds each layer as a separate PMTiles file, then merges with tile-join.
# If a layer crashes, all previously completed layers are safe on disk.
# Re-running skips layers that already have a completed .pmtiles file.
#
# Usage:
#   bash scripts/pipeline/build-tiles-chunked.sh
#
# To force rebuild a specific layer, delete its .pmtiles:
#   rm data/tiles/chunks/forest-age.pmtiles
#   bash scripts/pipeline/build-tiles-chunked.sh

set -euo pipefail
cd "$(dirname "$0")/../.."

PREPROCESSED="data/geojson/preprocessed"
CHUNKS_DIR="data/tiles/chunks"
OUTPUT="data/tiles/opencanopy.pmtiles"
LOG="data/tiles/build-chunked-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$CHUNKS_DIR"

COMMON_FLAGS=(
  -Z 4 -z 12
  --no-feature-limit
  --drop-densest-as-needed
  -M 5000000
  --low-detail=11
  --minimum-detail=10
  --full-detail=12
  --simplification=3
  --simplification-at-maximum-zoom=1
  --no-simplification-of-shared-nodes
  --no-tiny-polygon-reduction
  --buffer=64
  --force
)

ATTR_FLAGS=(
  --attribute-type=FIRE_YEAR:string
  --attribute-type=class:string
  --attribute-type=age:int
  --attribute-type=species:string
  --attribute-type=DISTURBANCE_START_DATE:string
  --attribute-type=company_id:string
  --attribute-type=PLANNED_GROSS_BLOCK_AREA:float
)

LAYERS=(
  forest-age
  parks
  conservancies
  tenure-cutblocks
  fire-history
  ogma
  wildlife-habitat-areas
  ungulate-winter-range
  community-watersheds
  mining-claims
  forestry-roads
  conservation-priority
)

echo "=== OpenCanopy Chunked Tile Build ===" | tee "$LOG"
echo "Start: $(date)" | tee -a "$LOG"
echo "Layers: ${#LAYERS[@]}" | tee -a "$LOG"
echo "" | tee -a "$LOG"

COMPLETED=0
SKIPPED=0
FAILED=0

for LAYER in "${LAYERS[@]}"; do
  INPUT="$PREPROCESSED/$LAYER.ndjson"
  CHUNK_OUTPUT="$CHUNKS_DIR/$LAYER.pmtiles"

  if [ ! -f "$INPUT" ]; then
    echo "  [$LAYER] SKIP — input not found: $INPUT" | tee -a "$LOG"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [ -f "$CHUNK_OUTPUT" ] && [ "$CHUNK_OUTPUT" -nt "$INPUT" ] && [ "$(stat -c%s "$CHUNK_OUTPUT" 2>/dev/null)" -gt 1000 ]; then
    SIZE=$(du -h "$CHUNK_OUTPUT" | cut -f1)
    echo "  [$LAYER] SKIP — already built ($SIZE)" | tee -a "$LOG"
    COMPLETED=$((COMPLETED + 1))
    continue
  fi

  INPUT_SIZE=$(du -h "$INPUT" | cut -f1)
  echo "  [$LAYER] Building ($INPUT_SIZE input)..." | tee -a "$LOG"
  START_TIME=$SECONDS

  nice -n 19 ionice -c 3 tippecanoe \
    -o "$CHUNK_OUTPUT" \
    "${COMMON_FLAGS[@]}" \
    "${ATTR_FLAGS[@]}" \
    -L "$LAYER:$INPUT" \
    2>&1 | tee -a "$LOG"
  TIPP_EXIT=${PIPESTATUS[0]}

  if [ "$TIPP_EXIT" -eq 0 ]; then
    ELAPSED=$(( SECONDS - START_TIME ))
    SIZE=$(du -h "$CHUNK_OUTPUT" | cut -f1)
    echo "  [$LAYER] DONE — $SIZE in ${ELAPSED}s" | tee -a "$LOG"
    COMPLETED=$((COMPLETED + 1))
  else
    echo "  [$LAYER] FAILED (tippecanoe exit $TIPP_EXIT)" | tee -a "$LOG"
    rm -f "$CHUNK_OUTPUT"
    FAILED=$((FAILED + 1))
  fi
  echo "" | tee -a "$LOG"
done

echo "" | tee -a "$LOG"
echo "=== Layer Summary ===" | tee -a "$LOG"
echo "  Completed: $COMPLETED / ${#LAYERS[@]}" | tee -a "$LOG"
echo "  Skipped:   $SKIPPED" | tee -a "$LOG"
echo "  Failed:    $FAILED" | tee -a "$LOG"
echo "" | tee -a "$LOG"

if [ "$FAILED" -gt 0 ]; then
  echo "  Some layers failed. Fix and re-run — completed layers will be skipped." | tee -a "$LOG"
  echo "End: $(date)" | tee -a "$LOG"
  exit 1
fi

MISSING=()
for LAYER in "${LAYERS[@]}"; do
  [ -f "$CHUNKS_DIR/$LAYER.pmtiles" ] || MISSING+=("$LAYER")
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "  Missing chunks: ${MISSING[*]}" | tee -a "$LOG"
  echo "End: $(date)" | tee -a "$LOG"
  exit 1
fi

echo "=== Merging with tile-join ===" | tee -a "$LOG"
# -pk: no tile size limit — prevents silent tile omission when merged layers exceed 500K
nice -n 19 tile-join -o "$OUTPUT" --force -pk \
  "$CHUNKS_DIR"/*.pmtiles \
  2>&1 | tee -a "$LOG"

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo "" | tee -a "$LOG"
echo "=== Build Complete ===" | tee -a "$LOG"
echo "  Output: $OUTPUT ($SIZE)" | tee -a "$LOG"
echo "  End: $(date)" | tee -a "$LOG"

echo "" | tee -a "$LOG"
echo "=== Phase 5: Verify ===" | tee -a "$LOG"
npx tsx scripts/pipeline/verify.ts 2>&1 | tee -a "$LOG"
