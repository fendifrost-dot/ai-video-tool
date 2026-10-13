# Forest still-to-motion recipe (13 Oct 2026)

What worked today, as a repeatable recipe for one 2 s shot. Evidence for every line is in
`docs/review/gemini_2026-10-12/data/forest_round_jobs.json` (`option_b_2026-10-13`, `motion_test_2026-10-13`).
Nothing here is a production selection; every asset named is `pending` and labelled TEST ONLY.

## 1. Still (Gemini via `world-still-proxy`)

1. Insert a queued `provider_jobs` row (`provider: gemini`).
2. Call `world-still-proxy` with `projectId`, `jobRowId`, `model: gemini-nano-banana-2.1`, `resolution: 2k`,
   `aspectRatio: 4:5`, `maxCostUsd: 0.28`, `references` (ORIGINAL `3fce9cb5` as `cast`, always `<IMAGE_0>`;
   faceless guides as `garment`/`prop`), `prompt`, `promptVersion`, `shotLabel`. The body field is `projectId`
   (a body with only `avt_project_id` is refused 400 `missing_project_id`).
3. Accept the still only if the response says `imageUsable: true` and `stages.decode: usable`.
4. Cost: about $0.27 conditional estimate per still; usage-based about $0.075–$0.08; invoice unknown.

**Known limit:** asking for "both hands visible" has failed in five stills (F2–F5) including with a hands crop.
V1 (`65494df1`) is the only still with two hands. Treat hands as luck, and choose the source still by looking.

## 2. Motion (Grok image-to-video)

Two working routes:

| Route | Calls | Records |
|---|---|---|
| CC (fixed in CC PR #66, live 05:40 UTC) | `proxy-provider-call` → `video-providers-grok-generate` (`referenceImageUrl` = signed URL, `duration: 2`, `aspectRatio: 3:4`, `settings.resolution: 720p`); poll `video-providers-job-status?provider=grok&id=`; then `ingest-provider-job {jobId}` | asset in `project-clips`, but with **no** cost, prompt or source in metadata and `finalized_at` left null; record those yourself |
| AVT `grok-broll-proxy` | `mode: submit` with `imagePath` + `imageBucket`, then `mode: poll` with the same `requestId` | full metadata including `actual_cost_usd` |

- Cost: **$0.142 per 2 s clip** (xAI usage ticks, four clips identical). CC's 60-cent figure is a placeholder.
- Output: 848×1056, 49 frames, 24 fps, 2.04 s. Grok has no 4:5; 3:4 crops the 4:5 still slightly.
- Seed: not exposed.

### Motion prompt that holds (motion-v4)

Lock these in every motion prompt; each line fixed a defect seen in a test clip:

- **Expression pinned** (fixes M1's smile): "Her expression does not change at all for the whole two seconds:
  exactly the expression in the picture, lips closed and relaxed, no smile, no grin, no teeth showing, no talking;
  she only blinks once."
- **Camera** (M3, M4): "The camera slowly and smoothly pushes in toward her face, a gentle dolly move with no shake,
  ending a little closer than it starts." Static also works (M2).
- **Embers off the wardrobe** (M4 grew a glowing lapel spot): "embers and thin smoke drift slowly through the air
  behind her; no ember or spark ever lands on or sticks to her blazer, shirt, gloves, hair or face, and her clothes
  stay plain black and white with no glowing spot, pin or badge."
- Pose hold, horse breathing only, fire flicker, wardrobe and tack unchanged, no text or logo.

## 3. Inspect before calling anything usable

Extract frames 0, 12, 24, 36, 48 and the last frame; check expression, hands, identity against ORIGINAL, anything
newly appearing on the wardrobe, and lettering. A clip is a candidate only after a blind review against ORIGINAL,
and it stays `pending` until Fendi selects it.
