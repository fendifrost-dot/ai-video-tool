# Prompt for the next agent — fast-cut pace, director clip lengths, clothing-swap benchmark (15 Oct 2026)

Copy everything below the line into the next session.

---

You are continuing AVT (repo `fendifrost-dot/ai-video-tool`, Lovable Supabase `qoyxgnkvjukovkrvdaiq`, Lovable project
`bd21b544-c7b8-4780-bdde-391ac9d4bfa8`).
- Read `CLAUDE.md` first. Lovable is the only SQL and deploy path.
- Post every generated clip and still into the chat as soon as it exists.
- The clothing-swap work is governed by the LOCKED video garment-swap section and `docs/VIDEO_SWAP_ARCHITECTURE.md`.

## What Fendi asked (14 Oct)

1. "we want … 1.5 or 3 second clips … more fast paced as opposed to … a movie shot … for the majority of the music
   videos". Then "Complete everything you suggested".
2. "we want this to run in the event that Claude is not available … the structure of the tool needs to be robust and
   easy to manipulate clip lengths and video optimization."
3. The clothing swap on his performance footage was never right. The first version had the right clothes but terrible
   video; the second never got a correct swap. He wants himself, dressed, put into the AI footage.

## Done

| Item | State | Evidence |
|---|---|---|
| Fast-cut pace (default), director-set lengths, "Re-cut at this pace (candidate)" | merged `200681b` (PR #257) | architecture APPROVE (3 rounds) and security APPROVE (2 rounds), recorded in the PR; 2,686 tests; CI green |
| Treatment page card "Pace and clip lengths" | in #257 | Fast / Cinematic choice; seconds for high, mid and low energy; live shot count; warns when the lengths force a cinematic cut |
| Frontend publish | live (OBSERVED ~00:12 UTC 15 Oct, second `deploy_project`; the first ran before Lovable synced the merge) | `projects._id.treatment-CAkpvDun.js` contains "Pace and clip lengths" and "Re-cut at this pace" |
| `treatment-writer-proxy` redeploy (its new short-shot rule) | deployed from `200681b` (Lovable reply to `umsg_01m4ye103rfe9stybychrgmbsh`) | source_sha256 `4d338298…`; unauthenticated POST answers 401 |
| Pacing preview, 0:00–1:11 of YSL, 39 shots | posted in chat | existing clips re-cut into the fast slots; not new scenes; not in the repo (it contains the song) |
| Swap keyframe (Grok garment edit, coat only) on take shot 19, frame 0 | look `3bb1dafd-891b-48aa-b06a-720d52fd6e41`, $0.12 | `look-composites/…/3bb1dafd….jpg`; pose, face and room kept, coat construction right (OBSERVED by the agent; Fendi has not judged it) |

## Swap benchmark status

The test runs on take shot 19, asset `cc76f6a3`: 4.0 s, 1080×1920, 59.94 fps.

- **Arm A — Runway aleph2 with the keyframe at 0 s: BLOCKED.**
  - Runway refused the source: "Input video exceeds the 30fps limit: source is 59.94fps".
  - Job row `19482d10-6d7e-4f6e-88d1-619cd966d8b6`, CC job `35102ff8…`, Runway task `c495048c-18a7-40bd-881b-d47836fe3645`.
  - It failed at intake, so it is likely unbilled. Confirm on the Runway invoice.
  - **Tool fix needed:** `runway-video-edit-proxy` must conform the source to ≤ 30 fps server-side before submitting. This is Class C (providers). A Fal ffmpeg model on the CC allowlist is the likely route; verify which one.
  - The agent could not make a 30 fps copy itself. No AVT function stores an arbitrary video from bytes or a URL: `upload-asset` needs a user JWT with raw bytes, and `fetch-reference-image` takes images only.
- **Arm B — Higgsfield Genjutsu object-swap, 720p, coat + cap: submitted.**
  - CC job `a7bb6a7e-5578-4b64-8692-242870bb541b`, Higgsfield request `2fa69e06-b097-4946-b2b3-b1aa81894662`.
  - Expected cost $0.681 per source second, rounded up: $2.72 for 4 s, or $3.41 if 4.004 s rounds to 5 s. CC's estimate field said 68 ¢, which is one second only.
  - **Result: completed.**
    - Output: `https://d3u0tzju9qaucj.cloudfront.net/45ee058b-986d-49f2-adc9-280bbafe42a2/bf7c24d0-2847-48d8-9c23-25daf20cbdfc.mp4` (Higgsfield CDN).
    - It is **not filed in AVT**: the CC `video_to_video` route leaves no provider_jobs row. Note this ingest gap.
    - Posted to Fendi side by side with the take, with the take's audio.
  - **OBSERVED by the agent, not a verdict:**
    - Coat and beige cap are swapped on every frame.
    - Head turns and arm movements are followed.
    - Output is 720×1280 at 24 fps and **3.71 s against the take's 4.00 s**, the same ~7 % speed-up seen on 1 Oct. Mouth and gesture timing therefore drift ahead of the take toward the end.
    - No SAINT LAURENT lettering is readable on the cap.
    - It is softer than the 1080p take.
    - The glasses frames look heavier in the last second.
  - Fendi gives the verdict.
  - Status is polled with `proxy-provider-call` → `video-providers-job-status {provider: higgsfield, id: 2fa69e06-…}`. CC's own job id answers 404 there; use the Higgsfield request id.

## Verify first (cheap)

1. **Published bundle:** crawl `https://aivideotool.lovable.app` chunks (`Accept-Encoding: identity`) and grep for `Pace and clip lengths`. Absent means the frontend is not live; call `deploy_project` again.
2. **Writer redeploy:** read Lovable message `umsg_01m4ye103rfe9stybychrgmbsh`. It must name `treatment-writer-proxy` and a successful deploy.
3. **Arm B:** if it is not already in the chat, fetch the result, post it, and judge it on the four kill-criterion points:
   - identity;
   - exact coat construction;
   - cap and logo;
   - natural occlusion with no flicker or morphing.

   Fendi gives the verdict. An agent never approves its own benchmark.

## Next

1. Fix Arm A's fps intake (above), then run aleph2 with keyframe `3bb1dafd` at 0 s. Add a second keyframe near 2.5 s if the coat drifts. About $1.12.
2. **YSL fast board:** on the Treatment page press "Re-cut at this pace (candidate)…".
   - This is one writer run of about 100 shots, about $1.9 estimated.
   - It makes a NEW variation; the current board is untouched.
   - Do it only with Fendi watching or approving, because it also commits him to filling about 100 slots.
3. **Put him, dressed, into the AI scenes:** that is the restage lane plus the winning swap arm. It is gated on the kill criterion.

## Do not

- Do not scale any swap route before Fendi passes the 2–4 s test.
- Do not overwrite a selected clip. Add alternates only.
- Do not mark anything verified from tests alone. Cite the live row, the published bundle, or the output file.
