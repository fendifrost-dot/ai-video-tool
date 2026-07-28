# LOCKED — Video Garment-Swap Architecture

**Status:** LOCKED. Do not drift. Documentation only — changing this file does not change runtime code, but no runtime work may contradict it without an explicit, dated supersede in this same file.

**Decision date:** 2026-07-27
**Provenance:** Confirmed **unanimously** by Grok + Gemini + ChatGPT (2026-07-27). Matches the repo's own earlier pivot handoff [`CURSOR_HANDOFF_video_clothing_swap_pivot.md`](../CURSOR_HANDOFF_video_clothing_swap_pivot.md) (dated **2026-06-21**, commit `228226f`) — the architecture an agent drifted from during Phase 2b. This document re-locks that decision so it cannot be re-litigated by drift again.

Referenced from the root [`CLAUDE.md`](../CLAUDE.md) → "LOCKED: Video garment-swap architecture" section, which every in-repo session auto-loads.

---

## 1. The one-line rule

**PRODUCTION PATH = Grok keyframe generation + temporal propagation.**

**Do NOT** scale independent per-frame VTON / `switchx-restyle` to full-length videos. Per-frame VTON is a **baseline/diagnostic tool only** (see §5).

---

## 2. Why (the failure mode that keeps returning)

Single-image engines — `switchx-restyle`, `vton-frame`, and any still-image VTON — have **no temporal state**. They sample each frame independently. Independent per-frame sampling produces **"boiling" / flicker**: the garment, folds, stripe, and edges shimmer and mutate frame-to-frame because nothing ties frame *N* to frame *N-1*.

Two things that are **NOT** a fix for this, and must not be confused with one:

- **"Reference-lock"** fixes only the *target garment* the engine is asked to apply. It constrains *what* garment appears, not *temporal consistency* across frames. A reference-locked per-frame pass still boils.
- **Masked-lock (Phase 2c)** is **ORIGINAL-FOOTAGE PRESERVATION** — it pins face / scene / background / body from the real footage so those regions are not regenerated. It is **NOT** garment-region temporal stabilization. It reduces damage outside the garment; it does nothing for flicker *inside* the swapped garment.

Temporal consistency is a property only a system with cross-frame state can provide: optical-flow propagation, a video-native model, or a keyframe-anchored transfer. That is the entire reason for the locked lane below.

---

## 3. The locked lane

```
approve a few product-accurate Grok HERO keyframes
   (every ~12–24 frames, and at every pose change / scene cut)
      → PROPAGATE the approved garment across intermediate frames
           via optical flow (RAFT / EbSynth-style)
           OR a video-native VTON / video-to-video model
      → RE-ANCHOR a new Grok keyframe when flow confidence breaks
           (large rotations, occlusions, cuts)
      → COMPOSITE onto the ORIGINAL footage
      → keep the deterministic brand/logo composite for stripe/logo
      → face-restore as a safety net
```

Element by element:

1. **Grok hero keyframes.** Human-approved, product-accurate keyframes. Cadence: roughly every 12–24 frames, plus one at every pose change and every scene cut. These are the ground truth the rest of the clip inherits.
2. **Propagate, don't regenerate.** Carry the *approved* garment across the intermediate frames — never re-synthesize the garment from scratch per frame. Propagation is via optical flow (RAFT / EbSynth-style warping) **or** a video-native VTON / video-to-video model (see §6 benchmark).
3. **Re-anchor on flow break.** When optical-flow confidence collapses (large rotation, occlusion, cut), stop propagating from the stale keyframe and generate a fresh Grok keyframe to re-anchor.
4. **Composite onto original footage.** The swap is composited back onto the real footage so face, scene, body, lighting, and motion are the genuine source, not a hallucination.
5. **Deterministic brand/logo layer.** The existing placement engine + perspective-warp composite handles stripe / logo / zipper / collar as **real tracked pixels** — never trusted to diffusion.
6. **Face-restore safety net.** Identity insurance after compositing, not a primary identity mechanism.

---

## 4. Phase map

| Phase | What it is | Status |
|-------|-----------|--------|
| **Phase 2b** | Independent per-frame garment swap (each frame sampled independently) | **BASELINE / DIAGNOSTIC ONLY.** Never the full-length production path. |
| **Phase 2c** | Masked-lock = original-footage preservation (pins face/scene/body) | Preservation of *non-garment* regions. **NOT** garment temporal stabilization. |
| **Production** | Grok keyframe + temporal propagation (§3) | **The locked path.** |

### Phase 2b — what to keep vs. what not to do

Phase 2b (independent per-frame swap) is a **baseline and diagnostic**, useful for measuring what "no temporal state" looks like and for exercising infrastructure. **Keep its reusable infra:**

- frame extraction
- ordered / indexed frame storage
- Fal routing
- bounded concurrency
- per-frame status tracking
- reassembly (FFmpeg, preserve audio/timing)

**Never** promote Phase 2b to the full-length production path. Its infra feeds the locked lane; its per-frame-independent *method* does not.

---

## 5. Benchmark BEFORE building the full pipeline

Do not build the full-length pipeline before running a head-to-head on a **short clip**. Two lanes:

- **Lane A — Grok keyframe + propagation:** approved Grok hero keyframes + optical-flow / EbSynth-style propagation across intermediates.
- **Lane B — video-native VTON / v2v:**
  - `fal-ai/kling/v1-5/kolors-virtual-try-on`
  - `fal-ai/fashn/v1.5`
  - Wan2.1 / Kling video-to-video with pose control

Pick the winner on a short clip against the kill criterion (§7). Do not scale either lane before one wins.

---

## 6. Engineering prerequisites (before ANY full-length run)

These are hard prerequisites. A full-length run without them is not authorized.

1. **No fail-fast.** Replace "one bad frame kills the job" with **per-frame / per-chunk persisted status + retries + resume + skip-completed.**
2. **Durable job queue.** Replace `EdgeRuntime.waitUntil` with a **durable chunk job queue** — long jobs must survive worker restarts.
3. **Normalize output filename/format.** The code currently names everything `.jpg`. Normalize filename + format handling so the true encoding is recorded and honored.
4. **Reproducibility metadata per run.** Record: model, version, prompt, reference-asset hash/version, mask version, seed, transfer mode. A run you cannot reproduce is a run you cannot debug or defend.

---

## 7. Kill criterion (the short 2–4s test)

Run a short **2–4 second** test first. **STOP and redesign before scaling** if it cannot simultaneously hold:

- **Fendi's identity**
- **Exact jacket construction**
- **Stripe / logo placement**
- **Natural occlusion**

…**without visible flicker or morphing.**

If the short test fails any of these, do **not** scale to full length. Redesign first.

---

## 8. Do-not-drift checklist

- [ ] Not scaling independent per-frame VTON / `switchx-restyle` to full video.
- [ ] Not treating "reference-lock" as a temporal-consistency fix.
- [ ] Not treating masked-lock (2c) as garment stabilization — it is original-footage preservation.
- [ ] Grok keyframes approved before propagation.
- [ ] Propagating the approved garment, never regenerating per frame.
- [ ] Compositing onto original footage; deterministic brand layer + face-restore in place.
- [ ] Benchmarked Lane A vs Lane B on a short clip before full build.
- [ ] Engineering prereqs (§6) all done before any full-length run.
- [ ] Short 2–4s test passed the kill criterion (§7) before scaling.

---

*If this decision is ever superseded, do it explicitly and dated in this file — never by a silent drift in runtime code or in a new handoff. See the June-21 pivot handoff [`CURSOR_HANDOFF_video_clothing_swap_pivot.md`](../CURSOR_HANDOFF_video_clothing_swap_pivot.md) for the original rationale.*
