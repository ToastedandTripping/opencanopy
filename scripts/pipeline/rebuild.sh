#!/usr/bin/env bash
# rebuild.sh — OpenCanopy full pipeline orchestrator
#
# Runs all 5 pipeline phases in sequence:
#   Phase 1: Download (VRI FGDB + 11 WFS layers)
#   Phase 2: Transform (classify VRI + extract WFS layer properties)
#   Phase 3: Preprocess (validate + water subtract for forest-age)
#   Phase 4: Build Tiles (single-pass tippecanoe)
#   Phase 5: Verify (PMTiles header + bounds + size checks)
#
# Each phase is independently resumable. If a phase fails, re-run it
# directly to resume:
#   bash scripts/pipeline/download.sh
#   npx tsx scripts/pipeline/transform.ts
#   etc.
#
# Usage:
#   bash scripts/pipeline/rebuild.sh
#   npm run rebuild

set -euo pipefail
cd "$(dirname "$0")/../.."

echo "=== OpenCanopy Pipeline: Full Rebuild ==="
echo ""
echo "Start time: $(date)"
echo ""

echo "=== Phase 1: Download ==="
bash scripts/pipeline/download.sh

echo ""
echo "=== Phase 2: Transform ==="
npx tsx scripts/pipeline/transform.ts

echo ""
echo "=== Phase 3: Preprocess ==="
NODE_OPTIONS='--max-old-space-size=8192' npx tsx scripts/pipeline/preprocess.ts

echo ""
echo "=== Phase 4: Build Tiles ==="
npx tsx scripts/pipeline/build-tiles.ts

echo ""
echo "=== Phase 5: Verify ==="
npx tsx scripts/pipeline/verify.ts

echo ""
echo "=== Pipeline Complete ==="
echo "End time: $(date)"
echo ""
echo "Next steps:"
echo "  1. Update src/lib/layers/registry.ts PMTILES_URL to new version"
echo "  2. Run: ./deploy-tiles.sh"
echo "  3. Run: ./deploy.sh"
