/**
 * AI budgets — what an outside AI (Claude, ChatGPT, Grok) connected through `avt-mcp` may spend on one video.
 *
 * The owner approves a budget per video before the work starts; every paid call the AI makes is reserved against it
 * (`mcp_reserve`, migration 20261008040000) and refused once it would pass the approved amount. An AI may only ASK
 * for a budget (status `pending`); approving is done here, by the owner, signed in.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type BudgetStatus = "pending" | "approved" | "closed";

export type McpBudget = {
  id: string;
  label: string;
  projectId: string | null;
  approvedUsd: number;
  status: BudgetStatus;
  note: string | null;
  createdAt: string;
  committedUsd: number;
  calls: number;
};

type BudgetRow = {
  id: string;
  label: string;
  project_id: string | null;
  approved_usd: number | string;
  status: BudgetStatus;
  note: string | null;
  created_at: string;
};
type SpendRow = { budget_id: string; reserved_usd: number | string; actual_usd: number | string | null };

// the generated types do not know these two tables until Lovable regenerates them
type Untyped = { from: (t: string) => ReturnType<typeof supabase.from> };
const db = () => supabase as unknown as Untyped;

/** What a budget has committed: settled calls at their reported cost, the rest at what was reserved. */
export function committedOf(spend: SpendRow[], budgetId: string): { usd: number; calls: number } {
  const rows = spend.filter((s) => s.budget_id === budgetId);
  const usd = rows.reduce((a, s) => a + Number(s.actual_usd ?? s.reserved_usd), 0);
  return { usd: Math.round(usd * 10000) / 10000, calls: rows.length };
}

export async function listMcpBudgets(): Promise<McpBudget[]> {
  const { data, error } = await db()
    .from("mcp_budgets")
    .select("id, label, project_id, approved_usd, status, note, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as BudgetRow[];
  const ids = rows.map((r) => r.id);
  let spend: SpendRow[] = [];
  if (ids.length) {
    const res = await db().from("mcp_spend").select("budget_id, reserved_usd, actual_usd").in("budget_id", ids);
    if (res.error) throw res.error;
    spend = (res.data ?? []) as unknown as SpendRow[];
  }
  return rows.map((r) => {
    const c = committedOf(spend, r.id);
    return {
      id: r.id,
      label: r.label,
      projectId: r.project_id,
      approvedUsd: Number(r.approved_usd),
      status: r.status,
      note: r.note,
      createdAt: r.created_at,
      committedUsd: c.usd,
      calls: c.calls,
    };
  });
}

export function validBudget(input: { label: string; usd: number }): string | null {
  if (!input.label.trim() || input.label.trim().length > 200) return "Name the video this budget is for (1–200 characters).";
  if (!Number.isFinite(input.usd) || input.usd <= 0 || input.usd > 10000) return "The amount must be between $0.01 and $10,000.";
  return null;
}

export const mcpBudgetsKeys = { all: ["mcp-budgets"] as const };

export function useMcpBudgets() {
  return useQuery<McpBudget[]>({ queryKey: mcpBudgetsKeys.all, queryFn: listMcpBudgets, staleTime: 10_000 });
}

export function useCreateMcpBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string; usd: number; projectId: string | null }) => {
      const bad = validBudget(input);
      if (bad) throw new Error(bad);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in.");
      const now = new Date().toISOString();
      const { error } = await db()
        .from("mcp_budgets")
        .insert({
          owner_user_id: auth.user.id,
          label: input.label.trim(),
          approved_usd: Math.round(input.usd * 100) / 100,
          project_id: input.projectId,
          status: "approved",
          approved_at: now,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: mcpBudgetsKeys.all }),
  });
}

export function useSetMcpBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: "approved" | "closed"; usd?: number }) => {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> =
        input.status === "approved" ? { status: "approved", approved_at: now } : { status: "closed", closed_at: now };
      if (input.usd !== undefined) {
        if (!Number.isFinite(input.usd) || input.usd <= 0 || input.usd > 10000) throw new Error("The amount must be between $0.01 and $10,000.");
        patch.approved_usd = Math.round(input.usd * 100) / 100;
      }
      const { error } = await db()
        .from("mcp_budgets")
        .update(patch as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: mcpBudgetsKeys.all }),
  });
}
