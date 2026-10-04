/**
 * Whether a clip does what it was asked to — the effects. The findings are storyboard/acceptance.ts; this reads what
 * a clip was asked for off the job that made it, and keeps a person's judgements on the clip's own asset
 * (`metadata_json.acceptance`) beside the measurements.
 */
import { supabase } from "@/lib/supabase";
import { parseAcceptance, withJudgement, type AcceptanceRecord, type ClipAsk, type Requirement } from "@/lib/storyboard/acceptance";
import { settingsOf, type BatchJobRow } from "@/lib/worldBatch";

/** What the job that made a clip asked for: its timed script, and whether it was restaged from a take. Null for a job that made no video. */
export function askOfJob(job: Pick<BatchJobRow, "request_payload_json">): ClipAsk | null {
  const s = settingsOf(job as BatchJobRow);
  if (!s) return null;
  const w = s.sourceWindow;
  return {
    asked: (s.temporal?.asked ?? []).map((b) => ({ id: b.id, offset: b.offset, kinds: b.kinds ?? [], says: b.says ?? "" })),
    fromTake: !!s.sourceAssetId && !!w && w[1] > w[0],
  };
}

/** What each generated clip was asked for, by the asset the job produced. */
export function asksByAsset(jobs: readonly (Pick<BatchJobRow, "request_payload_json"> & { result_asset_id?: string | null })[]): Map<string, ClipAsk> {
  const out = new Map<string, ClipAsk>();
  for (const j of jobs) {
    if (!j.result_asset_id) continue;
    const ask = askOfJob(j);
    if (ask) out.set(j.result_asset_id, ask);
  }
  return out;
}

/**
 * Keep one judgement on the clip (or take it back, with `finding` null). The file is not touched; the measurements
 * and everything else on the asset stay as they are.
 */
export async function saveJudgement(assetId: string, requirement: Requirement, finding: "meets" | "fails" | null, note: string): Promise<AcceptanceRecord> {
  const { data, error } = await supabase.from("project_assets").select("metadata_json").eq("id", assetId).single();
  if (error) throw new Error(`could not read the clip's record: ${error.message}`);
  const before = (data?.metadata_json ?? {}) as Record<string, unknown>;
  const record = withJudgement(parseAcceptance(before.acceptance), requirement, finding, note, new Date().toISOString());
  const { error: upErr } = await supabase.from("project_assets").update({ metadata_json: { ...before, acceptance: record } as never }).eq("id", assetId);
  if (upErr) throw new Error(`could not keep the judgement: ${upErr.message}`);
  return record;
}
