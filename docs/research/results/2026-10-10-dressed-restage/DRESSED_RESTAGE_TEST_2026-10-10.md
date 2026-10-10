# Dressed restaging — his take put into the generated place and dressed in one request · 10 October 2026

**Status: FAILED for production acceptance (the director, 10 Oct 2026).** "Treat the two reported performance tests
as unsuccessful for production acceptance: one redraws my face and leads the lips by approximately a quarter second;
the other fails to follow my head turn." Neither is selected, neither is scaled; both assets are marked rejected with
this verdict in their notes. The method stays an experimental option only (draft PR #227, unmerged).

Measured on every frame after the verdict (`scripts/qa/reference_fidelity.py` scan, 60 fps on the take, 24 fps on the
results): in test 2 his head turn reads about 0 for the whole clip while the take turns away from 0.9 s to 2.4 s
(VERIFIED — the movement is not followed); in test 1 the mouth is open from the first frame while his opens at 0.1 s,
and between 2.9 s and 3.5 s it is two to five times wider open than his (OBSERVED — not only a lead; the mouth does
not track). Lip sync has not been judged by ear by anyone: it is UNVERIFIED by ear and failed by measurement.

What follows is the record as written before the verdict.

Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## Why this was run

The director, 9 Oct 2026 23:04 (America/Chicago), after seeing shots 19–24 of Interrupted Broadcast still playing the
raw take and two clothing-swap tests on the closet footage:

> "The performance shot was never meant to be a stand alone shot. That footage is supposed to be incorporated in some
> of the AI footage and the clothing swap is to be utilized when inputting me in the AI footage."

The board says the same of these shots (`production.method: "restage"`, note "Treatment wardrobe replaces the filmed
clothes."), and the tool refuses it: `route.ts` answers "A restaging keeps the clothes of the take … that needs the
garment lane". So the request was built by hand, in the shape the app's Restage builds, through the app's own function
(`proxy-provider-call` → `video-providers-higgsfield-model`, `seedance-2.5-reference`), with one addition: the garment
photographs go with the place picture and the prompt says he wears those and not the take's clothes.

## What was sent (VERIFIED — the two job rows)

| | test 1 — medium | test 2 — close-up |
|---|---|---|
| job row | `bb645697-abb5-4b51-ac53-cc43a36c13ab` | `78f876e4-1c1c-4fef-876e-af8918029fb3` |
| provider request | `760797b0-53e6-4909-a7da-f2b64254bf17` | `e8144d22-9ca0-4579-9e55-ec0768bb6735` |
| result asset | `10382e39-0074-4f3f-ad44-a31da2cfc853` | `90947ee2-b06a-415d-9038-71512eb79af8` |
| submitted → filed (UTC) | 04:10:22 → 04:15:04 | 04:32:30 → 04:52:07 |
| the one thing changed | — | the framing sentence: the app's `close_up` words in place of its `medium` words |

Both, otherwise identical:

- `@Video1` — 4.0 s of his take for shot 19, the app's own cut of 3 Oct (asset `cc76f6a3-5489-4e6f-98d2-8cf7efcdf03b`,
  take 72.673–76.677 s = song 73.53–77.53 s; 1080×1920, 59.94 fps). Camouflage shirt, navy cap, his clear glasses.
- `@Image1` — shot 19's place picture, drawn empty: the El-train street at night (asset `228cbf43…`,
  `worlds/storyboard_c019_muzn0yxe_2.png`).
- `@Image2` — the coat's wardrobe photograph (`character_features` `fb82c0d2-958b-4cfa-a335-d06977b1c963`, "Coat in
  Bubbled Lambskin - Noir", 920×980).
- `@Image3` — the cap's wardrobe photograph (`07e6dcbe-5c56-4e2d-862e-3b22aca8d93d`, "Saint Laurent Cap in Cotton
  Gabardine - Beige and Ivory", 920×500, 12 KB).
- 4 s, 720p, 9:16, no audio. No `shotId` on either job, on purpose: the server filed both in the library and selected
  nothing.

Prompt (test 1; test 2 differs only in the words between "second camera:" and "Never show"):

> @Video1 is the performer, rapping to camera. Re-shoot the exact same performance from a second camera: a medium shot
> from the waist up, static, and that is the widest frame of the shot. Never show more of his body than @Video1 shows,
> in any frame from the first to the last: whatever is out of frame in @Video1 stays out of frame here. Keep his face,
> skin, beard, build and his own clear glasses identical to @Video1 — and most of all the same mouth movements at the
> same moments, word for word, in sync with @Video1 from the first frame to the last. He does NOT wear the clothes of
> @Video1. He wears the coat of @Image2 — glossy black crinkled leather, a pointed fold-down collar, one row of black
> buttons, long sleeves — buttoned over a button-up shirt and a tie that show only at the neck, and, in place of the
> navy cap, the cap of @Image3 — beige, with SAINT LAURENT in ivory on its front — worn forwards. Reproduce both
> garments exactly as their pictures show them. Place him inside the environment of @Image1, lit only by the light that
> environment has: where @Image1 is dark he is dark, and nothing adds a key light, a fill light or a glow on him that
> the place does not have. He has no bright outline, halo or cut-out edge against the background, and he has the same
> focus and grain as the place. The environment is still, only he and the camera move. 24fps film grain. Cinematic,
> gritty, found-footage aesthetic. No clean or polished shots; it always feels captured in the moment.

The garment facts in it (crinkled leather, pointed collar, one row of buttons) were read off the two photographs by the
agent. The wardrobe records hold no such words — only the labels above.

VERIFIED: the provider accepted three reference pictures beside the take on both requests. NOT verified: that it would
take more; that the picture order is what `@Image2` / `@Image3` address (the results are consistent with it — coat from
one, cap from the other).

## What came back

Frames: `test1_medium_frames.jpg` (take above, result below, every half second), `test1_medium_body.jpg`,
`test1_medium_faces.jpg`, `test2_closeup_frames.jpg`, `test2_closeup_detail.jpg`. Both results 720×1280, 24 fps, 4.04 s.

Measured with `scripts/qa/reference_fidelity.py --fps 24` against the 4 s cut (the `*_fidelity.json` beside this
file). The gate numbers are the repo's own for a re-drawn angle on a sung line (`config/coverage_presets.json` →
`rules.angle_gate`: identity ≤ 0.25, lip best fit ≥ 0.6).

| | identity (≤ 0.25) | lip, best fit (≥ 0.6) | lip on the take's clock | camera change |
|---|---|---|---|---|
| route 1 — Grok video edit on the closet footage | 0.252 | 0.877 | 0.796 | 0.19 |
| route 2 — Runway video edit on the closet footage | 0.140 | 0.580 | −0.011 | 0.29 |
| **route 3, test 1 — medium** | **0.159** | **0.749** | 0.457 | 0.92 |
| **route 3, test 2 — close-up** | **0.133** | **0.675** | 0.586 | 1.00 |

How far to trust the lip numbers (OBSERVED): the clip is 4 s, his face is hidden while he turns, and the mouth series
has gaps — the fit's `retime` came back 0.78, 1.24, 1.21 and 1.27 on four clips that are all 4 s from a 4 s source, so
its retime is not a measurement here. Holding the speed at 1, test 1's mouth matches best about a quarter second
EARLY (0.66). The mouth is also wider open than his throughout (mean opening 0.20 against 0.12).

**Test 1 — medium (OBSERVED on sampled frames):**
- Held: every pose, both arm crosses and the turn of the head follow the take at each sampled time; he stands in the
  street and is lit by it, no halo, no flicker; coat is black crinkled leather, single-breasted, pointed collar, one
  row of buttons, over a shirt and tie; his glasses are kept.
- Off: SAINT LAURENT cannot be read on the cap at this size (the cap is about 55 pixels wide, and the lettering is
  ivory on beige); the coat ends at the hip and the lapel changes a little between frames; the face is drawn again by
  the model.

**Test 2 — close-up (OBSERVED on sampled frames):**
- Held: the cap reads SAINT LAURENT across its front; his glasses are kept in detail; glossy leather collar with a
  button; the street and its light; no flicker.
- Off: **the take's turn of the head (about 1.2–2.5 s) is not followed — he faces the lens throughout**; no tie shows
  at the collar; it reads as a phone held at arm's length, not a locked-off camera; the face is drawn again by the model
  and now fills the frame.

## Against the rules on file

- `CLAUDE.md` kill criterion (short 2–4 s test): "if it cannot hold Fendi's identity + exact jacket construction +
  stripe/logo placement + natural occlusion without visible flicker/morphing, STOP and redesign before scaling."
  Reading (OBSERVED, the agent's, not a verdict): identity is inside the repo's gate on both; construction is close,
  not exact (length, lapel); lettering is unreadable at medium size and readable in close-up; arms cross over the coat
  naturally; no flicker; a small lapel change frame to frame. **It does not cleanly pass as written, and it is not the
  agent's to pass.**
- `CLAUDE.md` hard product rule 2: "No AI-regeneration of garment imagery; pixel preservation is mandatory." This
  route regenerates the garments by construction. So does every still on this board that sends a garment photograph
  to the image model. Whether rule 2 governs wardrobe *asset processing* only, or what a shot may show, is the
  director's to say.
- `docs/VIDEO_SWAP_ARCHITECTURE.md` (LOCKED): the production path for a garment swap is keyframe + propagation,
  composited onto the original footage. This route is neither lane A nor lane B of that document and composites
  nothing: the whole frame is drawn again.

## Cost

Control Center's estimate on each request: 185 cents. The repo's rule (`seedanceUsd`, the provider's token rule,
matched to real charges at 720p with a 4 s source and ONE picture): $2.22 each. Billed: not readable from here
(`costFinalCents` null on both). HYPOTHESIS: two extra pictures do not change the charge — the published rule says
image references are not billed; test: the two charges on the provider's ledger.

## DECISION NEEDED (the director's)

1. **Is this the route for the performance shots?** Yes / no / yes for some framings. The evidence is the two clips
   and the sheets here.
2. If yes: **rule 2 and the LOCKED architecture need a dated line from him** saying a restaged performance may be
   dressed by the video model from garment photographs — the doc's own last line requires it ("explicit and dated in
   this file — never by a silent drift in runtime code").
3. If yes: **which pieces go as pictures.** Two garment photographs is all that has been seen to work. The leather-coat
   outfit has four pieces (coat, trousers, cap, glasses); in both tests his own glasses came through from the take and
   the trousers are out of frame.

RECOMMENDATION: medium and wide framings only, coat + cap as the two pictures, glasses left to the take; the close-ups
(shots 20 and 24) and the mouth shots (21–23) stay on his real footage or go to a route that keeps his real mouth —
test 2 dropped a movement, and a redrawn mouth a quarter second off is the first thing seen in a close-up of a sung
line (`SEEDANCE_MULTIANGLE_TEST_2026-10-02.md`: "not yet for a full line of on-mic close-up").

## What is NOT verified

- Anything by ear or at speed in a browser: frames were sampled; the song was laid under the comparison clips for the
  director, not listened to by the agent.
- The billed amounts.
- A request with more than three pictures, with one garment only, or with the wording the tool would build (labels and
  the outfit's words instead of hand-read garment facts).
- A shot longer than 4 s, a timed change inside the shot, or the blizzard place.
