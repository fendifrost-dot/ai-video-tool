import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, File as FileIcon } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScorecardForm } from "@/components/review/ScorecardForm";
import { useProject } from "@/lib/queries/projects";
import {
  bucketForAssetType,
  isImageAsset,
  isVideoAsset,
  useProjectAssets,
  useBatchAssetSignedUrls,
} from "@/lib/queries/projectAssets";
import {
  averageScore,
  useClipReviewsByAsset,
} from "@/lib/queries/clipReviews";
import { signedUrl } from "@/lib/storage";
import type {
  ProjectAsset,
  ProjectAssetType,
} from "@/integrations/supabase/aliases";

const REVIEWABLE_TYPES: ProjectAssetType[] = [
  "generated_clip",
  "generated_still",
  "edited_clip",
  "social_cutdown",
];

type FilterMode = "all" | "needs_review" | "reviewed";

export default function ReviewBoardPage({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const assetsQuery = useProjectAssets(projectId);
  const [filter, setFilter] = useState<FilterMode>("needs_review");
  const [queueIndex, setQueueIndex] = useState(0);

  const reviewable = useMemo(
    () => (assetsQuery.data ?? []).filter((a) => REVIEWABLE_TYPES.includes(a.asset_type)),
    [assetsQuery.data],
  );

  const reviewsQuery = useClipReviewsByAsset(reviewable.map((a) => a.id));

  const filtered = useMemo(() => {
    const reviewMap = reviewsQuery.data ?? {};
    return reviewable.filter((a) => {
      const hasReview = !!reviewMap[a.id];
      if (filter === "needs_review") return !hasReview && a.approval_status === "pending";
      if (filter === "reviewed") return hasReview;
      return true;
    });
  }, [reviewable, reviewsQuery.data, filter]);

  useEffect(() => {
    setQueueIndex(0);
  }, [filter]);

  useEffect(() => {
    if (filtered.length === 0) {
      setQueueIndex(0);
      return;
    }
    setQueueIndex((i) => Math.min(i, filtered.length - 1));
  }, [filtered.length]);

  const currentAsset = filtered[queueIndex] ?? null;
  const { urls: signedUrls, loading: urlsLoading } = useBatchAssetSignedUrls(filtered);

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Review" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    return (
      <>
        <PageHeader title="Review" />
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
        variant="compact"
        title="Review"
        subtitle="Score every generated clip on consistency, realism, lighting, wardrobe, camera, and lip-sync. Approve to send to the edit, reject to flag for regeneration."
      />
      <div className="space-y-5 px-8 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-muted-foreground">Show</div>
          <div className="w-44">
            <Select value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="needs_review">Needs review</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="all">All clips</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "item" : "items"}
          </div>
        </div>

        {filtered.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card/30 px-3 py-2">
            <div className="text-xs text-muted-foreground">
              Queue · {queueIndex + 1} of {filtered.length}
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={queueIndex <= 0}
                onClick={() => setQueueIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={queueIndex >= filtered.length - 1}
                onClick={() =>
                  setQueueIndex((i) => Math.min(filtered.length - 1, i + 1))
                }
              >
                Next
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {assetsQuery.isLoading ? (
          <div className="h-48 animate-pulse rounded-md border border-border bg-muted/20" />
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} />
        ) : currentAsset ? (
          <div className={filtered.length > 1 ? "pb-24" : undefined}>
            <AssetReviewRow
              key={currentAsset.id}
              asset={currentAsset}
              prior={reviewsQuery.data?.[currentAsset.id] ?? null}
              signedUrl={signedUrls[currentAsset.id] ?? null}
              urlLoading={urlsLoading}
              stickyFooter
              onSaved={() => {
                if (queueIndex < filtered.length - 1) {
                  setQueueIndex((i) => i + 1);
                }
              }}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

function AssetReviewRow({
  asset,
  prior,
  signedUrl: signedUrlProp,
  urlLoading = false,
  stickyFooter = false,
  onSaved,
}: {
  asset: ProjectAsset;
  prior: import("@/integrations/supabase/aliases").ClipReview | null;
  signedUrl?: string | null;
  urlLoading?: boolean;
  stickyFooter?: boolean;
  onSaved?: () => void;
}) {
  const [url, setUrl] = useState<string | null>(signedUrlProp ?? null);

  useEffect(() => {
    if (signedUrlProp !== undefined) {
      setUrl(signedUrlProp);
      return;
    }
    const bucket = bucketForAssetType(asset.asset_type);
    signedUrl(bucket, asset.file_url, 3600)
      .then(setUrl)
      .catch(console.error);
  }, [signedUrlProp, asset.file_url, asset.asset_type]);

  async function refreshSignedUrl() {
    const bucket = bucketForAssetType(asset.asset_type);
    try {
      const next = await signedUrl(bucket, asset.file_url, 3600);
      setUrl(next);
    } catch (err) {
      console.error("signedUrl refresh failed:", err);
    }
  }

  const meta = asset.metadata_json as { original_filename?: string } | null;
  const filename = meta?.original_filename ?? "Asset";
  const avg = prior ? averageScore(prior) : null;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 rounded-md border border-border bg-card/30 p-4 lg:grid-cols-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{filename}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {asset.asset_type.replace(/_/g, " ")}
              {avg != null && <> · last avg {avg.toFixed(1)}/10</>}
            </p>
          </div>
        </div>
        <Preview asset={asset} url={url} loading={urlLoading && !url} onImageError={refreshSignedUrl} />
      </div>
      <ScorecardForm
        asset={asset}
        prior={prior}
        stickyFooter={stickyFooter}
        onSaved={onSaved}
      />
    </div>
  );
}

function Preview({
  asset,
  url,
  loading = false,
  onImageError,
}: {
  asset: ProjectAsset;
  url: string | null;
  loading?: boolean;
  onImageError?: () => void;
}) {
  if (loading || !url) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md bg-muted/30">
        {loading ? (
          <div className="h-10 w-10 animate-pulse rounded-md bg-muted/50" />
        ) : (
          <FileIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
    );
  }
  if (isVideoAsset(asset)) {
    return <video src={url} controls preload="metadata" className="aspect-video w-full rounded-md bg-black object-contain" />;
  }
  if (isImageAsset(asset)) {
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" className="block">
        <img src={url}
          loading="lazy" alt={asset.asset_type} className="aspect-video w-full rounded-md object-cover" onError={onImageError} />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex aspect-video items-center justify-center rounded-md bg-muted/30 hover:bg-muted/40"
    >
      <FileIcon className="h-6 w-6 text-muted-foreground" />
    </a>
  );
}

function EmptyState({ filter }: { filter: FilterMode }) {
  return (
    <div className="rounded-md border border-dashed border-border p-12 text-center">
      <Eye className="mx-auto h-7 w-7 text-muted-foreground" />
      <h3 className="mt-3 text-sm font-medium">
        {filter === "needs_review"
          ? "No clips waiting on review"
          : filter === "reviewed"
            ? "No reviewed clips yet"
            : "No clips on this project yet"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {filter === "needs_review"
          ? "Upload generated clips on the Assets tab — they'll land here."
          : "Score a clip from 'Needs review' to see it here."}
      </p>
    </div>
  );
}
