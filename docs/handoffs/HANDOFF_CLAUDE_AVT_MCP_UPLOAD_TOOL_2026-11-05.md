# Handoff → Claude Code: AVT MCP upload tool (2026-11-05)

**From:** AVT / Grokbot · **Decision:** Fendi, Nov 4 2026 8:20 PM CT. Add upload to the AVT MCP connector; do not use his app session.
**Why:** three replacement cutaways (c036, c037, c043, silent) have to go into the first-half board. `avt-mcp` has no way to put bytes into Storage. `avt_call` sends JSON only, and `upload-asset` needs raw bytes plus `X-Bucket`/`X-Path` headers.

## What the code shows (main 875900f)
- `supabase/functions/avt-mcp/index.ts` exchanges the machine credential (bearer / x-batch-secret / URL tail) for the **owner's own session**. `ctx.session.accessToken` and `ctx.user`, an RLS-scoped supabase-js client built with that token (line ~400), are already available to every tool.
- Existing storage tools: `avt_signed_url` (createSignedUrl, download only) and `avt_list_files`. Both run through `ctx.user.storage`. There is no upload.
- `callFunction` (avt_call) always sends `Content-Type: application/json` with a JSON body, so it cannot reach `upload-asset` (raw body plus custom headers).
- `upload-asset` caps uploads at 4 GB, uses an allowed-bucket set, and validates the JWT with getUser before an admin-client upload.
- `avt_insert` / `avt_update` / `avt_select` already write tables as the owner (RLS). **This means part (2) below probably needs only docs, not a new tool.**

## Ask
### 1. `avt_upload_asset` (new MCP tool)
- **Preferred mode: `mode: "signed_url"`.** Call `ctx.user.storage.from(bucket).createSignedUploadUrl(path)`, which runs as the owner and is RLS-scoped. Return `{ bucket, path, signed_url, token, expires_in }`. The caller then PUTs the bytes directly, so large files never go through the MCP body. After the PUT, an `avt_upload_asset {mode:"finalize", bucket, path}` call (or a separate `avt_stat_file`) reads the object back and returns `{ path, size_bytes, sha256 }`.
- **Fallback mode: `mode: "base64"`.** Inline `data_base64`, capped at about 50 MB decoded. Above the cap, return an error that says to use signed_url (chunking is optional). Upload with `ctx.user.storage` and return `{ bucket, path, size_bytes, sha256 }`. Compute the sha256 server-side.
- **Least privilege:**
  - The path must start with `${ctx.session.userId}/`. Reject `..`, absolute paths and other users' prefixes.
  - Buckets allowlist: `project-exports`, `project-clips`, `project-references`, `project-audio` (mirror upload-asset's set).
  - `upsert` defaults to false.
  - No service role, unless the RLS storage policies refuse the owner's insert. If they do, document why and keep the owner-prefix check.
- **Ledger:** write one audit row per upload, like batch_credential_mints / the existing audit (tool, bucket, path, bytes, sha256, credential id). Cost is $0, and the tool never calls a paid provider.
- Add the tool to `TOOLS`/`contract.ts` and regenerate `catalog.generated.ts` if needed.

### 2. File the asset and swap the slot primary
Document an exact `avt_insert` + `avt_update` recipe in the tool docs, or add a thin `avt_file_asset` tool if RLS or triggers make the recipe fragile. It should mirror how asset **6f4edd50** (c041 FINAL) was created: same `project_assets` columns (asset_type, source_tool, storage bucket/path, duration, derived_from / metadata with a replaced-what-and-why note, approval_status).
- **Slot swap on a board variation** (variation `c067efb9-90af-418e-aa6d-58834f6e19de`): the new asset becomes the shot's primary/selected, and the old primary stays as an alternate (unselected, not deleted). Write the exact table and column names into the doc.

### 3. Tests and release
- Add `contract.test.ts` cases:
  - prefix enforcement (other user, `..`)
  - bucket allowlist
  - base64 cap
  - sha256 correctness
  - signed_url shape
- **Release rule:** merge only after CI (`.github/workflows/ci.yml`) passes. Then do **Lovable Publish**, and separately **redeploy `avt-mcp`** and any other edge function you touched. Verify with `tools/list` on the live endpoint that `avt_upload_asset` shows up.

### 4. Acceptance (test path only; AVT/Grok does the real filing afterwards)
- `signed_url` for `project-exports/3ca10935-8c3d-4479-9a0c-8bfe8050840c/_mcp_upload_test/hello.bin`, a PUT of a small file, then `finalize`. The sha256 must match the local value.
- The base64 mode with the same file gives the same sha256. Delete the test object afterwards.
- AVT then uploads `/workspace/ysl_first_half/replacements_silent/{c036,c037,c043}_silent.mp4` (Grok box), files them with recipe (2) and swaps the primaries. **Don't do this part.**

## Secondary: first-half package defects (`canonical/grokbot_first_half_2026-11-05/`, PR #424)
- The slots sum to **2061** frames, not 2066.
- c033's slot is **35** frames; it needs 36.
- In `first_half_manifest.csv`, the `slot_frames` / `source_frames` / `source_fps` columns are shifted or wrong.
- The current workaround is to rebuild from `sources/` with each cut at round(song_in×24). Fix the generator and the manifest when convenient. This is lower priority than the upload tool.
