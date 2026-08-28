# Claude / ChatGPT Handoff — Architecture C product test (2026-08-28)

**Date:** 2026-08-28 (rev 3 — consolidated directive)  
**Author:** Cursor cloud agent  
**Audience:** Claude Code, ChatGPT, Fendi  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool  
**PR #36:** `cursor/architecture-c-blockers-7e56`  
**Live app:** https://aivideotool.lovable.app/  
**Lovable:** `bd21b544-c7b8-4780-bdde-391ac9d4bfa8` · ref `qoyxgnkvjukovkrvdaiq`

Evidence: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## 0. Identity decision — Branch A [VERIFIED]

Lovable service-role SQL (2026-08-28), no secrets exposed:

### `auth.users`

| id | is_anonymous | email | phone | last_sign_in_at |
|----|--------------|-------|-------|-----------------|
| `3ca10935-8c3d-4479-9a0c-8bfe8050840c` | **false** | `fendifrost@gmail.com` | null | 2026-05-20 |
| `832fa0bc-1f7e-4586-ab8b-2ac323698ede` | **true** | null | null | 2026-07-18 |

### `auth.identities`

| user_id | provider | identity_email | last_sign_in_at |
|---------|----------|----------------|-----------------|
| `3ca10935-…` | **email** | `fendifrost@gmail.com` | 2026-05-20 |
| `832fa0bc-…` | *(no rows)* | | |

**[DECISION] Branch A — real email credential on `3ca10935-…`.** No ownership migration. No Class-C stop.

**[VERIFIED]** Matches `docs/security/RISK-001/IDENTITY_CONSOLIDATION.md` (2026-08-08): sole non-anonymous account; 20 anon UIDs re-owned into it. Email later repaired to `fendifrost@gmail.com` (`SECURITY_DECISIONS.md` 2026-08-12).

**[VERIFIED]** AVT app history has never called `signInWithPassword` / `signInWithOtp` / `linkIdentity` — only `signInAnonymously()` in `__root.tsx`. Credential exists at Auth layer; **AVT UI cannot obtain it today.**

**[RECOMMENDATION]** Smallest next product step: minimal magic-link OTP for `fendifrost@gmail.com` so session UID = `3ca10935-…`. Not an ownership migration.

### RISK-001 Part A timing [VERIFIED / process note]

`67b4f7a` / PR #30 (2026-08-27) applied owner-scoped table RLS. Migration header said SQL only after Class-C + §A0 inventory. Consolidation + health reports already exist under `docs/security/RISK-001/` and document the durable UID. Identity split was old; **visibility of empty artists/wardrobe is one day old** because Part A closed the open policies on those five tables. `video_projects` / `project_assets` still carry `*_open_test` / `single_tenant_all` — hence anonymous still sees YSL videos.

---

## 1. Git / deploy state

| Item | SHA | State |
|------|-----|-------|
| `origin/main` | `0e9c3bb` | bot `any` typing; ahead of deployed |
| Deployed edge + UI (pre-#36) | `6493492` | |
| PR #36 head (this rev) | see latest push | open → merge after 2a–2d |
| Stale sibling `-fix-` | `0501684` | **deleted** |

Canonical YSL project UUID (everywhere):

```
764a63d2-93cd-44f3-905f-292f14ab2f51
```

Test URL:

```
https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame
```

---

## 2. PR #36 corrections (consolidated directive §2)

| Item | Status |
|------|--------|
| **2a** Fail-closed R4 — `fallbackPath` ignored; return `[]` if no flat | **Done** |
| **2b** Regression: no flat + on-model fallbackPath → `[]` | **Done** |
| **2c** Verbatim frozen prompt + `READY = true` | **Done** |
| **2d** YSL UUID corrected | **Done** |
| `reference_images: [{url}]` | already correct |
| `pickGrokGarmentReferencePaths` untouched | already correct |

### Frozen prompt provenance

`HANDOFF_R4_R5_reference_config.md` §3 — identical across R1/R4/R5. Paired with flat-only max-1. Installed in `src/lib/heroFrame/grokVideoEditPrompt.ts` **verbatim**.

---

## 3. Architecture (unchanged)

**GO WITH DETERMINISTIC REPAIR.** Raw Grok `edited_clip` → later SAM-3 + master + deterministic branding.

---

## 4. Acceptance blockers remaining after merge/redeploy

| Gate | Status |
|------|--------|
| PR #36 merged + `grok-video-edit-proxy` redeployed | after this rev |
| Frozen prompt READY | **yes** |
| Recoverable AVT session as `3ca10935-…` | **no UI yet** — Branch A credential exists; magic-link still required |
| Fendi sees artist / YSL / wardrobe / jacket / video | blocked on durable session |
| Fendi makes the ~$0.30 UI click | not agent |

**No ownership SQL. No paid xAI from agents. No broad edge redeploy (bot commits stay separate).**

---

## 5. Frozen IDs

| Item | Value |
|------|-------|
| Durable owner | `3ca10935-8c3d-4479-9a0c-8bfe8050840c` |
| Anon live session | `832fa0bc-1f7e-4586-ab8b-2ac323698ede` |
| Artist | `8d4a4d22-41c0-43ab-ba99-92750f81e335` |
| YSL project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| SL jacket | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Clip asset | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Research spend | $0.32 |
