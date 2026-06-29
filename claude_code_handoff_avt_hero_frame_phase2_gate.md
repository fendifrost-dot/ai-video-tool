# Claude Handoff — Hero Frame Phase 1 Sign-Off + Phase 2 Kill-Gate (Strict)

**Date:** 2026-06-21  
**Author:** Cursor (coordination)  
**Audience:** Claude — execute **only** what is assigned in Section 0.  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool  
**Branch:** `main` (latest at time of writing: `c83bb44`)  
**Live app:** https://aivideotool.lovable.app/  
**Artist root (Fendi):** `/artists/8d4a4d22-41c0-43ab-ba99-92750f81e335`

**Read first (mandatory, in order):**

1. `AVT_MEMORY_HANDOFF.md` — hard rules (still apply)
2. `CURSOR_HANDOFF_video_clothing_swap_pivot.md` — **locked architecture** (supersedes per-frame IDM-VTON + logo-in-isolation)
3. `claude_code_handoff_avt_hero_frame_phase1.md` — Phase 1 test matrix (reference)
4. This file — **your assignment for this session**

**Supersedes for primary workflow:**

- `claude_code_handoff_avt_brand_fidelity_v2_test.md` (if present) — IDM-VTON + post-hoc logo composite as **primary** path is **discarded**
- `claude_code_handoff_avt_logo_composite_fix.md` — logo-in-isolation re-test is **stopped** unless explicitly assigned as Phase 3a on an approved hero

---

## 0. Your assignment (strict)

Fendi forwarded your session report. You fixed Hero Frame Studio infra and produced a verified hero still (Grok garment-truth + identity face-swap + eyewear restore). **Do not assume Phase 1 is signed off until you complete Section 6 formally.**

### You MUST do (this session, in order)

1. **Confirm deploy state** (Section 4) — publish SHA + edge redeploys for every function you touched.
2. **Execute Phase 1 formal sign-off** (Section 6) — structured audit vs real SL product reference (`IMG_5541` / on-model MOD-003). Attach side-by-side + chest crop + identity crop.
3. **Record approved hero look ID** and recipe metadata (`hero_frame_approved`, lane used, pipeline steps).
4. **Only if Section 6 = PASS:** run **Phase 2 kill-gate experiment** (Section 7) — **one** ~3s clip slice, **one** propagation method first (SwitchX wardrobe video on CC). Judge pass/fail; **stop after one method** unless Fendi explicitly approves a second.
5. **Report back** using Section 10 template. Include cost notes and blockers.

### You MUST NOT do (non-negotiable)

| Forbidden | Why |
|-----------|-----|
| Start **Phase 3** (tracked brand layer) or rebuild logo composite | Not built; reuse existing engine later on propagated frames |
| Run **brand fidelity v2 IDM-VTON** test plan as primary workflow | Superseded by hero-frame pivot |
| Further **logo-in-isolation** optimization on jacket-only VTON | Pivot DISCARD list |
| Use **Kling v2v** for wardrobe | Identity-destroying — disqualified (F grade) |
| Process garment/video frames in a **Claude sandbox** | Hard rule — all work through AVT/CC |
| **Redesign architecture** or pitch per-frame independent VTON for video | Locked pivot |
| Scale to full clip / batch frames **before kill-gate PASS** | Pay cost only after 3s proof |
| **CC redeploy** unless a CC error proves stale code | AVT publish + AVT edge redeploys are the default |
| Touch **Lovable SQL editor** unless a live error proves schema drift | No migrations in scope |
| Call Phase 2 a **win** without identity + garment stability audit on video | Kill criterion |

### Cursor builds Phase 2 proxy — you do NOT

Cursor will implement the AVT `switchx-wardrobe-video-proxy` (or equivalent) + Hero Frame **Animate** action **only after** you report Phase 1 PASS **and** Fendi approves proceeding. **If the proxy does not exist yet**, your job this session ends at Phase 1 sign-off + a **blocked** Phase 2 note listing exactly what Cursor must ship. Do not work around a missing proxy by calling CC with secrets in the clear.

---

## 1. Context — what you already executed (2026-06-21 session)

Document for the record. Verify each fix is live before testing.

| Commit | Fix | Redeploy / publish |
|--------|-----|-------------------|
| `538d04f` | Grok image lane hang — hard timeouts in `_shared/xaiImageEdits.ts` | Redeploy `grok-image-garment-proxy` |
| `d1a396b` | Capture CORS taint — `crossOrigin="anonymous"` on source video | Lovable **Publish** |
| `af6eed2` | Studio Generate wrote zero rows — `authSession.ts` 8s-guarded `getSession` | Lovable **Publish** |
| `b002f01` | Identity — Grok lane → `callApplyIdentityToLook`; `source_tool` enum fix | Lovable **Publish** |
| `30b61f6` | `faceswap-proxy` URL cap 600→2048 for signed URLs | Redeploy `faceswap-proxy` |
| `c83bb44` | Eyewear restore — `periocularComposite.ts` + manual eye quad in Hero Frame | Lovable **Publish** |

**Claimed outcome:** verified hero still — Fendi's face, real SL garment (logo legible), real glasses.

**Open / non-blocking (log in report, do not block Phase 2 on these alone):**

- CatVTON lane stalls — Grok lane is the working path
- Glasses restore requires **manual eye-mark quad** (auto-landmarks = follow-up `1b`)
- Auto "+Identity" behind CatVTON — you ran identity directly on Grok path

---

## 2. Locked architecture (pivot phases — use THIS numbering)

```
source video → capture HERO frame
  → garment transfer (Grok Image-Edit OR VTON full-look/jacket-only)     [Pivot Phase 1]
  → identity lock (faceswap)                                              [Pivot Phase 1]
  → eyewear restore (deterministic periocular composite)                  [Pivot Phase 1]
  → HUMAN APPROVE hero still                                              [Pivot Phase 1 GATE] ← you are here
  → optional brand correction on still                                    [Pivot Phase 3a — NOT NOW]
  → temporal propagation (~3s kill-gate first)                            [Pivot Phase 2 — next if gate passes]
  → tracked per-frame brand layer                                         [Pivot Phase 3b — NOT NOW]
  → temporal QA + FFmpeg reassembly                                       [Pivot Phase 4 — NOT NOW]
```

**Priority when judging trade-offs (locked):**

1. Full garment geometry  
2. **Identity preservation** (pass/fail gate — not tunable)  
3. Temporal consistency  
4. Natural motion / occlusion  
5. Brand-detail accuracy  
6. Logo sharpness  

**Reuse (do not rebuild later):** placement engine, `product_details[]`, perspective-warp composite (`b7e1852` + earlier composite commits) → becomes tracked brand layer in Phase 3.

---

## 3. Infrastructure

| Ref | Project | Role |
|-----|---------|------|
| `qoyxgnkvjukovkrvdaiq` | **AVT** — AI Video Tool | App + AVT edge functions |
| `wkzwcfmvnwolgrdpnygc` | **CC** — Fendi Control Center | `switchx-restyle`, `compose-look`, `faceswap-generate`, `fal-queue-poll` |

**Deploy mechanics (you drive Fendi through each):**

- Push to `main` → syncs Lovable source
- **Lovable Publish** → frontend only
- **Lovable edge-function redeploy** per changed function → **required** for proxy fixes (Publish alone is insufficient)

**AVT secrets (confirm set):** `COMPOSE_LOOK_CC_URL`, `SWITCHX_PROXY_SECRET` (or `COMPOSE_LOOK_PROXY_SECRET`), `XAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

**CC auth:** `X-Proxy-Secret` on CC calls — must stay **server-side** in AVT proxies only.

---

## 4. Pre-test deploy verification

Before any spend, confirm:

- [ ] Lovable **Publish** SHA ≥ `c83bb44`
- [ ] **`grok-image-garment-proxy`** redeployed (post-`538d04f`)
- [ ] **`faceswap-proxy`** redeployed (post-`30b61f6`)
- [ ] **`wardrobe-vton-proxy`** redeployed if testing VTON candidates (hero frame fields)
- [ ] Hero Frame route loads: `/projects/{id}/hero-frame`
- [ ] No console errors on capture

---

## 5. Test assets (SL mastic jacket)

| Entity | ID / note |
|--------|-----------|
| Product MOD-003 | `4529ddf8-fcc5-4aff-aff3-73b8b11b3103` |
| Wardrobe SL jacket | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Bad VTON reference (geometry fail) | IMG_5540 story |
| Good product reference (geometry truth) | IMG_5541 / on-model SL ref |
| Source clip for Phase 2 | `hero_src_clip.mp4` or MODEST `IMG_5508.mov` — **~3s slice only** for kill-gate |

---

## 6. Phase 1 formal sign-off (MUST complete)

**Cost:** Grok + identity + eyewear = real spend. Re-run only if deploy was stale.

### 6.1 Reproduce or confirm existing hero

1. Open Hero Frame Studio on project with source video.
2. Capture hero frame (or confirm existing `heroScenePath`).
3. Select SL mastic wardrobe item.
4. Generate candidates — **Grok Image-Edit lane is the known-good path**; VTON lanes optional for comparison only.
5. Run **identity** on winning Grok candidate (`identity_faceswap` child look).
6. Run **eyewear restore** — drag eye quads on source + target; save restored look.

### 6.2 Gate criteria (ALL required for PASS)

Compare approved output vs **on-model product reference** at full res and 1080p crop.

| # | Criterion | Pass |
|---|-----------|------|
| G1 | **Garment geometry** — stripe width, placement, collar, sleeve panels, drape read as *real* SL jacket (not knockoff) | Y/N |
| G2 | **Identity** — Fendi recognizable; face matches canonical reference | Y/N |
| G3 | **Glasses** — real eyewear restored (not AI-hallucinated frames) | Y/N |
| G4 | **Logo legibility** — Saint Laurent wordmark readable at chest crop (may be Grok-generated; Phase 3 will deterministic-track later) | Y/N |
| G5 | **Background / pose** — source frame preserved; no full-scene regeneration | Y/N |
| G6 | **Metadata** — approved look has `hero_frame_approved: true`, traceable parent chain | Y/N |

**Attachments required:**

- Side-by-side: source frame | product ref | approved hero
- Chest crop (~400×200) of stripe + logo
- Face/eyewear crop (~200×200)

### 6.3 Gate decision

- **PASS (all G1–G6 Y):** Record `approved_look_id`. Proceed to Section 7 **only if** Fendi says proceed in this session.
- **PARTIAL:** Document deltas; **do not start Phase 2**; recommend Cursor fix (geometry lane, identity, or eyewear).
- **FAIL:** Stop. Do not recommend video propagation.

---

## 7. Phase 2 kill-gate (ONLY after Section 6 PASS)

**Purpose:** Prove temporal propagation can hold identity + garment for **~3 seconds** before Cursor builds full Animate UX.

### 7.1 Method priority (try in order — stop after first result)

| Order | Method | When to use |
|-------|--------|-------------|
| **1** | **SwitchX wardrobe video** — CC `switchx-restyle`, `mode: "wardrobe"` | **First attempt** — propagates clothing on real frames; SAM-3 masks face/hands/hair/glasses |
| 2 | Image-to-video from approved hero still | Parallel **only if** Fendi approves second spend after Method 1 fails |
| 3 | Optical-flow + ControlNet / IP-Adapter | Cursor build required — **do not improvise** |
| 4 | Per-keyframe VTON + smooth | Last resort — report as failure of better methods |

**DISQUALIFIED:** Kling O1 Edit v2v for wardrobe.

### 7.2 Execution (Method 1 — SwitchX)

**If AVT proxy exists** (Cursor shipped `switchx-wardrobe-video-proxy` or Hero Frame **Animate**):

1. Select approved hero look from Section 6.
2. Source: ~3s slice of original clip (same project video).
3. Trigger Animate from Hero Frame Studio (or documented test entrypoint).
4. Wait for output video URL / child asset.

**If proxy does NOT exist:**

1. **Stop.** Report blocker: `Phase 2 blocked — need AVT proxy for CC switchx-restyle mode:wardrobe video`.
2. Specify exact request for Cursor (Section 8).
3. **Do not** call CC with `X-Proxy-Secret` from Claude sandbox or paste secrets.

### 7.3 Kill-gate pass criteria (video)

Watch output at 1080p, full screen and cropped.

| # | Criterion | Pass |
|---|-----------|------|
| V1 | **Identity stable** — face/glasses/beard recognizable frame-to-frame | Y/N |
| V2 | **Garment stable** — SL jacket color/stripe/collar no obvious morph or swim | Y/N |
| V3 | **Motion preserved** — reads as same take, not regenerated scene | Y/N |
| V4 | **Flicker** — no unacceptable strobing on garment or face | Y/N |
| V5 | **Occlusion** — arms/hands crossing body look natural (not required perfect) | Y/N |

**Kill-gate decision:**

- **PASS (V1–V4 Y):** Recommend Cursor scale Phase 2 proxy + longer clip + Phase 3 brand layer planning.
- **FAIL:** Stop scaling. Report which criterion failed. Evaluate image-to-video parallel **only with Fendi approval**. Do **not** start Phase 3 brand composite on video frames.

### 7.4 Cost discipline

- Phase 2 kill-gate = **one** ~3s run on Method 1 unless Fendi approves more.
- Log approximate cost if visible (Beeble video rate TBC).
- No full-clip extraction, no batch frame VTON.

---

## 8. What to request from Cursor (if blocked)

If Phase 1 PASS and Phase 2 proxy missing, ask Cursor to ship **minimal**:

```
AVT edge: switchx-wardrobe-video-proxy (or extend wardrobe-vton-proxy)
  - Input: approvedLookId, sourceVideoPath/URL, clipStartSec, clipDurationSec (~3)
  - Server-side call to CC switchx-restyle mode:"wardrobe"
  - Poll via fal-queue-poll-proxy pattern
  - Output: child project_asset or artist_look with video URL
  - Recipe: pipeline_used, parent hero look id, cc job ids

UI: Hero Frame Studio "Animate" on approved hero (disabled until hero_frame_approved)
```

**Do not ask Cursor for:** Phase 3 tracking, TPS warp, GPU worker, logo-in-isolation fixes, Kling integration.

---

## 9. Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Generate writes zero rows | Stale publish before `af6eed2` | Publish ≥ `af6eed2` |
| Grok lane hangs forever | Stale `grok-image-garment-proxy` | Redeploy post-`538d04f` |
| Identity fails URL validation | Stale `faceswap-proxy` | Redeploy post-`30b61f6` |
| Capture taints canvas | Stale frontend | Publish post-`d1a396b` |
| CatVTON stalls | Known open issue | Use Grok lane; log stall in report |
| Phase 2 502 | Missing AVT proxy or CC secret mismatch | Check proxy deploy + `SWITCHX_PROXY_SECRET` |
| Garment morphs on video | Method 1 insufficient | FAIL kill-gate; do not scale |

---

## 10. Report template (return to Fendi)

```markdown
## AVT Hero Frame — Phase 1 Sign-Off + Phase 2 Kill-Gate
**Date:** ______
**Deploy SHA:** ______
**Tester:** Claude

### Deploy verification
- [ ] Publish ≥ c83bb44
- [ ] grok-image-garment-proxy redeployed
- [ ] faceswap-proxy redeployed
- [ ] Other: ______

### Phase 1 sign-off
- **Result:** PASS / PARTIAL / FAIL
- **Approved look ID:** ______
- **Lane:** grok_image_edit | idm_vton | other
- **Child looks:** garment ______ → identity ______ → eyewear ______

#### Gate criteria
| G1 Geometry | G2 Identity | G3 Glasses | G4 Logo | G5 Background | G6 Metadata |
|-------------|-------------|------------|---------|---------------|-------------|
| Y/N | Y/N | Y/N | Y/N | Y/N | Y/N |

#### Delta list (good + bad)
- Good: ...
- Bad: ...

#### Attachments
- [ ] Side-by-side
- [ ] Chest crop
- [ ] Face/eyewear crop

### Phase 2 kill-gate
- **Executed:** Y/N (blocked: ______)
- **Method:** SwitchX wardrobe video | i2v | none
- **Source slice:** ______s @ ______
- **Output URL / asset ID:** ______

#### Video criteria
| V1 Identity | V2 Garment | V3 Motion | V4 Flicker | V5 Occlusion |
|-------------|------------|-----------|------------|--------------|
| Y/N | Y/N | Y/N | Y/N | Y/N |

- **Kill-gate:** PASS / FAIL
- **Cost notes:** ______

### Verdict
- Phase 1: SHIP / TUNE / BLOCK
- Phase 2: PROCEED TO CURSOR BUILD / FAIL — try i2v / STOP

### Request for Cursor (if any)
- ...

### Explicitly NOT started (confirm)
- [ ] Phase 3 brand layer
- [ ] Logo-in-isolation IDM-VTON tests
- [ ] Kling v2v
- [ ] Full-clip batch
```

---

## 11. Phase map (avoid confusion)

| Name | Meaning | Status |
|------|---------|--------|
| Pivot Phase 1 | Hero still + identity + approve | **Your sign-off task** |
| Pivot Phase 2 | Video propagation kill-gate | **Next if Phase 1 PASS** |
| Pivot Phase 3 | Tracked deterministic brand layer | **Cursor future — you do not start** |
| Brand fidelity v2 Phases 3–7 | Old doc tracking/TPS/GPU | **Deferred into Pivot Phase 3+** |

---

**End of handoff.** Fendi decides whether to authorize Phase 2 spend after reading your Phase 1 sign-off. Cursor implements Phase 2 proxy on Fendi's go-ahead only.
