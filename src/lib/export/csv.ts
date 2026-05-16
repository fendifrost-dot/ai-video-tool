/**
 * Minimal CSV writer with RFC 4180 quoting. No external dep.
 */

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((row) => row.map(toCsvCell).join(",")).join("\n");
}

function toCsvCell(v: string | number | boolean | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Project-specific CSV builders
// ---------------------------------------------------------------------------
import type {
  ProjectAsset,
  Prompt,
  PromptTemplate,
  Shot,
} from "@/integrations/supabase/types";

export const SHOT_LIST_HEADER = [
  "shot_number",
  "song_section",
  "t_start",
  "t_end",
  "duration",
  "shot_type",
  "scene_description",
  "camera_direction",
  "lighting",
  "wardrobe",
  "environment",
  "recommended_tool",
  "priority",
  "status",
  "approved_clip_filename",
  "notes",
] as const;

export function buildShotListCsv(
  shots: Shot[],
  approvedClipsByShot: Record<string, ProjectAsset>,
): string {
  const rows: (string | number | null | undefined)[][] = [Array.from(SHOT_LIST_HEADER)];
  for (const s of shots) {
    const approved = approvedClipsByShot[s.id];
    rows.push([
      s.shot_number,
      s.song_section,
      s.timestamp_start,
      s.timestamp_end,
      s.duration_seconds,
      s.shot_type,
      s.scene_description,
      s.camera_direction,
      s.lighting,
      s.wardrobe,
      s.environment,
      s.recommended_tool,
      s.priority,
      s.status,
      approved ? approvedFilename(approved, s.shot_number) : null,
      s.notes,
    ]);
  }
  return toCsv(rows);
}

export const PROMPT_LOG_HEADER = [
  "prompt_id",
  "shot_number",
  "provider",
  "template_name",
  "version",
  "prompt_text",
  "negative_prompt",
  "settings_summary",
  "result_asset_filename",
  "approved",
  "created_at",
] as const;

export function buildPromptLogCsv(
  prompts: Prompt[],
  shotsById: Record<string, Shot>,
  templatesById: Record<string, PromptTemplate>,
  assetsById: Record<string, ProjectAsset>,
): string {
  const rows: (string | number | null | undefined)[][] = [Array.from(PROMPT_LOG_HEADER)];
  for (const p of prompts) {
    const shot = p.shot_id ? shotsById[p.shot_id] ?? null : null;
    const template = p.template_id ? templatesById[p.template_id] ?? null : null;
    const asset = p.result_asset_id ? assetsById[p.result_asset_id] ?? null : null;
    rows.push([
      p.id,
      shot?.shot_number,
      p.provider,
      template?.name,
      p.version_number,
      p.prompt_text,
      p.negative_prompt,
      compactSettings(p.settings_json),
      asset ? approvedFilename(asset, shot?.shot_number) : null,
      asset?.approval_status === "approved",
      p.created_at,
    ]);
  }
  return toCsv(rows);
}

export function approvedFilename(asset: ProjectAsset, shotNumber?: number | null): string {
  const meta = asset.metadata_json as { original_filename?: string } | null;
  const orig = meta?.original_filename ?? "asset";
  const ext = orig.includes(".") ? orig.slice(orig.lastIndexOf(".")) : "";
  const prefix =
    shotNumber != null
      ? `shot_${String(shotNumber).padStart(3, "0")}_${asset.asset_type}`
      : `${asset.asset_type}_${asset.id.slice(0, 8)}`;
  return `${prefix}${ext}`;
}

function compactSettings(settings: unknown): string {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return "";
  return Object.entries(settings as Record<string, unknown>)
    .map(([k, v]) => `${k}=${formatVal(v)}`)
    .join("; ");
}

function formatVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}
