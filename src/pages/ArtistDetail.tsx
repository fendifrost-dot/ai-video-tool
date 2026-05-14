import { ComingSoon, PageHeader } from "@/components/AppShell";
export default function ArtistDetail({ id }: { id: string }) {
  return (
    <>
      <PageHeader title="Artist" subtitle={id} />
      <ComingSoon />
    </>
  );
}
