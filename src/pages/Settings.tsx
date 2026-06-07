import { PageHeader, SoonPlaceholder } from "@/components/AppShell";

export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" />
      <SoonPlaceholder
        message="Account and app preferences aren't available yet."
        backTo={{ to: "/projects" }}
        backLabel="Back to Projects"
      />
    </>
  );
}
