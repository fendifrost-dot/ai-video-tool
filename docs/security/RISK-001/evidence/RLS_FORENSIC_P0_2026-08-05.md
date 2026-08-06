# P0 FORENSIC — Anon-Open RLS on AVT identity/wardrobe surface (SEC-1)

**Status:** read-only forensic. **No fix migration authored** (per instruction).
**Repo state examined:** `origin/main` @ `3e7bad5`, `supabase/migrations/*.sql`.
**Live DB status is NOT knowable from the repo** — see §6 (dashboard-only).

---

## 1. One-line summary

A single migration — `20260523171003_541284ed-e697-4b53-9f4a-3b39b5a76fb9.sql` — **dropped the owner-scoped (`user_id = auth.uid()`) RLS policies** on five tenant tables and the `look-composites` storage bucket and replaced them with **`FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)`**. Its own header says *"DEV ONLY … Revert before production."* **No later migration re-locks any of them.** With the public anon key (shipped in the frontend bundle), any caller can read/write every affected row and bucket object across all tenants — **if this migration is applied on the live DB** (unverified; dashboard-only).

---

## 2. Provenance — which migration introduced each permissive policy

**All permissive policies come from ONE migration:** `supabase/migrations/20260523171003_541284ed-e697-4b53-9f4a-3b39b5a76fb9.sql` (timestamp 2026-05-23; Lovable-generated UUID filename). `[VERIFIED — I read the full migration]`

Header, verbatim (lines 1-2):
```
-- DEV ONLY: open all access to anon role on these tables + look-composites bucket.
-- WARNING: removes per-user isolation. Revert before production.
```

| Object | Original owner policy (dropped) | Introduced by (original) | Permissive policy created | Class |
|--------|--------------------------------|--------------------------|---------------------------|-------|
| `public.artists` | `artists_select/insert/update/delete_own` (`user_id = auth.uid()`) | `20260514210000_initial_schema.sql:331-364` (DO-block) | `artists_anon_all … USING(true) WITH CHECK(true)` | VERIFIED |
| `public.character_features` | `"Users access own character_features"` | `20260517_phase_a_character_features.sql:41` (RLS enable) / `20260517134927_*.sql:29` | `character_features_anon_all … USING(true)` | VERIFIED |
| `public.location_library` | `"Users access own location_library"` | `20260517_phase_1_library.sql:83` / `20260518000150_*.sql:49` | `location_library_anon_all … USING(true)` | VERIFIED |
| `public.prop_library` | `"Users access own prop_library"` | `20260517_phase_1_library.sql:135` / `20260518000150_*.sql:80` | `prop_library_anon_all … USING(true)` | VERIFIED |
| `public.artist_looks` | `"Users access own artist_looks"` | `20260517_phase_2_looks.sql:50` / `20260518050011_*.sql:38` | `artist_looks_anon_all … USING(true)` | VERIFIED |
| `storage.objects` (bucket `look-composites`) | `look_composites_select/insert/update/delete_own` (owner-folder prefix) | `20260517_phase_2_looks.sql:114-153` (bucket created `public=false`, 20 MB limit) | `look_composites_anon_{select,insert,update,delete}` for `anon, authenticated` on `bucket_id='look-composites'` | VERIFIED |

Note: the migration changes **policies only**; it does **not** flip the bucket's `public` flag (`look-composites` stays `public=false`), but the new anon RLS policies make it fully readable/writable/deletable via the anon key regardless. `[VERIFIED]`

---

## 3. Exactly which tables + buckets are affected

**Tables (5):** `public.artists`, `public.character_features`, `public.artist_looks`, `public.location_library`, `public.prop_library`.
**Storage bucket (1):** `look-composites` (SELECT/INSERT/UPDATE/DELETE to `anon, authenticated`).

RLS **is enabled** on all five tables (`[VERIFIED]` — `initial_schema.sql:320` for artists; `20260517_phase_a_character_features.sql:41`; `20260517_phase_1_library.sql:83,135`; `20260517_phase_2_looks.sql:50`), so the `USING(true)` policy is *live logic*, not a no-op on an RLS-disabled table.

**Access each permissive policy grants to an unauthenticated holder of the public anon key** `[VERIFIED — policy semantics]`:
- Read + write + update + **delete** every row in all five tables across all tenants.
- Read + write + update + **delete** any object in `look-composites`.

Sensitive columns exposed include `artists.identity_profile_json` (holds `lora.url`, training state — cross-references SEC-2/SEC-3 identity poisoning), wardrobe reference-image records in `character_features`, and all `artist_looks` composition recipes.

---

## 4. Currently active? (confirm none re-locked later)

**Active on `main`: YES for all six objects.** `[VERIFIED]`

Method: enumerated every migration with a timestamp **after** `20260523171003` and grepped for any `CREATE/DROP POLICY` or `auth.uid()` touching the five tables or the bucket:

```
migrations after 20260523171003 that mention auth.uid() policies:
  20260531120000_timeline_export_layer.sql     → timeline_* tables (NOT the 5)
  20260610120000_editor_core_engine.sql        → video_projects children (NOT the 5)
  20260617120000_product_catalog.sql           → products/* (NOT the 5)
  20260617130000_product_catalog_phases_5_6.sql→ products/* (NOT the 5)
  (jacket-inpaint watchdogs 2026-07-06..23     → artist_looks.status reaper, NOT its RLS policy)
```

**No migration after 2026-05-23 recreates an owner-scoped policy on artists / character_features / artist_looks / location_library / prop_library, nor re-privatizes look-composites.** The permissive policies are the **last word** in the migration history for these objects. `[VERIFIED]`

Caveat `[OBSERVED / HYPOTHESIS]`: migration *files* on `main` ≠ what is *applied* on the live Lovable DB. A hotfix could have been applied out-of-band in the Lovable SQL editor without a committed migration. That can only be confirmed in the dashboard (§6).

---

## 5. Intentional-anon-bootstrap vs accidental

**Assessment: intentional DEV bootstrap that was accidentally left in the production-track migration history (i.e., a process failure, not a malicious or unaware change).** `[VERIFIED intent — DECISION]` + `[HYPOTHESIS on prod exposure]`.

Evidence it was **intentional (a dev bootstrap)** — a `[DECISION]`:
- Explicit header: *"DEV ONLY: open all access to anon role"* and *"Revert before production."* The author knew it removed per-user isolation and stated it must be reverted.
- Consistent with the codebase's broader **anonymous-auth accommodation** seen elsewhere: `compose-look-proxy` disables its `artist.user_id !== userId` check "blaming anonymous-auth user_id churn" (SEC-7). The app appears to run on Lovable anonymous auth during development, where `auth.uid()` churns per session and owner-scoped policies lock users out of their own just-created rows — the classic reason a dev opens RLS to `anon`.

Evidence it was **not supposed to persist / is now accidental exposure**:
- The migration itself mandates reversion "before production," and none occurred.
- It lives in the same ordered, production-track `supabase/migrations/` directory that Lovable replays against the live DB — so a "dev only" change is structurally indistinguishable from a permanent one once committed. There is **no environment gating** (no `WHERE current_setting('app.env') = 'dev'`, no separate dev migration channel).
- **No CI** (`.github/workflows/` absent) to flag a `USING(true)` policy landing on the main track.

Conclusion: the *change* was a deliberate developer convenience (`DECISION`); the *current production risk* is an unremediated-technical-debt / process gap, not a deliberate production posture. Whether it is actually exploitable **right now** depends entirely on live-DB application state (§6) — hence `HYPOTHESIS` on real-world exposure.

---

## 6. What a targeted least-privilege restore must do (spec only — NOT authored)

`[RECOMMENDATION]` — the fix migration is intentionally **not** written here. A correct restore must:

1. **Per table (artists, character_features, artist_looks, location_library, prop_library):**
   - `DROP POLICY IF EXISTS <table>_anon_all ON public.<table>;`
   - Recreate the four owner-scoped policies matching the ORIGINAL intent:
     - `SELECT USING (user_id = auth.uid())`
     - `INSERT WITH CHECK (user_id = auth.uid())`
     - `UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())`
     - `DELETE USING (user_id = auth.uid())`
   - Confirm `user_id` exists and is `NOT NULL` / defaulted to `auth.uid()` on each table before relying on it (verify per table; `character_features`/`location_library`/`prop_library` column names must be checked against their creating migrations — do not assume).
   - Keep `ENABLE ROW LEVEL SECURITY` (already on).
2. **`look-composites` bucket:**
   - `DROP POLICY IF EXISTS "look_composites_anon_{select,insert,update,delete}" ON storage.objects;`
   - Recreate the original owner-folder-prefix policies from `20260517_phase_2_looks.sql:132-153` (`bucket_id='look-composites' AND (storage.foldername(name))[1] = auth.uid()::text` pattern — verify the exact prefix expression against that file).
   - Bucket `public` flag is already `false`; leave it.
3. **Resolve the anonymous-auth root cause first**, or the restore re-breaks the app: decide whether the product uses durable authenticated users or anon users promoted to durable ids. If anon churn is real, the correct fix is a stable `user_id` (e.g., link anon → permanent user, or key ownership off a stable claim) — NOT re-opening RLS. This is why SEC-1 must be fixed **with** the anon-auth model, not in isolation.
4. **Verification queries** (run in Lovable SQL editor, read-only) to confirm the live state before and after:
   - `SELECT tablename, policyname, roles, qual, with_check FROM pg_policies WHERE tablename IN ('artists','character_features','artist_looks','location_library','prop_library');`
   - `SELECT policyname, qual, with_check FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname LIKE 'look_composites%';`
   - Expect **zero** rows with `qual = 'true'` / `roles = {anon}` after the restore.

---

## 7. Dashboard-only facts (cannot be verified from the repo)

`[HYPOTHESIS/unknown — do not guess]`
1. Is `20260523171003_*` actually **applied** on live DB `qoyxgnkvjukovkrvdaiq`? (Repo shows it queued; live could differ.)
2. Have any of the six objects been re-locked out-of-band via the Lovable SQL editor without a committed migration?
3. Is the live app currently running on anonymous auth (which would make the "revert" break UX and explains why it was never reverted)?
4. Current `pg_policies` rows for the five tables + `look-composites` (the queries in §6.4 settle it definitively).
