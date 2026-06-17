# Claude Handoff — AVT Product Catalog + Deploy (as of 2026-06-17)

**Audience:** Fresh Claude session picking up Fendi's AVT work.  
**Read first:** `AVT_MEMORY_HANDOFF.md` (hard rules + VTON-first wardrobe architecture). This file adds product-catalog context and deploy state on top of that doc.  
**Do not conflate with FFH** (Fan Fuel Hub / playlist pitches) — separate system entirely.

---

## Hard rules (carry over — do not violate)

1. **All processing runs through AVT or CC edge functions.** Claude does not segment, composite, mask, crop, or AI-regenerate garment images in a sandbox.
2. **No AI-regeneration of garment truth assets.** VTON references = real product pixels only. Seedream-edit / Nano Banana off-limits for garment-truth (OK for scene composites in SwitchX background work).
3. **Fix the tool, don't work around it.** If output is wrong, improve AVT/CC code or prompts — not manual Claude-side processing.
4. **Audit before declaring a win.** Reference vs output side-by-side, explicit delta list.
5. **Wait for Fendi's explicit direction** before kicking off VTON runs, segmentation, or pipeline experiments.

---

## What just landed (Cursor session, 2026-06-17)

### Open PR

| Item | Value |
|------|-------|
| **PR** | https://github.com/fendifrost-dot/ai-video-tool/pull/4 |
| **Branch** | `feat/product-catalog-phases-1-6` |
| **Commit** | `4b093a5` — product catalog Phases 1–6 + safe rollout defaults |
| **Tests** | 218/218 passing at commit time |
| **Status** | **Code merged in branch; NOT deployed to Lovable prod yet** |

### What the PR implements

Approved plan: `cursor_handoff_avt_product_catalog_migration.md`

| Phase | What shipped in code |
|-------|---------------------|
| **1** | `products`, `product_variants`, `product_assets`, `product_wardrobe_links` schema; Design Studio + Product Library UI; `product-assets` bucket |
| **2** | "Promote to Product" on wardrobe items (single + bulk); `promoteWardrobe.ts` |
| **3** | Virtual Samples rename (UI); `ProductGarmentPicker`; `productPicks[]` in compose; `productResolve.ts` in proxy |
| **4** | Wardrobe deprecation behind flag; read-only wardrobe tab when deprecated |
| **5** | `tech_packs`, `manufacturing_packages`; `/products/$id/manufacturing` zip export |
| **6** | `collections`, `collection_products`; `FitProfileEditor` on products |

### Bugs fixed in this session (in PR)

1. **Feature flags defaulted ON** — blocked wardrobe uploads and forced product compose before schema existed. **Now all default OFF** (opt-in via env).
2. **`compose-look-proxy` bucket signing** — product assets in `product-assets` were signed from `wardrobe-refs`. Fixed via `bucketForPath()` per feature.

---

## Deploy state — CRITICAL (not done yet)

### Supabase projects (three different refs — do not mix them up)

| Ref | Name | Role | CLI access |
|-----|------|------|------------|
| `qoyxgnkvjukovkrvdaiq` | Lovable dev (`.env` local) | Frontend points here | **403 — no CLI deploy** |
| `wkzwcfmvnwolgrdpnygc` | Lovable prod (per `AVT_MEMORY_HANDOFF.md`) | Live AVT at `aivideotool.lovable.app` | Lovable panel only |
| `hagfjfzsjqachllkgzcw` | Standalone `AI_Video_Tool` | User's Supabase account | **Paused** — must unpause in dashboard |

**Confirmed on `qoyxgnkvjukovkrvdaiq`:** `products` table does **not** exist yet (`PGRST205`).

### Manual deploy steps (Fendi or Lovable panel — Claude cannot do this via CLI)

1. **Merge PR #4** (or cherry-pick to whatever Lovable deploys from).

2. **Apply SQL** in Lovable → Database → SQL editor (run in order):
   - `supabase/migrations/20260617120000_product_catalog.sql`
   - `supabase/migrations/20260617130000_product_catalog_phases_5_6.sql`

3. **Redeploy edge functions** in Lovable Cloud:
   - `compose-look-proxy` (includes `productResolve.ts`)
   - `upload-asset` (now allows `product-assets` bucket)
   - `fetch-reference-image` (now supports `targetType: "product"`)

4. **Enable frontend env flags progressively** (Lovable / Cloudflare):
   ```
   VITE_PRODUCT_CATALOG_ENABLED=true          # Step 1: Design Studio + Products nav
   VITE_PRODUCT_LIBRARY_COMPOSE=true          # Step 2: after promote + Pair 2 regression
   VITE_WARDROBE_DEPRECATED=true              # Step 3: only after wardrobe → products done
   ```
   **With no flags set, legacy wardrobe compose works unchanged.**

5. **Standalone fallback:** `scripts/apply-product-catalog-migrations.sh` — use when `hagfjfzsjqachllkgzcw` is unpaused.

---

## Architecture map

### Creative OS flow (product catalog)

```
Design Studio (concept) → [Approve] → Product Library (MOD-001…)
       ↓                                        ↓
Virtual Sample Studio (artist_looks)    Manufacturing Studio (tech flats → zip)
       ↓
Avatar → Photo → Video → Campaign
```

- **One product = one atomic garment** (jacket OR jeans, not full outfits).
- **Outfits** = multiple `product_picks` on one `artist_looks` row.
- **CC `compose-look` is NOT rewritten.** AVT `compose-look-proxy` translates products → existing `wardrobeItems[]` shape.

### Virtual Sample compose (two paths)

```
LEGACY (default, flags off):
  WardrobeTab → wardrobe_feature_ids[] → compose-look-proxy → CC compose-look

PRODUCT (VITE_PRODUCT_LIBRARY_COMPOSE=true):
  ProductGarmentPicker → productPicks[] → productResolve.ts → same CC payload shape
```

Key files:
- UI: `src/components/looks/LookComposer.tsx`, `ProductGarmentPicker.tsx`
- Proxy: `supabase/functions/compose-look-proxy/index.ts`, `productResolve.ts`
- Flags: `src/lib/queries/products.ts` → `isProductCatalogEnabled()`, `isProductLibraryComposeEnabled()`, `isWardrobeDeprecated()`

### Video wardrobe pipeline (VTON-first — locked)

```
Source video → FFmpeg frames → VTON per frame (idm-vton / cat-vton) → anchor frames
            → SwitchX temporal (background lock) → FFmpeg reassembly
```

| Layer | Where | Notes |
|-------|-------|-------|
| Frame VTON | CC `switchx-restyle` action `vton-frame` | `fal-ai/idm-vton` or `cat-vton`; polled via `fal-queue-poll` |
| Segment (pixel-preserving) | CC `switchx-restyle` action `segment-image` | `fal-ai/sam-3/image`; single-word prompts work best (`"jacket"` not `"jacket, tie"`) |
| Virtual Sample VTON | AVT → CC `compose-look` pipeline `lora_idm_vton` | Per-garment overlay on still composites |
| SwitchX wardrobe/custom | **No longer wardrobe engine** | Background + temporal only |

**No AVT `switchx-restyle-proxy` exists in this repo.** Video VTON is CC-side. Do not propose Kling v2v for wardrobe (identity-destroying — F grade per Fendi).

### SL jacket lesson (2026-06-17)

Five IDM-VTON outputs against Tokyo alley frame + Saint Laurent mastic zip jacket — **none approved**. On-model SL ref shows navy collar lining (folded back), not mastic exterior. VTON can only transfer what's visible. **Fix:** feed flat-lay or zipped front product shot via Product Library `front` asset — through AVT, not Claude manual file work.

---

## Where things live

| System | URL / path |
|--------|------------|
| **AVT (prod)** | https://aivideotool.lovable.app/ |
| **Artist root** | `/artists/8d4a4d22-41c0-43ab-ba99-92750f81e335` |
| **Repo** | https://github.com/fendifrost-dot/ai-video-tool |
| **CC repo** | https://github.com/fendifrost-dot/fendi-control-center (`switchx-restyle` at `supabase/functions/switchx-restyle/index.ts`) |
| **Supabase prod** | `wkzwcfmvnwolgrdpnygc.supabase.co` (Lovable-managed — no standalone supabase.com account) |
| **FFH admin** | `fan-growth-pilot.lovable.app/admin` — NOT AVT |

### New routes (after deploy + `VITE_PRODUCT_CATALOG_ENABLED=true`)

| Route | Purpose |
|-------|---------|
| `/design-studio` | Concepts in progress |
| `/design-studio/new` | New MOD concept |
| `/design-studio/$productId` | Edit + approve concept |
| `/products` | Approved SKU catalog |
| `/products/$id` | Product detail + assets |
| `/products/$id/manufacturing` | Tech flats + zip export |
| `/collections` | Seasonal groupings |

Nav: **Virtual Samples** (was "Looks") at `/looks` and per-artist looks routes.

---

## Post-deploy test checklist

Run in order after SQL + edge function redeploy:

- [ ] `products` table exists (no `PGRST205` on REST query)
- [ ] Legacy wardrobe compose works with **no env flags** (upload garment → compose virtual sample)
- [ ] `VITE_PRODUCT_CATALOG_ENABLED=true` → Design Studio visible; create concept → approve → appears in Products
- [ ] Promote wardrobe item → `product_wardrobe_links` row + Package icon on card
- [ ] `VITE_PRODUCT_LIBRARY_COMPOSE=true` → compose from MOD SKUs on avatar
- [ ] Re-compose legacy look (wardrobe IDs only) — backward compat
- [ ] Pair 2 identity faceswap after product-based sample
- [ ] Manufacturing zip download from approved product
- [ ] Collection create + add products

---

## What NOT to do on session start

- Do not re-run SL jacket VTON tests without Fendi's go-ahead.
- Do not segment/composite/regenerate garment refs in Claude sandbox.
- Do not enable `VITE_WARDROBE_DEPRECATED=true` before wardrobe items are promoted.
- Do not pitch SwitchX custom-mode as wardrobe engine again.
- Do not pitch Kling v2v for wardrobe.
- Do not touch the "garment generator" in Wardrobe — **parked** per `AVT_MEMORY_HANDOFF.md`.

---

## Suggested next actions (for Fendi to choose)

1. **Deploy PR #4** — SQL migrations + edge functions + `VITE_PRODUCT_CATALOG_ENABLED=true`
2. **Promote existing wardrobe** to MOD SKUs (bulk promote on Wardrobe tab)
3. **Enable product compose** — `VITE_PRODUCT_LIBRARY_COMPOSE=true` after regression
4. **Resume video VTON** — frame extraction → CC `vton-frame` on test keyframes (through AVT surface, not Claude sandbox)
5. **Wire AVT proxy for video VTON** if no UI surface exists yet (check before building)

---

## Key files quick reference

| Area | Path |
|------|------|
| Migration SQL | `supabase/migrations/20260617120000_product_catalog.sql`, `20260617130000_product_catalog_phases_5_6.sql` |
| Deploy script | `scripts/apply-product-catalog-migrations.sh` |
| Feature flags | `src/lib/queries/products.ts` |
| Flag tests | `src/lib/queries/products.test.ts` |
| Compose proxy | `supabase/functions/compose-look-proxy/index.ts`, `productResolve.ts` |
| Promote bridge | `src/lib/queries/promoteWardrobe.ts` |
| Architecture spec | `cursor_handoff_avt_product_catalog_migration.md` |
| VTON / wardrobe rules | `AVT_MEMORY_HANDOFF.md` |
| CC switchx | `fendi-control-center/supabase/functions/switchx-restyle/index.ts` |

---

## Communication preferences (Fendi)

- Distill to what's actionable. Mobile-first.
- Audit before declaring wins. Delta lists required.
- Never recommend pivoting away from locked architecture unless Fendi says otherwise.
- Don't worry about time spent — apply resources to making the tool work properly.
