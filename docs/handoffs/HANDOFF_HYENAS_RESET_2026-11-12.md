# HANDOFF — Hyenas: reset after the Grok and likeness mistakes (12 Nov 2026)

**From:** Claude (AVT session) · **For:** the agent building Hyenas, Grokbot, and Fendi.
**Project:** Hyenas `87fc3244-de44-45a3-b2ba-7fe54222dc90`, board (variation) `f4971915-c776-47e7-abd5-91b4e25d4938` (no shots on it yet).
**Read first:** `CLAUDE.md` block "MODELS AND HIS LIKENESS", then `.claude/skills/avt-music-video-build/SKILL.md` §3b and §4.

## What Fendi said (12 Nov)

> "the Claude agent has made a few key mistakes first mistake it generated grok images and videos when we demoted grok for Gemini and kling. Second error was I shot one performance shot but wanted to use my likeness same outfit face etc in generated b role shots. The outfit looked pretty consistent but the person was clearly not me in the face. How do we get this right now for this video and at the same time make it so the workflow is clear."
>
> "Gemini is preferred"

## What happened (VERIFIED from the project's rows, 12 Nov)

| | Count | Model | Spend (list) | Now |
|---|---|---|---|---|
| Grok stills (plates, cutaways, realism tests), 01:40–07:22 UTC | 19 | `grok-imagine-image-quality` | 19 × $0.07 = $1.33 | `approval_status: rejected` (12 Nov, policy) |
| Grok text-to-video b-roll (`grok-broll-proxy`), 06:59–07:06 UTC | 11 | `grok-imagine-video` | $3.24 | `approval_status: rejected` (12 Nov, policy) |
| Gemini stills without him (realism tests, cutaways "real v2", granny, horns, impala, four cars, plates) | 21 | `gemini-nano-banana-2.1` | 21 × ≈ $0.27 | pending, usable |
| Gemini stills WITH him (cars line-up, G-Wagon day/night, fridge step-out, v4 face test) | 5 | `gemini-nano-banana-2.1` | 5 × ≈ $0.27 | pending; **layout sketches only, never a source of his face** |

Why Grok was used: the 9 Nov Gemini decision lived only in PR #471, which was never merged; `main` had no rule, the
tool's still default is Grok, and `grok-broll-proxy` is Grok-only. The agent switched to Gemini at 07:38 on its own.

Why the face is wrong: the likeness references are three frames of the phone performance take
(`likeness/fendi_outfit_upper.jpg`, `_fullbody.jpg`, `_fullbody_b.jpg`). His face is about 100 px wide in that take
(VERIFIED, `scripts/edit/mouth_scan.py`, face width 94–100 px), and the take has **no 4-second stretch with his mouth
at rest** (quietest window 0.17–4.17 s, mean lip gap 0.084, still "moving" by the 0.08 rule). Gemini kept the MODEST
jersey, the cap and the glasses and invented the face (OBSERVED, contact sheet of the five stills against the three
real frames). Animating those stills can only drift further.

## What fixes it

### Now, from Fendi (the one thing no agent can do)

**Upload the dog b-roll.** The asset note on the performance take says: "Dog B-roll is earlier in the same file (about
0–95 s)" of `Hyenas B Roll & Performance.MOV`, the 4K original on the T7. That is real footage of him in the same
outfit, most likely with his mouth at rest. It is rung 1 and the source for rung 2. Upload it to the project as it
is (4K, no re-encode), or have the Mac agent cut 0–95 s with `ffmpeg -ss 0 -t 95 -c copy` and upload through
`avt_upload_asset` (`project-references/<owner>/87fc3244-…/hyenas_broll_0-95_4k.mp4`).

If the shots need more than the dog walk: 30–60 s more of him in the outfit, mouth closed, face to camera and
three-quarter, standing, walking, sitting at a wheel, his face filling a fifth of the frame width, in night-ish light.

### Then, per shot with him (the likeness ladder)

| Shot (from the Gemini sketches) | Rung | How |
|---|---|---|
| Him in the jungle with the cars lined up | 1 | his real b-roll (standing or walking), matted and placed in the Gemini cars plate without him (`v3_car_*` or a new empty line-up plate), plate animated calm (Gemini video first). SHOT_RULES 3–6 |
| Him driving, hyena riding passenger (day and night) | 2, or 1 if he films a seated take | recipe F (`montage-shot`): `@Video1` = a 4 s mouth-at-rest window of his real footage in the outfit, the G-Wagon interior plate without him, his face photographs from the tool. $2.219 per 4 s |
| Him stepping out of the fridge, granny | 2 | recipe F on the kitchen plate without him (`v3_granny_jungle` style, him removed), `@Video1` = a walking window of his b-roll |
| v4 face test | ✗ | discard as a face source |

Every clip with him: `scripts/edit/face_check.py` against his face set, `scripts/edit/mouth_scan.py`, posted with the
sheet and the SHOT_RULES check. A face that does not read as him at phone size is a reject.

### Clips without him

Gemini Omni Flash first (image-to-video from the approved Gemini still; 1.2 in the Higgsfield catalogue, 1.1 via
Runway in `runway-video-edit-proxy`), Kling second. Dry-run each. No `grok-broll-proxy`.

## Code guard (Class C, not built; needs sign-off)

So the policy cannot be skipped by an agent that did not read the docs:

1. `world-still-proxy`: refuse a request without `model` unless `draft: true`; the refusal names
   `gemini-nano-banana-2.1`. Dry-run test for both paths.
2. `grok-broll-proxy`: refuse unless `draft: true`, the refusal points to the Gemini video route.
3. Redeploy both in Lovable → Edge Functions after merge. Verify: a dry run without `model` → 400 `model_required`.

## Guardrails

- Do not re-enable the rejected Grok assets; do not use any generated still of him as his face.
- Do not generate him from the performance take: there is no mouth-at-rest window in it and his face is too small.
- Do not start rung-2 renders before the b-roll is uploaded and a window is picked with `mouth_scan.py`.

## Report back

- The b-roll upload: path, sha256, duration, and the 4 s windows `mouth_scan.py` marks AT REST, with face width.
- One rung-2 test (the G-Wagon shot) with its face sheet before any batch. Fendi judges it.
- Spend per paid call in the project ledger.

Nothing in this handoff is verified beyond the rows, the scan and the contact sheet named above.
