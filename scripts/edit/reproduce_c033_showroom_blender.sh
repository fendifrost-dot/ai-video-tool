#!/usr/bin/env bash
# Rebuild the c033 BODY-ONLY showroom shot in Blender (placed behind the island) from files already in AVT storage.
# No provider is called and nothing is regenerated: $0. The room (v5) moves without generative video: its still is
# split into layers, Blender renders the snow, and fixed curves move the branches, the penguin and the LED light.
#
# Fetch these private files first (owner sign-in; e.g. the AVT MCP `avt_signed_url`; never paste a signed URL anywhere):
#   project-exports    .../canonical/body_only_swap_c033_2026-10-18/c033_BODY_ONLY_final_1080x1920_5994.mp4          -> $IN/fg.mp4    (asset 5482b35b, approved)
#   project-exports    .../canonical/body_only_swap_c033_2026-10-18/environment_showroom/c033_BODY_ONLY_matte_alpha.mp4 -> $IN/alpha.mp4 (asset b162d95d)
#   project-references .../worlds/plate_showroom_kitchen_mvc07rr4_1.png  -> $IN/still_original.png (asset d4da62ba, the measured still)
#   project-references .../worlds/plate_showroom_ferrari_blue_paste_1.png -> $IN/still_ferrari.png  (asset 20fcf483, the blue Ferrari)
#   project-references .../worlds/plate_showroom_clean_mvet3g9q_1.png     -> $IN/still_clean.png    (asset b30bd9e2, vehicle and penguin removed)
#   (optional, for the review clips) the album master song_master_24bit.wav (asset 067a4cbf)  -> $IN/song.wav
# The car and penguin masks are in the repo (scripts/edit/blender/masks/). The v3 versions (Kling plate 256ca1bb,
# rejected) are rebuilt by this script as it was at commit 75c1279.
# The scene file now carries the 20 Oct decision to remove the penguin, so this script builds the v9 room (no penguin):
# compare with c033_BODY_ONLY_blender_showroom_v9_static.mp4 (asset 436ffebe, decoded MD5 22401387639530934a3e5ac3d6c658e5),
# not the v5 file. Blender 5.3.0 is not bit-identical to 4.5.9 (Cycles sampling and the snow particles land differently):
# 13 Nov 2026, 5.3.0 vs the 4.5 v9 static: 240 frames, median 45.3 dB (min 44.7), head box 39.6 dB, 0.33 % of pixels
# differ by more than 8 levels, decoded MD5 5e4f50db6f8915d8a219ffa0e83100a2. Visually identical; his pixels unchanged
# apart from render grain. A 5.3 render is a new version of the shot, not a reproduction of the approved 4.5 file.
#
# usage: IN=dir OUT=dir BLENDER=/path/to/blender PY=python [MOVE=static|dolly|tight] scripts/edit/reproduce_c033_showroom_blender.sh
# Needs: Blender 4.5 LTS (tested 4.5.9) or 5.3 (tested 5.3.0, 13 Nov 2026), CPU Cycles, ffmpeg, Python with numpy, scipy, opencv-python (and mediapipe +
# face_landmarker.task in $MODELS for the verification). Scene: scripts/edit/blender/showroom_c033.json.
set -euo pipefail
: "${IN:?set IN}" "${OUT:?set OUT}" "${BLENDER:?set BLENDER to the blender binary}"
PY=${PY:-python3}; MOVE=${MOVE:-static}
here=$(cd "$(dirname "$0")" && pwd); bl="$here/blender"

check() { got=$(sha256sum "$1" | cut -d' ' -f1); [ "$got" = "$2" ] || { echo "MISMATCH $1: $got (expected $2)"; exit 1; }; echo "ok $1"; }
check "$IN/fg.mp4"    636cb1f9786505446e61e1ee7a4269178f3c3d368768fdfe58f11dcf4e789d2b
check "$IN/alpha.mp4" 77d7cdb7ba07fc2c6689a8c63fc105c260ec2766597b768031ac7afeb224e375
check "$IN/still_original.png" ed68c1815b35494ff64a857909f0d4952cdac56b5661848f10170b693dd7370e
check "$IN/still_ferrari.png"  fb8f4a0eace60aad7bbf8a748ce67704c4b0c1d8186e2407dfeb5d0abeaad21a
check "$IN/still_clean.png"    725e2a8504030f0c4d1a96c7202431c80be37748e880dde74c2f22e57d8bf85c
check "$bl/masks/showroom_car_matte.png"     23a4d63ed8888128ec257ca1b92ce396f6bc6a89675797d524a9cf714f8a1d6b
check "$bl/masks/showroom_penguin_matte.png" a0f698212f2617be4bf2599e61f9f5a210cf1ef6509f3c90d3e5d94b89a0b64f

# the room: layers from the stills, Blender's snow, then the plate frames (all deterministic: seeds in the scene file)
mkdir -p "$OUT/layers"
"$PY" -I "$bl/room_layers.py" "$bl/showroom_c033.json" "$IN/still_original.png" "$IN/still_ferrari.png" "$IN/still_clean.png" \
  "$bl/masks/showroom_car_matte.png" "$bl/masks/showroom_penguin_matte.png" "$OUT/layers"
"$BLENDER" -b --factory-startup -P "$bl/snow.py" -- "$bl/showroom_c033.json" "$OUT/snow" 2>&1 | grep -E "^DONE|rror" || true
"$PY" -I "$bl/room_motion.py" "$bl/showroom_c033.json" "$OUT/layers" "$OUT/snow" "$OUT/plate_seq" --mp4 "$OUT/plate.mp4"
roll=$("$PY" -I -c "import json,sys; print(json.load(open(sys.argv[1]))['source']['roll_deg'])" "$bl/showroom_c033.json")
scale=0.31; [ "$MOVE" = tight ] && scale=0.5     # texture scale: Blender minifies it by no more than ~10 %
"$PY" -I "$bl/prep_performer.py" "$IN/fg.mp4" "$IN/alpha.mp4" "$OUT/perf_seq" --roll "$roll" --scale "$scale"
"$PY" -I "$bl/measure_plate_light.py" "$OUT/plate.mp4" "$IN/fg.mp4" "$OUT/plate_light.npy" marble
for p in depth env refl fg save; do
  "$BLENDER" -b --factory-startup -P "$bl/build_scene.py" -- "$bl/showroom_c033.json" "$OUT/plate_seq" "$OUT/perf_seq" "$OUT/passes" \
    --pass "$p" --move "$MOVE" 2>&1 | grep -E "^SCENE|^rendered|^saved|rror" || true
done
"$PY" -I "$bl/comp_scene.py" "$bl/showroom_c033.json" "$OUT/passes" "$MOVE" "$OUT/plate_light.npy" "$OUT/c033_showroom_blender_v5_$MOVE.mp4"
md5=$(ffmpeg -loglevel error -i "$OUT/c033_showroom_blender_v5_$MOVE.mp4" -map 0:v -f md5 - | cut -d= -f2)
echo "decoded MD5 $md5  (filed: see docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md, 'Blender placement')"
if [ -n "${MODELS:-}" ]; then
  "$PY" -I "$bl/verify_scene.py" "$IN/fg.mp4" "$OUT/c033_showroom_blender_v5_$MOVE.mp4" "$OUT/passes/scene_$MOVE.json" \
    "$bl/showroom_c033.json" "$MODELS/face_landmarker.task" "$OUT/verify_$MOVE.json" --every 2
fi
if [ -f "$IN/song.wav" ]; then
  ffmpeg -loglevel error -y -i "$OUT/c033_showroom_blender_v5_$MOVE.mp4" -ss 56.9098 -t 4.0 -i "$IN/song.wav" -map 0:v -map 1:a -t 4 \
    -c:v copy -c:a aac -b:a 160k -movflags +faststart "$OUT/c033_showroom_blender_v5_${MOVE}_with_song.mp4"
fi
