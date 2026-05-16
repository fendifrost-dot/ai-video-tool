import { Link } from "@tanstack/react-router";
import { ArrowLeft, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { ShotStatusPill } from "@/components/shots/ShotStatusPill";
import { ShotForm } from "@/components/shots/ShotForm";
import { PromptBuilder } from "@/components/prompts/PromptBuilder";
import { useProject } from "@/lib/queries/projects";
import { useShot } from "@/lib/queries/shots";

export default function ShotDetailPage({
  projectId,
  shotId,
}: {
  projectId: string;
  shotId: string;
}) {
  const projectQuery = useProject(projectId);
  const shotQuery = useShot(shotId);

  if (shotQuery.isLoading || projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Shot" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (shotQuery.error || !shotQuery.data || !projectQuery.data) {
    return (
      <>
        <PageHeader title="Shot" />
        <div className="px-8 py-6">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Shot not found.
          </div>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/projects/$id/shots" params={{ id: projectId }}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to shots
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  const shot = shotQuery.data;
  const project = projectQuery.data;

  return (
    <>
      <PageHeader
        title={`Shot ${String(shot.shot_number).padStart(3, "0")}`}
        subtitle={
          [shot.song_section, shot.shot_type, shot.scene_description]
            .filter(Boolean)
            .join(" · ") || undefined
        }
      />
      <div className="space-y-8 px-8 py-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm">
            <Link to="/projects/$id/shots" params={{ id: projectId }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              All shots
            </Link>
          </Button>
          <ShotStatusPill status={shot.status} />
        </div>

        <ShotForm shot={shot} />

        <section className="space-y-3">
          <div className="flex items-center gap-2 border-t border-border pt-6">
            <Wand2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Prompt for this shot
            </h2>
          </div>
          <PromptBuilder project={project} initialShotId={shot.id} />
        </section>
      </div>
    </>
  );
}
