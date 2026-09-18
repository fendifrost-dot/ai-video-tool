/**
 * Creative Director panel (Lane D).
 *
 * A self-contained, importable planning surface. Given a creative brief + the
 * deterministic beat grid + provider capabilities, it proposes a complete
 * ShotSpec sequence in filmmaker language and hands it back via `onApply`.
 *
 * Design constraints (per Lane D charter):
 *   • Does NOT own the treatment page — it's a drop-in <Card>-level panel that
 *     Lane B / the Treatment Builder can mount anywhere.
 *   • No paid generations — the default planner is deterministic and offline.
 *   • Engineering-mode aware: creative mode shows a director's language;
 *     engineering mode reveals sourcing, engine, and generation requirements.
 */

import { useMemo, useState } from "react";
import { Clapperboard, Loader2, Wand2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEngineeringMode } from "@/lib/ux/engineeringMode";
import type { GridClip } from "@/lib/treatment/grid";
import type { ShotSpec } from "@/lib/treatment/shotSpec";
import {
  planWithMock,
  DEFAULT_PLANNER_ID,
  getPlanner,
  type CreativeBrief,
  type CreativeDirectorPlan,
  type ProviderCapabilities,
} from "@/lib/creativeDirector";

export type CreativeDirectorPanelProps = {
  brief: CreativeBrief;
  grid: GridClip[];
  capabilities?: ProviderCapabilities;
  /** Planner adapter id. Defaults to the offline deterministic planner. */
  plannerId?: string;
  /** Called when the director accepts the proposed sequence. */
  onApply?: (plan: CreativeDirectorPlan) => void;
  /** Optional pre-computed plan (e.g. restored from storage). */
  initialPlan?: CreativeDirectorPlan | null;
  className?: string;
};

const ENERGY_HINT: Record<string, string> = {
  low: "text-sky-300",
  mid: "text-emerald-300",
  high: "text-amber-300",
  drop: "text-rose-300",
};

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Energy label recovered from the matching grid clip (for the badge tint). */
function energyOf(grid: GridClip[], key: string): string {
  return grid.find((g) => g.key === key)?.energy ?? "mid";
}

export function CreativeDirectorPanel({
  brief,
  grid,
  capabilities,
  plannerId = DEFAULT_PLANNER_ID,
  onApply,
  initialPlan = null,
  className,
}: CreativeDirectorPanelProps) {
  const { isEngineering } = useEngineeringMode();
  const [plan, setPlan] = useState<CreativeDirectorPlan | null>(initialPlan);
  const [planning, setPlanning] = useState(false);
  const [applied, setApplied] = useState(false);

  const canPlan = grid.length > 0;

  async function handlePlan() {
    if (!canPlan) return;
    setPlanning(true);
    setApplied(false);
    try {
      const input = { brief, grid, capabilities };
      const adapter = getPlanner(plannerId);
      // Fall back to the pure mock core when the id isn't registered.
      const result = adapter ? await adapter.planSequence(input) : planWithMock(input);
      setPlan({ ...result, generatedAt: new Date().toISOString() });
    } finally {
      setPlanning(false);
    }
  }

  function handleApply() {
    if (!plan) return;
    onApply?.(plan);
    setApplied(true);
  }

  const shots: ShotSpec[] = useMemo(() => plan?.shots ?? [], [plan]);
  const heroCount = useMemo(() => shots.filter((s) => s.priority === "hero").length, [shots]);

  return (
    <Card className={`space-y-4 p-4 md:p-5 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-foreground/70" />
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Creative Director
          </h2>
        </div>
        <Button size="sm" variant="outline" onClick={handlePlan} disabled={planning || !canPlan}>
          {planning ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="mr-2 h-3.5 w-3.5" />
          )}
          {plan ? "Re-propose sequence" : "Propose shot sequence"}
        </Button>
      </div>

      {!plan && (
        <p className="text-xs text-foreground/50">
          {canPlan
            ? `Turn the beat grid (${grid.length} clips) + your brief into a complete, filmmaker-language shot sequence. No generations run — this is planning only.`
            : "Set up the beat grid (song analysis or target duration) first, then propose a sequence."}
        </p>
      )}

      {plan && (
        <>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">{plan.logline}</p>
            <p className="text-xs leading-relaxed text-foreground/70">{plan.rationale}</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge variant="secondary" className="text-[10px]">
                {shots.length} shots
              </Badge>
              {heroCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {heroCount} hero
                </Badge>
              )}
              {plan.sections.map((s) => (
                <Badge key={s.name} variant="outline" className="text-[10px]" title={s.intent}>
                  {s.name}
                </Badge>
              ))}
            </div>
          </div>

          <div className="max-h-[26rem] overflow-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="sticky top-0 bg-background/95 backdrop-blur">
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-foreground/50">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Shot</th>
                  <th className="px-3 py-2">Frame &amp; camera</th>
                  <th className="px-3 py-2">Wardrobe</th>
                  {isEngineering && <th className="px-3 py-2">Source / engine</th>}
                </tr>
              </thead>
              <tbody>
                {shots.map((s, i) => {
                  const energy = energyOf(grid, s.id);
                  return (
                    <tr key={s.id} className="border-b border-border/40 align-top">
                      <td className="px-3 py-2 text-foreground/40">{i + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-foreground/70">
                        {fmt(s.timeline.start)}–{fmt(s.timeline.end)}
                        <span className={`ml-1 ${ENERGY_HINT[energy] ?? ""}`}>·{energy}</span>
                      </td>
                      <td className="px-3 py-2 text-foreground/80">
                        {s.purpose}
                        {s.priority === "hero" && (
                          <span className="ml-1 rounded bg-amber-500/15 px-1 text-[9px] uppercase text-amber-300">
                            hero
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-foreground/60">{s.performanceDirection}</td>
                      <td className="px-3 py-2 text-foreground/60">
                        {s.wardrobe.name || <span className="text-foreground/30">open</span>}
                      </td>
                      {isEngineering && (
                        <td className="px-3 py-2 text-foreground/50">
                          <span className="text-foreground/70">{s.source.kind}</span>
                          {s.generation.required && s.generation.engine && (
                            <span className="ml-1 rounded bg-white/5 px-1 text-[10px]">
                              → {s.generation.engine}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {onApply && (
            <div className="flex items-center gap-3">
              {applied ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-300">
                  <Check className="h-4 w-4" /> Sequence applied.
                </p>
              ) : (
                <Button size="sm" onClick={handleApply}>
                  Apply {shots.length} shots
                </Button>
              )}
              <span className="text-[10px] text-foreground/40">
                {plan.planner === "mock" ? "offline planner · no generations" : plan.model}
              </span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
