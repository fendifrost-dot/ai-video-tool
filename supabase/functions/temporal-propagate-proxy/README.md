# temporal-propagate-proxy

Isolated Lane C temporal live edge. **Authorize then propagate.** No Grok. No Fal. No Control Center.

## Auth (do not widen)

- `verify_jwt = true` (platform)
- In-function `auth.getUser()` on the caller Bearer token
- **No** `X-Proxy-Secret`, service-role writes, or CC hop

## Body

```json
{
  "explicitArm": true,
  "clip": {
    "id": "fixture-or-extract",
    "fps": 24,
    "frames": [{ "index": 0, "width": 80, "height": 128, "luma": [0, 1, "..."] }]
  }
}
```

Omitted `approved` / `sleeveGate` default to the CLEARED chest 1m + sleeve 1c set.

`authorizeTemporalEdgeRequest` refuses unless `TEMPORAL_LIVE_ACTIVATION_ARMED`, chest CLEARED, sleeve CLEARED, and `explicitArm: true`. Then each CLEARED quad runs `propagateRepair`.

## Parent deploy (this function only)

Lovable → **Edge Functions → redeploy `temporal-propagate-proxy`**.

Publish ≠ edge redeploy. **Do not** redeploy `architecture-c-still-repair-proxy` from this lane.

Hero Frame `temporalTrackingEnabled` stays **false** until the Hero Frame owner flips it in a separate change.
