# Security triage — Lovable scan, 2026-10-03

**Read-only.** Nothing was repaired, no policy was changed, nothing was probed as an attacker. This file sorts what
the scanner reported so a dedicated hardening tranche can start from it. Status of each risk stays in
[`RISK_REGISTER.md`](../../RISK_REGISTER.md); this is the evidence behind the next update to it.

## The short version

- The scan lists **61 entries**. All 61 come from one scanner (the database policy scan). There are **no
  dependency findings and no application-code findings** in it.
- **60 of the 61 are one problem**, counted once per table and per bucket: test-era policies that let every
  session — including the anonymous session the app creates for any visitor — read, change and delete rows and
  files. The 61st is the scanner noting that anonymous sign-in is on.
- This is **not new**. It is `RISK-001` (Critical, Confirmed, In-remediation since 2026-08) with `RISK-002` and
  `STOR-1…4`. What is new is the measured size: the register describes five tables and one bucket; the live
  database has it on **30 tables and all 12 buckets**.
- **No sign that anyone has used it.** Every project, shot and provider job belongs to the one durable owner.
- It was **not treated as a stop**: it is known, registered, and the owner has said the tool is private and in
  test. It **is** the first thing to close before anyone else is given the address — see "What makes it
  reachable" below.

## Classes

| Class | Meaning | Entries |
|---|---|---|
| A | Credible, exploitable flaw in application code | 0 |
| B | Dependency / update | 0 |
| C | Configuration / RLS / auth | 60 |
| D | Duplicate / stale / scanner noise | 1 |
| E | Insufficient evidence | 0 in the scan (3 items noted below, outside it) |

The 60 class-C entries are configuration findings **and** credibly exploitable; they sit in C because the fix is
policy, not code.

## The entries

Evidence is from `pg_policies`, `pg_class`, `storage.buckets` and `auth.users`, read on 2026-10-03.

### C-1 · 30 table policies `<table>_open_test` — `FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`

`artist_assets`, `clip_reviews`, `collection_products`, `collections`, `export_packages`,
`generation_feasibility`, `manufacturing_packages`, `product_assets`, `product_variants`,
`product_wardrobe_links`, `products`, `project_assets`, `project_location_picks`, `project_look_picks`,
`project_prop_picks`, `prompt_templates`, `prompts`, `provider_capabilities`, `provider_jobs`, `shots`,
`song_analyses`, `storyboard_nodes`, `storyboards`, `style_profiles`, `tech_packs`, `timeline_events`,
`timeline_items`, `timeline_manifests`, `timeline_versions`, `video_projects`.

Every one of these tables also has correct owner-scoped policies (`user_id = auth.uid()` or the project's owner).
Policies are permissive, so the open one wins. 22 of the tables additionally carry `single_tenant_all`
(`USING (true)`, to `authenticated`; to `public` on `timeline_events` and `timeline_versions`) — the scanner
counts the `_open_test` policy; the `single_tenant_all` one has to go in the same change or nothing is closed,
because an anonymous session is an `authenticated` session.

- Maps to: `RISK-001` (the "out-of-band `*_open_test` and `single_tenant_all` policies" it mentions).
- Impact: read, alter or delete every project, shot, asset record, prompt and provider job.
- Tables that are already correct (owner-scoped only): `artists`, `artist_looks`, `character_features`,
  `location_library`, `prop_library`, `lyric_lines`, `performance_syncs`, `shot_asset_assignments`,
  `shot_overrides`, `batch_credentials`, `batch_credential_mints`. The storyboard redesign's new tables were
  created owner-scoped and are not in the scan.

### C-2 · 29 storage policies on `storage.objects`

- 12 × `<bucket>_open_test` (`FOR ALL TO anon, authenticated`, bucket match only): `artist-assets`,
  `location-refs`, `look-composites`, `product-assets`, `project-audio`, `project-clips`, `project-exports`,
  `project-references`, `prop-refs`, `style-references`, `training-zips`, `wardrobe-refs`.
- 16 × per-command anonymous policies: `look_composites_anon_{select,insert,update,delete}`,
  `style_references_anon_*` and `style_references_*_anon` (the same four twice), `training_zips_anon_*`.
- 1 × `single_tenant_storage` (`FOR ALL TO authenticated`, eleven buckets).

- Maps to: `RISK-001` (look-composites), `STOR-1…4`.
- Impact: list, download, overwrite and delete every file — the song, the takes, generated clips and stills,
  look composites (768 objects), exports (228).
- Two buckets are also marked **public** (`style-references`, 47 objects; `training-zips`, 1 object): their
  files are readable by link with no session at all.
- The register's constraint still holds: files are stored under the uploading session's id, so the bucket
  policies cannot simply be switched to "own folder only" until the re-key in `STOR-1…4` is done, or the owner's
  own older files become unreachable.

### C-3 · 1 table with row-level security off — `identity_consolidation_backup_20260806`

324 rows, no policies, `anon` holds select and insert. It is the August identity-consolidation backup (ids and
ownership pairs, no media). Maps to `RISK-001` / `RISK-002`. Fix: enable RLS with no policy, or move it out of
`public`, or drop it once the consolidation is signed off.

### D-1 · 1 informational entry — anonymous sign-in is enabled

Not a separate hole; it is the reason C-1 and C-2 are reachable. Listed under "What makes it reachable".

## What makes it reachable

`src/routes/__root.tsx` signs every visitor in anonymously when there is no session. An anonymous session carries
the `authenticated` role. So "any signed-in user" in the policies above means "anyone who opens
`aivideotool.lovable.app`". `auth.users` holds 1,086 users: 1 durable, 1,085 anonymous, 379 of them created in the
last seven days. That count is consistent with the amount of automated browser work on the app this week (every
fresh browser context makes one); it cannot be attributed more precisely from here.

## Sign of use by anyone else

None found. 7 projects, 1 owner. Shots: 1 owner. Provider jobs: 1 owner. Project assets: 2 owners — the durable
owner and the known fixture identity (5 fixture assets). No foreign rows.

## Outside the scan, noted while reading (class E — not tested)

These are not among the 61. They were not exercised, because exercising them means acting as a stranger or
spending money.

1. **Paid functions and anonymous sessions.** Most paid proxies verify a JWT and then check the project's owner.
   A text search finds no owner check in `faceswap-proxy`, `wardrobe-vton-proxy`, `grok-image-garment-proxy`,
   `jacket-inpaint-proxy`, `sam3-segment-proxy`, `temporal-propagate-proxy`, `proxy-provider-call`,
   `fal-queue-poll-proxy`, `fetch-reference-image` and `upload-asset` (searched, not read line by line). An
   anonymous JWT may be enough for those. Only `lyric-align-proxy` (added today) refuses anonymous sessions
   outright. Related: `VOICE-1`.
2. **Functions with `verify_jwt = false`:** `train-style-lora-proxy` (no caller check in the code — this is
   `SEC-2`), `grok-resolution-test`, `grok-video-research-proxy`, the three provider callbacks, and
   `batch-token-proxy` (by design). Each needs its own look.
3. **Where the owner checks read from.** A function that decides ownership by reading the project with the
   caller's own session would be answered by the open policy in C-1. Not checked function by function.

## Order for the hardening tranche

1. Stop the automatic anonymous sign-in, or refuse anonymous sessions in every paid function. Closes the door
   without touching data.
2. Drop `*_open_test` and `single_tenant_all` on the 30 tables in one migration, with an RLS test that drives an
   anonymous client and expects denial (the empty test category `RISK-001` already asks for). All rows already
   belong to the durable owner, so nothing strands.
3. Enable RLS on the backup table.
4. Buckets, after the `STOR-1…4` re-key: drop the open and anonymous policies, un-publish `training-zips` and
   `style-references` unless a public link is needed.
5. The class-E items, one function at a time.

Steps 1–3 are small and reversible. Step 4 is the one that can lock the owner out of older files if done out of
order.
