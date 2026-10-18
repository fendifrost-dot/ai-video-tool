#!/usr/bin/env bash
# Reproduce the c033 BODY-ONLY over the moving showroom plate (18 Oct 2026) from files already in AVT storage.
# No provider is called and nothing is regenerated: $0. (The plate and the matte were paid once; see the ledger.)
#
# Fetch these private files first (owner sign-in; e.g. the AVT MCP `avt_signed_url`, never paste a signed URL anywhere):
#   project-exports .../canonical/body_only_swap_c033_2026-10-18/c033_BODY_ONLY_final_1080x1920_5994.mp4      -> $IN/fg.mp4    (asset 5482b35b, approved)
#   project-exports .../canonical/body_only_swap_c033_2026-10-18/environment_showroom/c033_BODY_ONLY_matte_alpha.mp4 -> $IN/alpha.mp4 (asset b162d95d)
#   project-clips   .../31d3113c-5a28-48fd-b106-55699546e9af/generated_higgsfield_a2ef72a2-498.mp4              -> $IN/plate.mp4 (asset 21d1bc9c)
#   (optional, for the review clip) the album master song_master_24bit.wav (asset 067a4cbf)                     -> $IN/song.wav
#
# usage: IN=dir OUT=dir PY=python scripts/edit/reproduce_c033_showroom.sh
# Needs: ffmpeg, Python with numpy and opencv-python (tested: Python 3.13, cv2 5.0.0, numpy 2.5.4, ffmpeg 6.1.1,
# x264 core 164).
set -euo pipefail
: "${IN:?set IN to the folder with fg.mp4, alpha.mp4 and plate.mp4}" "${OUT:?set OUT}"
PY=${PY:-python3}
here=$(cd "$(dirname "$0")" && pwd)

check() { # file expected-sha256
  got=$(sha256sum "$1" | cut -d' ' -f1)
  [ "$got" = "$2" ] || { echo "MISMATCH $1: $got (expected $2)"; exit 1; }
  echo "ok $1"
}
check "$IN/fg.mp4"    636cb1f9786505446e61e1ee7a4269178f3c3d368768fdfe58f11dcf4e789d2b
check "$IN/alpha.mp4" 77d7cdb7ba07fc2c6689a8c63fc105c260ec2766597b768031ac7afeb224e375
check "$IN/plate.mp4" c17b3e8e84f3b3cc5a5336398cdd99b83b9123dfa2171adbf3ad4238d1bfdc7f

mkdir -p "$OUT"
"$PY" -I "$here/composite_over_plate.py" "$IN/fg.mp4" "$IN/alpha.mp4" "$IN/plate.mp4" "$OUT/c033_showroom.mp4" \
  --scale 0.9 --cx 620 --exposure 0.85 --push 0.02 --plate-start 1.0 --seed 33

got=$(ffmpeg -loglevel error -i "$OUT/c033_showroom.mp4" -map 0:v -f md5 - | cut -d= -f2)
want=3143ac1fb70ce5c49c1f4796bbecc962   # decoded frames of the filed composite (asset 8a527bab)
if [ "$got" = "$want" ]; then echo "REPRODUCED: decoded frames match the filed composite"; else
  echo "DIFFERS: decoded MD5 $got (filed $want). Check the library versions above before trusting it."; fi

if [ -f "$IN/song.wav" ]; then   # the review clip, song at c033's sync
  ffmpeg -loglevel error -y -i "$OUT/c033_showroom.mp4" -ss 56.9098 -t 4.0 -i "$IN/song.wav" -map 0:v -map 1:a -t 4 \
    -c:v copy -c:a aac -b:a 160k -movflags +faststart "$OUT/c033_showroom_with_song.mp4"
  echo "review: $OUT/c033_showroom_with_song.mp4"
fi
