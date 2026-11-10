# Handoff: P&L "The Ledger" head composite in After Effects (Grok bot)

Date: 10 Nov 2026. From: Claude (AVT session). To: the Grok bot (After Effects).
Owner and approver: Fendi. He judges every look by name before a full render.

## What is wanted (Fendi's words, 10 Nov 2026)

> "I want a blend of my head and the top and bottom to where you can not see any dividing border and my face
> has all its features but is representative of both top and bottom."
> "Improvise with my head turned right side up and the entire top and bottom visuals fit inside of my head with
> the universe (stars/planets moving) in the background."

Two looks to test, a few seconds each, before any full render:

1. **Blend.** His head upright. The top picture (Profit) and the bottom picture (Loss) meet with no visible line.
   His face is built out of both pictures, yet every feature (eyes, glasses, nose, beard, mouth) reads clearly
   as him.
2. **Universe.** His head upright. The whole top and bottom pictures play inside the shape of his head, blended
   the same way. Outside his head is moving space: the space plate in the package.

## What Fendi rejected (do not repeat)

All four of Claude's attempts failed. They were simple pixel blends; the frames are in the package README:
- **Transparency:** his head see-through over the scene, upright or sideways. "Opacity is clearly not the right effect."
- **Fading in:** his face fading in or appearing slowly. "Looks ridiculous."
- **Black ground:** a dark background around his head. "There should never be black space."
- **Hard band:** a band crop with a straight edge across his forehead.
- **The overall feel:** "super AI generated as opposed to photo realism hip hop montages."

Reference he gave (shows the scale and the sideways idea only; he has no reference that shows the exact effect):
`/Volumes/T7/P&L AVT edit/REFERENCE ART/IMG_6351.JPG`.

## Hard rules (repo: CLAUDE.md, docs/SHOT_RULES.md)

- **His face is his real footage.** No generative pass on his face, no lip-sync, no face-altering model. Tracking,
  masking, displacement, light wrap, grading and blend modes are fine.
- **His mouth is the real take, on the song clock**, and must stay readable.
- **Media lives on the T7 and in AVT storage.** Never iCloud.

## Timing

- Song: `/Volumes/T7/P&L AVT edit/SONG/P&L - MASTER - 01.30.26.mp3`, 137.54 s.
- Take: `/Volumes/T7/P&L AVT edit/PERFORMANCE/IMG_6353_passC.mov`, front-on, one continuous pass.
- **Sync, VERIFIED:** song time = take time − 3.0325 s (take 3.0325 s = song 0).
  - Measured 10 Nov by cross-correlating the take's own audio with the song.
  - It matches AVT `performance_syncs` 06b529e8.
  - The take ends at song 133.55 s. After that there is no head; the final shot fades out.
- Shot windows: `shots_timing.json` (34 shots, c001–c034).
- Split shots: top and bottom halves, each 1:1, two images per half.
  - Image 1 plays first, then the half cuts to image 2 (`_b2`).
  - The top cuts on the beat nearest mid-shot; the bottom cuts one beat later.
  - The exact cut times are in `cut_plan.json`.
- Full-frame shots: c029, c030, c031 (a then b), c034, in 9:16.
- Beats: `analysis.json`, `beat_map_json`.

## Package

On the T7: `/Volumes/T7/P&L AVT edit/COMPOSITOR_HANDOFF/`. Its README lists every file.

| File | What it is |
|---|---|
| `plates_00.tar`, `plates_01.tar`, `plates_02.tar` | All 130 animated clips, named `cNNN_top`, `cNNN_bottom`, `cNNN_top_b2`, `cNNN_bottom_b2`, `cNNN_full_9x16`. |
| `space_bg_9x16.mp4` | The universe plate (6 s, 720p). Loop it, or ask Claude to extend it. |
| `head_matte.mp4` | A rough MediaPipe head matte on the song clock (540x960, 24 fps). Fine for placement only; pull a proper roto for the final. |
| `face.json` | Per-frame face landmarks on the song clock (eyes, nose, mouth box, chin), in 1080x1920 take pixels. |
| `PL_Ledger_cut_v1_no_head.mp4` | The approved plate edit with the song: split frame with a white line, no head. A timing reference. |
| `manifest.tsv` | Every clip with its AVT request id. |
| `beat2_stills.tsv` | The second-image stills with their AVT asset ids. |

The second image never generated for five halves: both halves of c005, and the c020, c025, c026 and c028 bottoms.
In the package, those `_b2` files are the first clip reversed.

## Steps

1. Build look 1 and look 2 on c005 (song 17.96–22.58 s) only. Render 4 s of each with the song, then send both to Fendi.
2. He picks or redirects. Only then render the full 2:17 in the chosen look.
3. Deliver 1080x1920, 24 fps, H.264, with the song. Put it on the T7 next to the package.

## Open questions for Fendi (listed here, not guessed)

- He may later decide to re-render the plates for a more natural, filmed look. He said that decision comes later.
- Shot-rule bends to confirm with him: SHOT_RULES rule 5 (match the room's light) and rule 7 (never centre-front).
  This concept puts his head centred and graphic.

Spend so far on this step: the space still (estimated $0.27) and the space clip ($0.422, billed per xAI).
