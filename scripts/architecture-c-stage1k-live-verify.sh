#!/usr/bin/env bash
# Stage 1k CANONICAL LIVE VERIFY — $0 deterministic still repair.
# Does not call Grok / V3 / Control Center.
#
# Auth: set AVT_USER_ACCESS_TOKEN to a signed-in AVT user JWT (same token the
# product UI sends as Bearer). The publishable/anon key is NOT a user session
# and the proxy returns HTTP 401 unauthenticated.
#
# Usage:
#   AVT_USER_ACCESS_TOKEN=... ./scripts/architecture-c-stage1k-live-verify.sh
#   # or, score already-downloaded files:
#   STAGE1K_SOURCE_IMAGE=clean.jpg STAGE1K_OUTPUT_IMAGE=repaired.png \
#     ./scripts/architecture-c-stage1k-live-verify.sh --skip-invoke

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

OUT_DIR="${STAGE1K_OUT_DIR:-$ROOT/docs/research/results/2026-09-04-still-repair/stage1k-harness}"
mkdir -p "$OUT_DIR"

SKIP_INVOKE=0
SKIP_FIXTURE=0
SKIP_CALIBRATION=0
for arg in "$@"; do
  case "$arg" in
    --skip-invoke) SKIP_INVOKE=1 ;;
    --skip-fixture) SKIP_FIXTURE=1 ;;
    --skip-calibration) SKIP_CALIBRATION=1 ;;
  esac
done

export STAGE1K_HARNESS=1
export STAGE1K_OUT_DIR="$OUT_DIR"
export STAGE1K_INVOKE=0
export STAGE1K_FIXTURE=0

if [[ "$SKIP_INVOKE" -eq 0 ]]; then
  export STAGE1K_INVOKE=1
fi
if [[ "$SKIP_FIXTURE" -eq 0 ]]; then
  export STAGE1K_FIXTURE=1
fi

# Optional 1j calibration against the persisted live PNG (anon-readable storage).
if [[ "$SKIP_CALIBRATION" -eq 0 && -z "${STAGE1K_SOURCE_IMAGE:-}" ]]; then
  URL="${VITE_SUPABASE_URL:-${SUPABASE_URL:-}}"
  KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}"
  if [[ -n "$URL" && -n "$KEY" ]]; then
    CAL_DIR="$OUT_DIR/_downloads"
    mkdir -p "$CAL_DIR"
    CLEAN_PATH="3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frames/hero_frame_1788460961678.jpg"
    REPAIR_1J="3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789363013015.png"
    curl -fsS -o "$CAL_DIR/clean_still.jpg" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
      "${URL%/}/storage/v1/object/project-references/${CLEAN_PATH}" || true
    curl -fsS -o "$CAL_DIR/stage1j_fb8117ee.png" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
      "${URL%/}/storage/v1/object/project-references/${REPAIR_1J}" || true
    if [[ -s "$CAL_DIR/clean_still.jpg" && -s "$CAL_DIR/stage1j_fb8117ee.png" ]]; then
      export STAGE1K_SOURCE_IMAGE="$CAL_DIR/clean_still.jpg"
      export STAGE1K_OUTPUT_IMAGE="$CAL_DIR/stage1j_fb8117ee.png"
      export STAGE1K_LABEL="calibration_1j_fb8117ee"
      export STAGE1K_LIVE=1
    fi
  fi
fi

echo "Stage 1k harness → $OUT_DIR"
echo "  invoke=${STAGE1K_INVOKE} fixture=${STAGE1K_FIXTURE} pair=${STAGE1K_SOURCE_IMAGE:-none}"
npx vitest run src/lib/eval/liveVerify.runner.test.ts
echo "done"
