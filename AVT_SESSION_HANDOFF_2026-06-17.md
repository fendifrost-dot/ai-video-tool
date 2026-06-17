# AVT Session Handoff — Full Summary (2026-06-17)

**Purpose:** Single document for ChatGPT, Grok, or any fresh reviewer to audit what was done, what shipped, what's blocked, and what remains.  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool  
**Live app:** https://aivideotool.lovable.app/  
**Artist root (Fendi):** `/artists/8d4a4d22-41c0-43ab-ba99-92750f81e335`

**Companion docs (in repo):**
- `AVT_MEMORY_HANDOFF.md` — hard rules + VTON-first architecture (may be untracked locally)
- `AVT_POST_DEPLOY_CHECKLIST.md` — step-by-step Lovable panel walkthrough (**on `main`**)
- `cursor_handoff_avt_product_catalog_migration.md` — catalog Phases 1–6 spec
- `claude_code_handoff_avt_product_catalog_deploy.md` — catalog deploy notes (partially stale)

---

## 1. Original goal (unchanged)

Build a **photoreal clothing-swap workflow for music videos**: import designer garments (e.g. Saint Laurent jackets), place them on Fendi's avatar/identity **virtually indistinguishable from reality**, repeat for MV costume changes without buying clothes.

**Quality bar:** Natural fit, correct garment geometry (collar, zipper, hem), identity preserved. Audit reference vs output before calling anything a win.

**Architecture (locked — do not redesign without Fendi):**

```
Video (target):  Source → FFmpeg frames → VTON per frame (idm-vton) → SwitchX temporal → FFmpeg reassembly
Stills:          Garment refs → compose-look-proxy OR wardrobe-vton-proxy → CC Fal pipelines
```

- **VTON** (IDM-VTON / CatVTON) = garment transfer truth engine  
- **SwitchX (Beeble)** = temporal/background only — NOT generative wardrobe  
- **Kling v2v** = disqualified (identity destruction)  
- **No Claude-side** segmentation, compositing, or AI-regeneration of garment pixels

---

## 2. Infrastructure map (do not confuse projects)

| Ref | Project | Role |
|-----|---------|------|
| **`qoyxgnkvjukovkrvdaiq`** | **AVT — AI Video Tool** | Live app, wardrobe, looks, product catalog DB, AVT edge functions |
| **`wkzwcfmvnwolgrdpnygc`** | **CC — Fendi Control Center** | `compose-look`, `switchx-restyle`, `faceswap-generate`, `fal-queue-poll` |

- AVT has **no standalone supabase.com account** — Lovable Cloud only  
- CC secrets (`FAL_API_KEY`, `SWITCHX_PROXY_SECRET`) live on CC project  
- AVT secrets (`COMPOSE_LOOK_CC_URL`, `COMPOSE_LOOK_PROXY_SECRET`, optional `SWITCHX_PROXY_SECRET`) live on AVT project  

**Lovable ↔ GitHub:** Connected; builds from **`main`**. GitHub commits appear in Lovable timeline. Settings→Git "connect provider" prompt can be misleading — integration works via timeline/sync.

---

## 3. What this session accomplished (code)

### 3A. Product catalog (PR #4 — Phases 1–6)

**Merged to `main`.** Implements approved plan in `cursor_handoff_avt_product_catalog_migration.md`.

| Phase | Deliverable |
|-------|-------------|
| 1 | `products`, `product_variants`, `product_assets`, `product_wardrobe_links`; Design Studio + Product Library UI; `product-assets` bucket |
| 2 | Promote wardrobe → product (`promoteWardrobe.ts`); bulk promote |
| 3 | Virtual Samples rename; `ProductGarmentPicker`; `productPicks[]`; `productResolve.ts` in compose proxy |
| 4 | Wardrobe deprecation behind `VITE_WARDROBE_DEPRECATED` (default off) |
| 5 | `tech_packs`, `manufacturing_packages`; manufacturing zip export |
| 6 | `collections`, `collection_products`; `FitProfileEditor` |

**Bugs fixed before merge:**
- Feature flags defaulted ON → blocked wardrobe; **now all default OFF** (`src/lib/queries/products.ts`)
- `compose-look-proxy` signed product assets from `wardrobe-refs` bucket → fixed `bucketForPath()`

**Feature flags (all opt-in, build-time `VITE_*`):**

| Flag | Purpose | Default |
|------|---------|---------|
| `VITE_PRODUCT_CATALOG_ENABLED` | Design Studio + Products nav | off |
| `VITE_PRODUCT_LIBRARY_COMPOSE` | Compose from product library in Virtual Samples | off |
| `VITE_WARDROBE_DEPRECATED` | Read-only legacy wardrobe | off |

### 3B. Wardrobe VTON pipeline (same merge)

Addresses core clothing-swap gap: multi-angle refs stored but **VTON used wrong image** (`reference_images[0]` = upload order, often on-model lifestyle shot).

| Deliverable | Path |
|-------------|------|
| Smart garment ref picker | `src/lib/garment/vtonReference.ts` — prefers `front` / flat; deprioritizes on-model heuristics |
| Deno copy for edge | `supabase/functions/compose-look-proxy/garmentReference.ts` |
| Wired into compose | `compose-look-proxy/index.ts`, `productResolve.ts` |
| IDM-VTON still swap proxy | `supabase/functions/wardrobe-vton-proxy/` → CC `switchx-restyle` `vton-frame` |
| Fal poll wrapper (no secret in browser) | `supabase/functions/fal-queue-poll-proxy/` |
| Client API | `src/lib/queries/wardrobeVton.ts` |
| Multi-angle bundle import | `src/components/wardrobe/GarmentBundleImport.tsx` |
| UI: Apply garment on look | `src/pages/LookDetailPage.tsx` |
| UI: Apply garment on MV frame still | `src/components/assets/AssetCard.tsx` |
| Composer hint for outerwear | `src/components/looks/LookComposer.tsx` |

**Tests:** 224/224 passing at last local run before merge.

### 3C. Identity apply path (pre-existing on `main`, preserved in merge)

`LookDetailPage` **Apply my identity** uses `callComposeLook` with `pipelinePreference: "identity_inpaint"` (FENDIFROST LoRA) — **not** legacy `faceswap-proxy`. Merge conflict resolved to keep this `main` behavior + add VTON imports only.

---

## 4. Git history (authoritative)

| Commit | Description |
|--------|-------------|
| `4b093a5` | Product catalog Phases 1–6 |
| `c89baae` | Catalog deploy handoff (Claude) |
| `d9b7b1a` | Wardrobe VTON + smart ref picker |
| `4affd6e` | **Merge** `feat/product-catalog-phases-1-6` → `main` |
| `4a249bb` | Pre-merge `main` tip (identity_inpaint guard) |
| `eed7ec2` | Lovable-side "Redeployed all changes" (frontend) |
| `32ac025` | `AVT_POST_DEPLOY_CHECKLIST.md` |

**PR #4:** MERGED (https://github.com/fendifrost-dot/ai-video-tool/pull/4)  
**Current `main` tip:** `32ac025` (verify on GitHub if newer commits landed)

**Not committed to repo (local/untracked):** various `cursor_handoff_*.md`, `AVT_MEMORY_HANDOFF.md`, `AVT FACE IMAGES/` (HEIC test refs), `claude_code_handoff_avt_deploy_investigation.md` (exists locally from Cursor edits; may differ from remote).

---

## 5. Deploy status (as of end of session)

| Layer | Status | Notes |
|-------|--------|-------|
| **SQL migrations** | ✅ Done | 8 tables + RLS + `product-assets` bucket on `qoyxgnkvjukovkrvdaiq`; `products` count = 0; legacy `character_features` = 100 rows |
| **Git / merge** | ✅ Done | Catalog + VTON on `main` |
| **Lovable frontend publish** | ✅ Done (per Claude) | Code search finds `productResolve.ts`, `VITE_PRODUCT_CATALOG_ENABLED` in `src/lib/queries/products.ts` |
| **AVT edge functions** | ⚠️ **NOT verified redeployed** | Timestamps still ~5–6 days on `compose-look-proxy`, `upload-asset`, `fetch-reference-image`. Live runtime may still be pre-catalog despite merged source. |
| **New edge functions** | ⚠️ **Unconfirmed live** | `wardrobe-vton-proxy`, `fal-queue-poll-proxy` exist in GitHub repo; must confirm they appear in Lovable Edge Functions list and are deployed |
| **`VITE_PRODUCT_CATALOG_ENABLED`** | ⏸ Pending | Set in Lovable **Settings → Environment variables** (or Cloud env); requires republish. Catalog **nav** can work without new edge functions; **compose/upload** cannot. |
| **CC edge functions** | ✅ No redeploy needed | This release did not change `fendi-control-center` repo |

### Correct deploy order (Fendi-confirmed)

1. **Redeploy** AVT edge functions (5 listed below)  
2. **Publish** frontend from `main`  
3. **Set** `VITE_PRODUCT_CATALOG_ENABLED=true` + republish if needed  

*Note:* Frontend was published before functions were verified redeployed — **functions redeploy is still the critical blocker** for compose/product/VTON paths.

### Redeploy on AVT only (not CC)

1. `compose-look-proxy`  
2. `upload-asset`  
3. `fetch-reference-image`  
4. `wardrobe-vton-proxy` *(new)*  
5. `fal-queue-poll-proxy` *(new)*  

**Success criteria:** "Last updated" timestamps move to today; deployment count increments; new functions visible in list; deployed `compose-look-proxy` source contains `productResolve` / `garmentReference` imports.

---

## 6. Testing plan (`AVT_POST_DEPLOY_CHECKLIST.md`)

**After function redeploy is verified:**

| Phase | What | Flags |
|-------|------|-------|
| 3 | Legacy wardrobe compose smoke test | all off |
| 4 | Enable catalog flag | `VITE_PRODUCT_CATALOG_ENABLED=true` only |
| 5 | Design Studio → approve → Products; promote wardrobe | |
| 6 | Product library compose | `VITE_PRODUCT_LIBRARY_COMPOSE=true` — **gated; Fendi approval** |
| 7 | Garment bundle import + Apply garment (VTON) | **expensive; explicit Fendi go-ahead only** |
| 8 | Regression: identity inpaint, manufacturing zip, collections | |
| 9 | Wardrobe deprecation | `VITE_WARDROBE_DEPRECATED=true` — only after promote complete |

**SL jacket lesson (corrected):**  
- On-model ref hides mastic collar exterior (folded lining) — flat front product shot is better garment truth  
- **Additionally fixed in code:** multi-angle uploads were ignored for VTON (wrong index). Smart picker now prefers front-flat.

---

## 7. What is NOT done (gaps reviewers should flag)

| Gap | Severity | Notes |
|-----|----------|-------|
| Edge functions not redeployed on AVT | **Blocker** | Live proxies may lack catalog + VTON code |
| VTON quality unproven post-deploy | **High** | Prior SL jacket tests (pre-picker) all failed; no post-fix audit yet |
| Full video frame-by-frame VTON + SwitchX temporal | **High** | Architecture defined; UI/orchestration not wired in AVT |
| `VITE_PRODUCT_CATALOG_ENABLED` not set | Medium | Nav/catalog UI dormant until set |
| Product compose flag off | Medium | By design until regression |
| CC `compose-look` `lora_idm_vton` still uses Leffa VTON naming | Low | Still path name `lora_idm_vton`; direct IDM-VTON is via `wardrobe-vton-proxy` → `vton-frame` |
| HEIC upload support | Parked | Separate handoff exists |
| Local handoffs not all committed | Low | Docs drift possible |

---

## 8. Key files quick reference

### Migrations (applied to prod DB)
- `supabase/migrations/20260617120000_product_catalog.sql`
- `supabase/migrations/20260617130000_product_catalog_phases_5_6.sql`

### Catalog
- `src/lib/queries/products.ts` — flags + queries
- `src/components/design-studio/`, `src/pages/ProductsPage.tsx`, etc.
- `supabase/functions/compose-look-proxy/productResolve.ts`

### Wardrobe / VTON
- `src/lib/garment/vtonReference.ts`
- `supabase/functions/wardrobe-vton-proxy/index.ts`
- `supabase/functions/fal-queue-poll-proxy/index.ts`
- `src/lib/queries/wardrobeVton.ts`
- `src/components/wardrobe/GarmentBundleImport.tsx`

### CC (separate repo: `fendifrost-dot/fendi-control-center`)
- `supabase/functions/switchx-restyle/index.ts` — `vton-frame`, `segment-image`, SwitchX
- `supabase/functions/fal-queue-poll/index.ts`
- `supabase/functions/compose-look/index.ts` — Virtual Sample pipelines

---

## 9. Hard rules (carry to any reviewer)

1. All garment processing through AVT/CC — not Claude/ChatGPT/Grok sandboxes  
2. No AI-regeneration of garment truth assets  
3. Fix the tool; don't work around it  
4. Audit before declaring wins (reference vs output delta list)  
5. No expensive VTON runs without Fendi's explicit approval  
6. Do not redeploy CC for this AVT release  
7. Do not enable `VITE_WARDROBE_DEPRECATED` before wardrobe → products migration  

---

## 10. Reviewer checklist (for ChatGPT / Grok)

Please verify we did not miss anything:

- [ ] **Architecture:** Is VTON-first + SwitchX-temporal still coherent with what shipped?  
- [ ] **Deploy gap:** Is edge-function redeploy on AVT the only blocker before compose/VTON works?  
- [ ] **Flag order:** Redeploy → publish → `VITE_PRODUCT_CATALOG_ENABLED` — correct?  
- [ ] **CC vs AVT:** Should any CC function have been updated but wasn't?  
- [ ] **Secrets:** Does `wardrobe-vton-proxy` need `SWITCHX_PROXY_SECRET` on AVT, or is `COMPOSE_LOOK_PROXY_SECRET` fallback sufficient?  
- [ ] **Identity:** Did merge correctly preserve `identity_inpaint` over faceswap for "Apply my identity"?  
- [ ] **Product resolve:** Does `productResolve` prefer `front` asset role over `on_model_reference`?  
- [ ] **VTON picker:** Does `pickVtonGarmentPath` handle underscore filenames (`jacket_back.png`)?  
- [ ] **Video pipeline:** What's the minimum next step for MV frame-by-frame (FFmpeg extract exists? provider_jobs pattern?)  
- [ ] **Regression:** Any breaking change to legacy wardrobe compose when flags are off?  
- [ ] **RLS / migrations:** Any table or policy missing from the two SQL files vs what the frontend queries?  
- [ ] **Lovable env:** Is there a documented location for `VITE_*` vars beyond "Settings → Environment variables"?  

---

## 11. Immediate next actions (for Fendi)

1. **Redeploy 5 AVT edge functions for real** — verify timestamps change  
2. **Set `VITE_PRODUCT_CATALOG_ENABLED=true`** + republish  
3. **Run checklist Steps 3–5 + 8** (Claude or manual)  
4. **Explicit go-ahead** before Step 6 (product compose flag) or Step 7 (VTON garment swap test)  
5. **SL jacket re-test** with garment bundle (front flat as VTON primary) after functions live  

---

## 12. Session actors

| Actor | Role this session |
|-------|-------------------|
| **Cursor** | Implemented catalog (prior PR), VTON pipeline, smart ref picker, merge to `main`, checklist commit |
| **Claude** | Deploy investigation, DB verification, Lovable publish verification, flagged stale edge functions |
| **Fendi** | Green-lit deploy, corrected Lovable/GitHub connection, confirmed deploy order, merge decisions |

---

*Generated 2026-06-17. Update this file when edge functions redeploy, flag is set, or VTON audit completes.*
