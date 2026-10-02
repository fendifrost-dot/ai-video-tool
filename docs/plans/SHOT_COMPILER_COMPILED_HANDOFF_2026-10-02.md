# Shot compiler — compiled handoff (Grok + Cursor audit)

**Status:** SPEC for Claude review → Cursor implement. **No code in this file.**  
**Date:** 2026-10-02  
**Owner after review:** Cursor implements; Claude reviews first.  
**Green light:** Fendi — compile Grok’s shot-compiler handoff with Cursor’s product/CC audit; keep what we keep; Claude reviews; then implement.

| Source | Role in this file |
|--------|-------------------|
| Grok handoff (2026-10-02) | Routing rules, prompt locks, phrase model, reject list for Movez / X-post noise |
| Cursor audit [`CURSOR_PRODUCT_CODE_AUDIT_2026-10-02.md`](CURSOR_PRODUCT_CODE_AUDIT_2026-10-02.md) | Product seams, scripts→app gap, CC contract footguns, acceptance axes |
| Claude plan [`PLAN_2026-10-01_LYRIC_LOCK_AND_TRANSITIONS.md`](../plans/PLAN_2026-10-01_LYRIC_LOCK_AND_TRANSITIONS.md) | B1–B6 / C1 already in flight — compiler must **consolidate**, not fork |

**Baselines:** AVT `main` (audit @ `fea6ba3`+); CC `main` @ `3bfc770`. Do not re-clone CC to “discover” catalogue — it is already tabled below.

---

## 1. Verdict (shared)

Do **not** import Movez paper-stage prompts, coral pixel bots, or “one prompt replaces After Effects / DaVinci / Premiere.”

Do **not** add provider endpoints or `modelVariant`s. Control Center already covers the models the X posts demo.

The missing product piece is a **shot compiler**: treatment / ShotSpec / lyric phrases → **payloads that existing CC functions already accept**, then timeline owns the cut.

AVT already owns hero lock, wardrobe stills, face restore, timeline, song/lyric timing, treatments. Scripts already prove the world/plate/Seedance/Genjutsu routes. The compiler **lifts and unifies** that routing into a single ruleset Treatment (and batch) can call — it does **not** greenfield a parallel pipeline beside `run_world_batch.py`.

---

## 2. Keep / reject / merge

### KEEP (from Grok)

| Item | Why |
|------|-----|
| No new providers / MCP / model variants | Catalogue is sufficient |
| No keys in AVT (`FAL_KEY`, Higgsfield) | Hard project rule |
| Phrase jobs, not one panel per shot | Timeline owns cuts; model gets a motion phrase |
| Hard locks: face / proportions / glasses / skin; wardrobe only under occlusion when look contract supplies a ref | Matches locked hero + look contract |
| No on-screen text, captions, logos, watermarks in provider prompts | Logo composite stays FFmpeg / timeline |
| Duration snap to model enums (Kling 5/10, Hailuo 6/10, Seedance 4–30, Genjutsu = source) | Avoids silent 400s and bill waste |
| Routing table: DoP / Kling i2v (hero+camera), Kling/Hailuo t2v (world, no identity), Seedance 2.5 ref (multi-ref short), Genjutsu object-swap / motion-transfer, Grok/Qwen image_edit (still world) | Matches CC `higgsfield-model` + DoP generate |
| Reject 75–90 s as one provider call | Song is assembled on the timeline |
| `ai-draft-treatment` stays the concept step — no second drafter | CC already has it; hard lock |
| Dry-run validation against existing endpoints | Safe first proof |

### REJECT (from Grok — Cursor concurs)

| Item | Why |
|------|-----|
| Movez / dry gouache / coral Claude pixel-bot aesthetic | Wrong for photoreal music video + locked hero |
| “Opus replaces NLE” framing | Step order already split across treatment + timeline + assembler |
| URL-to-brand / Pexo-style gems | Look contract + brand palette exist |
| Gems whose only content is “use Seedance / Runway” | Endpoints exist |
| Copying full X-post prompts into the repo | Cite post ids only if needed; prompts stay data in look presets / shot cards |

### MERGE (from Cursor audit — must land inside the compiler work)

| Item | How it changes the Grok spec |
|------|------------------------------|
| **Consolidate with scripts lane** | Compiler emits the **same shot-list / payload shape** `run_world_batch.py` already consumes (or a thin adapter). Do not invent a third JSON dialect beside visualiser `scenes[]` and world-batch `shots.json`. |
| **Catalogue in app path** | `providerJobs` today maps `higgsfield` → DoP only. Compiler / Produce / Prompt Lab must be able to target `video-providers-higgsfield-model` with `mode` + `modelVariant`. |
| **Look presets** | Every generation prompt wraps `config/look_presets.json` (`film_bar_v1` default for worlds/plates). |
| **Acceptance before cut** | Payload success ≠ cut acceptance. Chain: submit → poll → **realism_gate + look-bank** → (later B5 brief fidelity) → only then `insert_broll` / assembler. |
| **Living plate + world-around routes** | First-class, not afterthoughts: bar still → Kling i2v; real take over plate (`composite_environment`); `world_around` / image_edit; Seedance angle on a real cut (`seedance_ref`). |
| **Input = AVT truth first** | Prefer ShotSpec + `lyric_lines` + approved hero asset + look contract. CC `ai-draft-treatment` is optional upstream, not the only input. |
| **Visualiser schema** | Compiler / batch must speak visualiser v2 `scenes[]` (`render_prompt`, `renderer`, `performance_plate_prompt`) — retire or adapt dead `concepts[]` / `broll_prompt` path. |
| **CC footguns (document; do not block v1)** | job-result api-host fallback; cost estimate gaps; no fal-run flow model (Lane A stays research). Compiler uses **status** path proven in scripts; result fetch follows whatever CC has today and records failures honestly. |

### DEFER (out of shot-compiler v1)

| Item | Owner |
|------|--------|
| Garment supersede in `VIDEO_SWAP_ARCHITECTURE.md` | Fendi decision |
| Lane A optical-flow allowlist on CC | CC lock lift |
| B3 treatment override / B4 regenerate-from-lyrics UI | Plan B (can feed compiler later) |
| B5 brief-fidelity axis | Plan B — hook after cards carry required-elements |
| C2–C4 transitions on cards / audition | Plan C — assembler already has C1 |
| Render worker (A6) | Roadmap |
| Foreground occluder in compositor | Parallel edit script |
| Flipping Higgsfield `apiReady` alone | Trivial; do with catalogue route in same PR if implementing |

---

## 3. What already exists (do not rebuild)

### AVT

- Locked still wardrobe: SAM-3 → Grok outfit → lock → face restore (`AGENTS.md`, `VIDEO_SWAP_ARCHITECTURE.md`).
- Providers registry + `proxy-provider-call` → CC.
- Treatment / ShotSpec / storyboard with **lyrics in boxes** (B1/B2 done).
- Scripts: `run_world_batch.py`, `world_around.py`, `run_broll_batch.py` (stale concepts shape), `camera_engine.py`, `composite_environment.py`, `insert_broll.py`, `assemble_section.py`, `transitions.py`, `realism_gate.py`, `look_fingerprint.py`, `grade_to_bank.py`, `reference_fidelity.py`.
- Data: `config/look_presets.json`, `config/provider_caps.json`, `config/transition_presets.json`, realism bar bank.

### Control Center (allowlist — Grok table, verified)

| modelVariant | Mode | Duration | Notes |
|---|---|---|---|
| `kling-2.5-turbo-pro-t2v` | text_to_video | 5, 10 | worlds, no identity |
| `kling-2.5-turbo-pro-i2v` / `…-standard-i2v` | image_to_video | 5, 10 | needs `referenceImageUrl` |
| `hailuo-2.3-standard-t2v` / `…-i2v` | t2v / i2v | 6, 10 | |
| `genjutsu-object-swap` | video_to_video | = source 4–30s | named element only; 1–8 refs |
| `genjutsu-motion-transfer` | video_to_video | = source | keep motion/camera; rebuild rest |
| `seedance-2.5-reference` | reference_to_video | 4–30 out | `@Image1` / `@Video1`; aspects incl. 9:16 |
| `grok-image-2` / `qwen-image-3-edit` | image_edit | n/a | first ref = frame to keep |

Also: `video-providers-higgsfield-generate` (DoP), Runway generate/edit, Grok generate, job-status/result, `switchx-restyle`, `compose-look`, faceswap, `ai-draft-treatment`.

**Seedance 2.0** is not in the catalogue — production path is **2.5**. Do not add 2.0 to “match a reel.”

---

## 4. Build spec — shot compiler (keep this shape)

### 4.1 Goal

Pure (or near-pure) module that turns project truth into **one provider payload per motion phrase**, routed to an **existing** CC function. Timeline / assembler place the results. No provider keys in the module.

### 4.2 Suggested homes (implementation order)

1. **`src/lib/shotCompiler/`** (or `src/lib/treatment/shotCompiler.ts`) — types, routing, prompt locks, duration snap, payload builders. Unit-tested. **No network.**
2. **Thin submit adapter** — either (a) extend `providerJobs` / `proxy-provider-call` usage for catalogue modes, or (b) emit shot-list JSON that `run_world_batch.py` already runs (scripts lane remains the paid executor until app batch UI exists).
3. **Optional later:** Treatment “Compile phrases” button that writes payloads + opens engineering batch / manifests.

**Do not** put the first version only in Python if the product surface is Treatment — but **do** keep payload schema identical to world-batch so Claude’s runners stay the execution engine in v1.

### 4.3 Input

```ts
type ShotCompilerInput = {
  phrases: Array<{
    id: string;
    startSec: number;       // song clock
    endSec: number;
    lyrics?: string;        // from lyric_lines ∩ window
    beatText: string;       // effective treatment / override
    kind: "performance_plate" | "world" | "garment_character" | "angle" | "outfit_swap";
    camera?: string;        // compact grammar string
  }>;
  heroStillUrl: string;     // approved hero / locked still (owned storage URL)
  lookPresetId?: string;    // default film_bar_v1
  wardrobeRefUrls?: string[]; // look-contract refs; empty ⇒ no wardrobe change language
  aspect?: "9:16" | "16:9" | "4:3";
  sourceVideoUrl?: string;  // for Genjutsu / Seedance when phrase needs it
  plateStillUrl?: string;   // optional world/plate still already chosen
};
```

Prefer filling `phrases` from ShotSpec + `lyric_lines` (B1/B2). Beat text = `effectiveTreatment` once B3 exists; until then use ShotSpec text / visualiser scene logline.

### 4.4 Output

One object per phrase:

```ts
type ShotCompilerJob = {
  phraseId: string;
  route: CompilerRoute;
  endpoint: "video-providers-higgsfield-generate" | "video-providers-higgsfield-model";
  body: Record<string, unknown>; // CC body only — no secrets
  durationSec: number;           // snapped
  promptText: string;            // final, after look preset wrap
  negatives?: string;
  gateHints: { lookPresetId: string; requireLookBank: boolean; skipHeadSec?: number };
};
```

### 4.5 Routing rules (KEEP + MERGE)

| Condition | Route | Endpoint / variant |
|-----------|--------|-------------------|
| Approved hero + camera move; identity must hold | `hero_camera` | DoP (`higgsfield-generate`) **or** `kling-2.5-turbo-pro-i2v` with hero as `referenceImageUrl` |
| World plate; artist absent | `world_t2v` | Prefer **still-first** (image_edit or `world-still-proxy` style still) → `kling-2.5-turbo-pro-i2v` with look preset; fallback `kling-2.5-turbo-pro-t2v` / Hailuo t2v |
| Multi-ref performance (hero ± world still ± motion clip); short re-angle | `seedance_ref` | `seedance-2.5-reference`; `@Image1` = locked hero; duration = phrase length snapped 4–30, prefer = source when re-angling a take |
| Outfit change on existing footage; named garment only | `genjutsu_swap` | `genjutsu-object-swap`; prompt names the element; face/body not the element; occlusion-only wardrobe language; no dissolve/morph |
| Motion/camera survive; world may change | `genjutsu_motion` | `genjutsu-motion-transfer` |
| Still world around performer (design frame) | `world_around_still` | `grok-image-2` or `qwen-image-3-edit`; first ref = frame to keep |
| Real take living in a generated plate (post) | `living_plate` | **Not a provider job** — compiler emits a **compositor job stub** (`composite_environment` inputs). Do not pretend Genjutsu is the living plate. |

Default world motion model after sample shootout: **Kling 2.5 i2v, camera-only motion** on a bar still (Cursor/Claude evidence). DoP remains valid for character B-roll from a hard-matte still.

### 4.6 Duration rule

Snap to enum; never send 12 s to Kling. Genjutsu follows source. Seedance: clamp 4–30; if re-angling a cut, duration = source seconds when in range.

### 4.7 Prompt locks (every video payload)

Always:

1. First frame / `@Image1` is the approved hero when identity is in-frame.
2. Face, proportions, glasses, skin unchanged.
3. Wardrobe changes only under occlusion, and only if wardrobe refs were supplied.
4. No on-screen text, captions, logos, watermarks.
5. No extra characters not in the beat / required-elements list.
6. Diegetic sound notes only — song bed is timeline-side.
7. Wrap with look preset preamble + shot suffix (`film_bar_v1` default for worlds/plates).

Where the model has `negative_prompt` (Kling, Qwen), mirror the bans there.

### 4.8 Phrase rule

Interior storyboard panels = key poses **inside one job**. A cut = a **new job**. Cut times from timeline / song clock, not from the model.

### 4.9 Gate handoff (MERGE — required for “finished product”)

Compiler does not call Astra. Downstream:

1. Persist asset under `project-clips/…` with provenance (route, variant, prompt hash, hero hash, look preset).
2. `realism_gate.py --look-bank` (and `--ref-stats` when available).
3. Optional head-skip for i2v frame-0 composite edge (insert-time today; gate-time later).
4. Only PASS / ON_BAR (policy TBD after Fendi calibration) enter `insert_broll` / section assemble.

---

## 5. Useful X-post patterns (Grok — KEEP as patterns, not pasted prompts)

Cite only; do not paste full prompts into the repo.

1. **Motion phrases** — group panels into phrase ranges; camera through interior poses; cuts at phrase boundaries (Kōda).
2. **Timed beat sheet + hard locks** — identity / era / continuity negatives; first frame is opening image; wardrobe behind occlusion only (Elsa Sofia, Sania, Al-Shamus).
3. **Compact camera grammar** — shot scale, cut times, action, line (Salvo) — song intelligence / lyric lines can emit this.
4. **Describe a reference** for research/b-roll text only — do not paste unowned frames into production jobs (Kōda).
5. **Split plates and graphics** — video model makes pictures; code makes type (Ian Sans).

---

## 6. Implementation phases (for Claude → Cursor)

| Phase | Scope | Done when |
|-------|--------|-----------|
| **0 — Review** | Claude reads this file + audit §4b; flags conflicts with live runners | Written concurrence or amendments in `CLAUDE_LATEST` / comment on PR |
| **1 — Pure compiler** | `src/lib/shotCompiler/*` + tests: route, duration snap, prompt locks, look preset wrap, payload shape | Vitest green; no paid calls; fixtures for each route |
| **2 — Executor bridge** | Emit world-batch-compatible shot list **or** submit via `proxy-provider-call` with catalogue endpoint; extend `ENDPOINT_BY_PROVIDER` / mode for higgsfield-model | Dry-run: 401 unauth or 400 bad variant — not “unknown endpoint” |
| **3 — Treatment hook (thin)** | One engineering or Treatment action: compile selected shots → manifest JSON download or batch handoff | Fendi can compile without hand-writing `shots.json` |
| **4 — Gate chain** | Manifest rows carry gate fields; insert only when policy says so | Matches sample-build discipline |

Phases 1–2 are the implement-now core after Claude’s review. 3–4 can be same PR or follow-up.

---

## 7. Do not (combined)

- Do not add a provider, MCP, or model variant to match a post.
- Do not copy provider keys into AVT.
- Do not regenerate garment imagery as the still path (Grok outfit / VTON stays); Genjutsu object-swap is video path for a **named** element only.
- Do not put captions/logos in provider prompts.
- Do not treat 75–90 s as one provider call.
- Do not greenfield a third batch JSON dialect.
- Do not mark live / deploy from the review pass alone.
- Do not edit Control Center in the compiler PR unless Fendi lifts the lock for a named fix (job-result fallback is separate).
- Do not reopen chest/sleeve paint or scale Lane A without a CC-allowlisted flow model.
- Do not fold look distance into the realism verdict.

---

## 8. Report back (when implementing)

1. File path of the compiler and the CC function names / `modelVariant`s it emits.
2. One example payload per route in §4.5 (duration inside enum; no secrets).
3. Confirmation payloads contain no provider key.
4. Dry-run against `video-providers-higgsfield-model` validation (expect 401 unauthenticated or 400 on bad variant — **not** unknown endpoint).
5. Proof the output shape is consumed by `run_world_batch.py` **or** by an extended `providerJobs` catalogue path (state which).
6. Tests listed and green (`npm run test` for the new module; build if app-touched).

---

## 9. Claude review checklist

Please confirm or amend:

- [ ] Routing table matches what you want for the next sample (esp. still-first worlds vs t2v).
- [ ] Payload schema should mirror `run_world_batch` shot list — yes/no/edits.
- [ ] Living-plate as compositor stub (not a provider route) — agree?
- [ ] Phase 1–2 in one Cursor PR after your review — agree?
- [ ] Any CC lock-lift items required before Phase 2 (job-result host)? Default: **no** — scripts status path is enough for v1.

---

*Compiled 2026-10-02 · Grok shot-compiler handoff ∩ Cursor product/CC audit ∩ Claude lyric-lock plan · implement only after Claude review*
