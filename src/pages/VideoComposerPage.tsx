import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { VideoComposer } from "@/components/video/VideoComposer";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/queries/projects";

export default function VideoComposerPage({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Video composer" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    return (
      <>
        <PageHeader title="Video composer" />
        <div className="px-8 py-6">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {projectQuery.error instanceof Error
              ? projectQuery.error.message
              : "Project not found."}
          </div>
        </div>
      </>
    );
  }

  if (!projectQuery.data.artist_id) {
    return (
      <>
        <PageHeader
          title="Video composer"
          subtitle="Attach an artist to this project before generating clips from looks."
        />
        <div className="px-8 py-6">
          <Button asChild variant="outline">
            <Link to="/projects/$id" params={{ id: projectId }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to project
            </Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        variant="compact"
        title="Video composer"
        subtitle="Build clip prompts from artist looks and submit through provider jobs."
      />
      <VideoComposer artistId={projectQuery.data.artist_id} projectId={projectId} />
    </>
  );
}
