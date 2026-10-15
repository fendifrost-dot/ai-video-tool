import { cn } from "@/lib/utils";
import type { WorkflowState, WorkflowStep } from "@/lib/storyboard/workflow";

const STATE_STYLE: Record<WorkflowState, string> = {
  done: "border-emerald-500/25 bg-emerald-500/5 text-emerald-200",
  partial: "border-amber-500/30 bg-amber-500/5 text-amber-200",
  todo: "border-border bg-white/[0.02] text-foreground/60",
  none: "border-border/60 bg-transparent text-foreground/35",
  manual: "border-sky-500/25 bg-sky-500/5 text-sky-200",
};

/**
 * Where this video stands in the six steps — counts only, read-only. Nothing here starts work or spends: each step is
 * done where it lives (treatment, outfits, the shots).
 */
export function WorkflowChecklist({ steps }: { steps: readonly WorkflowStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol
      className="grid grid-cols-2 gap-1.5 text-[10px] sm:grid-cols-3 lg:grid-cols-6"
      data-testid="workflow-checklist"
      aria-label="Workflow"
    >
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={cn("rounded-lg border px-2.5 py-1.5", STATE_STYLE[s.state])}
          data-testid={`workflow-step-${s.id}`}
          data-state={s.state}
          title={s.detail}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold uppercase tracking-wider">
              {i + 1}. {s.label}
            </span>
            <span className="font-mono tabular-nums">{s.count}</span>
          </div>
          <p className="truncate opacity-75">{s.detail}</p>
        </li>
      ))}
    </ol>
  );
}
