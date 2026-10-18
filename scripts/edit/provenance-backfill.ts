/**
 * Backfill edit_clips.mouth from each clip's asset lineage, with the same resolver the app and edge functions use
 * (supabase/functions/_shared/performanceProvenance.ts). Reads JSON dumps, prints SQL that updates `mouth` ONLY,
 * keyed by clip id and guarded by the value it expects to replace (so a row edited since is left alone).
 *
 *   npx tsx scripts/edit/provenance-backfill.ts clips.json assets.json jobs.json > backfill.sql
 *
 * clips.json:  rows of edit_clips { id, asset_id, track, mouth }
 * assets.json: rows of project_assets { id, asset_type, footage_role, source_tool, parent_asset_id, metadata_json }
 * jobs.json:   rows { id, settings } (provider_jobs.request_payload_json->settings)
 */
import { readFileSync } from "node:fs";
import {
  resolvePerformance,
  type ProvenanceAsset,
  type ProvenanceJob,
} from "../../supabase/functions/_shared/performanceProvenance.ts";

type Row = Record<string, unknown>;
function rowsOf(path: string): Row[] {
  const text = readFileSync(path, "utf8");
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { rows?: Row[] } | Row[];
  return Array.isArray(json) ? json : (json.rows ?? []);
}

const [clipsPath, assetsPath, jobsPath] = process.argv.slice(2);
if (!clipsPath || !assetsPath || !jobsPath) throw new Error("usage: provenance-backfill.ts clips.json assets.json jobs.json");
const assets = new Map(rowsOf(assetsPath).map((a) => [String(a.id), a as unknown as ProvenanceAsset]));
const jobs = new Map(rowsOf(jobsPath).map((j) => [String(j.id), { id: String(j.id), settings: j.settings } as ProvenanceJob]));
const q = (v: string | null) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);

const lines: string[] = [];
const counts: Record<string, number> = {};
const changes: Record<string, number> = {};
for (const c of rowsOf(clipsPath)) {
  if (c.track !== "V1") continue;
  const p = resolvePerformance(typeof c.asset_id === "string" ? c.asset_id : null, assets, jobs);
  const to = p.mouth;
  counts[to ?? "null"] = (counts[to ?? "null"] ?? 0) + 1;
  const from = typeof c.mouth === "string" ? c.mouth : null;
  if (from === to) continue;
  const key = `${from ?? "null"}->${to ?? "null"}`;
  changes[key] = (changes[key] ?? 0) + 1;
  lines.push(`  (${q(String(c.id))}::uuid, ${q(from)}, ${q(to)}), -- ${p.reason}`);
}
console.log(`-- after: ${JSON.stringify(counts)}`);
console.log(`-- changes: ${JSON.stringify(changes)}`);
if (lines.length) {
  lines[lines.length - 1] = lines[lines.length - 1]!.replace(/\), -- /, ") -- ");
  console.log("update public.edit_clips c set mouth = v.next\nfrom (values");
  console.log(lines.join("\n"));
  console.log(") as v(id, prev, next)\nwhere c.id = v.id and c.mouth is not distinct from v.prev;");
}
