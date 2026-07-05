# Claude Handoff — AVT Agent Context (What Happened + Where To Look)

**Date:** 2026-07-05  
**Audience:** Claude (or any new agent session on AVT wardrobe / Hero Frame work)  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool (`main`)  
**Live app:** https://aivideotool.lovable.app/  
**Artist root:** `/artists/8d4a4d22-41c0-43ab-ba99-92750f81e335`

**Read this file first** when joining mid-stream. It explains recent confusion (repos, deploy, “was the fix built?”) and points to the right docs — not generic memory.

---

## 0. What happened (Jul 2026 — jacket-inpaint evf-sam 502)

### Symptom
Hero Frame Studio **§3b · Jacket-Only Inpaint** failed immediately on the first Fal step (`evf-sam`) with:

```
failed_step: "evf-sam"
fal_error_raw: "cc_submit_fal-ai/evf-sam_502: fal_submit_failed"
```

~424ms — **submit-time** 502, before any polling.

### Misread (common agent mistake)
A handoff (`CURSOR_HANDOFF_avt_evfsam_502.md`) was written asking Cursor to **build** retry logic. Agents then debated whether Grok needed a separate API key, whether code was on `main`, or whether Claude should redeploy.

### Actual state on `main`
| Commit | What |
|--------|------|
| `dff7205` | Per-step poll budgets + `step_timings_ms` only. **Did not change** Fal submit URL/body. |
| `e391f93` | **Fix shipped:** `fetchWithRetry()` (2s→4s→8s, 4 attempts) on submit, poll, and download in `jacket-inpaint-proxy`. |
| `64b461b` | Documentation only — added/updated `CURSOR_HANDOFF_avt_evfsam_502.md`. |

**No further code change was required for the 502 retry.** If 3b still fails after redeploy, investigate upstream (CC `fal-run`, Fal queue, payload validation) — not “missing retry.”

### Operational requirement
Edge function code ≠ live until **Lovable redeploy** of `jacket-inpaint-proxy` on the **AVT** project. **Publish** updates frontend only.

---

## 1. Chain of command (memorize this table)

| Question | Answer |
|----------|--------|
| **Which repo for Hero Frame / jacket-inpaint / Grok lane / VTON?** | `fendifrost-dot/ai-video-tool` (AVT) |
| **Which repo for switchx-restyle / fal-queue-poll / compose-look?** | `fendifrost-dot/fendi-control-center` (CC) — **separate repo** |
| **AVT Supabase project** | `qoyxgnkvjukovkrvdaiq` — Lovable **AI Video Tool** |
| **CC Supabase project** | `wkzwcfmvnwolgrdpnygc` — Fendi Control Center |
| **Where is FAL_KEY?** | CC edge secrets only — AVT never holds it |
| **Where is XAI_API_KEY (Grok image)?** | AVT edge secrets — **same key** as CC `Frost_Grok` / console.x.ai |
| **SQL migrations** | Lovable **SQL editor** on AVT project — not supabase.com dashboard, not `supabase` CLI (403 wrong account) |
| **Deploy frontend** | Lovable **Publish** from GitHub `main` |
| **Deploy edge functions** | Lovable **Edge Functions → redeploy** each touched function |
| **When to redeploy CC** | Only when CC code/secrets change (e.g. new `fal-run` model whitelist) |

### Request flow — jacket-inpaint (3b)

```
Browser → AVT jacket-inpaint-proxy (user JWT)
       → CC switchx-restyle { action: "fal-run", model, input }  (X-Proxy-Secret)
       → Fal queue
       → CC fal-queue-poll until COMPLETED
       → AVT deterministic recomposite → look-composites
```

**Never:** call Fal from Claude sandbox, paste API keys in chat, or edit CC thinking you're in AVT repo.

---

## 2. Authoritative docs (read in this order for topic)

| Topic | File |
|-------|------|
| Hard rules (no sandbox processing, no AI garment regen) | `AVT_MEMORY_HANDOFF.md` |
| Agent build/test commands, edge function list | `AGENTS.md` |
| Video wardrobe pivot (hero still → approve → propagate) | `CURSOR_HANDOFF_video_clothing_swap_pivot.md` |
| Hero Frame Phase 1 (capture, candidates, approve) | `claude_code_handoff_avt_hero_frame_phase1.md` |
| Phase 1 sign-off + Phase 2 kill-gate (strict assignment) | `claude_code_handoff_avt_hero_frame_phase2_gate.md` |
| Grok Image-Edit garment-truth lane | `CURSOR_HANDOFF_grok_image_garment_lane_FINAL.md` |
| Jacket-inpaint architecture + Fal payloads | `docs/AVT_Wardrobe_Swap_Build_Spec_v2.md`, `docs/AVT_jacket_inpaint_fal_payload.md` |
| evf-sam 502 episode + retry fix status | `CURSOR_HANDOFF_avt_evfsam_502.md` |
| Grok video vs image wiring | `docs/grok_api_status.md` |
| CC provider proxy pattern | `docs/control_center_provider_proxy.md` |

**Stale trap:** `AVT_MEMORY_HANDOFF.md` “Where things live” once lists CC repo as “this repo” — in an **AVT** session, **this repo** = `ai-video-tool` only.

---

## 3. Key code paths (verify before claiming “not built”)

| Lane | Client | AVT edge function | CC |
|------|--------|-------------------|-----|
| IDM/CatVTON hero | `src/lib/queries/wardrobeVton.ts` | `wardrobe-vton-proxy` | `switchx-restyle` `vton-frame` |
| Grok garment-truth | `src/lib/queries/grokImageGarment.ts` | `grok-image-garment-proxy` | xAI direct (`XAI_API_KEY` on AVT) |
| Jacket-only inpaint (3b) | `src/lib/queries/jacketInpaint.ts` | `jacket-inpaint-proxy` | `switchx-restyle` `fal-run` + `fal-queue-poll` |
| Identity / compose | `src/lib/queries/looks.ts` | `compose-look-proxy` | `compose-look` |
| Grok **video** (Prompt Builder) | `src/lib/providerJobs/api.ts` | `proxy-provider-call` | `video-providers-grok-generate` |

**Before saying a lane “was never built”:** `git log -1 --oneline` on `main`, grep the function name under `supabase/functions/`, confirm Lovable redeploy timestamp.

---

## 4. Claude session prompt (paste at start)

```
You are working on AVT (ai-video-tool), NOT fendi-control-center.

Read first: claude_code_handoff_avt_agent_context.md, then AVT_MEMORY_HANDOFF.md.

Rules:
- AVT repo: github.com/fendifrost-dot/ai-video-tool, Supabase qoyxgnkvjukovkrvdaiq
- CC is separate (wkzwcfmvnwolgrdpnygc); Fal key lives on CC only
- No Supabase CLI on AVT; SQL via Lovable SQL editor only if schema error proves it
- No image/video processing in Claude sandbox — all through AVT/CC edge functions
- Publish ≠ edge redeploy; list which functions you redeployed

Recent: jacket-inpaint evf-sam 502 retry is in e391f93 (jacket-inpaint-proxy). 
Grok image lane is in aef389e+ (grok-image-garment-proxy, XAI_API_KEY on AVT).

Task: [Fendi fills in]
```

---

## 5. What Claude should do vs not do

### Do
- Confirm `main` commit SHA vs live Lovable publish
- List edge functions redeployed with dates
- Run browser tests on Hero Frame Studio; capture `artist_looks.generation_metadata` on failures
- Report pass/fail with side-by-side crops vs product reference

### Do not
- Re-implement fixes already on `main` without checking `git log` / grep
- Confuse AVT and CC repos or Supabase projects
- Use Supabase dashboard/CLI for AVT
- Propose Kling v2v for wardrobe or sandbox compositing
- Redeploy CC “just in case” when only AVT edge code changed

---

## 6. Current open items (not blockers for 502 doc)

- `identity_inpaint` canvas preservation bug (handoff §10 in Grok lane doc)
- CatVTON routing verification (`vton_model` in recipe/logs)
- Phase 2 video propagation — gated on Phase 1 hero approval
- Full-outfit VTON (IDM single-garment limit) — Grok/jacket-inpaint lanes sidestep for hero

---

**Last doc commit:** see `git log -1 -- CURSOR_HANDOFF_avt_evfsam_502.md claude_code_handoff_avt_agent_context.md`
