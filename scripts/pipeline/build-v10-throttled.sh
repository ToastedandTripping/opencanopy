#!/usr/bin/env bash
# build-v10-throttled.sh — Memory-safe v10 tile build
#
# Runs Phase 4 (Build Tiles) + Phase 5 (Verify) under a systemd memory ceiling.
# Designed to prevent OOM crashes on 32GB systems.
#
# Resource controls:
#   - MemoryMax=20G: hard ceiling — OOM killer targets this process, not the system
#   - nice -n 19: lowest CPU priority (baked into build-tiles.ts)
#   - ionice -c 3: idle I/O class (baked into build-tiles.ts)
#   - No -P flag: sequential input reading (baked into build-tiles.ts)
#
# Usage:
#   bash scripts/pipeline/build-v10-throttled.sh
#
# Expected runtime: 4-5 hours (throttled)
# Expected output: data/tiles/opencanopy.pmtiles (~1.5-2.0GB)

set -euo pipefail
cd "$(dirname "$0")/../.."

LOG_FILE="data/tiles/build-v10-$(date +%Y%m%d-%H%M%S).log"
mkdir -p data/tiles

echo "=== OpenCanopy v10 Throttled Build ===" | tee "$LOG_FILE"
echo "Start: $(date)" | tee -a "$LOG_FILE"
echo "Memory ceiling: 20GB" | tee -a "$LOG_FILE"
echo "Log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Phase 4: Build Tiles
# Memory ceiling applied at service level (systemd) or via systemd-run if running standalone
echo "=== Phase 4: Build Tiles (throttled) ===" | tee -a "$LOG_FILE"
if [ -n "$INVOCATION_ID" ]; then
  # Running inside a systemd service — resource limits already applied
  npx tsx scripts/pipeline/build-tiles.ts 2>&1 | tee -a "$LOG_FILE"
else
  # Running standalone — wrap with memory ceiling
  systemd-run --user --scope -p MemoryMax=20G -p MemorySwapMax=4G \
    npx tsx scripts/pipeline/build-tiles.ts 2>&1 | tee -a "$LOG_FILE"
fi

BUILD_EXIT=${PIPESTATUS[0]}
if [ "$BUILD_EXIT" -ne 0 ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "=== BUILD FAILED (exit $BUILD_EXIT) ===" | tee -a "$LOG_FILE"
  echo "End: $(date)" | tee -a "$LOG_FILE"
  exit "$BUILD_EXIT"
fi

echo "" | tee -a "$LOG_FILE"

# Phase 5: Verify
echo "=== Phase 5: Verify ===" | tee -a "$LOG_FILE"
npx tsx scripts/pipeline/verify.ts 2>&1 | tee -a "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo "=== v10 Build Complete ===" | tee -a "$LOG_FILE"
echo "End: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Next steps:" | tee -a "$LOG_FILE"
echo "  1. Update registry.ts: PMTILES_URL → opencanopy-v10.pmtiles" | tee -a "$LOG_FILE"
echo "  2. Run: ./deploy-tiles.sh" | tee -a "$LOG_FILE"
