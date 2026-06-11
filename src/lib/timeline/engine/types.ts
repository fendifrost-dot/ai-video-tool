import type { Json } from "@/integrations/supabase/types";
import type { TimelineManifestJson } from "@/lib/export/timelineManifest";

/** Who performed an editor action. */
export type EditorActorType = "user" | "agent" | "system";

export type EditorActor = {
  type: EditorActorType;
  name: string | null;
};

export const DEFAULT_USER_ACTOR: EditorActor = { type: "user", name: null };
export const SYSTEM_ACTOR: EditorActor = { type: "system", name: "system" };

/** Append-only event kinds — extend as command layer grows. */
export type TimelineEventType =
  | "manifest_committed"
  | "timeline_created"
  | "timeline_seeded"
  | "timeline_reset"
  | "clips_reordered"
  | "clip_updated"
  | "clip_trimmed"
  | "clip_moved"
  | "clip_added"
  | "clip_removed"
  | "transition_applied"
  | "teaser_generated";

export type TimelineVersionRow = {
  id: string;
  manifest_id: string;
  version_number: number;
  actor_type: EditorActorType;
  actor_name: string | null;
  change_summary: string;
  manifest_json: Json;
  created_at: string;
};

export type TimelineEventRow = {
  id: string;
  manifest_id: string;
  version_id: string | null;
  event_type: TimelineEventType;
  actor_type: EditorActorType;
  actor_name: string | null;
  change_summary: string | null;
  payload_json: Json;
  created_at: string;
};

export type ManifestCommitInput = {
  manifestId: string;
  currentVersionNumber: number;
  manifestJson: TimelineManifestJson;
  durationFrames: number;
  actor: EditorActor;
  changeSummary: string;
};

export type ManifestCommitPlan = {
  nextVersionNumber: number;
  versionInsert: {
    manifest_id: string;
    version_number: number;
    actor_type: EditorActorType;
    actor_name: string | null;
    change_summary: string;
    manifest_json: TimelineManifestJson;
  };
  eventInsert: {
    manifest_id: string;
    event_type: "manifest_committed";
    actor_type: EditorActorType;
    actor_name: string | null;
    change_summary: string;
    payload_json: {
      version_number: number;
      duration_frames: number;
      item_count: number;
    };
  };
  manifestUpdate: {
    manifest_json: TimelineManifestJson;
    duration_frames: number;
    version_number: number;
  };
};

export type TimelineEventInput = {
  manifestId: string;
  versionId?: string | null;
  eventType: TimelineEventType;
  actor: EditorActor;
  changeSummary: string;
  payload?: Record<string, unknown>;
};
