# Looks by Scene — the director's outfit decisions for Interrupted Broadcast (candidate 5) · 9 Oct 2026

Fendi decides who wears what, where, on a private claude.ai page: https://claude.ai/artifact/Uvf3uuA1DsePRueMfd1z3q
(`looks_by_scene.html` here is that page's source, kept for the record; opened as a file it has no save path).

## Where the decisions live

| | |
|---|---|
| The page's own record (every tick, as he makes it) | artifact database, document `choices/current` — read it with the ArtifactData tool (`get`, collection `choices`, doc `current`) on the URL above. Shape: `{grid: {viewer|chicago|cold|entrance: {<character_features.id or new-*>: 1}}, notes, savedAt, variationId}` — **every ticked piece is exact** (Fendi, 9 Oct: "ALL of the pieces need to be exact, that's the purpose of the tool"). Older records may carry a `2`; read any non-zero value as exact. |
| AVT, what generation reads | `continuity_entities` kind=`outfit` on variation `882ec381-0fa0-4a76-b23b-b83ebc157372` (`garment_feature_ids` = the ★ pieces, in order; `description` = all worn pieces in words) and `variation_scenes.outfit_key` |

Scene columns ↔ AVT rows:

| column | variation_scenes ids | outfit key / entity |
|---|---|---|
| viewer | `327761de-ea68-4276-a77b-63ce3d37fb7a`, `e57f8cb6-8e95-4bd8-82bc-db3a16888403` | `YSL_DENIM_LOOK` / `57b10a61-b137-4f3b-bfaa-8743c4cd43aa` |
| chicago | `557e9d81-2a15-4965-a707-cef622b61322` | `YSL_LEATHER_COAT` / `0d18f174-bf33-406a-951b-fe1ae45a8a23` |
| cold | `09591369-1bea-42b1-a6eb-e029ddfcce73` | `YSL_JACKET` / `e12c51bf-9020-4902-afe0-bd05867a65db` |
| entrance | `aa3fa72c-dedc-4df3-8c72-17450c359d01` | `CLEAN_ENTRANCE_LOOK` — no row yet; insert when he ticks something |

## Mirroring the record into AVT (any agent with the AVT connector)

The page has a **Save to AVT** button that does this itself through the viewer's AVT connector — it is live only when the
page is published with the `mcp` capability (that publish needs Fendi's permission in the authoring session; until then
the button says AVT is not reachable). Mirroring by hand:

1. `ArtifactData get choices/current`. Every ticked piece that is `onFile` (a `character_features` id, not `new-*`) goes
   into `garment_feature_ids`, in row order (outerwear, top, bottom, hat, accessory, footwear). Nothing is demoted to words.
2. The plain still route carries 3 photos (face + screen take slots): a scene with more exact pieces than it can send
   BLOCKS that route (planner: required-reference overflow is blocking) and needs a multi-picture method. Never trim
   the list to fit; report the count and the method question to Fendi.
3. `avt_update continuity_entities` by id with `garment_feature_ids` and `description` ("Worn: …; …") — the trigger bumps
   `version`; `avt_update variation_scenes` by id with `outfit_key`. For `entrance`, `avt_insert` the outfit row first
   (`kind: outfit, key: CLEAN_ENTRANCE_LOOK, version: 1, constraints: "", reference_asset_ids: []`).
4. `new-coat`, `new-cap-*` are not Wardrobe rows yet (coat → Outerwear, caps → Accessory; photos in this folder's sibling
   files were sent to Fendi on 7 Oct). They go in the description as words until uploaded; a scene that marks them ★ is blocked by the page.

Nothing here spends. Verify after a mirror: `avt_select continuity_entities` kind=outfit on the variation shows the new
`version` and ids; `avt_select variation_scenes` shows the keys.
