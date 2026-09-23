# Handoff → Claude Code: fix the Gemini Omni Flash 1.1 connection in Control Center (edit-mode `ratio` / `contentModeration`)

Date: 2026-09-23 · From: Claude (Cowork, AVT full takeover) · Owner after this: Claude Code · Approver: Fendi

## What is broken, in one paragraph

AVT's `runway-video-edit-proxy` now works end to end behind Control Center (Aleph 2.0 on S08 completed today, task `985fe022-c79d-45c8-88cf-235c33bd4681`). The second smoke model, `gemini_omni_flash_1.1`, cannot run: Runway's `video_to_video` **edit mode** rejects two body keys with HTTP 400 (both unbilled), and Control Center adds one of them itself. Observed verbatim from Runway on 2026-09-23:

1. `{"error":"Validation of body failed","issues":[{"code":"unrecognized_keys","keys":["contentModeration"]}]}`
2. `` `ratio` may only be provided in reference mode. In edit mode, output orientation follows the input video and resolution is 720p. ``

The AVT side already stopped sending both (AVT main `e44c294` and `a352e37`, deployed). Control Center's `contract.ts` still injects `ratio: "720:1280"` from its model table for `gemini_omni_flash_1.1` (`model.ratio ?? body.ratio`) and forwards `contentModeration` whenever a caller passes it. Until Control Center changes, every Omni Flash submit dies at Runway with error 2. Aleph 2.0 (`aleph2` contract) is unaffected — it accepts `contentModeration` and has no `ratio`.

## The change (2 files, already written and tested — apply as-is)

Repo: `fendifrost-dot/fendi-control-center` · function: `supabase/functions/video-providers-runway-video-edit/`

The complete diff is committed next to this note in the AVT repo: `docs/handoffs/cc_omni_edit_mode.patch` — from the Control Center repo root, `git apply <path-to-avt>/docs/handoffs/cc_omni_edit_mode.patch` against `cfeb26e` (current Control Center main). This note lives in AVT because the Control Center repo could not be written from the session that produced the fix. In words:

`contract.ts`
- In `RUNWAY_VIDEO_EDIT_MODELS["gemini_omni_flash_1.1"]`: delete `ratio: "720:1280",` and extend `source` with the observed Runway rule (edit mode: `ratio` rejected, orientation follows the input at 720p; `contentModeration` rejected as unrecognized).
- In `buildRunwayRequest`, mode_edit branch: remove `...(body.contentModeration ? { contentModeration: body.contentModeration } : {})`. Keep `...(model.ratio ? { ratio: body.ratio ?? model.ratio } : {})` so a future model that documents an edit-mode ratio can opt back in via its table entry — with `ratio` gone from the Omni entry, nothing is sent today. Replace the old comment with the reason.

`contract.test.ts`
- Rename the test `"builds the mode_edit contract with references, ratio and duration auto"` to `"builds the mode_edit contract with references and duration auto, and never sends ratio or contentModeration in edit mode"`; pass `contentModeration: { publicFigureThreshold: "low" }` in the Omni input and assert `omni.ratio === undefined` and `omni.contentModeration === undefined`. The seedance2_5 half of the test is unchanged. The aleph2 test (`contentModeration` present) is unchanged.

No change to `index.ts`, `video-providers-runway-generate`, `video-providers-job-status`, `video-providers-job-result`, secrets, or the credit table. This is a mechanism fix (the request builder now matches Runway's documented edit-mode contract), not a project-specific patch.

## Verify before pushing

```
cd supabase/functions/video-providers-runway-video-edit
deno check index.ts
deno test --allow-env --allow-read contract.test.ts     # expected: 18 passed | 0 failed
```

Both were run on the patched tree from this session: `deno check` clean, 18/18 pass.

## Ship

1. Branch from Control Center main, commit the two files, open a PR, merge (Fendi's standing rule: merge Claude's own PRs on his repos without asking). Commit message ends with the attribution lines in effect for your session.
2. Deploy via the Control Center **Lovable** project chat (Lovable chat is only used for deploy/redeploy; never a standalone Supabase): `Redeploy only the edge function video-providers-runway-video-edit from the current GitHub main (commit <sha>). Do not change any code and do not touch any other function or the frontend.` Confirm the reply names the commit.
3. Nothing to redeploy on AVT — `runway-video-edit-proxy` on AVT main `c0bb6c5` is already live with the matching change.

## Prove it (then stop — the paid run is authorised separately)

From the authenticated AVT app tab (`aivideotool.lovable.app`, project `764a63d2-93cd-44f3-905f-292f14ab2f51`), run the smoke runner's dry run for Omni only; it goes through Control Center's dry-run path and returns the exact Runway body without billing:

```
// after pasting scripts/edit/runway_smoke_runner.browser.js into the console
await window.runwaySmoke.run({ ...window.__smokeCfg, dryRun: true, only: ["gemini_omni_flash_1.1"] })
```

Pass criteria: HTTP 200; `controlCenterDryRun.ok === true`; `controlCenterDryRun.runwayRequestBody` has keys exactly `model, videoUri, mode, promptText, duration, references` — **no `ratio`, no `contentModeration`**; `referenceCount` 4, `estimatedCostUsd` 0.70. (`window.__smokeCfg` is the S08 config from today's session — S08 master asset `e5cfeebc-1780-42e7-8f30-5f157f64ff85`, wardrobe feature `0feb028f-dc4d-45dc-82ac-e4bbd16054b0`, prompt version `smoke-s08-v1`; if the tab was reloaded, rebuild it from `docs/research/results/2026-09-20-ysl-real-video-1/smoke_s08/aleph/provenance.json` and the runner's header comment.)

The real Omni Flash run (≈ $0.70, ChatGPT-authorised on 2026-09-23 as part of the S08 smoke, inside the $50 testing budget) is `dryRun: false, only: ["gemini_omni_flash_1.1"]`. The runner now finalizes long jobs itself through the proxy's `finalizeProviderJobRowId` mode, so one call returns the persisted asset. Then score it with the same three checks used for Aleph and append the row to the S08 table in the results doc:

```
python3 scripts/qa/edit_fidelity.py --source cuts/S08_master_69.466-76.368.mp4 --candidate E1=s08_e1.mp4 --candidate S08_omni=<downloaded>.mp4 --reference E1 --out <out>/fidelity
python3 scripts/qa/construction_score.py --anchor heroes/anchor_hook_s11_f0080.jpg --anchor-master heroes/anchor_hook_master_s11_f0080.jpg \
  --reference "S06=s06_e1.mp4:cuts/S06_master_*.mp4" --reference "S09=s09_e1d.mp4:cuts/S09_master_*.mp4" --reference "S11=s11_e1.mp4:cuts/S11_master_*.mp4" --reference "S12=s12_e1.mp4:cuts/S12_master_*.mp4" \
  --candidate "S08_e1=s08_e1.mp4:cuts/S08_master_*.mp4" --candidate "S08_omni=<downloaded>.mp4:cuts/S08_master_*.mp4" --out <out>/construction
```

(inputs live in the scratchpad `ysl/` tree described in AVT `docs/handoffs/CLAUDE_LATEST.md` rev 28; the E1 roll and masters are also in the project's storage buckets). Targeted Astra A/B is optional and only if the deterministic result is ambiguous (`scripts/qa/build_astra_review_package.py --mechanism …`, ≈ $0.46 last time).

## Context you may need

- Why the boundary is shaped this way: Runway's credential lives only in Control Center (`RUNWAY_API_KEY`), AVT holds `AVT_PROXY_KEY` + `CONTROL_CENTER_URL` and calls `video-providers-runway-video-edit` directly (`_shared/controlCenterClient.ts`); AVT's `boundary.test.ts` forbids AVT from ever passing a provider cost estimate.
- Today's ruling on the mechanism test so far (AVT results doc, section "Provider mechanism smoke on S08"): Aleph 2.0 fixed E1's shirt-tail hem but invented pockets/seams/a short collar, re-rendered the face and output 612×1088 → **ruling A, E1 stays**. Omni Flash is the one still worth its single run because it is the cheapest and, like E1, is conditioned on image references rather than a keyframe.
- Do not touch: Seedance 2.5 (held), the xAI lanes, the credit table (`10 credits/s` for Omni edit is an assumption until a real invoice; note the billed amount when the run completes).

## Unknowns to record when you run it

- The actual Runway credit charge for an Omni Flash edit (assumed 10 credits/s).
- The actual output resolution in edit mode (Runway says 720p; Aleph returned 612×1088 for a 720×1280 input).
