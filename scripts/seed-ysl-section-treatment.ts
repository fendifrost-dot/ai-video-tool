/**
 * YSL (Ice On) — 30–60 s production validation section (bars 24–46).
 * Deterministic, $0, no DB writes. Emits docs/treatments/ysl-ice-on.section-bars24-46.shotspecs.json
 *
 *   npx tsx scripts/seed-ysl-section-treatment.ts
 *
 * Every shot lives on the SONG clock (bar grid measured from the album master, 122.00 BPM)
 * and, for performance shots, resolves to a SOURCE RANGE on the performance master via the
 * canonical sync (song = master + 0.8538 s). No number below is typed by hand.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseShotSpec, type ShotSpec } from "../src/lib/treatment/shotSpec";
import {
  YSL_ICE_ON_GRID,
  YSL_ICE_ON_PERFORMANCE_SYNC,
  barStartSeconds,
  sourceRangeForSongRange,
} from "../src/lib/sync/performanceSync";

const PROJECT_ID = "764a63d2-93cd-44f3-905f-292f14ab2f51";
const MASTER_1080 = "70304981-d375-47a9-81df-aa062c62c6ec"; // hero_clip_hd_1080.mp4 (video only, 1080×1920@59.94)
const MASTER_AUDIO_SOURCE = "55bdc383-50e7-41b8-9ec9-8bda031ac5e0"; // IMG_5633.mov (audio carrier for sync)
const PERFORMANCE_DURATION_S = 190.33;
const LOOK_SL_TRACK = "0feb028f-dc4d-45dc-82ac-e4bbd16054b0"; // Saint Laurent Track Jacket — Mastic Cotton Navy Stripe (wardrobe feature)
const LOOK_SL_TRUCKER = "f6455042-faec-4a07-b6a2-cb0525a69c65"; // YSL Trucker Jacket — French Black Denim (wardrobe feature)
/**
 * Accepted wardrobe renders (xAI /v1/videos/edits via grok-video-edit-proxy, 2026-09-20).
 * Each passed Gate 0 on moving footage; provenance (cost, attempt, decision, reason) lives in
 * the asset's metadata_json.provenance. S08 attempt 1 (236f30f5) was rejected; S06 env v2v
 * test (255417f1) was rejected — environment is composited, not regenerated.
 */
const WARDROBE_OUTPUT_ASSETS: Record<string, string> = {
  S01: "ac4ca37d-8544-4bf8-a20a-876a1bd51318",
  S03: "a4f84701-6796-4cfb-a500-f6ad4681847d",
  S04: "e9fb4348-df08-4616-be79-0d80334f2fe8",
  S06: "d36c0309-875f-4b58-837b-2e0b68ac7cfd",
  S08: "2daf6190-e623-40bb-8986-92ec1e51de5c",
  S09: "8db0030f-f4ca-4032-8e28-b58bdc797bba",
  S11: "ab3ba0f2-5f21-4ef9-b7d8-7c143dde2337",
  S12: "efa48177-0132-483a-a565-81258288fa87",
};
/** Section cuts uploaded 2026-09-20 as generated_clip assets (master ranges + 0.5 s handles, 1080×1920 30 fps). */
const SOURCE_CUT_ASSETS: Record<string, string> = {
  S01: "ffc1da5e-8fc8-46af-a8f7-e43ac94dda75",
  S03: "7aef4f67-5466-40d7-9f69-b4f0a92f79fb",
  S04: "3d2ab326-c5cc-4db2-bc3e-7a303cfa60c9",
  S06: "939662aa-4ec0-4a87-897d-90068074b7a2",
  S08: "e5cfeebc-1780-42e7-8f30-5f157f64ff85",
  S09: "84ce32ab-12f2-435e-bfb7-d8e970544544",
  S11: "770ab475-2072-46e8-a7b5-a9631880f0e5",
  S12: "9a087c22-4877-47f4-ace6-07e61bdc54e7",
};

const ENV_PREHOOK =
  "The closet becomes a cold, dark fitting room: matte charcoal walls, one hard key from camera-left, a single mirror panel behind Fendi multiplying the highlight, floor haze. The door and shelves must not read as the original closet.";
const ENV_HOOK =
  "Same cold room after the drop: the mirror panel splits into several, blue-white 'ice' rim light, diamond refraction glints on the walls, deeper black, harder contrast. Fendi, his pose and his scale are untouched.";

const bar = (b: number) => barStartSeconds(b, YSL_ICE_ON_GRID);
const song = (b0: number, b1: number) => ({ start: bar(b0), end: bar(b1) });

type Perf = { id: string; b0: number; b1: number; look: string; title: string; purpose: string; framing: ShotSpec["framing"]; motion: string; env: string; transitionIn?: { type: "cut" | "flash" | "glitch" | "fade_white"; durationSeconds?: number } };

function performance(p: Perf, order: number): ShotSpec {
  const timeline = song(p.b0, p.b1);
  const src = sourceRangeForSongRange(timeline, YSL_ICE_ON_PERFORMANCE_SYNC, PERFORMANCE_DURATION_S);
  if (!src) throw new Error(`${p.id}: song range not covered by the performance master`);
  return parseShotSpec({
    id: p.id,
    title: p.title,
    order,
    purpose: p.purpose,
    kind: "performance",
    shotType: "performance",
    priority: "hero",
    timeline,
    source: {
      kind: "captured",
      mediaId: MASTER_1080,
      range: src,
      note: `Master range on ${MASTER_1080} (song − 0.8538 s). Cut with +0.5 s handles for the video edit; audio sync source ${MASTER_AUDIO_SOURCE}.`,
    },
    wardrobe: {
      name: p.look === LOOK_SL_TRACK ? "Saint Laurent Track Jacket — Mastic Cotton Navy Stripe" : "YSL Trucker Jacket — French Black Denim",
      lookId: p.look,
      description: "Placed ON Fendi's real performance via the AVT wardrobe lane (xAI video edit with garment references), then QA'd against the product photos.",
      references: [{ kind: "asset", assetId: p.look, note: "wardrobe feature with product/on-model references" }],
    },
    environment: { description: p.env, location: "cold room (transformed closet)", timeOfDay: "night" },
    framing: p.framing,
    cameraAngle: "eye_level",
    cameraMotion: { type: "static", description: p.motion },
    lighting: { description: "single hard key camera-left, cold rim, black falloff" },
    performanceDirection: "Fendi's real take — no re-performance, no synthetic performer.",
    generation: {
      required: true,
      engine: "grok",
      model: "grok-imagine-video (xAI /v1/videos/edits)",
      prompt: "AVT wardrobe lane prompt (V3 factual corrections) — src/lib/heroFrame/grokVideoEditPrompt.ts",
      parameters: { lane: "architecture_c_grok_video_edit", inputClipHandlesSeconds: 0.5, outputFps: 24, outputRaster: "720x1280", sourceCutAssetId: SOURCE_CUT_ASSETS[p.id] ?? null, wardrobeOutputAssetId: WARDROBE_OUTPUT_ASSETS[p.id] ?? null, promptVersion: p.look === LOOK_SL_TRACK ? "v3-jacket-only" : "trucker-v1" },
      notes: "Gate 0 on moving footage: identity, garment on body, photoreal next to master, anatomy, framing, garment truth.",
    },
    reconstruction: { required: true, notes: "Environment = person matte over a generated plate (scripts/edit/composite_environment.py); a second v2v pass over Fendi was tested and rejected (identity loss)." },
    transitionIn: p.transitionIn ?? { type: "cut" },
    qa: [
      { check: "gate0_identity_visible", mustPass: true },
      { check: "gate0_garment_on_body", mustPass: true },
      { check: "gate0_photoreal_next_to_master", mustPass: true },
      { check: "gate0_anatomy", mustPass: true },
      { check: "gate0_framing", mustPass: true },
      { check: "gate0_garment_truth", mustPass: true, notes: "collar/zip/pockets/cuffs/band vs product photos" },
      { check: "sync_within_one_frame_of_song_clock", mustPass: true },
    ],
    status: WARDROBE_OUTPUT_ASSETS[p.id] ? "generated" : "planned",
    provenance: { source: "human", author: "Claude (takeover)", createdAt: "2026-09-20", notes: "bars/sync computed, not typed" },
  });
}

function broll(id: string, b0: number, b1: number, title: string, purpose: string, prompt: string, order: number, fx: string[] = []): ShotSpec {
  return parseShotSpec({
    id, title, order, purpose, kind: "generated", shotType: "b_roll", priority: "high",
    timeline: song(b0, b1),
    source: { kind: "generated" },
    environment: { description: "cold room / ice motif — matches the performance world", location: "cold room", timeOfDay: "night" },
    framing: "insert", cameraAngle: "eye_level", cameraMotion: { type: "dolly", description: "slow push" },
    lighting: { description: "hard key, cold rim, black falloff" },
    fx: fx.map((f) => ({ type: f, description: f, intensity: 0.6 })),
    generation: { required: true, engine: "grok", model: "Grok Imagine (browser, consumer plan) — image → video", prompt, parameters: { aspect: "9:16", durationSeconds: bar(b1) - bar(b0) }, notes: "No Fendi in B-roll. Supporting department only." },
    qa: [{ check: "purpose_visible_in_frame", mustPass: true }, { check: "no_synthetic_performer", mustPass: true }, { check: "matches_world_lighting", mustPass: true }],
    status: "planned",
    provenance: { source: "human", author: "Claude (takeover)", createdAt: "2026-09-20" },
  });
}

const shots: ShotSpec[] = [];
let o = 0;
shots.push(performance({ id: "S01", b0: 24, b1: 26, look: LOOK_SL_TRUCKER, title: "Pre-hook open", purpose: "Cut in on the downbeat of bar 24 with the real performance in Look 2 — establishes Fendi in the transformed room.", framing: "medium", motion: "locked off; 2 % digital push over the shot", env: ENV_PREHOOK }, o++));
shots.push(broll("S02", 26, 27, "Fashion insert — zip & wordmark", "Reinforce the fashion language on the verse: a product-true macro of the jacket hardware, one bar, on the beat.", "Extreme close-up macro of a black denim jacket's silver rivet and YSL Cassandre stitching, single hard light, cold room, slow push, 9:16", o++));
shots.push(performance({ id: "S03", b0: 27, b1: 30, look: LOOK_SL_TRUCKER, title: "Pre-hook build", purpose: "The rapid-fire bars; his pointing/arm-up gestures at song 54–55 s carry the energy.", framing: "medium", motion: "locked off", env: ENV_PREHOOK }, o++));
shots.push(performance({ id: "S04", b0: 30, b1: 31.5, look: LOOK_SL_TRUCKER, title: "Pre-hook tight", purpose: "Tighter framing (crop of the master) to escalate into the drop.", framing: "medium_close", motion: "locked off, 1.25× crop", env: ENV_PREHOOK }, o++));
shots.push(broll("S05", 31.5, 32, "Ice hit", "Half-bar FX transition into the drop: a diamond refraction flash whites out the frame on the last beat before bar 32.", "Diamond facets refracting a hard white light, flare blooms to white, black background, 9:16, one second", o++, ["flash"]));
shots.push(performance({ id: "S06", b0: 32, b1: 35, look: LOOK_SL_TRACK, title: "Hook drop — Look 1", purpose: "The drop: wardrobe changes to the Saint Laurent track jacket as the hook lands; the room hardens.", framing: "medium", motion: "locked off", env: ENV_HOOK, transitionIn: { type: "flash", durationSeconds: 0.1 } }, o++));
shots.push(broll("S07", 35, 36, "City night insert", "Rhythmic cutaway on the hook's first repeat: luxury/night-city motif that answers 'ice on'.", "Night city street at speed through a car window, wet asphalt reflecting blue-white lights, luxury car interior edge, 9:16", o++));
shots.push(performance({ id: "S08", b0: 36, b1: 39, look: LOOK_SL_TRACK, title: "Hook repeat 2", purpose: "Second hook repeat on the real performance, Look 1, mirror-multiplied room.", framing: "medium", motion: "locked off", env: ENV_HOOK }, o++));
shots.push(performance({ id: "S09", b0: 39, b1: 40, look: LOOK_SL_TRACK, title: "Hook — crossed arms", purpose: "Crossed arms on the hook line, Look 1 (own cut + edit, master 75.868–77.835).", framing: "medium", motion: "locked off", env: ENV_HOOK }, o++));
shots.push(broll("S10", 40, 41, "Mirror strobe", "FX beat: the mirror panels multiply and strobe for one bar — visual escalation before the last two hook repeats.", "Infinity mirror corridor, blue-white strobe, diamond glints, black, 9:16, two seconds", o++, ["glitch"]));
shots.push(performance({ id: "S11", b0: 41, b1: 44, look: LOOK_SL_TRACK, title: "Hook repeat 3", purpose: "Third repeat; he is up-front and direct to camera.", framing: "medium", motion: "locked off", env: ENV_HOOK, transitionIn: { type: "glitch", durationSeconds: 0.1 } }, o++));
shots.push(performance({ id: "S12", b0: 44, b1: 46, look: LOOK_SL_TRACK, title: "Hook out", purpose: "Fourth repeat to the bar-46 downbeat; hard out on the last hit.", framing: "medium", motion: "locked off", env: ENV_HOOK }, o++));

const out = {
  version: 1,
  projectId: PROJECT_ID,
  section: { name: "bars 24–46 (pre-hook + hook block)", songRange: song(24, 46), bars: [24, 46], bpm: YSL_ICE_ON_GRID.bpm, barSeconds: YSL_ICE_ON_GRID.barSeconds },
  // Project context for the review layer (scripts/qa/build_astra_review_package.py templates its
  // brief and standing questions on this block; nothing project-specific lives in that script).
  treatment: {
    artistName: "Fendi",
    authority: "Fendi",
    brand: "YSL / Saint Laurent",
    creativeDirection: "luxury runway fashion film x designer commercial x high-energy contemporary rap video",
    sourceEnvironment: "the original closet (white door, shelves, hanging clothes)",
  },
  sync: { offsetSeconds: YSL_ICE_ON_PERFORMANCE_SYNC.offsetSeconds, driftPpm: YSL_ICE_ON_PERFORMANCE_SYNC.driftPpm, songAssetId: YSL_ICE_ON_PERFORMANCE_SYNC.songAssetId, performanceAssetId: YSL_ICE_ON_PERFORMANCE_SYNC.performanceAssetId },
  looks: { look1: { id: LOOK_SL_TRACK, name: "Saint Laurent Track Jacket — Mastic Cotton Navy Stripe", bars: "32–46 (hook)" }, look2: { id: LOOK_SL_TRUCKER, name: "YSL Trucker Jacket — French Black Denim", bars: "24–32 (pre-hook)" } },
  totals: {
    performanceSeconds: Number(shots.filter((s) => s.kind === "performance").reduce((a, s) => a + (s.timeline.end - s.timeline.start), 0).toFixed(3)),
    brollSeconds: Number(shots.filter((s) => s.kind !== "performance").reduce((a, s) => a + (s.timeline.end - s.timeline.start), 0).toFixed(3)),
  },
  shots,
};
// Production decisions recorded by later stages survive a re-seed: the B-roll planner
// (scripts/edit/render_broll_slots.py --plan) writes generation.parameters.broll into each
// B-roll ShotSpec, and the renderer executes only that. A re-seed must not silently drop it.
const OUT_PATH = "docs/treatments/ysl-ice-on.section-bars24-46.shotspecs.json";
if (existsSync(OUT_PATH)) {
  const prev = JSON.parse(readFileSync(OUT_PATH, "utf8")) as { shots?: Array<{ id: string; generation?: { parameters?: Record<string, unknown> } }> };
  const prevBroll = new Map((prev.shots ?? []).map((s) => [s.id, s.generation?.parameters?.broll]).filter(([, b]) => b != null));
  for (const s of shots) {
    const b = prevBroll.get(s.id);
    if (b != null) s.generation.parameters = { ...s.generation.parameters, broll: b };
  }
}
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${shots.length} shots; performance ${out.totals.performanceSeconds}s, broll/fx ${out.totals.brollSeconds}s`);
for (const s of shots) console.log(s.id.padEnd(4), s.kind.padEnd(11), `song ${s.timeline.start.toFixed(3)}–${s.timeline.end.toFixed(3)}`, s.source.range ? `master ${s.source.range.start.toFixed(3)}–${s.source.range.end.toFixed(3)}` : "", s.wardrobe.lookId ?? "");
