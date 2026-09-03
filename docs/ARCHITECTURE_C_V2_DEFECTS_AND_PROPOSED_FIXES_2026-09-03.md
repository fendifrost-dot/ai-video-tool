# Architecture C — V2 defects and proposed fixes (2026-09-03)

**Status:** Bridge handoff on `main` — Claude authored commit `1e05ea9` on
`docs/architecture-c-v2-defects-2026-09-03` but **could not push** (session
sources / credentials). Cursor reconstructed this file from Claude’s written
summary so ChatGPT and the still-repair runner have a reviewable register.
Replace with Claude’s verbatim body if Fendi pastes it later.

**Evidence base:** Frozen Prompt V2 request
`9d47bd2f-c220-98a4-a281-f1499b8ae7f4` · edited_clip
`f31bd0f2-884f-42e1-8b08-aa645597b7a6` · recommended still **t = 0.785 s** ·
flat SL ref on garment `0feb028f-dc4d-45dc-82ac-e4bbd16054b0`.

**Standing product lock (unchanged):** Freeze Frozen Prompt V2. No V3 spend.
Still-first `chest_band` + `logo_zone` → same-still `sleeve_panel` → temporal
only after still passes. See
[`ARCHITECTURE_C_CHATGPT_LOCK_2026-09-03.md`](./ARCHITECTURE_C_CHATGPT_LOCK_2026-09-03.md).

---

## 1. What V2 gets right

- Product identity / face / scene lane for Architecture C remains proven.
- Persist + Review path for `edited_clip` works after the enum fix (`a4056cb`).
- Arms-crossed geometry is stable across the clip → **t = 0.785 s** is the
  correct still for repair scoring.
- Frozen Prompt V2 already asks for **vertical sleeve panels** — the model
  failing to render them is a **capability gap**, not missing prose.

---

## 2. Defect register (A–F)

| ID | Defect (vs flat SL reference) | Class | Owner / lane | Prompt V3? |
|----|-------------------------------|-------|--------------|------------|
| **A** | Collar class wrong relative to open-jacket / stand-collar instruction conflict | Prompt instructed wrong | Tabled V3 wording only — **not applied** | Tabled |
| **B** | Zip / closure class wrong relative to V2 instruction | Prompt instructed wrong | Tabled V3 wording only — **not applied** | Tabled |
| **C** | Sleeve shows horizontal ring / wrong stripe instead of vertical panels | Capability gap | Deterministic **`sleeve_panel`** stage (manual quads, upper arm only) | **No** — do not “fix” via prompt |
| **D** | Cream / wrong fill on navy chest band | Garment geometry | Widened **`chest_band`** full-band navy repaint | No |
| **E** | Extraneous marks / noise in chest band (aside from intended wordmark) | Garment geometry | Same full-band repaint (erase in one pass) | No |
| **F** | Wordmark garbled / unreadable / wrong placement | Logo zone | After navy band: single wordmark, **wearer’s left** via `logo_zone` / `compositeLogoOntoVton` | No |

Additional OBSERVED (not lettered as prompt fixes): slightly longer silhouette /
hem — score on still; do not expand schema for it now.

**Reference truth for scoring:** flat product photo on SL garment row — not
Grok’s generative recollection.

---

## 3. Stage-1 repair state + widened chest-band scope

### Already on `main` (shipped)

| Piece | Location |
|-------|----------|
| Edge stages `logo_chest`, `sleeve_panel` | `supabase/functions/architecture-c-still-repair-proxy/` |
| Shared still helpers | `supabase/functions/_shared/architectureCStillRepair.ts` |
| Sleeve composite | `compositeSleevePanelsOntoStill` in `placementEngine.ts` |
| Client + query | `src/lib/heroFrame/architectureCStillRepair.ts`, `src/lib/queries/architectureCStillRepair.ts` |
| UI §7 | `ArchitectureCStillRepairRunner` on Hero Frame |
| Capture unblock | Prefer WebCodecs when element not ready; upload-still fallback (`3ea8a1d`) |

Hard stops remain: `temporalTrackingEnabled: false`; sleeve auto-detect stubbed.

### Widened chest-band scope (Claude → Cursor)

Current `logo_chest` composites a logo onto the VTON-ish still. Claude proposes
**widening** the chest pass so one repair erases D/E/F together:

1. **Full-band navy repaint** across the chest stripe (kill cream fill + band
   noise).
2. Then place **one** wordmark on **wearer’s left** only.

That is the next Cursor implementation slice for the runner — not a new Grok
call and not a generalized garment JSON schema.

### Four concrete Cursor items (runner)

1. Land / keep this defects register on `main` for ChatGPT review of §4.
2. Implement widened full-band navy chest repair **before** wordmark composite
   (or as an explicit sub-step of `logo_chest`).
3. Keep `sleeve_panel` manual-quad path for defect **C** only (visible upper
   arm; arms crossed).
4. Do not enable temporal tracking; do not spend on V3; score repaired still
   against flat ref at t = 0.785.

---

## 4. ChatGPT decision — collar / zip (tabled, not applied)

Claude drafted exact proposed V3 wording for collar and zip (defects A/B) and
**explicitly did not apply** it to any live prompt or spend path.

**Default while ChatGPT reviews:** leave Frozen Prompt V2 frozen. Still-first
deterministic repair remains the only active path. Applying A/B prose would be
a Class C product decision + explicit spend approval — out of scope until
ChatGPT says otherwise.

---

## 5. Sequence

1. Human: Publish frontend (capture/upload fix) if not already live.
2. Capture or upload still at **t = 0.785 s** from V2 edited_clip.
3. Run **`logo_chest`** (after Cursor lands widened full-band navy + wordmark
   wearer’s left).
4. On same still, run **`sleeve_panel`** (manual quads, upper arm only).
5. Score vs flat SL reference. Pass/fail before any temporal work.
6. ChatGPT: confirm widened chest scope; keep or reject tabled A/B V3 wording.
7. **SKIP** any new paid Grok video edit until still repair passes.

---

## Provenance

| | |
|--|--|
| Claude unreachable commit | `1e05ea9` on `docs/architecture-c-v2-defects-2026-09-03` (local sandbox only) |
| Bridge author | Cursor Cloud Agent |
| Why bridge | Claude: readable clone, not writable push (session sources / no creds on VM) |
| Related | [`ARCHITECTURE_C_V2_VERDICT.md`](./ARCHITECTURE_C_V2_VERDICT.md), ChatGPT lock, Claude after-test handoff |
