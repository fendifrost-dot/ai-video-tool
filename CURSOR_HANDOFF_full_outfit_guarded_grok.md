# Claude handoff — Rebuild from what worked (2026-07-23)

**From:** Cursor  
**Repo:** `fendifrost-dot/ai-video-tool`  
**Product decision (Fendi):** Rewrite primary around live test winners.

## Canonical primary (LOCKED rewritten)

```
SAM-3 mask (SwitchX segment-image)
  → Grok outfit swap
  → lock clothing onto hero (out = hero·(1−α) + grok·α)
  → deterministic face restore
  → pose/body restore (NEXT — not shipped)
```

Flux / VTON / Guarded-Grok→IP-Adapter are **not** the outfit engine.

## What Claude / Cowork must do

1. Commit + push when Fendi asks (or if already asked).
2. **Lovable publish** frontend.
3. **Deploy new edge function** `sam3-segment-proxy` (same secrets as wardrobe-vton: `COMPOSE_LOOK_CC_URL`, `SWITCHX_PROXY_SECRET`).
4. Confirm CC `switchx-restyle` still supports `action: "segment-image"`.
5. Live test: Hero Frame → **Run SAM-3 → Grok full outfit** on real camo subject.
6. Grade: Grok outfit quality + hero face/pose/bg outside mask. If stance drifted badly inside α, note for pose-restore stage — do **not** put flux back as the swap.

## Verify

- Look recipe `pipeline_preference: "sam_grok_restore"`
- `sam3_mask_path` present
- Child looks: SAM-3 lock → optional face restore
- No flux `flux_submit` on the primary path
