# Architecture C — Stage 1k canonical live verification (`logo_chest`)

**Date:** 2026-09-15 · **Author:** Cursor (cloud agent, Lane A verify) · **Spend:** $0 · **Issue:** #52 (parent #50)
**Code under test:** `main` @ `9366f09` (Stage 1k `0b12e8c` + PR #64 merge + Lovable “Redeployed repair proxy edge fn”)
**Expected live version:** `architecture_c_still_repair_1k`

Evidence labels: **[V]** verified · **[O]** observed · **[H]** hypothesis · **[D]** decision · **[R]** recommendation

## Verdict — **CHEST STILL GATE: NOT SCORED LIVE** (blocked)

| Field                   | Value                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate                    | **NOT CLEARED — live invoke blocked** (no 1k asset, no 11-point live table)                                                                   |
| `repair_method_version` | **not returned** (HTTP 401, body `{"error":"unauthenticated"}`)                                                                               |
| Output asset id         | **none** — DB newest `logo_chest` is still 1j `fb8117ee-a0bd-4949-a190-517d444cee4a` (`architecture_c_still_repair_1j`, 2026-09-14 05:16:53Z) |
| Latency                 | **1366 ms** to 401 (not a 546)                                                                                                                |
| HTTP 546                | **no** — proxy is reachable; OPTIONS 200; POST with missing/invalid user JWT is 401                                                           |
| Production activation   | **still blocked** (still gate not live-scored; fixture residual C2 + C6)                                                                      |

This is **not** a 1j re-score. 1j remains `d3dbe647` / `c24abc905` **NOT CLEARED 5/11**.

## Runtime preflight [V]

Established $0 path = `POST /functions/v1/architecture-c-still-repair-proxy` with the product-UI payload (same as `callArchitectureCStillRepair` / `ArchitectureCStillRepairRunner`):

```json
{
  "projectId": "764a63d2-93cd-44f3-905f-292f14ab2f51",
  "stillAssetId": "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  "wardrobeFeatureId": "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
  "stage": "logo_chest",
  "logoZoneQuad": [
    [0.3, 0.53],
    [0.87, 0.533],
    [0.87, 0.585],
    [0.3, 0.582]
  ]
}
```

No `allowSkinHeuristicFallback` (fail-closed SAM-3). No Grok, no V3, no Control Center edits.

| Probe                                                                     | Result                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| OPTIONS proxy                                                             | HTTP **200** in 1.57 s                                                                      |
| POST, Authorization = publishable/anon JWT                                | HTTP **401** `unauthenticated` in **1.37 s**                                                |
| POST, no Authorization                                                    | HTTP **401** `UNAUTHORIZED_NO_AUTH_HEADER`                                                  |
| `project_assets` `repair_method_version = architecture_c_still_repair_1k` | **0 rows** [V] Lovable SQL                                                                  |
| Cloud VM `.env`                                                           | `SUPABASE_URL` + publishable key only — **no user access token / password / refresh token** |
| Service-role impersonation                                                | **not used** (forbidden)                                                                    |

Exact blocker for Claude Cowork / Execution Manager: the proxy calls `auth.getUser()` and requires `video_projects.user_id` to match that user. The anon/publishable JWT is not a user session. Set `AVT_USER_ACCESS_TOKEN` to a signed-in AVT owner JWT (browser session → Application → localStorage / network `Authorization` on any authenticated `functions/v1` call) and re-run:

```bash
AVT_USER_ACCESS_TOKEN='<user jwt>' ./scripts/architecture-c-stage1k-live-verify.sh --skip-calibration
```

Refuse the run if `repair.repair_method_version !== architecture_c_still_repair_1k` (DEPLOYMENT MISMATCH, same as the 09-11 1j first redeploy).

## Fixture prediction (not live) [V on canonical crop + 1h SAM-3 α]

Lane E `evaluateChestStill` on `runFixturePipeline()` (1k `coverTargetQuad` + illumination + zip + chest-local α). **This is not a live SAM-3 / worker score.**

**Predicted gate: NOT CLEARED 9/11** (`fixture_1k/gate.txt`).

| #   | Criterion                  | Result   | vs 1j live           | Metrics                                                                                                |
| --- | -------------------------- | -------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Full band incl. left third | **PASS** | =                    | unpaintedFrac 0                                                                                        |
| 2   | Pinstripe + AA removed     | **FAIL** | still fail           | 10 remnant px (1j Lane E on live PNG: 21)                                                              |
| 3   | Crease removed             | **PASS** | =                    | min column mean 32.9 ≥ floor 25.6                                                                      |
| 4   | Cream preservation         | **PASS** | improved vs 1j 97 px | cream→navy **0**; first-navy row 676=source                                                            |
| 5   | Sleeve/forearm             | **PASS** | improved vs 1j 8 px  | patchDarkened **0**                                                                                    |
| 6   | Perimeter                  | **FAIL** | improved 114→42      | cream→navy **42** at x 580–616 / y 713–730                                                             |
| 7   | Wordmark                   | **PASS** | =                    |                                                                                                        |
| 8   | Centre / single zip        | **PASS** | improved             | left tape x399 y715 luma **40.5** (1j live **109.6**)                                                  |
| 9   | No ghosting                | **PASS** | improved             | unfiltered ghost ratio **0.023**; windows **0.042 / 0.012** (1j live **0.607 / 0.593**; target < 0.05) |
| 10  | Foreground occlusion       | **PASS** | =                    |                                                                                                        |
| 11  | Outside-region             | **PASS** | =                    | 0 px above y 600 / below y 800                                                                         |

Crops: `stage1k-harness/fixture_1k/*.jpg`.

Residual claimed by 1k impl notes and reproduced here: right-end letter-hole class (42 px) + ridge AA remnants (C2). Enclosure / tape / sleeve 4×3 / cream raise hold on the fixture.

## 1j live PNG Lane E calibration [V, with decoder caveat]

Scored persisted 1j asset `fb8117ee` vs clean still JPEG `2aa1a44c` through ffmpeg PPM. Band-local probes agree with Claude’s 1j forensic table; **byte-identity criteria do not**, because the source is a re-decoded JPEG.

| Probe                                     | Human 1j (`d3dbe647`) | Lane E on live PNG        |                                               |
| ----------------------------------------- | --------------------- | ------------------------- | --------------------------------------------- |
| Ghost windows (unfiltered)                | 0.60 / 0.59           | **0.607 / 0.593**         | match                                         |
| Right-end cream→navy                      | 114                   | **109**                   | match                                         |
| Sleeve 4×3 darkened                       | 8                     | **8** (`patchDarkened`)   | match                                         |
| Left tape x399 y715                       | unpainted ~110        | **109.6**                 | match                                         |
| Cream-body x280–330                       | 97                    | **71**                    | same FAIL, JPEG luma shift                    |
| C5 bright-sleeve / C10 skin / C11 outside | PASS (byte-identical) | FAIL (585 / 109 / 719473) | **JPEG re-decode noise — ignore for live 1k** |

After a real 1k PNG lands, score it the same way: **trust C1–C4, C6–C9 extras; treat C5 brightChanged / C10 / C11 as FAIL only if the 1j PNG vs JPEG pair does not already fail them.** Prefer comparing 1k PNG to 1j PNG for those three if the worker’s JPEG decode is unavailable.

## Harness (for Cowork)

| Path                                            | Role                                                         |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `scripts/architecture-c-stage1k-live-verify.sh` | curl invoke + Lane E score + fixture                         |
| `src/lib/eval/liveVerify.ts`                    | canonical payload, invoke, forensic extras, fixture pipeline |
| `src/lib/eval/liveVerify.runner.test.ts`        | env-gated runner (`STAGE1K_HARNESS=1`)                       |
| `src/lib/eval/chestVisualEvaluator.ts`          | 11-point Lane E                                              |

Hard locks preserved: no 1i occlusion reopen, no 1j ROI reopen, no CC, no `grok-video-research-proxy`, no PR #37, no V3 / paid Grok.

## Recommended next step [R]

1. Cowork: one authenticated $0 POST with `AVT_USER_ACCESS_TOKEN`.
2. Confirm `repair_method_version === architecture_c_still_repair_1k` and no 546.
3. Fill the live 11-point table from Lane E + the extras in `report.json`. Fixture says C2 + C6 still FAIL → expect **NOT CLEARED 9/11** unless live SAM-3 / full-frame paint differs.
4. Production activation stays blocked until the live table is 11/11 (or ChatGPT rules residual C2/C6 acceptable).
