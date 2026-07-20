# Claude handoff — Full-outfit Guarded Grok (executed 2026-07-20)

**From:** Grok via Cursor  
**Repo:** `fendifrost-dot/ai-video-tool` `main`  
**Status:** Code landed + committed. **Needs Lovable publish + `jacket-inpaint-proxy` redeploy.**

---

## What Fendi decided

1. **Canonical swap = entire outfit**, not jacket-only. Grok is best at full looks — stop fighting that.
2. **Face / hands / pose / background stay real pixels** (mask − face-guard → recomposite).
3. **Primary product path = Guarded Grok full outfit** (Grok appearance as IP-Adapter → masked full-outfit inpaint).
4. Do **not** implement post-swap body pose warp/realign (still rejected in LOCKED.md).

---

## What we executed (this commit)

### Product / prompts
- `supabase/functions/_shared/maskedGarmentPrompt.ts`
  - Default mask = `MASK_PROMPT_FULL_OUTFIT` (all clothing).
  - Upper/lower only via `metadata_json.mask_scope` or explicit `mask_prompt`.
  - Garment prompt scaffolding speaks “complete outfit,” not torso-only.

### Reliability (review P0s)
- `jacketInpaintPipeline.ts`
  - `WATCHDOG_STALE_MS`: **12 → 20 min** (must sit above `FLUX_POLL_MAX_MS` 15 min so slow flux isn’t reaped mid-poll).
  - `faceGuardDilate`: **10 → 20 px** (≥ `featherPx` 12 so feather can’t re-bleed into jaw/glasses).

### Hero matrix / UI
- `src/lib/heroFrame/types.ts` — matrix order:
  1. **Guarded Grok · Full outfit (primary)**
  2. Masked full outfit (no Grok ref)
  3. IDM-VTON full-look
  4. Raw Grok comparison
  5. CatVTON
- `HeroFrameStudioPage.tsx`
  - Primary button **3b** is now **Run Guarded Grok full outfit** (runs `GUARDED_GROK_PLAN` only, including face restore).
  - Jacket-only button removed as primary.
  - Wardrobe picker includes tops / outerwear / bottoms / footwear.

### Docs
- `docs/AVT_masked_garment_swap_LOCKED.md` — product correction + matrix update.

---

## What Claude must do next (Cowork agents — not Claude Code live browser)

1. **Lovable:** Publish frontend from latest `main` HEAD.
2. **Redeploy edge function:** `jacket-inpaint-proxy` (picks up shared prompt + pipeline changes).
3. **Live test (browser agent):**
   - Hero Frame → capture → pick wardrobe/look ref → **Run Guarded Grok full outfit**.
   - Grade: full outfit changed, face/pose locked, no invented background.
4. **Do not** reopen jacket-only as primary. **Do not** build pose-warp.
5. If flux-general hangs again: fail that candidate cleanly; don’t invent Cursor handoffs.

### Verify on completed look row
- `mask_prompt` ≈ full-outfit phrase (not “jacket and upper-body…” alone).
- `face_guard_dilate_px: 20`
- `ip_adapter_reference_source: "grok_render"` on Guarded Grok
- `pipeline_preference` / lane: `guarded_grok_masked_inpaint`

---

## Known remaining risk

Guarded Grok still requires **flux-general** (`ip_adapters`). That engine’s hang/502 is infra — watchdog is fixed so we don’t kill a live poll early, but a true Fal hang still burns up to ~15 min then fails loudly.
