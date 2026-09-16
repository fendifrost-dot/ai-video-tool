#!/usr/bin/env bash
# $0 temporal live smoke — existing synthetic luma fixture only.
# No V3 / paid Grok / Fal / CC. Does not POST still-repair. Does not paint.
#
# Auth: AVT_USER_ACCESS_TOKEN = signed-in AVT owner JWT.
# Anon/publishable is 401 unauthenticated (same as chest 1m / sleeve 1c verifies).
#
# Usage:
#   ./scripts/temporal-live-smoke.sh
#   AVT_USER_ACCESS_TOKEN='<owner JWT>' ./scripts/temporal-live-smoke.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${AVT_USER_ACCESS_TOKEN:-${AVT_ACCESS_TOKEN:-}}" ]]; then
  cat <<'EOF'
BLOCKED: no signed-in AVT owner JWT.

This VM / shell has no AVT_USER_ACCESS_TOKEN. Anon POST is 401 unauthenticated.
Do not use the service role. Do not widen proxy auth. Do not click chest/sleeve paint.

Hero Frame confirm (parent computerUse):
  1. Sign in as durable owner at https://aivideotool.lovable.app
  2. Open /projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame
  3. Scroll to 7 · Architecture C — still-first deterministic repair
  4. Confirm gate: temporalTrackingEnabled=true, armed=true, explicitArm=true, canDispatch=true
  5. Do NOT click 1 · Repair chest_band + logo_zone
  6. Do NOT click 2 · Repair sleeve_panel
  7. There is no temporal run button — §7 only shows the gate.
     Copy the owner JWT from DevTools → Network → any authenticated request
     (Authorization: Bearer …), then:

  AVT_USER_ACCESS_TOKEN='<owner JWT>' ./scripts/temporal-live-smoke.sh

Expected POST: temporal-propagate-proxy with explicitArm=true + chest 9ed83c01 + sleeve fdb86b18.
Reconstruct stays in-lib / separate — do not include it in this POST.
EOF
fi

exec npx tsx scripts/temporal-live-smoke.mts
