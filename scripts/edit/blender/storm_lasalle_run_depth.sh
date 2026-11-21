#!/bin/bash
# the c033 showroom order of commands (scripts/edit/reproduce_c033_showroom_room2.sh) for one depth of the storm scene, frame 1 only
set -e
N=$1; D="/Volumes/T7/PARTNERSHIP:CEASE & DESIST AVT Edit/storm_scene/plan_b/scene"; R=/Users/gocrazyglobal/Projects/ai-video-tool/scripts/edit/blender
BL="/Applications/Blender 5.3.app/Contents/MacOS/Blender"; PY=$HOME/.avt-venv/bin/python; cd "$D"; J="$D/storm_lasalle_$N.json"
S=$($PY -I -c "import json,sys; print(json.load(open(sys.argv[1]))['performer_prep']['texture_scale'])" "$J")
rm -rf "perf_$N" "passes_$N" "stills_$N"
$PY -I $R/prep_performer.py in/fg.mp4 in/alpha_figure.mkv "perf_$N" --roll 0 --scale "$S" --size 1920x1080 | tail -1
for p in depth env refl fg; do "$BL" -b --factory-startup -P $R/build_scene.py -- "$J" "$D/plate_seq" "$D/perf_$N" "$D/passes_$N" --pass $p --move static --only 1 2>&1 | grep -E "^rendered|rror|Traceback" || true; done
$PY -I $R/comp_scene.py "$J" "passes_$N" static plate_light.npy "out_$N.mp4" --only 1 --stills "stills_$N" | tail -1
echo "DONE $N"
