import { useMemo } from "react";
import { Clapperboard } from "lucide-react";
import type { ShotSpec } from "@/lib/treatment/shotSpec";
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
  className,
}: {
  specs: ShotSpec[];
  energyById?: Record<string, ShotEnergy>;
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ordered.map((spec, i) => (
          <ShotCard
            key={spec.id}
            spec={spec}
            index={i + 1}
            energy={energyById?.[spec.id] ?? null}
          />
        ))}
      </div>
    </div>
  );
}
