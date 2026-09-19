/**
 * YSL Real Video #1 — full-song director's treatment generator (Milestone 1).
 *
 * Deterministic, $0, no network. Drives the REAL `buildClipGrid` (timing math is
 * never authored by hand) with a provisional YSL (Ice On) song map, then merges
 * the director's per-section creative direction onto each grid clip to emit a
 * schema-valid StructuredTreatment v2 + ShotSpec[] seed artifact.
 *
 * Output (docs/treatments/):
 *   ysl-ice-on.treatment.json   — StructuredTreatment v2 for video_projects.treatment_json
 *   ysl-ice-on.shotspecs.json   — validated ShotSpec[] (the machine contract)
 *
 * Seeding: the artifact conforms to `parseSavedStructuredTreatment`; it is applied
 * to the real store via the authenticated app / Lovable SQL editor (Lovable-managed
 * backend — no standalone Supabase). This script does NOT touch the DB.
 *
 * Run:  npx tsx scripts/seed-ysl-treatment.ts
 *
 * NOTE: song timing (duration/BPM/sections) is a PLANNING GRID (HYPOTHESIS) pending
 * real song_analysis for the master. Re-run against the analyzed row to lock timing.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildClipGrid, type GridClip } from "../src/lib/treatment/grid";
import type { SongAnalysis, EnergySample, Section, Drop } from "../src/lib/songAnalysis/types";
import {
  parseShotSpec,
  RENDER_ENGINES,
  SHOT_PRIORITIES,
  SHOT_TYPES as SPEC_SHOT_TYPES,
  type RenderEngine,
  type ShotKind,
  type ShotPriorityLiteral,
  type ShotSpec,
  type ShotTypeLiteral,
} from "../src/lib/treatment/shotSpec";

const PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";
const SONG_TITLE = "YSL (Ice On)";
const MODEL = "director:grok-bot+claude-code (deterministic seed)";

// ---------------------------------------------------------------------------
// Provisional song map — YSL (Ice On), contemporary rap, ~3:05. PLANNING GRID.
// Replace with real song_analyses row to lock cut points.
// ---------------------------------------------------------------------------
const DURATION = 185;
const BPM = 140;

const SECTIONS: Section[] = [
  { name: "intro", start: 0, end: 12, energy: "low" },
  { name: "verse_1", start: 12, end: 46, energy: "mid" },
  { name: "pre_hook", start: 46, end: 58, energy: "mid" },
  { name: "hook_1", start: 58, end: 82, energy: "high" },
  { name: "verse_2", start: 82, end: 116, energy: "mid" },
  { name: "hook_2", start: 116, end: 140, energy: "high" },
  { name: "bridge", start: 140, end: 160, energy: "low" },
  { name: "hook_3", start: 160, end: 185, energy: "high" },
];

const DROPS: Drop[] = [
  { t: 58, intensity: 1 },
  { t: 116, intensity: 1 },
  { t: 160, intensity: 1 },
  { t: 172, intensity: 0.85 },
];

/** Synthetic energy curve (0.5s samples) shaped from the section map. */
function buildEnergyCurve(): EnergySample[] {
  const base: Record<string, number> = {
    intro: 0.28,
    verse_1: 0.55,
    pre_hook: 0.66,
    hook_1: 0.9,
    verse_2: 0.58,
    hook_2: 0.92,
    bridge: 0.32,
    hook_3: 0.95,
  };
  const samples: EnergySample[] = [];
  for (let t = 0; t < DURATION; t += 0.5) {
    const sec = SECTIONS.find((s) => t >= s.start && t < s.end);
    let e = sec ? base[sec.name] ?? 0.5 : 0.5;
    // small ramp inside pre_hook toward the drop
    if (sec?.name === "pre_hook") e += ((t - 46) / 12) * 0.2;
    if (DROPS.some((d) => Math.abs(d.t - t) < 0.5)) e = 1;
    samples.push({ t: Math.round(t * 100) / 100, energy: Math.min(1, Math.round(e * 100) / 100) });
  }
  return samples;
}

const ANALYSIS: SongAnalysis = {
  id: "provisional-ysl-ice-on",
  project_id: PROJECT_ID,
  bpm: BPM,
  duration_seconds: DURATION,
  energy_curve_json: buildEnergyCurve(),
  beat_map_json: [],
  sections_json: SECTIONS,
  drops_json: DROPS,
  hooks_json: [
    { t: 58, end: 82, label: "hook_1" },
    { t: 116, end: 140, label: "hook_2" },
    { t: 160, end: 185, label: "hook_3" },
  ],
  analysis_provider: "provisional-director-map",
  analyzed_at: "2026-09-19T00:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Wardrobe looks (>=2 YSL). Generalized: name + description. Never brand-baked
// into the schema — these are project-level creative choices.
// ---------------------------------------------------------------------------
const LOOK_A = "Look A — Onyx Tailoring: black YSL razor-shoulder tailored jacket, high-gloss leather, silver hardware; sharp, predatory, luxury-runway.";
const LOOK_B = "Look B — White Ice: winter-white satin/silver YSL look with crystal accents; the literal 'ice on' payoff, jewel-lit.";
const LOOK_C = "Look C — Noir Slip: sheer black jewelry-forward YSL evening look for the after-hours bridge.";

function lookForSection(section: string): string {
  if (section.startsWith("hook")) return LOOK_B;
  if (section === "bridge") return LOOK_C;
  return LOOK_A;
}

// ---------------------------------------------------------------------------
// Per-section creative "world" — the closet transformation. Each section owns
// an environment, lighting, camera language, and FX palette.
// ---------------------------------------------------------------------------
type SectionCreative = {
  intent: string;
  environment: string;
  lighting: string;
  cameraMotions: string[]; // rotated per clip
  fxPalette: string[];
};

const CREATIVE: Record<string, SectionCreative> = {
  intro: {
    intent: "Establish the cold vault. Closet reads as a jewel safe, not a bedroom closet. Slow reveal of Fendi in Look A.",
    environment: "The closet as a dim luxury vault — backlit garment bags glowing, mirrored black floor, cold negative space.",
    lighting: "Cold blue rim + single hard key; deep shadow, high-gloss speculars on hardware.",
    cameraMotions: ["slow dolly-in", "static locked", "slow pedestal rise"],
    fxPalette: ["faint frost haze", "slow light bloom"],
  },
  verse_1: {
    intent: "Kinetic verse. Closet walls slide back into an infinite mirrored wardrobe/soft runway. Fendi delivers to camera.",
    environment: "Closet expands — infinite mirrored wardrobe corridor, garment racks receding into a soft runway.",
    lighting: "Punchy key with mirror kick-back; cool wardrobe practicals, controlled contrast.",
    cameraMotions: ["handheld push", "gimbal orbit", "whip pan to reframe", "medium truck"],
    fxPalette: ["mirror multiplication", "subtle speed ramp"],
  },
  pre_hook: {
    intent: "Tension build to the drop. Tighten, accelerate cuts, hint at the White Ice look through a doorway of light.",
    environment: "Corridor of light forming — the vault seam cracks open toward a bright runway beyond.",
    lighting: "Rising exposure, lens flares blooming toward frame-open; strobe-adjacent flicker.",
    cameraMotions: ["accelerating dolly", "snap zoom", "handheld build"],
    fxPalette: ["light streak", "exposure ramp", "frost particle rise"],
  },
  hook_1: {
    intent: "Full runway payoff. Look B (White Ice). Volumetric shafts, frost particles, rapid rhythmic cuts + jewelry macro inserts. Closet is gone — pure luxury-runway world.",
    environment: "Full runway with volumetric light shafts, suspended frost/ice particles, glossy infinity floor, jewel-lit.",
    lighting: "High-key runway with hard volumetric shafts; crystalline sparkle on garment and ice.",
    cameraMotions: ["fast gimbal orbit", "runway dolly", "low-angle hero push", "whip pan"],
    fxPalette: ["frost particles", "crystal sparkle", "speed ramp on drop", "light streaks"],
  },
  verse_2: {
    intent: "Designer-commercial verse. Glass-vitrine showroom; product-grade lighting on garment + accessories. Back to Look A energy with commercial polish.",
    environment: "Designer showroom — glass vitrines, plinths with accessories, seamless cyclorama; commercial cleanliness.",
    lighting: "Soft product key + rim, controlled reflections, editorial catalog polish.",
    cameraMotions: ["slider glide", "locked product static", "gimbal reveal", "medium push"],
    fxPalette: ["glass reflection", "macro rack-focus"],
  },
  hook_2: {
    intent: "Bigger hook reprise. Runway world returns hotter — more particles, wider crane moves, escalating cut rate.",
    environment: "Runway world escalated — deeper haze, more frost, mirrored wings doubling the figure.",
    lighting: "Punchier volumetrics, moving beams, hot crystalline speculars.",
    cameraMotions: ["crane descend", "fast orbit", "hero low push", "whip pan"],
    fxPalette: ["heavy frost particles", "beam sweep", "mirror doubling", "speed ramp"],
  },
  bridge: {
    intent: "After-hours cooldown. Neon boutique, wet reflective floor, Look C. Slower, intimate, jewelry-forward — breath before the final hook.",
    environment: "After-hours neon boutique — wet reflective floor, signage glow, quiet luxury, city night beyond glass.",
    lighting: "Neon magenta/cyan wash, soft reflections, low-key intimate.",
    cameraMotions: ["slow reflective dolly", "static intimate", "gentle handheld"],
    fxPalette: ["neon reflection", "shallow bokeh"],
  },
  hook_3: {
    intent: "Final payoff + button. Closet returns as a gallery — the space is transformed for good. Mirror-multiplied hero, biggest energy, hard out.",
    environment: "Closet-as-gallery — the vault, now lit like an exhibition; mirror-multiplied hero figure, frost settling.",
    lighting: "Gallery hero key + volumetric finish; final crystalline flare then clean out.",
    cameraMotions: ["hero low push", "fast orbit", "mirror-multiply lock", "crane up and out"],
    fxPalette: ["mirror multiplication", "frost settle", "final flare", "speed ramp"],
  },
};

// ---------------------------------------------------------------------------
// Clip authoring — grid owns timing; we own creative fields.
// ---------------------------------------------------------------------------
type TreatmentClip = {
  key: string;
  start: number;
  end: number;
  section: string;
  energy: string;
  shot_type: string;
  scene_description: string;
  camera_direction: string;
  lighting: string;
  wardrobe: string;
  environment: string;
  recommended_tool: string;
  lyric_ref: string | null;
  priority: string;
  dependencies: { kind: string; look: string | null; note: string }[];
};

/** Every Nth clip becomes a macro/b-roll insert to give the edit texture. */
function isBrollInsert(indexInSection: number): boolean {
  return indexInSection % 3 === 2;
}

function shotTypeFor(energy: string, broll: boolean, section: string): string {
  if (broll) return "b_roll";
  if (energy === "drop") return "vfx";
  if (section.startsWith("hook")) return "performance";
  return "performance";
}

function toolFor(shotType: string, energy: string): string {
  // $0 posture: performance clips cut from the real master footage (manual);
  // generated world/FX beats recommend Grok Imagine first per budget policy.
  if (shotType === "performance") return "manual";
  if (shotType === "vfx") return "grok";
  return "grok";
}

const BROLL_SUBJECTS = [
  "macro insert: crystalline chain / jewelry catching light",
  "macro insert: fabric weave and stitched YSL detail, rack-focus",
  "insert: hardware / zipper pull glinting, extreme close-up",
  "insert: frost particles drifting across a mirrored surface",
  "insert: shoe / heel step onto glossy floor, low angle",
];

function buildClips(grid: GridClip[]): TreatmentClip[] {
  const perSectionCounter: Record<string, number> = {};
  return grid.map((g) => {
    const idx = perSectionCounter[g.section] ?? 0;
    perSectionCounter[g.section] = idx + 1;

    const creative = CREATIVE[g.section] ?? CREATIVE.verse_1;
    const isDrop = g.energy === "drop";
    const broll = isBrollInsert(idx) && !isDrop;
    const shotType = shotTypeFor(g.energy, broll, g.section);
    const isHeroBeat = isDrop || idx === 0; // section openers + drops are hero keyframes
    const look = lookForSection(g.section);

    const camera = creative.cameraMotions[idx % creative.cameraMotions.length];
    const fx = isDrop || shotType === "vfx"
      ? creative.fxPalette.join(", ")
      : creative.fxPalette[idx % creative.fxPalette.length];

    let scene: string;
    if (broll) {
      scene = BROLL_SUBJECTS[idx % BROLL_SUBJECTS.length] + ` — ${g.section} texture.`;
    } else if (isDrop) {
      scene = `DROP HERO — ${creative.intent.split(".")[0]}. Fendi hits the beat in ${look.split(":")[0]}; ${fx}.`;
    } else {
      scene = `${g.section.replace("_", " ")} performance — Fendi to camera; ${creative.environment.split(" — ")[0]}.`;
    }

    const dependencies: TreatmentClip["dependencies"] = [];
    if (shotType === "performance") {
      dependencies.push({
        kind: "reference_image",
        look: look.split(":")[0],
        note: "Cut from master closet performance (IMG_5633.mov); wardrobe swap to locked look via keyframe+propagation (see VIDEO_SWAP_ARCHITECTURE.md).",
      });
    }
    if (shotType === "vfx" || g.section.startsWith("hook")) {
      dependencies.push({
        kind: "look_composite",
        look: look.split(":")[0],
        note: "Composite performance onto generated luxury-runway world; frost/particle FX pass.",
      });
    }

    return {
      key: g.key,
      start: g.start,
      end: g.end,
      section: g.section,
      energy: g.energy,
      shot_type: shotType,
      scene_description: scene,
      camera_direction: camera,
      lighting: creative.lighting,
      wardrobe: look,
      environment: creative.environment,
      recommended_tool: toolFor(shotType, g.energy),
      lyric_ref: null,
      priority: isHeroBeat ? "hero" : g.section.startsWith("hook") ? "high" : "normal",
      dependencies,
    };
  });
}

// ---------------------------------------------------------------------------
// TreatmentClip -> ShotSpec (inlined from lib/treatment/api.ts to stay off the
// supabase import; logic mirrors treatmentClipToShotSpec exactly).
// ---------------------------------------------------------------------------
const DEP_KINDS = new Set(["look_composite", "faceswap_still", "reference_image", "other"]);

function specKindFromShotType(shotType: string): ShotKind {
  if (shotType === "performance") return "performance";
  if (shotType === "b_roll") return "broll";
  return "generated";
}

function clipToShotSpec(clip: TreatmentClip, order: number): ShotSpec {
  const shotType: ShotTypeLiteral = SPEC_SHOT_TYPES.includes(clip.shot_type as ShotTypeLiteral)
    ? (clip.shot_type as ShotTypeLiteral)
    : "b_roll";
  const priority: ShotPriorityLiteral = SHOT_PRIORITIES.includes(clip.priority as ShotPriorityLiteral)
    ? (clip.priority as ShotPriorityLiteral)
    : "normal";
  const engine: RenderEngine | null = RENDER_ENGINES.includes(clip.recommended_tool as RenderEngine)
    ? (clip.recommended_tool as RenderEngine)
    : null;

  return parseShotSpec({
    id: clip.key,
    order,
    purpose: clip.scene_description,
    kind: specKindFromShotType(clip.shot_type),
    shotType,
    priority,
    timeline: { start: clip.start, end: clip.end },
    wardrobe: { name: clip.wardrobe.split(":")[0].trim(), description: clip.wardrobe },
    environment: { description: clip.environment },
    lighting: { description: clip.lighting },
    cameraMotion: { description: clip.camera_direction },
    fx: shotType === "vfx" ? [{ type: "vfx", description: clip.scene_description }] : [],
    generation: {
      required: !!engine && engine !== "manual",
      engine,
    },
    reconstruction:
      clip.shot_type === "performance"
        ? {
            required: true,
            mode: "keyframe_propagation",
            preserve: ["face", "scene", "body"],
            notes: "Preserve Fendi identity + master performance; swap wardrobe to locked look.",
          }
        : { required: false },
    status: "planned",
    provenance: {
      source: "ai",
      createdAt: ANALYSIS.analyzed_at,
      model: MODEL,
    },
  });
}

// ---------------------------------------------------------------------------
// Build + emit
// ---------------------------------------------------------------------------
const grid = buildClipGrid({ analysis: ANALYSIS });
const clips = buildClips(grid);
const specs = clips.map((c, i) => clipToShotSpec(c, i));

const structuredTreatment = {
  version: 2 as const,
  project_type: "music_video" as const,
  concept:
    "THE COLD ROOM — Fendi's real full-song closet performance is transformed, section by section, into a shifting luxury world: a jewel vault, an infinite mirrored runway, a designer showroom, an after-hours neon boutique, and finally a gallery. The garments are the 'ice' — jewel-lit, frost-wrapped. Luxury runway fashion film × designer commercial × kinetic rap. The closet must stop reading as a closet.",
  narrative:
    "We open on Fendi caged in a cold vault (the closet as a jewel safe). As the verse ignites, the walls slide back into an infinite mirrored wardrobe; the pre-hook cracks a corridor of light. On the drop, the closet is gone — a full luxury runway with volumetric shafts and suspended frost, Fendi in White Ice (Look B). Verse two cools into a glass-vitrine designer showroom (commercial polish). Hook two escalates the runway. The bridge exhales in a neon after-hours boutique (Look C). The final hook returns to the closet — but it is now a lit gallery, the transformation permanent — mirror-multiplied hero and a hard button.",
  sections: SECTIONS.map((s) => ({
    name: s.name,
    intent: (CREATIVE[s.name] ?? CREATIVE.verse_1).intent,
  })),
  clips,
  model: MODEL,
  generated_at: ANALYSIS.analyzed_at,
  text:
    "THE COLD ROOM — YSL (Ice On) full-song treatment. Transform Fendi's real closet performance into a luxury-runway world across 8 sections; >=2 YSL looks (Onyx Tailoring / White Ice / Noir Slip accent).",
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../docs/treatments");
mkdirSync(outDir, { recursive: true });

writeFileSync(
  resolve(outDir, "ysl-ice-on.treatment.json"),
  JSON.stringify(structuredTreatment, null, 2) + "\n",
);
writeFileSync(
  resolve(outDir, "ysl-ice-on.shotspecs.json"),
  JSON.stringify(specs, null, 2) + "\n",
);

// Coverage report to stdout.
const total = grid.length ? grid[grid.length - 1].end : 0;
const covered = clips.reduce((a, c) => a + (c.end - c.start), 0);
const bySection: Record<string, number> = {};
for (const c of clips) bySection[c.section] = (bySection[c.section] ?? 0) + 1;
const byType: Record<string, number> = {};
for (const c of clips) byType[c.shot_type] = (byType[c.shot_type] ?? 0) + 1;
const heroes = clips.filter((c) => c.priority === "hero").length;

console.log(`YSL (Ice On) full-song treatment — seed generated`);
console.log(`  project: ${PROJECT_ID}`);
console.log(`  duration: ${DURATION}s (provisional) · ${grid.length} clips · ${covered.toFixed(1)}s covered (${((covered / DURATION) * 100).toFixed(1)}%)`);
console.log(`  sections: ${JSON.stringify(bySection)}`);
console.log(`  shot_types: ${JSON.stringify(byType)}`);
console.log(`  hero keyframes: ${heroes}`);
console.log(`  wrote docs/treatments/ysl-ice-on.treatment.json (${JSON.stringify(structuredTreatment).length} bytes)`);
console.log(`  wrote docs/treatments/ysl-ice-on.shotspecs.json (${specs.length} specs, all schema-validated)`);
