import { ComingSoon, PageHeader } from "@/components/AppShell";
export function Treatment() {
  return (
    <div className="flex-1">
      <PageHeader title="Treatment" />
      <ComingSoon />
    </div>
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
