/**
 * Timeline layer row shapes (public.timeline_* + style_profiles).
 * Mirrors DB until Lovable regenerates supabase/types.ts.
 */

import type { Json } from "@/integrations/supabase/types";

export type CutType =
  | "hard_cut"
  | "crossfade"
  | "flash"
  | "whip"
  | "glitch"
  | "match_cut";

export type StyleProfileKind = "color" | "vfx";

export type StyleProfile = {
  id: string;
  user_id: string | null;
  project_id: string | null;
  kind: StyleProfileKind;
  name: string;
  params_json: Json;
  created_at: string;
  updated_at: string;
};

export type TimelineManifest = {
  id: string;
  project_id: string;
  song_analysis_id: string | null;
  title: string | null;
  aspect_ratio: string | null;
  frame_rate: number;
  resolution: string | null;
  duration_frames: number | null;
  manifest_json: Json;
  version_number: number;
  export_status: "pending" | "building" | "complete" | "failed";
  created_at: string;
  updated_at: string;
};

export type TimelineItem = {
  id: string;
  manifest_id: string;
  storyboard_node_id: string | null;
  shot_id: string | null;
  asset_id: string | null;
  track: string;
  item_order: number;
  start_frame: number;
  end_frame: number;
  trim_in_frame: number;
  trim_out_frame: number | null;
  song_section: string | null;
  cut_type: CutType | null;
  transition_in_json: Json;
  transition_out_json: Json;
  speed: number;
  color_profile_id: string | null;
  vfx_profile_id: string | null;
  text_overlays_json: Json;
  approved: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TextOverlay = {
  text: string;
  start_frame?: number;
  end_frame?: number;
  style?: Record<string, unknown>;
};

export type TimelineRenderTarget = "premiere" | "resolve" | "remotion";
