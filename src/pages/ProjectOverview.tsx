import { ComingSoon, PageHeader } from "@/components/AppShell";
export default function ProjectOverview({ id }: { id: string }) {
  return (
    <div className="flex-1">
      <PageHeader title="Project" subtitle={id} />
      <ComingSoon />
    </div>
  );
}
