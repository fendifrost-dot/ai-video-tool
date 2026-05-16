import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Download, Package } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useProject, useProjectAudio } from "@/lib/queries/projects";
import { useArtist } from "@/lib/queries/artists";
import { useProjectShots } from "@/lib/queries/shots";
import { useProjectPrompts } from "@/lib/queries/prompts";
import { useProjectAssets } from "@/lib/queries/projectAssets";
import { usePromptTemplates } from "@/lib/queries/promptTemplates";
import {
  buildAndDownloadPackage,
  type ExportOptions,
  type ExportProgress,
} from "@/lib/export/buildPackage";

const DEFAULT_OPTIONS: ExportOptions = {
  includeApprovedClips: true,
  includeRejectedClips: false,
  includeReferences: false,
  includeAudio: true,
};

export default function ExportPage({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const artistQuery = useArtist(projectQuery.data?.artist_id ?? undefined);
  const shotsQuery = useProjectShots(projectId);
  const promptsQuery = useProjectPrompts(projectId);
  const assetsQuery = useProjectAssets(projectId);
  const audioQuery = useProjectAudio(projectId);
  const templatesQuery = usePromptTemplates();

  const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [building, setBuilding] = useState(false);

  const totals = useMemo(() => {
    const assets = assetsQuery.data ?? [];
    const isClip = (t: string) =>
      t === "generated_clip" || t === "edited_clip" || t === "social_cutdown";
    return {
      shots: (shotsQuery.data ?? []).length,
      prompts: (promptsQuery.data ?? []).length,
      approved_clips: assets.filter((a) => a.approval_status === "approved" && isClip(a.asset_type)).length,
      rejected_clips: assets.filter((a) => a.approval_status === "rejected" && isClip(a.asset_type)).length,
      references: assets.filter(
        (a) => a.asset_type === "reference_image" || a.asset_type === "reference_video",
      ).length,
      audio: audioQuery.data ? 1 : 0,
      total_size_estimate: estimateSize({
        assets,
        audioPresent: !!audioQuery.data,
        audioBytes: (audioQuery.data?.metadata_json as { size_bytes?: number } | null)?.size_bytes ?? 0,
        options,
      }),
    };
  }, [assetsQuery.data, shotsQuery.data, promptsQuery.data, audioQuery.data, options]);

  async function handleBuild() {
    if (
      !projectQuery.data ||
      !shotsQuery.data ||
      !promptsQuery.data ||
      !assetsQuery.data ||
      !templatesQuery.data
    ) {
      toast.error("Still loading project data — try again in a moment.");
      return;
    }
    setBuilding(true);
    setProgress({ phase: "preparing", ratio: 0, message: "Preparing…" });
    try {
      await buildAndDownloadPackage({
        project: projectQuery.data,
        artist: artistQuery.data ?? null,
        shots: shotsQuery.data,
        prompts: promptsQuery.data,
        templates: templatesQuery.data,
        assets: assetsQuery.data,
        audioAsset: audioQuery.data ?? null,
        options,
        onProgress: setProgress,
      });
      toast.success("Package downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Build failed");
    } finally {
      setBuilding(false);
      setTimeout(() => setProgress(null), 1500);
    }
  }

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Export" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    return (
      <>
        <PageHeader title="Export" />
        <div className="px-8 py-6">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Project not found.
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

  const project = projectQuery.data;
  const buildDisabled =
    building || projectQuery.isLoading || assetsQuery.isLoading || shotsQuery.isLoading;

  return (
    <>
      <PageHeader
        title="Export"
        subtitle="Build a zip with manifest, shot list, prompt log, and (optionally) the actual files for Premiere / After Effects import."
      />
      <div className="space-y-6 px-8 py-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TotalCard label="Shots" value={totals.shots} />
          <TotalCard label="Prompts saved" value={totals.prompts} />
          <TotalCard label="Approved clips" value={totals.approved_clips} />
          <TotalCard label="Rejected clips" value={totals.rejected_clips} />
          <TotalCard label="References" value={totals.references} />
          <TotalCard label="Audio file" value={totals.audio ? "yes" : "no"} />
        </div>

        <section className="rounded-md border border-border bg-card/30 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Include in package
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Manifest, shot_list.csv, prompt_log.csv, and edit_decision_notes.md are always included.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle
              checked={options.includeApprovedClips}
              onChange={(v) => setOptions((o) => ({ ...o, includeApprovedClips: v }))}
              label="Approved clips"
              hint={`${totals.approved_clips} files`}
            />
            <Toggle
              checked={options.includeAudio}
              onChange={(v) => setOptions((o) => ({ ...o, includeAudio: v }))}
              label="Song audio"
              hint={totals.audio ? "1 file" : "no audio uploaded"}
              disabled={totals.audio === 0}
            />
            <Toggle
              checked={options.includeReferences}
              onChange={(v) => setOptions((o) => ({ ...o, includeReferences: v }))}
              label="Reference images / videos"
              hint={`${totals.references} files`}
            />
            <Toggle
              checked={options.includeRejectedClips}
              onChange={(v) => setOptions((o) => ({ ...o, includeRejectedClips: v }))}
              label="Rejected clips (for reference)"
              hint={`${totals.rejected_clips} files`}
            />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Estimated package size:{" "}
            <span className="font-mono">{formatSize(totals.total_size_estimate)}</span>.
            Browser-side zip — keep under ~2 GB.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleBuild}
            disabled={buildDisabled}
            size="lg"
          >
            <Package className="mr-2 h-4 w-4" />
            {building ? "Building…" : "Build & download package"}
          </Button>
          <p className="text-xs text-muted-foreground">
            File: <span className="font-mono">{slug(project.title)}_YYYY-MM-DD.zip</span>
          </p>
        </div>

        {progress && (
          <div className="space-y-2 rounded-md border border-border bg-card/30 p-3">
            <div className="flex items-center justify-between text-xs">
              <span>{progress.message}</span>
              <span className="font-mono text-muted-foreground">
                {Math.round(progress.ratio * 100)}%
              </span>
            </div>
            <Progress value={Math.round(progress.ratio * 100)} />
          </div>
        )}

        <div className="rounded-md border border-border bg-card/30 p-4 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Download className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              The zip downloads to your default browser download folder. Drag the
              <code className="mx-1 rounded bg-muted/40 px-1 font-mono">approved_clips/</code>
              folder into a Premiere bin to import. Open
              <code className="mx-1 rounded bg-muted/40 px-1 font-mono">edit_decision_notes.md</code>
              for the suggested cut order.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-md border border-border bg-card/40 p-3 ${
        disabled ? "opacity-60" : "cursor-pointer hover:bg-card/60"
      }`}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onChange(v === true)}
        disabled={disabled}
      />
      <div className="min-w-0 flex-1">
        <Label className="cursor-pointer text-sm">{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </label>
  );
}

function TotalCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-card/30 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-lg">{value}</p>
    </div>
  );
}

function estimateSize(input: {
  assets: { metadata_json: unknown; asset_type: string; approval_status: string }[];
  audioPresent: boolean;
  audioBytes: number;
  options: ExportOptions;
}): number {
  let bytes = 32 * 1024; // baseline for manifest + CSVs
  if (input.audioPresent && input.options.includeAudio) bytes += input.audioBytes;

  for (const a of input.assets) {
    const meta = a.metadata_json as { size_bytes?: number } | null;
    const sz = meta?.size_bytes ?? 0;
    const isClip = a.asset_type === "generated_clip" || a.asset_type === "edited_clip" || a.asset_type === "social_cutdown";
    const isRef = a.asset_type === "reference_image" || a.asset_type === "reference_video";
    if (input.options.includeApprovedClips && a.approval_status === "approved" && isClip) {
      bytes += sz;
    }
    if (input.options.includeRejectedClips && a.approval_status === "rejected" && isClip) {
      bytes += sz;
    }
    if (input.options.includeReferences && isRef) {
      bytes += sz;
    }
  }
  return bytes;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function slug(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "project"
  );
}
