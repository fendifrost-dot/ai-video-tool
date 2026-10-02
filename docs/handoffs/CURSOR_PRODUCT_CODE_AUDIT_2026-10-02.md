# Cursor — product / code audit handoff (no implementation)

**Date:** 2026-10-02  
**Scope:** clothing swap, environments, camera / angles, and the product path toward a finished cut.  
**Out of scope:** security, auth hardening, RLS, spend-gate policy, implementation (this document only).  
**Baseline:** canonical `main` @ `fea6ba3` (`github.com/fendifrost-dot/ai-video-tool`). Pre-flight passed (Lovable-managed, project `qoyxgnkvjukovkrvdaiq`).  
**Companion docs (do not duplicate):** Claude stall audit [`docs/research/results/2026-10-01-sample-build/STALL_AUDIT_2026-10-01.md`](../research/results/2026-10-01-sample-build/STALL_AUDIT_2026-10-01.md); product plan [`docs/plans/PLAN_2026-10-01_LYRIC_LOCK_AND_TRANSITIONS.md`](../plans/PLAN_2026-10-01_LYRIC_LOCK_AND_TRANSITIONS.md); Claude latest [`docs/handoffs/CLAUDE_LATEST.md`](CLAUDE_LATEST.md) rev 47+.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

---

## 1. One-paragraph verdict

The environment / camera / world lane has real production momentum in the **scripts lane** (bar look, Kling i2v route, living plates, Seedance multi-angle, lyric timing in the storyboard, transitions engine, batch credentials, sample cut `bar1`). What is missing for a finished **product** is not another provider smoke — it is (a) **one declared garment policy** so Hero Frame stops showing three competing stories, (b) **bridging the scripts toolchain into Treatment → Produce**, and (c) closing the **remaining plan items** (override, regenerate-from-lyrics, brief-fidelity axis, batch-from-storyboard, transitions on cards). Plumbing stalls Claude already fixed or queued; this audit is about product seams and missed hardening around them.

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

3. **Provider surface lies to the operator**  
   - **VERIFIED:** `HiggsfieldProvider.apiReady = false` while CC DoP / catalogue / Seedance are live via `proxy-provider-call`. Same pattern for Veo/Pika/Fal. Prompt Lab can submit; the badge says manual.

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

**Harden (Claude / next implementer), small → large:**

1. Adapter: visualiser `scenes` → world/broll runners (or delete the dead concepts path).  
2. Flip or explain Higgsfield `apiReady`.  
3. Persist or deliberately drop ShotSpec camera/lens/reconstruction fields.  
4. Foreground occluder in `composite_environment`.  
5. Brief-fidelity axis (B5) once cards carry required elements.  
6. Render worker (A6) for composite wall-clock — scripts lane stays the brain.

**Do not:** reopen chest/sleeve paint; scale Lane A without an engine; treat Produce Video (Veo-default) as the env lane; fold look into the realism verdict.

---

## 7. Explicit non-goals of this handoff

- No code, migrations, redeploys, or paid calls from this Cursor pass.  
- No security findings (per request).  
- No re-audit of stall OOM/JWT (Claude’s stall audit + batch credentials own that).  
- Prior Lane H / reconstruct status remains in dated reconstruct docs; unchanged by this audit.

---

*Cursor product/code audit · 2026-10-02 · audit-only*
