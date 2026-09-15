# Architecture C — Stage 1l live asset identity (`logo_chest`, `9eaf0c55`)

**Date:** 2026-09-15 · **Author:** Cursor (Lane A, identity-only) · **Spend:** $0 · **Issue:** #67 (lineage #52, parent #50)
**Code under test:** `main` @ `2aaaaf1` (PR #68 merged; edge `architecture-c-still-repair-proxy` redeployed for 1l)
**Run:** authenticated AVT owner session produced the row. This cloud VM had **no** `AVT_USER_ACCESS_TOKEN` and did **not** POST a second repair.
**Scorer:** **not run.** Lane E 11-point table is a follow-up.

Evidence labels: **[V]** verified (Lovable SQL + persisted `metadata_json`) · **[O]** observed · **[D]** decision · **[R]** recommendation

## Live asset [V]

| Field | Value |
|---|---|
| `assetId` | **`9eaf0c55-5fdd-44ac-ac5c-9a9a86414c75`** |
| `created_at` | **2026-09-15 04:32:47.992701+00** |
| `repair_method_version` | **`architecture_c_still_repair_1l`** |
| `repair_stage` | `logo_chest` |
| `source_still_asset_id` | `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc` |
| `wardrobe_feature_id` | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| `project_id` | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| `keyframe_id` | `v2-still-0.785` |
| `frame_time_sec` | `0.785` |
| `requested_band_quad_norm` | `[[0.3,0.53],[0.87,0.533],[0.87,0.585],[0.3,0.582]]` |
| `occlusion_source` / `sam3_attempted` / `sam3_ok` / `sam3_reason` | `sam3` / `true` / `true` / `null` |
| `allow_skin_heuristic_fallback` | `false` |
| `temporal_tracking_enabled` | `false` |
| `effective_band_bbox.pixel_count` | **27 390** (1k live `c9c4efee`: 27 307) |
| `storedPath` | `…/architecture-c-repair/logo_chest_2aa1a44c-b24a-46bf-890f-13a6fc65b1cc_1789446767711.png` |
| Owner | `3ca10935-8c3d-4479-9a0c-8bfe8050840c` |

Previous newest chest still remains 1k **`c9c4efee-6bd2-450f-a9e4-b70fb9b722bb`** (`architecture_c_still_repair_1k`, 2026-09-15 02:57:44Z). This 1l row is strictly newer. No second 1l row was created by this session.

## Cloud-VM probe [V]

Anon/publishable POST to `architecture-c-still-repair-proxy` from this VM returned HTTP **401** `unauthenticated` in **681 ms** (not 546). `AVT_USER_ACCESS_TOKEN` was unset. Service-role was not used. Auth was not widened.

## Exact product request body [V]

Same JSON `callArchitectureCStillRepair` sends (`src/lib/queries/architectureCStillRepair.ts`). The UI maps **1 · Repair chest_band + logo_zone** → `handleLogoChest` → this POST.

```json
{
  "projectId": "764a63d2-93cd-44f3-905f-292f14ab2f51",
  "stillAssetId": "2aa1a44c-b24a-46bf-890f-13a6fc65b1cc",
  "wardrobeFeatureId": "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
  "stage": "logo_chest",
  "logoZoneQuad": [[0.30, 0.530], [0.87, 0.533], [0.87, 0.585], [0.30, 0.582]]
}
```

Edge: `POST https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/architecture-c-still-repair-proxy`  
Headers: `Authorization: Bearer <signed-in AVT owner JWT>`, `Content-Type: application/json`.  
The publishable/anon key is **not** a user session (401).

The runner does **not** send `allowSkinHeuristicFallback`; the proxy defaults fail-closed (`false`).

## UI click path (Hero Frame Studio) [V]

Do this only to mint a **new** 1l row. The canonical 1l asset above already exists — do not click again unless the previous row is discarded.

1. Sign in at `https://aivideotool.lovable.app` as the durable owner (`3ca10935-…`).
2. Open **Hero Frame**:  
   `https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame`  
   (project sidebar label **Hero Frame**).
3. Scroll past sections 1–6 to **7 · Architecture C — still-first deterministic repair**.
4. Confirm there is no amber **Sign in as the durable owner to run still repair.**
5. **Garment:** keep the canonical Fendi jacket (`0feb028f-…`; preselected).
6. **Repair still asset (clean input only):** choose the **★** option for clean still `2aa1a44c…` (t=0.785). Do not pick a `[repair:logo_chest]` output.
7. **Chest band + logo_zone quad:** the editor seeds `MEASURED_V2_CHEST_BAND_QUAD` (`y ≈ 0.503–0.578`). **Override** the numeric TL/TR/BR/BL fields — do **not** click **Reset to measured band**:

   | Corner | x | y |
   |--------|------|------|
   | TL | 0.300 | 0.530 |
   | TR | 0.870 | 0.533 |
   | BR | 0.870 | 0.585 |
   | BL | 0.300 | 0.582 |

8. Optional: **Lock chest quad** (live `onQuadChange` already holds the values).
9. Click **1 · Repair chest_band + logo_zone**. Wait for toast **logo_chest saved**. Do **not** click **2 · Repair sleeve_panel**.
10. The new row is a `project_assets` `reference_image` with `repair.repair_method_version = architecture_c_still_repair_1l`.

## One-shot script (signed-in JWT only) [D]

```bash
AVT_USER_ACCESS_TOKEN='<owner JWT from a signed-in AVT session>' \
  ./scripts/architecture-c-stage1l-live-verify.sh
```

Expects HTTP 200 and `repair.repair_method_version === architecture_c_still_repair_1l`, then prints `assetId`. Does not score. Does not fall back to the anon key. Do not run this now — the live 1l row already exists.

## Hard locks [D]

Identity-only. No second repair POST, no V3 / paid Grok, no Control Center, no proxy auth widen, no PR #37, no Lane E score in this PR.

## Recommended next [R]

Score `9eaf0c55` with Lane E unfiltered mid-luma (same ruler as PR #66). Target vs remaining 1k FAILs: C2 remnants 0, C4 cream→navy 0, C6 cream→navy 0, C9 combined &lt; 0.05. Decoder: ImageScript (edge), not ffmpeg JPEG for the source still.
