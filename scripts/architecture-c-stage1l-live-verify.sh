#!/usr/bin/env bash
# Stage 1l CANONICAL LIVE VERIFY — $0 deterministic still repair (invoke only).
# Does not call Grok / V3 / Control Center. Does not score (Lane E is a follow-up).
#
# Auth: set AVT_USER_ACCESS_TOKEN to a signed-in AVT owner JWT (same token the
# product UI sends as Bearer). The publishable/anon key is NOT a user session
# and the proxy returns HTTP 401 unauthenticated. This script will not fall
# back to the anon key.
#
# Canonical live 1l asset (already minted; do not re-run unless replacing it):
#   9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75  architecture_c_still_repair_1l
#
# Usage:
#   AVT_USER_ACCESS_TOKEN=... ./scripts/architecture-c-stage1l-live-verify.sh
#
# UI path (same body as this POST):
#   https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame
#   → 7 · Architecture C — still-first deterministic repair
#   → ★ clean still 2aa1a44c…  (not a repair output)
#   → override chest quad TL/TR/BR/BL to the values below (do not Reset to measured band)
#   → 1 · Repair chest_band + logo_zone

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

OUT_DIR="${STAGE1L_OUT_DIR:-$ROOT/docs/research/results/2026-09-04-still-repair/stage1l-harness}"
mkdir -p "$OUT_DIR"

EXPECTED_VERSION="${EXPECTED_REPAIR_METHOD_VERSION:-architecture_c_still_repair_1l}"
URL="${VITE_SUPABASE_URL:-${SUPABASE_URL:-https://qoyxgnkvjukovkrvdaiq.supabase.co}}"
TOKEN="${AVT_USER_ACCESS_TOKEN:-${AVT_ACCESS_TOKEN:-}}"

if [[ -z "$TOKEN" ]]; then
  cat <<EOF
BLOCKED: no signed-in AVT owner JWT.

This VM / shell has no AVT_USER_ACCESS_TOKEN. Anon POST is 401 unauthenticated.
Do not use the service role. Do not widen proxy auth.

UI (preferred):
  1. Sign in as durable owner at https://aivideotool.lovable.app
  2. Open /projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame
  3. Scroll to 7 · Architecture C — still-first deterministic repair
  4. Repair still: ★ 2aa1a44c… (clean input)
  5. Quad TL/TR/BR/BL: (0.300,0.530) (0.870,0.533) (0.870,0.585) (0.300,0.582)
  6. Click: 1 · Repair chest_band + logo_zone
  7. Confirm repair_method_version architecture_c_still_repair_1l

Script (signed-in session):
  AVT_USER_ACCESS_TOKEN='<owner JWT>' ./scripts/architecture-c-stage1l-live-verify.sh

Canonical 1l asset already recorded: 9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75
EOF
  exit 2
fi

BODY='{"projectId":"764a63d2-93cd-44f3-905f-292f14ab2f51","stillAssetId":"2aa1a44c-b24a-46bf-890f-13a6fc65b1cc","wardrobeFeatureId":"0feb028f-dc4d-45dc-82ac-e4bbd16054b0","stage":"logo_chest","logoZoneQuad":[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]}'
INVOKE_PATH="$OUT_DIR/invoke.json"

echo "Stage 1l invoke → $INVOKE_PATH (expect $EXPECTED_VERSION)"
HTTP_CODE=$(curl -sS -o "$INVOKE_PATH.body" -w "%{http_code}" \
  -X POST "${URL%/}/functions/v1/architecture-c-still-repair-proxy" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --max-time 120 \
  -d "$BODY")

python3 - "$HTTP_CODE" "$EXPECTED_VERSION" "$INVOKE_PATH" "$INVOKE_PATH.body" <<'PY'
import json, sys
http = int(sys.argv[1])
expected = sys.argv[2]
out_path = sys.argv[3]
body_path = sys.argv[4]
try:
    with open(body_path, encoding="utf-8") as f:
        body = json.load(f)
except Exception:
    body = {"raw": open(body_path, "rb").read().decode("utf-8", "replace")}
repair = body.get("repair") if isinstance(body, dict) else None
version = None
if isinstance(repair, dict):
    version = repair.get("repair_method_version")
if version is None and isinstance(body, dict):
    version = body.get("repair_method_version")
asset_id = body.get("assetId") if isinstance(body, dict) else None
payload = {
    "httpStatus": http,
    "expectedVersion": expected,
    "repairMethodVersion": version,
    "versionMatch": version == expected,
    "assetId": asset_id,
    "body": body,
}
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
    f.write("\n")
print(json.dumps({k: payload[k] for k in ("httpStatus", "repairMethodVersion", "versionMatch", "assetId")}, indent=2))
if http != 200 or version != expected or not asset_id:
    sys.exit(1)
print(f"LIVE_1L_ASSET_ID={asset_id}")
PY
