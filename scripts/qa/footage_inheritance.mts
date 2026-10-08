/**
 * FOOTAGE INHERITANCE — for every variation of a project, what footage each shot actually resolves to, and
 * where that answer came from. Read-only: it reads a row snapshot and prints. It submits nothing, writes nothing
 * and generates nothing.
 *
 *     npx tsx scripts/qa/footage_inheritance.mts --rows <snapshot.json>
 *     npx tsx scripts/qa/footage_inheritance.mts --rows <snapshot.json> --variation <id>   # one variation
 *
 * The snapshot is the rows the app itself reads, exported as they are in the database:
 *     { variations: [...], shots: [...], assets: [...], syncs: [...], assignments: [...] }
 * (public.video_variations, public.shots, public.project_assets, public.performance_syncs,
 *  public.shot_asset_assignments). Any owner-credentialled read will do — the AVT MCP server, or Lovable's SQL
 * editor — because RLS hides most of this from the publishable key, and a zero read under the anon key is not
 * evidence of absence.
 *
 * EVERY decision printed here is made by the shipped modules — `mediaAssetOf`, `boxFromRow`, `boxMedia`,
 * `takeCoverage` — handed the rows the app would have. There is no second implementation to drift from the app,
 * which is the whole point: if this says an original take reaches a variation's shots, the app says it too.
 */
import { readFileSync } from "node:fs";
import { boxFromRow, type BoxRow } from "../../src/lib/storyboard/boxes";
import { boxMedia, type Assignment, type MediaAsset, type TakeSync } from "../../src/lib/storyboard/media";
import { coverageLabel } from "../../src/lib/storyboard/footageEdit";
import { mediaAssetOf } from "../../src/lib/queries/storyboard";

type Snapshot = {
  variations: { id: string; name: string; project_id: string; duplicated_from?: string | null }[];
  shots: Record<string, unknown>[];
  assets: Record<string, unknown>[];
  syncs: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
};

const arg = (flag: string): string | null => {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
};

const file = arg("--rows");
if (!file) {
  console.error("usage: npx tsx scripts/qa/footage_inheritance.mts --rows <snapshot.json> [--variation <id>]");
  process.exit(2);
}
const snap = JSON.parse(readFileSync(file, "utf8")) as Snapshot;

const syncOf = (r: Record<string, unknown>): TakeSync => ({
  id: String(r.id),
  projectId: String(r.project_id),
  songAssetId: (r.song_asset_id as string | null) ?? null,
  performanceAssetId: String(r.performance_asset_id),
  offsetSeconds: Number(r.offset_seconds),
  driftPpm: Number(r.drift_ppm ?? 0),
  method: String(r.method ?? "manual"),
  status: String(r.status ?? "auto"),
} as unknown as TakeSync);

const assignmentOf = (r: Record<string, unknown>): Assignment => ({
  id: String(r.id),
  projectId: String(r.project_id),
  shotId: String(r.shot_id),
  assetId: String(r.asset_id),
  role: r.role as Assignment["role"],
  sourceIn: (r.source_in_seconds as number | null) ?? null,
  sourceOut: (r.source_out_seconds as number | null) ?? null,
  trimHead: (r.trim_head_seconds as number | null) ?? 0,
  trimTail: (r.trim_tail_seconds as number | null) ?? 0,
  excluded: (r.excluded as boolean | null) ?? false,
  isPrimary: r.is_primary === true,
  sortOrder: Number(r.sort_order ?? 0),
  notes: (r.notes as string | null) ?? null,
  createdAt: String(r.created_at ?? ""),
  updatedAt: String(r.updated_at ?? ""),
});

const assets = new Map<string, MediaAsset>();
for (const a of snap.assets) {
  const m = mediaAssetOf(a as never);
  assets.set(m.id, m);
}
const syncs = snap.syncs.map(syncOf);
const assignments = snap.assignments.map(assignmentOf);

// The takes the PROJECT holds, which is the layer every variation inherits. A restaged or composited clip is one
// moment of a take made for one shot — it is not coverage, and is listed separately so the two are never confused.
const takes = [...assets.values()].filter((a) => a.footageRole === "performance" && a.isVideo && !a.derivedFrom);
const derived = [...assets.values()].filter((a) => a.footageRole === "performance" && a.derivedFrom);
const usable = new Set(syncs.filter((s) => s.status === "confirmed" || s.status === "manual").map((s) => s.performanceAssetId));

console.log("=== the project's own footage (shared by every variation) ===");
for (const t of takes) {
  const s = syncs.find((x) => x.performanceAssetId === t.id);
  const ends = s && t.durationSeconds ? s.offsetSeconds + t.durationSeconds : null;
  console.log(
    `  take  ${t.name}  ${t.durationSeconds?.toFixed(2) ?? "?"} s  ` +
      (s ? `sync ${s.status}/${s.method} +${s.offsetSeconds.toFixed(4)} s → covers song ${s.offsetSeconds.toFixed(2)}–${ends!.toFixed(2)} s` : "NOT MATCHED TO THE SONG"),
  );
}
if (!takes.length) console.log("  none — nothing has been uploaded with footage_role = 'performance'");
console.log(`  (plus ${derived.length} restaged/composited clip(s), each made for one shot of one variation — not coverage)`);

const only = arg("--variation");
for (const v of snap.variations) {
  if (only && v.id !== only) continue;
  const shots = snap.shots.filter((s) => s.variation_id === v.id);
  if (!shots.length) continue;
  const mine = assignments.filter((a) => shots.some((s) => s.id === a.shotId));
  const boxes = shots.map((s) => boxFromRow(s as unknown as BoxRow)).filter((b): b is NonNullable<typeof b> => !!b && b.end > b.start);

  const tally = { inherited: 0, trimmed: 0, excluded: 0, assigned: 0, none: 0 };
  const lines: string[] = [];
  for (const box of boxes.sort((a, b) => a.start - b.start)) {
    const m = boxMedia({ box, assignments: mine, assets, syncs });
    const take = m.items.find((i) => i.role === "performance" && !i.asset.derivedFrom);
    const where = !take ? "none" : take.base ? "inherited" : take.edit?.from === "excluded" ? "excluded" : take.edit?.from === "trimmed" ? "trimmed" : "assigned";
    tally[where as keyof typeof tally]++;
    lines.push(
      `    ${String(box.key ?? box.id).padEnd(6)} song ${box.start.toFixed(2)}–${box.end.toFixed(2)}  ` +
        (take
          ? `${where.padEnd(9)} ${take.asset.name} ${take.sourceIn?.toFixed(2) ?? "—"}–${take.sourceOut?.toFixed(2) ?? "—"} s` +
            (take.edit ? ` · ${coverageLabel(take.edit)}` : "")
          : "no original take reaches this shot"),
    );
  }

  console.log(`\n=== ${v.name} ===`);
  console.log(`  ${boxes.length} shot(s); ${mine.length} footage row(s) of its own${v.duplicated_from ? `; duplicated from ${v.duplicated_from}` : ""}`);
  console.log(
    `  original take reaches: ${tally.inherited} inherited, ${tally.assigned} put on the shot, ${tally.trimmed} trimmed here, ` +
      `${tally.excluded} left out here, ${tally.none} not reached`,
  );
  if (process.argv.includes("--shots")) console.log(lines.join("\n"));
  // the one thing that is a defect rather than a decision
  if (tally.inherited + tally.assigned + tally.trimmed === 0) {
    console.log("  ⚠ NO shot of this variation can reach an original take — inheritance is broken here");
  }
  const unsynced = takes.filter((t) => !usable.has(t.id));
  if (unsynced.length) console.log(`  ⚠ ${unsynced.length} take(s) have no usable sync, so they are offered to no shot of any variation`);
}
