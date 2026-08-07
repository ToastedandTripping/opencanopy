#!/usr/bin/env bash
# encode-dolly.sh — encode the offline-rendered dolly frames into shippable
# video + poster artifacts.
#
# Input:  .render-scratch/story-dolly/{desktop,mobile}/NNN.webp
#         (produced by `npm run render:dolly`, never committed)
# Output: .render-scratch/story-dolly/out/{tier}.webm
#         .render-scratch/story-dolly/out/{tier}.mp4
#         .render-scratch/story-dolly/out/{tier}-start.webp  (frame 0 poster)
#         .render-scratch/story-dolly/out/{tier}-end.webp    (last-frame poster)
#
# These are the artifacts Lee uploads to R2 (raster/story-dolly/v1/) — the
# URL layout src/lib/story/dolly-config.ts expects via dollyVideoUrl/dollyPosterUrl:
#   raster/story-dolly/v1/{tier}.webm
#   raster/story-dolly/v1/{tier}.mp4
#   raster/story-dolly/v1/{tier}-start.webp
#   raster/story-dolly/v1/{tier}-end.webp
#
# Usage:
#   bash scripts/encode-dolly.sh
#   bash scripts/encode-dolly.sh desktop      # single tier
#
# Requires: ffmpeg with libvpx-vp9 + libx264, cwebp (or ffmpeg's webp encoder).
#
# QA-TUNABLE: sharp-edged synthetic map imagery (crisp cutblock boundaries,
# hard red/green fields) is codec-hostile for VP9 at high compression — verify
# 1-px cutblock detail under zoom after encoding. If it smears, lower -crf
# (more bits, larger file) rather than accepting blur on the story's climactic
# beat. The values below are a starting point, not a locked constant.
set -euo pipefail
cd "$(dirname "$0")/.."

FPS=24
VP9_CRF=32      # QA-tunable — see note above. Lower = higher quality/larger file.
H264_CRF=20     # QA-tunable.

SCRATCH_ROOT=".render-scratch/story-dolly"
OUT_DIR="${SCRATCH_ROOT}/out"

if [ "$#" -gt 0 ]; then
  TIERS=("$@")
else
  TIERS=(desktop mobile)
fi

mkdir -p "$OUT_DIR"

for tier in "${TIERS[@]}"; do
  FRAME_DIR="${SCRATCH_ROOT}/${tier}"
  if [ ! -d "$FRAME_DIR" ]; then
    echo "ERROR: ${FRAME_DIR} not found — run \`npm run render:dolly\` first." >&2
    exit 1
  fi

  FRAME_COUNT=$(find "$FRAME_DIR" -maxdepth 1 -name '*.webp' | wc -l | tr -d ' ')
  if [ "$FRAME_COUNT" -eq 0 ]; then
    echo "ERROR: ${FRAME_DIR} has no .webp frames." >&2
    exit 1
  fi
  echo "=== ${tier}: encoding ${FRAME_COUNT} frames @ ${FPS}fps ==="

  # VP9 WebM. -b:v 0 with -crf makes it a constant-quality (not constant-bitrate)
  # encode -- the correct pairing for -crf mode with libvpx-vp9.
  ffmpeg -y -framerate "$FPS" -i "${FRAME_DIR}/%03d.webp" \
    -c:v libvpx-vp9 -crf "$VP9_CRF" -b:v 0 -pix_fmt yuv420p \
    -row-mt 1 \
    "${OUT_DIR}/${tier}.webm"

  # H.264 MP4. +faststart moves the moov atom to the front so playback can
  # begin before the whole file downloads (important for the play-on-scroll UX).
  ffmpeg -y -framerate "$FPS" -i "${FRAME_DIR}/%03d.webp" \
    -c:v libx264 -crf "$H264_CRF" -pix_fmt yuv420p -movflags +faststart \
    "${OUT_DIR}/${tier}.mp4"

  # First/last-frame posters. Frame 0 = province-scale start; last frame =
  # old-growth pocket end (the degradation-ladder still).
  FIRST_FRAME=$(find "$FRAME_DIR" -maxdepth 1 -name '*.webp' | sort | head -n1)
  LAST_FRAME=$(find "$FRAME_DIR" -maxdepth 1 -name '*.webp' | sort | tail -n1)
  cp "$FIRST_FRAME" "${OUT_DIR}/${tier}-start.webp"
  cp "$LAST_FRAME" "${OUT_DIR}/${tier}-end.webp"

  echo "=== ${tier}: done -> ${OUT_DIR}/${tier}.{webm,mp4}, ${tier}-{start,end}.webp ==="
done

echo ""
echo "Next steps (Lee's terminal):"
echo "  1. QA the encodes — zoom on 1-px cutblock detail, check for VP9 smear."
echo "  2. rclone/upload ${OUT_DIR}/* to R2 raster/story-dolly/v1/"
echo "  3. Update DOLLY_FRAME_SIGNATURE in src/lib/story/dolly-config.ts"
echo "     (value printed by \`npm run render:dolly\`'s signature step)."
echo "  4. Deploy — NOT before step 2. Until the assets are on R2, remains"
echo "     falls back to a static z5 map (degradation ladder, no crash, but a"
echo "     visible regression vs. today's live zoom)."
