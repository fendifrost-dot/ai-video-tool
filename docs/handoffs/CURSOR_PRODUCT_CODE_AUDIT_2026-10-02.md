# Cursor — product / code audit handoff (no implementation)

**Date:** 2026-10-02 (rev B — added Control Center connection audit)  
**Scope:** clothing swap, environments, camera / angles, AVT↔Control Center provider connections, path toward a finished cut.  
**Out of scope:** security, auth hardening, RLS, spend-gate policy, implementation (this document only).  
**Baseline:** AVT `main` @ `fea6ba3` (`github.com/fendifrost-dot/ai-video-tool`); CC read-only clone @ `3bfc770` (`github.com/fendifrost-dot/fendi-control-center`, ref `wkzwcfmvnwolgrdpnygc`). Pre-flight passed.  
**Companion docs (do not duplicate):** Claude stall audit [`docs/research/results/2026-10-01-sample-build/STALL_AUDIT_2026-10-01.md`](../research/results/2026-10-01-sample-build/STALL_AUDIT_2026-10-01.md); product plan [`docs/plans/PLAN_2026-10-01_LYRIC_LOCK_AND_TRANSITIONS.md`](../plans/PLAN_2026-10-01_LYRIC_LOCK_AND_TRANSITIONS.md); Claude latest [`docs/handoffs/CLAUDE_LATEST.md`](CLAUDE_LATEST.md) rev 47+; AVT proxy design [`docs/control_center_provider_proxy.md`](../control_center_provider_proxy.md).

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## 1. One-paragraph verdict

The environment / camera / world lane has real production momentum in the **scripts lane** (bar look, Kling i2v route, living plates, Seedance multi-angle, lyric timing in the storyboard, transitions engine, batch credentials, sample cut `bar1`). Control Center already carries the live world/garment catalogue (DoP, Kling, Genjutsu, Seedance 2.5, image_edit). What is missing for a finished **product** is not another provider smoke — it is (a) **one declared garment policy** so Hero Frame stops showing three competing stories, (b) **bridging the scripts toolchain into Treatment → Produce** (and exposing the Higgsfield *catalogue*, not only DoP, in `providerJobs`), (c) closing **CC contract footguns** (job-result host parity, cost estimates, fal-run allowlist for Lane A / dwpose), and (d) the **remaining plan items** (override, regenerate-from-lyrics, brief-fidelity, batch-from-storyboard, transitions on cards). Plumbing stalls Claude already fixed or queued; this audit is about product seams and missed hardening around them.

---

## 2. What is in good shape (do not re-litigate)

| Area | Status | Evidence |
|------|--------|----------|
| Realism **bar** as data | **VERIFIED** | `docs/research/references/realism_bar/`, `config/look_presets.json` `film_bar_v1` |
| Two-axis gate (realism ⊥ look) | **VERIFIED** | `scripts/qa/realism_gate.py --look-bank` |
| World route (bar still → Kling 2.5 i2v, camera-only motion) | **VERIFIED** | sample-build results; `run_world_batch.py` |
| Living plates + plate-aware grade | **VERIFIED** | `composite_environment.py --match-plate`; living strip evidence |
| Stall roots A–C partially closed | **VERIFIED** | compositor memmaps, `scripts/_lib/jobs.py`, write-ahead manifests, `provider_caps.json`, `batch-token-proxy` shipped |
| Lyric lines on storyboard cards | **VERIFIED** | `lyric_lines` + `lyricsForShot` + `ShotCard` |
| Transitions engine (scripts) | **VERIFIED** | `scripts/edit/transitions.py`, `config/transition_presets.json` |
| Seedance 2.5 multi-angle KEEP | **VERIFIED** | `docs/research/results/2026-10-02-seedance-multiangle/` + `seedance_ref` route |
| World-around staging learnings | **VERIFIED** | `WORLD_AROUND_PERFORMER_2026-10-02.md`; `world_around.py` |
| Camera engine vocabulary | **VERIFIED** | `camera_engine.py` + `lens_presets.json` (scripts-complete for 2.5D moves) |
| Genjutsu stage-1 KEEP (garment parked lane re-opened for test) | **OBSERVED** | results under `2026-10-01-genjutsu-outfit-swap/` |

---

## 3. Product decisions still open (highest leverage)

These are **owner decisions**, not code bugs. Until they land, agents will keep shipping parallel mechanisms.

### 3.1 Garment strategy — three stories, one UI

**VERIFIED:** Hero Frame §7 stacks:

1. **Lane A** — locked path in `VIDEO_SWAP_ARCHITECTURE.md` (Grok keyframes + propagate); `wardrobe-video-propagate-proxy` default engine **`disabled`** until `WARDROBE_PROP_ENGINE` + `PROPAGATION_FAL_MODEL` (ARCH-1 still open).
2. **Architecture C / E1** — `GrokVideoEditRunner` (full-clip `/videos/edits`); product-test lane that **does not** match the keyframe+propagation lock for full length.
3. **Parked / Genjutsu** — scripts + CC `video_to_video`; no `src/` surface; stage 2/3 on Fendi’s call.

**RECOMMENDATION:** Write a dated supersede (or “production for YSL” addendum) in `VIDEO_SWAP_ARCHITECTURE.md`: e.g. *performance = real clothes + living plates; garment V2V = Genjutsu when authorised; Lane A = research until Fal flow is wired; Architecture C = frozen proof (v20)*. Then badge or hide non-production runners in the UI so engineering mode does not look like three equal shipping lanes.

### 3.2 Acceptance axes incomplete

| Axis | Status |
|------|--------|
| Realism (tier1 + Astra judge) | **VERIFIED** shipped in scripts |
| Look (bank distance) | **VERIFIED** shipped; thresholds await Fendi calibration ratings |
| Brief fidelity (card ↔ clip) | **VERIFIED missing** — plan B5; judge still passes creatively wrong plates |

**RECOMMENDATION:** Do not accept clips into a cut on realism alone; B5 is the missing product gate for “what I’m saying is on screen.”

### 3.3 Creative funnel vs scripts reality

**VERIFIED:** Primary nav = Treatment → Assets → Produce Video → Review → Export. Env/camera/B-roll/world work lives almost entirely under **scripts + Hero Frame / Prompt Lab (engineering)**. Edge functions `grok-broll-proxy`, `world-still-proxy`, `lyric-visualizer-proxy` have **no `src/` callers**. Look presets are CLI `--look-preset` only.

**RECOMMENDATION:** Either (i) a thin “Batch / Worlds” engineering page that drives the existing runners with the live session, or (ii) plan B6 (`--from-project`) so Treatment is the source of truth. Scripts-first was the right DECISION for speed; the product debt is now the gap itself.

---

## 4. Hardening / missed seams (product + code)

Ordered by impact on finishing a cut. Security omitted.

### P0 — Contract breaks that will waste the next paid day

1. **Lyric visualizer → B-roll batch schema mismatch**  
   - **VERIFIED:** `lyric-visualizer-proxy` returns `lines[].scenes[]` with `render_prompt`, `renderer`, `performance_plate_prompt`.  
   - **VERIFIED:** `run_broll_batch.py` still expects `lines[].concepts[]` with `broll_prompt`, `needs_plate_change`.  
   - World batch (`run_world_batch.py`) is the current production runner; the old B-roll batch path is **stale relative to visualiser v2**. Adapter or retire the old shape.

2. **ShotSpec camera / reconstruction not persisted**  
   - **VERIFIED:** `ROW_UNMAPPED_FIELDS` in `shotSpec.ts` includes `framing`, `cameraAngle`, `lens`, `generation`, `reconstruction`, `qa`.  
   - Camera engine and compositor cannot be driven from DB rows without notes/JSON side channels. Treatment plans are not executable workers.

3. **Provider surface lies to the operator + Prompt Lab only hits DoP**  
   - **VERIFIED:** `HiggsfieldProvider.apiReady = false` while CC DoP / catalogue / Seedance are live via `proxy-provider-call`. Same pattern for Veo/Pika/Fal.  
   - **VERIFIED:** `src/lib/providerJobs/api.ts` `ENDPOINT_BY_PROVIDER.higgsfield` → `video-providers-higgsfield-generate` only. Scripts reach `higgsfield-model` (Kling / Genjutsu / Seedance / image_edit) by naming the endpoint explicitly; the app provider job path cannot.

### P1 — Pipeline completeness gaps

4. **Camera engine ↔ living video plates**  
   - **VERIFIED:** `camera_engine` takes a still plate (+ depth); living motion is `composite_environment` video plates. Large parallax on a living plate is two tools, not one path.  
   - **OBSERVED:** `orbit` is horizontal parallax, not true subject orbit.  
   - **RECOMMENDATION:** Document the ordered pipeline (matte → optional camera on still plates → living plate composite → Seedance for angle change) as the product recipe; do not imply one button does all three.

5. **Look finishing not chained**  
   - **VERIFIED:** `grade_to_bank.py` and look axis exist; `run_world_batch` / `insert_broll` do not require ON_BAR or a grade pass before cut.  
   - Closet takes cannot be graded into the bar (**VERIFIED** in realism bar doc) — plate-aware lighting / world-around is the real lever; finishing grade is last mile only.

6. **Foreground occluder layer**  
   - **VERIFIED** as next mechanical need in world-around addendum (car/boys in front of performer). `composite_environment` today is performer-over-plate; reverse/stack order for lower-half occlusion is missing.

7. **Identity calibration unfinished**  
   - **VERIFIED:** `realism_gate` comments mention `--labels`; identity never REJECTs (REVIEW only). Head-trim for i2v frame-0 composite edge is insert-time (`--skip-head`), not gate-time.

8. **`match_grade` retime offset**  
   - **VERIFIED:** `fit_time_scale` computes `offset_s` but ffmpeg path applies scale only — Genjutsu conform may leave residual lip drift if offset matters.

9. **Lane A still inert for production**  
   - **VERIFIED:** propagate README — no Fal flow/warp model wired; default blocks intermediates. ARCH-1 unchanged. Fine if garment is parked; misleading if UI presents Lane A as ready.

10. **§6 durable queue**  
    - **VERIFIED:** all wardrobe long jobs still `EdgeRuntime.waitUntil`. Acceptable for short proofs; not for full-song garment. PIPELINE-1 / stall audit A6 (render worker) is the real answer for composites too.

### P2 — Product polish / plan remainder

11. **Plan B3–B6 / C2–C4 still open** — treatment override, regenerate-from-lyrics, brief fidelity, batch-from-storyboard, transitions on cards, cut-point QA, audition page. B1/B2/C1 done.  
12. **Hook master cuts missing** (plan B7) — exemplars sit before bars 24–46; sample cannot prove lyric lock on the hook.  
13. **Physics restage data** (kids-car, snowman) — Fendi’s pick exists; shot-list prompts must carry staging rules (from-behind four / side-on two).  
14. **Plates at 9:16** — 16:9 → crop loses edge action (**VERIFIED** sample build).  
15. **Governor coverage** — plan A2: add `jobs.py` to `camera_engine.py` / `grade_to_bank.py` when next touched.  
16. **No tests** for camera_engine, realism_gate, look_fingerprint, run_world_batch — regressions will be paid.  
17. **Review board** stores human `realism_score`; does not ingest gate JSON or Astra packages — QA stays offline.  
18. **RISK_REGISTER last reviewed 2026-09-16** — product risks from the env phase (batch identity now shipped; ARCH-1; no CI) not refreshed. **RECOMMENDATION:** refresh product rows only (skip security) when convenient.

### Doc drift (cheap)

19. CLAUDE_LATEST rev 42 claims `run_broll_batch --resume`; world batch has `--resume`, B-roll batch path may still differ — keep claims tied to the runner you mean.  
20. Calibration “page” is an external Claude artifact, not an AVT route — thresholds not yet data-driven from Fendi’s ratings.

---

## 4b. Control Center connection audit (AVT ↔ CC)

Read-only against CC clone `3bfc770`. No CC edits. Security omitted.

### Topology (what AVT actually uses)

| CC function | AVT transport | Role today |
|-------------|---------------|------------|
| `video-providers-higgsfield-generate` | `proxy-provider-call` | DoP image-to-video (character B-roll) |
| `video-providers-higgsfield-model` | `proxy-provider-call` (scripts) | Catalogue: Kling t2v/i2v, Hailuo, Genjutsu v2v, Seedance 2.5 ref-to-video, Grok/Qwen image_edit |
| `video-providers-runway-generate` | `proxy-provider-call` | Runway gen |
| `video-providers-runway-video-edit` | `runway-video-edit-proxy` → `callControlCenter` | Aleph / Omni / Seedance2_5 edit |
| `video-providers-grok-generate` | `proxy-provider-call` | xAI video generations (Prompt Lab / legacy) |
| `video-providers-{veo,pika,fal}-generate` | `proxy-provider-call` | Present; product use light |
| `video-providers-job-status` / `job-result` | `proxy-provider-call` GET | Poll / fetch |
| `switchx-restyle` + `fal-queue-poll` | direct CC URL + `X-Proxy-Secret` | Fal VTON, SAM-3, fal-run whitelist, Lucy |
| `compose-look` | `compose-look-proxy` | Virtual Samples |
| `faceswap-generate` (+ callback) | `faceswap-proxy` | Identity graft |
| `train-style-lora` | `train-style-lora-proxy` | Style LoRA |
| `ai-draft-treatment` / `research-provider-docs` | allowlisted on `proxy-provider-call` | Treatment draft / research |

**VERIFIED catalogue modes on `higgsfield-model`:** `text_to_video`, `image_to_video`, `video_to_video` (Genjutsu), `reference_to_video` (Seedance **2.5** only — not 2.0), `image_edit` (grok-image-2, qwen-image-3-edit). Scripts already call these correctly with explicit `mode` / `modelVariant`.

### CC product findings (prioritized)

| P | Finding | Evidence |
|---|---------|----------|
| **P0** | **Lane A fal-run allowlist has no optical-flow / warp / EbSynth model** — only depth/canny/openpose, flux inpaint, ffmpeg helpers, kolors VTON, Lucy. Propagation stays `disabled` on AVT until CC allowlists a flow model (or a dedicated worker). | CC `switchx-restyle/index.ts` ALLOWED set L652–673; AVT `wardrobe-video-propagate-proxy` README |
| **P0** | **App `providerJobs` cannot reach Higgsfield catalogue** — maps `higgsfield` → DoP generate only. Worlds/Seedance/Genjutsu/image_edit are scripts-only unless endpoint is overridden. | AVT `providerJobs/api.ts` L40–48 |
| **P1** | **`job-result` missing api-host fallback for Higgsfield** — `job-status` tries `platform` then `api.higgsfield.ai`; `job-result` only hits `platform.higgsfield.ai`. Catalogue / image_edit jobs that live on the api host can poll OK and fail on result fetch. | CC `job-status` L39–40 + fallback; `job-result` L46–176 platform-only |
| **P1** | **Cost envelope inconsistency** — DoP returns `costEstimateCents: null`; Runway edit returns `ccProviderEstimateCents` / `avtAuthorizedMaxCents` (deliberately not `costEstimateCents`); Seedance estimate is **output seconds only** (comments admit input seconds also bill — scripts compensate); Genjutsu estimate uses `duration` while billing is **source** seconds. AVT cost UI / ledgers paper over this. | CC higgsfield-generate L192; runway-video-edit; higgsfield-model L79–81, L241; env ledger note |
| **P1** | **`fal-ai/dwpose` not on fal-run allowlist** — pose-conditioned masked inpaint path stays `model_not_allowed` (Aug/Sept evidence). openpose preprocessor *is* allowlisted; dwpose is not. | CC ALLOWED set; AVT CLAUDE_LATEST / hero_exp provenance |
| **P1** | **AVT allowlists `image-providers-grok-edit` but CC has no such function** — dead endpoint on `proxy-provider-call` until implemented or removed from the set. | AVT `proxy-provider-call` L60; CC functions dir has no `image-providers-*` |
| **P2** | Mode auto-inference keys off singular `referenceVideoUrl`, not `referenceVideoUrls[]` — Seedance callers must pass `mode`/`modelVariant` (scripts do; a naive UI might not). | CC higgsfield-model L124 |
| **P2** | Seedance audio refs / Genjutsu input-seconds field not first-class in the CC estimate API | Comments vs implementation |
| **P2** | No CC balance preflight (plan A4) — Runway org credits readable; Higgsfield still dashboard | Plan + stall audit |
| **P2** | `kling-restyle`, `fal-storage-upload` exist on CC, unused by AVT | CC config vs AVT grep |
| **P2** | Proxy contract doc lives only on AVT (`docs/control_center_provider_proxy.md`); CC has no copy — easy for CC-only agents to drift | Both repos |

### What is already solid on CC (do not re-break)

- Dual Higgsfield surface (DoP vs catalogue) with explicit modes — the right split.  
- Job-status api-host fallback for catalogue (status path).  
- Runway video-edit cost gate (`avtAuthorizedMaxCents`) and Omni contract (no ratio / contentModeration in edit mode) — tested.  
- fal-run allowlist discipline (refuse unknown models) — correct; needs *additions*, not loosening.  
- Compose-look / faceswap / train-style-lora paths still the Virtual Samples backbone.

### CC-side recommended next actions (for Claude Code on CC when lock allows)

1. Mirror job-status’s api-host fallback into `job-result` for Higgsfield.  
2. Allowlist one optical-flow/warp Fal model (named) when Lane A is un-parked — or document “Lane A blocked at CC” in AVT UI.  
3. Add `fal-ai/dwpose` if masked+pose inpaint is still a candidate.  
4. Expose catalogue estimate fields: `inputSeconds` for Seedance/Genjutsu; unify a `costEstimateCents` alias for DoP/edit so AVT UI does not special-case.  
5. Balance read endpoint (Runway first) for batch preflight.  
6. Drop or implement `image-providers-grok-edit` on both sides.

AVT-side (no CC lock needed): extend `ENDPOINT_BY_PROVIDER` / Prompt Lab for catalogue modes; flip `apiReady` for Higgsfield; remove dead allowlist entry if CC will not build it.

---

## 5. Clothing swap — honest state for next agent

| Track | Product role today | Hardening note |
|-------|--------------------|----------------|
| v20 / E1 + deterministic repairs | Frozen production proof for YSL section | Construction ceiling is generator-side; deterministic levers mostly spent |
| Genjutsu | Stage-1 KEEP; stage 2/3 spend decision | Needs `match_grade` (fix offset) + cross-shot consistency gate before scaling |
| Lane A keyframe+propagate | Locked doc; engine disabled | Do not sell as live until Fal model + short kill-criterion pass |
| Pose-locked heroes | Both mechanisms failed gate (checkpoint B) | Blocker is hero, not carrier — recorded |
| Still-repair Architecture C | Chest/sleeve locked CLEARED history | Do not reopen paint while env lane owns the cut |

**DECISION already on record (rev 39):** garment lane parked ~6 months; env/camera/B-roll is the active product. Genjutsu is an exception test, not a silent un-park.

---

## 6. Suggested next actions (for Fendi / Claude — not this Cursor pass)

**Decide (Fendi):**

1. Garment supersede text (what ships vs research vs parked).  
2. Calibration ratings → look/realism thresholds.  
3. Genjutsu stage 2/3 spend vs hold.  
4. Whether the next product surface is B3–B5 in the app or scripts-only B6 first.  
5. Lift CC lock briefly for job-result host parity + (optional) dwpose / flow allowlist — or keep scripts-only and accept the gaps.

**Harden AVT (no CC lock):**

1. Adapter: visualiser `scenes` → world/broll runners (or delete the dead concepts path).  
2. Flip Higgsfield `apiReady`; route Prompt Lab / `providerJobs` to `higgsfield-model` for world/Seedance/Genjutsu (or a mode selector).  
3. Remove or implement `image-providers-grok-edit` allowlist entry.  
4. Persist or deliberately drop ShotSpec camera/lens/reconstruction fields.  
5. Foreground occluder in `composite_environment`.  
6. Brief-fidelity axis (B5); render worker (A6).

**Harden CC (when lock lifted):**

1. `job-result` api-host fallback (parity with job-status).  
2. Cost estimate: input seconds + DoP non-null estimate.  
3. fal-run allowlist: flow model (Lane A) and/or `dwpose` if still needed.

**Do not:** reopen chest/sleeve paint; scale Lane A without a CC-allowlisted engine; treat Produce Video (Veo-default) as the env lane; fold look into the realism verdict; edit CC from an AVT-only session without an explicit lock lift.

---

## 7. Explicit non-goals of this handoff

- No code, migrations, redeploys, or paid calls from this Cursor pass.  
- No security findings (per request).  
- No re-audit of stall OOM/JWT (Claude’s stall audit + batch credentials own that).  
- Prior Lane H / reconstruct status remains in dated reconstruct docs; unchanged by this audit.

---

*Cursor product/code audit · 2026-10-02 · audit-only*
