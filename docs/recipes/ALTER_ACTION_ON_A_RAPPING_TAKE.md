# ALTER: something happens in his take while he keeps rapping

**Status: passed once.** Meditate, `IMG_6550.MOV` 0:40 to 0:44, 480p: a fighter steps in and punches, he blocks with a
forearm, still rapping. Fendi, 26 Nov 2026: "the face redraw as generated looked clean. That's definitely a pass."
27 Nov: "The mouth looks fine to me on the lip sync as well ... from what I can see, the timing of the wording in the
lip sync was accurate." Record with every number: [`../alter/TEST_2026-11-26.md`](../alter/TEST_2026-11-26.md).
Test assets (Meditate): `f87ceffe` (raw draft), `d252fa41` (comparison).

**His limit on that pass:** "This is a short clip. If longer generations or other generations show a timing issue or
another issue, that's a separate issue that needs to be resolved." So every new draft is conformed, scored and shown to
him. This page is a route, not a blanket approval of clips not yet made.

**What it is:** the Seedance 2.5 video edit redraws the whole stretch, him included, following his real take. His face
and mouth in the result are a redraw, judged by the result (CLAUDE.md, "MODELS AND HIS LIKENESS", point 2). It is not a
mouth generated from audio: his own take drives it.

## When it fits

- A take where he FACES the camera. The tracker reads the two front Meditate takes on 96 of 96 frames; the low
  45-degree take on 9 and the profile on 3. A take the tracker cannot read cannot be scored, so it cannot be cleared.
- His head stays where it is and nothing crosses his face. A dodge that moves his head, or an arm across his face, has
  not been tested: the first one is a test, and the post says so.
- A stretch of at least 4 s (the provider bills an edit on the source length, 4 s minimum, in whole seconds).

## Run it

Environment: `~/.avt-venv/bin/python -I`, `AVT_MODELS="/Volumes/T7/Hyenas AVT edit/_avt_work/models"`, work files on
the T7 only. Say the method (this page), the asset it passed on and the Never list in chat before the paid step.

1. **Cut the window from the 4K original**, not a downscaled copy: waist-up, whole seconds, the take's own rate.
   The test used 1400 x 1400 at (480, 800) of the upright 2160 x 3840 frame; his face was 15% of the window's width.
   ```bash
   ffmpeg -ss 40 -t 4 -i IMG_6550.MOV -vf "crop=1400:1400:480:800" -r 24 -c:v libx264 -crf 14 -pix_fmt yuv420p -c:a aac take.mp4
   python -I scripts/alter/track_mouth.py track take.mp4 take.json     # face_found must be at least 80% of frames
   ```
   Look at the window before paying: his whole head, both hands, room at the edge the action enters from.
   Cut it at a constant 24 or 30 fps (`-r 24`): a variable-rate file is refused by the timing fix, and at 59.94 the
   conformed tail holds four frames, which the checker reads as frozen.
2. **Upload and sign.** `avt_upload_asset` the window to `project-clips/<user>/<project>/alter/<shot>/`;
   `avt_signed_url` it and three of his face photographs (`character_features`, `feature_type` face: neutral,
   three_quarter_left, three_quarter_right). Never print a signed link.
3. **Plan.** `avt_alter_plan` with `preset: "action"`, `who`, `slots.action` (what happens, with times in seconds: who
   enters from which edge, what he does, when it ends; say that nothing passes in front of his face and his head stays
   where it is), `slots.keep` (his clothes, his seat), `video_url`, `face_image_urls`, `project_id`. Read the prompt it
   returns. `ready` must be true: while anything is `blocked`, `draft` is null and there is nothing to send. `ready`
   means the request is well formed, nothing more. Building the plan sends nothing.
4. **Send: the paid step.** `avt_call` with the plan's `draft.function` and `draft.body`, unchanged. One generation per
   call. Keep the `providerJobId`; write the ledger row and a `provider_jobs` record row.
5. **Poll** with the plan's `poll` call (`id` = the `providerJobId`) from a background timer, never a foreground sleep.
   Download `resultUrl` to the T7 as `raw.mp4`. A failed request is not billed; read its message before re-sending.
6. **Conform, score, sheet, compare: one command.**
   ```bash
   python -I scripts/alter/run_draft.py --take take.mp4 --raw raw.mp4 --out work/ --mode action \
     --face neutral.jpg --face three_quarter_left.jpg --face three_quarter_right.jpg
   ```
   It prints the verdict and writes `draft.mp4` (on the take's clock), `score.json`, `report.json`, `face_sheet.jpg`
   and `compare.mp4` (take left, draft right, the take's audio, plays on a phone). `--mode` is the preset's check
   mode, printed in the plan's `after` line; it is required because `action` is the only mode with the motion gate
   off. Exit 0 = cleared, or everything measured passed and the face is his to judge; 1 = not cleared. On the passed
   draft it reads: stretch 1.0787, mouth timing 0.86 at 0 frames, shape 0.0515 (warn), face 96 of 96, CHECK with the
   face his to judge. `avt_alter_check` with `report` = the contents of `report.json` gives the same judgment from
   the server's gates.
7. **Watch `compare.mp4` and open `face_sheet.jpg` yourself**, the whole picture: his hands, the second person, the
   edges, the last frames. Then post both inline with the numbers, and say plainly what is open. With no identity
   number the tool never clears the face: Fendi does.
   **Record his verdict the same turn** (Fendi, 27 Nov 2026: the pass/fail line is tested inside the video being
   built, not on older projects). When what he says is about the face:
   `python -I scripts/alter/face_evidence.py add --run <out> --project <video> --label "<shot, draft>" --verdict pass|reject --words "<his words>"`
   with `AVT_FACE_EVIDENCE=/Volumes/T7/_avt_work/alter_face_evidence/<video>.jsonl`. A rejected face also takes
   `--fault who|steady|other` (not him / warps or slides). About something else: add `--about action|scene|mouth`. A draft the tool fails on the identity line is shown to him with its number before
   any re-roll. Method and the two measures: `../alter/IDENTITY_2026-11-27.md` "The test group".
8. **Full resolution, only after his pass on the draft.** `avt_alter_plan` again with the same arguments plus
   `draft_check` (the contents of `report.json`), `face_approval` (his words about that draft's face, quoted) and
   `resolution` (`720p` or `1080p`). The report is judged again from its numbers and must be for this preset's check
   mode. It returns `finalize`. That is a NEW render of the same request, not an upscale of the draft he saw: send it
   (step 4), then steps 5 to 7 again, and he sees it again. `finalize` is a checklist for you, not proof of anything:
   the server reads no video and cannot verify his words.
9. **On the board:** the conformed file with the take's audio (the plan's `audio.argv`), filed like any shot
   (`docs/recipes/MCP_UPLOAD_AND_FILE.md`), `metadata_json.derived_from` naming this page, the take, the window, the
   job and the scores.

## The gates (`supabase/functions/_shared/alter/gates.ts`)

| Check | Passes | Measured on |
|---|---|---|
| Mouth timing on the take's clock | at least 0.65, best fit within 1 frame | his footage, 26 Nov (`../alter/CALIBRATION_2026-11-26.md`) |
| Mouth shape | fail above 0.06 face widths, warn above 0.04 | same |
| Face read | 80% of frames in both clips | a decision |
| Structure kept, share changed | 0.45; 0.4% to 55% | the swap gates; the passed draft read 0.69 and 8.2% |
| Motion correlation, jumps | reported, not judged, in `action` mode | the passed draft read -0.16 with 33 "jumps": the added action itself |
| Identity distance | above 0.25 fails; under it clears nothing | the line is NOT certified (`../alter/IDENTITY_2026-11-27.md`): the passed draft read 0.021, him on other takes 0.21 to 0.30, no rejected face measured. Fendi's eye on the face sheet is the gate. The model is in `$AVT_MODELS` and scores every draft (Fendi, 27 Nov 2026: no stop over its licence line) |

## Never

| Never | Why |
|---|---|
| The edit wording ("Edit @Video1 ...") on `seedance-2.5-reference`, `montage-shot` or any reference-to-video endpoint | refused by the provider before rendering (request `01a21ac7`, 26 Nov) |
| Score, show or cut in a draft as delivered | it is about 7% fast: a good draft reads 0.15 and looks re-timed |
| Lay his original face back onto the redraw (`track_mouth.py putback`) | Fendi, 27 Nov: "Clip 3 is the putback. That's the fail. The face was warping on clip 3." |
| A take where he is side-on or low | the tracker reads his face on 3% to 9% of frames: nothing can be scored |
| `generate_audio: true`, or a mouth made from audio | his take's audio goes back on; generated lip-sync stays out |
| fal, Scenario or Runway for this edit | list price read 27 Nov: Higgsfield bills the edit's seconds once ($0.1387 / $0.3264 / $0.7858 per second at 480p / 720p / 1080p) and not the source clip; fal bills both at about twice the total; Scenario on his Starter plan cost about 2.4 times as much for the same job |
| A fourth paid try on one shot | stop after three and tell him which step failed and what you measured |

## Not tested yet (say so when you use one)

- 720p and 1080p. A stretch longer than 4 s. A dodge or any head move. The wide take. A second roll of one request.
- The provider's own draft-then-finalize path. Its playground lists `bytedance/seedance-2.5/finalize-draft`
  (`draft_id`, `resolution: "1080p"`) and a `draft` switch on the edit; neither is in its API docs, neither is wired in
  Control Center. It would make the approved 480p draft the delivered clip. Until then full resolution is a new render.
- A certified identity line. The model's checksum is pinned and the first readings are in
  `../alter/IDENTITY_2026-11-27.md`, and the model is in `$AVT_MODELS`, so every draft gets its number (Fendi,
  27 Nov 2026: the model's licence line is not a stop; do not park the model or the work over it). What is missing
  is evidence for the line: no face he rejected has been measured. A number never clears his face until the line is
  certified.
- A face-steadiness gate. The put-back's warp scored BETTER on the mouth gate (0.931) and on identity (0.010) than
  the clean redraw. Two steadiness numbers (`face_steadiness` in the `run_draft.py` summary) read that one pair the
  right way round, 1.58 and 1.22 against 0.77 and 0.88 (the take against its own small copy: 0.90 and 1.10), but
  one pair is not a line: they are printed with every draft, recorded when he judges it, and gate nothing.
  Watch the face in motion; a still sheet cannot show it.
