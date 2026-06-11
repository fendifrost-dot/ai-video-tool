import type { SupabaseClient } from "@supabase/supabase-js";
import type { TimelineManifest } from "@/lib/timeline/types";
import { planManifestCommit, planTimelineEvent } from "./commit";
import type {
  ManifestCommitInput,
  TimelineEventInput,
  TimelineEventRow,
  TimelineVersionRow,
} from "./types";

export type ManifestCommitResult = {
  manifest: TimelineManifest;
  version: TimelineVersionRow;
  event: TimelineEventRow;
};

/**
 * Persist a manifest commit: update manifest row, insert version snapshot + event.
 * Returns version id wired onto the event row.
 */
export async function persistManifestCommit(
  supabase: SupabaseClient,
  input: ManifestCommitInput,
): Promise<ManifestCommitResult> {
  const plan = planManifestCommit(input);

  const { data: manifest, error: manifestErr } = await (supabase as any)
    .from("timeline_manifests")
    .update(plan.manifestUpdate)
    .eq("id", input.manifestId)
    .select("*")
    .single();
  if (manifestErr) throw manifestErr;

  const { data: version, error: versionErr } = await (supabase as any)
    .from("timeline_versions")
    .insert(plan.versionInsert)
    .select("*")
    .single();
  if (versionErr) throw versionErr;

  const { data: event, error: eventErr } = await (supabase as any)
    .from("timeline_events")
    .insert({
      ...plan.eventInsert,
      version_id: version.id,
    })
    .select("*")
    .single();
  if (eventErr) throw eventErr;

  return {
    manifest: manifest as TimelineManifest,
    version: version as TimelineVersionRow,
    event: event as TimelineEventRow,
  };
}

/** Append a granular editor event (no manifest version bump). */
export async function persistTimelineEvent(
  supabase: SupabaseClient,
  input: TimelineEventInput,
): Promise<TimelineEventRow> {
  const row = planTimelineEvent(input);
  const { data, error } = await (supabase as any)
    .from("timeline_events")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data as TimelineEventRow;
}
