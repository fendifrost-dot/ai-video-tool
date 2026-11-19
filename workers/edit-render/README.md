# Edit-render worker

Consumes queued `edit_renders` rows (Timeline → Export preview), encodes them with ffmpeg (H.264/AAC, yuv420p,
`+faststart`), uploads to `project-exports/{user_id}/{project_id}/renders/{render_id}.mp4`, files a
`project_assets` row (`edited_clip`, `metadata_json.edit_render_id`) and marks the row `complete`. $0, no providers.

The host holds only a **worker secret**, not the service-role key. The worker talks to the
`edit-render-worker-api` edge function, which claims (SKIP LOCKED + stale reaper), re-signs inputs, signs the upload
and completes the row. Register a secret (SQL editor, service role):

```sql
insert into public.edit_render_workers (label, secret_hash)
values ('box', encode(digest('<secret>', 'sha256'), 'hex'));  -- or compute sha256 hex locally
```

Requirements: Node ≥ 22.6 (`--experimental-strip-types`), ffmpeg/ffprobe on PATH.
Blender, when a job asks for it, is `AVT_BLENDER` or `/workspace/tools/blender/current/blender` (the 5.2.4 LTS executable; 4.2.3 stays on disk as a fallback). The worker reads `blender --version` into its capability manifest. The Blender skill dependency is `blender>=5.2`. Cycles runs on CPU, one frame chunk at a time.

The process runs one job at a time. It checks free disk before each claim. It downloads only the asset ids on the job. The local cache defaults to 20 GB (`AVT_CACHE_CAP_BYTES`) and drops disposable copies after 7 days (`AVT_CACHE_TTL_DAYS`). Originals, camera takes, locked or approved masters, and files whose sha256 is not verified are never evicted. Scratch for a finished job is deleted only after the upload's sha256 matches.

- **Box / any Linux:** put `AVT_WORKER_SECRET=...` and `AVT_WORKER_API=<SUPABASE_URL>/functions/v1/edit-render-worker-api` in `~/.secrets/avt_render_worker.env` (chmod 600), then
  `nohup setsid workers/edit-render/run-supervised.sh >/dev/null 2>&1 &`. Logs: `workers/edit-render/logs/worker.log`
  (or `AVT_WORKER_LOG_DIR`). Stop: `kill $(cat <logdir>/supervisor.pid)`.
- **Mac:** same script under a launchd agent with `KeepAlive`.
- **Container:** `Dockerfile` here (build from repo root).
- Test one job: `node --experimental-strip-types workers/edit-render/worker.mjs --once`.

Rows stuck in `rendering` for 20 min are re-queued (up to 3 attempts) then failed.

## Put-back jobs (job kind `putback`)

The face-preserving put-back (`scripts/edit/body_only_swap.py`, run unchanged) as a job. Design, threat model and
what is and is not proven: `docs/design/DRESS_AND_PLACE_PIPELINE_2026-11.md`.

- **A worker says which kinds it takes: `AVT_WORKER_KINDS`, default `edit`.** An edit job's plan can carry a command
  line from its row, so a host takes edit jobs only on purpose. A put-back is taken only by a worker that lists
  `putback` and has: Python with numpy, OpenCV and MediaPipe (`AVT_PUTBACK_PYTHON`), ffmpeg, the two model files
  with the recorded hashes (`AVT_MODELS`), and a scratch folder it was told (`AVT_SCRATCH_DIR`).
- **A worker runs only its owner's jobs.** `edit_render_workers.owner_user_id` is set in Lovable's SQL editor when
  the worker is registered; a worker with no owner is handed nothing.
- **On Fendi's Mac the worker is started for one job and exits** (8 GB of memory; one heavy job at a time):

  ```bash
  AVT_SCRATCH_DIR="/Volumes/T7/_avt_work/worker_scratch" AVT_MODELS="/Volumes/T7/Hyenas AVT edit/_avt_work/models" AVT_PUTBACK_PYTHON="$HOME/.avt-venv/bin/python" workers/edit-render/run-once-putback.sh
  ```

  It reads its secret from `~/.secrets/avt_render_worker_mac.env` (mode 600), refuses to start when more than 4 GB
  of swap is in use or another put-back worker is running, asks for put-backs only, and removes a failed job's
  files. Media never touches the internal disk.
- Queue one: MCP `avt_job_submit` with `job_kind: "putback"`, `settings: { preset }`, `input_asset_ids: [window,
  its conformed dress-clip output]` (`dry_run` first). Read it: `avt_job_status`.
- Container: `Dockerfile.putback` (never built; see its header).

