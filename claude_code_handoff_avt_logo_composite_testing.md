# Claude Handoff — Logo Composite (Phase A+B) + Test Execution

**Date:** 2026-06-17  
**Author:** Cursor (implementation)  
**Audience:** Claude — **you are to execute the testing in this document** once Fendi confirms Lovable publish + redeploy are complete.  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool  
**Live app:** https://aivideotool.lovable.app/  
**Artist root (Fendi):** `/artists/8d4a4d22-41c0-43ab-ba99-92750f81e335`

**Read first:** `AVT_MEMORY_HANDOFF.md` (hard rules). This file supersedes older session notes for logo-composite work only.

---

## 0. Your assignment

Fendi is redeploying via Lovable now. **When they say deploy is done**, run the test plan in **Section 6** end-to-end in the live app. Do not redesign architecture. Do not process images in a Claude sandbox. All garment work goes through AVT.

Deliverables back to Fendi:

1. Checkbox results for each test step (pass / fail / blocked)
2. **Written audit** for every VTON run: reference vs output delta list (good + bad)
3. Screenshots or saved artifacts where noted
4. Child look `pipeline_used` and recipe fields confirming logo composite ran (or explain why not)

**Stop and report** if redeploy is not verified — do not burn VTON credits on stale edge code.

---

## 1. What Cursor built (commit `756331b` on `main`)

### Problem we solved

Prior SL mastic jacket VTON (IDM-VTON) **passed garment swap** (color, stripes, collar, identity) but **failed commercial quality on brand text** — "Saint Laurent" wordmark was mushy/illegible (diffusion limitation, not a ref-picker bug).

**Agreed architecture:**

```
VTON          → garment body / silhouette / color
Logo composite → deterministic brand typography (real pixels)
SwitchX       → video temporal (later, not this release)
```

### Phase A — Logo placement UX (frontend)

| Item | Path |
|------|------|
| Types + parsing | `src/lib/garment/logoPlacement.ts` |
| Bbox editor UI | `src/components/products/LogoPlacementEditor.tsx` |
| Wired into Design Studio / product detail | `src/components/design-studio/ProductConceptEditor.tsx` |

**Storage:** No SQL migration. Placement lives in existing JSON:

```json
// products.metadata_json.logo_placement
{
  "logo_asset_id": "uuid-or-null",
  "front_asset_id": "uuid",
  "source_bbox_norm": [x, y, w, h],
  "target_region": "chest_band",
  "placement_hint": "upper_left_chest"
}
```

**UI workflow:**

1. Open product in **Design Studio** or **Products → detail**
2. Ensure a **front** flat asset exists
3. Optionally upload transparent logo PNG as asset role **`detail`** or **`logo_placement_experiment`**
4. In **Logo placement** section: drag bbox on front flat around the wordmark
5. Pick logo PNG (or leave as "crop from front bbox")
6. **Save logo placement** → writes `metadata_json.logo_placement`

Wardrobe override (optional): same shape under `character_features.metadata_json.logo_placement`. Product link takes precedence when wardrobe has no override.

### Phase B — Post-VTON logo composite (edge, not SQL)

| Item | Path |
|------|------|
| Composite math + ImageScript encode | `supabase/functions/_shared/logoComposite.ts` |
| Chained after VTON in `finish()` | `supabase/functions/wardrobe-vton-proxy/index.ts` |

**Runtime flow** (inside `wardrobe-vton-proxy`, after Fal IDM-VTON completes):

1. Download raw VTON image from Fal
2. Upload raw to `look-composites` → `{userId}/{artistId}/{lookId}_vton_raw.{ext}`
3. Resolve logo config:
   - Wardrobe `metadata_json.logo_placement` **or**
   - Linked product via `product_wardrobe_links` → `products.metadata_json.logo_placement`
4. Load logo pixels:
   - **Preferred:** `logo_asset_id` → `product_assets` transparent PNG
   - **Fallback:** crop front flat at `source_bbox_norm`
5. Detect chest band on VTON output (navy stripe heuristic) → place logo upper-left (or center per hint)
6. Alpha-blend logo onto VTON (`bbox_affine_alpha_blend`)
7. Upload composited image as primary look output
8. Update look row:
   - `pipeline_used`: `idm_vton_frame+logo_composite` (or `idm_vton_frame` if no placement)
   - `composition_recipe_json.vton_raw_storage_path` — always set (audit trail)
   - `composition_recipe_json.logo_composite` — band/target/placement metadata when composite ran

**Important:** Phase B does **not** run in Lovable SQL editor. It runs in the redeployed **`wardrobe-vton-proxy`** edge function only.

**CC (`wkzwcfmvnwolgrdpnygc`):** No redeploy needed for this release.

---

## 2. Infrastructure (do not confuse)

| Ref | Project |
|-----|---------|
| `qoyxgnkvjukovkrvdaiq` | **AVT** — AI Video Tool |
| `wkzwcfmvnwolgrdpnygc` | **CC** — Fendi Control Center (`switchx-restyle` `vton-frame`, `fal-queue-poll`) |

- Lovable manages AVT deploys (publish + edge function redeploy). Supabase CLI returns 403 for AVT — expected.
- Cursor pushed code to GitHub `main`; Lovable must **publish** + **redeploy** for live behavior.

### Minimum redeploy for this release

- [ ] Lovable **publish** from `main` (commit ≥ `756331b`) — Phase A UI
- [ ] Lovable **redeploy** `wardrobe-vton-proxy` — Phase B composite

Other functions (`fal-queue-poll-proxy`, etc.) should already be live from prior session; redeploy all 5 if unsure.

### Env flags (likely already set from prior session)

| Flag | Expected for these tests |
|------|--------------------------|
| `VITE_PRODUCT_CATALOG_ENABLED` | `true` (Design Studio + Products nav) |
| `VITE_PRODUCT_LIBRARY_COMPOSE` | off unless Fendi says otherwise |
| `VITE_WARDROBE_DEPRECATED` | off |

---

## 3. Prior VTON baseline (pre–logo composite)

Claude ran a live SL mastic jacket VTON test before Phase A+B. Use as regression baseline.

**Verdict then:** Garment swap works; **brand text was the commercial blocker.**

| Check | Result |
|-------|--------|
| Mastic color, navy stripes | ✅ |
| Zip, collar geometry | ✅ |
| Identity preserved | ✅ |
| Background preserved | ✅ |
| Smart ref picker (front flat, not lining) | ✅ |
| "Saint Laurent" text legible | ❌ mushy |
| Hem partly occluded by hand | ⚠️ |

**Cost:** ~$0.09 per `idm_vton_frame` run via Fal IDM-VTON.

**Phase C goal:** Same garment test **with** logo placement configured → `pipeline_used` = `idm_vton_frame+logo_composite` and **legible wordmark at 1080p chest crop**.

---

## 4. Hard rules (non-negotiable)

1. **All processing through AVT/CC** — no Claude-side segmentation, compositing, or regeneration
2. **VTON-first** for wardrobe; SwitchX = temporal/background only
3. **Kling v2v** disqualified (identity destruction)
4. **Audit before declaring wins** — reference vs output, good + bad deltas
5. **No code edits in Lovable chat** — redeploy/publish/secrets only
6. **Do not redeploy CC** for this release
7. VTON costs money — if a step fails prerequisites, stop rather than retry-blind

---

## 5. Pre-test verification (do this first)

Before any VTON spend, confirm deploy is real:

- [ ] Live app reflects commit `756331b` or later (Lovable timeline / publish time)
- [ ] `wardrobe-vton-proxy` shows recent redeploy timestamp in Lovable Edge Functions
- [ ] Open a product in Design Studio → **Logo placement** section is visible (Phase A UI)
- [ ] Catalog nav works (`Design Studio`, `Products`)

If Logo placement UI is missing → publish not done.  
If VTON works but `pipeline_used` never shows `+logo_composite` after placement saved → `wardrobe-vton-proxy` not redeployed.

---

## 6. Test plan — execute in order

### Test 1 — Logo placement UI (no VTON cost)

**Goal:** Confirm Phase A saves placement correctly.

1. Go to **Products** or **Design Studio**
2. Open SL mastic jacket product (or create/link one — see Test 2 if missing)
3. Confirm **front** flat asset is present (mastic + navy stripes product shot)
4. Upload transparent **detail** logo PNG if available (optional but preferred)
5. Drag bbox on wordmark region on front flat
6. **Save logo placement**
7. Reload page → bbox and settings persist

**Pass:** `logo_placement` visible in product metadata (UI persistence).  
**Fail:** Section missing, save errors, bbox not persisted.

---

### Test 2 — Wardrobe ↔ product link

**Goal:** Composite resolver can find placement via `product_wardrobe_links`.

1. **Wardrobe** tab → SL mastic jacket item
2. If not promoted: **Promote to product** (or confirm existing link / package icon)
3. Ensure promoted product has logo placement from Test 1
4. Confirm wardrobe item has **front flat** as VTON primary (bundle import or angle labels)

**Pass:** Wardrobe item linked to product with saved `logo_placement`.  
**Fail:** No link; VTON would skip composite.

---

### Test 3 — VTON without logo placement (regression, ~$0.09)

**Goal:** Baseline still works; composite gracefully skipped.

Use a wardrobe item **without** logo placement (or temporarily test before saving placement).

1. Open a **completed** Fendi look (canvas with identity)
2. **Add layer** → pick garment without logo placement
3. **Apply garment (VTON)** → wait for child look `complete`
4. Inspect child look:
   - `pipeline_used` = `idm_vton_frame` (no `+logo_composite`)
   - Recipe has `vton_raw_storage_path`
   - No `logo_composite` block (or null)

**Pass:** VTON completes; no regression vs prior behavior.  
**Fail:** Submit errors, poll timeout, identity/garment regression.

---

### Test 4 — VTON + logo composite (primary test, ~$0.09)

**Goal:** Phase B fixes brand text while preserving prior garment wins.

**Prerequisites:** Tests 1–2 pass; logo placement saved on linked product.

1. Same completed Fendi look canvas as prior SL test (MODEST varsity source frame or equivalent)
2. **Apply garment (VTON)** on SL mastic wardrobe item (linked product with placement)
3. Wait for child look `complete`
4. **Verify pipeline metadata** (look detail / DB if accessible):
   - `pipeline_used` = **`idm_vton_frame+logo_composite`**
   - `composition_recipe_json.vton_raw_storage_path` present
   - `composition_recipe_json.logo_composite` with `method`, `band`, `target`, `logo_source`

5. **Visual audit** — side-by-side vs garment front flat reference:

| Check | Pass criteria |
|-------|---------------|
| Mastic color / navy stripes | Match reference |
| Collar, zip, hem | No major regression vs Test 3 baseline |
| Fendi identity | Preserved |
| Background | Preserved |
| **Saint Laurent wordmark** | **Legible at 1080p** — sharp letterforms, correct placement on chest band |
| Logo position | On navy chest band, upper-left (unless center hint set) |
| Compositing seams | No obvious rectangular halo or color fringe |

6. **Chest crop proof:** Export or screenshot ~400×200 crop of chest/logo region at full resolution. Attach to report.

**Pass:** `+logo_composite` pipeline + legible wordmark + no major garment regression.  
**Partial pass:** Composite ran but placement off — document `logo_composite.target` and suggest `target_bbox_norm` manual override.  
**Fail:** No composite (wrong pipeline tag), illegible text, or garment/identity regression.

---

### Test 5 — Raw VTON audit trail

**Goal:** Raw diffusion output preserved for comparison.

1. From Test 4 child look recipe, locate `vton_raw_storage_path`
2. Compare raw vs displayed output:
   - Raw should match pre-composite VTON (mushy text OK)
   - Display should show composited logo

**Pass:** Two distinct assets; composite clearly improved text vs raw.  
**Fail:** Only one file; raw path missing.

---

### Test 6 — Regression spot-checks (no VTON unless needed)

- [ ] Legacy wardrobe compose still works (flags as configured)
- [ ] **Apply my identity** on look detail (`identity_inpaint`, not faceswap)
- [ ] Design Studio asset upload still works
- [ ] Collections / manufacturing pages load

---

## 7. How to report results

Use this template:

```markdown
## AVT Logo Composite Test Report — [date]

**Deploy verified:** yes/no (commit hash, redeploy time)
**Tester:** Claude

### Test 1 — Logo placement UI
- Pass/Fail:
- Notes:

### Test 2 — Wardrobe ↔ product link
- Pass/Fail:
- Product ID:
- Wardrobe feature ID:

### Test 3 — VTON regression (no placement)
- Pass/Fail:
- Child look ID:
- pipeline_used:

### Test 4 — VTON + logo composite (PRIMARY)
- Pass/Fail/Partial:
- Child look ID:
- pipeline_used:
- logo_source: asset | front_crop
- Delta list:
  - Good: ...
  - Bad: ...
- Chest crop: [attach]

### Test 5 — Raw audit trail
- Pass/Fail:
- vton_raw_storage_path:

### Test 6 — Regression
- ...

### Verdict
[One paragraph: ship / fix placement / fix composite / block on X]

### Recommended next step (if any)
[e.g. tune chest band detection, add manual target_bbox_norm, Phase D keyframe scorer]
```

**Do not call Test 4 a win without the delta list and chest crop.**

---

## 8. Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| No Logo placement UI | Frontend not published | Fendi publish from `main` |
| VTON works, never `+logo_composite` | `wardrobe-vton-proxy` stale | Redeploy function in Lovable |
| Composite skipped silently | No placement / no product link / asset download fail | Check `product_wardrobe_links`, placement JSON, `product_assets` paths |
| Logo wrong position | Chest band heuristic miss | Try `placement_hint: center_chest` or manual `target_bbox_norm` (future UI; can set via DB) |
| Logo blurry but pipeline correct | Source logo PNG low-res | Upload higher-res transparent `detail` asset |
| `vton_submit_failed` | CC secrets / network | Check AVT `COMPOSE_LOOK_CC_URL`, `SWITCHX_PROXY_SECRET`; do not redeploy CC unless secrets wrong |
| Garment wrong color/ref | Wrong VTON ref | Confirm front-flat badge; see `src/lib/garment/vtonReference.ts` |

---

## 9. Key files (for debugging, not editing)

| Area | Path |
|------|------|
| Logo placement types | `src/lib/garment/logoPlacement.ts` |
| Logo placement UI | `src/components/products/LogoPlacementEditor.tsx` |
| Composite (edge) | `supabase/functions/_shared/logoComposite.ts` |
| VTON + composite chain | `supabase/functions/wardrobe-vton-proxy/index.ts` |
| VTON client | `src/lib/queries/wardrobeVton.ts` |
| Garment ref picker | `src/lib/garment/vtonReference.ts` |
| Unit tests | `src/lib/garment/logoPlacement.test.ts`, `logoComposite.test.ts` (230 total passing at commit) |

---

## 10. Out of scope for this handoff

- Video batch / SwitchX temporal (Phase D/E)
- `VITE_VTON_ENABLED` kill switch
- cat-vton A/B
- Claude-side image processing of any kind
- CC code changes

---

## 11. Session actors

| Actor | Role |
|-------|------|
| **Cursor** | Implemented Phase A+B, committed `756331b`, pushed `main` |
| **Fendi** | Lovable publish + redeploy (in progress) |
| **Claude** | **Execute Section 6 tests** when Fendi confirms deploy done |

---

*Generated 2026-06-17 by Cursor. Update when Test 4 audit completes.*
