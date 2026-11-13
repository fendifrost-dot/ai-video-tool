# Asset store extensions

Class C (storage, timelines, auth). Sign-off before merge. SQL runs in the Lovable SQL editor on `qoyxgnkvjukovkrvdaiq`. This change does not Publish and does not redeploy.

Migration: `supabase/migrations/20261113120000_asset_store_extensions.sql`.

## What was extended

`project_assets` keeps the file. New columns sit beside `metadata_json`: fps, sar, width, height, frame_count, duration_seconds, codec, sha256, size_bytes, source_take_asset_id, song_zero_offset_seconds, provenance, tags, origin, license_id.

Tags are `locked`, `superseded`, `review`, `approved`. A row tagged `locked` cannot be deleted. The same guard rejects a Storage delete of that object's path. `avt_delete` on `project_assets` checks the tag before it deletes. `avt_asset_delete_guard` only reports the status. There is no delete tool that skips the guard, and nothing here deletes a file on the T7.

`origin` of `element` or `stock` requires `license_id`. Generated, camera, and edit rows do not.

Bucket `file_size_limit` for `project-exports`, `project-clips`, `project-references`, and `project-audio` is 4 GB, which covers a 245 MB master and a 1.7 GB camera take. Supabase also has a project-wide upload cap that SQL cannot change. If a large PUT returns 413, raise that cap in Lovable. This migration does not do it.

## Uploads

`avt_upload_asset` modes:

| mode | what it does | what it does not do |
|---|---|---|
| `signed_url` | short-lived PUT URL | upload the bytes |
| `tus` | tus 1.0.0 plan (endpoint, signed bearer, 6 MB chunks) for up to 4 GB | upload the bytes |
| `base64` | stores up to 50 MB | |
| `finalize` | reads the object back, or trusts metadata when `expected_sha256` matches | |
| `verify` | compares `local_sha256` to the stored hash | delete anything |

`verify` returns `{ match, clear_scratch, deleted: false }`. Delete local scratch only when `clear_scratch` is true, and only the local file. The server does not delete it.

## Catalog

A skill or an effect row does not run anything. `production_skill_versions.dependencies` says which binary versions a worker must have (`blender>=5.2`, `ffmpeg>=6`). Published rows are immutable. `avt_skill_publish` and `avt_effect_publish` refuse unless a passing `skill_validations` row exists, and only then move `is_current`. Projects pin a version with `avt_skill_pin`. Jobs pin `skill_version_id` on `edit_renders` (the worker tools that submit jobs are the next PR).

`effect_presets` holds `code_ref`, a JSON Schema (`type: object`) with defaults, a preview asset, and the skill version.

`skill_validations` records the worker label, OS, tool versions, input asset ids, pass/fail, and an optional QC asset.

Every write tool records `mcp_write_events` through `record_mcp_write`. The table is readable and not writable from `avt_insert`.

## Cut

`edit_sequences.locked` and `edit_clips.locked` refuse `avt_edit_render` unless `unlock: true`. That flag authorizes one render. It does not clear the lock. Clearing a lock is `avt_edit_lock` with `unlock: true`.

Each clip can carry `asset_version`, `song_zero_offset_seconds`, `timeline_in_frame`, `timeline_out_frame`, `layer_stack`, and `grade`. `time_remap_allowed: false` refuses a speed other than 1. Existing rows default the flag to true so a cut that already uses speed still saves.

Shot list, beat grid, and project rules are versioned assets. Saving a new one tags the previous row `superseded` and sets `parent_asset_id`. It does not delete it.

## Jobs, workers, cache

`avt_job_submit` queues an `edit_renders` row (`edit`, `vfx`, `qc`, `blender`, `beat_cut`). `dry_run` defaults to true and writes nothing. `cost_usd` stays 0. The worker is the existing edit-render process: one job at a time, a disk check first, and only the asset ids the job names. Blender is `AVT_BLENDER` (default `/workspace/tools/blender/current/blender`, the 5.2.4 executable). The worker fills `tool_versions.blender` from `blender --version`. Cycles on CPU, frames in chunks.

`avt_worker_register` stores a hash of the secret plus the tool manifest. `avt_worker_check` compares that manifest to the pinned skill's dependencies before a non-dry-run submit will accept the worker.

`avt_cache_report` records usage against a 20 GB default cap. It returns disposable keys the box may delete locally after 7 days or when over the cap. Locked, approved, camera, original, and unverified files are not in that list. The tool does not delete them. Scratch for a finished job is removed only after the uploaded sha256 matches.
