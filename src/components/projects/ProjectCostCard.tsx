import { useMemo } from "react";
import { DollarSign, Loader2 } from "lucide-react";
import { useProjectProviderJobs } from "@/lib/providerJobs/queries";

/**
 * Per-project cost rollup.
 *
 * Sums the `costEstimateCents` we recorded in each provider_jobs row's
 * response_payload_json envelope and groups by provider. Shows the
 * month-to-date total + the count of generations.
 *
 * Cost data lives in response_payload_json (the CC envelope) — we don't
 * have a dedicated cost_cents column yet. Once we add one (see
 * docs/control_center_provider_proxy.md "Cost tracking"), this card will
 * also use `cost_cents` directly for o(1) sums via a Postgres view.
 */
export function ProjectCostCard({ projectId }: { projectId: string }) {
  const jobsQuery = useProjectProviderJobs(projectId);

  const rollup = useMemo(() => {
    const jobs = jobsQuery.data ?? [];
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    let totalCents = 0;
    let totalCount = 0;
    let monthCents = 0;
    let monthCount = 0;
    const byProvider: Record<string, { count: number; cents: number }> = {};

    for (const j of jobs) {
      const env = j.response_payload_json as Record<string, unknown> | null;
      const cents = (env?.costFinalCents as number) ?? (env?.costEstimateCents as number) ?? 0;
      totalCents += cents;
      totalCount += 1;
      const created = new Date(j.created_at);
      const inMonth = created >= monthStart;
      if (inMonth) {
        monthCents += cents;
        monthCount += 1;
      }
      const p = j.provider;
      if (!byProvider[p]) byProvider[p] = { count: 0, cents: 0 };
      byProvider[p].count += 1;
      byProvider[p].cents += cents;
    }
    const providerCount = Object.keys(byProvider).length;
    return { totalCents, totalCount, monthCents, monthCount, providerCount, byProvider };
  }, [jobsQuery.data]);

  return (
    <section className="space-y-3 rounded-md border border-border bg-card/30 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Generation cost
        </h2>
        <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      {jobsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading jobs…
        </div>
      ) : rollup.totalCount === 0 ? (
        <p className="text-xs text-muted-foreground">
          No generations yet. Cost estimates show up here as soon as you run
          the first Generate from the Prompt Builder.
        </p>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-medium">This month:</span>{" "}
            {formatCents(rollup.monthCents)} across {rollup.monthCount}{" "}
            generation{rollup.monthCount === 1 ? "" : "s"} across{" "}
            {rollup.providerCount} provider{rollup.providerCount === 1 ? "" : "s"}.
          </p>
          <p className="text-xs text-muted-foreground">
            All-time: {formatCents(rollup.totalCents)} ({rollup.totalCount} jobs).
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {Object.entries(rollup.byProvider)
              .sort((a, b) => b[1].cents - a[1].cents)
              .map(([provider, p]) => (
                <span
                  key={provider}
                  className="rounded-md border border-border bg-card/40 px-2 py-1 font-mono text-[10px]"
                  title={`${p.count} generation${p.count === 1 ? "" : "s"}`}
                >
                  <span className="text-muted-foreground">{provider}:</span>{" "}
                  <span>{formatCents(p.cents)}</span>
                </span>
              ))}
          </div>
        </>
      )}
    </section>
  );
}

export function formatCents(cents: number): string {
  if (!Number.isFinite(cents) || cents === 0) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}
