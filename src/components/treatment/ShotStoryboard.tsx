import { useMemo } from "react";
import { Clapperboard, Video } from "lucide-react";
import type { ShotSpec } from "@/lib/treatment/shotSpec";
import { measureCoverage, DEFAULT_COVERAGE_PRESETS } from "@/lib/treatment/coverage";
import { lyricsForShot, lyricStateForShot, type LyricLine } from "@/lib/lyrics/lyricsForShot";
import { ShotCard, type ShotEnergy } from "./ShotCard";
import { formatDuration } from "./shotLabels";

/**
 * The treatment storyboard: chronological cinematic shot cards.
 *
 * Consumes generalized Shot Specs (`@/lib/treatment/shotSpec`) so it is
 * agnostic to where they came from — the treatment builder, the shot list, or
 * an import. Ordering is by timeline start (falling back to `order`, then id)
 * so the board always reads front-to-back like a cut.
 */

export function ShotStoryboard({
  specs,
  /** Optional beat-energy accent per shot id (from the clip grid). */
  energyById,
  /** Timed lyric lines of the song (useLyricLines); each card shows the lines sung inside its window. */
  lyricLines,
  className,
}: {
  specs: ShotSpec[];
  energyById?: Record<string, ShotEnergy>;
  lyricLines?: LyricLine[];
  className?: string;
}) {
  const ordered = useMemo(
    () =>
      [...specs].sort((a, b) => {
        if (a.timeline.start !== b.timeline.start) return a.timeline.start - b.timeline.start;
        if ((a.order ?? 0) !== (b.order ?? 0)) return (a.order ?? 0) - (b.order ?? 0);
        return a.id.localeCompare(b.id);
      }),
    [specs],
  );

  // Coverage, measured on the cards against the rules the cut is held to (config/coverage_presets.json).
  const coverage = useMemo(() => measureCoverage(ordered, DEFAULT_COVERAGE_PRESETS, lyricLines), [ordered, lyricLines]);

  const runtime = useMemo(() => {
    if (ordered.length === 0) return 0;
    const end = Math.max(...ordered.map((s) => s.timeline.end));
    const start = Math.min(...ordered.map((s) => s.timeline.start));
    return Math.max(0, end - start);
  }, [ordered]);

  if (ordered.length === 0) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
          <Clapperboard className="h-6 w-6 text-foreground/30" />
          <p className="text-sm text-foreground/50">No shots yet.</p>
          <p className="text-xs text-foreground/35">
            Generate a treatment above and the storyboard fills in, shot by shot.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-2 text-xs text-foreground/50">
        <Clapperboard className="h-3.5 w-3.5" />
        <span>
          {ordered.length} shot{ordered.length > 1 ? "s" : ""} · {formatDuration(runtime)} runtime
        </span>
      </div>
      {/* Coverage: camera movement and angle changes are the norm; a static camera is the rare, explicit choice. */}
      {coverage.sections.length > 0 && (
        <div
          className={
            coverage.pass
              ? "mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[10px] text-emerald-300"
              : "mb-3 flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[10px] text-amber-200"
          }
          data-testid="coverage-report"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Video className="h-3 w-3" />
            <span className="font-semibold uppercase tracking-wider">Coverage {coverage.pass ? "on the norm" : "needs camera movement"}</span>
            {coverage.sections.map((s) => (
              <span key={s.section} className="opacity-80">
                {s.section}: {Math.round((1 - s.staticShare) * 100)} % moving · longest static {s.longestStaticRunSeconds.toFixed(1)} s
              </span>
            ))}
          </div>
          {!coverage.pass &&
            coverage.findings.map((f, i) => (
              <span key={i} className="opacity-90">
                {f.detail}
              </span>
            ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ordered.map((spec, i) => (
          <ShotCard
            key={spec.id}
            spec={spec}
            index={i + 1}
            energy={energyById?.[spec.id] ?? null}
            coverageFlag={coverage.flaggedShotIds[spec.id]}
            lyrics={lyricLines ? lyricsForShot(lyricLines, spec.timeline) : undefined}
            lyricState={lyricLines ? lyricStateForShot(lyricLines, spec.timeline) : "unknown"}
          />
        ))}
      </div>
    </div>
  );
}
