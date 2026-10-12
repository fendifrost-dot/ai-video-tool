# SEC-4 storage: `prop-refs` and `project-references`, 12 Oct 2026

Labels: **VERIFIED** (proven by the cited output), **OBSERVED**, **HYPOTHESIS**, **DECISION**.

## Before (VERIFIED, live `pg_policies`, 20:2x UTC)

Both buckets are private (`public = false`). Of the 63 policies on `storage.objects`, each one names a single bucket literal, except `single_tenant_storage`, which names an array of buckets. No policy lacks a bucket filter.

Three permissive policies opened these two buckets:

| policy | cmd | roles | qual / with check |
|---|---|---|---|
| `prop-refs_open_test` | ALL | anon, authenticated | `bucket_id = 'prop-refs'` |
| `project-references_open_test` | ALL | anon, authenticated | `bucket_id = 'project-references'` |
| `single_tenant_storage` | ALL | authenticated | `bucket_id = ANY (artist-assets, project-audio, project-references, project-clips, project-exports, wardrobe-refs, location-refs, prop-refs, look-composites, style-references, training-zips)` |

The owner-scoped policies `<bucket>_{select,insert,update,delete}_own` (to `public`, `auth.uid()::text = foldername(name)[1]`) already existed and are unchanged.

### Inventory (VERIFIED)

- `prop-refs`: 20 objects, all under the owner `3ca10935-8c3d…`.
- `project-references`: 309 objects under the owner, plus 45 under 7 anonymous-session uids. The 45 are at `<anonUid>/<projectId>/…`, all in projects owned by `3ca10935-8c3d…`.

## Change

The migration is `supabase/migrations/20261012210000_sec4_scope_reference_buckets.sql`. It was applied through Lovable SQL at about 20:30 UTC. The rollback is `SEC4_STORAGE_ROLLBACK.sql`.

What it does:

- Drops the two `_open_test` policies.
- Removes both buckets from `single_tenant_storage`.
- Adds a locked grants table, `storage_legacy_folder_grants`, holding 7 rows that grant the owner access to the 7 legacy folders. The table has RLS on, no policies and no client grants.
- Adds a `SECURITY DEFINER` predicate over that table.
- Adds legacy-folder SELECT and DELETE policies for `authenticated`.

It also guards itself:

- It refuses to run if `single_tenant_storage` differs from the reviewed snapshot.
- It fixes the grant owner in the migration rather than reading it from client-editable `video_projects`.
- It raises unless exactly 7 grants exist.
- It is safe to re-run.

## After (VERIFIED, live)

- **Policies.** The policies that mention these buckets are the 8 `*_own` policies and the 2 `*_legacy_grant` policies. `single_tenant_storage` now names 9 buckets, neither of these two.
- **Grants.** 7 grant rows. `anon` cannot execute the predicate, `authenticated` can, and `authenticated` cannot read the grants table.
- **Leftover objects.** Every remaining object outside the owner's folder and the granted folders was a test fixture of this run; all were removed afterwards. Real-content leftovers: **0**.

## Real storage API, controlled identities (VERIFIED)

The test identities were three fresh anonymous sign-ins: A (`c158e779`), B (`4e26292d`) and C (`4c7cbca8`). The test file was a 1×1 PNG in A's own folder. No other user's content was read. The script is in the session scratchpad and is reproduced in the handoff.

| op | A, own folder (before → after) | B, another user (before → after) | anon key, no session (before → after) |
|---|---|---|---|
| list folder | ✅ → ✅ | **✅ → ❌** | **✅ → ❌** |
| list bucket root | — | **✅ (2/9 folders) → ❌ (0)** | **✅ → ❌ (0)** |
| download | ✅ → ✅ | **✅ → ❌** (see CDN note) | ❌ → ❌ |
| createSignedUrl (+fetch) | ✅ 200 → ✅ 200 | **✅ → ❌** | ❌ → ❌ |
| upload into A's folder | ✅ → ✅ | **✅ → ❌ RLS** | **✅ → ❌ RLS** |
| overwrite A's file | ✅ → ✅ | **✅ → ❌ RLS** | **✅ → ❌ RLS** |
| delete A's file | — | **deleted → ❌ (0 rows)** | → ❌ (0 rows) |

The results were the same for both buckets.

Correction to the first baseline run: it reported "delete denied" because it checked whether the file still existed with a download. The download was served from the CDN after the file had been deleted, and the file was later confirmed gone. The probe now checks existence with a database-backed `list`.

### Owner workflows (VERIFIED, through the AVT MCP owner credential under RLS)

- The owner can list a legacy folder.
- `createSignedUrl` works on one object from **each of the 7 legacy folders**, plus one owner object in each bucket. All 9 signed URLs returned **206** to a 1-byte range request.

Not tested as the owner: writing into a legacy folder, which is intentionally not granted, and deleting a real legacy file, which is destructive. DELETE uses the same predicate as SELECT.

## Residual: CDN copy cached during the open period (VERIFIED)

**Observation.** After the migration, B could still download `fixture.png`, the file B had downloaded while the bucket was open. B could not sign or list it, and B got 400 on any path it first requested after the migration.

**Test.** Same URL and the same moment:

| requester | status | `cf-cache-status` | `last-modified` |
|---|---|---|---|
| B | 200 | `HIT` | 20:28:51, the copy cached during the baseline |
| C (new user) | 400 | `BYPASS` | — |

Deleting the object purged it: B got 400 with `BYPASS` once the fixture was removed.

**Conclusion.**
- The authenticated download path is cached per requester for the object's `cacheControl` (`public, max-age=3600` by default).
- Anyone who fetched an object while it was open can re-fetch **that same copy** until it expires, at most 1 hour for default-cached uploads.
- No new access is possible.
- RLS cannot shorten this window. Deleting an object, or waiting it out, ends it.
- Expiry check: see the handoff.

## Service-role bypass of these buckets (fixed in this PR)

`grok-video-research-proxy` and `grok-resolution-test` accepted the **public anon key**, and the research proxy also accepted any user session. Both sign caller-chosen paths in these buckets with the **service role**, which bypasses RLS, and send the file to xAI for billing.

- **VERIFIED by reading the code:** dry-runs do not return the signed URL. One redacts it with `redactUrls`, the other leaves it out of `context`.
- **DECISION:** both are now service-role only. They are research tools, nothing in the app calls them, and both are marked for deletion.

**Still open** (`RISK_REGISTER.md`, existing entry): several authenticated service-role functions sign caller-supplied paths without an ownership check. They need a user session, but under SEC-5 and anonymous sign-in, anyone can get one:

- sam3-segment
- faceswap
- wardrobe-vton
- grok-image-garment
- grok-image-look-composite
- jacket-inpaint
- grok-video-edit
- runway-video-edit

This was not verified per function. Each is a billed lane.

## Not changed / still open

- The other 9 buckets in `single_tenant_storage` and their `_open_test` / `*_anon_*` policies (SEC-4 remainder, RISK-001).
- The table-level `_open_test` policies.
- The 7 anonymous sessions still match `*_own` on their legacy folders. Anyone still holding one of those sessions can modify or delete those 45 files. Remedy: re-key the files to the owner's folder (RISK-002, STOR-*).
- Anonymous visitors can still upload into their own folder in both buckets (storage-abuse risk; anonymous sign-in is on).
