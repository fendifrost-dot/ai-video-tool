# AVT Post-Deploy Checklist

**Project:** AI Video Tool (`aivideotool.lovable.app`)  
**Supabase ref:** `qoyxgnkvjukovkrvdaiq` (AVT only — do not redeploy CC for this release)  
**Branch:** `main` (post-merge `4affd6e` — catalog + wardrobe VTON)

Use this in the Lovable panel after merging to `main`. Complete steps in order.

---

## Prerequisites (should already be done)

- [ ] SQL migrations applied (8 catalog tables + `product-assets` bucket on `qoyxgnkvjukovkrvdaiq`)
- [ ] PR merged to `main` and pushed to GitHub
- [ ] Lovable connected to GitHub, builds from `main`

---

## Step 1 — Redeploy edge functions (AVT)

In Lovable → **AI Video Tool** → Edge Functions, redeploy:

- [ ] `compose-look-proxy`
- [ ] `upload-asset`
- [ ] `fetch-reference-image`
- [ ] `wardrobe-vton-proxy` *(new)*
- [ ] `fal-queue-poll-proxy` *(new)*

**CC (`wkzwcfmvnwolgrdpnygc`):** no redeploy needed for this release.

---

## Step 2 — Publish frontend

- [ ] Publish from latest `main` in Lovable
- [ ] Confirm live app commit tip updated past pre-merge `4a249bb`

**Env flags:** leave **off** for Phase 3 testing below.

---

## Step 3 — Smoke test (flags OFF)

Confirm the deploy did not break legacy paths before enabling catalog.

- [ ] Open https://aivideotool.lovable.app/
- [ ] Artist wardrobe tab loads; garment images display
- [ ] Upload or URL-import one wardrobe item
- [ ] Virtual Samples → compose a look from wardrobe (legacy path)
- [ ] Look completes (`complete` status, preview image loads)

**Stop here if anything fails.** Do not enable catalog flags until legacy compose works.

---

## Step 4 — Enable catalog flag

- [ ] Set `VITE_PRODUCT_CATALOG_ENABLED=true` in Lovable env
- [ ] Republish if Lovable requires env change + publish

Leave `VITE_PRODUCT_LIBRARY_COMPOSE` and `VITE_WARDROBE_DEPRECATED` **off** until later steps pass.

---

## Step 5 — Catalog UI

- [ ] Nav shows **Design Studio** and **Products**
- [ ] Design Studio → create new concept → save
- [ ] Approve concept → appears in **Products** list
- [ ] Open product detail; assets section loads
- [ ] Wardrobe tab → **Promote** one item → product link / package icon visible

---

## Step 6 — Product compose (optional flag)

- [ ] Set `VITE_PRODUCT_LIBRARY_COMPOSE=true`
- [ ] Republish if required
- [ ] Virtual Samples → pick product(s) from library → compose look
- [ ] Re-compose an old look that used wardrobe IDs only (backward compat)

---

## Step 7 — Wardrobe VTON (quality bar)

Import a full garment set (e.g. SL jacket: front flat, back, detail, on-model).

- [ ] Wardrobe → **Import garment set** → upload angles
- [ ] Confirm **VTON primary** badge on front-flat image
- [ ] Open a **completed** look → Add layer → pick garment
- [ ] **Apply garment (VTON)** → wait for child look → `complete`
- [ ] **Audit:** reference vs output side-by-side — collar, zipper, hem length, identity, background

Optional MV frame path:

- [ ] Project assets → reference still → pick garment → **Apply Garment (VTON)**
- [ ] Audit output same as above

**Do not call VTON a win without a written delta list (good + bad).**

---

## Step 8 — Regression spot-checks

- [ ] Look detail → **Apply my identity** (`identity_inpaint` path) still works
- [ ] `/products/$id/manufacturing` → zip export downloads (empty OK if no flats)
- [ ] Collections page loads; create collection + add product

---

## Step 9 — Deprecation flag (later only)

Enable only after wardrobe items are promoted to products:

- [ ] `VITE_WARDROBE_DEPRECATED=true`
- [ ] Wardrobe tab shows read-only / promote messaging; Design Studio is canonical

---

## Secrets sanity (if VTON fails)

AVT (`qoyxgnkvjukovkrvdaiq`):

- [ ] `COMPOSE_LOOK_CC_URL` → CC `compose-look`
- [ ] `COMPOSE_LOOK_PROXY_SECRET` and/or `SWITCHX_PROXY_SECRET`

CC (`wkzwcfmvnwolgrdpnygc`) — unchanged, but must be reachable:

- [ ] `FAL_API_KEY`, `SWITCHX_PROXY_SECRET` on `switchx-restyle` / `fal-queue-poll`

---

## Sign-off

| Phase | Pass? | Notes |
|-------|-------|-------|
| Redeploy + publish | | |
| Legacy compose (flags off) | | |
| Catalog (`VITE_PRODUCT_CATALOG_ENABLED`) | | |
| VTON garment swap | | |
| Regression | | |

**Tester:** _______________ **Date:** _______________
