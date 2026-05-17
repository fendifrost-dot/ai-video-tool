import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Music, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { signedUrl } from "@/lib/storage";
import {
  parseSongStructure,
  useDeleteProject,
  useProject,
  useProjectAudio,
  useUpdateProject,
} from "@/lib/queries/projects";
import { useArtist } from "@/lib/queries/artists";
import { SongAnalysisCard } from "@/components/projects/SongAnalysisCard";
import type { ProjectStatus } from "@/integrations/supabase/types";
import { TreatmentCard } from "@/components/projects/TreatmentCard";
import { ProjectCostCard } from "@/components/projects/ProjectCostCard";

export default function ProjectOverview({ id }: { id: string }) {
  const navigate = useNavigate();
  const { data: project, isLoading, error } = useProject(id);
  const update = useUpdateProject();
  const del = useDeleteProject();

  if (isLoading) {
    return (
      <>
        <PageHeader title="Project" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (error || !project) {
    return (
      <>
        <PageHeader title="Project" />
        <div className="px-8 py-6">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Project not found."}
          </div>
          <div className="mt-4">
            <Button asChild variant="outline">
              <Link to="/">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to dashboard
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${project!.title}"? This permanently removes all shots, prompts, assets, and reviews tied to this project.`,
      )
    )
      return;
    try {
      await del.mutateAsync(project!.id);
      toast.success("Project deleted");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <>
      <PageHeader
        title={project.title}
        subtitle={project.song_title ?? undefined}
      />
      <div className="space-y-6 px-8 py-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              All projects
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <StatusSelect
              value={project.status}
              onChange={async (next) => {
                try {
                  await update.mutateAsync({
                    id: project.id,
                    patch: { status: next },
                  });
                  toast.success(`Status: ${humanStatus(next)}`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Update failed");
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={del.isPending}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <MetaGrid project={project} />
        <ProjectAudioCard projectId={project.id} />
        <SongAnalysisCard projectId={project.id} />
        <TreatmentCard project={project} />
        <ProjectCostCard projectId={project.id} />
        <VisualCard project={project} />
        <LyricsCard lyrics={project.lyrics} />
        <SongStructureCard structureJson={project.song_structure_json} />
        <NextStepsCard />
      </div>
    </>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: ProjectStatus;
  onChange: (next: ProjectStatus) => void | Promise<void>;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as ProjectStatus)}
    >
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="draft">Draft</SelectItem>
        <SelectItem value="in_production">In production</SelectItem>
        <SelectItem value="editing">Editing</SelectItem>
        <SelectItem value="complete">Complete</SelectItem>
        <SelectItem value="archived">Archived</SelectItem>
      </SelectContent>
    </Select>
  );
}

function MetaGrid({ project }: { project: NonNullable<ReturnType<typeof useProject>["data"]> }) {
  const artistQuery = useArtist(project.artist_id ?? undefined);
  const artistName = artistQuery.data?.name ?? null;

  const items: { label: string; value: string | null }[] = [
    { label: "Artist", value: artistName },
    { label: "Genre", value: project.genre },
    { label: "Mood", value: project.mood },
    { label: "BPM", value: project.bpm != null ? String(project.bpm) : null },
    { label: "Visual style", value: project.visual_style },
    { label: "Status", value: humanStatus(project.status) },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 rounded-md border border-border bg-card/30 p-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-0.5 truncate text-sm">
            {item.value ?? <span className="text-muted-foreground italic">Not set</span>}
          </p>
        </div>
      ))}
    </div>
  );
}

function ProjectAudioCard({ projectId }: { projectId: string }) {
  const { data: audio, isLoading } = useProjectAudio(projectId);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!audio) {
      setUrl(null);
      return;
    }
    signedUrl("project-audio", audio.file_url, 3600)
      .then(setUrl)
      .catch(console.error);
  }, [audio]);

  if (isLoading) return null;
  if (!audio) {
    return (
      <Card title="Audio">
        <p className="text-sm text-muted-foreground">
          No audio uploaded yet.
        </p>
      </Card>
    );
  }

  const originalFilename =
    (audio.metadata_json as { original_filename?: string } | null)
      ?.original_filename ?? "Audio file";

  return (
    <Card title="Audio">
      <div className="flex items-center gap-3">
        <Music className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm">{originalFilename}</span>
      </div>
      {url && <audio src={url} controls className="mt-3 w-full" />}
    </Card>
  );
}

function VisualCard({
  project,
}: {
  project: NonNullable<ReturnType<typeof useProject>["data"]>;
}) {
  if (
    project.color_palette.length === 0 &&
    !project.wardrobe_notes &&
    !project.visual_style
  ) {
    return null;
  }
  return (
    <Card title="Visual">
      {project.color_palette.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {project.color_palette.map((hex) => (
            <div
              key={hex}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-2 py-1 text-xs"
            >
              <span
                className="h-5 w-5 rounded-full border border-border"
                style={{ backgroundColor: hex }}
              />
              <span className="font-mono uppercase">{hex}</span>
            </div>
          ))}
        </div>
      )}
      {project.wardrobe_notes && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {project.wardrobe_notes}
        </p>
      )}
    </Card>
  );
}

function LyricsCard({ lyrics }: { lyrics: string | null }) {
  if (!lyrics) return null;
  return (
    <Card title="Lyrics">
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
        {lyrics}
      </pre>
    </Card>
  );
}

function SongStructureCard({ structureJson }: { structureJson: unknown }) {
  const sections = parseSongStructure(structureJson);
  if (sections.length === 0) return null;

  return (
    <Card title="Song structure">
      <div className="space-y-1">
        {sections.map((s, i) => (
          <div
            key={i}
            className="grid grid-cols-4 gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-xs"
          >
            <span className="font-mono">{s.name}</span>
            <span className="text-muted-foreground">
              {s.start_seconds != null ? `${s.start_seconds}s` : "—"}
            </span>
            <span className="text-muted-foreground">
              {s.end_seconds != null ? `${s.end_seconds}s` : "—"}
            </span>
            <span className="text-right text-muted-foreground">
              {s.bars != null ? `${s.bars} bars` : ""}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NextStepsCard() {
  return (
    <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
      Next: open <strong className="text-foreground">Treatment</strong>,{" "}
      <strong className="text-foreground">Shots</strong>, or{" "}
      <strong className="text-foreground">Assets</strong> from the project sidebar.
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card/30 p-4">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function humanStatus(s: ProjectStatus): string {
  switch (s) {
    case "in_production":
      return "In production";
    default:
      return s[0].toUpperCase() + s.slice(1);
  }
}
