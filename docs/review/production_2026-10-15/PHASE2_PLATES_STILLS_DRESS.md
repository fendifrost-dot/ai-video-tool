# Phase 2 — plates, stills, clips, dress (candidate 6)

**Date:** 15 Oct 2026 (05:00–05:50 UTC) · **Project:** YSL "Ice On" `764a63d2-93cd-44f3-905f-292f14ab2f51` · **Board:** candidate 6 `358363e6-33ba-48e0-bd88-e80b57ac6b3c` · **Master take:** `70304981-d375-47a9-81df-aa062c62c6ec` (project-references, 1080×1920, 59.94 fps, HLG, 190.34 s), sync `28dbe292` (offset 0.8538, drift 0).

Every claim is labelled VERIFIED (read back from the database or produced by a quoted command) / OBSERVED / HYPOTHESIS / DECISION. Nothing here was selected, unselected, approved or deleted by hand; the only selections that changed are the ones `provider-jobs-tick` makes by rule on shots that had nothing selected (§C.3).

All database work went through the AVT MCP (`avt_select` / `avt_insert` / `avt_update` / `avt_call` / `avt_signed_url`); no SQL, no dashboard, no edit under `src/` or `supabase/functions/`.

---

## 0. Verify first

| Check | Call | Expected | Status |
|---|---|---|---|
| Plates filed | `project_assets` where `file_url like '%/worlds/plate_%'` and `created_at >= 2026-10-15T05:00Z` | **8 rows** (§A table), `asset_type reference_image`, `metadata_json.prompt_version` = `plate-real-v3-…`, `shot_id` null | VERIFIED 05:04–05:07 (job rows `9792b682`, `c2aad105`, `c6c313f9`, `04621e9e` all `succeeded`, `result_asset_id` = first picture) |
| Plate jobs | `provider_jobs` ids `9792b682`, `c2aad105`, `c6c313f9`, `04621e9e` | `status succeeded`, `finalized_at` set, `progress_note` = "the pictures were not checked for stacked panels — the check runs when the storyboard is opened" | VERIFIED 05:18 |
| Stills on shots | `shot_asset_assignments` where `variation_id = 358363e6…` and `created_at >= 2026-10-15T05:14Z` and `role = generated_image` | **34 rows**, all `is_primary = false`, `sort_order 1`, one per shot in §B | VERIFIED 05:36 (34 rows read back, every one `is_primary: false`) |
| Still jobs | `provider_jobs` where `request_payload_json->settings->>promptVersion = 'real-v1-2026-10-15'` and `mode = still_only` | 34 rows `succeeded`, each `result_asset_id` = its picture | VERIFIED 05:18 for 24, 05:36 for all 34 |
| Clip jobs | `provider_jobs` where `request_payload_json->settings->>route = 'still_kling'` and `created_at >= 2026-10-15T05:26Z` | 34 rows, each with `external_job_id` (Higgsfield request id) set before 05:36:30; `succeeded` + `result_asset_id` once rendered | VERIFIED: 34 ids set by 05:36:01; see §C.4 for the render state at the time of writing |
| Clips on shots | `shot_asset_assignments` `role = generated_clip` on the §B shots | one per finished job, `is_primary = true`, `sort_order 2`; the still stays `is_primary = false` | VERIFIED for the first 10 at 05:36 (§C.3) |
| Nothing else touched | `shot_asset_assignments` on candidate 6 with `created_at < 2026-10-15T05:00Z` | the 22 carried rows + the c042 dressed alternate, unchanged | not re-read; no call in this phase wrote to them |

If any count differs, the live database has moved since this report; the report is wrong, not the database.

---

## A. Plates — DONE ($0.56)

Route: `world-still-proxy`, `grok-imagine-image-quality`, 9:16, 1k, n=2, `maxCostUsd 0.2`, one write-ahead `provider_jobs` row per call (`batchRun plates_2026-10-15`, `mode still_only`, `selectStill false`, no `shotId`), `jobRowId` passed so the pictures are written on the row and the tick finishes the job. The tick finalised each row within 3 minutes with the standard "not checked for stacked panels" note. Filed unselected under `project-references/<user>/<project>/worlds/`; on no shot.

Design (DECISION, from the take's frame at 72.9 s — OBSERVED: his shadow falls frame-left, so the key is camera-right; chest height, level): every prompt asks for a phone photo held at chest height, level, wide lens; the brightest light on the right of frame; empty centre foreground "where a person could stand two metres from the camera"; nobody in frame; no person's shadow; the recipe's imperfections; no taste adjectives.

| Location | promptVersion | Job row | Assets (1k png) | Reading (OBSERVED, from the contact sheet) |
|---|---|---|---|---|
| 79th & Lafayette, Red Line overpass, night (c041–c047) | `plate-real-v3-79th-lafayette` | `9792b682-3b8c-496c-a814-cd1d930f490e` | `adaee8ab-25a9-4999-aea6-e389fb2c2e06`, `7b269792-4b77-46a1-9832-8e8f1f07f120` | `adaee8ab` usable: station house with the 79TH band, expressway below the railing, empty sidewalk, storefront right; two tiny figures far down the sidewalk. `7b269792` is **two stacked panels** — do not use. |
| 79th & Lafayette, extra pair (the first pair had a panel picture) | `plate-real-v3-79th-lafayette` | `04621e9e-3b40-4d6b-a5b3-d29af690472f` | `50fa1ce3-ad07-41e3-8a67-6993f18f523c`, `b58cab47-b055-4bdd-846a-d288870de312` | both single pictures, nobody in frame, station house as a glass kiosk on the bridge sidewalk, storefront/streetlight right. |
| The cold front (c055–c066): the same South Side corner in a daytime lake-effect blizzard | `plate-real-v3-cold-front` | `c2aad105-e024-494e-8baf-aa642dc1b9ee` | `f5acf2da-0b89-4474-9f9a-5d2393b831a8`, `506c0667-1dea-498b-b9fc-fbb6aca9fea9` | both usable; `f5acf2da` has the lit corner-store window on the right (the key side); `506c0667` is lower and wider with drops on the lens. Nobody in frame. |
| The clean entrance (c085–c093): a glass office entrance on South Michigan Avenue, night | `plate-real-v3-clean-entrance` | `c6c313f9-7789-431a-bf81-7fcffd9eae10` | `1f700039-fc49-4f49-b34b-136e25d490f2`, `5c711d21-ab83-47ce-8e08-f37f5bb47c33` | both usable: glass doors, wet-floor sign and mop bucket inside, storefront light right, nobody in frame. |

DECISION (named real places where the spec had none): the blizzard is placed on the same 79th Street corner (the treatment's "cold front" follows the Chicago switch and the shots say "open street corner"); the clean entrance is placed on South Michigan Avenue in the Loop (the treatment says only "a nearby building"). Both are prompts, not data; change the words and re-run ($0.14 a pair) if Fendi wants another street.

Cost: 4 calls × $0.14 reported `actualCostUsd` = **$0.56** (ledger row 30). Cap $3.

Contact sheets (scratch, not committed): `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/plates/plates_sheet_v3.jpg` (first three pairs) and `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/plates/p79b_pair.jpg` (the extra 79th pair).

---

## B. Stills — DONE ($2.38)

### B.1 Which shots

Candidate-6 shots c019–c100 with no `is_primary` assignment (VERIFIED from the 394 assignment rows read at 04:58): everything except c022, c023, c025, c026, c028, c032, c034, c035, c037, c039 (carried from candidate 5) and c042 (the dressed alternate only, nothing selected).

Of those, **not drawn**, by rule:

- Performance shots c041, c043–c048, c055–c066 (`shot_type performance`): the take is their base layer (the plates above are for them).
- FENDI in the cast of an AI shot: c029, c030, c031, c033 (Fendi in the armchair), c049–c054 (ECUs of his mouth and grill), c085–c090, c092, c093 (Fendi walking into the entrance with the models). These wait for the performance/composite lane; nothing was generated for them.

**Drawn (34):** c019, c020, c021, c024, c027, c036 (the rider in the burning show); c038, c040 (the hand at the switch, the dark room); c067–c075 (the Maybach control room); c076–c084 (the Maybach on the sidewalk, the crew, the geese); c091 (models' legs and the janitor at the entrance); c094–c100 (the security monitors).

### B.2 How

The app's own image path, reproduced through the MCP: a write-ahead `provider_jobs` row per shot (`provider grok`, `status queued`, `mode still_only`, `shotId`, `settings {batchRun storyboard, batchShotId, route still_kling, kind world, estimateUsd 0, lookPreset none, stillPath null, selectStill false, promptVersion real-v1-2026-10-15}`), then `world-still-proxy` with `jobRowId`, n=1, 9:16, 1k, `maxCostUsd 0.1`. The tick then put each picture on its shot **unselected** (`selectStill false` → `assignPlan(select:false)`), set the row `succeeded` with `result_asset_id`, and left the panel check to the storyboard page.

Prompts follow `docs/recipes/PLATE_REALISM_PROMPT.md`: a real photo on a named real camera (phone; a handheld news camera for the burning show), a named real place, the camera as a fact, the imperfections a phone makes, mess, no taste adjectives, no on-screen text. DECISIONS in the words:

- Burning show: "a pine stand of the Shawnee National Forest, southern Illinois" (the spec names no place).
- Control room: "the rear passenger compartment of a black Mercedes-Maybach GLS SUV". The monitors show "a night street corner on Chicago's South Side with a small figure facing camera too small and blurred to make out" — Fendi is not drawn; the figure on the screens is a placeholder for the composite lane to replace. c072's spec says "daylight outside"; drawn as night for continuity with c076–c084.
- Maybach sidewalk: "79th Street … near the Red Line station"; the geese wear "miniature black Canada Goose parkas with the round red-and-white arm patch".
- The rider shots (c019, c020, c021, c024, c027, c036) were drawn with the approved rider picture `81992d35` as a `cast` reference (`references: [{source: project_asset, id, role: cast, label: "the rider"}]`, legend "<IMAGE_0> is the rider: the same person"), on the same model (`referenceModel grok-imagine-image-quality`, `usdPerInputImage 0`). c027 is monochrome (c025/c026 before it are already black and white).

### B.3 The 34 stills (VERIFIED: job rows `succeeded`, assets on their shots unselected)

| Shot | Song (s) | Still job row | Asset | Storage path (project-references …/worlds/) |
|---|---|---|---|---|
| c019 | 32.98–34.46 | `f37b7c33` | `7824adb1-b23e-4638-b6f8-00468102e317` | `storyboard_c019_mv92yck8_1.png` |
| c020 | 34.46–36.42 | `57bcbfbe` | `c3c73f99-dc8f-456f-88ee-e704e6d4b8a7` | `storyboard_c020_mv92yjp0_1.png` |
| c021 | 36.42–39.37 | `f249ddd1` | `81d0f9a7-c209-418d-ab50-c3997d79b0e0` | `storyboard_c021_mv92yqp5_1.png` |
| c024 | 42.33–43.80 | `fc9eee8f` | `9e3948a9-7fa0-4eba-867e-8931f68c2522` | `storyboard_c024_mv92yx49_1.png` |
| c027 | 46.75–48.23 | `e385ab76` | `8f7d023b-b70f-488e-bed7-a0c40c126e43` | `storyboard_c027_mv92z31x_1.png` |
| c036 | 62.49–63.96 | `66a2cada` | `ca925350-9b7f-4748-9b96-9d1f64232b88` | `storyboard_c036_mv92z8y4_1.png` |
| c038 | 65.93–67.90 | `d33c23e5` | `7d19c8a5-2960-45e7-8474-886e1adb8b9a` | `storyboard_c038_mv92zd67_1.png` |
| c040 | 70.85–72.33 | `4069a8c6` | `524892bc-47eb-438b-8dd2-8180775f69b4` | `storyboard_c040_mv92zh7k_1.png` |
| c067 | 122.00–123.97 | `f34aaba8` | `736c96d5-0698-48cf-ab97-d48e90f34e62` | `storyboard_c067_mv930ti6_1.png` |
| c068 | 123.97–126.92 | `089ca8ef` | `cf7a718d-e32e-43c0-90e6-b74dd5f393b9` | `storyboard_c068_mv930y6r_1.png` |
| c069 | 126.92–129.87 | `44c18b7b` | `0a0b31d4-da8d-4ddb-b886-7d089d5739a9` | `storyboard_c069_mv93131s_1.png` |
| c070 | 129.87–131.83 | `7099f816` | `5e74c7b9-c7c9-490f-b9b4-343a2898fcf3` | `storyboard_c070_mv9317rb_1.png` |
| c071 | 131.83–133.31 | `fce61616` | `7daf401a-a17d-409f-bd93-8a425c2c1c4a` | `storyboard_c071_mv931cve_1.png` |
| c072 | 133.31–134.79 | `9e59f388` | `12c15750-5c2d-4dd9-ba66-940a28e93005` | `storyboard_c072_mv931iao_1.png` |
| c073 | 134.79–136.26 | `84127369` | `032db466-4829-4ce1-a1e1-39aa1e572c5c` | `storyboard_c073_mv931myo_1.png` |
| c074 | 136.26–137.74 | `a704f9ea` | `8d63fada-1965-4728-b3cc-d63fbc77b8f2` | `storyboard_c074_mv931ra8_1.png` |
| c075 | 137.74–139.70 | `3106bcdd` | `cdad82d1-d1db-4d57-a540-b9e8770bdcc3` | `storyboard_c075_mv931wpb_1.png` |
| c076 | 139.70–143.15 | `26c4fe78` | `c7dcfa5e-2e70-4c6f-b0bd-640812ae9e4a` | `storyboard_c076_mv93376q_1.png` |
| c077 | 143.15–146.10 | `bcc65403` | `6ef7864d-20e5-4ca0-a5b8-8a5089b9c975` | `storyboard_c077_mv933b8c_1.png` |
| c078 | 146.10–149.05 | `9c13eb7b` | `6deac451-5eed-4a98-affd-115cb56e6cae` | `storyboard_c078_mv933fg4_1.png` |
| c079 | 149.05–151.51 | `6332c6f3` | `e3bf4a4d-af44-4ab0-9c3b-f20fc2fe1d09` | `storyboard_c079_mv933kby_1.png` |
| c080 | 151.51–154.95 | `f6e149cb` | `c606c3e0-15c6-4ae9-a343-8d4b79122251` | `storyboard_c080_mv933o1u_1.png` |
| c081 | 154.95–156.92 | `5f3a5d8c` | `4a49983f-9f32-44b0-b23d-8e2bf8c8f5ec` | `storyboard_c081_mv933sq5_1.png` |
| c082 | 156.92–158.88 | `3aa35bac` | `b5cd2bb6-0423-4440-80f8-398f73e70164` | `storyboard_c082_mv933xcz_1.png` |
| c083 | 158.88–160.85 | `be1d7f8b` | `b8097aa4-19b4-452d-800d-2760ff0f156f` | `storyboard_c083_mv93429y_1.png` |
| c084 | 160.85–163.80 | `e42ffe42` | `50e78e35-4b9f-42f9-8632-49b9c8895d57` | `storyboard_c084_mv9346ss_1.png` |
| c091 | 176.59–178.07 | `eb539d70` | `6aa7ed01-df9e-4963-b150-2752be38d841` | `storyboard_c091_mv9356vr_1.png` |
| c094 | 182.00–183.97 | `97501683` | `e7623612-5f0f-4ecb-ac65-6c0ded89b3ab` | `storyboard_c094_mv935ca1_1.png` |
| c095 | 183.97–186.92 | `4fda7ede` | `b529a452-8f2d-439e-b059-a5137513ee5a` | `storyboard_c095_mv935gjx_1.png` |
| c096 | 186.92–189.87 | `22736c53` | `59698973-c71f-49b3-bfc4-69583921ed61` | `storyboard_c096_mv935ljo_1.png` |
| c097 | 189.87–192.82 | `39abb4c3` | `9db4a920-5742-48d4-a761-7cbba55ec0b9` | `storyboard_c097_mv935pov_1.png` |
| c098 | 192.82–195.77 | `5ffbf785` | `24f5e286-aeec-4d72-9561-1f9683e4af0c` | `storyboard_c098_mv935tsk_1.png` |
| c099 | 195.77–198.72 | `f2a6cf18` | `1954d302-4735-48cb-94a7-0bd86c28af69` | `storyboard_c099_mv935y8j_1.png` |
| c100 | 198.72–201.87 | `4f9de923` | `6f60916f-cdd4-45e9-aedd-38948dc5e48d` | `storyboard_c100_mv9362lb_1.png` |

OBSERVED on the contact sheet: no stacked panels, no on-screen text, nobody who could be read as Fendi. c020 crops the rider at the shoulders (the spec is a low angle on the boot). The rider's face is consistent across the six burning-show stills and the five monitor stills.

Cost: 34 × $0.07 reported `actualCostUsd` = **$2.38** (ledger row 31). Cap $12.

Contact sheet (scratch): `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/stills/stills_sheet_real_v1.jpg` (6 × 6 tiles, labelled with shot key and song time); half-size previews `…/stills/sheet_top.jpg`, `…/stills/sheet_bottom.jpg`.

---

## C. Clips — SUBMITTED for all 34 ($11.90 list)

### C.1 Route

`src/lib/storyboard/generate.ts generateBoxClip` → `worldBatch/runner.ts submitShot` → `requests.ts buildMotionRequest`: for `still_kling` with a still, endpoint `video-providers-higgsfield-model`, body `{promptText, mode: "image_to_video", modelVariant: "kling-2.5-turbo-pro-i2v", duration: 5, referenceImageUrl: <signed still>, avt_user_id, avt_project_id}`, through `proxy-provider-call`. `billedSeconds` snaps to 5 for anything up to 5 s, so 5 s is the route's shortest option; the cut uses the in-point.

Reproduced exactly, in the runner's order: (1) write-ahead `provider_jobs` row (`provider higgsfield`, `status queued`, `request_payload_json {promptText, mode image_to_video, modelVariant, duration 5, aspectRatio 9:16, referenceImagePath, shotId, settings {batchRun storyboard, batchShotId, route still_kling, kind world, estimateUsd 0.35, lookPreset none, stillPath, stillCandidates, stillCostUsd 0.07, sourceWindow null, masterStart null, promptVersion real-v1-2026-10-15}}`); (2) `proxy-provider-call`; (3) `avt_update` of the row with `external_job_id` = the provider's `providerJobId`, `status`, and the envelope as `response_payload_json`. Every submit answered `ok: true, status: queued, costEstimateCents: 35, modelPath /kling-video/v2.5-turbo/pro/image-to-video`.

DECISION: the motion prompts are the shot's motion sentence alone (what moves, camera as a fact, "natural real motion, no added effects, no text"); the look preset's film suffix ("24fps film grain. Cinematic, gritty…") was not appended, in keeping with the realism recipe. `lookPreset` is recorded as `none` the way the dress jobs record it; note that `resolveLookPreset("none")` in the app falls back to `film_bar_v1`, so a clip the app itself submits for these shots would carry that suffix.

Timing constraint met: `_shared/jobProgress.ts UNREPORTED_AFTER_MS` fails a queued row with no `external_job_id` after 10 minutes. The 34 rows were inserted at 05:26:30; the last `external_job_id` was written at 05:36:01 (VERIFIED from `updated_at`).

### C.2 What the tick does with a finished clip (from `supabase/functions/_shared/jobProgress.ts`)

`advanceJob`: provider status via CC `video-providers-job-status` → `saveClip` (CC `job-result` → `project-clips`, `project_assets` row, `result_asset_id`) → `assignPlan({ role: "generated_clip", select: !dressed })`. `select` is **true** for a `still_kling` clip: `assignPlan` sets `is_primary: false` on any other primary assignment of the shot and inserts the clip as `is_primary: true`. There is no "only when nothing is selected" guard in the code; the guard is the choice of shots — every shot in §B had nothing selected, so the clip becomes the selection and nothing the director chose is replaced. The unselected still from §B stays as an alternate (`is_primary: false`).

### C.3 Observed filing (VERIFIED at 05:36, first ten)

c019 → `c1fa5825-7a29-4918-acbf-c0ffa802b32c`, c020 → `944c906d-49a4-47c2-8cab-75e0aa3dace2`, c021 → `59d15b91-973f-4a34-be59-282c2fb64baf`, c036 → `579127ed-2f96-431e-a695-bad8cbd96341`, c038 → `0e861479-ecb3-4c63-a277-dca1a1b849c5`, c068 → `04ba7f24-b7eb-4e97-8e89-b755d4e0eccf`, c069 → `ac1797dd-a19d-4f21-be8a-2d92cface439`, c070 → `8c9399de-fe79-4290-8090-ed76df0c17bc`, c071 → `a8fe4d16-e68f-4a4c-800d-1c277bdefe92`, c073 → `f2b9a01d-f66f-4f35-9f63-1059d2b1b924`: each job `succeeded`, `finalized_at` set, `progress_note` null, and a `shot_asset_assignments` row `role generated_clip, is_primary true, sort_order 2` beside the still (`is_primary false, sort_order 1`).

### C.4 The 34 clip jobs

VERIFIED 05:41 UTC: all 34 rows `succeeded`, `finalized_at` set, `progress_note` null, `result_asset_id` set; every clip downloaded and probed as 1080×1920, 24 fps, 5.042 s (ffprobe). Clip storage path: `project-clips/<user>/<project>/<job row id>/generated_higgsfield_<first 12 of the request id>.mp4`.

| Shot | Song (s) | Clip job row | Higgsfield request | Clip asset (project-clips) |
|---|---|---|---|---|
| c019 | 32.98–34.46 | `dde5326a` | `70428299-fbd8-4af2-a1c8-9aad8d658bda` | `c1fa5825-7a29-4918-acbf-c0ffa802b32c` |
| c020 | 34.46–36.42 | `f5eae0b4` | `cbaa04f5-7606-4e1f-b0ed-b68277ef62e3` | `944c906d-49a4-47c2-8cab-75e0aa3dace2` |
| c021 | 36.42–39.37 | `18a3d708` | `cf2670d1-a9d1-4316-93ad-f221487c716b` | `59d15b91-973f-4a34-be59-282c2fb64baf` |
| c024 | 42.33–43.80 | `731726b4` | `0a1fc8f5-16c0-4bad-b06d-b8f9ab06852a` | `5adb6342-212e-48d6-82f7-fcf59a46926f` |
| c027 | 46.75–48.23 | `75891d4f` | `d4bd0d5a-3e1e-4028-be2b-ab0a687602e7` | `408179f3-58ab-402d-aa60-0e1e7c72fee3` |
| c036 | 62.49–63.96 | `93cb0fd2` | `6e27803f-1f6a-42d3-980f-f52a59a4327d` | `579127ed-2f96-431e-a695-bad8cbd96341` |
| c038 | 65.93–67.90 | `8a526287` | `f2185fbb-b171-4f22-b69e-fe959b091aa0` | `0e861479-ecb3-4c63-a277-dca1a1b849c5` |
| c040 | 70.85–72.33 | `840c8d6c` | `66c9b1be-7242-412b-9ae5-22944f8d2ec8` | `d19a54a9-b15a-4bff-bc08-7a0c77b08fed` |
| c067 | 122.00–123.97 | `47e69846` | `ac9c2cb6-d9d8-4757-97fc-6885f3c5cbec` | `bc9b3de5-bc2e-4e7b-9614-a8a826ecf00e` |
| c068 | 123.97–126.92 | `e38dcb23` | `38b87929-492e-4bcd-8e49-b3607fc0f2e0` | `04ba7f24-b7eb-4e97-8e89-b755d4e0eccf` |
| c069 | 126.92–129.87 | `f110e99e` | `5216d7fd-7db6-4ae1-b5d0-1b52b4f5451a` | `ac1797dd-a19d-4f21-be8a-2d92cface439` |
| c070 | 129.87–131.83 | `7c0e5071` | `363be74d-f91c-453c-9ced-39aee505744c` | `8c9399de-fe79-4290-8090-ed76df0c17bc` |
| c071 | 131.83–133.31 | `81ec091a` | `5f709650-365c-4d9d-ad0c-0916add1d4da` | `a8fe4d16-e68f-4a4c-800d-1c277bdefe92` |
| c072 | 133.31–134.79 | `5a06cea0` | `f3105c9d-b665-4a3f-96a3-2b372da62625` | `dd59bf9f-f2bc-4689-bf4c-82275da22c54` |
| c073 | 134.79–136.26 | `b51fff4f` | `1e45ce89-84d4-44c4-b8af-93068743639f` | `f2b9a01d-f66f-4f35-9f63-1059d2b1b924` |
| c074 | 136.26–137.74 | `8687612f` | `a076c8d7-3905-4a01-953a-3a837fc7eac6` | `c4d8aeb7-c24a-413d-ac8e-e8a17d7a7830` |
| c075 | 137.74–139.70 | `714b94ca` | `4d9ca310-ae62-4bd3-8f97-f3c4980b3763` | `2aa4d581-3caf-4acb-949d-c55e8a2cdfde` |
| c076 | 139.70–143.15 | `29af3ea9` | `f6823352-a991-4aa6-93ba-b19ab435c664` | `9a612fc4-bdd2-4740-9e0a-3d3d901d9325` |
| c077 | 143.15–146.10 | `10206f86` | `5572afe2-9055-47ae-a72a-3d5fe5cfdda5` | `a7775483-aa5d-481a-942d-508aa0762f7e` |
| c078 | 146.10–149.05 | `6cd32b2b` | `c080c47b-722a-4b1b-b1a3-9385e854c8fd` | `f0994d6b-6ff9-4e52-8cdc-b1e46b8c1e3f` |
| c079 | 149.05–151.51 | `390ea181` | `1df8b0b7-842a-4770-9e14-ec5c0cb04adb` | `aabaa27c-9e02-4964-8b52-0b6e13d2e00b` |
| c080 | 151.51–154.95 | `1e27f113` | `24397653-9c3a-4ea7-94da-f073eab3abad` | `e626c4d5-2e74-4276-8ff5-3dfe19e46b9d` |
| c081 | 154.95–156.92 | `414c30d8` | `de4be768-c152-4532-8937-fa946836029a` | `853f487b-3fe1-4cd8-9d3f-a6cc6ad8540c` |
| c082 | 156.92–158.88 | `c48d2618` | `40c58ea7-2132-495b-982f-704fb3168ee4` | `8d3954a8-5946-4b24-8aee-3f24da78f89f` |
| c083 | 158.88–160.85 | `25a4bde1` | `ea2ae533-8f4c-423b-b690-9b40894d13a8` | `9a0d4f87-1f0b-4571-ac99-eecd899fbaa9` |
| c084 | 160.85–163.80 | `f35e17a7` | `e1467fb5-98ee-44ba-8d7c-4ca7b14f84a9` | `476c9534-e389-42c8-8885-3360fc1cbbf9` |
| c091 | 176.59–178.07 | `1337887e` | `cbbc4bef-2392-4fe1-b716-c0e31bb0b04d` | `6473e6d7-3a81-4f95-bc95-87cf4831ad80` |
| c094 | 182.00–183.97 | `6bb9f0d9` | `8b0b09f5-b05b-4f0c-a480-861a1f76f1c5` | `629cd4ae-1e28-49ac-9aef-05cd213c31b9` |
| c095 | 183.97–186.92 | `7836dfd9` | `4ffb05c9-77f8-461b-90ad-acb6fa36ffde` | `f59e5b03-5814-4312-8b15-34742353496f` |
| c096 | 186.92–189.87 | `31baf471` | `cc59594b-3dae-42d6-bd23-b2582f6dae2c` | `d493ddf8-1f4f-4629-ba0c-8bfbe232c5e4` |
| c097 | 189.87–192.82 | `69ef363b` | `36812e6c-cd71-4a29-abf0-d7dc81a5f612` | `5c3caf88-0b51-4356-9ec0-fe5af8c22d70` |
| c098 | 192.82–195.77 | `188daa33` | `b5e6736c-aad8-4a21-aa90-50e668102123` | `86dffa9d-71d8-42e8-a0f7-18bd878bd230` |
| c099 | 195.77–198.72 | `d8401dee` | `0e41eea2-36c8-4b44-8c7b-2469a134e731` | `e2770b0e-02b4-4d74-8532-7ad87f643b89` |
| c100 | 198.72–201.87 | `49f5b5e6` | `36020515-56d0-4353-8960-ec2bb4334b01` | `37e2cc88-13c4-427b-86ff-397ed8e5da3a` |

OBSERVED on the mid-frame contact sheet (`/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/clips/clips_sheet_midframes.jpg`, frames at 2.5 s): every clip holds its still's composition; the rider and horse walk; the monitors flicker; the control-room crew move. Weak ones to look at first: **c080** and **c081** — the goose in front of the operator turns into a crow-like black shape in motion; **c078/c079** — the geese read closer to penguins once they walk. The cut uses 1.5–3.5 s of each 5 s clip, so an in-point before the morph may be enough; otherwise re-run those four (≈ $1.40) or select the still.

Cost: 34 × $0.35 list (CC `costEstimateCents 35` per submit; `costFinalCents` null at submit) = **$11.90** (ledger row 32). Cap $30. HYPOTHESIS: the final charge equals the estimate; the invoice is the Higgsfield organisation balance, not readable from AVT.

---

## D. Dress the Chicago windows — PLANNED, NOT SUBMITTED ($0)

### D.1 Why it stopped

`dressSubmit.ts dressBox` uploads the cut with `uploadBytesToBucket("project-clips", …)` from the signed-in browser. The only server-side way in is `upload-asset`, which takes **raw bytes** in the request body with `X-Bucket` / `X-Path` headers under a user JWT. The AVT MCP's `avt_call` (`supabase/functions/avt-mcp/index.ts callFunction`) forwards a **JSON body only** (`JSON.stringify(body)`, `Content-Type: application/json`) and sets no custom headers; the user JWT it holds is never exposed. `ingest-provider-job` only pulls a provider job's result through CC; `fetch-reference-image` takes images only (jpeg/png/webp). So there is no route through the MCP that puts an mp4 cut into `project-clips`, and per the brief this task stopped rather than inventing one (a Higgsfield `media_upload` URL as `referenceVideoUrl` would run, but the dress record would carry no `sourcePath` and the cut would live outside the project).

**What is missing, exactly:** a raw-bytes upload path reachable without a browser — either (a) `avt_call` accepting a `{bucket, path, contentType, bytesBase64}` body for `upload-asset`, or (b) an MCP tool `avt_upload` that streams a local file to a bucket under the caller's user id, or (c) someone with the browser pressing **Dress this shot** on c041, c044, c045, c046, c047 (the in-app action does the whole chain).

### D.2 The plan, as the tool itself computes it (VERIFIED by running `planDress` from `src/lib/storyboard/dress.ts` under tsx with the live outfit pieces)

Take clock = song − 0.8538. Handles 0.5 / 0.75 minimum, grown to fill the billed seconds, 0.05 s guard. Outfit `cfcbb60d` YSL_JACKET v1 (candidate 6): pieces `0feb028f` jacket, `07e6dcbe` beige cap, `d7666d88` jeans, `991a79d4` sneakers, `18b648a5` glasses.

| Shot | Song | Take window (s) | Cut (s) | Head / tail | Billed | Cost | Song start of the cut |
|---|---|---|---|---|---|---|---|
| c041 | 72.33–73.80 | 70.3612–74.3112 | 3.95 | 1.115 / 1.365 | 4 s | $2.724 | 71.215 |
| c044 | 76.75–78.72 | 75.0312–78.9812 | 3.95 | 0.865 / 1.115 | 4 s | $2.724 | 75.885 |
| c045 | 78.72–80.69 | 77.0012–80.9512 | 3.95 | 0.865 / 1.115 | 4 s | $2.724 | 77.855 |
| c046 | 80.69–82.65 | 78.9662–82.9162 | 3.95 | 0.870 / 1.120 | 4 s | $2.724 | 79.820 |
| c047 | 82.65–86.10 | 81.1712–86.1212 | 4.95 | 0.625 / 0.875 | 5 s | $3.405 | 82.025 |

Total if all five run: **$14.30** (cap $15). Two adjacent 1.97 s shots cannot share one 4 s window once the minimum handles are added (3.94 + 1.25 = 5.19 s → 6 billed), so the tool plans one run per shot; c044+c045 in one 6 s run ($4.09) and c046+c047 in one 7 s run ($4.77) would be cheaper ($11.58 total) but would file one dressed take under one shot each — the second shot would need the take assigned by hand.

The five cuts are made and probed (ffmpeg from the take, H.264 yuv420p, 59.94 fps, no audio; `-ss/-to`): `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/dress_cuts/dress_c041_src.mp4` … `dress_c047_src.mp4` — 237 frames / 3.954 s for the four 4 s cuts, 297 frames / 4.955 s for c047 (VERIFIED by `ffprobe`). They show Fendi and are not committed.

### D.3 Finding: the tool's reference choice on candidate 6 differs from the approved run

`planDress` on the five-piece outfit sends **four product photos — jacket, cap, jeans, sneakers** — and leaves the glasses out ("the swap is given at most 4 pictures"); the cap's side and detail angles never get room. Its prompt reads "Replace ONLY the man's jacket, cap, ysl slim low-rise jeans and ysl lewis grained leather sneakers …" with the generic construction sentence for every piece (`dimensions_description` is null on all five). The approved run `71ff19f4` sent the jacket photo plus the cap's front, side and detail, and a hand-written prompt that names the stripe, zip, hem and wordmark. OBSERVED, not tested: a "Dress this shot" press on candidate 6 as the data stands would ask the swap to replace his jeans and (invisible) sneakers and would describe neither garment. RECOMMENDATION before anyone presses it: give the jacket and cap a `dimensions_description` (the approved prompt's sentences), and either drop jeans/sneakers from the scene's outfit or set them on the shot's own exception, so `dressReferences` sends jacket + cap angles as the approved look did.

---

## E. Spend (ledger rows 30–32)

| Row | What | Billed | Estimate |
|---|---|---|---|
| 30 | 4 plate pairs, Grok | $0.56 (`actualCostUsd`) | — |
| 31 | 34 stills, Grok (6 with a cast reference on the edits endpoint) | $2.38 (`actualCostUsd`; the 6 edits calls are the proxy's estimate) | — |
| 32 | 34 Kling 2.5 turbo 5 s clips via CC | — | $11.90 list |
| — | dress runs | $0 | — |

Phase 2 total: $2.94 billed + $11.90 estimated. Running ledger: ≈ $53.00 (no cap, by the director's order).

---

## F. Shots still empty on candidate 6 after this phase

- **Performance shots** (the take is their base; nothing filed for the composite yet): c041, c043, c044, c045, c046, c047 (Chicago; c042 has the dressed alternate), c048 (ECU, `shot_type performance`), c055–c066 (cold front).
- **FENDI in an AI shot, not drawn by rule:** c029, c030, c031, c033; c049–c054; c085–c090, c092, c093.
- **Earlier gap, unchanged:** c003, c006, c009, c011, c013, c015 (before c019, outside this phase's range).

---

## G. Not done, and what it needs

| Item | State | Needs |
|---|---|---|
| Dress c041, c044–c047 | cuts made, plan computed, nothing uploaded or submitted | a raw-bytes upload path (§D.1) or the in-app button; then the five `proxy-provider-call`s and row updates as in `dressBox` |
| Composite of the dressed c042/c043 over plate `adaee8ab` | not started (not in this phase) | Fendi's verdict on the 4 s composite test |
| Clip panel check / director's pick | 34 clips selected by the tick | Fendi reviews; anything rejected is swapped by selecting the still or re-running (≈ $0.42 a shot) |
| FENDI-cast AI shots | nothing generated | the composite lane (take + plate), or a decision to draw them without him |

---

## H. Scratch artefacts (session-local, not committed; the parent posts the sheets)

- `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/plates/plates_sheet_v3.jpg`
- `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/plates/p79b_pair.jpg`
- `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/stills/stills_sheet_real_v1.jpg`
- `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/clips/clips_sheet_midframes.jpg` (frames at 2.5 s of each finished clip; see §C.4)
- `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/dress_cuts/dress_c0{41,44,45,46,47}_src.mp4` (show Fendi — never commit)
- `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/dress_plan.json`, `still_rows.json`, `clip_rows.json`
