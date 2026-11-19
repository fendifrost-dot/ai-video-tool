#!/usr/bin/env bash
# Run ONE put-back job on this machine, then exit. For Fendi's Mac (8 GB): the worker is started on demand by
# whoever queued the job, never left running (docs/design/DRESS_AND_PLACE_PIPELINE_2026-11.md §3).
#
#   AVT_SCRATCH_DIR=/Volumes/T7/_avt_work/worker_scratch \
#   AVT_MODELS="/Volumes/T7/Hyenas AVT edit/_avt_work/models" \
#   AVT_PUTBACK_PYTHON="$HOME/.avt-venv/bin/python" \
#   workers/edit-render/run-once-putback.sh
#
# Secrets: ~/.secrets/avt_render_worker_mac.env (mode 600) holding AVT_WORKER_SECRET and AVT_WORKER_API. Never in
# the repo, never on the command line.
# It refuses to start when the machine is short of memory (one heavy job at a time) or the scratch drive is absent.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
env_file=${AVT_WORKER_ENV:-$HOME/.secrets/avt_render_worker_mac.env}
[ -f "$env_file" ] || { echo "no worker secret file at $env_file"; exit 2; }
set -a; . "$env_file"; set +a
: "${AVT_SCRATCH_DIR:?set AVT_SCRATCH_DIR to a folder on the T7}" "${AVT_MODELS:?set AVT_MODELS}"
case "$AVT_SCRATCH_DIR" in /Volumes/*) [ -d "$(echo "$AVT_SCRATCH_DIR" | cut -d/ -f1-3)" ] || { echo "the drive for $AVT_SCRATCH_DIR is not mounted"; exit 3; } ;; esac
mkdir -p "$AVT_SCRATCH_DIR"
if [ "$(uname)" = "Darwin" ] && [ "${AVT_SKIP_MEMORY_CHECK:-0}" != "1" ]; then
  # swap in use, in MB: a put-back holds several GB; over the limit another heavy job is running
  used=$(sysctl -n vm.swapusage | sed -E 's/.*used = ([0-9.]+)M.*/\1/' | cut -d. -f1)
  limit=${AVT_MAX_SWAP_MB:-4096}
  if [ "${used:-0}" -gt "$limit" ]; then
    echo "not starting: ${used} MB of swap in use (limit ${limit}). Another heavy job is running; try again when it is done."
    exit 4
  fi
fi
# one put-back at a time on this machine: a second start while one runs stops here
lock="$AVT_SCRATCH_DIR/.putback-worker.lock"
if ! mkdir "$lock" 2>/dev/null; then
  other=$(cat "$lock/pid" 2>/dev/null || true)
  if [ -n "$other" ] && kill -0 "$other" 2>/dev/null; then
    echo "not starting: a put-back worker is already running here (pid $other)"
    exit 6
  fi
  rm -rf "$lock" && mkdir "$lock"
fi
echo $$ > "$lock/pid"
trap 'rm -rf "$lock"' EXIT
export AVT_WORKER_ID=${AVT_WORKER_ID:-mac-once}
export AVT_WORKER_KINDS=putback
cd "$here/../.."
node --experimental-strip-types workers/edit-render/worker.mjs --once
