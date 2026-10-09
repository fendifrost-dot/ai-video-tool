# The wardrobe, decided — Interrupted Broadcast (candidate 5) · Fendi, 9 Oct 2026 ~01:45 UTC

Fendi's decision, in his words (9 Oct): "include all of the pictures as pieces for the video prioritizing jackets and
hats … check everything because these are all pieces that need to be included. The shirt will not be used for the
first half of the video … include in the second half. Under the mastic jacket and bubble [coat] formal wear button up
ties and include a hat with each look. Under the jackets a t shirt is fine. Let's not over complicate this. And if I
don't like a look I'll tell the agent."

The grid is gone. `decisions.json` is the record (also written to the page's artifact db, `choices/current`, same
content); `looks_by_scene.html` is the page that states it (https://claude.ai/artifact/Uvf3uuA1DsePRueMfd1z3q).

## Rules for the agent assembling looks

1. **All 17 pieces are in the video, all exact** — every one is a reference picture, never "described".
2. **Jackets and hats first.** Every look has a hat.
3. Under the **Mastic track jacket** (`0feb028f-dc4d-45dc-82ac-e4bbd16054b0`) and the **bubbled lambskin coat**
   (not yet a Wardrobe row): formal — a button-up shirt and tie, generic, in words.
4. Under the **other jackets** (trucker `f6455042-…`, cotton jacket `0eba994e-…`): a t-shirt, generic, in words.
5. The **confetti viscose shirt** (`b06dfb03-…`): second half of the video only.
6. The agent assembles the per-scene looks from these; Fendi corrects a look he does not like by telling the agent.

## What this means in AVT

- Outfits (`continuity_entities` kind=outfit on variation `882ec381-…`): `garment_feature_ids` carry every Wardrobe piece
  the look wears; `description` carries the generic underlayer ("button-up and tie" / "t-shirt") and the hat if it is not
  yet a row. Scenes (`variation_scenes.outfit_key`) point at them. The three existing outfits (`YSL_DENIM_LOOK`,
  `YSL_LEATHER_COAT`, `YSL_JACKET`) are the agent's to revise under these rules; `CLEAN_ENTRANCE_LOOK` is still to create.
- A look with more exact pieces than the plain still route carries (3 photos incl. face, 1 more taken by the CRT in
  the viewer) **blocks that route** (planner: required-reference overflow is blocking) and needs a multi-picture method.
  Never trim the pieces to fit; the method is the thing to change.
- Four pieces are in Fendi's pictures but not in the Wardrobe: the lambskin coat and the Cassandre khaki, Y Varsity
  black/ivory and Saint Laurent beige/ivory caps. They are included and exact like the rest; the generator can only
  send a Wardrobe row, so add them (coat → Outerwear, each cap → Accessory; the crops sent to Fendi on 7 Oct are the
  files) before drawing a shot that wears them. Until then such a shot is blocked, by design.

Nothing here spends.
