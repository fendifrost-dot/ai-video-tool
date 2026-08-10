# RISK-001 — Impact Report: "What breaks if we restore least-privilege RLS?"

**Scope: PART A (TABLE-ONLY).** The revert migration
`supabase/migrations/20260806120000_risk_001_revert_anon_rls.sql` restores
owner-scoped RLS on the five tenant TABLES only — `artists`, `character_features`,
`location_library`, `prop_library`, `artist_looks` — removing the accidental
`USING(true)` anon grants from `20260523171003_*.sql` **and** the stray
`*_open_test` / `single_tenant_all` policies the identity audit found live on those
tables (see §0.1). **The `look-composites` storage bucket is deferred to PART B**
(a separate PR/migration that runs only AFTER the storage re-key) and is out of
scope here; its impact is called out where relevant but is not restored by this PR.

**Method:** live code trace of `src/` and `supabase/functions/` on `origin/main`
@ `c9252fe`. Every claim below is tagged **[VERIFIED]** (I read the exact code, file:line cited)
or **[INFERENCE]** (reasoned from verified facts; live-DB state is dashboard-only).

---

## 0.1 What Part A changes vs the culprit migration (drop list is longer)

Part A does **not** only undo the one dev-only migration. The identity/consolidation
audit inventoried the **live** policies and found the DB is **MORE open** than
`20260523171003_*.sql` alone documents: beyond the culprit's `*_anon_all` policies,
there are stray permissive policies — `*_open_test` (per table) and a shared
`single_tenant_all` — that no committed migration accounts for. Postgres RLS **unions**
permissive policies, so a single leftover `USING(true)` re-opens the table regardless of
the owner-scoped policies we add. Part A therefore drops **all three families**
(`*_anon_all`, `*_open_test`, `single_tenant_all`) on the five tables before recreating
the owner-scoped policies. Because live drift can exceed any snapshot, the drop list is
necessary-but-not-assumed-sufficient: the **§A0 pre-deploy COMPLETE inventory**
(VERIFICATION_PLAN) must be re-run against the live DB immediately before apply and any
additional stray policy added to the migration first. **[VERIFIED — audit finding /
RLS union semantics]**

## 0. TL;DR — the answer we merge on

**In normal operation on the primary device, essentially nothing user-facing breaks.**
The app is not making bare-`anon` requests: on load it establishes an **anonymous
*authenticated* session** (`supabase.auth.signInAnonymously()`,
`src/routes/__root.tsx:129`) that persists in `localStorage`, so `auth.uid()` is
populated and every read/write the UI performs already carries an owner identity.
Every insert explicitly stamps `user_id`/owner from that session, and every
`look-composites` write is already pathed under `{user_id}/…`. The restored policies
are exactly what that happy path assumes. **[VERIFIED]**

**Two things do change, and one of them is the whole reason RLS was opened:**

1. **Bare-anon (no session) access stops working.** Any request issued before the
   session bootstraps, or if anonymous sign-in is disabled/fails, now returns zero
   rows and cannot write. Today `USING(true)` lets it through. **[VERIFIED mechanism]**
2. **⚠️ THE MATERIAL ONE — anonymous-identity churn / multi-device continuity.**
   Identity is a **per-device anonymous uid** kept in `localStorage`. If that uid ever
   changes for the same human — cleared storage, a different browser or device, an
   expired/unrefreshed anon session — the new `auth.uid()` no longer matches the
   `user_id` on rows created under the old uid, so **those rows become invisible and
   unwritable to that person after the restore.** Today the open policy *masks* this by
   showing every session all rows globally. This is not an endpoint failing — it is
   data **continuity for the same user across sessions**, and it is precisely the
   pain the dev-only migration was papering over (forensic §5, §6.3). **[VERIFIED
   mechanism] / [INFERENCE on live blast radius — depends on how many distinct anon
   uids exist in the live tables, which is dashboard-only.]**

**Practical read:** if the deployment is effectively single-operator (Fendi) on a
primary device whose persisted anon session is intact, restore impact is ~nil — that
device keeps its uid and therefore its rows, and all edge/background paths are
unaffected. The restore's real risk is **not** a broken screen; it is a data-access
regression for any human whose anon uid has drifted. **That must be checked against
the live DB (how many distinct `user_id`s exist per table) before apply, and if
drift exists, resolved by stabilising the anon identity or re-owning rows — NOT by
re-opening RLS.** See §5.

---

## 1. The role / client model (why most of the system is unaffected)

| Actor | Role at the DB | Affected by restore? | Evidence |
|-------|----------------|----------------------|----------|
| Browser UI (TanStack/React) | `authenticated` via **anonymous** sign-in; `auth.uid()` = per-device anon uid | **Only for rows under a *different* uid** (churn) — current-uid data works | `src/routes/__root.tsx:124-135`; client `persistSession:true` `src/integrations/supabase/client.ts:22-27` **[VERIFIED]** |
| Bare `anon` role (no JWT) | `anon` | **Yes — loses all access** (intended) | there is no normal bare-anon path; UI forces a session first **[VERIFIED]** |
| Edge functions (proxies, callbacks, watchdogs, reapers) | **service role** (`SUPABASE_SERVICE_ROLE_KEY`) → **bypasses RLS by design** | **No** | `createClient(url, serviceRoleKey…)` in faceswap-callback:90, train-style-lora-proxy:71, compose-look-callback:85, frame-extract:280, upload-asset:96, etc. **[VERIFIED]** |
| Edge functions acting *as the caller* (userClient) | `authenticated` (caller JWT) | **No** — they already write under the caller's own scope | compose-look-proxy uses `userClient` for the `artist_looks` insert + `look-composites` upload "as the user (RLS-scoped)" (`compose-look-proxy/index.ts:10-11, 208-212, 603-609`) **[VERIFIED]** |

**Consequence:** background jobs, callbacks, the jacket-inpaint watchdog/reaper, and
every `*-proxy` that reads these tables through the service role are **RLS-exempt and
therefore unaffected** by this change. **[VERIFIED]**

---

## 2. Per-object impact

Insert paths that set the owner explicitly (so the restored `WITH CHECK` passes):
`artists.ts:99` (`user_id: user.id`), `faceRestore.ts:277`, `grokOutfitLock.ts:96`,
`eyewearRestore.ts:122` (`user_id: userId`). **[VERIFIED]**

### 2.1 `public.artists`
- **UI reads/writes:** `src/lib/queries/artists.ts` (list `:36`, detail `:55`, create
  `:100`, update `:128`, delete `:150`); surfaced on `pages/Artists.tsx`, artist detail,
  and everywhere an artist is picked. **[VERIFIED]**
- **Edge reads:** `compose-look-proxy:246`, `train-style-lora-proxy:76/115/150/179` —
  **service role → unaffected**. **[VERIFIED]**
- **After restore:** UI sees/edits only artists owned by the current uid. Happy path
  works (insert stamps `user_id`; reads scoped to same uid). **Breaks only** for a bare-anon
  caller or a churned uid. **[VERIFIED mechanism]**

### 2.2 `public.character_features`  *(scoped via `artist_id` → `artists`, NOT `user_id`)*
- **UI reads/writes:** `characterFeatures.ts` (`:83/:118/:149/:173`), `styleReferences.ts`
  (`:58/:88/:129`), `wardrobe.ts` (`:91/:142/:179/:202/:311`). **[VERIFIED]**
- **Edge reads:** wardrobe-vton-proxy:288, jacket-inpaint-proxy:245,
  wardrobe-video-swap-proxy:221, wardrobe-video-lucy-proxy:219, grok-resolution-test:247
  — **service role → unaffected**. **[VERIFIED]**
- **After restore:** a feature row is visible only if its parent artist is owned by the
  current uid. Because features hang off artists, **any artist-visibility change (churn)
  cascades here identically.** No extra break beyond the artist scope. **[VERIFIED]**

### 2.3 `public.location_library`
- **UI reads/writes:** `locations.ts` (`:79/:115/:139/:158/:194`); `pages/LocationsLibraryPage.tsx`
  (`getUser()` at `:75/:113`). **[VERIFIED]**
- **Edge reads:** none found. **[VERIFIED]**
- **After restore:** owner-scoped `user_id = auth.uid()`. Same happy-path/churn profile
  as artists. **[VERIFIED]**

### 2.4 `public.prop_library`
- **UI reads/writes:** `props.ts` (`:79/:115/:139/:158/:194`); `pages/PropsLibraryPage.tsx`
  (`getUser()` at `:75/:109`). **[VERIFIED]**
- **Edge reads:** none found. **[VERIFIED]**
- **After restore:** owner-scoped `user_id = auth.uid()`. Same profile. **[VERIFIED]**

### 2.5 `public.artist_looks`
- **UI reads/writes:** `looks.ts` (many, `:100…:571`), `LooksListPage.tsx:56`,
  `shotLockedLook.ts:61`, `faceRestore.ts:178/273`, `grokOutfitLock.ts:33/92`,
  `eyewearRestore.ts:65`. **[VERIFIED]**
- **Edge reads/writes:** faceswap-callback (service role), wardrobe-vton-proxy,
  jacket-inpaint-proxy (service role) — **unaffected**; **compose-look-proxy inserts as
  the user** (`:604/:733`, userClient) — writes under the caller's own `user_id`, so it
  **still works** post-restore. **[VERIFIED]**
- **After restore:** owner-scoped. Same happy-path/churn profile. **[VERIFIED]**

### 2.6 storage bucket `look-composites` — DEFERRED TO PART B (not changed by this PR)
Part A does **not** touch `storage.objects`. The bucket lock-down (drop the anon
SELECT/INSERT/UPDATE/DELETE policies, restore owner-folder-prefix policies) is a
separate **Part B** migration that runs only **after the storage re-key** — doing it
before the re-key would strand objects written under the old key layout. Until Part B
applies, the bucket **remains open per the culprit migration** — that residual exposure
is tracked, not resolved, by this PR. The code facts below are retained for Part B's
eventual impact assessment:
- **UI reads (signed URLs):** `LookDetailPage.tsx:122`, `HeroFrameStudioPage.tsx:189`,
  `LooksListPage.tsx:52`, `LookCard.tsx:78`, `ShotLockedLookPicker.tsx:50`. **[VERIFIED]**
- **UI writes (`uploadBytesToBucket`, upsert):** `faceRestore.ts:251`,
  `eyewearRestore.ts:102`, `grokOutfitLock.ts:75` — **all** pathed
  `${userId}/${artist_id}/${lookId}.png` (`faceRestore.ts:250`, `grokOutfitLock.ts:74`,
  `eyewearRestore.ts:101`). **[VERIFIED]**
- **Edge writes:** compose-look-proxy (userClient, own folder), compose-look-callback &
  faceswap-callback & sam3-segment-proxy (service role) — **unaffected**. **[VERIFIED]**
- **Part B (after re-key) will restore:** the owner-folder-prefix policy
  (`(storage.foldername(name))[1] = auth.uid()::text`), which is exactly the path the UI
  already writes; bucket stays `public=false`. **Not in Part A.**

---

## 3. Explicit "which anonymous requests FAIL after restore"

| Anonymous request (today succeeds via `USING(true)`) | After restore | Intended? |
|---|---|---|
| Bare-`anon` (no session) SELECT on any of the 5 tables | **Fails → 0 rows** | ✅ yes — that is the fix |
| Bare-`anon` INSERT/UPDATE/DELETE on any of the 5 tables | **Fails (RLS)** | ✅ yes |
| Bare-`anon` read/write/delete of any `look-composites` object | **Still succeeds** (bucket is **Part B**, unchanged here) | ⏸ deferred — closed by Part B after re-key |
| Cross-tenant read: session A reading session B's artists/looks/features | **Fails** | ✅ yes — restores isolation |
| **Same human, new anon uid** (cleared storage / other device) reading their *own prior* rows | **Fails → looks like data loss** | ⚠️ **side effect** — see §5, must be handled |
| Authenticated (anon-auth) caller on its own current-uid data | **Works** | ✅ unchanged |

---

## 4. What is confirmed NOT to break

- **Authenticated artist happy path (same device/session):** reads scoped to the live
  uid; inserts stamp `user_id`; look uploads land in `{uid}/…`. **[VERIFIED]**
- **Service-role background workers / callbacks / watchdogs / reapers:** RLS-exempt.
  **[VERIFIED]**
- **`compose-look-proxy` user-scoped writes:** land in the caller's own scope. **[VERIFIED]**
- **Hero Frame Studio browser load:** its **table** reads resolve for the current uid's
  data. Its `look-composites` signed-URL reads (`HeroFrameStudioPage.tsx:189`) are on the
  bucket, which **Part A does not change** — so they are unaffected by this PR regardless
  of uid (bucket owner-scoping arrives in Part B). **[VERIFIED for current-uid table
  data; bucket unchanged in Part A]**
- **`provider_capabilities`:** untouched by this migration; its public read-only catalog
  policy is intentional (SECURITY.md §2.2). **[VERIFIED]**

---

## 5. Residual dependency (do not merge blind to this)

The restore is correct and safe **for data owned by the current session**. Its only
real-world hazard is the **anonymous-identity model** the forensic already named
(§6.3): today's open policy achieves "single-user continuity" by giving *every* visitor
one shared, un-isolated dataset. Locking down re-introduces per-uid isolation, which is
right for security but exposes any prior uid drift as apparent data loss.

**Required before apply (dashboard / live-DB, out of this PR's code scope):**
1. Run `SELECT table, count(DISTINCT user_id) FROM …` (per the VERIFICATION_PLAN
   queries) to learn **how many distinct owner uids** exist in each table on the live DB.
   - If **one** dominant uid (single operator, stable session): apply is low-risk.
   - If **many**: decide re-ownership/consolidation, or stabilise anon→durable identity,
     **first**.
2. Confirm anonymous sign-in is **enabled** on the Lovable project (or the UI shows the
   `"failed"` bootstrap state) — the restore assumes a session always exists.

Neither step is a code change; both are prerequisites the reviewer/operator must clear.
The migration itself is inert until applied.

---

## 6. Out of scope (named so it isn't silently conflated)

- **PART B — the `look-composites` storage bucket.** Restoring owner-folder-prefix RLS on
  the bucket is a **separate migration/PR** that runs **only after the storage re-key**;
  sequencing it before the re-key would strand objects written under the old key layout.
  Until Part B lands, the bucket **remains exposed per the culprit migration** — a known,
  tracked residual, not something this PR closes. Part A is TABLE-ONLY.
- **SEC-2 / SEC-3** (unauthenticated `train-style-lora-proxy` / callback identity
  poisoning) — separate edge-function auth fixes; **frozen** for this PR.
- **SEC-6** `grok-resolution-test` accepts the public anon key as bearer, but its DB
  reads go through the **service role** (`grok-resolution-test/index.ts:184`), so they are
  unaffected by this RLS change; its exposure is an auth defect, tracked separately
  (that function is self-flagged "DELETE THIS FUNCTION"). Noted, not touched. **[VERIFIED]**
