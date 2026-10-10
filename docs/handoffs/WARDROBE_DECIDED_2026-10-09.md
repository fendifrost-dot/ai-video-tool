# Handoff → the agent assembling Interrupted Broadcast's looks · the wardrobe is decided · 9 Oct 2026

Fendi decided the wardrobe for Interrupted Broadcast (candidate 5, variation `882ec381-0fa0-4a76-b23b-b83ebc157372`)
on 9 Oct ~01:45 UTC. This file says where the decision is and what to do with it. Nothing here spends.

## Where to look (in this order)

| what | where | note |
|---|---|---|
| **The decision, machine-readable** | `docs/handoffs/ib_looks_by_scene/decisions.json` (this repo, main) | 17 pieces with `character_features` ids, `exact: true` on every one, per-piece notes, the six rules |
| The rules and the AVT mapping, for humans and agents | `docs/handoffs/ib_looks_by_scene/README.md` | outfit keys / entity ids / scene ids on candidate 5; the picture-cap rule (block the route, never trim the pieces) |
| The page Fendi sees | https://claude.ai/artifact/Uvf3uuA1DsePRueMfd1z3q (private, his) — source: `docs/handoffs/ib_looks_by_scene/looks_by_scene.html` | states the same decision; nothing to click |
| The same record, live | the page's artifact database, collection `choices`, document `current` (ArtifactData `get` on that URL) | identical to `decisions.json`; if they ever differ, the newer `decidedAt` wins and say so |
| **Photos of the 4 pieces not yet in the Wardrobe** | `docs/handoffs/ib_looks_by_scene/uploads/` — `coat_front.jpg`, `coat_back.jpg`, `cap_cassandre_khaki_{front,side}.jpg`, `cap_y_varsity_black_{front,3q}.jpg`, `cap_saintlaurent_beige_{front,side}.jpg` | cropped from Fendi's screenshots, 7 Oct |

## The decision, in Fendi's words (9 Oct)

"include all of the pictures as pieces for the video prioritizing jackets and hats … check everything because these
are all pieces that need to be included. The shirt will not be used for the first half of the video … include in the
second half. Under the mastic jacket and bubble [coat] formal wear button up ties and include a hat with each look.
Under the jackets a t shirt is fine. Let's not over complicate this. And if I don't like a look I'll tell the agent."

## What to do

1. **Add the four missing Wardrobe rows** on artist `8d4a4d22-41c0-43ab-ba99-92750f81e335` from `uploads/`: the coat
   as `wardrobe_outerwear` ("Coat in Bubbled Lambskin — Noir", front first, back as a second angle); each cap as
   `wardrobe_accessory` (front first). Use the app's Wardrobe upload (or the upload edge function `avt_functions`
   lists) — a row needs its file in `wardrobe-refs` under `<uid>/<artistId>/…`; a row pointing elsewhere is refused by
   the still proxy. Expected after: `avt_select character_features` for the artist with `feature_type like
   'wardrobe_%'` returns **21** rows (17 today + 4).
2. **Assemble the looks** per scene from all 17 pieces under the rules in the README (jackets and hats first; a hat in
   every look; button-up + tie under the Mastic jacket and the coat; t-shirt under the other jackets; confetti shirt
   second half only). Write them as outfits (`continuity_entities` kind=outfit, `garment_feature_ids` = every Wardrobe
   piece the look wears, `description` = the generic underlayer in words) and point `variation_scenes.outfit_key` at
   them. The existing `YSL_DENIM_LOOK`, `YSL_LEATHER_COAT`, `YSL_JACKET` are yours to revise; create one for the
   clean entrance.
3. **Picture cap** (superseded 10 Oct 2026 by PR #222 — up to 5 photos once the larger edit model is deployed; see `docs/reviews/PR222_CLASS_C_REVIEWS_2026-10-10.md`): a look with more exact pieces than the plain still route carries (3 photos incl. his face; the CRT
   takes one more in the viewer) blocks that route — the planner reports it as blocking (PR #190). Choose a
   multi-picture method for that shot; never drop a piece to fit.
4. Show Fendi the looks (a contact sheet or the shot cards). He corrects by telling you. Record what he says in
   `decisions.json` (append under `corrections`) and commit.

## Do not

- Do not describe a Wardrobe piece in words instead of sending its photo. Every piece is exact.
- Do not call the coat or caps "no picture": the photos are in `uploads/`; they only lack Wardrobe rows.
- Do not spend on generation beyond what Fendi has authorised to you directly; this handoff authorises none.

## Report back

The 21-row count; the outfit keys with their `version` and piece counts; which scenes point at which; anything the
rules left undecided, as one short list.
