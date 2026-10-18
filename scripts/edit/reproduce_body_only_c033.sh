#!/usr/bin/env bash
# Reproduce the APPROVED c033 BODY-ONLY clothing swap (Fendi, 18 Oct 2026) from files already in AVT storage.
# No provider is called and nothing is regenerated: $0.
#
# Fetch these private files first (owner sign-in; e.g. the AVT MCP `avt_signed_url`, never paste a signed URL anywhere):
#   project-clips  .../dress/storyboard_c033_1792225065163_src.mp4                          -> $IN/src.mp4   (asset c45e30c6)
#   project-clips  .../c817d489-c9f0-42e3-b163-c821ba685d45/generated_higgsfield_f8f3d704-bd8.mp4 -> $IN/swap.mp4  (asset 5a81d308)
#   project-exports .../canonical/body_only_swap_c033_2026-10-18/models/selfie_multiclass_256x256.tflite -> $MODELS/
#   project-exports .../canonical/body_only_swap_c033_2026-10-18/models/face_landmarker.task             -> $MODELS/
#   (optional, for the comparison) the album master song_master_24bit.wav (asset 067a4cbf)                -> $IN/song.wav
#
# usage: IN=dir MODELS=dir OUT=dir PY=python scripts/edit/reproduce_body_only_c033.sh
# Needs: ffmpeg, Python with numpy, opencv-python, mediapipe (tested: Python 3.13, cv2 5.0.0, mediapipe 1.1.1,
# numpy 2.5.4, ffmpeg 6.1.1).
set -euo pipefail
: "${IN:?set IN to the folder with src.mp4 and swap.mp4}" "${MODELS:?set MODELS}" "${OUT:?set OUT}"
PY=${PY:-python3}
here=$(cd "$(dirname "$0")" && pwd)

check() { # file expected-sha256
  got=$(sha256sum "$1" | cut -d' ' -f1)
  [ "$got" = "$2" ] || { echo "MISMATCH $1: $got (expected $2)"; exit 1; }
  echo "ok $1"
}
check "$IN/src.mp4"  a26da48885c97636aee7e6d4e569b9066235208632c9cbd8e103ade446b2bd63
check "$IN/swap.mp4" 9b5b54a0be515fd28cd2a5d77b38af382d8c553813d84421232704189d17a25f
check "$MODELS/selfie_multiclass_256x256.tflite" c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0
check "$MODELS/face_landmarker.task"             64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff

mkdir -p "$OUT"
AVT_MODELS="$MODELS" "$PY" -I "$here/body_only_swap.py" "$IN/src.mp4" "$IN/swap.mp4" "$OUT"
# expected printout: "frames 240 swap frames aligned 89 max |out-original| on face/hair/skin: 0"

got=$(ffmpeg -loglevel error -i "$OUT/c033_body_only_swap.mp4" -map 0:v -f md5 - | cut -d= -f2)
want=5f268d20fa6a440487ccfa8bbcab4dd4   # decoded frames of the approved final (asset 5482b35b)
if [ "$got" = "$want" ]; then echo "REPRODUCED: decoded frames match the approved final"; else
  echo "DIFFERS: decoded MD5 $got (approved $want). Check the library versions above before trusting it."; fi

if [ -f "$IN/song.wav" ]; then   # the approved three-way comparison (asset b8887a31), song at c033's sync
  F=$(fc-match -f '%{file}' 'DejaVu Sans:bold')
  ffmpeg -loglevel error -y -i "$IN/src.mp4" -i "$IN/swap.mp4" -i "$OUT/c033_body_only_swap.mp4" -ss 56.9098 -t 4.0 -i "$IN/song.wav" \
    -filter_complex "[0:v]scale=540:960,drawtext=fontfile=$F:text='ORIGINAL take':x=10:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6[a];[1:v]fps=60000/1001,scale=540:960,drawtext=fontfile=$F:text='GENJUTSU whole frame':x=10:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6[b];[2:v]scale=540:960,drawtext=fontfile=$F:text='BODY-ONLY (face original)':x=10:y=10:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.6[c];[a][b][c]hstack=inputs=3[v]" \
    -map "[v]" -map 3:a -t 4 -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "$OUT/c033_three_way_with_song.mp4"
  echo "comparison: $OUT/c033_three_way_with_song.mp4"
fi
