import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { McpBudget } from "@/lib/queries/mcpBudgets";

/**
 * AI budgets (Settings). The owner approves what an AI connected through the AVT MCP may spend on one video, before
 * the work starts; an AI can only ask (a pending row). Every paid call is refused once it would pass the approved
 * amount. Presentational: every effect arrives as a prop.
 */
export type AiBudgetsPanelProps = {
  budgets: McpBudget[];
  projects: { id: string; title: string }[];
  mcpUrl: string;
  loading?: boolean;
  error?: string | null;
  busy?: boolean;
  onCreate: (input: { label: string; usd: number; projectId: string | null }) => Promise<void>;
  onSet: (input: { id: string; status: "approved" | "closed"; usd?: number }) => Promise<void>;
};

const usd = (n: number) => `$${n.toFixed(2)}`;

export function AiBudgetsPanel({ budgets, projects, mcpUrl, loading = false, error = null, busy = false, onCreate, onSet }: AiBudgetsPanelProps) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [projectId, setProjectId] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const titleOf = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.title ?? "another project") : "any project");

  async function run(work: () => Promise<void>) {
    setFailure(null);
    try {
      await work();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }

  const open = budgets.filter((b) => b.status !== "closed");
  const closed = budgets.filter((b) => b.status === "closed");

  return (
    <section className="glass mt-6 rounded-2xl px-6 py-6" data-testid="ai-budgets">
      <h2 className="font-display text-lg font-semibold tracking-tight">AI budgets</h2>
      <p className="mt-1 text-sm text-foreground/60">
        Claude, ChatGPT and Grok connect to AVT through its MCP server with a machine credential (above). They can read and edit
        everything, but every paid generation is charged to a budget you approve here for one video — once a call would pass it,
        it is refused.
      </p>
      <p className="mt-2 text-xs text-foreground/60">
        MCP server URL: <code className="break-all" data-testid="mcp-url">{mcpUrl}</code> — add the credential&apos;s secret as a bearer
        token, or at the end of the URL (<code>…/avt-mcp/&lt;secret&gt;</code>) for apps that only take a URL.
      </p>

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await onCreate({ label, usd: Number(amount), projectId: projectId || null });
            setLabel("");
            setAmount("");
          });
        }}
      >
        <div className="min-w-56 flex-1">
          <label htmlFor="budget-label" className="text-xs uppercase tracking-wider text-muted-foreground">
            Video
          </label>
          <Input id="budget-label" value={label} maxLength={200} placeholder="e.g. Interrupted Broadcast — candidate 4" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="w-48">
          <label htmlFor="budget-project" className="text-xs uppercase tracking-wider text-muted-foreground">
            Project
          </label>
          <select
            id="budget-project"
            className="h-10 w-full rounded-md border border-border bg-background/60 px-2 text-sm"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            data-testid="budget-project"
          >
            <option value="">Any project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <label htmlFor="budget-usd" className="text-xs uppercase tracking-wider text-muted-foreground">
            USD
          </label>
          <Input id="budget-usd" inputMode="decimal" value={amount} placeholder="25" onChange={(e) => setAmount(e.target.value)} data-testid="budget-usd" />
        </div>
        <Button type="submit" disabled={busy || !label.trim() || !(Number(amount) > 0)} data-testid="create-budget">
          Approve budget
        </Button>
      </form>

      {(failure || error) && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {failure || error}
        </p>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : open.length === 0 ? (
          <p className="text-sm text-foreground/60">No open budgets — an AI cannot spend anything until you approve one.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="budget-list">
            {open.map((b) => (
              <BudgetRow key={b.id} budget={b} project={titleOf(b.projectId)} busy={busy} onSet={(i) => run(() => onSet(i))} />
            ))}
          </ul>
        )}
        {closed.length > 0 && (
          <p className="mt-3 text-xs text-foreground/50" data-testid="budgets-closed">
            {closed.length} closed: {closed.map((b) => `${b.label} (${usd(b.committedUsd)} of ${usd(b.approvedUsd)})`).join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}

function BudgetRow({
  budget: b,
  project,
  busy,
  onSet,
}: {
  budget: McpBudget;
  project: string;
  busy: boolean;
  onSet: (input: { id: string; status: "approved" | "closed"; usd?: number }) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(b.approvedUsd));
  const remaining = Math.max(0, b.approvedUsd - b.committedUsd);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-testid="budget-row" data-status={b.status}>
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">
          {b.label} {b.status === "pending" && <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">asked by an AI</span>}
        </p>
        <p className="text-xs text-foreground/60">
          {project} ·{" "}
          {b.status === "approved"
            ? `${usd(b.committedUsd)} of ${usd(b.approvedUsd)} used · ${usd(remaining)} left · ${b.calls} paid call${b.calls === 1 ? "" : "s"}`
            : `asks ${usd(b.approvedUsd)}`}
        </p>
        {b.note && <p className="mt-1 text-xs text-foreground/50">{b.note}</p>}
      </div>
      {b.status === "pending" ? (
        <div className="flex items-center gap-2">
          <Input className="h-8 w-24" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Approved amount" data-testid="approve-usd" />
          <Button size="sm" disabled={busy || !(Number(amount) > 0)} onClick={() => void onSet({ id: b.id, status: "approved", usd: Number(amount) })} data-testid="approve-budget">
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void onSet({ id: b.id, status: "closed" })} data-testid="decline-budget">
            Decline
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void onSet({ id: b.id, status: "closed" })} data-testid="close-budget">
          Close
        </Button>
      )}
    </li>
  );
}
