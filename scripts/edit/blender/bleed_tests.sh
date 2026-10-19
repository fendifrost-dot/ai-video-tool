#!/usr/bin/env bash
# The headlight-bleed tests (handoff item 0), $0, on a few frames of a finished reproduce run.
# Fendi, 19 Oct: "there is bleed I believe from the headlight effect, it looks like I'm coming out of the environment."
#
# usage: OUT=dir BLENDER=... [PY=python] [MOVE=static] [FRAMES="40 120 200"] [V5=clip.mp4] [V3=clip.mp4] \
#        scripts/edit/blender/bleed_tests.sh
#   OUT     the $OUT of scripts/edit/reproduce_c033_showroom_blender.sh for this MOVE (layers, snow, plate_seq,
#           perf_seq, passes, plate_light.npy must be there)
#   V5      optional: the filed v5 render of this MOVE (30f71856 static), to check the baseline frames match it
#   V3      optional: the plate-v3 render 98d1d04e (dark car paint behind him; static only), test 3
# Writes $OUT/bleed/: stills per variant, stats_<variant>.json (wrap lift in the lamp window), and per frame
# crops_<N>.png (his car-side edge at 2x, every variant side by side). The crops show Fendi: never commit them.
#
# Variants (each one changes one thing):
#   base      v5 as filed: 0.5 screen wrap of the room, LED band on
#   wrapoff   test 1: no wrap. The halo goes  -> the wrap is the cause
#   ledoff    test 2: LED band depth 0 (lamps lit steadily). Only the pulsing goes -> the band drives the wrap
#   fixa      fix (a): the wrap's blurred room comes from a plate with the LED light removed
#   fixb      fix (b): a normal light wrap (comp.light_amount / light_cap)
#   fixab     both
set -euo pipefail
: "${OUT:?set OUT}" "${BLENDER:?set BLENDER}"
PY=${PY:-python3}; MOVE=${MOVE:-static}; FRAMES=${FRAMES:-"40 120 200"}
bl=$(cd "$(dirname "$0")" && pwd); J="$bl/showroom_c033.json"; T="$OUT/bleed"; mkdir -p "$T"
csv=$(echo $FRAMES | tr ' ' ',')

# alternative plates for the frames under test, and Blender's room pass from each (same camera, same seed)
for alt in ledoff noled; do
  arg=(--led-depth 0); [ $alt = noled ] && arg=(--no-led 1)
  for N in $FRAMES; do
    "$PY" -I "$bl/room_motion.py" "$J" "$OUT/layers" "$OUT/snow" "$T/plate_$alt" --only "$N" "${arg[@]}" >/dev/null
    "$BLENDER" -b --factory-startup -P "$bl/build_scene.py" -- "$J" "$T/plate_$alt" "$OUT/perf_seq" "$T/$alt" \
      --pass env --move "$MOVE" --only "$N" 2>&1 | grep -E "^rendered|rror" || true
  done
done

comp() {  # variant, extra args...
  local v=$1; shift
  "$PY" -I "$bl/comp_scene.py" "$J" "$OUT/passes" "$MOVE" "$OUT/plate_light.npy" /dev/null --only "$csv" \
    --stills "$T/$v" --stats "$T/stats_$v.json" "$@"
}
comp base     --wrap screen
comp wrapoff  --wrap off
comp ledoff   --wrap screen --env-dir "$T/ledoff/${MOVE}_env"
comp fixa     --wrap screen --wide-env "$T/noled/${MOVE}_env"
comp fixb     --wrap light
comp fixab    --wrap light  --wide-env "$T/noled/${MOVE}_env"

box=$("$PY" -I -c "import json,sys; print(','.join(map(str, json.load(open(sys.argv[1]))['comp']['stats_box_1080'][sys.argv[2]])))" "$J" "$MOVE")
for N in $FRAMES; do
  f=$(printf "c_%04d.png" "$N"); src=()
  [ -n "${V5:-}" ] && src+=("v5 filed=$V5@$N")
  for v in base wrapoff ledoff fixa fixb fixab; do src+=("$v=$T/$v/$f"); done
  [ -n "${V3:-}" ] && src+=("v3 dark car=$V3@$N")
  "$PY" -I "$bl/edge_crops.py" "$T/crops_$N.png" "$box" 2 "${src[@]}"
  if [ -n "${V5:-}" ]; then   # the baseline must be the filed render, up to grain (grain draws follow the frame list)
    "$PY" -I -c "
import sys, subprocess, numpy as np, cv2
a = cv2.imread(sys.argv[1]).astype(int)
raw = subprocess.run(['ffmpeg','-loglevel','error','-i',sys.argv[2],'-vf','select=eq(n\\\\,%d)' % (int(sys.argv[3]) - 1),'-vframes','1','-f','image2pipe','-vcodec','png','-'], capture_output=True, check=True).stdout
b = cv2.imdecode(np.frombuffer(raw, np.uint8), 1).astype(int)
print('frame', sys.argv[3], 'base vs filed v5: mean abs diff %.2f of 255 (grain + x264 alone give ~2-3)' % np.abs(a - b).mean())" "$T/base/$f" "$V5" "$N"
  fi
done
"$PY" -I -c "
import json, sys
print('%-8s %10s %14s' % ('variant', 'lift mean', 'lift spread sd'))
for v in ['base', 'wrapoff', 'ledoff', 'fixa', 'fixb', 'fixab']:
    s = json.load(open('$T/stats_%s.json' % v)); print('%-8s %10.2f %14.2f' % (v, s['lift_mean'], s['lift_spread_sd']))"
echo "crops: $T/crops_*.png (show Fendi; never commit)"
