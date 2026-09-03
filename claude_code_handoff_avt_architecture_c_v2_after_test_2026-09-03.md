# Handoff — Architecture C after V2 paid test (2026-09-03)

**Audience:** ChatGPT (architecture / review). Cursor executes next; Claude does **not** spend or rewrite the frozen prompt.  
**Repo:** `github.com/fendifrost-dot/ai-video-tool` · branch **`main`** · tip at write: `1236bd8` plus this commit.  
**Live:** `aivideotool.lovable.app` · Lovable `bd21b544-c7b8-4780-bdde-391ac9d4bfa8` · DB `qoyxgnkvjukovkrvdaiq`  
**Related:** [`docs/ARCHITECTURE_C_V2_VERDICT.md`](docs/ARCHITECTURE_C_V2_VERDICT.md) (freeze V2). Fendi will return with execution steps after this review.

Evidence: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## 1. What happened after the last test

The last **paid** Architecture C product call was Frozen Prompt **V2**:

| | |
|--|--|
| Request | `9d47bd2f-c220-98a4-a281-f1499b8ae7f4` |
| Cost | **$0.32** (one call) |
| Spend | **$12.48 → $12.80** / $20 · 31 → 32 generations |
| `project_assets` | `f31bd0f2-884f-42e1-8b08-aa645597b7a6` |
| Type | `edited_clip` · `prompt_version: v2` · `source_tool: null` |
| Parent | `76fe7438-671d-4428-a7f6-17a45e98c16f` (canonical Fendi source) |
| Storage | `project-clips/3ca10935-…/764a63d2-…/grok-video-edit/9d47bd2f-….mp4` |

**[VERIFIED]** Product plumbing that failed on V1 (`944b9875-…`, `assetId: null`) is closed: persist insert omits invalid `source_tool: "grok_video_edit"` (not in `provider_name` enum; Postgres `22P02`). Review board showed the new clip. In-product dry-run was 15/15 before the paid click.

**[DECISION]** Frozen Prompt V2 stays the **generation baseline**. No V3 construction prompt. No further billed `/v1/videos/edits` for this jacket until Fendi explicitly re-opens spend.

Git already on `main` for that freeze: `GROK_VIDEO_EDIT_PROMPT = GROK_VIDEO_EDIT_PROMPT_V2`. Identity + Polo-exclusion sentences unchanged.

---

## 2. Split the score (do not mix)

Claude called the run a **PASS**. Fendi did not. Cursor split:

| Surface | Verdict | Label |
|---------|---------|--------|
| Dry-run gate, paid edits, `edited_clip` persist, Review handoff | **PASS** | **VERIFIED** |
| Identity + scene (face, beard, glasses, cap, closet, lighting, performance) | **PASS** | **OBSERVED** (Claude; Fendi did not dispute) |
| Garment **zero-deviation** vs SL flat ref | **NOT a pass** | **OBSERVED** (Fendi): wordmark; sleeve stripe location/formation |

Zero-deviation is the **target**, not a claim Grok is pixel-perfect. Plumbing PASS ≠ garment PASS.

**Named remaining defects (keep these):**

1. **Wordmark still gibberish** — 5th consecutive observation → deterministic `logo_zone`.
2. **Navy sleeve/side panels wrong** — ref is vertical shoulder→cuff; V2 is a **horizontal navy ring** around the biceps, continuous with the chest band. Cream pinstripe runs through chest **and** sleeve rings.
3. **New V2 artifact:** cream pinstripe bisecting the navy band (ref band is solid navy) → cover with real `chest_band` pixels.
4. Silhouette longer than cropped blouson → generation/escalation, **not** this repair slice.

**Not a named defect for this slice (flag only):** dark rectangular strap/hanging artifact at the front hem, visible in every candidate still.

**Collar causal story — rejected.** Claude argued an open jacket cannot carry a stand collar, so V1 unzipped caused the 0/10 collar. Fendi: an open jacket **can** have a propped collar. V1 already asked for unzipped **and** navy stand collar. V2 changed several clauses in one run. Standing collar on V2 is **OBSERVED**; “because zip closed” is **HYPOTHESIS**.

---

## 3. Withdrawn: compiler → V3 prose + paid run

Claude later proposed: garment-as-structured-data in `character_features.metadata_json` (no migration), a **compiler that emits V3**, and **one $0.32 run** to “validate the mechanism.”

Claude **withdrew** that second half after Cursor’s split. Cursor’s distinction stands:

| Keep | Do not do now |
|------|----------------|
| Structured garment data **for the deterministic repair layer** (band/panel/logo quads, orientation, extent) | A compiler that **emits Grok prose** |
| Reuse existing `placeDetail` / `product_details` / `product_truth` | A paid n=1 V3 on one jacket framed as “architecture” |

`character_features` already has `metadata_json`, `tags`, `dimensions_description`. That is **future** repair-layer schema work, not a reason to reopen Frozen Prompt V2.

---

## 4. Step 1 (still capture) — done by Claude, $0

Claude scanned 16 frames of the V2 clip. Candidates (native 720×1280 extracts, no reprocessing):

| Time | Role |
|------|------|
| **t = 0.785 s** | **Recommended.** Squarest to camera; chest closest to fronto-parallel; band edge-to-edge above crossed arms; both upper arms show the (wrong) navy ring; zip vertical; face clear. |
| t = 0.550 s | Alternate arm position |
| t = 1.020 s | Alternate arm position |

Claude reported files under `docs/research/results/2026-09-03-v2/repair-still-candidates/` — **that path is not in this Cursor checkout.** Fendi attached the three stills in chat. Treat **t=0.785s** as the repair keyframe unless Fendi says otherwise.

**Hard geometry limit [OBSERVED, Claude + stills]:** arms are **crossed for the entire clip**. No hanging-free arm. Visible sleeve is **armhole → elbow / upper arm**; forearm is foreshortened across the torso. A “vertical panel, armhole→cuff” quad is **not placeable** on this clip.

**[DECISION for Cursor step 3]** Define `sleeve_panel` only on the **visible upper-arm navy segment**. Prove the engine there. Do not invent cuff-length geometry. Tracking may extend later; this clip cannot validate full armhole→cuff.

---

## 5. What the repo can do today (repair layer)

**[VERIFIED] wiring:**

- `placeDetail` (`src/lib/garment/placementEngine.ts` + edge mirror) already has `sleeve_panel` in the registry. Detection is **`detectStub`** → `requires_manual_keyframe` (no guess). Manual keyframe is priority 1.
- Production **consumer** of `placeDetail` is **`compositeLogoOntoVton`** only (`wardrobe-vton-proxy`), `detailType: "logo_zone"`. There is **no** `compositeSleevePanelOntoVton` (or chest-band cover) wired to a video/still repair button.
- UI: `LogoPlacementEditor` = SKU bbox on the **front flat**. `ManualKeyframeQuadEditor` = 4-corner quad, currently copy/wired for **logo on VTON** and **eyewear** on Hero Frame — not a `sleeve_panel` keyframe on an `edited_clip` still.
- `product_details` / `upsertLogoProductDetail` persist **wordmark/logo**, not sleeve panels.

So “deterministic repair” is the right lane, but **step 2–3 still need product wiring**, not another Grok call.

---

## 6. Suggested next steps — ChatGPT

Please **review and lock** (or push back) before Fendi gives Cursor execution orders. Class C if you authorize video tracking / new composite onto masters; still-only logo+sleeve keyframe on existing engines can stay smaller if you keep it inside current `placeDetail` + existing storage buckets.

**Ask ChatGPT to confirm:**

1. **Freeze V2.** No compiler-emitted V3. No spend. Structured specs feed **repair**, not Imagine.
2. **Still-first sequence** (Cursor’s directive):
   1. Repair **logo_zone + chest_band** on the **t=0.785s** still inside AVT (cover garbled wordmark + cream pinstripe on chest). Stop if that still fails.
   2. **`sleeve_panel` manual quads only** on the **visible upper-arm segment** (left/right as placeable). Warp **flat-ref** navy panel pixels (`2a14a72b-e7de-4ecb-9c24-4142b672d175.jpg` / garment `0feb028f-…`). Do not un-stub detection by guessing.
   3. **Then** propagate those quads across the V2 clip (optical flow / existing placement-propagation design). No per-frame Grok.
   4. **Later:** SAM-3 garment mask + composite onto original master `76fe7438-…` (identity/scene already held; this is production hygiene, not the logo/sleeve proof).
3. **Scope on this clip:** cream pinstripe on **sleeve rings** is in-scope if it sits in the sleeve-panel region being composited. Hem strap artifact is **out of band** unless the same region naturally covers it.
4. **Do not** treat silhouette/crop length as a brand-composite task.
5. If you want structured garment JSON now, specify a **repair-only** schema (detail types, orientation, extent, termination) that `placeDetail` can read — **not** a prompt compiler.

**Paid-call verdict for ChatGPT to restate:** `skip`.

---

## 7. Canonical IDs (unchanged)

| Item | ID |
|------|-----|
| Durable owner | `3ca10935-8c3d-4479-9a0c-8bfe8050840c` |
| Artist | `8d4a4d22-41c0-43ab-ba99-92750f81e335` |
| YSL project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| SL garment | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| Source clip | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| V2 edited_clip | `f31bd0f2-884f-42e1-8b08-aa645597b7a6` |
| V2 request | `9d47bd2f-c220-98a4-a281-f1499b8ae7f4` |
| Product route | `/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/hero-frame` |

**Do not:** migrate ownership, weaken RLS, change R4 flat-only refs, fire xAI, or ask Fendi to paste SQL.

**Publish ≠ edge redeploy.** No edge change is required until Cursor ships a new repair function.

---

## 8. Cursor hold

Fendi will return with next execution steps. Until then: **no code beyond this handoff**, no V3, no spend, no Lovable Agent coding.
