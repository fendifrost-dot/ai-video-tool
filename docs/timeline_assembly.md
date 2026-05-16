# Timeline Assembly — Phase 2 Architecture

Capability C from the AI Music Video OS brief: produce a full music video,
transitions and all, as a finished MP4 — not just a handoff to Premiere.

This document maps the path from where we are today to a rendered-in-tool
final video. Nothing in this document is implemented yet. It exists so when
Fendi reaches this milestone, the path is mapped out, not a blank page.

## Current state (read first)

The MVP today supports everything UP TO the timeline. Specifically:

- `shots` table — ordered (by `shot_number`), each with optional
  `timestamp_start` / `timestamp_end` against the song timeline. Now also
  has `trim_in_seconds`, `trim_out_seconds`, `transition_in_type`,
  `transition_out_type`, `transition_duration` (migration
  `20260516000000_shots_timeline_fields.sql`).
- `project_assets` table — each generated clip is a row, with
  `shot_id`, `asset_type`, `approval_status`, and the file in the
  `project-clips` Storage bucket.
- The export package generator already writes `manifest.json`,
  `shot_list.csv`, etc., which is everything an external NLE needs.

What's missing is the act of stitching `[approved clip for shot 1] +
transition + [approved clip for shot 2] + ... + audio track → final.mp4`.

## Design goal

When Fendi clicks **"Render final video"**:

1. The system picks the latest approved `generated_clip` / `edited_clip` for
   each shot (in `shot_number` order).
2. Trims each clip to its `trim_in/out_seconds` if set.
3. Joins them with the requested transitions.
4. Overlays the project audio (the `audio` asset_type entry in
   `project_assets`).
5. Outputs an MP4 to the `project-exports` bucket and creates an
   `export_packages` row pointing at it.
6. Final video shows up in the export page with a "Download" link.

## Render backend options

There are three viable hosts for the ffmpeg work. Picking one is the first
decision Phase 2 needs.

### Option A — Supabase Edge Function (Deno)

Pros:
- Already in our stack — no new infra.
- Same JWT auth path as `upload-asset`.
- Deno has `Deno.Command` which can shell out to ffmpeg.

Cons:
- Edge Functions have a hard CPU time cap (currently 150 s per invocation
  on the free/pro tiers). A 3-minute music video at 1080p with multiple
  transitions can blow through that. Workable for short cuts only.
- Network egress for clip downloads + final upload counts toward our
  bandwidth allowance.
- Memory cap (256 MB) is tight for ffmpeg with multiple concurrent
  streams.

Verdict: viable for proof-of-concept and < 60 s videos only.

### Option B — Cloudflare Container

Pros:
- We're already on a Cloudflare Worker (per `wrangler.jsonc`). CF Containers
  are GA, support arbitrary Docker images including ffmpeg.
- 60-minute job time, plenty of CPU.
- Workers already authenticated against Supabase.

Cons:
- Brand-new infra component to set up.
- Cold-start latency is real (5-15 s per first invocation in a region).

Verdict: best long-term host. Worth setting up when render volume justifies.

### Option C — Self-hosted worker

A small Node/Python service on Fly.io, Railway, or a VPS, polling Supabase
for `export_packages` rows where `status = 'pending'` and `export_type =
'full_package'` (or a new `final_video` enum value).

Pros:
- Total control over ffmpeg version, fonts, codecs.
- Simple — `while True: pick job, run ffmpeg, upload, mark done`.

Cons:
- One more thing to operate. Single point of failure unless we add a
  second worker. Need to manage secrets.

Verdict: pragmatic if Option B has cold-start issues we can't solve.

## Render pipeline (host-agnostic)

Pseudocode for the actual work, regardless of where it runs:

```
fetch project + shots (ordered by shot_number)
for each shot:
  pick most-recent approved generated_clip/edited_clip via shot_id
  if none → fail the job with error_text "shot N missing approved clip"
  signed-URL download into a workdir
  optionally trim to [trim_in, trim_out] using
    `ffmpeg -ss <in> -to <out> -c copy clip_N.mp4`
build the transition graph:
  shot_N out_transition + shot_{N+1} in_transition → pick the longer
  one; render via ffmpeg xfade filter or alpha-composite for fade variants
concat with audio:
  `ffmpeg -i intermediate.mp4 -i audio.mp3 -c:v copy -c:a aac -map 0:v -map 1:a -shortest final.mp4`
upload final.mp4 to project-exports/<user>/<project>/final_video_<ts>.mp4
write export_packages row with status=complete, file_url=that path,
  manifest_json with the shot-clip mapping used
```

## Schema additions (this migration)

```sql
-- shots
trim_in_seconds      numeric(8,3)         -- where to start using the clip
trim_out_seconds     numeric(8,3)         -- where to stop using the clip
transition_in_type   shot_transition_type -- what plays into this shot
transition_out_type  shot_transition_type -- what plays out of this shot
transition_duration  numeric(5,2)         -- 0-5 seconds, default 0.5 at render time
```

`shot_transition_type` enum: `cut`, `crossfade`, `fade_black`, `fade_white`,
`whip_pan`, `glitch`, `flash`. Conservative starting set; add more as the
render engine learns the corresponding ffmpeg recipes.

A new export_type enum value `final_video` will be added when the renderer
is built — for now, `full_package` covers the assembly-handoff case.

## UI surface area (Phase 2)

The render is server-side; the UI only needs:

1. **Timeline editor** under shots — drag trim handles on each shot's
   waveform, pick transitions from a dropdown. Reads/writes the new
   `shots` columns. The shots are already ordered by `shot_number`, so
   no reordering UI is needed for v1.
2. **Render button** on the export page — fires a mutation that creates
   an `export_packages` row with `status='pending'` and the new
   `final_video` type, then polls for status updates.
3. **Render progress** — read `export_packages.status`. If we want
   intermediate progress, add a `progress_percent` column later.

## What to do BEFORE Phase 2

When picking this up later:

1. Decide host (Option A/B/C above) based on typical video length.
2. Add the `final_video` export type enum value.
3. Optionally add `progress_percent` to `export_packages` for UI feedback.
4. Build the renderer. Reference clip in `project-clips/<user>/<project>/<shot_id>/...`.
5. Build the timeline editor — see UI section above.

The schema is ready. The data is in place. The compiler-output already
includes the locked reference path, so re-generations during render will
maintain character continuity.

## Open questions for Fendi

- **Default transition between shots when both ends are NULL**: hard cut?
  (Recommended.)
- **What audio levels?** Project audio at -14 LUFS (streaming standard)?
  Currently no project field for this — add when the renderer needs it.
- **Output format**: 1080p H.264 MP4 universally, or per-export options
  (vertical 9:16 for social cutdowns, 1080p horizontal for main)?
