#!/usr/bin/env bash
# Rebuild the c033 BODY-ONLY showroom shot in Blender (placed behind the island) from files already in AVT storage.
# No provider is called and nothing is regenerated: $0.
#
# Fetch these private files first (owner sign-in; e.g. the AVT MCP `avt_signed_url`; never paste a signed URL anywhere):
#   project-exports .../canonical/body_only_swap_c033_2026-10-18/c033_BODY_ONLY_final_1080x1920_5994.mp4          -> $IN/fg.mp4    (asset 5482b35b, approved)
#   project-exports .../canonical/body_only_swap_c033_2026-10-18/environment_showroom/c033_BODY_ONLY_matte_alpha.mp4 -> $IN/alpha.mp4 (asset b162d95d)
#   project-clips   .../7ddc509c-251f-48a8-925b-5c19ec7dc15c/generated_higgsfield_516a3900-bc7.mp4                  -> $IN/plate24.mp4 (asset 256ca1bb: the showroom
#                   plate v3, Kling 24 fps: blue Ferrari, UFO chasing a flying Tesla Roadster; from still d939cb61)
#   project-exports .../canonical/body_only_swap_c033_2026-10-18/blender_showroom/plate_showroom_v3_mci_5994.mp4    -> $IN/plate.mp4 (the same plate interpolated to 59.94)
#   (optional, for the review clips) the album master song_master_24bit.wav (asset 067a4cbf)                        -> $IN/song.wav
#
# usage: IN=dir OUT=dir BLENDER=/path/to/blender PY=python [MOVE=static|dolly|tight] scripts/edit/reproduce_c033_showroom_blender.sh
# Needs: Blender 4.5 LTS (tested 4.5.9, CPU Cycles), ffmpeg, Python with numpy, opencv-python (and mediapipe +
# face_landmarker.task in $MODELS for the verification). Scene: scripts/edit/blender/showroom_c033.json.
set -euo pipefail
: "${IN:?set IN}" "${OUT:?set OUT}" "${BLENDER:?set BLENDER to the blender binary}"
PY=${PY:-python3}; MOVE=${MOVE:-static}
here=$(cd "$(dirname "$0")" && pwd); bl="$here/blender"

check() { got=$(sha256sum "$1" | cut -d' ' -f1); [ "$got" = "$2" ] || { echo "MISMATCH $1: $got (expected $2)"; exit 1; }; echo "ok $1"; }
check "$IN/fg.mp4"    636cb1f9786505446e61e1ee7a4269178f3c3d368768fdfe58f11dcf4e789d2b
check "$IN/alpha.mp4" 77d7cdb7ba07fc2c6689a8c63fc105c260ec2766597b768031ac7afeb224e375
check "$IN/plate24.mp4" 541b9bd739c32eafb218422012ef82e26e7bd43c748736873ee1aa1276f6d2c7
if [ ! -f "$IN/plate.mp4" ]; then   # derive it; another ffmpeg build may interpolate differently, so the hash check can fail
  ffmpeg -loglevel error -y -i "$IN/plate24.mp4" -vf "minterpolate=fps=60000/1001:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" \
    -c:v libx264 -crf 12 "$IN/plate.mp4"
fi
check "$IN/plate.mp4" 0c9be3aefb7e122d53ef120d07b5d626a4361de43bf6437843527302e66b1c62

mkdir -p "$OUT/plate_src" "$OUT/plate_seq"
ffmpeg -loglevel error -y -i "$IN/plate.mp4" "$OUT/plate_src/s_%04d.png"
"$PY" -I - "$OUT" "$bl/showroom_c033.json" <<'EOF'
import json, os, sys
out, params = sys.argv[1], json.load(open(sys.argv[2]))
pl, n = params["plate"], params["frames"]
last = len(os.listdir(f"{out}/plate_src")) - 1
for i in range(n):   # the plate frame at the shot's time (59.94 fps shot over a 24 fps plate, from start_seconds)
    k = min(last, round((pl["start_seconds"] + i * 1001 / 60000) * pl["fps"]))
    dst = f"{out}/plate_seq/plate_{i + 1:04d}.png"
    if os.path.lexists(dst): os.remove(dst)
    os.symlink(f"{out}/plate_src/s_{k + 1:04d}.png", dst)
EOF
roll=$("$PY" -I -c "import json,sys; print(json.load(open(sys.argv[1]))['source']['roll_deg'])" "$bl/showroom_c033.json")
scale=0.31; [ "$MOVE" = tight ] && scale=0.5     # texture scale: Blender minifies it by no more than ~10 %
"$PY" -I "$bl/prep_performer.py" "$IN/fg.mp4" "$IN/alpha.mp4" "$OUT/perf_seq" --roll "$roll" --scale "$scale"
"$PY" -I "$bl/measure_plate_light.py" "$IN/plate.mp4" "$IN/fg.mp4" "$OUT/plate_light.npy" marble
for p in depth env refl fg save; do
  "$BLENDER" -b --factory-startup -P "$bl/build_scene.py" -- "$bl/showroom_c033.json" "$OUT/plate_seq" "$OUT/perf_seq" "$OUT/passes" \
    --pass "$p" --move "$MOVE" 2>&1 | grep -E "^SCENE|^rendered|^saved|rror" || true
done
"$PY" -I "$bl/comp_scene.py" "$bl/showroom_c033.json" "$OUT/passes" "$MOVE" "$OUT/plate_light.npy" "$OUT/c033_showroom_blender_$MOVE.mp4"
md5=$(ffmpeg -loglevel error -i "$OUT/c033_showroom_blender_$MOVE.mp4" -map 0:v -f md5 - | cut -d= -f2)
echo "decoded MD5 $md5  (filed: see docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md, 'Blender placement')"
if [ -n "${MODELS:-}" ]; then
  "$PY" -I "$bl/verify_scene.py" "$IN/fg.mp4" "$OUT/c033_showroom_blender_$MOVE.mp4" "$OUT/passes/scene_$MOVE.json" \
    "$bl/showroom_c033.json" "$MODELS/face_landmarker.task" "$OUT/verify_$MOVE.json" --every 2
fi
if [ -f "$IN/song.wav" ]; then
  ffmpeg -loglevel error -y -i "$OUT/c033_showroom_blender_$MOVE.mp4" -ss 56.9098 -t 4.0 -i "$IN/song.wav" -map 0:v -map 1:a -t 4 \
    -c:v copy -c:a aac -b:a 160k -movflags +faststart "$OUT/c033_showroom_blender_${MOVE}_with_song.mp4"
fi
