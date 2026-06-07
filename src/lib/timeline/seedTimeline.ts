import type { ProjectAsset, Shot, StoryboardNode } from "@/integrations/supabase/aliases";
import { approvedClipsByShot } from "@/lib/export/approvedClips";
import { secondsToFrames } from "@/lib/export/timecode";
import type { TimelineItem } from "@/lib/timeline/types";

export type SeedTimelineInput = {
  manifestId: string;
  frameRate: number;
  nodes: StoryboardNode[];
  shots: Shot[];
  assets: ProjectAsset[];
};

export type SeedTimelineRow = Omit<
  TimelineItem,
  "id" | "created_at" | "updated_at"
>;

/**
 * Build timeline item rows from storyboard nodes (preferred) or shots (fallback).
 * Seconds → frames via Math.round(seconds * frame_rate).
 */
export function buildSeedTimelineRows(input: SeedTimelineInput): SeedTimelineRow[] {
  const { manifestId, frameRate, nodes, shots, assets } = input;
  const clips = approvedClipsByShot(assets);
  const sortedShots = [...shots].sort((a, b) => a.shot_number - b.shot_number);

  if (nodes.length > 0) {
    const ordered = [...nodes].sort((a, b) => a.node_order - b.node_order);
    return ordered.map((node, index) => {
      const shot = node.shot_id
        ? sortedShots.find((s) => s.id === node.shot_id)
        : undefined;
      const start = secondsToFrames(node.timestamp_start_seconds, frameRate);
      const end = secondsToFrames(node.timestamp_end_seconds, frameRate);
      const shotId = node.shot_id ?? shot?.id ?? null;
      const asset = shotId ? clips[shotId] : undefined;
      return rowFromTiming({
        manifestId,
        index,
        startFrame: start,
        endFrame: Math.max(end, start + 1),
        storyboardNodeId: node.id,
        shotId,
        assetId: asset?.id ?? null,
        songSection: shot?.song_section ?? null,
      });
    });
  }

  return sortedShots.map((shot, index) => {
    const startSec = shot.timestamp_start ?? index * 4;
    const endSec = shot.timestamp_end ?? startSec + (shot.duration_seconds ?? 4);
    const start = secondsToFrames(startSec, frameRate);
    const end = secondsToFrames(endSec, frameRate);
    const asset = clips[shot.id];
    return rowFromTiming({
      manifestId,
      index,
      startFrame: start,
      endFrame: Math.max(end, start + 1),
      storyboardNodeId: null,
      shotId: shot.id,
      assetId: asset?.id ?? null,
      songSection: shot.song_section,
    });
  });
}

function rowFromTiming(input: {
  manifestId: string;
  index: number;
  startFrame: number;
  endFrame: number;
  storyboardNodeId: string | null;
  shotId: string | null;
  assetId: string | null;
  songSection: string | null;
}): SeedTimelineRow {
  const duration = input.endFrame - input.startFrame;
  return {
    manifest_id: input.manifestId,
    storyboard_node_id: input.storyboardNodeId,
    shot_id: input.shotId,
    asset_id: input.assetId,
    track: "V1",
    item_order: input.index,
    start_frame: input.startFrame,
    end_frame: input.endFrame,
    trim_in_frame: 0,
    trim_out_frame: duration,
    song_section: input.songSection,
    cut_type: input.index === 0 ? "hard_cut" : "hard_cut",
    transition_in_json: {},
    transition_out_json: {},
    speed: 1,
    color_profile_id: null,
    vfx_profile_id: null,
    text_overlays_json: [],
    approved: false,
    notes: null,
  };
}
