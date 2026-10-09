# Storyboard redesign — built, published, walked on YSL (2026-10-03)

Fendi's brief, after his own review and ChatGPT's: *"The UI must become simpler while the underlying production state becomes MORE rigorous."* Five steps — **Setup → Treatment → Storyboard → Review → Export** — with the storyboard as the production workspace. Main `a4c9636`, published at https://aivideotool.lovable.app. Whole suite: 151 files, 1681 passed, 1 skipped; `tsc` clean; `pytest scripts/edit/tests` 15 passed; `vite build` passes.

## 1. What is on main

**One permanent record per shot.** A storyboard box is a `shots` row. Its identity is the row id and a stable `spec_key`; its place in the order is only its window on the song. Re-ordering, splitting, merging and regenerating never change which record a piece of footage belongs to. `generated_json` is what the generator wrote, `override_json` what the director changed (and which fields he set by hand), `spec_json` the two resolved, `history_json` the last twenty versions. The storyboard **is** the shot list; "Commit to shot list" is gone. Migration `20261003100000_storyboard_boxes.sql` (additive).

**Footage is assigned, not copied.** `shot_asset_assignments` (shot, asset, role: performance · b_roll · generated_image · generated_clip · reference; one selected per shot). Moving footage to another shot moves the assignment; the file never moves and is never duplicated. Taking footage off a shot leaves the file in the project.

**Performance is cut from a synchronized take, never stretched.** `performance_syncs` holds one measured relation per take (`song_time = take_time × (1 + drift) + offset`). A shot's performance range is derived from its song window through that relation every time it is needed — nothing is stored per shot, so split, merge and retime cannot break lip sync. The synced take is the base layer under every shot it covers: put a clip on a shot and the clip shows; hide it and the take is there again, in sync.

**Setup comes first.** Song, beat and length, lyrics, lyric timing, performance takes, takes matched to the song, the director's own B-roll, looks and references, and a confirmation that the real footage is in. Treatment generation waits for it. Takes are matched once (by audio in the browser, or an offset typed in); nothing is re-synchronized when the storyboard changes.

**One treatment.** Written by the AI or by hand, saved as one document that can be read, edited, regenerated and deleted. "Your bar", the section buttons and the Creative Director panel are gone from the workflow.

**Each shot:** Regenerate scene · Generate image · Generate clip · its footage (show / hide / move to another shot / take off) · split · merge with next · edit · lock · versions. A regenerated scene is written with the treatment, the lyrics sung in the shot and one line about each neighbour on screen — and, silently, a structured block of locked facts (song window, synced source range, assigned footage, look, what the director fixed by hand). Generated images and clips are filed under the shot's record and land on that shot only.

**Full-screen shot view** with next / previous, arrow keys, swipe on a phone, full screen (and a fill-the-screen mode where the browser offers none), and Back to storyboard. **Review** plays the storyboard in order against the song from whatever is selected on each shot. It says what it is: a preview in the browser, not a render. Export's zip carries `storyboard_timeline.json` — the same records, with original file paths, for a renderer.

## 2. The acceptance list, on the real YSL project

Walked in the published app, signed in as Fendi, by pressing the app's own controls.

| # | Fendi's point | Result on YSL |
|---|---|---|
| 1 | see source assets | Setup: song 3:21, 122 BPM, 95 timed lyric lines, 1 take, 57 references — every blocking item done |
| 2 | one authoritative treatment | one document (the 2026-06-07 treatment, carried across) with Edit / Regenerate / Delete |
| 3 | see the storyboard | 43 shots on permanent records; "1 saved edit carried across, 2 generated clips linked. Nothing was removed." |
| 4 | open any box | shots 06, 07, 09, 12, 43 opened |
| 5 | correct interval / lyrics | 06 = 0:19–0:23 with the five lines sung there; 09 (0:31–0:35) and 01–03 correctly instrumental — checked against `lyric_lines` |
| 6 | synchronized performance range | shot 06: "source 0:18–0:22 · in sync with song 0:19–0:23" (19.61 − 0.8538); shot 01 flags that the take covers only part of it |
| 7 | assign / remove / move media | show → hide → move to shot 07 → move back → take off → put back from the picker; rows verified in `shot_asset_assignments` |
| 8 | regenerate only that scene | shot 09 rewritten (instrumental, from the treatment); shot 12 rewritten from its lyric, then restored from Versions and reset — no other row changed |
| 9 | image for only that scene | shot 09: two stills, filed under shot 09's record, $0.14 |
| 10 | clip for only that scene | shot 09: Kling 2.5 image-to-video from that still, landed on shot 09 and became what it shows, $0.35 |
| 11 | preview its actual media | **not watched on YSL** — see below |
| 12 | swipe to adjacent scenes | next / previous on YSL; the swipe itself in the local browser run at phone size |
| 13 | return to the storyboard | yes |
| 14 | play the assembled section in Review | **not watched on YSL** — Review loads the song, the take and both AI clips and lists 40 shots on the take, 2 on AI clips, 1 empty; see below |

Also exercised on YSL: split shot 43 at 198.00 s (new record `c043_2`, first half kept its id) and merged back.

**Why 11 and 14 were not watched on YSL.** Chrome does not load video or audio in a window that has never been on screen, and Fendi's Chrome window was not visible during the session (`visibilityState: hidden`, zero outer size). Every signed link was checked to resolve (206, `video/mp4`, header at the front), but no frame could be played there. The players were therefore run in a real Chromium against a YSL-shaped project (§ 4): 43 shots on YSL's own cut points, a 190 s take 0.8538 s after the song. **This is the one thing to confirm by eye: open Review on YSL and press play.**

## 3. What the walk found (all fixed, all on main)

1. **The song was never found.** The asset list leaves the audio asset out; the storyboard's media hook looked for the song inside that list. Setup asked a project with a song to upload one, the Treatment gate stayed shut, Review had nothing to play. Unit tests had mocked the hook. Now read from the song's own query; regression test.
2. **A rewritten scene mentioned its neighbours** ("…that will become the next scene's ring") and that text went to the image and video models. The neighbours instruction now says they are context only.
3. **A take that ends inside a shot restarted from zero.** YSL's take ends at 3:11, inside shot 42. The player asked an ended video to play. Now it holds the last frame (`videoStateAt`, six tests); the first frame holds before the take starts.
4. **On a phone the app's header covered the full-screen shot** — Back to storyboard and the arrows could not be reached; the bottom bar covered the content. The page sits in the shell's stacking layer, so "fixed, on top" inside it was not on top. The full-screen shot, the picker and confirmations are now drawn on the document body.
5. **A phone has no full screen for anything but a video.** The button now falls back to filling the screen inside the page; swipe still works there.

Smaller: a vertical image was cropped to a 16:9 tile on the board (now shown whole); the image in the full-screen view was lazy-loaded; a jump while playing left the video ≈ 0.07 s late (now closed by nudging the speed); the voice Director panel sat on top of the phone navigation bar (lifted above it — one class in another lane's file).

## 4. The local browser run (`scripts/e2e-local/`)

The real app, unmodified, in Chromium against a small in-memory stand-in for the backend, on a project built by the app's own box code with ffmpeg media that has the time burned into every frame. `run_storyboard.py` prints PASS / FAIL. On `a4c9636`: Review sampled every half second from the top, from shot 5, from shot 8 and from shot 42 — right shot on the stage at every sample, video within 0.03 s of the song clock, first frame held before the take starts, last frame held after it ends, AI clip / B-roll / image / empty slate each shown on their shot; at 390 × 844: no sideways overflow, header reachable, swipe 06 → 07 → 08 → 07, fill-the-screen 390 × 844 with swipe working inside it.

## 5. State left on the YSL project

- `shots`: 43 rows now carry `spec_key`, `generated_json`, `spec_json`, `box_origin`, `history_json`; the old columns are still filled. The legacy row with no key (shot number 1, empty since June) is untouched and is not a storyboard box — Export still counts it ("44").
- `project_assets.footage_role = performance` on `hero_clip_hd_1080.mp4`; `performance_syncs`: that take, offset 0.8538 s, entered by hand (the value measured on 2026-09-20; this encode has no audio track and the master with audio is 1.98 GB, too large to decode in a browser).
- `treatment_json.setup.footage_confirmed_at` set.
- Shot 06: its two generated clips linked; `…62e21ab8` is the one showing.
- Shot 09: scene rewritten (the June text is under Versions), two stills and one clip on it, the clip showing. It reads "edited · yours" — a rewritten shot is kept out of a whole-board rewrite.
- Shot 12: rewritten, restored and reset — back to generated; four entries in its history.
- `shot_overrides` (the old table) and its rows are kept.

## 6. Not in the app yet

- **Automatic lyric timing.** Setup takes timed lyrics pasted as LRC; the aligner is still `scripts/lyrics/align_lyrics.py`. YSL's 95 lines were already in.
- **A render.** Review is a browser preview; the timeline a renderer needs is in the export.
- **Audio matching for a file with no audio or too large to decode** — the offset is typed (YSL).
- **Project aspect.** Generation uses the pipeline's 9:16 default, as every YSL still has; tiles and stages are 16:9 and show a vertical frame whole, with bars.
- A performance shot's Generate image / clip draws the world without him (the plate line); the collage check still misses a blended collage.
- Lovable's scanner reports 50 open critical findings on every publish, unchanged by this work.

## 7. Other agents' files touched

Claude Code's B3/B4 lane: `ShotStoryboard`, `ShotCard`, `ShotOverrideBlock`, `shotOverrideContext`, `queries/shotOverrides.ts` and `TreatmentBuilderPage` are deleted (replaced by `src/components/storyboard/**`, `src/lib/storyboard/**`, `src/pages/{Setup,Treatment,Storyboard,StoryboardReview}Page.tsx`); `lyric-visualizer-proxy` gained optional `treatment`, `neighbours`, `projectState` (default prompt byte-identical; golden test holds). Lane G: `src/lib/ux/engineeringMode.ts` (assets, video, scorecards moved to advanced). Runs page compiles from box records and passes shot ids. `VoiceDirector.tsx`: one class. Control Center: untouched.

## 8. Spend

$0.14 (two stills, billed) + $0.35 (Kling, list) + ≈ $0.08 (two scene rewrites) = **≈ $0.57**. Ledger rows 36–38.
