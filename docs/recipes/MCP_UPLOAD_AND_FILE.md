# MCP upload and filing a shot primary

`avt_upload_asset` on the `avt-mcp` edge function. The caller is a machine credential. The function acts as that credential's owner. Cost is $0. It does not call a paid provider.

The same text is the tool description (`FILE_ASSET_RECIPE` in `supabase/functions/avt-mcp/contract.ts`), which is what an outside client sees. This page is the column-level copy.

Class C (storage, a security-definer upload ledger, and a security-invoker filing function). Sign-off before merge. `20261105140000_mcp_upload_events.sql` is already applied. `20261105180000_mcp_file_asset.sql` is not, until it is run in the Lovable SQL editor.

## Tool

Name: `avt_upload_asset`

Input:

| Field | Required | Notes |
|---|---|---|
| `mode` | yes | `signed_url`, `base64`, or `finalize` |
| `bucket` | yes | `project-exports`, `project-clips`, `project-references`, `project-audio` |
| `path` | yes | Must start with the owner's user id and a slash. `..`, a leading slash, encoding, and any other user's prefix are rejected. |
| `upsert` | no | Default false. Only boolean `true` overwrites. |
| `content_type` | no | base64 mode. Default `application/octet-stream`. |
| `data_base64` | base64 only | Decoded size must be ≤ 52428800 bytes. Over that, the error says to use `signed_url`. The upload stores `sha256` on the object metadata. |
| `expected_sha256` | no | finalize only. 64 lowercase hex characters. |

Output:

| mode | body |
|---|---|
| `signed_url` | `{ bucket, path, signed_url, token, expires_in, audit_id }` and `audit_error` only when the ledger write failed. `expires_in` is 7200 (Storage's signed-upload lifetime). PUT the bytes to `signed_url`, then call `finalize`. |
| `base64` | `{ bucket, path, size_bytes, sha256, audit_id }` |
| `finalize` | `{ bucket, path, size_bytes, sha256, sha256_source, audit_id }`. When `expected_sha256` equals `metadata.sha256` and the metadata includes a size, the bytes are not downloaded (`sha256_source` is `metadata`). Otherwise the object is read back (`sha256_source` is `bytes`, stop at 200 MB) and a provided `expected_sha256` must match the hash of those bytes. |

`sha256` is computed on the server. The ledger row is `mcp_upload_events`, written only by `record_mcp_upload` (credential id, bucket, path, bytes, sha256, mode, tool `avt_upload_asset`). The table is readable through `avt_select` and not writable through `avt_insert`.

Storage uses the owner's client. The existing insert policy is `auth.uid()` equals the first folder. No service role.

## `avt_file_asset`

One call. `file_mcp_asset` runs as the owner (security invoker), so row level security still applies. It inserts `project_assets`, sets `is_primary` false on the current primary rows for that `shot_id` and `variation_id`, then inserts or, on unique `(shot_id, asset_id, role)`, updates the assignment with `is_primary` true. The old rows stay. No service role. No provider call.

Required input: `project_id`, `shot_id`, `variation_id`, `asset_type`, `file_url`, `source_tool`, `footage_role`, `role`.

Optional: `approval_status` (default `pending`), `parent_asset_id`, `version_number` (default 1), `metadata_json`, `notes`, `source_in_seconds`, `source_out_seconds`, `sort_order` (default one more than the highest on that shot and variation), `slip_seconds` (default 0, from -30 to 30), `assignment_notes`.

`file_url` uses the same owner-prefix rules as an upload path. Output: `{ asset_id, assignment_id, demoted_ids }`.

The manual calls below are the same columns.

## `avt_delete_object`

`{ bucket, path }` using the upload bucket list and the same path rules, including a rejection of `%` anywhere. Deletes that one object with the owner's storage client. Returns `{ bucket, path, deleted: true, audit_id }`. The ledger row has `mode` `delete` and `tool` `avt_delete_object`.

## File the asset by hand

Reference row, read 5 Nov 2026: `project_assets.id` `6f4edd50-90e1-4d1b-a1d8-297c14b14698` (c041 FINAL).

There is no bucket column and no duration column.

| column | value on 6f4edd50 |
|---|---|
| `user_id` | `3ca10935-8c3d-4479-9a0c-8bfe8050840c` |
| `project_id` | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| `shot_id` | the shot it was first filed on |
| `asset_type` | `edited_clip` |
| `file_url` | owner-prefixed path, no bucket in it |
| `source_tool` | `manual` |
| `approval_status` | `approved` (he had approved it; a new replacement starts `pending`) |
| `version_number` | `1` |
| `parent_asset_id` | `7b89d99f-fcb5-4bbb-b93b-c0ba68ec5e59` |
| `footage_role` | `performance` (a silent cutaway is `b_roll`) |
| `metadata_json.bucket` | `project-exports` |
| `metadata_json.duration_seconds` | `4.0417` |
| `metadata_json.sha256` | the file hash |
| `metadata_json.file_size_bytes` | byte size |
| `metadata_json.derived_from` | `{ method, asset_id, … }` |
| `notes` | what it is and why |

`footage_role` allows only `performance`, `b_roll`, `reference`.

Insert (the new file). `user_id` has to be the owner from `avt_whoami`; row level security checks `user_id = auth.uid()`.

```json
{
  "table": "project_assets",
  "rows": [{
    "user_id": "<avt_whoami.user_id>",
    "project_id": "<shots.project_id>",
    "shot_id": "<shots.id on this variation>",
    "asset_type": "edited_clip",
    "file_url": "<upload path, no bucket prefix>",
    "source_tool": "manual",
    "approval_status": "pending",
    "version_number": 1,
    "parent_asset_id": "<asset it was made from, or null>",
    "footage_role": "b_roll",
    "metadata_json": {
      "bucket": "project-exports",
      "sha256": "<finalize sha256>",
      "file_size_bytes": 0,
      "duration_seconds": 0,
      "mime_type": "video/mp4",
      "original_filename": "c036_silent.mp4",
      "derived_from": {
        "method": "replacement",
        "asset_id": "<parent>",
        "replaced": { "asset_id": "<previous primary asset_id>", "why": "<why>" }
      }
    },
    "notes": "Replaced <previous asset_id> on <spec_key>: <why>."
  }]
}
```

Find the box first:

```json
{
  "table": "shots",
  "columns": "id,spec_key,shot_number,variation_id,project_id",
  "filters": [
    { "column": "variation_id", "op": "eq", "value": "c067efb9-90af-418e-aa6d-58834f6e19de" },
    { "column": "spec_key", "op": "eq", "value": "c036" }
  ]
}
```

`spec_key` is the column. `spec_json.id` repeats it.

## Swap the primary

Active board: `shot_asset_assignments.variation_id` `c067efb9-90af-418e-aa6d-58834f6e19de`.

6f4edd50's row on that board is `shot_asset_assignments.id` `6711bed6-f813-4cf4-8d25-f65b585a0947`, `shot_id` `0bad80da-e7a4-4edc-a281-8e7cd4a69300`, `role` `performance`, `is_primary` true, `sort_order` 8, `source_in_seconds` null, `source_out_seconds` null, `slip_seconds` 0.

Nothing in the database forces a single primary. Demote first, then insert. `avt_update` has to name `id`. Do not delete the old row.

```json
{
  "table": "shot_asset_assignments",
  "columns": "id,asset_id,role,is_primary,sort_order",
  "filters": [
    { "column": "shot_id", "op": "eq", "value": "<shots.id>" },
    { "column": "variation_id", "op": "eq", "value": "c067efb9-90af-418e-aa6d-58834f6e19de" },
    { "column": "is_primary", "op": "eq", "value": true }
  ]
}
```

For each returned `id`:

```json
{
  "table": "shot_asset_assignments",
  "filters": [{ "column": "id", "op": "eq", "value": "<that id>" }],
  "values": { "is_primary": false }
}
```

Then insert the new primary:

```json
{
  "table": "shot_asset_assignments",
  "rows": [{
    "project_id": "<project_id>",
    "variation_id": "c067efb9-90af-418e-aa6d-58834f6e19de",
    "shot_id": "<shots.id>",
    "asset_id": "<new project_assets.id>",
    "role": "b_roll",
    "is_primary": true,
    "sort_order": 9,
    "source_in_seconds": null,
    "source_out_seconds": null,
    "slip_seconds": 0,
    "notes": "Replaced <previous asset_id> on <spec_key>: <why>."
  }]
}
```

`sort_order` is one more than the highest `sort_order` already on that shot. `role` allows only `performance`, `b_roll`, `generated_image`, `generated_clip`, `reference`. A performance take uses `performance` and leaves `source_in_seconds` null. Omit `user_id`; it defaults to the owner. A null `variation_id` is filled from the shot by `shot_asset_assignments_fill_variation`; set it anyway. Unique `(shot_id, asset_id, role)`: on conflict, `avt_update` that existing row to `is_primary` true instead of inserting another.

## Still to do before 1.5.0 is live

1. Lovable SQL editor: run `supabase/migrations/20261105180000_mcp_file_asset.sql`. This replaces `record_mcp_upload` so a `%` anywhere in the path is refused, allows mode `delete`, and adds `file_mcp_asset`.
2. Lovable → Edge Functions → redeploy **`avt-mcp` only**. The frontend is unchanged, so Publish is not required for this revision. Publish is not an edge redeploy.
3. `tools/list` should show `avt_upload_asset`, `avt_file_asset`, and `avt_delete_object`. `initialize` reports server version `1.5.0`.
