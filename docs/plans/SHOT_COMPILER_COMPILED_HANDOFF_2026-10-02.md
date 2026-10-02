# Shot compiler — compiled handoff (amended after Claude review)

**Status:** AMENDED SPEC · Cursor implements phases 1–2 in `src/lib/shotCompiler/**` only.  
**Date:** 2026-10-02 (rev D — Claude green light + five amendments)  
**File ownership:** Cursor → `src/lib/shotCompiler/**` only. Claude → `src/lib/treatment/**`, `src/components/treatment/**`, `scripts/edit/**`, `scripts/qa/**`. No CC lock-lift.

Sources: Grok handoff ∩ Cursor audit ∩ Claude review (five amendments) ∩ Part E coverage (`coverage_presets.json`, `coverage.py`, `motion_story_v1`).

---

## Claude’s five amendments (binding)

1. **Split `hero_camera`.** Performance-line camera moves are **`$0 take_move`** stubs (coverage sub-slot → `camera_engine` / `coverage.py` render) — pixel-true, lip-locked. Never DoP/Kling i2v on a singing take (measured identity 0.43–0.63). **`hero_broll_i2v`** = DoP/Kling from a hero still for **non-singing B-roll only**.
2. **Phrases come from the coverage planner / motion contract, not freeform.** Performance → coverage sub-slot (`coverage_plan.json`: bar-grid window, typed move, framing, transition). Worlds → lyric window + `motion_story_v1` motion contract (entrance/primary/secondary/exit). `camera` is a **typed move object** matching `config/coverage_presets.json` fields — not a free string.
3. **Seedance re-angle:** `@Video1` = the **real take** (identity from the clip). Duration = **source seconds**. Input seconds billed. `keep[]` wardrobe constants required. Mirror `run_world_batch.py` `seedance_ref` shape exactly.
4. **Payload schema = `shots.json` documented in `run_world_batch.py` lines 8–20, verbatim.** `heroStillUrl` is optional. Phase 2 = **emit that file** (option b). Extending `providerJobs` is optional same-PR; scripts stay the paid executor.
5. **Gate chain adds** `reference_fidelity.py` on every `seedance_ref` result and `coverage_qa.py` on the assembled cut. **Genjutsu routes stay in the table but are out of the next sample** (garment lane parked).

---

## Verdict (unchanged)

No new providers. Phrase jobs, not panels. Duration snap. Prompt locks. Gate before cut. Living plate = compositor stub. One payload dialect = `shots.json`.

---

## Routes (amended)

| Route | Provider? | When | Output |
|-------|-----------|------|--------|
| `take_move` | **No** — compositor/coverage stub | Performance coverage sub-slot (`source: "take"`) | Stub job: `{ route, take path, move, handheld, lens, framing, song window }` for `coverage.py` / `camera_engine` |
| `seedance_ref` | Yes — `higgsfield-model` | Coverage angle sub-slot or explicit angle phrase | `shots.json` entry with `route: "seedance_ref"`, `source_path`, `angle`, `keep[]`, duration = source |
| `hero_broll_i2v` | Yes — DoP or Kling i2v | Non-singing B-roll from hero still | `still_dop` or `still_kling` + hero as still |
| `world_still_i2v` | Yes — prefer Kling i2v after bar still | World lyric window + motion contract | `still_kling` (default) / still_dop / etc. |
| `world_t2v` | Yes — Kling/Hailuo t2v | Fallback when still-first not used | `kling_t2v` |
| `world_around_still` | Yes — image_edit | Design frame around performer | Not in shots.json motion routes; separate image_edit payload (optional emit) |
| `living_plate` | **No** — compositor stub | Real take over generated plate | Stub for `composite_environment` |
| `genjutsu_swap` / `genjutsu_motion` | Yes | Named outfit / motion-transfer | **In table; out of next sample** |

---

## `shots.json` dialect (verbatim target)

From `scripts/broll/run_world_batch.py` header:

```json
{
  "id": "H1_bear",
  "kind": "world" | "plate" | "angle",
  "aspect": "9:16" | "16:9" | "4:3",
  "seconds": 5,
  "prompt": "the scene…",
  "motion": "what moves…",
  "route": "still_runway" | "still_runway45" | "still_kling" | "still_dop" | "runway_t2v" | "kling_t2v" | "seedance_ref",
  "stills": 2,
  "still_path": "<optional existing still>",
  "source_path": "<seedance: trimmed take path>",
  "source_local": "<seedance: local copy for fidelity>",
  "angle": "<seedance: new camera sentence>",
  "keep": ["clear-lens glasses, not tinted", "…"],
  "resolution": "720p"
}
```

Non-provider stubs (`take_move`, `living_plate`) are **not** mixed into the paid shots array; they emit a parallel `stubs.json` (or tagged `provider: false` entries the batch runner ignores). Compiler API returns `{ shots: WorldBatchShot[], stubs: CompilerStub[] }`.

---

## Input (amended)

```ts
type CoverageMoveSpec = {
  type: string;       // push | pull | truck | …
  amount: number;
  ease: string;
  handheld: number;
  lens: string;       // lens_presets key
  start?: number;
  end?: number;
  direction?: string;
};

type CompilerPhrase =
  | {
      kind: "coverage_take" | "coverage_angle";
      id: string;
      slot: string;
      section: string;
      song: [number, number];
      move: CoverageMoveSpec;
      framing: string;
      sourcePath: string;          // real take
      sourceLocal?: string;
      sourceSeconds: number;
      angle?: string;              // coverage_angle only
      keep: string[];              // required for seedance
      transition?: string;
      matteDir?: string;
      plate?: string;
    }
  | {
      kind: "world";
      id: string;
      song: [number, number];
      lyric?: string;
      prompt: string;              // scene visual
      motion: { entrance: string; primary: string; secondary: string; exit: string };
      camera: CoverageMoveSpec;    // typed, from motion_story / presets
      aspect?: "9:16" | "16:9" | "4:3";
      seconds?: number;
      stillPath?: string;
      routeHint?: "still_kling" | "still_dop" | "kling_t2v" | …;
    }
  | {
      kind: "hero_broll";
      id: string;
      prompt: string;
      motion: string;              // camera-only motion sentence for i2v
      heroStillPath: string;       // project-references path
      seconds?: number;
      aspect?: "9:16" | "16:9" | "4:3";
      routeHint?: "still_dop" | "still_kling";
    }
  | {
      kind: "living_plate";
      id: string;
      takePath: string;
      platePath: string;
      song: [number, number];
    };

type ShotCompilerInput = {
  phrases: CompilerPhrase[];
  lookPresetId?: string;           // default film_bar_v1
  aspectDefault?: "9:16" | "16:9" | "4:3";
};
```

---

## Gate chain (amended)

1. Persist + provenance.  
2. `realism_gate.py --look-bank` (+ ref-stats when available).  
3. **`reference_fidelity.py` on every `seedance_ref` result** (identity + lip fit).  
4. Insert / assemble.  
5. **`coverage_qa.py` on the assembled cut** (moving share, static runs, cut cadence).  

Genjutsu not in the next sample’s compile set.

---

## Phases

| Phase | Scope | Owner |
|-------|--------|-------|
| **1** | Pure `src/lib/shotCompiler/*` + vitest | Cursor |
| **2** | `compileToWorldBatch(input) → { shots, stubs }` writing/emitting shots.json dialect | Cursor |
| 3+ | Treatment hook, providerJobs catalogue | Later / shared |

---

## Do not

- Do not put DoP/Kling i2v on singing performance takes.  
- Do not invent a third JSON dialect.  
- Do not edit `treatment/**`, `scripts/edit/**`, `scripts/qa/**` in this PR.  
- Do not fire Genjutsu in the next sample.  
- Do not add providers or CC changes.
