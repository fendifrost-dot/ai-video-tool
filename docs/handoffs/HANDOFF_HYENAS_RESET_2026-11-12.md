# HANDOFF — Hyenas: reset after the Grok and likeness mistakes (12 Nov 2026)

**From:** Claude (AVT session) · **For:** the agent building Hyenas, Grokbot, and Fendi.
**Project:** Hyenas `87fc3244-de44-45a3-b2ba-7fe54222dc90`, board (variation) `f4971915-c776-47e7-abd5-91b4e25d4938` (no shots on it yet).
**Read first:** `CLAUDE.md` block "MODELS AND HIS LIKENESS", then `.claude/skills/avt-music-video-build/SKILL.md` §3b and §4.

## What Fendi said (12 Nov)

> "the Claude agent has made a few key mistakes first mistake it generated grok images and videos when we demoted grok for Gemini and kling. Second error was I shot one performance shot but wanted to use my likeness same outfit face etc in generated b role shots. The outfit looked pretty consistent but the person was clearly not me in the face. How do we get this right now for this video and at the same time make it so the workflow is clear."
>
> "Gemini is preferred"

On the workflow in general, not Hyenas (12 Nov): "we generated shot images with Gemini and then animated them with
genjitsu or seedance not Gemini or kling." That is the standing route: stills in Gemini, motion in Seedance or Genjutsu.

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
| Him in the jungle with the cars lined up | 1 | his real b-roll (standing or walking), matted and placed in the Gemini cars plate without him (`v3_car_*` or a new empty line-up plate), plate animated calm (Seedance, Animate the plate). SHOT_RULES 3–6 |
| Him driving, hyena riding passenger (day and night) | recipe F (E4), now | `montage-shot`: `@Video1` = the 7.3–14.8 s standing window of the dog b-roll (`2274f670`), cut from the 4K original waist-up; the lines put him at the wheel ("hands on the wheel, nothing else in his hands"); his face photographs from the tool. $2.219 per 4 s. No seated footage is needed (c026 was seated and never filmed) |
| Him stepping out of the fridge, granny | recipe F (E4), now | same window; the lines give the step out of the fridge. No walking footage is needed |
| v4 face test | ✗ | discard as a face source |

Every clip with him: `scripts/edit/face_check.py` against his face set, `scripts/edit/mouth_scan.py`, posted with the
sheet and the SHOT_RULES check. A face that does not read as him at phone size is a reject.

### Clips without him

Gemini still first, then animate it with Seedance (`montage-shot` b-roll or Animate the plate). Dry-run each. No
`grok-broll-proxy`. Note (VERIFIED 12 Nov): AVT holds no Seedance or Genjutsu job for Hyenas; if stills were animated
elsewhere (the Higgsfield app directly), those clips are not in the project and nobody can check or reuse them. File
them through `avt_upload_asset` with the model and the source still named.

## Code guard (Class C: coded and tested, needs sign-off and a redeploy)

Fendi, 12 Nov: "grok is good for certain things so I don't want to make it impossible to use but I guess if grok is
the right tool I can use grok imagine to generate for me with my ultimate subscription."

So the guard sits where the mistakes came from, the agents, and leaves the app's buttons alone:
`supabase/functions/avt-mcp` `avt_call` refuses a Grok generation (the `grok-*` generation functions, or
`world-still-proxy` without `model: "gemini-nano-banana-2.1"`) unless `grok_approval` carries his words. Dry runs, a
poll of a running Grok job and a Gemini job recovery pass. The refusal names the Gemini, Seedance and Genjutsu routes
and Grok Imagine. Tests: `supabase/functions/avt-mcp/contract.test.ts` "grokGate" (6 cases).

After merge: Lovable → Edge Functions → redeploy **`avt-mcp`**. Verify: `avt_call {function: "grok-broll-proxy", body:
{projectId, prompt: "x"}}` → refused with the routes named; the same with `body.dryRun: true` → the function's own
dry-run answer.

## Guardrails

- Do not re-enable the rejected Grok assets; do not use any generated still of him as his face.
- Do not use the performance take as `@Video1`: he raps through all of it. Use a non-rapping window of the dog b-roll.
- The b-roll is uploaded (`2274f670`); pick the window from its `mouth_scan.py` table, crop it waist-up from the 4K original.

## Report back

- The b-roll upload: path, sha256, duration, and the 4 s windows `mouth_scan.py` marks AT REST, with face width.
- One rung-2 test (the G-Wagon shot) with its face sheet before any batch. Fendi judges it.
- Spend per paid call in the project ledger.

Nothing in this handoff is verified beyond the rows, the scan and the contact sheet named above.

## Correction (12 Nov, later): the agent may generate him

The first version of this page and of CLAUDE.md said recipe F "needs real footage where his face is at least ~200 px
wide" and that a shot with no footage of the action is rewritten without his face. Both were wrong (no evidence; the
approved c026/c033/c039 were actions he never filmed). Fendi: "the face redraw isn't an issue". Proceed with recipe F
on the dog b-roll window for the driving and fridge shots; E1 for the cars line-up; judge each render with face_check.
