# Claude / ChatGPT Handoff — Architecture C product test (2026-08-28)

**Date:** 2026-08-28 (rev 2 — identity/auth verification + blocker code corrections)  
**Author:** Cursor cloud agent  
**Audience:** Claude Code, ChatGPT, Fendi — review before the next ~$0.30 product click  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool  
**Branch / PR:** `cursor/architecture-c-blockers-7e56` · PR **#36** (open — do not merge until review)  
**Live app:** https://aivideotool.lovable.app/  
**Lovable project:** `bd21b544-c7b8-4780-bdde-391ac9d4bfa8` · Supabase ref `qoyxgnkvjukovkrvdaiq`

**Read first:**
- `docs/AGENT_BOOTSTRAP.md` + `.deployment/manifest.yml`
- `docs/research/ARCHITECTURE_C_DECISION.md` — **GO WITH DETERMINISTIC REPAIR**
- `docs/research/GROK_RECAP_2026-08_PHASE2_CURSOR_SESSION.md`
- `SECURITY_DECISIONS.md` (2026-08-12 email repair of durable UID)
- This file

**Evidence labels:** **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## 0. Executive summary

Architecture C product lane exists (`grok-video-edit-proxy` + Hero Frame §6). Research spend remains **$0.32**. **No product-lane xAI spend.**

| # | Blocker | Class | Status (rev 2) |
|---|---------|-------|----------------|
| 1 | Empty garment selector (RLS + session identity) | **HARD** | **H1 VERIFIED.** Owner UID is **durable email**, not anonymous. AVT UI has **no** recoverable sign-in path today. UX warnings updated. |
| 2 | `reference_images` as `string[]` | **HARD** | **Fixed** — `[{url}]` + unit test. Needs merge + edge redeploy. |
| 3 | Wrong / missing frozen prompt | **FALSE NEGATIVE** | **Still gated.** Verbatim Fendi-confirmed R4/R5 string was **not found** in this agent context (transcript / PR / repo / Drive). `GROK_VIDEO_EDIT_PROMPT_READY = false`. **Paste required — do not paraphrase.** |
| 4 | On-model reference leak (R1 config + fallbackPath) | **QUALITY** | **Fixed** — flat-only max 1; on-model `fallbackPath` can no longer leak when no flat exists + regression test. |

**Do not spend $0.30 until:** #36 merged + `grok-video-edit-proxy` redeployed + durable session established + frozen prompt installed with `READY = true`.

**Do not migrate ownership** of artists/wardrobe away from `3ca10935-…` — that UID is the durable owner.

---

## 1. Identity verification (required before RISK-001 migration) [VERIFIED]

Service-role query on `auth.users` (Lovable `query_database`, 2026-08-28):

| UID | `is_anonymous` | email | provider | `last_sign_in_at` |
|-----|----------------|-------|----------|-------------------|
| `3ca10935-8c3d-4479-9a0c-8bfe8050840c` | **false** | `fendifrost@gmail.com` | email | 2026-05-20 |
| `832fa0bc-1f7e-4586-ab8b-2ac323698ede` | **true** | null | (none) | 2026-07-18 |

**[VERIFIED]** Canonical owner is **not** anonymous. It is the durable email account repaired 2026-08-12 (`SECURITY_DECISIONS.md`) — UID preserved, email set to `fendifrost@gmail.com`, `email_confirm: true`.

**[VERIFIED]** Live product-test session that sees empty artists/wardrobe is the **anonymous** UID `832fa0bc-…`.

**[DECISION]** Do **not** re-own artists / `character_features` / YSL project away from `3ca10935-…`. Ownership consolidation target remains that durable UID. The gap is **session recoverability**, not “both UIDs are anonymous.”

---

## 2. AVT auth implementation — recoverability [VERIFIED]

| Fact | Evidence |
|------|----------|
| Bootstrap creates anonymous session only | `src/routes/__root.tsx` → `supabase.auth.signInAnonymously()` |
| No email / magic-link / password UI in app | **VERIFIED** — no `signInWithOtp` / `signInWithPassword` / Login route in `src/` |
| Sign out exists | `AppShell` → `supabase.auth.signOut()` |
| After sign-out, reload re-bootstraps **another anonymous** session | Same `__root.tsx` bootstrap |
| Durable account exists at Supabase Auth layer | `auth.users` row above + `SECURITY_DECISIONS.md` |

**[VERIFIED]** There is **no recoverable authentication path through the current AVT UI** to obtain a `3ca10935-…` session.

**[VERIFIED]** A recoverable path **exists at the Auth provider layer** (confirmed email on durable UID) but is unused by the app.

**Incorrect recommendation removed:** “Sign in as the owning account” — that is not possible in today’s AVT product surface.

### Why anonymous still sees YSL project / videos

**[VERIFIED]** `video_projects` and `project_assets` still carry open policies (`single_tenant_all`, `*_open_test` with `qual = true`) alongside owner policies. RISK-001 Part A only locked `artists`, `character_features`, `location_library`, `prop_library`, `artist_looks`. So anonymous can list projects/assets; wardrobe/artists stay empty under owner RLS.

---

## 3. Smallest durable-auth + ownership proposal [RECOMMENDATION]

**Goal:** Let Fendi run Architecture C as `3ca10935-…` without creating duplicate artists or migrating ownership onto an anonymous UID.

### A. Durable auth (smallest)

1. Add a **minimal magic-link sign-in** surface to AVT (email OTP via `supabase.auth.signInWithOtp({ email })` + callback route). Scope: one email field + “send link” + session swap. No password, no multi-tenant productization.
2. Confirm Lovable Auth has **email magic link enabled** for the project (in addition to anonymous, which stays for bootstrap until signed in).
3. Send link to **`fendifrost@gmail.com`** only (the durable account). After click, session UID must equal `3ca10935-8c3d-4479-9a0c-8bfe8050840c` — verify in DevTools before any paid run.
4. Stop auto-creating a second anonymous session when a durable session already exists (bootstrap: `getSession()` first — already does; after magic-link, do not call `signInAnonymously` again).

### B. Ownership (do not migrate away from durable)

| Object | Current owner | Action |
|--------|---------------|--------|
| Artists / wardrobe / YSL `video_projects` | `3ca10935-…` | **Keep.** No SQL ownership rewrite. |
| Anonymous `832fa0bc-…` | orphan session | Ignore for product test; optional later cleanup of anon-only rows. |
| Storage prefixes under `832fa0bc-…/` | path history | Already covered by RISK-001 storage rekey plan — **separate Class C**; not required to unstick garment dropdown once durable session is live. |

### C. Explicit non-actions

- Do **not** create duplicate Fendi Frost artist / SL jacket rows under the anonymous UID.
- Do **not** widen RLS back to open on `artists` / `character_features`.
- Do **not** merge #36 into a “just make anon see wardrobe” shortcut.
- Do **not** run paid Grok until durable session + frozen prompt are live.

---

## 4. Git / deploy state

| Item | SHA / ref | Label |
|------|-----------|-------|
| `origin/main` tip | `0e9c3bb` (bot Deno `any` typing) | **VERIFIED** |
| Product lane merge | `991bcb2` (PR #34) | **VERIFIED** |
| `video_projects` hotfix | `6493492` (PR #35) | **VERIFIED** |
| Blocker fixes PR | **#36** `cursor/architecture-c-blockers-7e56` | open |
| Deployed edge (live) | `6493492` `grok-video-edit-proxy` | **VERIFIED** earlier; redeploy after #36 merge |
| Research evidence | `fd7b565` (PR #33) | **VERIFIED** |

### Bot commits on `main` (ahead of deployed `6493492`)

```
0e9c3bb  Fixed Deno build errors
fc629ea  Changes
```

`ReturnType<typeof createClient>` → `any` across 10 edge functions. Decide before broad redeploy.

---

## 5. Architecture decision (unchanged)

**[DECISION] GO WITH DETERMINISTIC REPAIR** — `docs/research/ARCHITECTURE_C_DECISION.md`.

```
Grok video edit → SAM-3 garment isolation → original master outside garment → deterministic branding
```

Product lane ships raw `edited_clip` for human review first.

---

## 6. Product lane inventory

| Piece | Path |
|-------|------|
| Edge | `supabase/functions/grok-video-edit-proxy/index.ts` |
| Request shape helper | `supabase/functions/_shared/grokVideoEditRequest.ts` |
| Flat-only picker | `pickGrokVideoEditReferencePaths` in `_shared/garmentReference.ts` |
| Client | `src/lib/queries/grokVideoEdit.ts` |
| Prompt gate | `src/lib/heroFrame/grokVideoEditPrompt.ts` (**READY = false** until verbatim paste) |
| UI | `src/components/video/GrokVideoEditRunner.tsx` |

**Canonical product-test URL:**

```
https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame
```

(YSL project UUID corrected — prior handoff truncated to `…292f51`.)

---

## 7. Blocker 2 — schema [VERIFIED fixed in #36]

```ts
reference_images: referenceUrls.map((url) => ({ url }))
```

Unit test: `_shared/grokVideoEditRequest.test.ts`.

---

## 8. Blocker 3 — frozen prompt [BLOCKED — string not in agent context]

**[VERIFIED]** Agent searched: this transcript, PR #36 body/comments, repo, Google Drive query for `GROK_RECAP_FOUR_STEP` / R4 frozen text. **No verbatim Fendi-confirmed R4/R5 prompt body found.**

External pointer from prior handoff: `/root/recap/GROK_RECAP_FOUR_STEP_VERDICT.md` §"Step 1 & 2" — **not present in this checkout**.

**[DECISION]** Leave `GROK_VIDEO_EDIT_PROMPT_READY = false` and empty prompt. **Do not paraphrase** Aleph §3.1 (“cream bomber… full front zip, ribbed cuffs”) or the removed track-jacket default — both conflict with the stand-collar mastic garment description used in blocker analysis.

**Required from Fendi:** paste the exact confirmed string into chat (or land the verdict file in-repo). Then set:

```ts
export const GROK_VIDEO_EDIT_PROMPT_READY = true as const;
export const GROK_VIDEO_EDIT_PROMPT = "<verbatim>";
```

…and redeploy edge after merge.

---

## 9. Blocker 4 — reference picker [VERIFIED fixed in #36]

- Call site uses `pickGrokVideoEditReferencePaths(..., max = 1)`.
- On-model refs filtered out.
- **Regression:** when only on-model refs exist and `fallbackPath` is that on-model path, result is `[]` (no leak). Test: `garmentReference.test.ts`.

Shared `sortRefsForFullLookGarment` unchanged (VTON / full-look lanes untouched).

---

## 10. Frozen research IDs

| Item | Value |
|------|-------|
| YSL project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Clip asset | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| SL jacket feature | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Artist | `8d4a4d22-41c0-43ab-ba99-92750f81e335` (Fendi Frost) |
| Durable owner UID | `3ca10935-8c3d-4479-9a0c-8bfe8050840c` |
| Anon live session | `832fa0bc-1f7e-4586-ab8b-2ac323698ede` |
| P2_corrected cost | **$0.32** |
| P2 request | `ed27462b-39c6-9fe6-9d6b-e3a6475809c0` |

---

## 11. Suggested order of work

1. Review PR #36 code (schema, flat-only + fallback leak fix, UX, this handoff).
2. **Paste frozen prompt** → commit READY=true (follow-up commit on #36 or tiny follow PR).
3. Merge #36 → redeploy **only** `grok-video-edit-proxy`.
4. Implement smallest magic-link durable auth (§3A) — Class B/C as appropriate; not ownership migration.
5. Confirm session UID = `3ca10935-…` and garment dropdown populates.
6. **Fendi** clicks Run Grok video edit (~$0.30 product test).

---

## 12. Out of scope

- A3/B1 research revival
- SAM-3 master composite (after promising raw edit)
- Ownership migration onto anonymous UID
- Bot `any` typing acceptance without review
- Paid xAI from agents

---

## 13. Review checklist

- [ ] Identity table: durable vs anon correctly stated
- [ ] No “sign in as owning account” language remains without a real AVT path
- [ ] Durable-auth proposal is minimal and does not widen RLS
- [ ] `reference_images: [{url}]` correct
- [ ] On-model `fallbackPath` cannot leak (test present)
- [ ] Prompt gate still blocks billed runs until verbatim string lands
- [ ] YSL UUID is full `764a63d2-93cd-44f3-905f-292f14ab2f51`
- [ ] No merge / no ownership SQL until durable session path exists
