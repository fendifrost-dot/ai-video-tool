# Claude Handoff — Hero Frame Phase 1 + Grok Wiring + Wardrobe Pivot Docs

**Date:** 2026-06-21  
**Author:** Cursor (implementation)  
**Audience:** Claude — execute the test plan in Section 6 after Fendi confirms Lovable publish + edge redeploys are complete.  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool  
**Branch:** `main` (pushed)  
**Live app:** https://aivideotool.lovable.app/  
**Artist root (Fendi):** `/artists/8d4a4d22-41c0-43ab-ba99-92750f81e335`

**Read first:**
- `AVT_MEMORY_HANDOFF.md` — hard rules (still apply)
- `CURSOR_HANDOFF_video_clothing_swap_pivot.md` — locked architecture (supersedes per-frame VTON as primary path)
- This file — what Cursor shipped and how to verify it

---

## 0. Your assignment

Fendi asked Cursor to push the Grok infra commit, document the wardrobe pivot, and **execute Phase 1** (Hero Frame Studio). That work is on `main`. Your job:

1. Confirm Lovable **publish** + required **edge function redeploys** (Section 4).
2. Run the **Phase 1 test plan** (Section 6) in the live app — no Claude sandbox image processing.
3. Report pass/fail with side-by-side screenshots vs the real SL product reference.
4. **Do not start Phase 2** (video propagation) until a hero candidate passes the gate.

Deliverables back to Fendi: checkbox results, commit SHA deployed, any blockers, and whether the approved hero reads as the real jacket with identity intact.

---

## 1. Infrastructure reminders (read before touching Supabase)

| Fact | Detail |
|------|--------|
| **No outside Supabase** | AVT has **no** standalone supabase.com account. Everything is **Lovable Cloud**. |
| **SQL / migrations** | Any Postgres changes go through the **Lovable SQL editor** only — not `supabase db push` from CLI (AVT CLI often 403). |
| **Edge functions** | Source lives in GitHub `supabase/functions/`. Deploy via **Lovable edge-function redeploy** (or Lovable’s GitHub-linked deploy flow). **Publish alone does not redeploy edge functions.** |
| **CC is separate** | Compose-look, switchx-restyle, faceswap-generate, fal-queue-poll live on **Control Center** project (`wkzwcfmvnwolgrdpnygc`). AVT proxies to CC via secrets on the AVT project. |

**For this release:** Cursor did **not** add new SQL migrations. Phase 1 uses existing tables (`artist_looks`, `project_assets`, `character_features`) and existing buckets. **Claude should not need to run anything in the Lovable SQL editor unless a live error proves a missing column/constraint** — if that happens, paste the exact error and propose minimal SQL for Fendi to run in Lovable SQL editor (do not assume supabase.com access).

---

## 2. What changed (commits on `main`)

| Commit | Summary |
|--------|---------|
| `16a0135` | **Grok Imagine** — Prompt Builder wiring (`apiReady`, multi-ref `reference_to_video`, Generate button). Scope: general video gen, **not** wardrobe. |
| `228226f` | **Pivot docs** — `CURSOR_HANDOFF_video_clothing_swap_pivot.md` + `AVT_MEMORY_HANDOFF.md` addendum (hero still → approve → propagate). |
| `a0b656f` | **Phase 1 Hero Frame Studio** — full UI + backend support (this handoff’s main test target). |

Earlier on `main` (not Cursor this session): logo composite typography fixes (`02b1e4a`, etc.) — unrelated to Phase 1 hero flow.

---

## 3. Architecture pivot (what Phase 1 implements)

**Discarded as primary path:** per-frame jacket-only IDM-VTON + post-hoc logo repair for video swap.

**Phase 1 locked flow:**

```
source video → extract/capture HERO frame
  → full-look OR jacket-only VTON (4 candidates)
  → identity lock (compose-look identity_inpaint)
  → human approve one hero still  ← GATE
  → (Phase 2 propagation — NOT built yet)
```

**Priority when judging:** garment geometry → identity → temporal (Phase 2+) → brand layer (Phase 3).

Reference failure case: bad VTON output (IMG_5540) vs real SL on-model product (IMG_5541). Logo polish cannot fix wrong stripe/collar/sleeve geometry.

---

## 4. Deploy checklist (Claude verifies with Fendi / Lovable panel)

### 4.1 Lovable app publish (AVT)

- [ ] Lovable **Publish** from GitHub `main` ≥ `a0b656f`
- [ ] Confirm live bundle includes **Hero Frame** in project sidebar (`/projects/{id}/hero-frame`)

### 4.2 AVT edge functions — **must redeploy**

| Function | Why |
|----------|-----|
| **`wardrobe-vton-proxy`** | **Required.** New body fields: `transferMode`, `heroFrameCandidate`, `heroFrameSessionId`, `candidateIndex`, `projectId`. Full-look garment ref picker. Skips logo composite on hero candidates. |
| **`grok-image-garment-proxy`** | **Required for Grok garment-truth lane.** Needs `XAI_API_KEY` secret (same as CC `Frost_Grok`). |

Other AVT functions unchanged for Phase 1 but should already be live from prior work:

- `compose-look-proxy` — identity inpaint after VTON
- `faceswap-proxy` — not used in hero pipeline (identity uses compose-look)
- `proxy-provider-call` — Grok video gen (orthogonal)
- `fal-queue-poll-proxy` — VTON polling

**No new AVT edge function folders** were added in Phase 1.

**Grok garment-truth lane (post–Phase 1):** redeploy **`grok-image-garment-proxy`** and set **`XAI_API_KEY`** on AVT edge secrets (same value as CC `Frost_Grok`). See `supabase/functions/grok-image-garment-proxy/README.md`.

### 4.3 Control Center (CC) — confirm reachable, not necessarily redeployed

Phase 1 calls CC through AVT secrets:

- `COMPOSE_LOOK_CC_URL` → CC `compose-look` (identity inpaint)
- CC `switchx-restyle` action `vton-frame` (IDM-VTON / CatVTON)

If VTON or identity steps fail with CC/proxy errors, check CC deploy + `SWITCHX_PROXY_SECRET` / `COMPOSE_LOOK_PROXY_SECRET` match on AVT.

### 4.4 Lovable SQL editor

- [ ] **Nothing required for Phase 1** unless live errors reference missing columns/constraints.
- If you need SQL, write it for Fendi to paste into **Lovable SQL editor** only. Document what it fixes.

### 4.4 Secrets (AVT project — Lovable secrets panel)

Already required from prior wardrobe work; confirm still set:

- `COMPOSE_LOOK_CC_URL`
- `SWITCHX_PROXY_SECRET` or `COMPOSE_LOOK_PROXY_SECRET`
- `XAI_API_KEY` — same xAI key as CC `Frost_Grok` (required for Grok Image-Edit hero lane)
- `SUPABASE_SERVICE_ROLE_KEY` (edge runtime)

---

## 5. Code map (what Cursor built)

### Phase 1 — Hero Frame Studio

| Area | Path |
|------|------|
| UI page | `src/pages/HeroFrameStudioPage.tsx` |
| Route | `src/routes/projects.$id.hero-frame.tsx` → `/projects/$id/hero-frame` |
| Sidebar link | `src/components/ProjectSidebar.tsx` (“Hero Frame”) |
| Client pipeline | `src/lib/queries/heroFrame.ts` |
| Frame capture | `src/lib/video/captureFrame.ts` |
| Types / candidate matrix | `src/lib/heroFrame/types.ts` (4 variants) |
| Full-look ref picker | `src/lib/garment/vtonReference.ts` → `pickFullLookGarmentPath` |
| VTON client | `src/lib/queries/wardrobeVton.ts` (extended input) |
| Edge function | `supabase/functions/wardrobe-vton-proxy/index.ts` |
| Shared ref logic | `supabase/functions/_shared/garmentReference.ts` |

**Candidate matrix (default):**

1. Full-look · IDM-VTON  
2. Full-look · CatVTON  
3. Jacket-only · IDM-VTON (hybrid fallback)  
4. Jacket-only · CatVTON  

Each candidate: VTON → **identity inpaint** (`compose-look-proxy`, pipeline `identity_inpaint`) → compare UI. Logo composite **skipped** on hero candidates (`heroFrameCandidate: true`).

**Approval:** sets look `status: approved` and writes `hero_frame_approved` + session metadata into `composition_recipe_json`.

### Grok Imagine (orthogonal — optional smoke test)

| Area | Path |
|------|------|
| Provider | `src/lib/providers/grok.ts` |
| Job API | `src/lib/providerJobs/api.ts` |
| Docs | `docs/grok_api_status.md` |

Grok Generate in Prompt Builder is **not** the wardrobe engine. Do not use it to judge Phase 1.

---

## 6. Test plan (Claude executes in live app)

**Prerequisites:** Deploy checklist Section 4 complete. Log in as Fendi. Use artist root above.

**Hard rules:** All processing through AVT/CC. No Claude sandbox compositing. Audit reference vs output before calling a win.

### Test 0 — Nav smoke

- [ ] Open a project with an attached artist
- [ ] Project sidebar shows **Hero Frame**
- [ ] Route loads without console errors

### Test 1 — Source frame capture

1. Upload a **reference video** on **Assets** if none exists (e.g. MODEST clip / `IMG_5508.mov` story).
2. Open **Hero Frame** for that project.
3. Select source video, scrub to a clear full-body frame, click **Capture hero frame**.
4. [ ] Thumbnail appears; toast success
5. [ ] New `reference_image` row in project assets (metadata `hero_frame: true`) — optional DB check via Lovable if needed

### Test 2 — Garment + product reference

1. Select **SL mastic jacket** (or current test SKU) from wardrobe dropdown.
2. [ ] Product comparison panel shows **on-model** reference when available (full-look path)

### Test 3 — Generate four candidates

1. Click **Generate hero candidates**.
2. [ ] Progress text cycles through VTON + Identity for each of 4 variants (~ several minutes total)
3. [ ] At least one candidate completes without error (report how many succeeded)
4. [ ] Failed candidates show error text in UI (capture message)

For each **successful** candidate, open the child look in **Looks** and confirm:

- [ ] Parent chain: VTON look → identity child look
- [ ] `composition_recipe_json.transfer_mode` is `full_look` or `jacket_only` as labeled
- [ ] No `_logo_composite` path on hero candidates (raw VTON + identity only)

### Test 4 — Compare & approve (Phase 1 GATE)

1. In Hero Frame grid, compare each candidate **side-by-side with product reference**.
2. Judge against pivot criteria:
   - [ ] Stripe width + placement vs real SL reference
   - [ ] Collar / sleeve panels / drape
   - [ ] Fendi identity recognizable (pass/fail — identity is a gate)
3. Select best candidate → **Approve selected hero**.
4. [ ] Toast success; **Open approved look** link works
5. [ ] Approved look status = `approved`; recipe contains `hero_frame_approved: true`

**Gate decision:**

- **PASS:** At least one candidate reads as the *real* jacket with identity intact → report look ID + screenshots; Phase 2 may be planned (not implemented).
- **FAIL:** Document which geometry/identity deltas remain; do **not** proceed to Phase 2 or recommend scaling per-frame VTON.

### Test 5 — Regression spot checks (quick)

- [ ] **Looks** import canvas + Apply garment (legacy path) still works if needed
- [ ] **Prompt Builder → Grok tab** Generate button present (proxy may 501 if CC key missing — that’s OK for this test)

---

## 7. Known limitations / not in scope

| Item | Status |
|------|--------|
| Phase 2 video propagation | **Not built** — blocked on Phase 1 gate |
| Phase 3 tracked brand layer | **Not built** — reuse logo composite later |
| IP-Adapter / OOTDiffusion direct wiring | **Not built** — Phase 1 uses VTON full-look mode (on-model ref) as first full-look experiment |
| New SQL migrations | **None** in this release |
| Logo composite on hero candidates | **Intentionally skipped** for honest geometry judging |

---

## 8. Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Hero Frame nav missing | Old publish | Lovable publish ≥ `a0b656f` |
| VTON 502 / submit failed | `wardrobe-vton-proxy` not redeployed | Redeploy function from GitHub |
| `transferMode` ignored | Old proxy code | Same redeploy |
| Identity step hangs/fails | CC compose-look / identity LoRA | Check CC deploy + `COMPOSE_LOOK_CC_URL` |
| Garment sign failed | Missing wardrobe ref images | Fix product/wardrobe refs in app |
| All 4 candidates fail | CC Fal queue / secrets | Check `fal-queue-poll-proxy` + CC `switchx-restyle` |
| SQL / column errors | Schema drift | Minimal fix via **Lovable SQL editor** only |

---

## 9. What Claude should report back

```
Deploy:
  [ ] Lovable publish SHA: ______
  [ ] wardrobe-vton-proxy redeployed: Y/N
  [ ] SQL editor changes: NONE / (describe)

Phase 1 tests:
  [ ] Test 0 Nav
  [ ] Test 1 Capture
  [ ] Test 2 Garment ref
  [ ] Test 3 Generate ( ___ / 4 succeeded )
  [ ] Test 4 Approve gate: PASS / FAIL

If PASS:
  Approved look ID: ______
  Notes on stripe/collar/identity vs IMG_5541

If FAIL:
  Delta list (geometry + identity)
  Recommendation: (do not start Phase 2)
```

---

## 10. Do not

- Redesign architecture or revert to per-frame VTON as primary video path
- Run garment processing in a Claude sandbox
- Add logo composite optimization to hero candidates (Phase 1 intentionally skips it)
- Start Phase 2 propagation without Fendi + gate PASS
- Use supabase.com dashboard or CLI for AVT migrations (Lovable SQL editor only)
- Confuse AVT project (`qoyxgnkvjukovkrvdaiq`) with CC project (`wkzwcfmvnwolgrdpnygc`)

---

**End of handoff.** Questions about Grok Prompt Builder wiring → see `docs/grok_api_status.md`. Questions about pivot strategy → see `CURSOR_HANDOFF_video_clothing_swap_pivot.md`.
