// WardrobeVideoLaneRunner — the VISIBLE in-app trigger to run a wardrobe video
// garment swap (Lane A / B / C) against an EXPLICIT short clip range.
//
// Locked architecture (docs/VIDEO_SWAP_ARCHITECTURE.md):
//   • Lane A = Grok keyframes + temporal propagation (the LOCKED production path).
//   • Lane B = per-frame VTON (BASELINE/DIAGNOSTIC — boils; never full-length).
//   • Lane C = Decart Lucy v2v (video-native; prompt-driven, NOT pixel-preserving).
//
// Every lane runs on a SERVER-EXTRACTED clip: the browser no longer downloads or
// decodes the ~2 GB 4K master — the extractor seek+trims the requested range on
// Fal and the frames are decoded from that small H.264 clip (see
// src/lib/queries/wardrobeVideoFrames.ts + wardrobe-video-frame-extract-proxy).
// A clip range (start + duration) is REQUIRED — there is no implicit full-clip.
import { useEffect, useMemo, useState } from "react";
import { Loader2, PlayCircle, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/queries/projects";
import { bucketForAssetType, isVideoAsset, useProjectAssets } from "@/lib/queries/projectAssets";
import { useWardrobe } from "@/lib/queries/wardrobe";
import { signedUrl } from "@/lib/storage";
import { pickFullLookGarmentPath, type RefImageLike } from "@/lib/garment/vtonReference";
import {
  runFrameSwapRoundtrip,
  runLaneARoundtrip,
  runLaneCRoundtrip,
  type ServerExtractConfig,
} from "@/lib/queries/wardrobeVideoFrames";

type Lane = "A" | "B" | "C";

interface LaneMeta {
  key: Lane;
  label: string;
  /** What actually runs — engine + which server env selects the model. */
  engine: string;
  /** Honest caveat surfaced before the user commits (arch doc). */
  caveat: string;
  pixelPreserving: boolean;
}

const LANES: Record<Lane, LaneMeta> = {
  A: {
    key: "A",
    label: "Lane A — Grok keyframes + temporal propagation",
    engine:
      "Grok hero keyframes (grok-image-garment-proxy) → propagation " +
      "(WARDROBE_PROP_ENGINE / PROPAGATION_FAL_MODEL, server-selected)",
    caveat:
      "The LOCKED production path. If no propagation engine is wired server-side, " +
      "intermediate frames block honestly (no faked video) and report what to wire.",
    pixelPreserving: true,
  },
  B: {
    key: "B",
    label: "Lane B — per-frame VTON (diagnostic)",
    engine: "Per-frame reference-locked VTON (FRAME_SWAP_FAL_MODEL, server-selected)",
    caveat:
      "BASELINE / DIAGNOSTIC only. Single-image VTON has no temporal state → it " +
      "boils/flickers. Never the full-length production path.",
    pixelPreserving: true,
  },
  C: {
    key: "C",
    label: "Lane C — Decart Lucy v2v (benchmark)",
    engine: "Decart Lucy video-to-video (LUCY_V2V_FAL_MODEL, server-selected)",
    caveat:
      "Video-native (no boiling) BUT prompt-driven — it REGENERATES the garment " +
      "and cannot preserve the exact construction/stripe. Benchmark, not shippable.",
    pixelPreserving: false,
  },
};

const DEFAULT_FPS = 12;
const DEFAULT_DURATION = 3;

export function WardrobeVideoLaneRunner({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const assetsQuery = useProjectAssets(projectId);
  const artistId = projectQuery.data?.artist_id ?? undefined;
  const wardrobeQuery = useWardrobe(artistId);

  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [garmentId, setGarmentId] = useState("");
  const [lane, setLane] = useState<Lane>("A");
  const [startSec, setStartSec] = useState(0);
  const [durationSec, setDurationSec] = useState(DEFAULT_DURATION);
  const [fps, setFps] = useState(DEFAULT_FPS);
  const [transferMode, setTransferMode] = useState<"jacket_only" | "full_look">("jacket_only");
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [garmentRefUrl, setGarmentRefUrl] = useState<string | null>(null);

  const videoAssets = useMemo(
    () => (assetsQuery.data ?? []).filter(isVideoAsset),
    [assetsQuery.data],
  );
  const wardrobeItems = useMemo(
    () =>
      (wardrobeQuery.data ?? []).filter((w) =>
        ["wardrobe_outerwear", "wardrobe_top", "wardrobe_bottom", "wardrobe_footwear"].includes(
          w.feature_type,
        ),
      ),
    [wardrobeQuery.data],
  );

  const selectedAsset = videoAssets.find((a) => a.id === selectedVideoId);
  const selectedGarment = wardrobeItems.find((w) => w.id === garmentId);
  const laneMeta = LANES[lane];

  // Preview the garment reference thumbnail (the "which garment" confirmation).
  useEffect(() => {
    if (!selectedGarment) {
      setGarmentRefUrl(null);
      return;
    }
    const refs = (selectedGarment.reference_images ?? []) as RefImageLike[];
    const path = pickFullLookGarmentPath(
      refs,
      selectedGarment.storage_path ?? selectedGarment.file_url,
    );
    if (!path) {
      setGarmentRefUrl(null);
      return;
    }
    if (path.startsWith("http")) {
      setGarmentRefUrl(path);
      return;
    }
    let cancelled = false;
    signedUrl("wardrobe-refs", path, 3600)
      .then((u) => !cancelled && setGarmentRefUrl(u))
      .catch(() => !cancelled && setGarmentRefUrl(null));
    return () => {
      cancelled = true;
    };
  }, [selectedGarment]);

  const rangeValid = startSec >= 0 && durationSec > 0 && fps > 0;
  const canReview = Boolean(selectedAsset && garmentId && artistId && rangeValid && !running);
  const plannedFrames = Math.max(1, Math.floor(durationSec * fps));

  function reset() {
    setConfirming(false);
    setResult(null);
    setError(null);
    setProgress(null);
  }

  async function handleRun() {
    if (!selectedAsset || !artistId || !garmentId) return;
    const asset = {
      id: selectedAsset.id,
      asset_type: selectedAsset.asset_type,
      file_url: selectedAsset.file_url,
    };
    const serverExtract: ServerExtractConfig = { startSec, durationSec };
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress("Extracting clip on the server (seek+trim)…");
    try {
      if (lane === "A") {
        const r = await runLaneARoundtrip({
          asset,
          artistId,
          wardrobeFeatureId: garmentId,
          projectId,
          targetFps: fps,
          serverExtract,
          onProgress: (done, total) => setProgress(`Frames ${done}/${total}`),
          onKeyframe: (done, total) => setProgress(`Keyframe ${done}/${total}`),
        });
        if (r.propagateStatus !== "ready") {
          const reason = r.propagateBlockReason ?? `status ${r.propagateStatus}`;
          setError(
            `Lane A did not complete: ${reason}. ` +
              (r.reanchorNeeded.length
                ? `Re-anchor needed at frames ${r.reanchorNeeded.join(", ")}. `
                : "") +
              `Engine: ${r.propagateEngine}.`,
          );
        } else {
          setResult(
            `Lane A ready → ${r.outPath} (${r.frameCount} frames, ${r.keyframeIndices.length} keyframes)`,
          );
        }
      } else if (lane === "B") {
        const r = await runFrameSwapRoundtrip({
          asset,
          artistId,
          wardrobeFeatureId: garmentId,
          transferMode,
          targetFps: fps,
          serverExtract,
          onProgress: (done, total) => setProgress(`Frames ${done}/${total}`),
        });
        setResult(`Lane B dispatched → ${r.outPath} (engine ${r.engine}, ${r.frameCount} frames)`);
      } else {
        const r = await runLaneCRoundtrip({
          asset,
          artistId,
          wardrobeFeatureId: garmentId,
          transferMode,
          serverExtract,
          targetFps: fps,
        });
        setResult(`Lane C ready → ${r.outPath} (engine ${r.engine})`);
      }
      toast.success(`Lane ${lane} run finished`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lane run failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
      setProgress(null);
      setConfirming(false);
    }
  }

  if (!artistId) {
    return (
      <section className="rounded-md border border-border bg-card/30 p-4 text-xs text-muted-foreground">
        Attach an artist to this project to run wardrobe video swaps.
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-md border border-primary/30 bg-card/30 p-4">
      <div>
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          Video garment swap · Lane A / B / C
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Runs on a SERVER-extracted short clip — the browser never downloads the 2 GB master. An
          explicit clip range is required.
        </p>
      </div>

      {/* Source + garment */}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Source video
          </span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
            value={selectedVideoId}
            onChange={(e) => {
              setSelectedVideoId(e.target.value);
              reset();
            }}
          >
            <option value="">Select source video…</option>
            {videoAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {(a.metadata_json as { original_filename?: string } | null)?.original_filename ??
                  a.file_url.split("/").pop()}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Garment reference
          </span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
            value={garmentId}
            onChange={(e) => {
              setGarmentId(e.target.value);
              reset();
            }}
          >
            <option value="">Select wardrobe item…</option>
            {wardrobeItems.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Lane + clip range + settings */}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Lane</span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
            value={lane}
            onChange={(e) => {
              setLane(e.target.value as Lane);
              reset();
            }}
          >
            <option value="A">Lane A — keyframe + propagation</option>
            <option value="B">Lane B — per-frame VTON (diagnostic)</option>
            <option value="C">Lane C — Lucy v2v (benchmark)</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Start (s)
          </span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={startSec}
            onChange={(e) => {
              setStartSec(Math.max(0, Number(e.target.value)));
              reset();
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Duration (s)
          </span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={durationSec}
            onChange={(e) => {
              setDurationSec(Math.max(0.1, Number(e.target.value)));
              reset();
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Target fps
          </span>
          <input
            type="number"
            min={1}
            max={30}
            step={1}
            value={fps}
            onChange={(e) => {
              setFps(Math.max(1, Number(e.target.value)));
              reset();
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
          />
        </label>
        {lane !== "A" && (
          <label className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Transfer mode
            </span>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
              value={transferMode}
              onChange={(e) => setTransferMode(e.target.value as "jacket_only" | "full_look")}
            >
              <option value="jacket_only">Jacket only</option>
              <option value="full_look">Full look</option>
            </select>
          </label>
        )}
      </div>

      {!confirming ? (
        <Button size="sm" disabled={!canReview} onClick={() => setConfirming(true)}>
          <PlayCircle className="mr-1.5 h-4 w-4" />
          Review run
        </Button>
      ) : (
        // PREVIEW / CONFIRM — lane, model, garment reference, and settings.
        <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Confirm this run
          </p>
          <div className="grid gap-3 md:grid-cols-[auto_1fr]">
            {garmentRefUrl && (
              <img
                src={garmentRefUrl}
                alt="Garment reference"
                className="h-28 w-28 rounded border border-border object-contain bg-muted/20"
              />
            )}
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Lane</dt>
              <dd>{laneMeta.label}</dd>
              <dt className="text-muted-foreground">Model / engine</dt>
              <dd>{laneMeta.engine}</dd>
              <dt className="text-muted-foreground">Garment</dt>
              <dd>{selectedGarment?.label ?? "—"}</dd>
              <dt className="text-muted-foreground">Source</dt>
              <dd className="truncate">{selectedAsset?.file_url.split("/").pop()}</dd>
              <dt className="text-muted-foreground">Clip range</dt>
              <dd>
                {startSec.toFixed(1)}s → {(startSec + durationSec).toFixed(1)}s (
                {durationSec.toFixed(1)}s)
              </dd>
              <dt className="text-muted-foreground">Frames</dt>
              <dd>
                ~{plannedFrames} @ {fps} fps
              </dd>
              {lane !== "A" && (
                <>
                  <dt className="text-muted-foreground">Transfer</dt>
                  <dd>{transferMode}</dd>
                </>
              )}
            </dl>
          </div>
          <p
            className={[
              "flex items-start gap-1.5 text-[11px]",
              laneMeta.pixelPreserving ? "text-muted-foreground" : "text-amber-300",
            ].join(" ")}
          >
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {laneMeta.caveat}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleRun} disabled={running}>
              {running ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-4 w-4" />
              )}
              Run Lane {lane}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={running}
            >
              Back
            </Button>
          </div>
        </div>
      )}

      {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
      {error && <p className="text-xs text-rose-300">{error}</p>}
      {result && <p className="text-xs text-emerald-300">{result}</p>}
    </section>
  );
}
