import { PageHeader } from "@/components/AppShell";
import { AiBudgetsPanel } from "@/components/settings/AiBudgetsPanel";
import { MachineCredentialsPanel } from "@/components/settings/MachineCredentialsPanel";
import {
  useBatchCredentials,
  useEnrollBatchCredential,
  useRevokeBatchCredential,
} from "@/lib/queries/batchCredentials";
import { useCreateMcpBudget, useMcpBudgets, useSetMcpBudget } from "@/lib/queries/mcpBudgets";
import { useProjects } from "@/lib/queries/projects";

/** Where AI apps reach AVT as an MCP server (supabase/functions/avt-mcp). */
const MCP_URL = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/avt-mcp`;

export default function Settings() {
  const list = useBatchCredentials();
  const enroll = useEnrollBatchCredential();
  const revoke = useRevokeBatchCredential();
  const budgets = useMcpBudgets();
  const createBudget = useCreateMcpBudget();
  const setBudget = useSetMcpBudget();
  const projects = useProjects();

  return (
    <>
      <PageHeader title="Settings" subtitle="Machines and AIs that may act as you" />
      <div className="px-4 pb-12 md:px-8">
        <MachineCredentialsPanel
          credentials={list.data ?? []}
          loading={list.isLoading}
          error={list.error ? (list.error as Error).message : null}
          busy={enroll.isPending || revoke.isPending}
          onCreate={(label) => enroll.mutateAsync({ label })}
          onRevoke={(id) => revoke.mutateAsync(id)}
          mcpUrl={MCP_URL}
        />
        <AiBudgetsPanel
          budgets={budgets.data ?? []}
          projects={(projects.data ?? []).map((p) => ({ id: p.id, title: p.title }))}
          mcpUrl={MCP_URL}
          loading={budgets.isLoading}
          error={budgets.error ? (budgets.error as Error).message : null}
          busy={createBudget.isPending || setBudget.isPending}
          onCreate={(input) => createBudget.mutateAsync(input)}
          onSet={(input) => setBudget.mutateAsync(input)}
        />
      </div>
    </>
  );
}
