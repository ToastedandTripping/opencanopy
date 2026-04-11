#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Upload the local PMTiles file to R2 with the filename expected by registry.ts.
# Verifies the upload with HEAD + Range requests before reporting success.

# 1. Read the expected PMTiles filename from registry.ts (anchored to declaration)
PMTILES_FILE=$(grep '^export const PMTILES_URL' src/lib/layers/registry.ts | grep -oP 'opencanopy-v\d+\.pmtiles')
if [[ -z "$PMTILES_FILE" ]]; then
  echo "ERROR: Could not parse PMTiles filename from registry.ts"
  exit 1
fi

LOCAL_FILE="data/tiles/opencanopy.pmtiles"
R2_BUCKET="opencanopy-tiles"
PUBLIC_URL="https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/${PMTILES_FILE}"

# 2. Verify local file exists
if [[ ! -f "$LOCAL_FILE" ]]; then
  echo "ERROR: Local PMTiles not found at $LOCAL_FILE"
  echo "Run 'npm run build-tiles' first."
  exit 1
fi

LOCAL_SIZE=$(stat -c%s "$LOCAL_FILE")

# 3. Idempotency: check if file already exists on R2 with matching size
REMOTE_SIZE=$(curl -sI "$PUBLIC_URL" | grep -i content-length | awk '{print $2}' | tr -d '\r' || echo "")
if [[ "$REMOTE_SIZE" == "$LOCAL_SIZE" ]]; then
  echo "==> $PMTILES_FILE already on R2 with matching size ($((LOCAL_SIZE / 1048576))MB). Skipping upload."
  exit 0
fi

echo "==> Uploading $LOCAL_FILE as $PMTILES_FILE ($((LOCAL_SIZE / 1048576))MB)..."

# 4. Upload to R2 via rclone (supports multipart for files >300MB)
#    rclone remote "r2" must be configured with R2 S3-compatible credentials
rclone copyto "$LOCAL_FILE" "r2:${R2_BUCKET}/${PMTILES_FILE}" --progress

# 5. Wait for CDN propagation
echo "==> Waiting 10s for CDN propagation..."
sleep 10

# 6. Verify upload — HEAD request, check 200
echo "==> Verifying upload..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --head "$PUBLIC_URL")
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "ERROR: Upload verification failed. $PUBLIC_URL returned HTTP $HTTP_STATUS"
  exit 1
fi

# 7. Verify range requests work (PMTiles requires HTTP Range)
RANGE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-511" "$PUBLIC_URL")
if [[ "$RANGE_STATUS" != "206" ]]; then
  echo "WARN: Range request returned $RANGE_STATUS (expected 206). PMTiles may not work."
fi

echo "==> Verified: $PUBLIC_URL is live (HTTP $HTTP_STATUS, Range $RANGE_STATUS)"
