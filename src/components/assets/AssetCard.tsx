import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  File as FileIcon,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import type {
  ApprovalStatus,
  ProjectAsset,
} from "@/integrations/supabase/aliases";
import {
  APPROVAL_STATUS_LABELS,
  bucketForAssetType,
  isImageAsset,
  isVideoAsset,
  useDeleteProjectAsset,
  useUpdateProjectAsset,
} from "@/lib/queries/projectAssets";
import { useApplyIdentity } from "@/lib/queries/faceswap";
import { deleteFromBucket, signedUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { ClipDecision } from "@/components/review/ClipDecision";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AssetCard({
  asset,
  artistId,
  signedUrl: signedUrlProp,
  urlLoading = false,
}: {
  asset: ProjectAsset;
  artistId?: string | null;
  /** When provided, skips the per-card signedUrl POST on mount. */
  signedUrl?: string | null;
  urlLoading?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(signedUrlProp ?? null);
  const update = useUpdateProjectAsset();
  const del = useDeleteProjectAsset();
  const applyFace = useApplyIdentity();

  async function handleApplyFace() {
    if (!artistId) return;
    try {
      await applyFace.mutateAsync({
        artistId,
        projectId: asset.project_id,
        scenePath: asset.file_url,
        sceneBucket: bucketForAssetType(asset.asset_type),
        sceneAssetId: asset.id,
        shotId: asset.shot_id ?? undefined,
      });
      toast.success("Face applied — new still added (pending review)");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Face-swap failed");
    }
  }

  useEffect(() => {
    if (signedUrlProp !== undefined) {
      setUrl(signedUrlProp);
      return;
    }
    const bucket = bucketForAssetType(asset.asset_type);
    signedUrl(bucket, asset.file_url, 3600)
      .then(setUrl)
      .catch((err) => {
        console.error("signedUrl failed:", err);
        setUrl(null);
      });
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

  const meta = asset.metadata_json as
    | { original_filename?: string; duration_seconds?: number; size_bytes?: number }
    | null;
  const originalName = meta?.original_filename ?? "Asset";

  async function setStatus(next: ApprovalStatus) {
    try {
      await update.mutateAsync({ id: asset.id, patch: { approval_status: next } });
      toast.success(`Set to ${APPROVAL_STATUS_LABELS[next]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status update failed");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${originalName}"? This also removes the file from storage.`)) return;
    try {
      const bucket = bucketForAssetType(asset.asset_type);
      await deleteFromBucket(bucket, asset.file_url);
      await del.mutateAsync({ id: asset.id, projectId: asset.project_id });
      toast.success("Asset deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="group overflow-hidden rounded-md border border-border bg-card/30">
      <PreviewBlock
        asset={asset}
        url={url}
        loading={urlLoading && !url}
        onImageError={refreshSignedUrl}
      />

      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs">{originalName}</p>
            <p className="text-[10px] text-muted-foreground">
              {humanizeType(asset.asset_type)}
              {meta?.duration_seconds != null && (
                <> · {Math.round(meta.duration_seconds)}s</>
              )}
              {meta?.size_bytes != null && (
                <> · {formatSize(meta.size_bytes)}</>
              )}
            </p>
          </div>
          <StatusPill status={asset.approval_status} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <ClipDecision
            status={asset.approval_status}
            onApprove={() => setStatus("approved")}
            onReject={() => setStatus("rejected")}
            disabled={update.isPending}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground">
                <span className="sr-only">More actions</span>
                <span className="text-xs">…</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatus("pending")}>
                Mark as pending
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatus("archived")}>
                Archive
              </DropdownMenuItem>
              {url && (
                <DropdownMenuItem asChild>
                  <a href={url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Open in new tab
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {artistId && isImageAsset(asset) && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={handleApplyFace}
            disabled={applyFace.isPending}
            className="h-8 w-full text-xs"
            title="Swap the artist's face onto this image (Fal · ~$0.05/image)"
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            {applyFace.isPending ? "Applying your face…" : "Apply My Face"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PreviewBlock({
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
  const isImage = isImageAsset(asset);
  const isVideo = isVideoAsset(asset);

  if (loading || !url) {
    return (
      <div className="flex aspect-video items-center justify-center bg-muted/30">
        {loading ? (
          <div className="h-8 w-8 animate-pulse rounded-md bg-muted/50" />
        ) : (
          <FileIcon className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
    );
  }
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" className="block">
        <img
          src={url}
          loading="lazy"
          alt={asset.asset_type}
          className="aspect-video w-full object-cover"
          onError={onImageError}
        />
      </a>
    );
  }
  if (isVideo) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="aspect-video w-full bg-black object-contain"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex aspect-video items-center justify-center bg-muted/30 hover:bg-muted/40"
    >
      <FileIcon className="h-6 w-6 text-muted-foreground" />
    </a>
  );
}

function StatusPill({ status }: { status: ApprovalStatus }) {
  const styles: Record<ApprovalStatus, string> = {
    pending: "bg-muted text-muted-foreground",
    approved: "bg-emerald-500/15 text-emerald-400",
    rejected: "bg-destructive/15 text-destructive",
    archived: "bg-muted text-muted-foreground/60",
  };
  const icons: Record<ApprovalStatus, typeof Clock> = {
    pending: Clock,
    approved: CheckCircle2,
    rejected: XCircle,
    archived: Clock,
  };
  const Icon = icons[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${styles[status]}`}
    >
      <Icon className="h-3 w-3" />
      {APPROVAL_STATUS_LABELS[status]}
    </span>
  );
}

function humanizeType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
