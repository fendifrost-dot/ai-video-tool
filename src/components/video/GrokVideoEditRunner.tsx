import { useMemo, useState } from "react";
import { Loader2, PlayCircle, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/queries/projects";
import { isVideoAsset, useProjectAssets } from "@/lib/queries/projectAssets";
import { useWardrobe } from "@/lib/queries/wardrobe";
import { callGrokVideoEdit } from "@/lib/queries/grokVideoEdit";

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultAssetId, setResultAssetId] = useState<string | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);

  const selectedVideo = videos.find((v) => v.id === videoAssetId);
  const selectedGarment = garments.find((g) => g.id === wardrobeFeatureId);
  const canRun = Boolean(artistId && videoAssetId && wardrobeFeatureId && !running);

  async function handleRun() {
    if (!artistId) return;
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
          Real footage + garment refs → Grok <code>/v1/videos/edits</code> →{" "}
          <code>edited_clip</code> on Review. Raw 720p Grok output; SAM-3 master
          recovery + deterministic branding are follow-on steps.
        </p>
      </div>

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
        Billed xAI call (~$0.30–0.50 per ~{DEFAULT_DURATION}s clip). Uses the
        selected asset as-is — trim with §6 server extract first if you need a
        sub-range.
      </p>

      {!confirming ? (
        <Button size="sm" disabled={!canRun} onClick={() => setConfirming(true)}>
          <PlayCircle className="mr-1.5 h-4 w-4" />
          Review Grok edit run
        </Button>
      ) : (
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Video</dt>
            <dd className="truncate">{selectedVideo?.file_url.split("/").pop()}</dd>
            <dt className="text-muted-foreground">Garment</dt>
            <dd>{selectedGarment?.label}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleRun} disabled={running}>
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
