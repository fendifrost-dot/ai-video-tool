/**
 * Builds a YSL-shaped project (43 shots on the real board's cut points, a 190 s take that starts 0.85 s after the
 * song, an AI clip, an AI image, a B-roll clip) out of the app's own box code, for a browser run against the
 * stand-in backend. Nothing here is the user's data. Run from the repo root: npx tsx scripts/e2e-local/mkfixtures.ts
 */
import { writeFileSync } from "node:fs";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { planMaterialize } from "@/lib/storyboard/boxes";

const P = "11111111-1111-4111-8111-111111111111";
const U = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
// a second project that has a song and plain lyrics and nothing else: Setup times its lyrics for the first time
const P2 = "44444444-4444-4444-8444-444444444444";
const AT = "2026-10-03T03:00:00.000Z";
// the real YSL board's cut points, and its song length
const CUTS = [0, 3.92, 7.84, 11.76, 15.69, 19.61, 23.53, 27.45, 31.37, 35.29, 39.22, 43.14, 47.06, 50.98, 54.9, 58.82, 62.75, 66.67, 70.59, 76.47, 82.35, 88.24, 92.16, 96.08, 101.96, 107.84, 111.76, 117.65, 123.53, 129.41, 135.29, 139.22, 145.1, 150.98, 156.86, 160.78, 164.71, 168.63, 174.51, 178.43, 182.35, 188.24, 194.12, 201.87];
const TYPES = ["vfx", "performance", "lyric_visual", "performance", "performance", "b_roll", "performance", "narrative", "b_roll", "performance", "narrative", "b_roll"];
const KIND: Record<string, string> = { performance: "performance", b_roll: "broll", narrative: "broll", lyric_visual: "broll", vfx: "broll" };
const uuid = (n: number, p = "aaaaaaaa") => `${p}-0000-4000-8000-${String(n).padStart(12, "0")}`;

const specs = CUTS.slice(0, -1).map((start, i) => {
  const key = `c${String(i + 1).padStart(3, "0")}`;
  const shotType = TYPES[i % TYPES.length];
  return parseShotSpec({ id: key, purpose: `Scene ${i + 1}: what happens in shot ${i + 1} of the board.`, shotType, kind: KIND[shotType], timeline: { start, end: CUTS[i + 1] } });
});
const plan = planMaterialize({ specs, existing: [], at: AT, sections: Object.fromEntries(specs.map((s, i) => [s.id, i < 4 ? "intro" : i % 5 === 0 ? "hook" : "verse"])) });
const shots = plan.inserts.map((w, i) => ({ id: uuid(i + 1), project_id: P, user_id: U, shot_number: i + 1, status: "planned", priority: "normal", created_at: AT, updated_at: AT, locked_look_id: null, ...w }));
const shotId = (key: string) => shots.find((s) => s.spec_key === key)!.id;

const asset = (n: number, over: Record<string, unknown>) => ({ id: uuid(n, "bbbbbbbb"), project_id: P, user_id: U, shot_id: null, notes: null, source_tool: "manual", footage_role: null, created_at: `2026-10-0${1 + (n % 2)}T00:00:0${n}.000Z`, updated_at: AT, ...over });
const assets = [
  asset(1, { asset_type: "audio", file_url: "song.wav", metadata_json: { original_filename: "song master.wav", mime_type: "audio/wav", duration_seconds: 201.87 } }),
  asset(2, { asset_type: "reference_video", footage_role: "performance", file_url: "take.mp4", metadata_json: { original_filename: "performance take.mp4", mime_type: "video/mp4", duration_seconds: 190.34 } }),
  asset(3, { asset_type: "generated_clip", source_tool: "higgsfield", shot_id: shotId("c006"), file_url: "clip.mp4", metadata_json: { mime_type: "video/mp4", duration_seconds: 5, provider_job_id: "job-1" } }),
  asset(4, { asset_type: "reference_image", source_tool: "grok", shot_id: shotId("c009"), file_url: "still.png", metadata_json: { mime_type: "image/png", shot_label: "storyboard_c009", bucket: "project-references" } }),
  asset(5, { asset_type: "reference_video", footage_role: "b_roll", file_url: "broll.webm", metadata_json: { original_filename: "street b-roll.webm", mime_type: "video/webm", duration_seconds: 8 } }),
];
const assignments = [
  { id: uuid(1, "cccccccc"), project_id: P, shot_id: shotId("c006"), asset_id: assets[2].id, role: "generated_clip", source_in_seconds: 0, source_out_seconds: null, is_primary: true, sort_order: 1, created_at: AT, updated_at: AT },
  { id: uuid(2, "cccccccc"), project_id: P, shot_id: shotId("c009"), asset_id: assets[3].id, role: "generated_image", source_in_seconds: null, source_out_seconds: null, is_primary: true, sort_order: 1, created_at: AT, updated_at: AT },
];
const LYR: [number, number, string][] = [
  [14.68, 16.72, "You don't gotta cut the lights on"], [16.72, 17.52, "This ice on"], [17.52, 19.48, "YSL I wear em like They white ones"], [19.48, 20.4, "I don't follow brands"],
  [20.54, 21.28, "Follow designers"], [21.28, 22.68, "The rims 21 don't ride"], [22.68, 23.38, "No minors"], [23.38, 24.32, "More cameras in the whip"], [24.32, 25.12, "Than a camera crew"],
  [25.14, 26.24, "All this ice around me"], [26.24, 27.04, "Need a Canada goose"], [27.04, 28.2, "So clean but I don't do"], [28.2, 29.0, "What the janitor do"], [40.64, 41.04, "Woooooo"], [41.04, 47.6, "know you see it"],
];
const fixtures = {
  user: { id: U, email: "local@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: AT },
  tables: {
    video_projects: [{ id: P, user_id: U, artist_id: A, title: "YSL (Ice On) — local copy", song_title: "YSL (Ice On)", genre: "house", bpm: 122, mood: "Opulent, cool, confident.", visual_style: "High-end fashion editorial meets 90s house club.", color_palette: null, wardrobe_notes: null,
      lyrics: LYR.map((l) => l[2]).join("\n"), song_structure_json: null, status: "in_progress", notes: null, created_at: AT, updated_at: AT, creative_exemplars: null,
      treatment_json: { treatment: { text: "A single hard light illuminates diamonds and designer pieces in mirror-multiplied darkness.", mode: "ai", updated_at: AT, model: "local", notes: null, storyboard: null }, setup: { footage_confirmed_at: AT } } },
      { id: P2, user_id: U, artist_id: A, title: "Untimed — local copy", song_title: "Untimed", genre: "house", bpm: 122, mood: null, visual_style: null, color_palette: null, wardrobe_notes: null,
        lyrics: LYR.map((l) => l[2]).join("\n"), song_structure_json: null, status: "in_progress", notes: null, created_at: AT, updated_at: AT, creative_exemplars: null, treatment_json: null }],
    artists: [{ id: A, user_id: U, name: "Fendi Frost", created_at: AT, updated_at: AT }],
    shots,
    project_assets: [...assets, { ...assets[0], id: uuid(9, "bbbbbbbb"), project_id: P2 }],
    shot_asset_assignments: assignments,
    performance_syncs: [{ id: uuid(1, "dddddddd"), project_id: P, user_id: U, performance_asset_id: assets[1].id, song_asset_id: assets[0].id, offset_seconds: 0.8538, drift_ppm: 0, status: "manual", method: "manual", confidence_json: {}, notes: null, created_at: AT, updated_at: AT }],
    lyric_lines: LYR.map(([s, e, text], i) => ({ id: uuid(i + 1, "eeeeeeee"), project_id: P, user_id: U, line_index: i, section: null, block: null, text, start_seconds: s, end_seconds: e, confidence: 0.9, words_json: null, source: "align_lyrics", created_at: AT, updated_at: AT })),
    song_analyses: [P, P2].map((project_id, i) => ({ id: uuid(i + 1, "ffffffff"), project_id, user_id: U, bpm: 122, duration_seconds: 201.87, beats_json: [], drops_json: [], energy_curve_json: [], sections_json: [], created_at: AT, updated_at: AT })),
  },
  // what the stand-in transcriber "hears": the lyric lines at their true times
  sung: LYR,
  ids: { P, P2, U, A },
};
writeFileSync("scripts/e2e-local/fixtures.json", JSON.stringify(fixtures));
console.log("boxes", shots.length, "assets", assets.length);
