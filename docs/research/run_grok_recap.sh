#!/usr/bin/env bash
# grok-recap-2026-08 — Phase 2 runbook. Sequential, one call at a time.
# Ceiling: $6.00. Every billed call prints its own estimatedCostUsd; keep a tally.
set -uo pipefail

ROOT="/Users/gocrazyglobal/ai-video-tool"
SUPA_URL=$(grep '^SUPABASE_URL=' "$ROOT/.env" | cut -d= -f2- | tr -d '"')
ANON=$(grep '^SUPABASE_PUBLISHABLE_KEY=' "$ROOT/.env" | cut -d= -f2- | tr -d '"')
FN="$SUPA_URL/functions/v1/grok-video-research-proxy"
OUT="$(dirname "$0")/results"
mkdir -p "$OUT"

# ---- frozen benchmark inputs (Benchmark v2.0 / frozen 2026-08-01) ------------
CLIP_ASSET="76fe7438-671d-4428-a7f6-17a45e98c16f"   # 1080x1920 H.264 4.02s benchmark clip
SRC_FRAME="832fa0bc-1f7e-4586-ab8b-2ac323698ede/764a63d2-93cd-44f3-905f-292f14ab2f51/benchmark/anchor_frame_00134.jpg"
GROK_ANCHOR="832fa0bc-1f7e-4586-ab8b-2ac323698ede/8d4a4d22-41c0-43ab-ba99-92750f81e335/1347d0fc-71cc-4b18-92b8-91b100c26b28.jpg"
SL_JACKET="0feb028f-dc4d-45dc-82ac-e4bbd16054b0"    # character_features: Saint Laurent track jacket

call () { # call <label> <json>
  echo "=== $1 ==="
  curl -s -X POST "$FN" \
    -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
    -d "$2" | tee "$OUT/$1.json" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for k in ("error","detail","billed","billedNote","finalStatus","estimatedCostUsd"):
    if k in d: print(f"  {k}: {d[k]}")
s=d.get("submit") or {}
if s: print(f"  httpStatus: {s.get(\"httpStatus\")}  accepted: {s.get(\"accepted\")}  requestId: {s.get(\"requestId\")}")
o=d.get("output") or {}
if o.get("storedPath"): print(f"  stored: {o[\"storedPath\"]}")
' 2>/dev/null || true
  echo
}

EDIT_PROMPT_LONG='Replace only the shirt he is wearing with a navy Saint Laurent track jacket with white side stripes down the sleeves, ribbed collar and cuffs, full front zip. Change NOTHING else: keep his exact face, beard, glasses, skin tone, hair, body proportions, hands and arms, the exact same pose and movement, the exact same camera framing and motion, the exact same background, and the exact same lighting and shadows. Do not regenerate the person. Do not restyle the scene.'
EDIT_PROMPT_TERSE='Change his shirt to a navy track jacket with white side stripes. Keep everything else identical.'

case "${1:-help}" in

# ---------- Step 0: $0 schema probes ----------------------------------------
P1) call P1_auth_and_schema '{"mode":"probe","probePath":"videos/edits","probeBody":{"model":"grok-imagine-video"}}' ;;

P2) call P2_edits_with_reference_images "{\"mode\":\"probe\",\"probePath\":\"videos/edits\",\"videoAssetId\":\"$CLIP_ASSET\",\"wardrobeFeatureId\":\"$SL_JACKET\",\"probeBody\":{\"model\":\"grok-imagine-video\",\"prompt\":\"$EDIT_PROMPT_TERSE\",\"video_url\":\"{{VIDEO_URL}}\",\"reference_images\":\"{{REFERENCE_URLS}}\"}}" ;;

P3) call P3_edits_model_1_5 '{"mode":"probe","probePath":"videos/edits","probeBody":{"model":"grok-imagine-video-1.5"}}' ;;

# ---------- Test A: existing-video edit (highest priority) -------------------
A0) call A0_dryrun "{\"dryRun\":true,\"mode\":\"edit_video\",\"videoAssetId\":\"$CLIP_ASSET\",\"prompt\":\"$EDIT_PROMPT_LONG\"}" ;;

A1) call A1_edit_long "{\"mode\":\"edit_video\",\"label\":\"A1_edit_long\",\"videoAssetId\":\"$CLIP_ASSET\",\"model\":\"grok-imagine-video\",\"prompt\":\"$EDIT_PROMPT_LONG\",\"maxCostUsd\":0.5}" ;;

A2) call A2_edit_terse "{\"mode\":\"edit_video\",\"label\":\"A2_edit_terse\",\"videoAssetId\":\"$CLIP_ASSET\",\"model\":\"grok-imagine-video\",\"prompt\":\"$EDIT_PROMPT_TERSE\",\"maxCostUsd\":0.5}" ;;

# A3 runs ONLY if P2 was accepted (i.e. edits does take reference_images).
A3) call A3_edit_with_refs "{\"mode\":\"probe\",\"label\":\"A3_edit_with_refs\",\"probePath\":\"videos/edits\",\"videoAssetId\":\"$CLIP_ASSET\",\"wardrobeFeatureId\":\"$SL_JACKET\",\"probeBody\":{\"model\":\"grok-imagine-video\",\"prompt\":\"$EDIT_PROMPT_LONG\",\"video_url\":\"{{VIDEO_URL}}\",\"reference_images\":\"{{REFERENCE_URLS}}\"}}" ;;

# ---------- Test B: reference-to-video --------------------------------------
B1) call B1_ref2video_source "{\"mode\":\"reference_to_video\",\"label\":\"B1_ref2video_source\",\"model\":\"grok-imagine-video-1.5\",\"duration\":5,\"aspectRatio\":\"9:16\",\"resolution\":\"720p\",\"references\":[{\"path\":\"$SRC_FRAME\",\"bucket\":\"project-references\"}],\"wardrobeFeatureId\":\"$SL_JACKET\",\"prompt\":\"<IMAGE_1> is the real man: keep his exact face, beard, glasses and body. <IMAGE_2> and <IMAGE_3> are the exact garment. He wears that exact navy Saint Laurent track jacket with its white side stripes, standing in the same room, same lighting, torso rotating slightly, arms crossing over his chest. Photoreal, locked-off camera.\",\"maxCostUsd\":0.5}" ;;

B2) call B2_ref2video_grokanchor "{\"mode\":\"reference_to_video\",\"label\":\"B2_ref2video_grokanchor\",\"model\":\"grok-imagine-video-1.5\",\"duration\":5,\"aspectRatio\":\"9:16\",\"resolution\":\"720p\",\"references\":[{\"path\":\"$GROK_ANCHOR\",\"bucket\":\"look-composites\"}],\"wardrobeFeatureId\":\"$SL_JACKET\",\"prompt\":\"<IMAGE_1> is the exact person and the exact outfit. <IMAGE_2> and <IMAGE_3> are the garment detail reference. Same man, same navy track jacket with white side stripes, same room and lighting, torso rotating, arms crossing over the chest. Photoreal, locked-off camera.\",\"maxCostUsd\":0.5}" ;;

# ---------- Test C: approved-keyframe propagation ---------------------------
C1) call C1_i2v_grok_anchor "{\"mode\":\"image_to_video\",\"label\":\"C1_i2v_grok_anchor\",\"model\":\"grok-imagine-video-1.5\",\"duration\":5,\"aspectRatio\":\"9:16\",\"resolution\":\"720p\",\"image\":{\"path\":\"$GROK_ANCHOR\",\"bucket\":\"look-composites\"},\"prompt\":\"He rotates his torso and crosses his arms over his chest, then uncrosses. The navy track jacket with white side stripes stays exactly as it is. Locked-off camera, same lighting, photoreal, no restyling.\",\"maxCostUsd\":0.5}" ;;

# C2 substitute — second motion case from the same frozen anchor (see report).
C2) call C2_i2v_grok_anchor_deform "{\"mode\":\"image_to_video\",\"label\":\"C2_i2v_grok_anchor_deform\",\"model\":\"grok-imagine-video-1.5\",\"duration\":5,\"aspectRatio\":\"9:16\",\"resolution\":\"720p\",\"image\":{\"path\":\"$GROK_ANCHOR\",\"bucket\":\"look-composites\"},\"prompt\":\"He bends forward at the waist with his head down, the jacket fabric creasing and stretching across his back and shoulders, then straightens up. The navy track jacket and its white side stripes stay exactly as they are. Locked-off camera, same lighting, photoreal.\",\"maxCostUsd\":0.5}" ;;

*) echo "usage: $0 {P1|P2|P3|A0|A1|A2|A3|B1|B2|C1|C2}" ;;
esac
