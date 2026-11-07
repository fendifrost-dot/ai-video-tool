# Handoff: YSL first half, the closet-background slots re-shot IN their scenes (v1.10 fix)

Date: 7 Nov 2026. Owner: Fendi Frost. From: Claude (session 012AsoE6sKwb388Lt3Vt7XFq). Follows the Execution
Manager's issue-only handoff of 6 Nov (`HANDOFF_CLOSET_SHOTS_ISSUE_v1.10.md`, sent by Fendi in chat: "back to YSL,
grok ran into some issues").

Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## The issue, in one line

After the recipe F clothing swap, 8 slots of cut v1.9 (c016, c017, c023, c025, c027, c028, c030, c043; 330 frames)
show Fendi in the closet he was filmed in. Fendi's rule: after a swap he is placed in the scene; these 8 are b-roll
with him in it, lips closed, same locations and framing as the earlier in-scene takes.

## Why the previous attempt stopped, and the two fixes (VERIFIED)

The paid c017 Gemini still was refused `reference_forbidden` after a passing dry run (not billed, ledger 193).

1. **Data.** The mastic track jacket `character_features 0feb028f` (and five other YSL records: overshirts
   `ca61e35c` `ebb696d4`, trucker jacket `f6455042`, jeans `df104591`, trousers `6badada3`) pointed at
   `wardrobe-refs` under folder `65cf99cb-…`, another user id. Control Center's reference rule
   (`image-providers-gemini-generate/contract.ts referenceUrlAllowed`) requires the caller's own folder. **Done
   live through the MCP:** the nine pictures were copied under `3ca10935-…/8d4a4d22-…/` (same file names) and the
   six records re-pointed (`file_url`, `storage_path`, `reference_images[].url/storage_path`). Originals left in
   place. Check: `avt_select character_features filters file_url like '65cf99cb%'` → 0 rows.
2. **Tool.** `world-still-proxy`'s Gemini dry run sent `references: []` downstream, so the rule never ran before
   the paid call. Fixed in `supabase/functions/world-still-proxy/gemini.ts`: the dry run signs every picture as
   the caller and sends the signed URLs with `dryRun: true`; CC validates them and sends nothing to Google. Tests
   25/25. Merged to `main` as `af4130f5` (PR #450). **LIVE:** Lovable redeployed `world-still-proxy` at
   2026-11-07T02:17:00Z from `af4130f5` (byte-identical worktree, source_sha256 `4013b51b…`, message
   `umsg_01m6swp41ye19t971f58vae2ar`). **VERIFIED live at 02:23 UTC** through `avt_call` (Gemini dry runs, $0):
   a reference under the caller's folder (`b1b27020`) → `ok: true, referencesChecked: 1, modelAccessVerified: true`;
   a reference under a legacy folder (`af458e03`, `08ae347a-…/…/hero-frames/…`) → `ok: false, error:
   "reference_forbidden", billed: false` — the refusal that previously only came from the paid call.

## The re-shoot (DECISION: the approved recipe, not the stills-plus-animation plan)

The b-roll-with-him method Fendi approved on 27 Oct (`docs/recipes/BROLL_WITH_HIM_STILL_MOUTH.md`): one
`montage-shot` render per slot, Seedance 2.5 reference-to-video through Control Center, 720×1280, 4 s, with
- `reference: { assetId: "d6750713-21f8-4ce0-a7a5-4acd6bc7b29b" }` — the SILENT beige-cap window (mastic jacket +
  beige SL cap, him not rapping), so the mouth stays shut on its own (the literal "no mouth movement" phrase is never
  sent; the prompt says "his mouth at rest");
- `sync: "loose"`, `motion: "calm"` (seated/still scenes) or `"lively"` (Lower Wacker, the corner);
- the board's own plate for the scene the slot falls in (the same places as the earlier takes: the hallway with
  the janitor and the penguin, the Midway carousel with the fox, Lower Wacker); his face pictures go in by default;
- two lines each: the place's cutaway first, then him anchored (lockers, carousel rail, window, pillar, station
  entrance), waist up, "his mouth at rest, his face toward the camera", his outfit named.

c043 had no plate ("Chicago, the corner" had none): the 79th & Lafayette station corner at night (`3f0346d1`, the
polar bear at the edge) was filed again as `project_assets dfcc35f3` with `metadata_json.scene_title = "Chicago,
the corner"` ($0). All 8 dry runs passed before any spend (price $2.219 list each; the API has charged ≈ $1.85).

| Slot | Shot id | Plate | Job | Result asset | Check |
|---|---|---|---|---|---|
| c017 | `8c513159` | hallway `b1b27020` | `ef84b4d0` | `cfdb5b4d` | OBSERVED: in the hallway on the lockers, mouth at rest at every sampled frame (face sheet 1.6–3.9 s), glasses his. FLAW: the wordmark mirrored on his right chest (Fendi, 02:24: 'Logo regression on 017'). Posted 02:15 UTC. |
| c016 | `d495d6d4` | hallway `b1b27020` | `3df3a496` | `1833c3c9` | OBSERVED: on the lockers, penguin and janitor behind, mouth at rest. FLAW: band drawn diagonally. Posted. |
| c023 | `3100e78d` | carousel `ad934c70` | `5d9a76c6` | `82df88cb` | OBSERVED: seated on the carousel rail by the window, fox cutaway first, mouth at rest. FLAW: wordmark mirrored. Posted. |
| c025 | `9379d0c6` | carousel `ad934c70` | `532f3b90` | `849543fa` | OBSERVED: behind the carousel rail, mouth at rest. FLAW: wordmark mirrored. Posted. |
| c027 | `9d53180d` | carousel `ad934c70` | `0fae15d5` | `ddf22dfa` | OBSERVED: under the arrivals board, the woman passes, mouth at rest, wordmark correct. Posted. |
| c028 | `ff3bcb4e` | carousel `ad934c70` | `07c86756` | `c77da9fe` | OBSERVED: in profile at the window turning to camera, the fox behind him, mouth at rest. FLAW: wordmark mirrored. Posted. |
| c030 | `454015fb` | Lower Wacker `c950a7ee` | `8e0c0742` | `20c9cf31` | OBSERVED: at the Lower Wacker pillar, lively, mouth at rest, wordmark correct. Posted. |
| c043 | `ad991d14` | the corner `dfcc35f3` | `cf8125e2` | `583d61e1` | OBSERVED: at the station entrance square to camera (centre-front per the montage rules; the slot's spec asked for it), the woman behind his shoulder, mouth at rest. Posted; Fendi's call. |

Ledger rows 247–254 (`docs/LEDGER_YSL_TESTING_BUDGET.md`): 8 × $2.219 = $17.75 list against the $22.76 Fendi had
left on this task's $50. Results are filed on their shots UNSELECTED by `provider-jobs-tick` (nothing in cut v1.9 is
changed by a render; the cut's `overrides.csv` picks them up when Fendi accepts them).

Untouched, as required: the nine approved performance shots c009, c026, c033, c039, c041, c042, c044, c045, c046.

## The wordmark regression (Fendi, 02:24 UTC: "Logo regression on 017") and what was tried

Audit of all eight (chest crops `logo_check.jpg`, `logo_check2.jpg`): the SAINT LAURENT script reads correctly on
c027, c030, c043; it is MIRRORED (and on his right chest instead of his left) on c017, c023, c025, c028; on c016 the
band itself is drawn diagonally. The silent window `d6750713` reads correctly, so this is the generator mirroring the
figure, not the reference. The slot prompts did not name the wordmark or its side.

Tried, $0: the deterministic brand layer `scripts/edit/garment_graphic_track.py` on c017 (two passes: the plain band
segment from the product photo over the mirrored segment, the wordmark segment on his left chest; anchor frame 67).
Three attempts with hand-read and then pixel-fitted anchor quads all landed as a hard-edged sticker beside the band
(`ysl/brand/c017_chest_before_after.jpg` in the session scratch): on this 720p generated clip the band is tilted and
folded and my quads were 15–30 px off, and the graphic crops carried a beige margin. Stopped there rather than keep
iterating; the earlier record of this tool (WARDROBE_SWAP_RECIPE.md: "the jacket still alters") says it is a
multi-iteration job per clip.

RECOMMENDATION, for Fendi's call (budget: $17.75 of the $22.76 left on this task is spent, $5.01 remains):
1. Re-roll the five flawed slots with one added line naming the mark ("the gold SAINT LAURENT script on the navy
   chest band at his LEFT chest, reading left to right"), $2.22 each, $11.10 for five: needs his authorisation.
   Three of eight came out right with no such line, so a roll is not a guarantee.
2. Keep c027, c030, c043 as they are (wordmark correct), and c016/c017/c023/c025/c028 only if the slot's frames
   keep the chest out of frame or the mark is too small to read at the cut's speed (c016's diagonal band is visible
   at any size).
3. The brand layer, properly anchored (an hour of measurement per clip), if re-rolls keep mirroring.

## Fendi's verdict on the first roll and the re-roll (02:40 UTC)

Fendi: "C030 dancing is too freaky it looks weird, C016 jacket doesn't look remotely close and logo is bogus, C028
added pin stripes to the jacket same as C016. These need new renders and I have more than enough credits to complete
them your numbers are wrong on what's available please don't worry about the money let's get the shots correct. You
should know what's acceptable and what's not at this point lets lock in and get these shots right."

DECISION: the standard is the window's jacket exactly (plain beige, one straight navy band, the wordmark on his LEFT
chest reading left to right), his face, mouth at rest, and nothing strange in the body. A mirrored wordmark is not
acceptable. Re-rolled six: c016, c017, c023, c025, c028, c030 (ledger 255–260, $13.31); c027 and c043 stand. Changes
from the first roll: every line carries the jacket spelled out (above), and c030 drops from `motion: lively` to
`calm` with "standing still against a concrete pillar". Budget: Fendi says the credit numbers I was working from are
wrong and not a constraint; the ledger keeps counting list price regardless.

| Slot | Re-roll job | Result | Check |
|---|---|---|---|
| c016 | `bcc365b8` | `5be5fa5c` | OBSERVED: construction right now, mouth at rest. FAIL: wordmark mirrored on his right chest again. Third roll `def38a1b` → `d629e40b`: mirrored AGAIN (three-quarter staging, right chest nearest the lens). Fourth roll `12c1a339` → `83a6f39e`: square to camera, the script STILL on his right chest (4/4). Rolls 5-7 submitted in parallel (ledger 263-265): the passing c017 staging / three-quarter left shoulder to camera / camera on the other side of the hall. |
| c017 | `58e7ac51` | `24e0ecf1` | OBSERVED: on the lockers, jacket right, wordmark correct, mouth at rest. FLAG: darker lenses. Posted. |
| c023 | `de5191f9` | `8705741e` | OBSERVED: seated by the window, jacket right, wordmark correct, mouth at rest. Posted. |
| c025 | `ea8407e5` | `093fdcf6` | OBSERVED: behind the rail, wordmark correct, mouth at rest. FLAG: a navy hem band. Posted. |
| c028 | `f2771ecb` | `75cd814a` | OBSERVED: profile at the window, jacket right, wordmark correct, mouth at rest. Posted. |
| c030 | `5d524cf5` | `a45df650` | OBSERVED: calm at the pillar, jacket right, wordmark correct, mouth at rest. Posted. |

## Checks on each render ($0, offline), before anyone looks at it

- Strip: `ffmpeg -i render.mp4 -vf "fps=2.5,scale=216:-2,tile=10x1" strip.jpg`.
- Face sheet: `scripts/edit/face_check.py --generated render.mp4 --reference <window d6750713> --face <neutral>
  --face <three_quarter_left> --face <three_quarter_right> --out sheet.jpg --seconds "1.0,1.6,2.2,2.8,3.4,3.9"`.
- Mouth scan: `scripts/edit/mouth_scan.py render.mp4 out.csv 12` (AVT_MODELS = the two mediapipe files).
  **Finding (c017):** the scanner found no face in any of 49 samples on this tight waist-up framing (it was built
  for full-body takes where the face is 60–100 px); the lips-closed call on these renders comes from the face sheet,
  not the scanner. HYPOTHESIS: the segmenter's face-skin box fails when the face fills >25 % of the frame; a scan
  mode that skips the enlargement when the face is already large would fix it (not done).

## Verify live (the next agent, after Lovable)

1. `world-still-proxy`: DONE and VERIFIED (above). To re-check at any time: a Gemini dry run with a
   `project_asset` reference under a legacy folder answers `reference_forbidden`; one under the caller's folder
   answers `ok: true, referencesChecked: 1`.
2. Each pending job: `avt_select provider_jobs filters id eq <job>` → `status: succeeded`, `result_asset_id` set;
   the clip is `project-clips/<user>/<project>/<job>/generated_higgsfield_*.mp4` (720×1280, 4.04 s).
3. Nothing in this handoff is verified by anyone's say-so: a clip is accepted only when Fendi says so on the posted
   clip + face sheet.

## What not to do

- Do not re-render or touch the nine approved performance shots.
- Do not put a render into the cut as primary: they are alternates until Fendi accepts them.
- Do not send the literal Seedance phrase "no mouth movement" (freezes the clip); the recipe's "mouth at rest" line is
  the one that works.
- Do not edit the legacy `65cf99cb-…` files or delete them; the records now point at the copies.
