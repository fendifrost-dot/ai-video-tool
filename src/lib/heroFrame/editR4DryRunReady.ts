import type { GrokVideoEditDryRunPlan } from "@/lib/queries/grokVideoEdit";

/** Paid click stays disabled until a $0 plan proves edits + one non-on-model ref. */
export function isEditR4DryRunReady(plan: GrokVideoEditDryRunPlan | null | undefined): boolean {
  if (!plan || plan.billed) return false;
  if (!(plan.endpoint ?? "").endsWith("/videos/edits")) return false;
  const paths = plan.garmentPathsUsed ?? [];
  if (paths.length !== 1) return false;
  if (paths.some((p) => p.includes("onmodel"))) return false;
  return true;
}
