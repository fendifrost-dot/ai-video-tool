import type { ManifestCommitInput, ManifestCommitPlan, TimelineEventInput } from "./types";

/**
 * Pure plan for a manifest commit — no I/O.
 * Editor Core Engine: manifest is source of truth; versions + events are audit trail.
 */
export function planManifestCommit(input: ManifestCommitInput): ManifestCommitPlan {
  const nextVersionNumber = input.currentVersionNumber + 1;
  const itemCount = input.manifestJson.timeline?.length ?? 0;

  return {
    nextVersionNumber,
    versionInsert: {
      manifest_id: input.manifestId,
      version_number: nextVersionNumber,
      actor_type: input.actor.type,
      actor_name: input.actor.name,
      change_summary: input.changeSummary,
      manifest_json: input.manifestJson,
    },
    eventInsert: {
      manifest_id: input.manifestId,
      event_type: "manifest_committed",
      actor_type: input.actor.type,
      actor_name: input.actor.name,
      change_summary: input.changeSummary,
      payload_json: {
        version_number: nextVersionNumber,
        duration_frames: input.durationFrames,
        item_count: itemCount,
      },
    },
    manifestUpdate: {
      manifest_json: input.manifestJson,
      duration_frames: input.durationFrames,
      version_number: nextVersionNumber,
    },
  };
}

export function planTimelineEvent(input: TimelineEventInput) {
  return {
    manifest_id: input.manifestId,
    version_id: input.versionId ?? null,
    event_type: input.eventType,
    actor_type: input.actor.type,
    actor_name: input.actor.name,
    change_summary: input.changeSummary,
    payload_json: input.payload ?? {},
  };
}
