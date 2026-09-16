# Temporal $0 live smoke — procedure + expected body

**Date:** 2026-09-16 · **Author:** Cursor (Lane C smoke / evidence) · **Spend:** $0  
**Code under test:** `main` @ `782adac` (PR #95 §7 Run control; prior `200bea9` = PRs #88 arm, #91 Hero Frame flag, #92 reconstruct — reconstruct stays **separate**)  
**Edge:** `temporal-propagate-proxy` (parent said JWT-only redeploy already done)  
**Class:** A (docs + isolated smoke helper / unit tests). No paint. No Lovable code. **Do not** redeploy `architecture-c-still-repair-proxy`.

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

Lineage: [#96](https://github.com/fendifrost-dot/ai-video-tool/issues/96) click SUCCESS · [#94](https://github.com/fendifrost-dot/ai-video-tool/issues/94) / [PR #95](https://github.com/fendifrost-dot/ai-video-tool/pull/95) · [#87](https://github.com/fendifrost-dot/ai-video-tool/issues/87) / [#90](https://github.com/fendifrost-dot/ai-video-tool/issues/90) under umbrella [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50). Prep: [`LIVE_PREP.md`](./LIVE_PREP.md).

---

## Product click SUCCESS [V]

**2026-09-15 ~19:51 America/Chicago** — signed-in AVT owner on https://aivideotool.lovable.app after Lovable **Publish** of PR #95.

Hero Frame §7 **Run temporal propagate** was visible. One click → toast:

`Dispatched 3 job(s). paidCalls=false grokPerFrame=false.`

No 401. No paid generation. No asset IDs in the toast. Canonical: project `764a63d2…`, garment `0feb028f…`, clip `76fe7438…`.

Full write-up + screenshots: [`LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md`](./LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md) · [`live-smoke/click-smoke.json`](./live-smoke/click-smoke.json).

---

## Verdict this VM (script / JWT) [V]

**BLOCKED on owner JWT** for `./scripts/temporal-live-smoke.sh` — same plane as chest 1m / sleeve 1c still verifies. The **published product click** above is the live SUCCESS; this section is the script fallback.

| Probe                                                             | Result                                                                                                     | Time       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------- |
| `OPTIONS` `temporal-propagate-proxy`                              | HTTP **200** (function live; `x-served-by: supabase-edge-runtime`, `sb-project-ref: qoyxgnkvjukovkrvdaiq`) | **285 ms** |
| `POST` with publishable/anon JWT + `explicitArm: true` + 1×1 luma | HTTP **401** `{"error":"unauthenticated"}`                                                                 | **650 ms** |
| `POST` with no `Authorization`                                    | HTTP **401** `UNAUTHORIZED_NO_AUTH_HEADER`                                                                 | **91 ms**  |
| `AVT_USER_ACCESS_TOKEN`                                           | **unset**                                                                                                  | —          |

Anon reached the in-function `auth.getUser()` gate (body is `unauthenticated`, not a 546). Auth was **not** widened. Service-role was **not** used. No V3 / paid Grok / Fal / Control Center call was made.

Machine-readable copy of this VM's run: [`live-smoke/probe.json`](./live-smoke/probe.json) + [`live-smoke/expected-body-summary.json`](./live-smoke/expected-body-summary.json).

**Not claimed (script path):** HTTP 200 from this VM's `./scripts/temporal-live-smoke.sh`. The **product click** (above) is the live SUCCESS. Script still needs a signed-in AVT owner JWT.

In-lib `dispatchTemporalPropagate(buildTemporalLiveSmokeBody())` is **[V]** HTTP-equivalent **200** with `paidCalls: false`, `grokPerFrame: false`, jobs `chest` / `sleeve_left` / `sleeve_right` on assets `9ed83c01` + `fdb86b18`. That is **not** a live edge POST.

---

## State on `main` @ `782adac` [V]

| Flag / surface                                                | Value                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `TEMPORAL_LIVE_ACTIVATION_ARMED`                              | `true`                                                                     |
| Hero Frame `ARCHITECTURE_C_V2_REPAIR.temporalTrackingEnabled` | `true`                                                                     |
| `prepareHeroFrameTemporalDispatch()`                          | `explicitArm: true` when both flags are on                                 |
| `callTemporalPropagate`                                       | JWT `POST` → `temporal-propagate-proxy`; always stamps `explicitArm: true` |
| Still-repair edge `temporalTrackingEnabled`                   | **false** (do not flip; proxy 500s `tracking_flag_misconfigured`)          |
| Chest quad / asset                                            | `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11              |
| Sleeve quads / asset                                          | `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6                |
| Reconstruct                                                   | Wired in-lib (`RECONSTRUCT_LIVE_WIRING_ARMED`); **not** this POST          |
| Hero Frame §7 **Run temporal propagate**                      | landed PR #95; product click **SUCCESS** (issue #96)                       |

---

## Exact click path (Hero Frame) [V]

§7 **has** **Run temporal propagate** as of PR #95 (`main` @ `782adac`). That control calls `prepareHeroFrameTemporalDispatch` / `buildHeroFrameTemporalPropagateBody` then `callTemporalPropagate`. It is **not** bound to **1 · Repair chest** or **2 · Repair sleeve**. Live click SUCCESS: [`LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md`](./LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md).

Parent computerUse script fallback (confirm gate, then JWT, then script) — still valid when no in-app session:

1. Sign in at `https://aivideotool.lovable.app` as the durable owner (`3ca10935-8c3d-4479-9a0c-8bfe8050840c`).
2. Open **Hero Frame**:  
   `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`
3. Scroll past sections 1–6 to **7 · Architecture C — still-first deterministic repair**.
4. Confirm there is **no** amber **Sign in as the durable owner to run still repair.**
5. Read the emerald gate banner. Expect:

   `temporalTrackingEnabled=true`, `armed=true`, `explicitArm=true`, `canDispatch=true`

6. **Do not** click **1 · Repair chest_band + logo_zone**.  
   **Do not** click **2 · Repair sleeve_panel (manual, upper arm)**.  
   Paint is locked (chest 1m + sleeve 1c). This smoke must not mint a new still.
7. Prefer the §7 **Run temporal propagate** click (SUCCESS recorded). Script fallback: copy the owner JWT:

   DevTools → **Network** → any authenticated app request → request header  
   `Authorization: Bearer <access_token>`

   (Live `aivideotool.lovable.app` uses localStorage; Lovable preview may broker auth. Network header is the reliable copy.)

8. Run the $0 smoke (existing synthetic luma only — not V2 footage, not Grok):

   ```bash
   AVT_USER_ACCESS_TOKEN='<owner JWT>' ./scripts/temporal-live-smoke.sh
   ```

---

## Exact API path [V]

```
prepareHeroFrameTemporalDispatch()
  → heroFrameTemporalExplicitArm(tracking && armed) = true
  → prepareHeroFrameTemporalHook({ explicitArm: true })
  → activation.allowed

callTemporalPropagate(inputWithoutExplicitArm)
  → buildHeroFrameTemporalPropagateBody(...)  // stamps explicitArm: true
  → POST {VITE_SUPABASE_URL}/functions/v1/temporal-propagate-proxy
  → Authorization: Bearer <owner JWT>
  → Content-Type: application/json
```

Live URL:

`POST https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/temporal-propagate-proxy`

The publishable/anon key is **not** a user session (**401** `unauthenticated` — [V] this VM).

---

## Expected request body [V]

Source of truth: `buildTemporalLiveSmokeBody()` in `src/lib/temporal/liveSmoke.ts`.  
Product query `callTemporalPropagate` / `buildHeroFrameTemporalPropagateBody` stamps **`explicitArm: true`** onto the clip only; omitted `approved` / `sleeveGate` **default on the edge** to this same CLEARED set.

### Product-minimal (what the query helper sends)

```json
{
  "explicitArm": true,
  "clip": {
    "id": "live-prep-cleared-chest-quad",
    "fps": 24,
    "frames": [
      { "index": 0, "width": 80, "height": 128, "luma": ["…80×128 uint8…"] },
      { "index": 1, "width": 80, "height": 128, "luma": ["…+2 px x translation…"] },
      { "index": 2, "width": 80, "height": 128, "luma": ["…"] },
      { "index": 3, "width": 80, "height": 128, "luma": ["…"] },
      { "index": 4, "width": 80, "height": 128, "luma": ["…"] }
    ]
  }
}
```

### Recommended parent smoke (explicit lineage IDs)

This is what `./scripts/temporal-live-smoke.sh` POSTs. Quad tuples are TL→TR→BR→BL.

```json
{
  "explicitArm": true,
  "clip": {
    "id": "live-prep-cleared-chest-quad",
    "fps": 24,
    "frames": ["/* 5 × 80×128 synthetic luma; chest-band translates +2 px/frame */"]
  },
  "approved": {
    "chest": {
      "kind": "chest",
      "keyframeId": "v2-still-0.785",
      "sourceAssetId": "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
      "repairMethodVersion": "architecture_c_still_repair_1m",
      "gate": "CLEARED",
      "quadNorm": [
        { "x": 0.3, "y": 0.53 },
        { "x": 0.87, "y": 0.533 },
        { "x": 0.87, "y": 0.585 },
        { "x": 0.3, "y": 0.582 }
      ]
    },
    "sleeveLeft": {
      "kind": "sleeve_left",
      "keyframeId": "v2-still-0.785",
      "sourceAssetId": "fdb86b18-d4aa-465e-b73f-1d252709739c",
      "repairMethodVersion": "architecture_c_sleeve_still_1c",
      "gate": "CLEARED",
      "quadNorm": [
        { "x": 0.03, "y": 0.5 },
        { "x": 0.26, "y": 0.505 },
        { "x": 0.25, "y": 0.615 },
        { "x": 0.03, "y": 0.61 }
      ]
    },
    "sleeveRight": {
      "kind": "sleeve_right",
      "keyframeId": "v2-still-0.785",
      "sourceAssetId": "fdb86b18-d4aa-465e-b73f-1d252709739c",
      "repairMethodVersion": "architecture_c_sleeve_still_1c",
      "gate": "CLEARED",
      "quadNorm": [
        { "x": 0.88, "y": 0.505 },
        { "x": 0.99, "y": 0.5 },
        { "x": 0.99, "y": 0.615 },
        { "x": 0.88, "y": 0.61 }
      ]
    },
    "reservedSleeveSlots": []
  },
  "sleeveGate": {
    "status": "CLEARED",
    "assetId": "fdb86b18-d4aa-465e-b73f-1d252709739c",
    "repairMethodVersion": "architecture_c_sleeve_still_1c"
  }
}
```

| Lineage field | Value                                  |
| ------------- | -------------------------------------- |
| Project       | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Clean still   | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| Keyframe      | `v2-still-0.785`                       |
| Chest asset   | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50` |
| Sleeve asset  | `fdb86b18-d4aa-465e-b73f-1d252709739c` |

`clip.frames[].luma` is generated at runtime from `clearedChestTranslatingFixture()` (80×128 × 5). Do **not** paste a 10k-value dump into chat. Do **not** send live V2 pixels. Do **not** attach reconstruct / SAM-3 / original-master fields.

Without `explicitArm: true` the edge returns **403** `explicit_arm_required` (in-lib [V]).

---

## Expected live 200 [H until parent JWT POST; in-lib V]

```json
{
  "ok": true,
  "dispatchVersion": "1.0.0",
  "paidCalls": false,
  "grokPerFrame": false,
  "provider": "none",
  "jobs": [
    {
      "kind": "chest",
      "sourceAssetId": "9ed83c01-8c7d-4d1b-918f-87b0fc743c50",
      "repairMethodVersion": "architecture_c_still_repair_1m",
      "provider": "none",
      "grokPerFrame": false,
      "paidCalls": false
    },
    {
      "kind": "sleeve_left",
      "sourceAssetId": "fdb86b18-d4aa-465e-b73f-1d252709739c",
      "repairMethodVersion": "architecture_c_sleeve_still_1c"
    },
    {
      "kind": "sleeve_right",
      "sourceAssetId": "fdb86b18-d4aa-465e-b73f-1d252709739c",
      "repairMethodVersion": "architecture_c_sleeve_still_1c"
    }
  ]
}
```

Each job has 5 frames; frame 0 `source` is `canonical`. No Grok / Fal / CC fields.

---

## One-shot curl (parent computerUse) [D]

Prefer the script (it builds the fixture luma). Equivalent curl shape:

```bash
AVT_USER_ACCESS_TOKEN='<owner JWT from a signed-in AVT session>' \
  ./scripts/temporal-live-smoke.sh
```

Manual curl after generating the body (script writes `docs/temporal/live-smoke/expected-body-summary.json`; full luma stays in memory / POST only):

```bash
# Do not fall back to SUPABASE_PUBLISHABLE_KEY — that is 401 unauthenticated.
curl -sS -X POST \
  'https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/temporal-propagate-proxy' \
  -H "Authorization: Bearer ${AVT_USER_ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/temporal-live-smoke-body.json
```

---

## Hard locks [D]

- No chest / sleeve paint edits. No new still-repair POST.
- No Lovable code. No `architecture-c-still-repair-proxy` redeploy.
- No V3 / paid Grok / Fal / Control Center / proxy-auth widen / PR #37.
- Reconstruct / original-master stays in-lib and is **not** part of this smoke POST.
- Existing assets + synthetic luma only. No live extract ingest.

---

## READY / BLOCKED

**READY** as documented $0 smoke procedure + expected body + parent script.

**SUCCESS** on the published product click (PR #95 Publish, 2026-09-15 ~19:51 CT): 3 jobs, `paidCalls=false`, `grokPerFrame=false`, authenticated, no 401. See [`LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md`](./LIVE_CLICK_SMOKE_SUCCESS_2026-09-15.md).

**BLOCKED** for a live 200 from this cloud VM's script: no `AVT_USER_ACCESS_TOKEN`. Anon stays 401.

**[R]** Script fallback remains: confirm §7 gate → copy owner JWT → `./scripts/temporal-live-smoke.sh` → record HTTP 200 / `paidCalls: false` / three jobs. Not required to re-prove the click SUCCESS.
