import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { PromptBuilder } from "@/components/prompts/PromptBuilder";
import { useProject } from "@/lib/queries/projects";

export default function PromptBuilderPage({
  projectId,
  shotId,
}: {
  projectId: string;
  shotId?: string;
}) {
  const { data: project, isLoading, error } = useProject(projectId);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Prompt builder" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (error || !project) {
    return (
      <>
        <PageHeader title="Prompt builder" />
        <div className="px-8 py-6">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Project not found."}
          </div>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/projects/$id" params={{ id: projectId }}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to project
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Prompt builder"
        subtitle="Compile a prompt against this project + an artist + (optionally) a shot. Copy for any provider."
      />
      <div className="px-8 py-6">
        <PromptBuilder project={project} initialShotId={shotId} />
      </div>
    </>
  );
}
