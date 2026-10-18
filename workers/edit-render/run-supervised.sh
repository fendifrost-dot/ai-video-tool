#!/usr/bin/env bash
# Restart-on-crash supervisor for hosts without systemd/launchd (e.g. the Grok Bot box).
#   nohup setsid workers/edit-render/run-supervised.sh >/dev/null 2>&1 &
# Env: AVT_WORKER_ENV (file with AVT_WORKER_SECRET=...), AVT_WORKER_LOG_DIR, NODE (node >= 22.6).
set -u
cd "$(dirname "$0")/../.."
ENV_FILE="${AVT_WORKER_ENV:-$HOME/.secrets/avt_render_worker.env}"
LOG_DIR="${AVT_WORKER_LOG_DIR:-./workers/edit-render/logs}"
NODE_BIN="${NODE:-node}"
mkdir -p "$LOG_DIR"
echo $$ > "$LOG_DIR/supervisor.pid"
child=0
trap 'kill -TERM $child 2>/dev/null; wait $child; exit 0' TERM INT
while true; do
  set -a; . "$ENV_FILE"; set +a
  "$NODE_BIN" --experimental-strip-types workers/edit-render/worker.mjs >>"$LOG_DIR/worker.log" 2>&1 &
  child=$!
  wait $child
  echo "{\"ts\":\"$(date -Is)\",\"event\":\"supervisor_restart\",\"exit\":$?}" >>"$LOG_DIR/worker.log"
  sleep 5
done
