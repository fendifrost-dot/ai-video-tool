# LOCKED garment-swap architecture — SAM-3 mask → Grok swap → restore

**Unlocked / rewritten 2026-07-23** from live test evidence (Fendi).

Supersedes the Guarded-Grok→flux-IP-Adapter primary path. Flux masked inpaint
and VTON remain available as **comparison / experimental** lanes only — they
never produced a successful full-outfit swap in live tests.

## What actually worked

| Job | Tool | Verdict |
|-----|------|---------|
| **Masking** | SwitchX CC `segment-image` → Fal **SAM-3** | Worked |
| **Outfit swap** | **Grok** `/v1/images/edits` | Only engine that swapped the look correctly |
| Wardrobe generation via SwitchX Beeble / VTON / flux-as-painter | — | Failed outfit tests |

Grok’s weakness: it can alter face and body position (no mask / pose API). That
is fixed **after** the swap — not by demoting Grok behind flux.

## Canonical primary pipeline

```
Hero frame
  → [1] SAM-3 mask (clothing region) via CC switchx-restyle action segment-image
  → [2] Grok full-outfit edit (source of truth for clothing appearance)
  → [3] Masked lock: out = hero·(1−α) + grok·α   (α = SAM-3 clothing on hero)
  → [4] Deterministic face restore (real hero head pixels)
  → [5+] Pose / body restore when Grok drifted stance  (NEXT — 1–N tools)
```

### Why this order

1. **Mask first** with the tool that worked (SAM-3), not evf-sam.
2. **Grok does the swap** — never flux, never VTON as the outfit engine.
3. **Masked lock** keeps face / pose / background as **hero bytes** outside α.
   Clothing appearance comes from Grok at hero clothing coordinates.
4. **Face restore** seats his exact head when Grok still touched the face.
5. **Pose / body restore** is an explicit follow-on stage when α lands on the
   wrong body parts because Grok re-posed. Do not reintroduce flux as the swap
   to avoid that problem.

### What is rejected as primary

| Approach | Status |
|----------|--------|
| Grok as IP-Adapter into flux-general inpaint (“Guarded Grok”) | **Demoted** — put the swap on a tool that never won outfit tests |
| SwitchX Beeble `mode:wardrobe` as outfit engine | **Rejected** — masking only |
| IDM-VTON / CatVTON as primary | **Fallback / comparison only** |
| Raw Grok with no mask lock / no restore | Comparison only |

## Roles (locked)

- **SAM-3 / SwitchX `segment-image`:** mask only. Never wardrobe generation.
- **Grok:** outfit appearance only (the swap).
- **Masked arithmetic + face restore (+ future pose tools):** identity / geometry.

## Product UI

Hero Frame primary button runs lane `sam_grok_restore`:
**“SAM-3 → Grok full outfit (primary)”**.

Matrix order:

1. **SAM-3 → Grok → lock → face restore** (primary)
2. Raw Grok + face restore (comparison — no SAM-3 lock)
3. Masked flux inpaint (experimental)
4. IDM-VTON / CatVTON (fallback)

## Pose restore (next build, not blocked)

When Grok moves arms/stance, step [3] can pull wrong Grok pixels into the hero
clothing silhouette. Fix with post-Grok tools (warp / pose transfer / multi-pass
head+torso restore) — **after** a good Grok outfit exists. Prefer stacking
restore tools over replacing Grok.

## Secrets / transport

- Grok: `XAI_API_KEY` on AVT (`grok-image-garment-proxy`)
- SAM-3: AVT → CC `COMPOSE_LOOK_CC_URL` + `SWITCHX_PROXY_SECRET` → `segment-image`
- No Fal key on AVT

## Verify on a completed primary look

- `pipeline_preference: "sam_grok_restore"`
- Recipe has `sam3_mask_path`, `grok_look_id`, `outfit_lock: true`
- `ip_adapter_reference_source` / flux steps **absent**
- Face child may exist via `face_restore`
- `pose_restore_status: "pending"` until pose stage ships
