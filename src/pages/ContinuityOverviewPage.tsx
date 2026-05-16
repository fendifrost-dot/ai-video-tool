import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Lock, LockOpen } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/queries/projects";
import { useArtist, useArtistAssets } from "@/lib/queries/artists";
import { useProjectShots } from "@/lib/queries/shots";
import {
  bucketForAssetType,
  isImageAsset,
  isVideoAsset,
  useProjectAssets,
} from "@/lib/queries/projectAssets";
import {
  averageScore,
  SCORE_METRICS,
  useClipReviewsByAsset,
} from "@/lib/queries/clipReviews";
import { signedUrl } from "@/lib/storage";
import type {
  ClipReview,
  ProjectAsset,
  Shot,
} from "@/integrations/supabase/types";
import { lintShotContinuity } from "@/lib/continuity/lint";

// =============================================================================
// Continuity overview — every approved/needs-regen/generated clip grouped by
// shot, side-by-side with scorecard scores so drift is visible at a glance.
// Also surfaces shot-level lint warnings against the artist's continuity
// rules. Read-only — edits happen in their respective pages.
// =============================================================================

const VISIBLE_ASSET_TYPES = new Set([
  "generated_clip",
  "generated_still",
  "edited_clip",
  "social_cutdown",
]);

export default function ContinuityOverviewPage({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const artistQuery = useArtist(projectQuery.data?.artist_id ?? undefined);
  const artistAssetsQuery = useArtistAssets(projectQuery.data?.artist_id ?? undefined);
  const shotsQuery = useProjectShots(projectId);
  const assetsQuery = useProjectAssets(projectId);

  const lockedAsset = useMemo(
    () =>
      (artistAssetsQuery.data ?? []).find((a) => a.is_primary_reference) ??
      (artistAssetsQuery.data ?? []).find((a) => a.asset_type === "face_front") ??
      null,
    [artistAssetsQuery.data],
  );

  const visibleAssets = useMemo(
    () =>
      (assetsQuery.data ?? []).filter((a) =>
        VISIBLE_ASSET_TYPES.has(a.asset_type),
      ),
    [assetsQuery.data],
  );

  const reviewsQuery = useClipReviewsByAsset(visibleAssets.map((a) => a.id));

  // Group assets by shot_number for the per-shot grid
  const assetsByShot = useMemo(() => {
    const map = new Map<string | null, ProjectAsset[]>();
    for (const a of visibleAssets) {
      const key = a.shot_id ?? null;
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [visibleAssets]);

  // Lint each shot once
  const lintByShot = useMemo(() => {
    const map = new Map<string, ReturnType<typeof lintShotContinuity>>();
    for (const s of shotsQuery.data ?? []) {
      map.set(s.id, lintShotContinuity(artistQuery.data ?? null, s));
    }
    return map;
  }, [shotsQuery.data, artistQuery.data]);

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Continuity" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  const project = projectQuery.data;
  if (!project) {
    return (
      <>
        <PageHeader title="Continuity" />
        <div className="px-8 py-6 text-sm text-muted-foreground">Project not found.</div>
      </>
    );
  }

  const sortedShots = [...(shotsQuery.data ?? [])].sort(
    (a, b) => a.shot_number - b.shot_number,
  );

  return (
    <>
      <PageHeader title="Continuity" subtitle={project.title} />
      <div className="space-y-6 px-8 py-6">
        <LockSummary
          artistName={artistQuery.data?.name ?? null}
          lockedPath={lockedAsset?.file_url ?? null}
        />

        {sortedShots.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No shots yet. Add shots on the shot list page to populate the
            continuity board.
          </div>
        )}

        <div className="space-y-4">
          {sortedShots.map((shot) => {
            const shotAssets = assetsByShot.get(shot.id) ?? [];
            const shotWarnings = lintByShot.get(shot.id) ?? [];
            return (
              <ShotRow
                key={shot.id}
                projectId={projectId}
                shot={shot}
                assets={shotAssets}
                warnings={shotWarnings}
                reviewMap={reviewsQuery.data ?? {}}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}

// =============================================================================
function LockSummary({
  artistName,
  lockedPath,
}: {
  artistName: string | null;
  lockedPath: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!lockedPath) {
      setUrl(null);
      return;
    }
    signedUrl("artist-assets", lockedPath, 3600)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
    };
  }, [lockedPath]);

  if (!lockedPath) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed border-border bg-card/30 p-3 text-sm text-muted-foreground">
        <LockOpen className="h-4 w-4" />
        <div>
          <p className="font-medium text-foreground">No locked reference</p>
          <p className="text-xs">
            Lock a face image on the artist page to anchor continuity across
            every generation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
      {url ? (
        <img
          src={url}
          alt="Locked reference"
          loading="lazy"
          className="h-12 w-12 rounded object-cover"
        />
      ) : (
        <div className="h-12 w-12 rounded bg-emerald-500/10" />
      )}
      <div className="flex-1">
        <p className="flex items-center gap-1.5 font-medium text-emerald-200">
          <Lock className="h-3 w-3" />
          Locked reference {artistName ? `for ${artistName}` : ""}
        </p>
        <p className="text-xs text-emerald-200/80">
          This image is attached to every prompt's image-to-video payload.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
function ShotRow({
  projectId,
  shot,
  assets,
  warnings,
  reviewMap,
}: {
  projectId: string;
  shot: Shot;
  assets: ProjectAsset[];
  warnings: ReturnType<typeof lintShotContinuity>;
  reviewMap: Record<string, ClipReview>;
}) {
  return (
    <div className="rounded-md border border-border bg-card/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link
            to="/projects/$id/shots/$shotId"
            params={{ id: projectId, shotId: shot.id }}
            className="text-sm font-semibold hover:underline"
          >
            #{shot.shot_number}{" "}
            <span className="text-muted-foreground">
              {shot.song_section ?? "—"}
            </span>
          </Link>
          {shot.scene_description && (
            <p className="mt-0.5 max-w-2xl truncate text-xs text-muted-foreground">
              {shot.scene_description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-mono uppercase tracking-wider text-muted-foreground">
            {shot.status.replace("_", " ")}
          </span>
          <span className="text-muted-foreground">
            {assets.length} {assets.length === 1 ? "clip" : "clips"}
          </span>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {warnings.map((w, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] ${
                w.severity === "error"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-200"
              }`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {w.message}
            </span>
          ))}
        </div>
      )}

      {assets.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => (
            <ClipCard key={a.id} asset={a} review={reviewMap[a.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
function ClipCard({
  asset,
  review,
}: {
  asset: ProjectAsset;
  review?: ClipReview;
}) {
  const bucket = bucketForAssetType(asset.asset_type);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    signedUrl(bucket, asset.file_url, 3600)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
    };
  }, [bucket, asset.file_url]);

  const avg = review ? averageScore(review) : null;
  const isDrift = avg !== null && avg < 6;

  return (
    <div
      className={`overflow-hidden rounded-md border ${
        isDrift ? "border-rose-500/40" : "border-border"
      } bg-card/50`}
    >
      <div className="aspect-video bg-black">
        {url && isImageAsset(asset) && (
          <img
            src={url}
            loading="lazy"
            alt={asset.asset_type}
            className="h-full w-full object-cover"
          />
        )}
        {url && isVideoAsset(asset) && (
          <video
            src={url}
            controls
            preload="metadata"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="space-y-1 p-2 text-[10px]">
        <div className="flex items-center justify-between">
          <span className="font-mono uppercase tracking-wider text-muted-foreground">
            {asset.asset_type.replace(/_/g, " ")}
          </span>
          <ApprovalPill status={asset.approval_status} />
        </div>
        {review ? (
          <ScoreBar review={review} avg={avg} />
        ) : (
          <p className="text-muted-foreground">No review yet.</p>
        )}
      </div>
    </div>
  );
}

function ApprovalPill({ status }: { status: ProjectAsset["approval_status"] }) {
  const styles: Record<ProjectAsset["approval_status"], string> = {
    approved: "bg-emerald-500/15 text-emerald-300",
    rejected: "bg-rose-500/15 text-rose-300",
    pending: "bg-muted/30 text-muted-foreground",
    archived: "bg-muted/30 text-muted-foreground",
  };
  return (
    <span className={`rounded-sm px-1 py-0.5 ${styles[status]}`}>
      {status === "approved" && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
      {status}
    </span>
  );
}

function ScoreBar({
  review,
  avg,
}: {
  review: ClipReview;
  avg: number | null;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Avg score</span>
        <span
          className={`font-mono ${
            avg !== null && avg < 6
              ? "text-rose-300"
              : avg !== null && avg >= 8
                ? "text-emerald-300"
                : "text-foreground"
          }`}
        >
          {avg !== null ? avg.toFixed(1) : "—"}
        </span>
      </div>
      <div className="flex flex-wrap gap-0.5">
        {SCORE_METRICS.map((m) => {
          const v = review[m.key];
          if (typeof v !== "number") return null;
          return (
            <span
              key={m.key}
              title={`${m.label}: ${v}/10`}
              className={`rounded-sm px-1 py-0.5 font-mono text-[9px] ${
                v < 6
                  ? "bg-rose-500/20 text-rose-200"
                  : v >= 8
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-muted/30 text-muted-foreground"
              }`}
            >
              {m.label.slice(0, 4).toLowerCase()}:{v}
            </span>
          );
        })}
      </div>
    </div>
  );
}
