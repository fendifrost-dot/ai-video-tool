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
  type GrokVideoEditDryRunPlan,
} from "@/lib/queries/grokVideoEdit";
import {
  assessEditR4DryRun,
  editR4DryRunPassed,
  isEditR4CanonicalOwner,
} from "@/lib/heroFrame/editR4DryRunGate";
import { EDIT_R4_PRODUCT } from "@/lib/heroFrame/editR4ProductIds";
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
      if (!cancelled) setSessionUid(data.user && !data.user.is_anonymous ? data.user.id : null);
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
  const gates = assessEditR4DryRun(
    dryRun ?? undefined,
    videoAssetId,
    wardrobeFeatureId,
    sessionUid,
  );
  const dryRunPassed = editR4DryRunPassed(gates);
  const canInspect = Boolean(
    isCanonicalOwner &&
      artistId &&
      videoAssetId &&
      wardrobeFeatureId &&
      GROK_VIDEO_EDIT_PROMPT_READY &&
      !running &&
      !dryRunning,
  );
  const canRun = canInspect && dryRunPassed;

  async function handleDryRun() {
    if (!artistId || !isCanonicalOwner) return;
    setDryRunning(true);
    setDryRun(null);
    setConfirming(false);
    try {
      const result = await callGrokVideoEdit({
        projectId,
        artistId,
        videoAssetId,
        wardrobeFeatureId,
        maxCostUsd: 0.5,
        dryRun: true,
      });
      if (!result.dryRunPlan) throw new Error("Dry-run returned no envelope");
      if (result.billed) throw new Error("Dry-run was billed — aborting");
      setDryRun(result.dryRunPlan);
      toast.success("Dry-run captured — inspect the envelope before spending");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setDryRunning(false);
    }
  }

  async function handleRun() {
    if (!artistId || !isCanonicalOwner || !dryRunPassed) return;
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
      toast.success("Grok video edit complete — review on the Review board");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setRunning(false);
      setConfirming(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
      <div>
        <h3 className="text-sm font-semibold text-violet-200">
          Architecture C — Grok video edit (product test)
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          EDIT-R4-PRODUCT-1: Fendi source + <code>/v1/videos/edits</code> + one flat
          YSL reference + frozen prompt. Dry-run first. Fendi authorizes the paid click.
        </p>
        <p className="mt-1 break-all text-[11px] text-muted-foreground">
          Session UID: {sessionUid ?? "unsigned"}
          {isCanonicalOwner ? " · canonical owner" : " · not the EDIT-R4 owner"}
        </p>
      </div>

      {!isCanonicalOwner && (
        <p className="text-xs text-amber-300">
          EDIT-R4-PRODUCT-1 inspect and run stay disabled until the session UID is
          the canonical owner. Sign in with the owner magic link (Account). Do not
          create a replacement account.
        </p>
      )}

      {wardrobeBlocked && (
        <p className="text-xs text-amber-300">
          No wardrobe items are visible under this session. Sign in with the owner
          magic link (Account) so <code>auth.uid()</code> is the durable owner. Do
          not create duplicate wardrobe rows.
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
        Billed xAI call (~$0.29–0.50 per ~{DEFAULT_DURATION}s clip). Inspect the
        dry-run envelope before spending. Do not click Run unless every gate is green.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!canInspect} onClick={handleDryRun}>
          {dryRunning ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <ShieldAlert className="mr-1.5 h-4 w-4" />
          )}
          Inspect dry-run envelope
        </Button>
        {!confirming ? (
          <Button size="sm" disabled={!canRun} onClick={() => setConfirming(true)}>
            <PlayCircle className="mr-1.5 h-4 w-4" />
            Review paid Grok edit
          </Button>
        ) : null}
      </div>

      {dryRun && (
        <div className="space-y-2 rounded-md border border-border bg-background/60 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Dry-run envelope (not billed)
          </p>
          <ul className="space-y-1 text-xs">
            {gates.map((g) => (
              <li key={g.label} className={g.ok ? "text-emerald-300" : "text-amber-300"}>
                {g.ok ? "PASS" : "FAIL"} — {g.label}
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[11px]">
            <dt className="text-muted-foreground">Endpoint</dt>
            <dd className="truncate">{dryRun.endpoint}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd>{dryRun.model}</dd>
            <dt className="text-muted-foreground">Flat path</dt>
            <dd className="break-all">{dryRun.garmentPathsUsed?.join(", ") || "—"}</dd>
            <dt className="text-muted-foreground">Est. cost</dt>
            <dd>${dryRun.estimatedCostUsd?.toFixed(2) ?? "—"} / max ${dryRun.maxCostUsd}</dd>
          </dl>
          {!dryRun.xaiRequestBody && (
            <p className="text-[11px] text-amber-300">
              Live envelope has no <code>xaiRequestBody</code> yet. Redeploy{" "}
              <code>grok-video-edit-proxy</code> so the signed-shape fields appear.
              Schema is still locked by unit tests.
            </p>
          )}
        </div>
      )}

      {confirming && (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Video</dt>
            <dd className="truncate">{selectedVideo?.file_url.split("/").pop()}</dd>
            <dt className="text-muted-foreground">Garment</dt>
            <dd>{selectedGarment?.label}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleRun} disabled={running || !dryRunPassed}>
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
              disabled={running}
              onClick={() => setConfirming(false)}
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
