# Prompt for the next agent — forest motion shot, after M5 (13 Oct 2026)

Copy everything below the line into the next session. It supersedes the A/B decision in
`PROMPT_GEMINI_FOREST_NEXT_2026-10-13.md` (Fendi chose B, then asked to keep testing; both are done).

---

You are continuing AVT's forest scene (repo `fendifrost-dot/ai-video-tool`, Lovable Supabase `qoyxgnkvjukovkrvdaiq`;
Control Center `fendifrost-dot/fendi-control-center`, Supabase `wkzwcfmvnwolgrdpnygc`). Read `CLAUDE.md` in both
repos. Lovable is the only SQL and deploy path; no Supabase CLI or dashboard; never ask Fendi for SQL or keys.

## State (main, 13 Oct)

| Item | State | Evidence |
|---|---|---|
| Gemini still path with real decode | LIVE | CC #63, AVT #245; every still since carries `imageUsable` |
| CC Grok image-to-video payload fix | LIVE | CC PR #66 merge `a08a1fc`, Lovable deploy 05:40:33 UTC, source_sha256 `2d59c809…`; M3–M5 succeeded through it |
| Recipe for still → 2 s motion | written | `docs/handoffs/FOREST_STILL_TO_MOTION_RECIPE_2026-10-13.md` |
| Approved clip | M5, asset `fed968b9-f95e-482f-a7b4-e713690583a3`, **`approved` by Fendi 13 Oct** (not yet on a shot or timeline) | two hands, clean wardrobe, push-in, identity holds; horse head never in frame; faint smile at the blink |
| All test assets | `pending`, notes start `TEST ONLY` | identity authority is still ORIGINAL `3fce9cb5` (approved) |

Spend on 13 Oct after the round-3 handoff: two Gemini stills, about $0.54 conditional estimate (invoice
unknown), and five Grok clips at $0.142 each by xAI usage ticks, $0.71 in total.

## Verify first (cheap)

1. `avt_select project_assets id in (3fce9cb5-…, fed968b9-…)`: both `approval_status` = `approved`. Otherwise stop
   and report.
2. `avt_select provider_jobs id=a078b4b7-6475-4271-8aec-11487159aefb`: `status` = `succeeded`,
   `result_asset_id` = `fed968b9-…`. Otherwise the record moved; report it.
3. An image-to-video call through `proxy-provider-call` → `video-providers-grok-generate` must return 200 with a
   `providerJobId`. A 422 mentioning `image: invalid type: string` means the CC deploy regressed; redeploy that one
   function via Lovable and say so.

## Next work, in order

1. **Place M5 in the cut.** Fendi approved it as one beat in a chopped sequence. Ask him which shot or story moment
   it belongs to, then assign it with `shot_asset_assignments` on that shot. Do not overwrite an existing selection
   on that shot without his say.
2. **More forest beats.** Use the recipe for neighbouring beats, including one with the horse's head in frame: generate two or three Gemini stills per attempt using V1 as the
   pose/hands guide (faceless crop) with a wider frame, ORIGINAL as `<IMAGE_0>`. Choose by looking for two hands
   and the horse's head, then blind-review against V1 under the Forest round protocol. Then run motion-v4 on the
   winner through the CC route.
3. **Fix the ingest metadata gap** (Class B in AVT): `ingest-provider-job` should copy cost (xAI usage ticks),
   prompt, prompt version and source still into the asset's metadata and set `provider_jobs.finalized_at`.
   Add a test, open a PR, merge, and redeploy that one function via Lovable.
4. **Replace CC's 60-cent Grok placeholder** with the measured rate, $0.071 per second, or read the usage ticks.

## Do not

- Do not edit sections 1 to 7 of `GEMINI_ROUND3_2026-10-12.md`; append dated sections.
- Do not treat a single-reviewer inspection as a verdict; motion clips have had no blind review yet.
- Do not animate any still that failed review, and do not approve or select anything without Fendi.

## Report back

Where M5 was placed, job and asset ids for anything new, per-run cost with its basis, defects stated plainly. End by
writing the next prompt in `docs/handoffs/`.
