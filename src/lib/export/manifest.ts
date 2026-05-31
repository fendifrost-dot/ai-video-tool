import type {
  Artist,
  ProjectAsset,
  Prompt,
  Shot,
  VideoProject,
} from "@/integrations/supabase/aliases";
import { parseSongStructure } from "@/lib/queries/projects";
import { approvedFilename } from "./csv";
import { approvedClipsByShot } from "./approvedClips";

export type ProjectManifest = {
  schema_version: 1;
  generated_at: string;
  project: {
    id: string;
    title: string;
    song_title: string | null;
    artist: { id: string; name: string } | null;
    genre: string | null;
    bpm: number | null;
    mood: string | null;
    visual_style: string | null;
    color_palette: string[];
    status: string;
    song_structure: ReturnType<typeof parseSongStructure>;
  };
  counts: {
    shots: number;
    prompts: number;
    references: number;
    approved_clips: number;
    rejected_clips: number;
    other_assets: number;
  };
  shots: ManifestShot[];
  approved_clips: ManifestAssetRef[];
};

export type ManifestShot = {
  shot_number: number;
  song_section: string | null;
  timestamp_start: number | null;
  timestamp_end: number | null;
  shot_type: string | null;
  scene_description: string | null;
  status: string;
  approved_clip_filename: string | null;
};

export type ManifestAssetRef = {
  asset_id: string;
  shot_number: number | null;
  asset_type: string;
  filename_in_zip: string;
  approval_status: string;
  source_tool: string | null;
};

export function buildManifest(input: {
  project: VideoProject;
  artist: Artist | null;
  shots: Shot[];
  prompts: Prompt[];
  assets: ProjectAsset[];
}): ProjectManifest {
  const { project, artist, shots, prompts, assets } = input;

  const shotsById: Record<string, Shot> = {};
  for (const s of shots) shotsById[s.id] = s;

  const clipsByShot = approvedClipsByShot(assets);

  const manifestShots: ManifestShot[] = shots.map((s) => ({
    shot_number: s.shot_number,
    song_section: s.song_section,
    timestamp_start: s.timestamp_start,
    timestamp_end: s.timestamp_end,
    shot_type: s.shot_type,
    scene_description: s.scene_description,
    status: s.status,
    approved_clip_filename: clipsByShot[s.id]
      ? approvedFilename(clipsByShot[s.id], s.shot_number)
      : null,
  }));

  const approvedRefs: ManifestAssetRef[] = Object.entries(clipsByShot).map(
    ([shotId, asset]) => {
      const shot = shotsById[shotId];
      return {
        asset_id: asset.id,
        shot_number: shot?.shot_number ?? null,
        asset_type: asset.asset_type,
        filename_in_zip: `approved_clips/${approvedFilename(asset, shot?.shot_number)}`,
        approval_status: asset.approval_status,
        source_tool: asset.source_tool,
      };
    },
  );

  const counts = {
    shots: shots.length,
    prompts: prompts.length,
    references: assets.filter((a) => a.asset_type === "reference_image" || a.asset_type === "reference_video").length,
    approved_clips: Object.keys(clipsByShot).length,
    rejected_clips: assets.filter((a) => a.approval_status === "rejected").length,
    other_assets: assets.length,
  };

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      song_title: project.song_title,
      artist: artist ? { id: artist.id, name: artist.name } : null,
      genre: project.genre,
      bpm: project.bpm,
      mood: project.mood,
      visual_style: project.visual_style,
      color_palette: project.color_palette,
      status: project.status,
      song_structure: parseSongStructure(project.song_structure_json),
    },
    counts,
    shots: manifestShots,
    approved_clips: approvedRefs,
  };
}

// ---------------------------------------------------------------------------
// Edit decision notes (markdown)
// ---------------------------------------------------------------------------
export function buildEditDecisionNotes(input: {
  project: VideoProject;
  artist: Artist | null;
  shots: Shot[];
  approvedClipsByShot: Record<string, ProjectAsset>;
}): string {
  const { project, artist, shots, approvedClipsByShot } = input;
  const lines: string[] = [];

  lines.push(`# ${project.title} — Edit Decision Notes`);
  lines.push("");
  if (project.song_title) lines.push(`**Song:** ${project.song_title}`);
  if (artist) lines.push(`**Artist:** ${artist.name}`);
  if (project.mood) lines.push(`**Mood:** ${project.mood}`);
  if (project.visual_style) lines.push(`**Visual style:** ${project.visual_style}`);
  if (project.bpm != null) lines.push(`**BPM:** ${project.bpm}`);
  if (project.color_palette.length > 0)
    lines.push(`**Palette:** ${project.color_palette.join(", ")}`);
  lines.push("");
  lines.push("## Shot order (approved cuts only)");
  lines.push("");

  const sortedShots = [...shots].sort((a, b) => a.shot_number - b.shot_number);
  for (const s of sortedShots) {
    const approved = approvedClipsByShot[s.id];
    if (!approved) continue;
    const filename = approvedFilename(approved, s.shot_number);
    lines.push(`### Shot ${String(s.shot_number).padStart(3, "0")} — ${s.song_section ?? "—"}`);
    lines.push(`- File: \`approved_clips/${filename}\``);
    if (s.timestamp_start != null || s.timestamp_end != null) {
      lines.push(`- Timing: ${s.timestamp_start ?? "?"}s → ${s.timestamp_end ?? "?"}s`);
    }
    if (s.scene_description) lines.push(`- Scene: ${s.scene_description}`);
    if (s.camera_direction) lines.push(`- Camera: ${s.camera_direction}`);
    if (s.lighting) lines.push(`- Lighting: ${s.lighting}`);
    if (s.notes) lines.push(`- Notes: ${s.notes}`);
    lines.push("");
  }

  if (sortedShots.every((s) => !approvedClipsByShot[s.id])) {
    lines.push("_No approved clips yet._");
  }

  return lines.join("\n");
}
