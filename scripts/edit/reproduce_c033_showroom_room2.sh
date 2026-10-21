#!/usr/bin/env bash
# Rebuild c033 BODY-ONLY in Gemini room 2 (Fendi's pick, 20 Oct) in Blender, from files already in AVT storage.
# No provider is called and nothing is regenerated: $0. The room is one still; it moves without generative video:
# Blender renders the snow, the branches sway inside the glass, and the Ferrari's lamps carry the rolling LED band.
#
# Fetch these private files first (owner sign-in; e.g. the AVT MCP `avt_signed_url`; never paste a signed URL anywhere):
#   project-exports    .../canonical/body_only_swap_c033_2026-10-18/c033_BODY_ONLY_final_1080x1920_5994.mp4          -> $IN/fg.mp4    (asset 5482b35b, approved)
#   project-exports    .../canonical/body_only_swap_c033_2026-10-18/environment_showroom/c033_BODY_ONLY_matte_alpha.mp4 -> $IN/alpha.mp4 (asset b162d95d)
#   project-references .../worlds/plate_showroom_real_524fbb29-a1b1-4e72-9896-59dc71b1c5b9_1.jpg -> $IN/still_room2.jpg (asset 49041b07, Gemini room 2)
#   (optional, for the review clips) the album master song_master_24bit.wav (asset 067a4cbf)  -> $IN/song.wav
# The car mask is in the repo (scripts/edit/blender/masks/room2_car_matte.png).
#
# usage: IN=dir OUT=dir BLENDER=/path/to/blender PY=python [MOVE=static|dolly|tight] scripts/edit/reproduce_c033_showroom_room2.sh
# Needs: Blender 4.5 LTS (tested 4.5.9, CPU Cycles), ffmpeg, Python with numpy, scipy, opencv-python (and mediapipe +
# face_landmarker.task in $MODELS for the verification). Scene: scripts/edit/blender/showroom_c033_room2.json.
set -euo pipefail
: "${IN:?set IN}" "${OUT:?set OUT}" "${BLENDER:?set BLENDER to the blender binary}"
PY=${PY:-python3}; MOVE=${MOVE:-static}
here=$(cd "$(dirname "$0")" && pwd); bl="$here/blender"; J="$bl/showroom_c033_room2.json"

check() { got=$(sha256sum "$1" | cut -d' ' -f1); [ "$got" = "$2" ] || { echo "MISMATCH $1: $got (expected $2)"; exit 1; }; echo "ok $1"; }
check "$IN/fg.mp4"         636cb1f9786505446e61e1ee7a4269178f3c3d368768fdfe58f11dcf4e789d2b
check "$IN/alpha.mp4"      77d7cdb7ba07fc2c6689a8c63fc105c260ec2766597b768031ac7afeb224e375
check "$IN/still_room2.jpg" 902dee61f87da5c77629b212e6d5ef0518ebeb9fff27938c6bee69c7527e6182
check "$bl/masks/room2_car_matte.png" 73867d276643466859ad78f7bca37ac58ea0ef67f5adad58768fc4cf6fb4b307

# the room: layers from the still, Blender's snow, then the plate frames (all deterministic: seeds in the scene file)
mkdir -p "$OUT/layers"
"$PY" -I "$bl/room_layers_still.py" "$J" "$IN/still_room2.jpg" "$bl/masks/room2_car_matte.png" "$OUT/layers"
"$BLENDER" -b --factory-startup -P "$bl/snow.py" -- "$J" "$OUT/snow" 2>&1 | grep -E "^DONE|rror" || true
"$PY" -I "$bl/room_motion.py" "$J" "$OUT/layers" "$OUT/snow" "$OUT/plate_seq" --mp4 "$OUT/plate.mp4"
roll=$("$PY" -I -c "import json,sys; print(json.load(open(sys.argv[1]))['source']['roll_deg'])" "$J")
key=texture_scale; [ "$MOVE" = tight ] && key=texture_scale_tight     # Blender minifies it by no more than ~10 %
scale=$("$PY" -I -c "import json,sys; print(json.load(open(sys.argv[1]))['performer_prep'][sys.argv[2]])" "$J" "$key")
"$PY" -I "$bl/prep_performer.py" "$IN/fg.mp4" "$IN/alpha.mp4" "$OUT/perf_seq" --roll "$roll" --scale "$scale"
ref=$("$PY" -I -c "import json,sys; print(json.load(open(sys.argv[1]))['light']['flash_reference'])" "$J")
"$PY" -I "$bl/measure_plate_light.py" "$OUT/plate.mp4" "$IN/fg.mp4" "$OUT/plate_light.npy" "$ref"
for p in depth env refl fg save; do
  "$BLENDER" -b --factory-startup -P "$bl/build_scene.py" -- "$J" "$OUT/plate_seq" "$OUT/perf_seq" "$OUT/passes" \
    --pass "$p" --move "$MOVE" 2>&1 | grep -E "^SCENE|^rendered|^saved|rror" || true
done
"$PY" -I "$bl/comp_scene.py" "$J" "$OUT/passes" "$MOVE" "$OUT/plate_light.npy" "$OUT/c033_showroom_room2_$MOVE.mp4"
md5=$(ffmpeg -loglevel error -i "$OUT/c033_showroom_room2_$MOVE.mp4" -map 0:v -f md5 - | cut -d= -f2)
echo "decoded MD5 $md5  (filed: see docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md, 'Room 2')"
if [ -n "${MODELS:-}" ]; then
  "$PY" -I "$bl/verify_scene.py" "$IN/fg.mp4" "$OUT/c033_showroom_room2_$MOVE.mp4" "$OUT/passes/scene_$MOVE.json" \
    "$J" "$MODELS/face_landmarker.task" "$OUT/verify_$MOVE.json" --every 2
fi
if [ -f "$IN/song.wav" ]; then
  ffmpeg -loglevel error -y -i "$OUT/c033_showroom_room2_$MOVE.mp4" -ss 56.9098 -t 4.0 -i "$IN/song.wav" -map 0:v -map 1:a -t 4 \
    -c:v copy -c:a aac -b:a 160k -movflags +faststart "$OUT/c033_showroom_room2_${MOVE}_with_song.mp4"
fi
