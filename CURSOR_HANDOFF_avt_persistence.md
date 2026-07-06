# Cursor Handoff — AVT jacket-inpaint durable persistence (orphaned `pending` fix)

**Status (2026-07-05):** **Implemented** — durable step state-machine with self-invoked `continue` on `main`. Redeploy **`jacket-inpaint-proxy`** + **Publish** frontend.

**Repo:** `github.com/fendifrost-dot/ai-video-tool` (AVT). **Files:**
- `supabase/functions/_shared/jacketInpaintPipeline.ts` — step runner + checkpoints
- `supabase/functions/jacket-inpaint-proxy/index.ts` — user submit + `{ action: "continue", lookId }`

---

## Problem

502 fixed (`e391f93`), but runs stayed **`pending` forever** with null `generation_metadata` — worker recycled at Supabase **~400s** before terminal DB write. Per-step poll budgets (6/9 min) exceeded platform ceiling.

False "complete" toast was a separate client bug (fixed `46dbe0a`).

---

## Solution (shipped)

**Step state-machine across short invocations:**

| Step | Action |
|------|--------|
| `evf_sam_submit` → `evf_sam_poll` | Mask via Fal |
| `depth_submit` → `depth_poll` | Optional (ControlNet default OFF) |
| `pad_upload` | ÷16 pad + temp storage paths |
| `flux_submit` → `flux_poll` | IP-Adapter inpaint |
| `recomposite` | Deterministic jacket-only composite + terminal `complete` |

- State checkpointed on `artist_looks.composition_recipe_json.jacket_inpaint_state` after every step
- `generation_metadata.phase` updated each step (visible while running)
- Each Fal poll runs max **120s** per invocation; resumes same `status_url`/`response_url` on continue
- After each step: `scheduleContinue()` → service-role POST `{ action: "continue", lookId }`
- Terminal **`failed`** always written on error (no silent orphan)

---

## Deploy

1. Pull `main` with persistence commit
2. Lovable **redeploy** `jacket-inpaint-proxy`
3. **Publish** frontend (18 min poll timeout)

No CC redeploy unless `fal-run` whitelist missing. No new secrets.

---

## Verify 3b

- `generation_metadata.phase` advances: `evf_sam_submit` → `evf_sam_poll` → … → `recomposite`
- Row ends `complete` with `generated_storage_path` OR `failed` with `failed_step` + `fal_error_raw`
- No toast unless `status === 'complete'` and image path exists

---

## Chain of command

AVT repo only. Fal key on CC (`wkzwcfmvnwolgrdpnygc`). See `claude_code_handoff_avt_agent_context.md`.
