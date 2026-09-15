# Astra / Premiere finishing architecture

**Lane F · 2026-09-15 · $0 · isolated from Architecture C**  
**Work-order:** [#57](https://github.com/fendifrost-dot/ai-video-tool/issues/57) · **Umbrella:** [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50) lane 6

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Verdict

**[DECISION]** Finish in Premiere. Keep edit decisions in AVT. Use a Premiere UXP panel for every repeatable, API-addressable step. Treat GPT-6 Astra computer-use as a **gated visual-only runner**, disabled until Fendi approves the RED list. Do not let Astra recut, regenerate, or touch Architecture C.

**[DECISION]** This lane does **not** replace the existing ZIP / FCPXML handoff, does **not** build a Premiere-like UI inside AVT, and does **not** wait on in-app ffmpeg / Remotion final-master rendering.

---

## What this lane is (and is not)

| In scope | Out of scope |
|----------|----------------|
| How an **approved AVT cut** leaves the app and gets finished in Premiere | Architecture C chest still / garment repair |
| Minimum **controlled** computer-use + UXP harness | Temporal propagation, sleeve R&D, original-master reconstruction |
| Cost / approval gates before any paid Astra, plugin, or live desktop session | Productization job-graph (umbrella lane 7) |
| After Effects named only as a **later** optional step | `fendi-control-center`, proxy auth, PR #37, V3 / paid Grok |

**[DECISION]** Isolation rule: no files under `src/lib/heroFrame/`, `src/lib/garment/`, `src/components/video/ArchitectureC*`, or `supabase/functions/*architecture-c*` are in this lane. Finishing consumes **already-approved clips** the same way today's export ZIP does.

---

## What already exists (do not rebuild)

**[VERIFIED]** AVT already has a working Premiere handoff. The gap is **controlled finishing after import**, not a missing NLE package.

| Surface | Path | Status |
|---------|------|--------|
| Timeline manifest (frame-based, schema v1) | `src/lib/export/timelineManifest.ts` | Live serializer |
| FCPXML 1.8 | `src/lib/export/fcpxml.ts` | Imports into Premiere / Resolve |
| CMX3600 EDL (lossy fallback) | `src/lib/export/edl.ts` | Optional |
| Client ZIP (`premiere_ready/`) | `src/lib/export/buildPackage.ts` | Live export page |
| Export UI | `src/pages/ExportPage.tsx` | Premiere / Resolve / Remotion checkboxes |
| `premiere_export` / `ae_asset` asset types | `src/lib/queries/projectAssets.ts` | Round-trip taxonomy already exists → `project-exports` |
| Premiere UXP stub | `src/lib/automation/premiereUxp.ts` | `connect` + `importFcpxml` only; **not implemented** |
| NL timeline commands stub | `src/lib/automation/nlTimelineCommands.ts` | In-app edit commands; **not** Premiere |
| Remotion draft scaffold | `src/lib/export/remotion/` | Draft preview, not finishing |
| In-app final MP4 | `docs/timeline_assembly.md` | Designed, **not scheduled** while Remotion draft is the preview path |

**[VERIFIED]** `premiere_ready/README.md` already tells an editor: import `timeline.fcpxml`; clips resolve relative to `../approved_clips/`.

**[VERIFIED]** Architecture review (`cursor_handoff_avt_video_editor_architecture_review.md`, 2026-06-10) already said: do not build Premiere-like UI before a command layer; Premiere UXP is **future**. That still holds.

---

## What Astra is (public, not a production contract)

**[OBSERVED]** September 2026 public reports (Higgsfield + After Effects; Eric Ker + Premiere Pro) describe **GPT-6 Astra** as a computer-use agent that can click through Adobe NLEs and recreate or clean up an edit from a prompt. Source: [Nackblog 2026-09-08](http://jnack.com/blog/2026/09/08/gpt-astra-driving-ae-premiere-pro/).

**[HYPOTHESIS]** Astra has no stable, documented Premiere API. It is a **desktop operator**, not a sequencer SDK. Treating it as an editor-of-record would make AVT's timeline_manifest a suggestion instead of a contract.

**[OBSERVED]** Adobe also has first-party / partner in-app panels (e.g. Runway for Premiere / AE, announced 2026-09-08). Those are **paid generation surfaces** inside the NLE. They are a different threat (spend + garment/identity drift) and are **not** the finishing path unless Fendi later approves a RED item.

**[DECISION]** Astra is optional capacity for *visual* operations that UXP cannot address. It is never the source of shot order, trims, approved clip IDs, or brand-layer pixels.

**[DECISION]** Execution-manager note (2026-09-15): Astra is **reachable** via Fendi's existing OpenAI API access. That is **not** spend approval. This lane may cite the access path in research docs only. It must not create billed computer-use jobs, open a live Premiere session, store or request the key, or enable `astra.enabled` until RED-F1 / RED-F10.

---

## Recommended stack (three layers)

```
AVT  (edit-of-record)
 │   timeline_manifest.json + approved clips + audio
 │   existing ZIP: premiere_ready/timeline.fcpxml
 ▼
Layer 1 — Deterministic Premiere ingest          [$0 today]
 │   Human or UXP: import FCPXML, relink media, open sequence
 ▼
Layer 2a — UXP finishing recipe                  [$0 if CC already licensed]
 │   Allowlisted: bins, beat markers, LUT apply, AME queue
 │
Layer 2b — Astra visual runner                   [PAID · RED · DISABLED]
 │   Plan → Fendi approve → allowlisted visual steps only
 ▼
Layer 3 — Round-trip                             [existing asset types]
     Finished master + sidecar → project_assets.premiere_export
```

### Layer 0 — AVT owns the cut

**[DECISION]** `timeline_manifest.json` remains the source of truth for:

- shot / clip order and tracks
- frame-accurate trims and cut types
- approved `asset_id`s
- BPM / beat markers / song sections
- named `color_profile_id` / `vfx_profile_id` **references** (not the grade itself)

**[DECISION]** FCPXML is the **import contract**, not a second editor. If FCPXML and the manifest disagree, the manifest wins and FCPXML is regenerated from AVT. Do not let Astra “fix” the sequence by recutting.

**[RECOMMENDATION]** Lane 7 (orchestration) should treat “export package built” as the only finishing precondition. Finishing must not wait on chest-still merge.

### Layer 1 — Deterministic ingest (production path today)

**[VERIFIED]** A human can already: Export page → ZIP → unzip on the finishing volume → Premiere File → Import `premiere_ready/timeline.fcpxml` → confirm media links.

**[DECISION]** This remains the **default production path**. No Astra, no new Adobe plugin, no paid API.

**[RECOMMENDATION]** When a UXP panel exists, Layer 1 becomes one allowlisted command (`import_fcpxml` + `import_media_folder`) with UI suppressed. Same bytes, less clicking.

### Layer 2a — UXP finishing (preferred automation)

**[OBSERVED]** Premiere UXP (`Project.importFiles`, sequence APIs, `EncoderManager.exportSequence`, FCPXML export) can cover the repeatable ops without computer-use. ExtendScript / CEP still works on current builds but Adobe is moving to UXP; **do not start a new CEP panel**.

**[DECISION]** v1 UXP allowlist (and only these):

| Command | Why it is UXP, not Astra |
|---------|---------------------------|
| `import_fcpxml` | Deterministic sequence from AVT |
| `import_media_folder` | Relink `approved_clips/` + `audio/` |
| `create_bins` | Mirror AVT shot numbers |
| `add_markers_from_beats` | Copy `audio.beat_markers` / song sections |
| `apply_lut` | Only if a project `lut` asset is already in the ZIP |
| `queue_ame_export` | Locked local `.epr` preset, no cloud encode |
| `write_sidecar` | JSON log next to the master |

**[DECISION]** UXP must run with `suppressUi: true` and must **refuse** any command that opens a modal, deletes media, or writes outside the finishing workspace.

### Layer 2b — Astra visual-only (disabled)

**[DECISION]** Astra may only run commands tagged `runner: "astra"` after a human-approved plan. v1 visual allowlist is intentionally tiny:

| Command | Intent |
|---------|--------|
| `capture_screenshot` | Plan evidence only |
| `astra_visual_adjust` | One named look (e.g. “match reference still X on titles”) with a max-step cap |

Astra **must not**:

- change clip order, trims, or speed
- replace, regenerate, or restyle footage (no Runway / Higgsfield / Grok / Fal from this runner)
- open Architecture C UI, still-repair, or wardrobe tools
- leave the finishing workspace
- call any paid API on its own

See [CONTROLLED_HARNESS_DESIGN.md](./CONTROLLED_HARNESS_DESIGN.md).

### Layer 3 — Round-trip

**[VERIFIED]** `premiere_export` already maps to the `project-exports` bucket. Finishing should drop:

1. The master file (H.264 or whatever the locked AME preset says)
2. `finishing_sidecar.json` (recipe id, actions, export path, operator, runner used)

**[RECOMMENDATION]** Ingest is a **human upload** until Lane 7 defines an automated job. Do not add a new storage bucket or edge proxy for this.

---

## What Premiere should do vs what AVT should keep

| Job | Owner | Why |
|-----|--------|-----|
| Approve clips, trims, order, beats | **AVT** | Already in timeline_manifest |
| Garment / identity / Architecture C | **AVT (other lanes)** | Hard lock; finishing must not restyle |
| Draft preview | **Remotion scaffold** | Existing; not a master |
| Sequence import, bins, markers, LUT, AME | **Premiere UXP** | Native, $0 incremental |
| Subjective titles / polish with no API | **Astra, gated** | Only if UXP cannot do it |
| Color science beyond a named LUT | **Human in Premiere** | Do not invent a grade model |
| AE / Higgsfield cleanup | **Later, RED** | Not v1 |

**[DECISION]** Resolve stays a **parallel export target** (`resolve_ready/`). Lane F does not build a Resolve harness. If Fendi later wants Resolve color, reuse the same recipe schema with a different runner — do not fork.

---

## After Effects

**[DECISION]** AE is **out of v1**. Name it so it cannot sneak in as “just Astra.”

A later AE step would be a new recipe (`host: "after_effects"`) with its own RED items (Higgsfield spend, AE project templates, computer-use on a second app). Until then, `ae_asset` remains an upload type only.

---

## Failure / kill criteria

Stop and redesign (do not “just add more Astra steps”) if any of these happen:

1. Astra recuts or replaces media that the manifest already decided.
2. A finishing run calls a generative provider (Grok, Fal, Runway, Higgsfield) without a dedicated RED approval.
3. The harness writes outside the finishing workspace or touches iCloud / Architecture C paths.
4. FCPXML import is abandoned in favor of “Astra builds the sequence from a prompt.”
5. Finishing work blocks chest-still, sleeve, or temporal lanes (shared files, shared review, or merge pressure).

---

## Relationship to other #50 lanes

| Lane | Contract from Lane F |
|------|----------------------|
| 1–2 Architecture C / sleeve | **None.** Finishing reads approved clips only. |
| 3 Temporal | Finishing consumes assembled clips if/when they exist; no API coupling. |
| 4 Original-master | Finishing may *receive* a restored master as an approved clip. It must not reconstruct. |
| 5 Eval / benchmark | Optional later: score a finished master vs the AVT cut (sync, duration). Not required to close #57. |
| 7 Orchestration | Input: `export_package` with `premiere_ready/`. Output: `premiere_export` asset + sidecar. |

**[DECISION]** Lane F is **non-blocking**. Current AVT engineering continues to use the existing Export page. Nothing in this folder is required for chest-still or provider work.

---

## What would cost money (do not spend)

Documented in [RED_ITEMS.md](./RED_ITEMS.md). Headline:

- Astra / OpenAI computer-use sessions
- Any live desktop session on Fendi's workstation
- In-NLE generative plugins (Runway, Higgsfield, Firefly)
- Extra Adobe seats / cloud encodes
- **Forbidden even with a finishing excuse:** V3 / paid Grok, Control Center edits, proxy auth widening

This research took **$0**. No computer-use session, no Adobe plugin install, no paid API.

---

## Done shape for #57

1. This document = finishing architecture recommendation.
2. [CONTROLLED_HARNESS_DESIGN.md](./CONTROLLED_HARNESS_DESIGN.md) = minimum harness.
3. [RED_ITEMS.md](./RED_ITEMS.md) = approval gate.
4. Optional PR: docs + `finishingRecipe` / `finishingHarness` scaffolding only.
