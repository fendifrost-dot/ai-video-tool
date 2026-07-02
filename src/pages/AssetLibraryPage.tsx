import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Filter } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssetCard } from "@/components/assets/AssetCard";
import { AssetUploadDropzone } from "@/components/assets/AssetUploadDropzone";
import { useProject } from "@/lib/queries/projects";
import { useProjectAssets, useBatchAssetSignedUrls } from "@/lib/queries/projectAssets";
import type {
  ApprovalStatus,
  ProjectAsset,
  ProjectAssetType,
} from "@/integrations/supabase/aliases";

const TYPE_FILTERS: { value: ProjectAssetType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "reference_image", label: "Reference images" },
  { value: "reference_video", label: "Reference videos" },
  { value: "generated_still", label: "Generated stills" },
  { value: "generated_clip", label: "Generated clips" },
  { value: "edited_clip", label: "Edited clips" },
  { value: "thumbnail", label: "Thumbnails" },
  { value: "social_cutdown", label: "Social cutdowns" },
  { value: "lut", label: "LUTs" },
  { value: "overlay", label: "Overlays" },
  { value: "sfx", label: "SFX" },
  { value: "premiere_export", label: "Premiere exports" },
  { value: "ae_asset", label: "AE assets" },
  { value: "lyrics_doc", label: "Lyrics docs" },
  { value: "other", label: "Other" },
];

const STATUS_FILTERS: { value: ApprovalStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

export default function AssetLibraryPage({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const assetsQuery = useProjectAssets(projectId);
  const [typeFilter, setTypeFilter] = useState<ProjectAssetType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "all">("all");

  const filtered = useMemo(() => {
    const all = assetsQuery.data ?? [];
    return all.filter(
      (a) =>
        (typeFilter === "all" || a.asset_type === typeFilter) &&
        (statusFilter === "all" || a.approval_status === statusFilter),
    );
  }, [assetsQuery.data, typeFilter, statusFilter]);

  const { urls: signedUrls, loading: urlsLoading } = useBatchAssetSignedUrls(filtered);

  const grouped = useMemo(() => groupByType(filtered), [filtered]);

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Assets" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    return (
      <>
        <PageHeader title="Assets" />
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

  return (
    <>
      <PageHeader
        title="Assets"
        subtitle="Every reference, generated take, approved clip, and export tied to this project."
      />
      <div className="space-y-6 px-8 py-6">
        {!projectQuery.data.artist_id && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
            Link an artist to this project to enable <strong>Apply My Face</strong> on
            image assets. Edit the project and choose an artist under Project settings.
          </div>
        )}
        <AssetUploadDropzone projectId={projectId} />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filter
          </div>
          <div className="w-44">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ProjectAssetType | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TYPE_FILTERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApprovalStatus | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "asset" : "assets"}
          </div>
        </div>

        {assetsQuery.isLoading ? (
          <LoadingGrid />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {grouped.map(({ assetType, assets }) => (
              <section key={assetType} className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {humanizeType(assetType)}
                  <span className="ml-2 text-muted-foreground/60">({assets.length})</span>
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {assets.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      artistId={projectQuery.data?.artist_id}
                      signedUrl={signedUrls[a.id] ?? null}
                      urlLoading={urlsLoading}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function groupByType(assets: ProjectAsset[]) {
  const order: ProjectAssetType[] = [
    "generated_clip",
    "generated_still",
    "edited_clip",
    "reference_image",
    "reference_video",
    "thumbnail",
    "social_cutdown",
    "premiere_export",
    "ae_asset",
    "lut",
    "overlay",
    "sfx",
    "lyrics_doc",
    "other",
  ];
  const map: Partial<Record<ProjectAssetType, ProjectAsset[]>> = {};
  for (const a of assets) {
    (map[a.asset_type] ??= []).push(a);
  }
  return order
    .filter((t) => map[t] && map[t]!.length > 0)
    .map((t) => ({ assetType: t, assets: map[t]! }));
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-48 animate-pulse rounded-md border border-border bg-muted/20"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
      No assets match these filters. Drop files in the area above to get started.
    </div>
  );
}

function humanizeType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
