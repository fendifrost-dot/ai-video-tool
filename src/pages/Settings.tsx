import { PageHeader } from "@/components/AppShell";
import { MachineCredentialsPanel } from "@/components/settings/MachineCredentialsPanel";
import {
  useBatchCredentials,
  useEnrollBatchCredential,
  useRevokeBatchCredential,
} from "@/lib/queries/batchCredentials";

export default function Settings() {
  const list = useBatchCredentials();
  const enroll = useEnrollBatchCredential();
  const revoke = useRevokeBatchCredential();

  return (
    <>
      <PageHeader title="Settings" subtitle="Machines that may act as you" />
      <div className="px-4 pb-12 md:px-8">
        <MachineCredentialsPanel
          credentials={list.data ?? []}
          loading={list.isLoading}
          error={list.error ? (list.error as Error).message : null}
          busy={enroll.isPending || revoke.isPending}
          onCreate={(label) => enroll.mutateAsync({ label })}
          onRevoke={(id) => revoke.mutateAsync(id)}
        />
      </div>
    </>
  );
}
