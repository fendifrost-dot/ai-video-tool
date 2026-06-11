# Architecture Review: AI-Native Video Editor (Creative OS Phase 2)

**Status:** ✅ Approved — **Editor Core Engine** in execution (Step 2 started)  
**Companion docs:** `VIDEO_EDITOR_ARCHITECTURE.md`, `cursor_handoff_avt_product_catalog_migration.md`  
**Repo:** `fendifrost-dot/ai-video-tool`  
**Date:** 2026-06-10

---

## Executive summary

The VIDEO_EDITOR_ARCHITECTURE spec is **directionally correct** and largely **compatible** with what is already built. The repo is not starting from zero — it has timeline manifests, items, BPM/song structure, storyboard linkage, hybrid `project_assets`, Remotion/Premiere/Resolve export scaffolds, and clip review.

**The gap is not schema — it is editor UX and manifest-first discipline.**

| Area | Today | Spec wants |
|------|-------|------------|
| Source of truth | **Dual:** `timeline_items` rows + `manifest_json` snapshot on save | Manifest owns everything; UI is a view |
| Editor UI | List-based “Music Video Editor” | Multi-track canvas + preview + inspector |
| Agent API | Stub (`nlTimelineCommands.ts`) | Every UI action = command |
| Render | Client ZIP + Remotion **scaffold** | Server `render_jobs` → Remotion output |
| Tracks | `timeline_items.track` text (`"V1"`) | Typed tracks with mute/solo/lock/volume |

**Recommendation:** Proceed with spec build order **Steps 2→5 before Step 6 UI**. Do not add parallel timeline systems. Align with Product Catalog migration (products become manifest metadata in Phase 2+).

---

## Spec principles — agreement

| Principle | Verdict |
|-----------|---------|
| AI-native (humans + agents) | ✅ Adopt — drives command layer before canvas UI |
| Manifest as source of truth | ✅ Adopt — requires refactor of current dual-write |
| No hidden UI state | ✅ Adopt |
| Hybrid footage first-class | ✅ Already supported at asset layer |
| Editor never renders directly | ✅ Adopt — add `render_jobs`, keep export pipeline |
| Storyboard/shot narrative context | ✅ Already on `timeline_items` |

---

## What already exists (reuse)

### Database (do not recreate)

| Spec table | Current state | Action |
|------------|---------------|--------|
| `timeline_manifests` | ✅ Exists — `manifest_json`, `version_number`, `frame_rate`, `export_status` | **Extend** |
| `timeline_items` | ✅ Exists — frames, trim, transitions, `storyboard_node_id`, `shot_id`, `asset_id`, `track` text | **Extend** |
| `timeline_tracks` | ❌ Missing — track = text column | **Add** (Step 3) |
| `timeline_versions` | ⚠️ Partial — `version_number` only, no author/agent log | **Add** (Step 2) |
| `timeline_reviews` | ⚠️ Partial — `clip_reviews` per **asset**, not per export/version | **Add** or extend |
| `render_jobs` | ❌ — export is client-side ZIP | **Add** (Step 7) |
| `render_outputs` | ⚠️ Partial — `export_packages.file_url` | **Extend** `export_packages` or add join |
| `caption_tracks` | ⚠️ — `text_overlays_json` on items | **Defer** — manifest JSON first |
| `effect_presets` / `transition_presets` | ⚠️ — `style_profiles` (color/vfx) + `cut_type` enum | **Extend** `style_profiles` or add presets table later |

### Manifest JSON (already rich)

`src/lib/export/timelineManifest.ts` defines `TimelineManifestJson` (schema_version 1):

- `audio` — BPM, beat markers, song sections from `song_analyses`
- `timeline[]` — per-clip frames, trim, speed, transitions, color/vfx profile IDs
- Storyboard + shot context embedded per item
- `export_targets` — premiere / resolve / remotion flags

**Spec example** (`tracks`, `markers`, `captions` top-level) differs slightly from current shape (`timeline[]` flat list). **Evolve to schema_version 2** — do not fork a second manifest format.

### Code paths to extend

| Module | Path | Notes |
|--------|------|-------|
| Timeline page (list UI) | `src/pages/TimelinePage.tsx` | Replace incrementally; keep seed/save flows |
| Manifest builder | `src/lib/export/timelineManifest.ts` | Source of truth serializer |
| Seed from storyboard | `src/lib/timeline/seedTimeline.ts` | Storyboard → items |
| Item CRUD | `src/lib/queries/timelineItems.ts` | Wrap with command layer |
| Manifest CRUD | `src/lib/queries/timelineManifests.ts` | `usePersistTimelineManifestSnapshot` |
| Export ZIP | `src/lib/export/buildPackage.ts` | Premiere/Resolve/EDL/CSV |
| Remotion scaffold | `src/lib/export/remotion/buildRemotionExport.ts` | Not server render yet |
| Review | `src/lib/queries/clipReviews.ts` | Per-clip; not timeline-version review |
| BPM / song | `song_analyses`, `SongStructureEditor` | ✅ Spec “BPM Intelligence Layer” |
| Assets (hybrid) | `project_assets`, `AssetLibraryPage` | AI + upload; no editor-embedded library panel |
| Agent stub | `src/lib/automation/nlTimelineCommands.ts` | Replace with real command registry |
| Premiere UXP stub | `src/lib/automation/premiereUxp.ts` | Future |

### Workflow alignment

**Spec workflow:**
```
Storyboard → Shot List → Approved Assets → Timeline → AI Edit → Review → Render → Export
```

**Current project rail:**
```
Treatment → Shot List → Assets → Prompt Lab → Video → Review → Music Video Editor → Export
```

Compatible. Treatment/storyboard seed timeline via `storyboard_nodes` or `shots`. Review (`clip_reviews`) precedes timeline assembly today — spec allows iterative review post-edit too; support both.

---

## Conflicts to avoid

### 1. Dual source of truth (critical)

**Today:** `timeline_items` rows are edited in UI; `manifest_json` rebuilt on explicit “Save manifest snapshot.”

**Spec:** Manifest owns project; editor reads/writes manifest only.

**Resolution (Step 2):**

```
All mutations → patch manifest (in memory + DB)
              → project timeline_items from manifest (or store items inside manifest_json only)

Preferred v2 approach:
  timeline_manifests.manifest_json = canonical
  timeline_items = materialized view / cache for queries (rebuilt on each manifest commit)
```

Until v2 lands, **command layer must update both** or risk agent/human drift.

### 2. `timeline_tracks` vs `timeline_items.track`

Do not keep text `track` column as primary after Step 3. Add `timeline_tracks` table:

```sql
timeline_tracks (
  id, manifest_id, type, name,
  muted, solo, locked, visible, volume,
  sort_order
)
timeline_items.track_id → timeline_tracks.id  -- migrate from text track
```

### 3. `render_jobs` vs `provider_jobs` vs `export_packages`

| Table | Scope |
|-------|--------|
| `provider_jobs` | External AI APIs (Runway, Fal, faceswap) — **keep unchanged** |
| `export_packages` | Deliverable bundles (ZIP, FCPXML) — **keep** |
| `render_jobs` (new) | Timeline manifest → Remotion/ffmpeg server render | 

Do not overload `provider_jobs` for Remotion renders.

### 4. `clip_reviews` vs `timeline_reviews`

- `clip_reviews` — per generated **clip asset** (pre-timeline QA) — **keep**
- `timeline_reviews` (new) — per **manifest version** or **render output** — add for “Version 12: Claude reordered hook”

### 5. Product catalog migration

Products are Phase 1 elsewhere. Editor should:

- **Phase 2 editor:** no product FK on clips required
- **Future:** `timeline_items.metadata_json.product_ids[]` or manifest-level `product_refs`
- Agent commands: `find_clips_by_product(sku)` queries `project_assets.metadata_json` + manifest

No conflict if product catalog lands first.

### 6. Do not build Premiere-like UI before command layer

Spec build order is correct: **commands before canvas**. Otherwise agents cannot drive the same paths humans use.

---

## Spec modules — gap analysis

| Module | Status | Notes |
|--------|--------|-------|
| **1. Preview Player** | ❌ Missing | No `<video>` preview synced to playhead. Step 6 dependency. |
| **2. Timeline canvas** | ❌ List only | Reorder via up/down buttons; no drag/trim handles |
| **3. Asset Library panel** | ⚠️ Separate page | `/projects/$id/assets` exists; not embedded in editor |
| **4. Inspector** | ⚠️ Inline on list rows | No dedicated panel; cut type + approved checkbox only |
| **5. Storyboard integration** | ✅ DB + seed | No “Replace Scene 14” agent command yet |
| **Hybrid footage** | ✅ `project_assets` | Upload + AI ingest; tag `source_type` in metadata for spec categories |
| **BPM intelligence** | ✅ In manifest | Agent commands not wired |
| **Agent command layer** | ❌ Stub | **Step 5 — blocking for AI-native claim** |
| **Product-aware editing** | ❌ Future | After product catalog Phase 3 |
| **Campaign-aware editing** | ❌ Future | New `campaigns` domain — not started |
| **Versioning** | ⚠️ `version_number` only | Need `timeline_versions` audit log |
| **Review on export** | ⚠️ Clip-level only | Extend for render outputs |

---

## Manifest schema evolution (v1 → v2)

Proposed `timeline_manifest.json` v2 (extends current, does not replace project_id/audio):

```json
{
  "schema_version": 2,
  "project_id": "",
  "frame_rate": 24,
  "aspect_ratio": "16:9",
  "resolution": "1920x1080",
  "duration_frames": 0,
  "audio": { "bpm": 120, "beat_markers": [], "song_sections": [] },
  "tracks": [
    { "id": "", "type": "video", "name": "V1", "muted": false, "solo": false, "locked": false, "visible": true, "volume": 100 }
  ],
  "items": [],
  "markers": [],
  "captions": [],
  "metadata": { "product_refs": [], "campaign_id": null }
}
```

Migration: `buildTimelineManifest()` emits v2; export/readers accept v1 + v2 during transition.

---

## Agent command layer (Step 5)

**Location:** `src/lib/timeline/commands/` (new)

Every command:

1. Accepts `manifestId` + payload
2. Validates against manifest schema
3. Returns new manifest + change summary
4. Persists manifest + version row
5. Rebuilds `timeline_items` projection (if kept)

### v1 command set (match spec)

| Command | Maps to today |
|---------|---------------|
| `create_timeline` | `useCreateTimelineManifest` |
| `add_clip` | insert item |
| `remove_clip` | delete item |
| `move_clip` | reorder |
| `trim_clip` | `start_frame` / `end_frame` / trim fields |
| `split_clip` | two items from one |
| `replace_clip` | swap `asset_id` |
| `duplicate_clip` | copy item |
| `mute_track` / `solo_track` / `lock_track` / `hide_track` | track fields (after Step 3) |
| `set_track_volume` | track.volume |
| `add_transition` | `transition_in_json` / `cut_type` |
| `apply_color_profile` / `apply_vfx_profile` | `style_profiles` FK |
| `add_text_overlay` | `text_overlays_json` |
| `generate_teaser` / `generate_reel` | future — manifest-derived sub-compositions |
| `export_video` | queue `render_jobs` |

**HTTP surface (future):** `supabase/functions/timeline-command` — JWT auth, dispatches command registry. UI and agents call the same functions client-side first; edge wrapper later.

**NL layer:** `nlTimelineCommands.ts` becomes planner → dispatches command[] — not direct DB patches.

---

## Build order (adjusted for current repo)

Maps spec steps to concrete work. **Step 1 = this document.**

| Step | Spec | Work | Depends on |
|------|------|------|------------|
| **1** | Architecture review | ✅ This doc | — |
| **2** | **Editor Core Engine** | Manifest commits via engine; `timeline_versions` + **`timeline_events`** audit log; wire mutations to emit events | — |
| **3** | Track system | `timeline_tracks` table + migrate `track` text | Step 2 |
| **4** | Hybrid footage | `project_assets.metadata_json.source_kind` enum; editor asset picker | Step 2 |
| **5** | Agent commands | `src/lib/timeline/commands/*` + tests; wire TimelinePage list UI through commands | Steps 2–3 |
| **6** | Timeline UI | Preview player + canvas + inspector + embedded asset library | Step 5 |
| **7** | Remotion render | `render_jobs` edge worker; outputs → `export_packages` | Steps 2, 5 |
| **8** | Premiere/Resolve packages | Extend existing `buildPackage.ts` | Step 7 optional |

**Parallel track:** Product Catalog Phase 1–2 does not block Steps 2–5.

---

## Mobile + desktop UX

| Surface | Desktop | Mobile |
|---------|---------|--------|
| Preview player | Full width above timeline | Sticky top, 16:9 or 9:16 toggle |
| Timeline canvas | Multi-track drag/trim | **Review mode only** — approve, reorder, simple trim |
| Inspector | Right panel | Bottom sheet |
| Asset library | Left dock | Full-screen picker sheet |
| Agent commands | Chat side panel (future) | Voice/text → same API |

Do not ship full multi-track editing on phone in v1 — parity via agent commands + approve/reject.

---

## Database additions (consolidated)

### Step 2 — Editor Core Engine (in progress)

**Code:** `src/lib/timeline/engine/` — `planManifestCommit`, `persistManifestCommit`, `persistTimelineEvent`

**Tables:**

```sql
timeline_versions (
  id, manifest_id, version_number,
  actor_type,    -- 'user' | 'agent' | 'system'
  actor_name,    -- 'Claude', 'ChatGPT', user display name
  change_summary,
  manifest_json,
  created_at
)

timeline_events (  -- append-only audit log — GPT requirement
  id, manifest_id, version_id,  -- version_id set on manifest_committed
  event_type,                   -- clips_reordered, clip_trimmed, manifest_committed, …
  actor_type, actor_name,
  change_summary,
  payload_json,
  created_at
)
```

**Migration:** `supabase/migrations/20260610120000_editor_core_engine.sql`

**Wired today:**
- Save manifest snapshot → version + `manifest_committed` event
- Reorder / update / seed / reset → granular `timeline_events`

**Not yet:** manifest-first-only writes (items still edited directly); schema v2; track system

### Step 3

```sql
timeline_tracks (see Conflicts §2)
-- alter timeline_items add track_id uuid references timeline_tracks(id)
```

### Step 7

```sql
render_jobs (
  id, manifest_id, manifest_version_id,
  target,        -- 'remotion' | 'ffmpeg'
  status,        -- queued | running | complete | failed
  request_json, response_json,
  output_export_package_id uuid references export_packages(id),
  created_at, updated_at
)
```

### Step 8+

```sql
transition_presets, effect_presets  -- or extend style_profiles
timeline_reviews (manifest_version_id, rating, approval_status, notes, reviewer_id)
```

### Do NOT add

- Second manifest table
- `exports` (use `export_packages`)
- Editor-owned asset tables (assets stay `project_assets`)

---

## Integration with Creative OS roadmap

```
Product Catalog Phase 1–2     Video Editor Steps 2–5 (parallel)
         ↓                              ↓
Product-powered Virtual Samples   Agent command layer
         ↓                              ↓
         └──────────→ Timeline manifest v2 ←──────────┘
                              ↓
                    Editor UI (Step 6)
                              ↓
                    Remotion render (Step 7)
```

**Product-aware commands** (Phase 2 editor extension): `find_clips_by_product`, `build_teaser_for_collection` — after `products` table exists.

**Campaign-aware** (Phase 3+): new `campaigns` table; manifest `metadata.campaign_id`.

---

## Success criteria (from spec) — honest status

| Criterion | Today | After Steps 2–8 |
|-----------|-------|-----------------|
| Upload song | ✅ | ✅ |
| Upload AI + real clips | ✅ | ✅ |
| Create timeline | ✅ (seed) | ✅ |
| Edit timeline (human) | ⚠️ List only | ✅ Canvas |
| Mute tracks | ❌ | ✅ Step 3 |
| Adjust audio | ⚠️ Speed only | ✅ |
| Apply transitions | ⚠️ cut_type select | ✅ Inspector |
| AI agents modify edit | ❌ | ✅ Step 5 |
| Render finished video | ❌ Scaffold only | ✅ Step 7 |
| Export Premiere/Resolve | ✅ ZIP packages | ✅ Enhanced Step 8 |
| No Premiere required to edit | ⚠️ Partially | ✅ |

---

## Open questions for reviewer

1. **Manifest-only vs items projection:** Drop `timeline_items` table eventually, or keep as materialized cache?
2. **schema_version 2:** Break existing export ZIP consumers, or dual-read indefinitely?
3. **Remotion render:** Cloudflare Worker + queue, or local dev-only first?
4. **timeline_reviews vs extend clip_reviews:** Separate table or unified review model?
5. **Editor route:** Replace `/projects/$id/timeline` or new `/projects/$id/editor`?
6. **Real-time collaboration:** Out of scope v1 — confirm?

---

## Final decision

**Spec approved to proceed** with these constraints:

1. **Extend** existing `timeline_manifests`, `timeline_items`, `export_packages`, `clip_reviews`
2. **Manifest-first** before canvas UI (Steps 2–5 before 6)
3. **Agent command layer** is not optional — it defines the architecture
4. **No duplicate** timeline or asset systems
5. **Align** with Product Catalog — products attach to manifest metadata later, not editor-owned
6. **Mobile** = review + agent, not full NLE

**Next action:** Finish Editor Core Engine — route all item mutations through command registry; manifest v2 schema; then Step 3 tracks.
