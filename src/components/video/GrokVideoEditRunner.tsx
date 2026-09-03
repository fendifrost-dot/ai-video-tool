import { useEffect, useMemo, useState } from "react";
import { Loader2, PlayCircle, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/queries/projects";
import { isVideoAsset, useProjectAssets } from "@/lib/queries/projectAssets";
import { useWardrobe } from "@/lib/queries/wardrobe";
import {
  callGrokVideoEdit,
  GROK_VIDEO_EDIT_PROMPT_READY,
  GROK_VIDEO_EDIT_PROMPT_VERSION,
  type GrokVideoEditDryRunPlan,
} from "@/lib/queries/grokVideoEdit";
import { EDIT_R4_PRODUCT, isEditR4CanonicalOwner } from "@/lib/heroFrame/editR4ProductIds";
import { assessEditR4DryRun, isEditR4DryRunReady } from "@/lib/heroFrame/editR4DryRunGate";
import { supabase } from "@/lib/supabase";

const DEFAULT_DURATION = 4;

export function GrokVideoEditRunner({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const assetsQuery = useProjectAssets(projectId);
  const artistId = projectQuery.data?.artist_id ?? undefined;
  const wardrobeQuery = useWardrobe(artistId);

  const videos = useMemo(
    () => (assetsQuery.data ?? []).filter(isVideoAsset),
    [assetsQuery.data],
  );
  const garments = wardrobeQuery.data ?? [];

  const [videoAssetId, setVideoAssetId] = useState("");
  const [wardrobeFeatureId, setWardrobeFeatureId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRun, setDryRun] = useState<GrokVideoEditDryRunPlan | null>(null);
  const [sessionUid, setSessionUid] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultAssetId, setResultAssetId] = useState<string | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setSessionUid(data.user && !data.user.is_anonymous ? data.user.id : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!videoAssetId && videos.some((v) => v.id === EDIT_R4_PRODUCT.videoAssetId)) {
      setVideoAssetId(EDIT_R4_PRODUCT.videoAssetId);
    }
  }, [videos, videoAssetId]);

  useEffect(() => {
    if (!wardrobeFeatureId && garments.some((g) => g.id === EDIT_R4_PRODUCT.wardrobeFeatureId)) {
      setWardrobeFeatureId(EDIT_R4_PRODUCT.wardrobeFeatureId);
    }
  }, [garments, wardrobeFeatureId]);

  const selectedVideo = videos.find((v) => v.id === videoAssetId);
  const selectedGarment = garments.find((g) => g.id === wardrobeFeatureId);
  const wardrobeBlocked = Boolean(
    artistId && !wardrobeQuery.isLoading && garments.length === 0,
  );
  const isCanonicalOwner = isEditR4CanonicalOwner(sessionUid);
  const gates = assessEditR4DryRun(dryRun, videoAssetId, wardrobeFeatureId, sessionUid);
  const planReady = isEditR4DryRunReady(dryRun, videoAssetId, wardrobeFeatureId, sessionUid);
  const canInspect = Boolean(
    isCanonicalOwner &&
      artistId &&
      videoAssetId &&
      wardrobeFeatureId &&
      GROK_VIDEO_EDIT_PROMPT_READY &&
      !running &&
      !dryRunning,
  );
  const canRun = canInspect && confirming && planReady;

  async function handleInspect() {
    if (!artistId || !isCanonicalOwner) return;
    setConfirming(true);
    setDryRunning(true);
    setDryRun(null);
    try {
      const result = await callGrokVideoEdit({
        projectId,
        artistId,
        videoAssetId,
        wardrobeFeatureId,
        maxCostUsd: 0.5,
        dryRun: true,
      });
      if (result.billed) throw new Error("Dry-run was billed — aborting");
      if (!result.dryRunPlan) throw new Error("Dry-run returned no plan");
      setDryRun(result.dryRunPlan);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      setConfirming(false);
    } finally {
      setDryRunning(false);
    }
  }

  async function handleRun() {
    if (!artistId || !isCanonicalOwner || !planReady) return;
    setRunning(true);
    setPreviewUrl(null);
    setResultAssetId(null);
    try {
      const result = await callGrokVideoEdit({
        projectId,
        artistId,
        videoAssetId,
        wardrobeFeatureId,
        maxCostUsd: 0.5,
      });
      if (!result.billed || result.finalStatus !== "done") {
        throw new Error(
          result.finalStatus === "failed"
            ? "Grok video edit failed on provider"
            : "Grok video edit did not complete",
        );
      }
      setPreviewUrl(result.previewUrl);
      setResultAssetId(result.assetId);
      setLastCost(result.actualCostUsd);
      if (result.persistError) {
        toast.error(`Generated, but Review row failed: ${result.persistError}`);
      } else if (result.assetId) {
        toast.success("Grok video edit complete — review on the Review board");
      } else {
        toast.error("Generated, but no edited_clip row was returned");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }

  const garmentNames = dryRun?.garmentFilenames?.length
    ? dryRun.garmentFilenames
    : (dryRun?.garmentPathsUsed ?? []).map((p) => p.split("/").pop() ?? p);

  return (
    <section className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-violet-200">
          Architecture C — Grok video edit (product test)
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Frozen Prompt {GROK_VIDEO_EDIT_PROMPT_VERSION.toUpperCase()} · Fendi source +{" "}
          <code>/v1/videos/edits</code> + one flat YSL reference. Inspect the dry-run
          plan in-product before any paid click.
        </p>
        <p className="mt-1 break-all text-[11px] text-muted-foreground">
          Session UID: {sessionUid ?? "unsigned"}
          {isCanonicalOwner ? " · canonical owner" : " · not the EDIT-R4 owner"}
        </p>
      </div>

      {!isCanonicalOwner && (
        <p className="text-xs text-amber-300">
          Inspect and run stay disabled until the session UID is the canonical
          owner. Sign in with the owner magic link (Account).
        </p>
      )}

      {wardrobeBlocked && (
        <p className="text-xs text-amber-300">
          No wardrobe items are visible under this session. Sign in as the owner.
          Do not create duplicate wardrobe rows.
        </p>
      )}

      {!GROK_VIDEO_EDIT_PROMPT_READY && (
        <p className="text-xs text-amber-300">
          Grok edit prompt is not configured yet. Billed runs are blocked.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Source video asset
          </span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
            value={videoAssetId}
            onChange={(e) => {
              setVideoAssetId(e.target.value);
              setDryRun(null);
              setConfirming(false);
              setPreviewUrl(null);
            }}
          >
            <option value="">Select…</option>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.file_url.split("/").pop()} ({v.asset_type})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Garment (character_features)
          </span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
            value={wardrobeFeatureId}
            onChange={(e) => {
              setWardrobeFeatureId(e.target.value);
              setDryRun(null);
              setConfirming(false);
              setPreviewUrl(null);
            }}
          >
            <option value="">Select…</option>
            {garments.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Billed xAI call (~$0.29–0.50 per ~{DEFAULT_DURATION}s clip). The paid
        button stays disabled until an in-product dry-run succeeds.
      </p>

      <Button size="sm" variant="outline" disabled={!canInspect} onClick={handleInspect}>
        {dryRunning ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <ShieldAlert className="mr-1.5 h-4 w-4" />
        )}
        Review Grok edit run
      </Button>

      {confirming && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          {dryRunning && (
            <p className="text-xs text-muted-foreground">Fetching $0 dry-run plan…</p>
          )}
          {dryRun && (
            <>
              <ul className="space-y-1 text-xs">
                {gates.map((g) => (
                  <li key={g.label} className={g.ok ? "text-emerald-300" : "text-amber-300"}>
                    {g.ok ? "PASS" : "FAIL"} — {g.label}
                  </li>
                ))}
              </ul>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Endpoint</dt>
                <dd className="truncate">{dryRun.endpoint}</dd>
                <dt className="text-muted-foreground">Prompt</dt>
                <dd>Frozen Prompt {(dryRun.promptVersion ?? GROK_VIDEO_EDIT_PROMPT_VERSION).toUpperCase()}</dd>
                <dt className="text-muted-foreground">References</dt>
                <dd>
                  {garmentNames.length} · {garmentNames.join(", ") || "—"}
                </dd>
                <dt className="text-muted-foreground">Est. cost</dt>
                <dd>
                  ${dryRun.estimatedCostUsd?.toFixed(2) ?? "—"} / max ${dryRun.maxCostUsd}
                </dd>
                <dt className="text-muted-foreground">Video</dt>
                <dd className="truncate">{selectedVideo?.file_url.split("/").pop()}</dd>
                <dt className="text-muted-foreground">Garment</dt>
                <dd>{selectedGarment?.label}</dd>
              </dl>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleRun} disabled={!canRun || running}>
              {running ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              Run Grok video edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={running || dryRunning}
              onClick={() => {
                setConfirming(false);
                setDryRun(null);
              }}
            >
              Back
            </Button>
          </div>
        </div>
      )}

      {lastCost != null && (
        <p className="text-xs text-muted-foreground">
          Provider cost this run: ${lastCost.toFixed(2)}
        </p>
      )}
      {previewUrl && (
        <video
          src={previewUrl}
          controls
          className="max-h-80 w-full rounded-md border border-border bg-black"
        />
      )}
      {resultAssetId && (
        <p className="text-xs text-emerald-300">
          Saved as edited_clip.{" "}
          <Link
            to="/projects/$id/review"
            params={{ id: projectId }}
            className="underline"
          >
            Open Review board
          </Link>
        </p>
      )}
    </section>
  );
}
