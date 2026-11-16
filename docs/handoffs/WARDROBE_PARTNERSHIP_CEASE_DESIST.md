# WARDROBE — "Partnership / Cease & Desist" (chosen by Fendi, 16 Nov 2026)

**Every agent on this video reads this page before planning a shot, a shooting note or a swap.** Fendi, 16 Nov:
"the wardrobe should definitely be recorded in a place that can't be overlooked or misplaced this is extremely
important."

Project `0c5c4421-1298-4919-bf62-2764ce7837fa` · board `c9b766a2-88c6-4613-8d50-917ae64e439d` · artist `8d4a4d22-41c0-43ab-ba99-92750f81e335`.

## Where it lives (three copies, kept in step)

| Copy | Where | What |
|---|---|---|
| AVT wardrobe (what the swap reads) | `character_features`, 8 rows below; photos in bucket `wardrobe-refs` under `<user>/<artist>/partnership_cease_desist/<piece>/` | main picture (`file_url`), every angle (`reference_images`, each with sha256), product link, construction in `dimensions_description` |
| AVT looks | `continuity_entities` `kind = outfit`, 2 rows below (`garment_feature_ids` in swap order) | which pieces are worn together and how |
| AVT project notes | `video_projects.wardrobe_notes` on the project | the same list in words, with every id |
| T7 | `/Volumes/T7/PARTNERSHIP:CEASE & DESIST AVT Edit/wardrobe/` | full-size maker photos, `source.txt` per piece (link, colour, price, how he wears it) |

VERIFIED 16 Nov 2026: all 29 photos were downloaded back from `wardrobe-refs` and match the T7 files byte for byte
(sha256). Upload log: `/Volumes/T7/PARTNERSHIP:CEASE & DESIST AVT Edit/work/wardrobe_upload_log.tsv`.

## Rules for this wardrobe (DECISION, Fendi)

- This video **has clothing swaps** on his performance takes. Method: [`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`](../recipes/FACE_PRESERVING_CLOTHING_SWAP.md)
  (skill `avt-clothing-swap`). His face from the brows down, beard, hands and mouth stay his real footage.
- **Nearly every shot is upper body.** If pants show: **dark jeans**.
- Button-ups are worn **fully buttoned to the top**.
- Swaps go on takes shot locked off, steady light, nothing passing behind him: the moving-scene flicker is unsolved
  (`docs/capability/GAPS.md` G1). Fendi knows this (16 Nov: "I know we haven't full been able to work out flicker with
  performance shots and other moving objects yet").

## The pieces

| # | Piece | Maker, colour | `character_features` id | Main picture |
|---|---|---|---|---|
| 01 | Polo Bears Sweater | Polo Ralph Lauren, Authentic Cream | `9ecdb02d-5be5-45c2-9a29-1baba708bbcd` | flat front |
| 02 | Re-Nylon baseball cap | Prada, Black | `e12ddd32-f8d5-4449-8af6-1b638117a979` | three-quarter front |
| 03 | Wool and cashmere beanie | Prada, Black | `7e075cdd-812b-4423-8931-d037bc1c93da` | front |
| 04 | Re-Nylon puffer jacket, hooded | Prada, Black | `336666fd-3d39-4992-97df-fec9c96cd573` | flat front (on grey) |
| 05 | Suede and shearling bomber jacket | Prada, Cord (tan) | `782db74d-df7b-4050-8dc9-445cb402aa8c` | flat front (on grey) |
| 06 | Cotton blend coat **with the yellow capelet** | Prada, Clay Grey | `d3b89147-6356-4203-844f-2f069e9bcfeb` | **front worn with the capelet** |
| 07 | Garment-Dyed Oxford Shirt, button-down collar | Polo Ralph Lauren, **Nature Brown** | `f85da987-0c62-40ca-9988-5e61b1400cd2` | flat front |
| 08 | Martini Bear Wool-Cashmere Beanie | Polo Ralph Lauren, Regal Carmine (red) | `81dbd93f-c55d-41ee-868b-c6d3038159be` | flat front |

Product links are in each row's `source_url` and each T7 `source.txt`.

## The looks

| Key (`continuity_entities`) | id | Pieces, in swap order | Fendi's words |
|---|---|---|---|
| `LOOK_A_POLO_BEARS` | `286f7066-9ee5-471d-ae1d-354e01994739` | 01 sweater, 07 shirt, 08 beanie | "the sweater ... with a dark button up underneath and I do my button ups fully buttoned"; "actually nature brown"; "we can do this hat with the sweater and shirt" |
| `LAST_SHOT_PRADA_COAT_YELLOW_CAPELET` | `2ab5704c-5ab3-482f-9c12-780b6619d1ff` | 06 coat | "this will be the jacket worn for the last shot if possible"; "I want to wear it exactly like the model with the yellow flap over" |

Pieces 02, 03, 04, 05 are chosen but **not yet grouped into looks**. Ask Fendi which go together before a swap with them.

## Traps already found (read before running a swap)

- **06 coat:** the maker's flat photo has **no capelet**. The swap's main picture is the worn photo with the capelet;
  never swap from the flat photo.
- **Look A collar:** the sweater's maker photos show a **white** shirt collar. Send 07 (brown) with 01 so the collar
  comes out brown.
- **07 shirt:** Ralph Lauren publishes only the flat front and a fabric close-up in Nature Brown. Worn photos of the
  same shirt in Classic Wine are on the T7 in `wardrobe/_not_chosen/` for fit and collar shape only; never as colour.
- The swap engine takes **at most 4 pictures**, one per piece, in `garment_feature_ids` order.

## Rejected (do not use)

- Garment-Dyed Oxford Shirt in **Classic Wine**: Fendi switched to Nature Brown. Not filed in AVT.

## Adding or changing a piece

Update all three copies in the same pass: the `character_features` row (or a new one, photos to `wardrobe-refs`),
the outfit row (bump `version`), `video_projects.wardrobe_notes`, the T7 folder's `source.txt`, and this page.
