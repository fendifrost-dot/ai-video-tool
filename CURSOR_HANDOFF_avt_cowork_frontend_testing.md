# Claude Cowork handoff — Live test: SAM-3 → Grok + face restore

**Date:** 2026-07-23  
**Audience:** AI Video Tool Claude Cowork (browser agent)  
**Live app:** https://aivideotool.lovable.app/  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool  
**Project:** YSL (Ice On) — `764a63d2-93cd-44f3-905f-292f14ab2f51`

**Architecture doc:** `docs/AVT_masked_garment_swap_LOCKED.md`  
**Prior product handoff:** `CURSOR_HANDOFF_full_outfit_guarded_grok.md`

---

## Hard rules

1. **Full browser tooling** — navigate, click, type, screenshot. Do not stop because “page never idle.”
2. **Frontend live UI only** — drive the app. No sandbox image processing. No “I’ll check logs instead of running the button.”
3. **Canonical path = SAM-3 → Grok → lock → face restore**  
   Button: **Run SAM-3 → Grok full outfit** (Hero Frame Studio §3b).  
   **Not** Guarded Grok / flux. **Not** jacket-only. **Not** VTON as the outfit engine.
4. **Pose / body restore is NOT in scope for this test** — it is not built yet. Do not invent a pose tool. Only grade whether pose already looks locked from the SAM-3 lock step.
5. **Lovable = publish / redeploy only.** No ad-hoc Lovable code edits.
6. Product bugs get evidence: screenshot + URL + what you clicked + approximate wait time.

---

## BLOCKER before any click — code must be live

As of handoff write-up, the rewrite was **local / uncommitted** on Cursor’s machine. Prod will still show **Guarded Grok** until this lands.

### Preflight (ops — do in order)

1. Confirm `main` (or the branch Fendi names) contains:
   - `sam3-segment-proxy`
   - Hero UI: **3b · SAM-3 → Grok · Full outfit (primary)**
   - Button label: **Run SAM-3 → Grok full outfit**
2. **Git:** commit + push if not already on remote (ask Fendi / Cursor if missing).
3. **Lovable:** Publish frontend from that commit.
4. **Supabase / Lovable edge:** Deploy **`sam3-segment-proxy`**  
   Secrets already used by wardrobe-vton (must be present on AVT):
   - `COMPOSE_LOOK_CC_URL`
   - `SWITCHX_PROXY_SECRET` (or `COMPOSE_LOOK_PROXY_SECRET`)
5. **UI sync check:** open Hero Frame — if you still see **Guarded Grok** as §3b primary, **STOP**. Publish/redeploy is incomplete. Do not test the old path as if it were this handoff.

---

## What you are grading (this session)

| Step | Tool | Pass criteria |
|------|------|----------------|
| 1 Mask | SAM-3 via SwitchX `segment-image` | Run progresses past `mask:` without `sam3_segment_failed` |
| 2 Swap | **Grok** | Full outfit actually changes to the selected wardrobe look |
| 3 Lock | Hero·(1−α)+Grok·α | Face / pose / background read as the hero frame outside clothing |
| 4 Face restore | Deterministic `faceRestore` | UI shows “Real face composited…” **or** an honest skip reason — not a silent wrong face |

**Out of scope:** picking or running a pose/body restore tool.

---

## Live test plan

### A — Smoke
1. https://aivideotool.lovable.app/ signed in.
2. Open **YSL (Ice On)** → Assets loads → **Hero Frame** opens.
3. Confirm §3b title/button match **SAM-3 → Grok** (see preflight).

### B — Capture
1. Prefer a decodeable clip (`hero_clip_hd_1080.mp4` / h264). Real camo subject (`IMG_5633` lineage) if available.
2. Scrub to a clear full-body / three-quarter frame → **Capture hero frame**.
3. Pick wardrobe look / full outfit ref (not a random unrelated jacket if the goal is the known target look).

### C — Primary run (the test)
1. Click **Run SAM-3 → Grok full outfit**.
2. Watch progress phases if shown: `mask` → `garment` → `lock` → `face` → `done`.
3. Wait through Grok (can be several minutes). Do not abandon at first spinner.
4. When complete, screenshot the result.

### D — Grade (write this in your report)

For each bullet: **PASS / FAIL / SKIP** + one sentence evidence.

1. **Outfit swap (Grok):** Did the clothing become the target look? (This is the main bar.)
2. **SAM-3 / lock:** Do face, hands, pose, background look like the captured hero outside the clothes?
3. **Face restore:** Exact face from hero? Or skip message? Screenshot either way.
4. **Pose drift note (observation only):** Did Grok move arms/stance such that clothing looks wrong on the body?  
   - If yes → report as **pose-restore needed** (do not build anything).  
   - If no → report **pose already acceptable after lock**.
5. **Failures:** exact error toast / UI text; phase stuck (`mask`, `garment`, `lock`, `face`); approximate elapsed time.

### E — Optional comparison (only if primary PASS or clear FAIL)
Do **not** burn the session on matrix unless Fendi asks. Primary §3b is enough.

---

## Known failure modes → what to report

| Symptom | Likely cause | What to write |
|---------|----------------|---------------|
| UI still says Guarded Grok | Not published / old bundle | STOP — deploy incomplete |
| `sam3-segment-proxy` / `sam3_segment_failed` | Edge not deployed or CC secret / segment-image | Status + toast text |
| Grok completes but outfit unchanged | Wrong wardrobe ref / prompt | Screenshot before/after + garment selected |
| Outfit good, face wrong, no “composited” line | Face restore refused | Exact `Face composite skipped — …` text |
| Outfit good, limbs/stance wrong | Pose restore gap | “pose_restore needed” + screenshot |

---

## Do not

- Treat VTON / flux / Guarded Grok as the fix for a bad Grok outfit.
- Build or pitch pose-warp in this session.
- Call SwitchX Beeble wardrobe mode as the outfit engine.
- Mark the test PASS if the outfit did not change.

---

## Report format (return to Fendi / Cursor)

```
## SAM-3 → Grok live test

Preflight: UI shows SAM-3→Grok primary? yes/no
Deploy notes: …

Result: PASS / FAIL / BLOCKED
Elapsed: ~N min

1. Outfit (Grok): PASS/FAIL — …
2. Lock (face/pose/bg): PASS/FAIL — …
3. Face restore: PASS/FAIL/SKIP — …
4. Pose observation: ok / needs restore — …

Screenshots: [attach]
Next: (one line — e.g. “ready for pose-tool shortlist” or “redeploy sam3-segment-proxy”)
```
