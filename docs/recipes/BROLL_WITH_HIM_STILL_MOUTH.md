# AI b-roll with him in it, mouth at rest ("recipe F"): the method (approved by Fendi, 27 Oct 2026)

**This is the reference for generating a shot that has Fendi in it without him rapping.** It is how c041, c042, c044,
c045, c046 and c013 of the first half were made (`docs/handoffs/HANDOFF_GROKBOT_FIRST_HALF_2026-11-05.md`). Any agent
making AI b-roll with him starts here. For changing his clothes on real footage, the method is
[`FACE_PRESERVING_CLOTHING_SWAP.md`](FACE_PRESERVING_CLOTHING_SWAP.md) instead; the two combine (below).

Approval: Fendi, 27 Oct 2026, on the c044 stiffness tests A–F: **"F is the best"**, then **"Proceed"** (ledger 198).
The rule it serves, Fendi, 5 Nov 2026: a shot where a generated him moves his mouth is not usable; it is b-roll with
his mouth at rest, a cutaway without him, or a performance shot from his real footage.

Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## What it is

One `montage-shot` render (Seedance 2.5 reference-to-video through Control Center, 720×1280, 4 s minimum) whose
`@Video1` is a **silent window of his real footage** (him not rapping), copied **loosely** (posture, gestures and where
he looks follow the window; the body is a second take, not a copy), with his **face exact** from the window and from
his **face pictures** in the tool, and his **mouth at rest**. The model never sees a rapping take, so there is nothing
to suppress; the earlier still-mouth prompts on rapping takes came out stiff (ledger 184–196, the A–E tests).

| Setting | Value | Why (evidence) |
|---|---|---|
| `reference.assetId` | a silent window below | Fendi, 24 Oct: "non rapping footage should have been used for all b roll shots" (ledger 184) |
| `sync` | `"loose"` | pinning head/body/hands/eyes "exactly" to the window came out robotic (ledger 190, 195); loose body, exact face (`MONTAGE_LOOSE`, `supabase/functions/_shared/montagePrompt.ts`) |
| `motion` | `"calm"` (seated, still scenes) or `"lively"` (standing, walking) | `calm` = a breath, a weight shift, a slow head turn; `lively` = restless, handheld camera moves with him. `still` exists but reads frozen. `motion` needs `sync: "loose"` |
| `face` | default (omit) = his face pictures as `@Image2…` | Fendi, 26 Oct: "you have so many images of my face in my tool you should be referencing" (ledger 196); the default labels are neutral, three-quarter left/right, side profiles, at most 6 |
| `mouth` | omit | a silent reference sets `mouth: "silent"` itself; `mouth: "still"` is the old route and is refused with `sync: "loose"` |
| `lines` | 2–4 scene lines, see below | the scene list is the director's; untimed lines are placed on the beats by the tool |
| `dryRun` | `true` first, always | prints the prompt, the references and the price; nothing is spent |

Price: **$2.219 list per 4 s at 720p** with a reference clip (a b-roll montage without one is $1.85; the numbers in
`MONTAGE_MUSIC_VIDEO_WORKFLOW.md`). A 1.5 s slot still renders 4 s.

## The silent windows (VERIFIED assets on project `764a63d2`, owner `3ca10935`)

Cut from his real footage where he is not rapping; sent whole as `@Video1`. The window's **outfit is what he wears
in the render**; to change it, dress the window first (lane below) or dress the render afterwards.

| Window | Asset | Outfit | Cut from | Used on |
|---|---|---|---|---|
| black | `4c54a42a` | black outfit, his black cap | IMG_6228, song 8.7 s: arms crossed, then gesturing (Fendi's pick, 24 Oct: "the last one is good") | c041 (ledger 198), the c044 stiffness tests (ledger 190–198), c007/c010/c016/c017/c025/c027/c028 re-renders (refused for credits, ledger 221) |
| camo | `6776232f` | his own camo shirt, navy cap | closet master, song 103.1 s: head back, arms out ("do the second camo", 24 Oct) | c044 (ledger 187–188) |
| YSL-dressed camo | `b6687599` | SL mastic track jacket `0feb028f` over the camo window, swap smoothed to the window's rate first | `6776232f` through `dress-clip` + `swap_rate.py` | c045 v2, c046 v2 |
| beige cap | `d6750713` | track jacket `0feb028f` + beige-and-ivory SL cap `07e6dcbe` (Fendi, 28 Oct: the hat must match the jacket, "Yes") | `b6687599` re-dressed | c042 v4 (ledger 210–213), the c036/c037/c039 re-renders (refused, ledger 221) |

No silent window exists in the leather-coat/bucket-hat look or the beanie look (5 Nov 2026). A render for those shots
wears the black window's outfit unless a window is dressed first.

## The lines

Rules that held across the approved renders (ledger 196–202, the 17 Oct montage rules):

- 2–4 lines, one scene per beat or two, `HARD CUT to …` between scenes; the place's unusual thing in a cutaway without him first; him anchored to something in the place (a pillar, a seat, a window), **never centre-front**, waist up or closer, never his shoes or feet, never a full-body shot (Fendi, 17 Oct: "Stop the full body shots").
- **No face beat.** No smile, no word, no glance written into a line: the face comes from the window and the pictures (ledger 195: a written face beat broke the likeness). Write "his mouth at rest, his face toward the camera" in the line he is in.
- Name what he wears when the scene's cast could be rendered onto him ("in his black cap", "his beige Saint Laurent cap"): ledger 199–202.
- Lines with their own seconds (`0.0-1.6 s: …`) are sent as written; untimed lines are cut on the song's beats by the tool.

## The call (through the AVT MCP, no browser)

```json
avt_call  function: "montage-shot"
{
  "projectId": "764a63d2-93cd-44f3-905f-292f14ab2f51",
  "shotId": "<shots.id on the active board>",
  "variationId": "c067efb9-90af-418e-aa6d-58834f6e19de",
  "reference": { "assetId": "4c54a42a-…" },
  "sync": "loose",
  "motion": "calm",
  "lines": "0.0-1.6 s: HARD CUT to …\n1.6-4.0 s: … him … his mouth at rest, his face toward the camera",
  "dryRun": true
}
```

1. **Dry run.** Read the prompt it prints: the window as `@Video1`, his face pictures as `@Image2…`, the lines in order, the price. Fix the lines until the prompt says what the shot is.
2. **Quote.** The price goes to Fendi before the run when the session's spend is not already authorised; every paid call is a ledger row (`docs/LEDGER_YSL_TESTING_BUDGET.md`) in the same commit as the result.
3. **Run** with `dryRun: false`. The job is a `provider_jobs` row; `provider-jobs-tick` downloads the result and files it on the shot **unselected** (`project_assets` + `shot_asset_assignments`, `is_primary` false). `request_payload_json.settings.variant.scenes` keeps the lines.
4. **Check before anyone looks at it** (both $0, offline):
   - `scripts/edit/face_check.py --generated <render> --reference <window> --face <his pictures> --out sheet.jpg`: his face next to the window's and the pictures, row by row (lips, beard, glasses, face shape). Fendi, 26 Oct: "Mouth closed doesn't mean mouth awkwardly bunched up."
   - `scripts/edit/mouth_scan.py <render or slot clip> out.csv 12`: lip gap / face width per sample. The reading used on the first half (5 Nov): the mouth **moves** when the mean is above 0.08 with a spread above 0.03; confirm on the face sheet, because a face found in few samples (c030: 4 %) can hide a moving mouth. A clip that moves its mouth in its slot is not posted as a candidate.
5. **Post** the render in chat with its face sheet (every generated clip is posted, Fendi, 14 Oct). Fendi judges; an agent never passes its own render.
6. **Select** only on his word: `avt_update shot_asset_assignments` the chosen row to `is_primary: true` after un-primarying the rest of the shot (`docs/recipes/MCP_UPLOAD_AND_FILE.md`, "primary on the board"). Filed results stay unselected until then.

## Combining with the clothing swap

The approved c041 TENTH is this recipe followed by the canonical swap: the calm render `7b89d99f` (recipe F, black
window) was dressed through `dress-clip` (leather car coat `fb82c0d2` + bucket hat `eb813927`, job `ce147dcc` →
`6f2e6dfb`) and the garment put back over the render by `body_only_swap.py` (`AVT_HEAD_ZOOM=4`), so the render's face
stayed the render's own (`FACE_PRESERVING_CLOTHING_SWAP.md`, "Second approved result" and "Run on a new take", lane A).

## What this recipe is not

- Not a performance shot: his mouth is at rest, so it never carries a lyric. A shot that needs him rapping is his real take (synced on the song) with the clothing swap, never a generated mouth.
- Not a whole-video method: one render per shot, at the model's length, cut to the slot by the edit (`MONTAGE_MUSIC_VIDEO_WORKFLOW.md`).
- Not a likeness guarantee: the face is a fair likeness on the approved renders (ledger 198: "broader than his, beard fuller"). A shot where his face is large and still is a candidate for the swap-and-put-back route above or for his real footage.

## Evidence

- Ledger rows 184–202, 210–213, 221 (`docs/LEDGER_YSL_TESTING_BUDGET.md`).
- The prompt text: `supabase/functions/_shared/montagePrompt.ts` (`MONTAGE_LOOSE`, `MONTAGE_MOTION`, the face-pictures sentence); the request: `supabase/functions/montage-shot/index.ts` (`reference`, `sync`, `motion`, `face`).
- The first half's use of it: `docs/handoffs/HANDOFF_GROKBOT_FIRST_HALF_2026-11-05.md`, "Mouth rule, made explicit".
