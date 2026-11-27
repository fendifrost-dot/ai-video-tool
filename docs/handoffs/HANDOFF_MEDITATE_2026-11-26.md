# HANDOFF: "Meditate" (26 Nov 2026)

For: the agent that builds the Meditate video. Written by the Claude Code session that built Partnership / Cease &
Desist, at Fendi's request ("I need a handoff for a new agent to carry on this new project including must dos to
eliminate mistakes"). Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## The video, in Fendi's words (26 Nov 2026)

> "it's a simple shot of me rapping while appearing to be meditating I recorded from different camera angles and
> distances. the twist of the video is that while I'm recording a chaotic kung fu fighting scene is playing out all
> around me. no clothing swap for this shot but a full scene needs to be built in blender and even though I stay
> stationary I do want to test a new tool out that can supposedly keep character continuity including lip sync. this
> will enable me to interact in the fight scene very minor effort from me but still blocking or dodging attacks while
> still rapping and continuing to meditate as my kung fu guards handle the intruders. I want the characters either
> japanese or chinese and the seen to match a beautiful japanese rock garden or a magnificent chinese dojo."

DECISIONS in that (his): no clothing swap; the scene is BUILT in Blender; the fighters are Japanese or Chinese (his
guards against intruders); the place is a Japanese rock garden or a Chinese dojo; him blocking or dodging is a TEST of
the new tool (ALTER, section 4), not a planned shot.

## 0. Start state

| | |
|---|---|
| Repo, branch | `fendifrost-dot/ai-video-tool`, `main` at `9c50b5b9` (VERIFIED 26 Nov, `git log origin/main`) |
| Open PRs that matter | #533 camera-move library and #534 ALTER (stacked on #533). #534 is being built on by the Partnership session on Fendi's word; do not edit either branch, and do not send an ALTER request before section 4's gate |
| AVT project | none yet for Meditate (VERIFIED 25 Nov: `video_projects` newest row is Hyenas; re-check before creating one) |
| Backend | Lovable-managed only, project ref `qoyxgnkvjukovkrvdaiq`; pre-flight in `docs/AGENT_BOOTSTRAP.md` |
| Money so far | $0. Open `docs/LEDGER_MEDITATE_2026-11-26.md` with the first paid call (columns as in the Partnership ledger, plus an Outcome column: used / unused / my mistake) |
| This Mac | M1, 8 GB, Blender 5.3 (VERIFIED). One heavy job at a time. Grokbot's handoff names a Mac Studio with `~/avt-render`; that folder is not on this Mac |

### His footage (VERIFIED with ffprobe, 26 Nov; all iPhone 14, 3840x2160 stored sideways, rotation -90, 24 fps, HEVC)

Folder on the T7: `/Volumes/T7/MEDITATE AVT ` (the name ends in a space; quote it).

| File | Length | What the frame at file 0:20 shows (OBSERVED) |
|---|---|---|
| `PERFORMANCE SHOTS/IMG_6547.MOV` | 214.62 s | wide, front on, camera low on the floor; he sits cross-legged on a cream cushion, hands together, whole body in frame, small in the frame; his black shoes on the floor to his left |
| `PERFORMANCE SHOTS/IMG_6548.MOV` | 183.03 s | close, low, about 45 degrees off his right side, looking up at him; whole seated body |
| `PERFORMANCE SHOTS/IMG_6549.MOV` | 203.58 s | close, low, side profile; his shoes in the foreground |
| `PERFORMANCE SHOTS/IMG_6550.MOV` | 197.03 s | medium, low, front quarter |
| `LIGHTING PLACEMENT/MEDITATE LIGHTING POSITIONS FOR BLENDER.MOV` | 35.01 s | his walk-round of where the lights stood, shot for the Blender build |

He wears a teal patterned robe with a yellow-gold trim, black trousers, glasses; white walls, a white door, a grey
panel, wood floor. One frame from each take: `/Volumes/T7/_avt_work/meditate_2026-11-26/takes_tile.jpg`.

Song: `/Volumes/T7/NUTRITION ALBUM/Exported Files/MEDITATE - [CLEAN].mp3`, 284.19 s (VERIFIED). No take is as long as
the song: find which stretch each take covers before planning anything (section 2, step 1).

## 1. Done

| What | Id | State |
|---|---|---|
| Takes located and probed | table above | VERIFIED |
| His Gemini sign-in in his Chrome | checked 25 Nov, plan label "Pro" | OBSERVED; nothing generated |

Nothing else. No sync, no matte, no scene, no generation.

## 2. Not done: the build, in order

Each step names the proven tool. Do not swap a tool before telling Fendi which one failed and what you measured.

| # | Step | Proven tool, unchanged | Price |
|---|---|---|---|
| 1 | Create the project, file the song, sync each take to the song, write both clocks (song and file) for every stretch | `avt_upload_asset`, `performance-sync`; skill `avt-music-video-build` §1-2 | $0 |
| 2 | Read each take before any design: where the camera stood, its height, lens, his distance, where his light comes from and how hard. Watch his lighting clip. Write the four cameras down as numbers | `scripts/edit/shoot_guide.py`, `scripts/edit/blender/measure_plate_light.py`; `docs/SHOT_RULES.md` rule of thumb | $0 |
| 3 | Ask Fendi ONE question: rock garden or dojo. Show one Gemini still of each, made on his Gemini plan (section 3). Everything after this depends on his answer | his Gemini plan in his Chrome | $0 on the API |
| 4 | Build ONE Blender scene with four cameras that copy his four takes (step 2) and lights that copy his lights. Show it to him EMPTY and MOVING before he is put in it | `scripts/edit/blender/` (`build_scene.py`, `room_layers.py`, `room_motion.py`, `verify_scene.py`); Hyenas and the Partnership bear wall are the worked examples | $0 |
| 5 | Cut him out of each take | `matte-video-proxy` (veed), used as delivered; measure with `scripts/edit/matte_stability.py --fg` | cents |
| 6 | Put him in the scene, seated on something built there (a stone, a mat, a platform) so his contact with the ground is the scene's | `scripts/edit/composite_over_plate.py` or `blender/comp_scene.py`; `--occlude-y` for the contact line | $0 |
| 7 | The fight around him (section 3) | Gemini plan first; else Gemini still + Seedance | his plan, or paid |
| 8 | Lens look, if wanted, LAST on each finished shot | `scripts/edit/lens_look.py`, `docs/recipes/LENS_LOOK.md` | $0 |
| 9 | Post each shot with its checks; place what he okays on the board that turn; send a picture timeline with every progress report | `docs/SHOT_RULES.md` 1-7, `scripts/edit/face_check.py` | $0 |

## 3. The fight: which route for which picture

- **Nobody of his in the picture** (fighters alone, cutaways, the yard before he is seen): his Gemini plan first.
  Fendi, 25 Nov: "All the pictures and video I sent came from Gemini including all the car montages"; he wants the plan
  used "when possible". There is no connector to it: either he makes the shot, or you drive `gemini.google.com` in his
  Chrome signed in as him. The website route has NOT been run by an agent yet: on the first still and the first clip
  check for a visible watermark and the size before anything goes on the board, and tell him how it went.
- **Fighters in the same frame as him** (the heart of the video): the fighters are generated INTO the Blender scene as
  seen by that take's camera, with the camera locked, and his real cut-out goes over them. Render the scene's empty
  frame from the take's camera, use it as the place, animate the fight on it (Seedance, `montage-shot` continuous, no
  him), then composite him. A fighter who passes in front of him needs that fighter's own matte laid over him. This is
  allowed by shot rule 4 as amended 24 Nov ("a free-flowing shot where the people look blended in"); a STILL picture of
  people with him on top is still banned.
- **HYPOTHESIS, untested: Runway Aleph 2.0 rebuilds the scene from his take** (he proposed it 24 Nov, and these takes
  are the "new footage" that test was waiting for: 24 fps, 4K, no swap). Contract and history:
  `supabase/functions/runway-video-edit-proxy/`, YSL smoke test of 23 Sept (it redrew his face). If you test it: one
  take, one stretch of at most 30 s, his real cut-out laid back over the result, and only after Fendi says yes in his
  own words. Unknowns: whether it will draw a fight at all, whether its light matches him, whether the size holds.
- Photoreal always: every prompt says it is real footage, not a render. `docs/recipes/PLATE_REALISM_PROMPT.md`. The
  first ambulance scene on Partnership was rejected ("looks AI generated and generic") because that page was not opened.
- Never Grok for anything that ships. Kling and Gemini video are not production routes for a shot with HIM in it.

## 4. Him blocking and dodging: the ALTER test, and its gate

DECISION (Fendi, 26 Nov, through Grokbot's handoff): a redraw of him is allowed in non-rapping shots when the face
passes the identity check or his original face pixels are put back. **Rapping shots keep his real face and mouth
from the original footage.** ALTER is approved for a rapping shot only if the lip-sync test proves it holds; otherwise
the original-face fallback. Generated lip-sync stays out.

So, in this video: every shot where he raps and sits still is his REAL take (sections 2-3), no redraw. A shot where he
blocks or dodges is an ALTER shot and waits for all three of: PR #534 merged with its mouth and identity gates
measured on his footage; Fendi's yes, in his words, to ONE 480p draft on one short stretch; that draft passing the
gates, or his real face and mouth put back over it. Take the stretch from the 4K original, not a small copy.
Do not plan the video around these shots: the video must work with him still.

## 5. Must-dos (each one is a mistake that already cost money)

Fendi's target for this video: **5-10 % of spend lost to agent mistakes** (Hyenas 19 %, Partnership 16 %, measured
25 Nov from the ledgers and his bills). Every paid mistake so far was in a shot with him in it.

1. Before any paid call, say in chat: the `docs/PROBLEM_INDEX.md` row or recipe, the approved asset it worked on, its
   Never list. Run it unchanged. No dollar figures in chat (his bills run well below the tool's estimates); keep the
   ledger.
2. Look before you pay: watch the take, look at every crop and every still before it is animated. Three cap swaps on
   Partnership were paid for a cap whose front the brim hid.
3. Three paid tries on one shot, then stop and tell him which method failed and what you measured.
4. One change per pass; measure the whole picture, his legs and feet too; watch the final file before posting.
5. **This video breaks shot rule 7 on purpose** (waist up, never his shoes): he is seated and seen whole. So the
   matte's bottom edge is the risk: his black trousers on a wood floor, the cream cushion, his shoes lying beside him
   in two takes. Measure it (`matte_stability.py`), keep the shoes out, and seat him on a built object. Never hold,
   fill or flow-carry a matte (PROBLEM_INDEX, mattes).
6. The scene is built to his clip, never his clip bent to the scene: camera, height, lens, distance and light come from
   the take. Light the scene to match him; do not regrade him.
7. His face and mouth are his footage. Nothing AI touches them in a rapping shot. Effects in post may (light, glow,
   colour); Grokbot's rules for post: no red on him, grain is one pass at the end, cuts and the song do not move.
8. He feeds the shots: an open slot is a question to him, not a job for the treatment writer. The twist is already
   his; play it deadpan (he never reacts to the fight).
9. T7 only for media (`/Volumes/T7/...`), never iCloud. Never a signed URL, token or key in chat, commit or PR. No
   media of him or the song in the repo. Lovable only for the backend.
10. A decision left in an open PR is lost: merge your own PRs once CI passes and the class's review gate is met
    (`docs/ARCHITECTURE_REVIEW.md`); he does not want to be asked.
11. He is not technical: decide technical things yourself, report in plain words, show pictures, never end a message
    with a list of shots waiting on his eye.

## 6. Cheap commands that tell the outcomes apart ($0)

```bash
# Is the T7 there? (no → stop and ask; never fall back to iCloud)
df -h /Volumes/T7 | tail -1
# Are the takes the ones described? (expect 3840x2160, 24/1, rotation -90, the four lengths above)
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate:format=duration -of default=nw=1 "/Volumes/T7/MEDITATE AVT /PERFORMANCE SHOTS/IMG_6547.MOV"
# Is ALTER usable yet? (PR 534 state MERGED and its METHOD page naming thresholds measured on his footage → yes)
gh pr view 534 --json state,mergedAt --jq '.state'
```

## 7. Report back

To Fendi, in plain words, with pictures: the rock garden / dojo choice (step 3), the empty moving scene (step 4), then
one finished shot before the rest. To the next agent: this file updated, the ledger, and a row in
`docs/PROBLEM_INDEX.md` for any new fix he approves (the file is at its length limit: remove a row to add one).
