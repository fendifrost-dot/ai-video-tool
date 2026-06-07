# Brief for Claude — Style References + Style LoRA v2 shipped

## Context

`lora_segmented_inpaint` still fails at the **LoRA layer**, not the API. Stage-1 FLUX-LoRA outputs are waist-up portraits even with taller canvas (`832×1216`) and strict full-body prompt language — the current face LoRA was trained on chest-up refs, so it ignores framing instructions.

**Architectural fix:** Train a **new personal style LoRA** on full-body / three-quarter photos in varied outfits. That shifts Stage-1 bias from “Fendi’s face, waist-up” to “Fendi in clothes, full body,” so SAM-3 has a lower body to mask and regional inpaint can run.

Handoff source: `cursor_handoff_style_lora_v2.md` in artistgrowthhub-repo.

**Related (already shipped, separate thread):** Stage-1 framing + SAM-3 skip-on-`no_mask` on CC — `brief_for_claude_stage1_framing_done.md` (`e9dbf62`, `97c6421`).

---

## What Cursor shipped (pushed to `main`)

### ai-video-tool (AVT)

**Repo:** https://github.com/fendifrost-dot/ai-video-tool  
**Branch:** `main` (`8dd16cf` → `ac96089`)

| SHA | Phase | What |
|-----|-------|------|
| `60ceac5` | 1 | Style References tab on artist detail — bulk upload, HEIC via `normalizeImageForUpload`, multi-select grid, progress UI, `style_reference` rows + `style-references` bucket migration |
| `ac96089` | 2 | `train-style-lora-proxy` + `train-style-lora-callback` — zip photos, call CC, persist v2 LoRA on success |

**Key paths:**

- UI: `src/components/styleReferences/StyleReferencesTab.tsx` (tab on `ArtistDetail.tsx`, above Wardrobe)
- Queries: `src/lib/queries/styleReferences.ts`
- Migration: `supabase/migrations/20260524120000_style_references.sql`
- Edge: `supabase/functions/train-style-lora-proxy/`, `train-style-lora-callback/`
- `supabase/config.toml`: `verify_jwt = false` on both new functions

**Training behavior:**

- Trigger word: **`FENDIFITS`** (new v2; old face LoRA kept as `lora_legacy_face`)
- On success: `identity_profile_json.lora` ← new URL; previous `lora` → `lora_legacy_face`
- Min photos to train: **4** (UI recommends 25–50 full-body / ¾ shots)
- Proxy builds zip from public `style-references` URLs, uploads zip, POSTs to CC async

### fendi-control-center (CC)

**Repo:** https://github.com/fendifrost-dot/fendi-control-center  
**Branch:** `main` (includes `97c6421` + `9bc1916`)

| SHA | What |
|-----|-----|
| `9bc1916` | `supabase/functions/train-style-lora/index.ts` — Fal `flux-lora-fast-training`, `is_style: true`, async callback to AVT |

**Key path:** `supabase/functions/train-style-lora/index.ts`  
**Config:** `supabase/config.toml` — `[functions.train-style-lora] verify_jwt = false`

**Do not touch** `compose-look` in this thread unless a separate handoff says so.

---

## Architecture (end-to-end)

```
AVT UI "Train Style LoRA"
  → train-style-lora-proxy (zip refs, set style_lora_training=pending)
  → CC train-style-lora (Fal flux-lora-fast-training, ~2–3 min)
  → train-style-lora-callback (X-Proxy-Secret)
  → artists.identity_profile_json.lora updated (+ lora_legacy_face)
```

Same callback secret pattern as compose-look: `COMPOSE_LOOK_PROXY_SECRET` / `X-Proxy-Secret`.

---

## Your action items

### 1. Lovable — schema only (AVT)

**Project:** https://lovable.dev/projects/bd21b544-c7b8-4780-bdde-391ac9d4bfa8

Terse ask (abort if Lovable proposes code changes):

```
Schema-only ask: please add 'style_reference' to the allowed values of the feature_type CHECK constraint on the character_features table. Also please create a public storage bucket named 'style-references' with anon read/write access. Do not change any code or any other column. Just update the CHECK constraint and create the bucket.
```

Migration file is already in repo (`20260524120000_style_references.sql`) — Lovable ask is the live-DB safety net.

### 2. Lovable — deploy

1. **AVT:** Redeploy frontend + edge functions from latest `main` (`ac96089`).
2. **CC:** Redeploy `train-style-lora` from latest `main` (`9bc1916`).  
   (`compose-look` redeploy only if not already on `97c6421+`.)

### 3. Secrets / env

**AVT Supabase** (project `bd21b544…` / AVT instance):

| Secret | Value |
|--------|--------|
| `TRAIN_STYLE_LORA_CC_URL` | `https://wkzwcfmvnwolgrdpnygc.supabase.co/functions/v1/train-style-lora` |

Existing `COMPOSE_LOOK_PROXY_SECRET` must match CC (proxy already uses it for callback auth).

**CC Supabase:** `FAL_API_KEY`, `COMPOSE_LOOK_PROXY_SECRET` (unchanged pattern).

### 4. Verify live UI

On artist detail (Fendi `8d4a4d22-…`):

- New **Style References** section appears (above Wardrobe).
- Upload from phone: multi-select, progress bar, grid fills.
- Helper text warns: full-body / varied outfits — not chest-up selfies.

### 5. Fendi workflow (human gate)

1. Upload **25–50** full-body or ¾ photos (varied outfits, poses, lighting).
2. Tap **Train Style LoRA from all** (or select subset, min 4).
3. Wait ~2–3 min; UI shows pending → complete (or failed + error).
4. Confirm `identity_profile_json.lora` has new URL + trigger `FENDIFITS`; old face LoRA under `lora_legacy_face`.

### 6. Smoke test after training (compose thread)

Re-run the failing case on AVT:

- Pipeline: `lora_segmented_inpaint`
- Wardrobe: YSL jacket + confetti shirt + slim jeans + Cazals
- Description: “Photorealistic editorial portrait”

**Report honestly:**

| Check | Pass criteria |
|-------|----------------|
| Stage 1 image | Full-body in `generation_metadata.stages[0].image_url` — feet/legs visible, not waist-up |
| SAM-3 | Jeans region gets a mask (not `sam3_no_mask` / not only `segmentation_skipped_*`) |
| Chain | FLUX-fill stages run for bottoms → top → outerwear; jewelry polish if applicable |
| Quality | Layering correct; identity/glasses intact |

If Stage 1 is **still** waist-up after v2 LoRA → training set may still be too face-heavy; ask Fendi for more full-body refs before blaming compose-look code.

If Stage 1 is full-body but jeans still skip → segmentation/inpaint quality thread (not LoRA bias).

---

## Constraints (do not violate)

- **Lovable:** deploy / schema / redeploy only — never code or data mutation asks.
- **RLS:** open anon read/write on AVT — keep consistent.
- **HEIC:** all uploads through `normalizeImageForUpload`.
- **Rollback:** never delete `lora_legacy_face`; v2 overwrites `lora` only on training success.
- **Out of scope:** compose-look refactors, Instagram API, wardrobe/accessories/locations refactors.

---

## Separate tracks (do not mix)

| Track | Status |
|-------|--------|
| RUNWAY MUSIC email | Done — `media.fendifrost.com/runway-music/banner.jpg`, Gmail confirmed |
| Stage-1 framing + SAM-3 skip | Done on CC — `brief_for_claude_stage1_framing_done.md` |
| Segmented inpaint diagnosis | `DIAGNOSIS_segmented_inpaint.md` — root cause = LoRA waist-up bias |

---

## If something breaks

| Symptom | Likely cause |
|---------|----------------|
| Tab missing / upload 400 on insert | Schema CHECK or bucket not applied — run Lovable schema ask |
| Train button 500 `server_misconfigured` | Missing `TRAIN_STYLE_LORA_CC_URL` on AVT |
| Train starts then fails immediately | CC not deployed or proxy secret mismatch |
| Training pending forever | Fal poll/callback failure — check CC logs + AVT callback URL |
| v2 LoRA trained but still waist-up | Training photos still mostly chest-up — user content issue |

Ask before shipping half-resolved schema or “overwrite vs preserve LoRA” choices.
