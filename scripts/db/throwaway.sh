#!/usr/bin/env bash
# A throwaway Postgres 16 with every migration applied, for holding a new migration against data before it goes
# anywhere near the live database. Needs the postgres binaries and a user to run them as (root cannot).
#   scripts/db/throwaway.sh                     # run every test under supabase/tests (each on a fresh database)
#   scripts/db/throwaway.sh --until <file.sql>  # apply migrations up to (not including) that one, and stop
# A test that must run BEFORE a migration (it seeds the old shape, then \i's the migration) says so on a line
# `-- throwaway: until <file.sql>`; the others run with every migration applied.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DIR="${PGTHROWAWAY:-/var/tmp/avt_pg}"
PORT="${PGTHROWAWAYPORT:-5544}"
AS_USER="${PGTHROWAWAYUSER:-postgres}"
UNTIL=""
if [ "${1:-}" = "--until" ]; then UNTIL="$(basename "$2")"; fi
run_as() { if [ "$(id -u)" = "0" ]; then runuser -u "$AS_USER" -- "$@"; else "$@"; fi; }
P=(psql -h "$DIR" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
start_server() {
  if [ -d "$DIR/data" ]; then run_as "$BIN/pg_ctl" -D "$DIR/data" stop -m fast >/dev/null 2>&1 || true; fi
  rm -rf "$DIR"; mkdir -p "$DIR"; [ "$(id -u)" = "0" ] && chown "$AS_USER" "$DIR"
  run_as "$BIN/initdb" -D "$DIR/data" -U postgres >/dev/null 2>&1
  run_as "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
  sleep 2
}
fresh_db() {   # $1 = stop before this migration file name ("" = apply all)
  "${P[@]}" -c "drop database if exists avt" >/dev/null
  "${P[@]}" -c "create database avt" >/dev/null
  "${P[@]}" -d avt -f "$ROOT/scripts/db/stubs.sql" >/dev/null 2>&1
  for f in "$ROOT"/supabase/migrations/*.sql; do
    if [ -n "$1" ] && [ "$(basename "$f")" = "$1" ]; then break; fi
    "${P[@]}" -d avt -f "$f" >/dev/null 2>&1
  done
}
start_server
if [ -n "$UNTIL" ]; then
  fresh_db "$UNTIL"; echo "migrations applied up to $UNTIL"; exit 0
fi
status=0
for t in "$ROOT"/supabase/tests/*.sql; do
  until_line="$(grep -m1 -o -- '-- throwaway: until [^ ]*' "$t" | awk '{print $4}' || true)"
  fresh_db "$until_line"
  out="$(cd "$ROOT" && "${P[@]}" -d avt -f "$t" 2>&1)" && rc=0 || rc=$?
  echo "$out" | grep -E "ERROR|assertions hold" || true
  if [ "$rc" -ne 0 ]; then echo "FAILED $(basename "$t")"; status=1; else echo "ok     $(basename "$t")"; fi
done
exit $status
