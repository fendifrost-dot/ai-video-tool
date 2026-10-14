import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, Magnet, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signedUrl } from "@/lib/storage";
import { useProjectAudio } from "@/lib/queries/projects";
import {
  useSongAnalysis,
  useUpsertSongAnalysis,
} from "@/lib/queries/songAnalyses";
import { analyzeAudioUrl } from "@/lib/songAnalysis/analyzer";
import { conformProjectBoardsToBeats, storyboardKeys } from "@/lib/queries/storyboard";
import { shotsKeys } from "@/lib/queries/shots";
import { measuredBeats } from "@/lib/storyboard/conform";
import type { SongAnalysis } from "@/lib/songAnalysis/types";

/**
 * Project overview card for the Phase A Song Intelligence engine.
 *
 * - No audio: shows an empty state pointing to the audio uploader.
 * - Audio present, no analysis: shows a "Run analysis" CTA.
 * - Analysis present: renders BPM, duration, energy curve sparkline, beat
 *   markers, drops, and a "Re-analyze" button.
 *
 * Analysis runs client-side via the Web Audio API. See
 * docs/song_intelligence.md for the architecture rationale.
 */
export function SongAnalysisCard({ projectId }: { projectId: string }) {
  const audioQuery = useProjectAudio(projectId);
  const analysisQuery = useSongAnalysis(projectId);
  const upsert = useUpsertSongAnalysis();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [snapping, setSnapping] = useState(false);

  /** Every board of the project onto the song's measured beat (Fendi, 14 Oct: each song's boards conform to its beat). */
  async function conformBoards(analysis: Pick<SongAnalysis, "analysis_provider" | "beat_map_json" | "duration_seconds">) {
    try {
      return await conformProjectBoardsToBeats(projectId, analysis);
    } finally {
      // refresh even after a partial run, so the boards show what was actually moved
      void qc.invalidateQueries({ queryKey: storyboardKeys.boxes(projectId) });
      void qc.invalidateQueries({ queryKey: shotsKeys.forProject(projectId) });
    }
  }

  async function snapBoards() {
    if (!analysisQuery.data) return;
    setSnapping(true);
    try {
      const r = await conformBoards(analysisQuery.data);
      const kept = r.edgesKept ? ` · ${r.edgesKept} edge${r.edgesKept === 1 ? "" : "s"} left where they were (see shot history)` : "";
      toast.success(
        r.moved
          ? `${r.moved} shot${r.moved === 1 ? "" : "s"} moved onto the beat (largest move ${r.maxShift.toFixed(2)} s)${kept}`
          : `Every board already sits on the beat${kept}`,
      );
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Could not move the boards onto the beat");
    } finally {
      setSnapping(false);
    }
  }

  const hasAudio = !!audioQuery.data;
  const hasAnalysis = !!analysisQuery.data;

  async function runAnalysis() {
    if (!audioQuery.data) {
      toast.error("Upload an audio file first");
      return;
    }
    setRunning(true);
    try {
      const url = await signedUrl(
        "project-audio",
        audioQuery.data.file_url,
        3600,
      );
      const result = await analyzeAudioUrl(url);
      await upsert.mutateAsync({
        project_id: projectId,
        ...result,
      });
      // a measured beat moves every board of this song onto it, automatically; the analysis is saved either way
      let conformed: Awaited<ReturnType<typeof conformBoards>> | null = null;
      if (measuredBeats(result)) {
        try {
          conformed = await conformBoards(result);
        } catch (err) {
          console.error(err);
          toast.error(`Analysis saved, but the boards were not all moved onto the beat: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      toast.success(
        [
          result.bpm ? `Analysis complete — ${Math.round(result.bpm * 10) / 10} BPM` : "Analysis complete",
          conformed?.moved ? `${conformed.moved} shot${conformed.moved === 1 ? "" : "s"} moved onto the beat` : null,
          conformed?.edgesKept ? `${conformed.edgesKept} edge${conformed.edgesKept === 1 ? "" : "s"} left where they were` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error ? err.message : "Audio analysis failed",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-card/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Song analysis
          </h2>
        </div>
        {hasAnalysis && (
          <div className="flex items-center gap-2">
            {measuredBeats(analysisQuery.data) && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={snapBoards}
                disabled={snapping || running}
                title="Move every shot edge on this song's boards to the nearest measured beat"
              >
                <Magnet className={`mr-1.5 h-3 w-3 ${snapping ? "animate-pulse" : ""}`} />
                {snapping ? "Snapping…" : "Snap boards to the beat"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={runAnalysis}
              disabled={running || !hasAudio}
            >
              <RefreshCw className={`mr-1.5 h-3 w-3 ${running ? "animate-spin" : ""}`} />
              {running ? "Re-analyzing…" : "Re-analyze"}
            </Button>
          </div>
        )}
      </div>

      {!hasAudio ? (
        <p className="text-sm text-muted-foreground">
          Upload an audio file to enable BPM detection, beat snapping, and drop
          markers.
        </p>
      ) : !hasAnalysis ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">
            No analysis yet. Click below to run BPM detection and energy
            profiling.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={runAnalysis}
            disabled={running}
          >
            <Zap className={`mr-1.5 h-3 w-3 ${running ? "animate-pulse" : ""}`} />
            {running ? "Analyzing…" : "Run analysis"}
          </Button>
        </div>
      ) : (
        <AnalysisView analysis={analysisQuery.data!} />
      )}
    </div>
  );
}

function AnalysisView({
  analysis,
}: {
  analysis: ReturnType<typeof useSongAnalysis>["data"] & {};
}) {
  const energy = analysis.energy_curve_json ?? [];
  const drops = analysis.drops_json ?? [];
  const beats = analysis.beat_map_json ?? [];

  const stats = useMemo(() => {
    const seconds = analysis.duration_seconds ?? 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds - mins * 60);
    return {
      bpm: analysis.bpm ? Math.round(analysis.bpm).toString() : "—",
      duration: seconds ? `${mins}:${secs.toString().padStart(2, "0")}` : "—",
      beats: beats.length,
      drops: drops.length,
    };
  }, [analysis, beats.length, drops.length]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="BPM" value={stats.bpm} />
        <Stat label="Duration" value={stats.duration} />
        <Stat label="Beats" value={stats.beats.toString()} />
        <Stat label="Drops" value={stats.drops.toString()} />
      </div>

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Energy curve
        </p>
        <EnergySparkline
          energy={energy}
          drops={drops}
          duration={analysis.duration_seconds ?? 0}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function EnergySparkline({
  energy,
  drops,
  duration,
}: {
  energy: { t: number; energy: number }[];
  drops: { t: number; intensity: number }[];
  duration: number;
}) {
  // Compute the SVG path once per render. We render at 720x80 internally and
  // let the SVG viewBox scale to the container.
  const path = useMemo(() => {
    if (energy.length === 0) return "";
    const W = 720;
    const H = 80;
    const maxE = energy.reduce((m, s) => Math.max(m, s.energy), 0) || 1;
    const lastT = energy[energy.length - 1].t || 1;
    const points = energy.map((s) => {
      const x = (s.t / lastT) * W;
      const y = H - (s.energy / maxE) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(" L ")}`;
  }, [energy]);

  const safeDuration = duration || (energy[energy.length - 1]?.t ?? 1);

  return (
    <svg
      viewBox="0 0 720 80"
      preserveAspectRatio="none"
      className="h-20 w-full rounded-md border border-border bg-muted/10"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.7} />
      {drops.map((d, i) => {
        const x = (d.t / safeDuration) * 720;
        return (
          <line
            key={i}
            x1={x}
            y1={0}
            x2={x}
            y2={80}
            stroke="#f97316"
            strokeWidth={1.5}
            strokeDasharray="3 2"
            opacity={0.8}
          >
            <title>{`Drop @ ${d.t.toFixed(1)}s (intensity ${d.intensity})`}</title>
          </line>
        );
      })}
    </svg>
  );
}
