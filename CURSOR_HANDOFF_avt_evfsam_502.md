# Cursor Handoff — Fix AVT jacket-inpaint evf-sam 502 (submit-time gateway error)

**Status (2026-07-05):** Fix **shipped** on `main` in commit **`e391f93`** (`fetchWithRetry` on submit + poll + download). Redeploy `jacket-inpaint-proxy` on AVT Lovable after pulling `main` ≥ `e391f93`.

**Repo:** `github.com/fendifrost-dot/ai-video-tool` (AVT only — **not** `fendi-control-center`).  
**File:** `supabase/functions/jacket-inpaint-proxy/index.ts` (`falViaCc` + `fetchWithRetry` live in this file).

---

## Chain of command (do not confuse)

| | AVT | Control Center (CC) |
|--|-----|---------------------|
| GitHub | `fendifrost-dot/ai-video-tool` | `fendifrost-dot/fendi-control-center` |
| Supabase ref | `qoyxgnkvjukovkrvdaiq` | `wkzwcfmvnwolgrdpnygc` |
| App | `aivideotool.lovable.app` | Backend only (compose-look, switchx-restyle) |
| This lane | `jacket-inpaint-proxy` | `switchx-restyle` (`fal-run`) + `fal-queue-poll` |
| Fal API key | **Not on AVT** | CC holds `FAL_KEY` server-side |
| SQL | Lovable SQL editor (AVT project) only | Separate CC project if needed |
| Deploy | Lovable **Publish** + **edge function redeploy** | CC redeploy only when CC code changes |

Do **not** use Supabase CLI against AVT (wrong account → 403). Do **not** call Fal from a sandbox.

---

## The system (context)

The AVT **"3b · Jacket-Only Inpaint"** lane (`jacket-inpaint-proxy`) runs a sequential pipeline. Each step is a separate Fal job via CC `switchx-restyle` action `fal-run` (`X-Proxy-Secret`), polled through CC `fal-queue-poll`:

```
evf-sam (mask)  →  imageutils/depth  →  ÷16 pad  →  flux-general/inpainting  →  crop back to 1080×1920  →  deterministic recomposite
```

Background task (`EdgeRuntime.waitUntil`); progress/errors on `artist_looks` (`generation_metadata`, `failed_step`, `step_timings_ms`, `fal_error_raw`).

**Do NOT touch:** pipeline stages, params (seed 777, steps 30, strength 0.85, controlnet default OFF, ip_adapter_scale 0.9, mask_prompt, feather/expand), ÷16 padding, recomposite, raw-error surfacing.

---

## The bug (verified)

3b failed at **first Fal call — evf-sam — submit-time 502** before polling:

```
failed_step: "evf-sam"
step_timings_ms: { evf_sam: 424 }
fal_error_raw: "cc_submit_fal-ai/evf-sam_502: fal_submit_failed"
```

**Root cause:** transient CC/Fal gateway 502 (`fal_submit_failed`), **not** a submit regression. Diff `d0c367e..dff7205`: only poll budgets + `timed()` wrappers changed; submit URL/method/headers/body unchanged.

---

## The fix (implemented in `e391f93`)

1. **`fetchWithRetry()`** — exponential backoff **2s → 4s → 8s**, **4 attempts** on HTTP **5xx** and network errors; **no retry on 4xx**.
2. **Submit** (evf-sam, depth, flux-inpaint) and **poll** loops use `fetchWithRetry`.
3. **`download()`** (Fal CDN result images) hardened the same way.
4. Submit errors surface CC `error` **and** `detail` (upstream Fal body).

Poll budgets unchanged from `dff7205`: 6 min default / 9 min flux-inpaint.

---

## Deploy (Fendi / Lovable)

1. Pull `main` ≥ `e391f93`
2. **Redeploy** `jacket-inpaint-proxy` (AVT edge functions — Publish alone is not enough)
3. **Publish** frontend if UI changed
4. **No CC redeploy** required for this retry-only fix (unless `fal-run` whitelist is missing)

Re-test **Hero Frame Studio → 3b · Jacket-Only Inpaint**. Pass gate: garment topology + only-jacket pixels changed + 1080×1920.
