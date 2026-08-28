#!/usr/bin/env bash
# Batch runner for grok-recap Tests A/B — requires BEARER env (user JWT or edge anon).
# Usage: BEARER="$token" bash docs/research/run_grok_recap_batch.sh A0 A1 A3 B1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SUPA_URL=$(grep '^SUPABASE_URL=' "$ROOT/.env" | cut -d= -f2- | tr -d '"')
FN="$SUPA_URL/functions/v1/grok-video-research-proxy"
OUT="$(dirname "$0")/results"
mkdir -p "$OUT"

CLIP_ASSET="76fe7438-671d-4428-a7f6-17a45e98c16f"
SRC_FRAME="832fa0bc-1f7e-4586-ab8b-2ac323698ede/764a63d2-93cd-44f3-905f-292f14ab2f51/benchmark/anchor_frame_00134.jpg"
SL_JACKET="0feb028f-dc4d-45dc-82ac-e4bbd16054b0"

EDIT_PROMPT_LONG='Replace only the shirt he is wearing with a navy Saint Laurent track jacket with white side stripes down the sleeves, ribbed collar and cuffs, full front zip. Change NOTHING else: keep his exact face, beard, glasses, skin tone, hair, body proportions, hands and arms, the exact same pose and movement, the exact same camera framing and motion, the exact same background, and the exact same lighting and shadows. Do not regenerate the person. Do not restyle the scene.'

if [[ -z "${BEARER:-}" ]]; then
  echo "BEARER env required (user JWT from authenticated AVT session)" >&2
  exit 1
fi

call() {
  local label="$1"
  local json="$2"
  echo "=== $label ==="
  curl -sS -X POST "$FN" \
    -H "Authorization: Bearer $BEARER" \
    -H "Content-Type: application/json" \
    -d "$json" | tee "$OUT/${label}.json" | python3 "$(dirname "$0")/_summarize_grok_response.py"
  echo
}

for step in "$@"; do
  case "$step" in
    A0) call A0_dryrun "{\"dryRun\":true,\"mode\":\"edit_video\",\"label\":\"A0_dryrun\",\"videoAssetId\":\"$CLIP_ASSET\",\"prompt\":\"$EDIT_PROMPT_LONG\"}" ;;
    A1) call A1_edit_long "{\"mode\":\"edit_video\",\"label\":\"A1_edit_long\",\"videoAssetId\":\"$CLIP_ASSET\",\"model\":\"grok-imagine-video\",\"prompt\":\"$EDIT_PROMPT_LONG\",\"maxCostUsd\":0.5}" ;;
    A1_probe) call A1_edit_long_probe "{\"mode\":\"probe\",\"label\":\"A1_edit_long_probe\",\"probePath\":\"videos/edits\",\"videoAssetId\":\"$CLIP_ASSET\",\"probeBody\":{\"model\":\"grok-imagine-video\",\"prompt\":\"$EDIT_PROMPT_LONG\",\"video\":{\"url\":\"{{VIDEO_URL}}\"}}}" ;;
    A3) call A3_edit_with_refs "{\"mode\":\"probe\",\"label\":\"A3_edit_with_refs\",\"probePath\":\"videos/edits\",\"videoAssetId\":\"$CLIP_ASSET\",\"wardrobeFeatureId\":\"$SL_JACKET\",\"probeBody\":{\"model\":\"grok-imagine-video\",\"prompt\":\"$EDIT_PROMPT_LONG\",\"video\":{\"url\":\"{{VIDEO_URL}}\"},\"reference_images\":\"{{REFERENCE_URLS}}\"}}" ;;
    B1) call B1_ref2video_source "{\"mode\":\"reference_to_video\",\"label\":\"B1_ref2video_source\",\"model\":\"grok-imagine-video-1.5\",\"duration\":5,\"aspectRatio\":\"9:16\",\"resolution\":\"720p\",\"references\":[{\"path\":\"$SRC_FRAME\",\"bucket\":\"project-references\"}],\"wardrobeFeatureId\":\"$SL_JACKET\",\"prompt\":\"<IMAGE_1> is the real man: keep his exact face, beard, glasses and body. <IMAGE_2> and <IMAGE_3> are the exact garment. He wears that exact navy Saint Laurent track jacket with its white side stripes, standing in the same room, same lighting, torso rotating slightly, arms crossing over his chest. Photoreal, locked-off camera.\",\"maxCostUsd\":0.5}" ;;
    *) echo "unknown step: $step" >&2; exit 2 ;;
  esac
done
