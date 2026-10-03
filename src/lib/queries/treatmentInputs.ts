/**
 * What the generators are told about a project — gathered once, in one place, for the Treatment page (the whole
 * treatment) and the storyboard (one box). Facts about the project only; the creative brief is the treatment itself.
 */
import { useMemo } from "react";
import { useArtist } from "@/lib/queries/artists";
import { useArtistLooks } from "@/lib/queries/looks";
import { useLyricLines } from "@/lib/queries/lyricLines";
import { useProject } from "@/lib/queries/projects";
import { useSongAnalysis } from "@/lib/queries/songAnalyses";
import type { TreatmentContext } from "@/lib/treatment/api";

export function useTreatmentInputs(projectId: string) {
  const projectQuery = useProject(projectId);
  const project = projectQuery.data ?? null;
  const artistQuery = useArtist(project?.artist_id ?? undefined);
  const looksQuery = useArtistLooks(project?.artist_id ?? undefined);
  const analysisQuery = useSongAnalysis(projectId);
  const lyricLinesQuery = useLyricLines(projectId);
  const analysis = analysisQuery.data ?? null;

  const artistDescription = useMemo(() => {
    const profile = artistQuery.data?.identity_profile_json as Record<string, unknown> | null | undefined;
    if (!profile) return null;
    const parts = Object.entries(profile)
      .filter(([, v]) => typeof v === "string" && (v as string).length > 0)
      .map(([k, v]) => `${k}: ${v}`);
    return parts.length ? parts : null;
  }, [artistQuery.data]);

  const usableLooks = useMemo(
    () => (looksQuery.data ?? []).filter((l) => !["archived", "failed", "error"].includes(l.status)),
    [looksQuery.data],
  );

  /** The slots a prompt template can fill (see lyric-visualizer-proxy contract.ts). */
  const templateContext = useMemo(
    () => ({
      project: { title: project?.song_title ?? null, audience: null },
      look: { name: usableLooks[0]?.name ?? null, preamble: project?.visual_style ?? null },
      artist: { name: artistQuery.data?.name ?? null, description: artistDescription ? artistDescription.join("; ") : null },
    }),
    [project?.song_title, project?.visual_style, usableLooks, artistQuery.data?.name, artistDescription],
  );

  /** The artist as the scene writer must describe him: his identity profile, else his name. */
  const heroDescription = templateContext.artist.description || templateContext.artist.name || "";

  /** Everything the treatment model is told. `notes` are the director's; `footageNote` states the real footage. */
  const treatmentContext = (notes: string, footageNote: string): TreatmentContext => {
    const energyCurve = analysis?.energy_curve_json ?? [];
    const bucket = Math.max(1, Math.floor(energyCurve.length / 12));
    const energyProfile = energyCurve.length
      ? Array.from({ length: Math.ceil(energyCurve.length / bucket) }, (_, i) => {
          const slice = energyCurve.slice(i * bucket, (i + 1) * bucket);
          const avg = slice.reduce((s, p) => s + p.energy, 0) / Math.max(1, slice.length);
          return Math.round(avg * 100) / 100;
        })
      : null;
    return {
      projectId,
      projectType: "music_video",
      songTitle: project?.song_title,
      lyrics: project?.lyrics,
      artistProfile: artistDescription ? artistDescription.join("\n") : (artistQuery.data?.name ?? null),
      visualStyle: project?.visual_style,
      mood: project?.mood ?? "",
      additionalNotes: [footageNote, project?.notes, notes].map((s) => (s ?? "").trim()).filter(Boolean).join("\n\n"),
      analysisSummary: analysis
        ? {
            bpm: analysis.bpm,
            duration_seconds: analysis.duration_seconds,
            drops: (analysis.drops_json ?? []).slice(0, 8),
            energy_profile_12_buckets: energyProfile,
          }
        : null,
      looks: usableLooks.slice(0, 25).map((l) => ({ name: l.name, description: l.description })),
    };
  };

  return {
    project,
    projectQuery,
    artist: artistQuery.data ?? null,
    looks: usableLooks,
    analysis,
    analysisQuery,
    lyricLines: lyricLinesQuery.data,
    lyricLinesQuery,
    templateContext,
    heroDescription,
    treatmentContext,
  };
}
