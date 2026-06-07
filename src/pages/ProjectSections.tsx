import { ComingSoon, PageHeader, SoonPlaceholder } from "@/components/AppShell";

export function Treatment({ projectId }: { projectId: string }) {
  return (
    <>
      <PageHeader title="Treatment" />
      <SoonPlaceholder
        message="Treatment generation isn't built yet — plan shots on the Shots tab for now."
        backTo={{ to: "/projects/$id/shots", params: { id: projectId } }}
      />
    </>
  );
}

export function Shots() {
  return (
    <div className="flex-1">
      <PageHeader title="Shots" />
      <ComingSoon />
    </div>
  );
}

export function ShotDetail({ shotId }: { shotId: string }) {
  return (
    <div className="flex-1">
      <PageHeader title="Shot" subtitle={shotId} />
      <ComingSoon />
    </div>
  );
}

export function Assets() {
  return (
    <div className="flex-1">
      <PageHeader title="Assets" />
      <ComingSoon />
    </div>
  );
}

export function Review() {
  return (
    <div className="flex-1">
      <PageHeader title="Review" />
      <ComingSoon />
    </div>
  );
}

export function ExportPage() {
  return (
    <div className="flex-1">
      <PageHeader title="Export" />
      <ComingSoon />
    </div>
  );
}
