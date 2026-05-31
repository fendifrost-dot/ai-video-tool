import type {
  Artist,
  ProjectAsset,
  Shot,
  StoryboardNode,
  VideoProject,
} from "@/integrations/supabase/aliases";
import type { Section, SongAnalysis } from "@/lib/songAnalysis/types";
import type { TimelineItem } from "@/lib/timeline/types";
import type { TimelineRenderTarget } from "@/lib/timeline/types";
import { approvedClipsByShot } from "./approvedClips";
import { framesToSeconds } from "./timecode";

export type TimelineManifestJson = {
  schema_version: 1;
  project_id: string;
  project_title: string;
  song_title: string | null;
  frame_rate: number;
  aspect_ratio: string;
  resolution: string;
  duration_frames: number;
  audio: {
    source: "song_analyses";
    song_analysis_id: string;
    bpm: number;
    duration_seconds: number;
    beat_markers: SongAnalysis["beat_map_json"];
    song_sections: Section[];
  } | null;
  timeline: TimelineManifestItemJson[];
  global_style: {
    color_direction: string;
    grain: string;
    lens_language: string;
    reference_videos: string[];
  };
  export_targets: Record<TimelineRenderTarget, boolean>;
};

export type TimelineManifestItemJson = {
  id: string;
  storyboard_node_id: string | null;
  shot_id: string | null;
  asset_id: string | null;
  track: string;
  order: number;
  start_frame: number;
  end_frame: number;
  trim_in_frame: number;
  trim_out_frame: number | null;
  start_seconds: number;
  end_seconds: number;
  song_section: string | null;
  cut_type: string | null;
  transition_in: unknown;
  transition_out: unknown;
  speed: number;
  color_profile_id: string | null;
  vfx_profile_id: string | null;
  text_overlays: unknown;
  approved: boolean;
  notes: string | null;
  storyboard?: {
    scene_purpose: string | null;
    camera_type: string | null;
    camera_motion: string | null;
    lighting_style: string | null;
    environment: string | null;
    wardrobe: string | null;
  };
  shot?: {
    shot_number: number;
    scene_description: string | null;
    camera_direction: string | null;
  };
  clip_filename: string | null;
};

export function buildTimelineManifest(input: {
  project: VideoProject;
  manifest: {
    id: string;
    aspect_ratio: string | null;
    frame_rate: number;
    resolution: string | null;
    duration_frames: number | null;
  };
  items: TimelineItem[];
  songAnalysis: SongAnalysis | null;
  nodesById: Record<string, StoryboardNode>;
  shotsById: Record<string, Shot>;
  assets: ProjectAsset[];
  exportTargets?: Partial<Record<TimelineRenderTarget, boolean>>;
}): TimelineManifestJson {
  const { project, manifest, items, songAnalysis, nodesById, shotsById, assets } =
    input;
  const frameRate = manifest.frame_rate;
  const clips = approvedClipsByShot(assets);

  const sorted = [...items].sort(
    (a, b) => a.track.localeCompare(b.track) || a.item_order - b.item_order,
  );

  const maxEnd = sorted.reduce((m, i) => Math.max(m, i.end_frame), 0);
  const durationFrames =
    manifest.duration_frames ??
    (songAnalysis?.duration_seconds != null
      ? Math.round(songAnalysis.duration_seconds * frameRate)
      : maxEnd);

  const timeline: TimelineManifestItemJson[] = sorted.map((item) => {
    const node = item.storyboard_node_id
      ? nodesById[item.storyboard_node_id]
      : undefined;
    const shot = item.shot_id ? shotsById[item.shot_id] : undefined;
    const assetId =
      item.asset_id ?? (item.shot_id ? clips[item.shot_id]?.id : undefined) ?? null;
    const clip = assetId ? assets.find((a) => a.id === assetId) : undefined;

    return {
      id: item.id,
      storyboard_node_id: item.storyboard_node_id,
      shot_id: item.shot_id,
      asset_id: assetId,
      track: item.track,
      order: item.item_order,
      start_frame: item.start_frame,
      end_frame: item.end_frame,
      trim_in_frame: item.trim_in_frame,
      trim_out_frame: item.trim_out_frame,
      start_seconds: framesToSeconds(item.start_frame, frameRate),
      end_seconds: framesToSeconds(item.end_frame, frameRate),
      song_section: item.song_section,
      cut_type: item.cut_type,
      transition_in: item.transition_in_json,
      transition_out: item.transition_out_json,
      speed: Number(item.speed),
      color_profile_id: item.color_profile_id,
      vfx_profile_id: item.vfx_profile_id,
      text_overlays: item.text_overlays_json,
      approved: item.approved,
      notes: item.notes,
      storyboard: node
        ? {
            scene_purpose: node.scene_purpose,
            camera_type: node.camera_type,
            camera_motion: node.camera_motion,
            lighting_style: node.lighting_style,
            environment: node.environment,
            wardrobe: node.wardrobe,
          }
        : undefined,
      shot: shot
        ? {
            shot_number: shot.shot_number,
            scene_description: shot.scene_description,
            camera_direction: shot.camera_direction,
          }
        : undefined,
      clip_filename: clip && shot ? clipFilename(clip, shot.shot_number) : null,
    };
  });

  const treatment = project.treatment_json as Record<string, unknown> | null;

  return {
    schema_version: 1,
    project_id: project.id,
    project_title: project.title,
    song_title: project.song_title,
    frame_rate: frameRate,
    aspect_ratio: manifest.aspect_ratio ?? "16:9",
    resolution: manifest.resolution ?? "1920x1080",
    duration_frames: durationFrames,
    audio: songAnalysis
      ? {
          source: "song_analyses",
          song_analysis_id: songAnalysis.id,
          bpm: songAnalysis.bpm ?? 0,
          duration_seconds: songAnalysis.duration_seconds ?? 0,
          beat_markers: songAnalysis.beat_map_json,
          song_sections: songAnalysis.sections_json,
        }
      : null,
    timeline,
    global_style: {
      color_direction: String(treatment?.color_direction ?? project.visual_style ?? ""),
      grain: String(treatment?.grain ?? ""),
      lens_language: String(treatment?.lens_language ?? ""),
      reference_videos: Array.isArray(treatment?.reference_videos)
        ? (treatment.reference_videos as string[])
        : [],
    },
    export_targets: {
      premiere: input.exportTargets?.premiere ?? true,
      resolve: input.exportTargets?.resolve ?? true,
      remotion: input.exportTargets?.remotion ?? true,
    },
  };
}

function clipFilename(asset: ProjectAsset, shotNumber: number): string {
  const meta = asset.metadata_json as { original_filename?: string } | null;
  const orig = meta?.original_filename ?? "asset";
  const ext = orig.includes(".") ? orig.slice(orig.lastIndexOf(".")) : "";
  return `shot_${String(shotNumber).padStart(3, "0")}_${asset.asset_type}${ext}`;
}

export function inferDurationFrames(
  items: Pick<TimelineItem, "end_frame">[],
  songAnalysis: SongAnalysis | null,
  frameRate: number,
): number {
  const maxEnd = items.reduce((m, i) => Math.max(m, i.end_frame), 0);
  if (songAnalysis?.duration_seconds != null) {
    return Math.max(maxEnd, Math.round(songAnalysis.duration_seconds * frameRate));
  }
  return maxEnd;
}
