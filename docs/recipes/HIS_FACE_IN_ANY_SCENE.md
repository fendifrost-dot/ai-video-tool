# His face in any scene: the face-safe pipeline (canonical, 12 Nov 2026)

**One page for the function we use on every video: change what Fendi wears and put him in any environment, with his
real face.** It joins the methods he approved one by one (c033 18 Oct, c041 4 Nov, c009 5 Nov, the Frost cover 7 Nov)
into one order of operations. The detail and the evidence stay in [`FACE_PRESERVING_CLOTHING_SWAP.md`](FACE_PRESERVING_CLOTHING_SWAP.md)
and [`BROLL_WITH_HIM_STILL_MOUTH.md`](BROLL_WITH_HIM_STILL_MOUTH.md); where they differ from this page, this page is newer.

## The one principle

**His face always comes from HIS sources, never from a generated picture of him.**
- **Where real footage of him exists for the shot** (a performance take, real b-roll), his face is his own pixels: the clothes are generated (Genjutsu) and the face, mouth, beard, glasses and hands are put back from the original frames (`max |out-original| on face/hair/skin: 0`); he is cut out and placed into the generated place, graded and scaled, never redrawn.
- **Where he does something he never filmed** (sitting in a car, walking through a place), generate it: recipe F builds his face from his face photographs in the tool plus a window of his real footage. That is a likeness, and it is the route he approved "PERFECT!" on c026 (seated on the rail), c033 (at the kitchen island) and c039 (at the pillar), 6 Nov. Missing footage is never a reason to refuse a shot.
- **The put-back keeps the face of the clip it runs on.** On his real take: his pixels. On a generated render: the render's face. It never pastes his real face onto a pose he did not film.
- **Never:** a generated still of him (any model) as the face source for a video, or text-to-video of him (Hyenas, 12 Nov: "the outfit looked pretty consistent but the person was clearly not me in the face").

## Step 0 — the shoot (what makes every other step work)

For every look in the video, before any generation:

| Shoot | Why |
|---|---|
| The performance takes, synced to the song | the only footage that may show his mouth moving |
| **30–60 s of silent b-roll in the same outfit**: standing, walking, sitting, leaning; face to camera and three-quarter; face large in frame; mouth closed | the more of it there is, the more shots use his real pixels (E1) and the better the recipe-F likeness. It helps; it is not required: without it, recipe F still runs from his face photos and any non-rapping window |
| Each angle the scenes will need (profile for a profile scene) | the scene's angle is his take's angle (SHOT_RULES 6); a frontal take never becomes a profile |
| Constant light on him, camera locked or slow, nothing crossing behind him, a plain background where possible | clean mattes and a clean put-back (skill §3, motion budget) |

Upload each take to the project with `avt_upload_asset` and file it as `footage_role` `performance` or `b_roll`.

## Step A — change the clothes (only if the outfit changes)

| # | Do | Exact |
|---|---|---|
| A1 | Cut the window from his real take (4 s or more) and put it on the shot | `project_assets.shot_id` set; `dress-clip` refuses `clip_not_on_a_shot` and `clip_too_short` |
| A2 | Dress it (the one paid step, ~$0.68 per source second) | `avt_call dress-clip {projectId, assetId: <window>, pieceIds: [jacket, hat, trousers], dryRun: true}` then `false`. **Leave the glasses piece out.** The result is filed unselected: that is `swap.mp4` |
| A3 | Download `original.mp4` (the window) and `swap.mp4` (the filed, conformed result, never the raw provider file) | owner sign-in, never a pasted link |
| A4 | Put his face back | `AVT_MODELS=<models> AVT_HEAD_ZOOM=4 python -I scripts/edit/body_only_swap.py original.mp4 swap.mp4 <out>` |
| A5 | Read the proof | `max \|out-original\| on face/hair/skin: 0`. **Anything else is a failed run, never a result** |
| A6 | Check the seam and the hat | `python -I scripts/edit/ring_flicker.py original.mp4 <out>/c033_body_only_swap.mp4 <a-b>` (compare with the original's own number); `python -I scripts/edit/hat_geometry.py <out>/c033_body_only_swap.mp4 <a-b>` when the hat changed (approved range 0.03–0.14) |

He is small in a wide 4K frame → lane B (crop, dress the crop, `paste_region_swap.py`, put back, `dressed_4k.py`):
[`FACE_PRESERVING_CLOTHING_SWAP.md`](FACE_PRESERVING_CLOTHING_SWAP.md), "Lane B".

The output of step A is **his dressed take**: his face, his mouth, his timing, the new clothes.

## Step B — put him in the place

**B1. Make the place** (no him in it, no people where he stands):
1. A Gemini still: `avt_call world-still-proxy {model: "gemini-nano-banana-2.1", n: 1, aspectRatio: "9:16", resolution: "2k", prompt, references, dryRun}` (`PLATE_REALISM_PROMPT.md`). Inspect it: nothing in it that the shot excludes.
2. Animate it **calm**: Seedance continuous take without him (`montage-shot` with `continuous: {withHim: false, camera, action, seconds}`), or the storyboard's Animate the plate. Snow, steam, a sign, a far city; nothing that crosses where he will stand, no light sweeping across him.

**B2. Put him in.** Pick by what the shot needs:

| Method | When | Exact | Face | Approved on |
|---|---|---|---|---|
| **E1 Place over the moving plate** (the default) | he stands or sits in a place; his take has the angle the scene needs | `python -I scripts/edit/place_him_over_plate.py dressed.mp4 plate.mp4 out.mp4 --plate-offset S --seconds S --scale S --x X --y Y --couch-y Y --gain r,g,b --contrast C`. RobustVideoMatting cuts him out; he follows the plate's own camera drift; everything below `--couch-y` is hidden behind a foreground object; gain/contrast grade him into the room | his pixels | **c009 v3** `b06b32f9` (5 Nov, "I like it") |
| E1' Composite with a provider matte | the app's composite recipe, offline | `matte-video-proxy` on the dressed take → `python -I scripts/edit/composite_over_plate.py fg.mp4 alpha.mp4 plate.mp4 out.mp4 --scale --cx --plate-start --exposure --push` | his pixels | c033 showroom `8a527bab` (18 Oct, working baseline) |
| **E2 Blender placement** | a room that must not be AI-animated; he must stand behind real objects at a measured distance | `scripts/edit/blender/` (`showroom_c033.json`), `scripts/edit/reproduce_c033_showroom_blender.sh`. Blender 5.3.0 (installed by the AVT cloud environment's setup script) or 4.5; 5.3 matches the approved 4.5 room at 45 dB, not bit for bit | his pixels | c033 room v5 (19 Oct, working baseline) |
| **E3 His real take into a generated montage** | the montage has the scene's action and a generated him in it; Fendi wants his real take there | matte the montage and the dressed take, then `python -I scripts/edit/replace_him_in_clip.py clip.mp4 clip_alpha.mp4 take.mp4 take_alpha.mp4 segments.json out.mp4`; the cutaways stay the montage's | his pixels | c044 v6 `a563f683` (23–24 Oct, his pick, in his own black outfit). **Dressed + E3 failed four times at the hat** ("Terrible still. Just leave the black outfit entirely", 24 Oct): with E3, prefer his own outfit, or shoot the outfit |
| **E4 Recipe F, then step A** | a b-roll action he never filmed (walking through the place, sitting in the car): **the normal route for those shots** | `montage-shot` with `reference.assetId` = a non-rapping window of his real footage **in the same outfit** (cut from the 4K original, waist-up; no minimum face size), `sync: "loose"`, `motion: "calm"`, his face pictures as `@Image2…`, "his mouth at rest, his face toward the camera" in the line he is in; then step A on the render if the outfit changes | a likeness from his photos + window (judged by face_check and Fendi) | c041 TENTH `6f4edd50` (4 Nov); c026 `081a4ddf`, c033 `20b8c185`, c039 `d90d6f29` (6 Nov, "PERFECT!") |

Choose: real footage of the action exists → E1 (or E2/E3). It does not → E4. The post names the method used. **Never:** animate a generated still of him; text-to-video of him; lip-sync; a whole-frame
Dress output as the final picture.

**Stills** (covers, posters, thumbnails): his photo dressed in Gemini (`world-still-proxy`), then
`python -I scripts/edit/still_face_putback.py original.jpg edit.png out.png $AVT_MODELS` (proof 0), then
`compose_cover_from_still.py out.png plate.png cx cy height_px cover.jpg`, then
`cover_regrade_figure.py cover.jpg final.jpg --stops --lift --tint --grain` to match his light and the plate's grain.
Approved: Frost cover v12 `5b825de7` (7 Nov, "Ok I like lift b g2").

## Step C — check, post, file

Before Fendi sees it ($0, every time):
1. The proof from A5 (when step A ran): 0.
2. `scripts/edit/face_check.py` sheet: his face against his face pictures, row by row.
3. `scripts/edit/mouth_scan.py out.mp4 out.csv 12`: in b-roll his mouth is at rest (mean ≤ 0.08, spread ≤ 0.03).
4. [`SHOT_RULES.md`](../SHOT_RULES.md) 1–7, said in the post: a moving place (3), never in front of other people (4),
   his light, colour and grain match the place (5), the place's angle and scale (6), waist up, never centre-front (7).
5. Post the clip with the sheet. Fendi judges. File on his word ([`MCP_UPLOAD_AND_FILE.md`](MCP_UPLOAD_AND_FILE.md)),
   with the method, the source take, the swap job, the script commit and the proof in `metadata_json.derived_from`.

## Where it breaks today (so nobody pretends it does not)

- **A light that changes on him, or anything crossing behind him** (a train, headlights): the swap smears and the seam
  flickers. Keep it out of the frame he is in (skill §3); it is gap G1 in [`../capability/GAPS.md`](../capability/GAPS.md).
- **No real footage of him doing the action:** E4 gives a likeness from his photos, the route he approved. If Fendi rejects a render's face, re-roll with another window or staging; shooting more b-roll is the long-term upgrade, not a precondition.
- **Not in the app:** the put-back (A4) and the placement (B2) run as offline scripts; the app's Dress files the
  whole-frame swap. Until the integration is built, an agent runs A4–B2 by hand on every shot.

## Approved examples (the references to match)

| Shot | Method | Asset | His words |
|---|---|---|---|
| c033 | A (canonical put-back) | `5482b35b` | 18 Oct: "make it the canonical reference for preserving my real facial performance during clothing swaps" |
| c041 | E4 + A | `6f4edd50` | 4 Nov: "C041 can pass … we can keep it" |
| c009 | A + E1 | `b06b32f9` | 5 Nov: "I like it" |
| c044 (later re-shot without him) | E3, his own outfit | `a563f683` | 24 Oct: "Just leave the black outfit entirely" (v6 stayed the pick) |
| c026, c033, c039 | E4 (recipe F), actions he never filmed | `081a4ddf`, `20b8c185`, `d90d6f29` | 6 Nov: "PERFECT!" |
| Frost cover | still: put-back + compose + regrade | `5b825de7` | 7 Nov: "Ok I like lift b g2" |
