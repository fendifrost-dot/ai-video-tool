#!/usr/bin/env bash
# Stand-in for the Blender binary when it cannot be downloaded (e.g. a cloud container whose network policy refuses
# download.blender.org but allows PyPI). It runs a script the way `blender -b --factory-startup -P script -- args`
# does, inside the `bpy` module from PyPI (Blender as a Python module, CPython 3.11 only):
#   uv venv -p 3.11 bl311 && uv pip install -p bl311/bin/python "bpy==4.5.*" "numpy<2.3"
#   BLENDER="scripts/edit/blender/bpy_blender.sh" PYBPY=bl311/bin/python scripts/edit/reproduce_c033_showroom_blender.sh
# The scripts call read_factory_settings themselves, so --factory-startup is honoured by them; -b is implied.
# HYPOTHESIS until checked: PyPI's newest 4.5 LTS patch (4.5.14 on 19 Oct 2026) may not render bit-identical to the
# tested 4.5.9. The reproduce script prints the plate MD5 to compare (ee623d0a...); a mismatch is that finding.
set -euo pipefail
PYBPY=${PYBPY:-python3.11}
script=""; rest=()
while [ $# -gt 0 ]; do
  case "$1" in
    -b|--background|--factory-startup) shift ;;
    -P|--python) script="$2"; shift 2 ;;
    --) rest=("$@"); break ;;
    *) echo "bpy_blender.sh: unsupported argument $1" >&2; exit 2 ;;
  esac
done
[ -n "$script" ] || { echo "bpy_blender.sh: no -P script" >&2; exit 2; }
exec "$PYBPY" -I -c 'import sys, runpy, bpy
s = sys.argv[1]; sys.argv = ["blender", "-b", "-P", s] + sys.argv[2:]
runpy.run_path(s, run_name="__main__")' "$script" "${rest[@]}"
