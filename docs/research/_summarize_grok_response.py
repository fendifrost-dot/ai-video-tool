import json
import sys

d = json.load(sys.stdin)
for k in ("error", "detail", "billed", "billedNote", "finalStatus", "estimatedCostUsd", "label"):
    if k in d:
        print(f"  {k}: {d[k]}")
s = d.get("submit") or {}
if s:
    print(
        f"  submit.httpStatus: {s.get('httpStatus')} "
        f"accepted: {s.get('accepted')} requestId: {s.get('requestId')}"
    )
fp = d.get("finalPayload") or {}
u = fp.get("usage") or {}
if u.get("cost_in_usd_ticks") is not None:
    ticks = int(u["cost_in_usd_ticks"])
    print(f"  actualCostUsd: {ticks / 10_000_000_000:.4f}")
o = d.get("output") or {}
if o.get("storedPath"):
    print(f"  stored: {o['storedPath']}")
