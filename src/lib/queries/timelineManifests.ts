import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { TimelineManifest } from "@/lib/timeline/types";
import { buildTimelineManifest, inferDurationFrames } from "@/lib/export/timelineManifest";
import type {
  ProjectAsset,
  Shot,
  StoryboardNode,
  VideoProject,
} from "@/integrations/supabase/aliases";
import type { SongAnalysis } from "@/lib/songAnalysis/types";
import type { TimelineItem } from "@/lib/timeline/types";

export const timelineManifestsKeys = {
  all: ["timeline_manifests"] as const,
  forProject: (projectId: string) =>
    [...timelineManifestsKeys.all, "project", projectId] as const,
  detail: (id: string) => [...timelineManifestsKeys.all, "detail", id] as const,
};

export function useProjectTimelineManifests(projectId: string | undefined) {
  return useQuery<TimelineManifest[]>({
    queryKey: projectId
      ? timelineManifestsKeys.forProject(projectId)
      : [...timelineManifestsKeys.all, "_none_"],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from("timeline_manifests")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TimelineManifest[];
    },
    enabled: !!projectId,
  });
}

export function useTimelineManifest(id: string | undefined) {
  return useQuery<TimelineManifest | null>({
    queryKey: id ? timelineManifestsKeys.detail(id) : [...timelineManifestsKeys.all, "_none_"],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("timeline_manifests")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TimelineManifest | null;
    },
    enabled: !!id,
  });
}

export function useCreateTimelineManifest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      project_id: string;
      song_analysis_id?: string | null;
      title?: string;
      aspect_ratio?: string;
      frame_rate?: number;
      resolution?: string;
    }): Promise<TimelineManifest> => {
      const { data, error } = await (supabase as any)
        .from("timeline_manifests")
        .insert({
          project_id: input.project_id,
          song_analysis_id: input.song_analysis_id ?? null,
          title: input.title ?? "Main cut",
          aspect_ratio: input.aspect_ratio ?? "16:9",
          frame_rate: input.frame_rate ?? 24,
          resolution: input.resolution ?? "1920x1080",
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as TimelineManifest;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({
        queryKey: timelineManifestsKeys.forProject(row.project_id),
      });
    },
  });
}

export function useUpdateTimelineManifest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      project_id: string;
      patch: Partial<
        Pick<
          TimelineManifest,
          | "title"
          | "aspect_ratio"
          | "frame_rate"
          | "resolution"
          | "duration_frames"
          | "song_analysis_id"
        >
      >;
    }): Promise<TimelineManifest> => {
      const { data, error } = await (supabase as any)
        .from("timeline_manifests")
        .update(input.patch)
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as TimelineManifest;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: timelineManifestsKeys.detail(row.id) });
      qc.invalidateQueries({
        queryKey: timelineManifestsKeys.forProject(row.project_id),
      });
    },
  });
}

export function usePersistTimelineManifestSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      manifestRow: TimelineManifest;
      project: VideoProject;
      items: TimelineItem[];
      songAnalysis: SongAnalysis | null;
      nodes: StoryboardNode[];
      shots: Shot[];
      assets: ProjectAsset[];
    }): Promise<TimelineManifest> => {
      const nodesById: Record<string, StoryboardNode> = {};
      for (const n of input.nodes) nodesById[n.id] = n;
      const shotsById: Record<string, Shot> = {};
      for (const s of input.shots) shotsById[s.id] = s;

      const duration = inferDurationFrames(
        input.items,
        input.songAnalysis,
        input.manifestRow.frame_rate,
      );

      const json = buildTimelineManifest({
        project: input.project,
        manifest: {
          id: input.manifestRow.id,
          aspect_ratio: input.manifestRow.aspect_ratio,
          frame_rate: input.manifestRow.frame_rate,
          resolution: input.manifestRow.resolution,
          duration_frames: duration,
        },
        items: input.items,
        songAnalysis: input.songAnalysis,
        nodesById,
        shotsById,
        assets: input.assets,
      });

      const { data, error } = await (supabase as any)
        .from("timeline_manifests")
        .update({
          manifest_json: json,
          duration_frames: duration,
          version_number: input.manifestRow.version_number + 1,
        })
        .eq("id", input.manifestRow.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as TimelineManifest;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: timelineManifestsKeys.detail(row.id) });
      qc.invalidateQueries({
        queryKey: timelineManifestsKeys.forProject(row.project_id),
      });
    },
  });
}
