import { Link } from "@tanstack/react-router";
import { FolderKanban, Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/lib/queries/projects";
import { useArtists } from "@/lib/queries/artists";
import type { VideoProject, ProjectStatus } from "@/integrations/supabase/aliases";

// ---------------------------------------------------------------------------
// /projects — full list of the user's projects (cross-artist).
// ---------------------------------------------------------------------------
export default function ProjectsPage() {
  const { data: projects, isLoading, error } = useProjects();
  const { data: artists } = useArtists();
  const artistById = new Map((artists ?? []).map((a) => [a.id, a]));

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="All your music video projects."
      />

      <div className="space-y-6 px-4 py-6 md:px-8">
        <div className="flex items-center justify-end">
          <Button asChild>
            <Link to="/projects/new">
              <Plus className="mr-1.5 h-4 w-4" />
              New project
            </Link>
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load projects: {error instanceof Error ? error.message : String(error)}
          </div>
        )}

        {isLoading ? (
          <LoadingGrid />
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                artistName={p.artist_id ? artistById.get(p.artist_id)?.name ?? null : null}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </>
  );
}

function ProjectCard({
  project,
  artistName,
}: {
  project: VideoProject;
  artistName: string | null;
}) {
  return (
    <Link
      to="/projects/$id"
      params={{ id: project.id }}
      className="block rounded-md border border-border bg-card/30 p-4 transition-colors hover:bg-card/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-medium">{project.title}</h3>
        <StatusBadge status={project.status} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        {artistName && <span>{artistName}</span>}
        {project.song_title && (
          <>
            {artistName && <span>·</span>}
            <span className="truncate">{project.song_title}</span>
          </>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Updated {formatRelative(project.updated_at)}
      </p>
    </Link>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const styles: Record<ProjectStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    in_production: "bg-blue-500/15 text-blue-400",
    editing: "bg-amber-500/15 text-amber-400",
    complete: "bg-emerald-500/15 text-emerald-400",
    archived: "bg-muted text-muted-foreground/60",
  };
  const labels: Record<ProjectStatus, string> = {
    draft: "Draft",
    in_production: "In production",
    editing: "Editing",
    complete: "Complete",
    archived: "Archived",
  };
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-28 animate-pulse rounded-md border border-border bg-muted/20"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border p-12 text-center">
      <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">No projects yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Start a new project to lay out the song, shots, and references.
      </p>
      <div className="mt-6">
        <Button asChild>
          <Link to="/projects/new">
            <Plus className="mr-1.5 h-4 w-4" />
            Create your first project
          </Link>
        </Button>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
