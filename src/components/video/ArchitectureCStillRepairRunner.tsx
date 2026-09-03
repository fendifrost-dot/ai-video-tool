import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ManualKeyframeQuadEditor } from "@/components/products/ManualKeyframeQuadEditor";
import { useProject } from "@/lib/queries/projects";
import {
  bucketForAssetType,
  isImageAsset,
  isVideoAsset,
  useProjectAssets,
} from "@/lib/queries/projectAssets";
import { useWardrobe } from "@/lib/queries/wardrobe";
import { signedUrl } from "@/lib/storage";
import { getSessionWithTimeout } from "@/lib/authSession";
import { captureVideoFrame } from "@/lib/video/captureFrame";
import { uploadHeroSourceFrame } from "@/lib/queries/heroFrame";
import { callArchitectureCStillRepair } from "@/lib/queries/architectureCStillRepair";
import {
  ARCHITECTURE_C_V2_REPAIR,
  MEASURED_V2_CHEST_BAND_QUAD,
  assessChestBandQuadPlacement,
  isStillRepairOutputMetadata,
  type SleevePanelManual,
} from "@/lib/heroFrame/architectureCStillRepair";
import { isEditR4CanonicalOwner } from "@/lib/heroFrame/editR4ProductIds";
import type { QuadNorm } from "@/lib/garment/placementEngine";

function defaultUpperArmQuad(side: "left" | "right"): QuadNorm {
  // Visible upper-arm only (arms crossed) — starting guess; user must drag.
  if (side === "left") {
    return [
      [0.12, 0.38],
      [0.28, 0.36],
      [0.3, 0.48],
      [0.14, 0.5],
    ];
  }
  return [
    [0.7, 0.36],
    [0.86, 0.38],
    [0.84, 0.5],
    [0.68, 0.48],
  ];
}

function cloneQuad(q: QuadNorm): QuadNorm {
  return q.map(([x, y]) => [x, y]) as QuadNorm;
}

export function ArchitectureCStillRepairRunner({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const assetsQuery = useProjectAssets(projectId);
  const artistId = projectQuery.data?.artist_id ?? undefined;
  const wardrobeQuery = useWardrobe(artistId);

  const videos = useMemo(
    () => (assetsQuery.data ?? []).filter(isVideoAsset),
    [assetsQuery.data],
  );
  const stills = useMemo(
    () => (assetsQuery.data ?? []).filter(isImageAsset),
    [assetsQuery.data],
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [sessionUid, setSessionUid] = useState<string | null>(null);
  const [videoAssetId, setVideoAssetId] = useState<string>(ARCHITECTURE_C_V2_REPAIR.editedClipAssetId);
  const [wardrobeFeatureId, setWardrobeFeatureId] = useState<string>(
    ARCHITECTURE_C_V2_REPAIR.wardrobeFeatureId,
  );
  const [scrubTime, setScrubTime] = useState<number>(ARCHITECTURE_C_V2_REPAIR.recommendedStillTimeSec);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  /** Clean capture/upload only — never auto-replaced by a repair output. */
  const [stillAssetId, setStillAssetId] = useState("");
  const [stillPreviewUrl, setStillPreviewUrl] = useState<string | null>(null);
  const [logoQuad, setLogoQuad] = useState<QuadNorm>(() => cloneQuad(MEASURED_V2_CHEST_BAND_QUAD));
  const [quadEditorEpoch, setQuadEditorEpoch] = useState(0);
  const [leftSleeveQuad, setLeftSleeveQuad] = useState<QuadNorm>(defaultUpperArmQuad("left"));
  const [rightSleeveQuad, setRightSleeveQuad] = useState<QuadNorm>(defaultUpperArmQuad("right"));
  const [busy, setBusy] = useState(false);
  const [logoResultUrl, setLogoResultUrl] = useState<string | null>(null);
  const [logoResultAssetId, setLogoResultAssetId] = useState<string | null>(null);
  const [sleeveResultUrl, setSleeveResultUrl] = useState<string | null>(null);
  const [hardStop, setHardStop] = useState<string | null>(null);
  const [captureHint, setCaptureHint] = useState<string | null>(null);

  const isOwner = isEditR4CanonicalOwner(sessionUid);
  const chestAssessment = useMemo(() => assessChestBandQuadPlacement(logoQuad), [logoQuad]);

  const selectedStillMeta = useMemo(() => {
    const asset = stills.find((a) => a.id === stillAssetId);
    return asset?.metadata_json ?? null;
  }, [stills, stillAssetId]);
  const selectedIsRepairOutput = isStillRepairOutputMetadata(selectedStillMeta);

  useEffect(() => {
    let cancelled = false;
    getSessionWithTimeout()
      .then((s) => {
        if (!cancelled) {
          setSessionUid(s.user && !s.user.is_anonymous ? s.user.id : null);
        }
      })
      .catch(() => {
        if (!cancelled) setSessionUid(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!videos.some((v) => v.id === videoAssetId) && videos.length) {
      const v2 = videos.find((v) => v.id === ARCHITECTURE_C_V2_REPAIR.editedClipAssetId);
      if (v2) setVideoAssetId(v2.id);
    }
  }, [videos, videoAssetId]);

  useEffect(() => {
    const asset = videos.find((v) => v.id === videoAssetId);
    if (!asset) {
      setVideoUrl(null);
      return;
    }
    let cancelled = false;
    signedUrl(bucketForAssetType(asset.asset_type), asset.file_url, 3600)
      .then((url) => !cancelled && setVideoUrl(url))
      .catch(() => !cancelled && setVideoUrl(null));
    return () => {
      cancelled = true;
    };
  }, [videoAssetId, videos]);

  useEffect(() => {
    if (!stillAssetId) {
      setStillPreviewUrl(null);
      return;
    }
    const asset = stills.find((a) => a.id === stillAssetId);
    if (!asset) return;
    let cancelled = false;
    signedUrl(bucketForAssetType(asset.asset_type), asset.file_url, 3600)
      .then((url) => !cancelled && setStillPreviewUrl(url))
      .catch(() => !cancelled && setStillPreviewUrl(null));
    return () => {
      cancelled = true;
    };
  }, [stillAssetId, stills]);

  function selectCleanStill(assetId: string) {
    setStillAssetId(assetId);
    setLogoResultAssetId(null);
    setLogoResultUrl(null);
    setSleeveResultUrl(null);
  }

  function handleStillSelectorChange(nextId: string) {
    if (!nextId) {
      setStillAssetId("");
      return;
    }
    const asset = stills.find((a) => a.id === nextId);
    if (asset && isStillRepairOutputMetadata(asset.metadata_json)) {
      toast.error(
        "That asset is a repair output. Keep the clean capture as the logo_chest input — use the result preview for review only.",
      );
      return;
    }
    selectCleanStill(nextId);
  }

  async function handleCaptureStill() {
    if (!isOwner) {
      toast.error("Sign in as the durable owner to capture a repair still");
      return;
    }
    const video = videoRef.current;
    if (!video) {
      toast.error("Video element missing — wait for the V2 clip URL to load");
      return;
    }
    if (!videoUrl) {
      toast.error("No signed video URL yet — cannot capture");
      return;
    }
    setBusy(true);
    setCaptureHint(null);
    try {
      const session = await getSessionWithTimeout();
      const userId = session.user.id;
      setCaptureHint(
        `Capturing t=${scrubTime.toFixed(3)}s (readyState=${video.readyState})…`,
      );
      const blob = await captureVideoFrame(video, scrubTime);
      const { assetId } = await uploadHeroSourceFrame({
        projectId,
        userId,
        blob,
        frameTimeSec: scrubTime,
        videoAssetId,
      });
      selectCleanStill(assetId);
      await assetsQuery.refetch();
      setCaptureHint(null);
      toast.success(`Captured clean still at t=${scrubTime.toFixed(3)}s`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Capture failed";
      setCaptureHint(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadStill(file: File) {
    if (!isOwner) {
      toast.error("Sign in as the durable owner to upload a repair still");
      return;
    }
    setBusy(true);
    setCaptureHint(null);
    try {
      const session = await getSessionWithTimeout();
      const { normalizeImageForUpload } = await import("@/lib/image-normalize");
      const normalized = await normalizeImageForUpload(file);
      const { assetId } = await uploadHeroSourceFrame({
        projectId,
        userId: session.user.id,
        blob: normalized,
        frameTimeSec: scrubTime,
        videoAssetId,
      });
      selectCleanStill(assetId);
      await assetsQuery.refetch();
      toast.success("Uploaded clean repair still — continue with logo_chest");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setCaptureHint(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function handleLogoChest() {
    if (!isOwner) {
      toast.error("Sign in as the durable owner");
      return;
    }
    if (!stillAssetId) {
      toast.error("Capture or upload a repair still first");
      return;
    }
    if (selectedIsRepairOutput || stillAssetId === logoResultAssetId) {
      toast.error(
        "logo_chest input must be the clean still — not a previous repair output (chaining hazard).",
      );
      return;
    }
    if (!chestAssessment.ok) {
      toast.warning(
        `Placement warning: ${chestAssessment.warnings[0] ?? "quad looks off-garment"}. Re-check before treating as success.`,
      );
    }
    setBusy(true);
    try {
      const result = await callArchitectureCStillRepair({
        projectId,
        stillAssetId,
        wardrobeFeatureId,
        stage: "logo_chest",
        logoZoneQuad: logoQuad,
      });
      // Do NOT set stillAssetId to the output — that was the chaining hazard.
      setLogoResultAssetId(result.assetId);
      setLogoResultUrl(result.previewUrl);
      setHardStop(result.hardStop);
      await assetsQuery.refetch();
      if (!chestAssessment.ok) {
        toast.warning(
          "logo_chest saved, but quad looked off-garment — review the preview; clean still remains selected for re-run.",
        );
      } else {
        toast.success(
          "logo_chest saved — clean still stays selected; review result vs flat ref before sleeve",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "logo_chest failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSleeve() {
    if (!isOwner) {
      toast.error("Sign in as the durable owner");
      return;
    }
    const sourceStill = logoResultAssetId || stillAssetId;
    if (!sourceStill) {
      toast.error("Need a still (prefer logo_chest output) before sleeve_panel");
      return;
    }
    setBusy(true);
    try {
      const sleevePanels: SleevePanelManual[] = [
        { side: "left", targetQuad: leftSleeveQuad },
        { side: "right", targetQuad: rightSleeveQuad },
      ];
      const result = await callArchitectureCStillRepair({
        projectId,
        stillAssetId: sourceStill,
        wardrobeFeatureId,
        stage: "sleeve_panel",
        sleevePanels,
      });
      setSleeveResultUrl(result.previewUrl);
      setHardStop(result.hardStop);
      await assetsQuery.refetch();
      toast.success("sleeve_panel repair saved — HARD STOP before tracking");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "sleeve_panel failed");
    } finally {
      setBusy(false);
    }
  }

  const garments = wardrobeQuery.data ?? [];

  return (
    <section className="space-y-4 rounded-md border border-border bg-card/30 p-4">
      <div>
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          7 · Architecture C — still-first deterministic repair
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Active prompt stays V2 (no spend). Prove <span className="font-mono">chest_band</span> +{" "}
          <span className="font-mono">logo_zone</span>, then manual{" "}
          <span className="font-mono">sleeve_panel</span> on the visible upper arm. Temporal
          tracking is disabled until this still passes review.
        </p>
      </div>

      {!isOwner ? (
        <p className="flex items-start gap-2 text-xs text-amber-200/90">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Sign in as the durable owner to run still repair.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">V2 edited_clip</span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
            value={videoAssetId}
            onChange={(e) => setVideoAssetId(e.target.value)}
            disabled={busy}
          >
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id === ARCHITECTURE_C_V2_REPAIR.editedClipAssetId ? "V2 · " : ""}
                {v.file_url.split("/").pop()}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Garment</span>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
            value={wardrobeFeatureId}
            onChange={(e) => setWardrobeFeatureId(e.target.value)}
            disabled={busy}
          >
            {garments.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {videoUrl ? (
        <div className="space-y-2">
          <video
            ref={videoRef}
            src={videoUrl}
            className="max-h-72 w-full rounded-md border border-border bg-black"
            controls
            preload="auto"
            playsInline
            crossOrigin="anonymous"
            onLoadedMetadata={() => {
              if (videoRef.current) videoRef.current.currentTime = scrubTime;
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">
              t=
              <input
                type="number"
                step="0.001"
                min={0}
                className="ml-1 w-24 rounded border border-border bg-background px-2 py-1 font-mono"
                value={scrubTime}
                onChange={(e) => setScrubTime(Number(e.target.value))}
                disabled={busy}
              />
              s (recommended 0.785)
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !isOwner}
              onClick={handleCaptureStill}
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Capture repair still
            </Button>
          </div>
          {captureHint ? (
            <p className="text-[11px] text-amber-200/90">{captureHint}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              If the preview never buffers (readyState 0), Capture still uses WebCodecs on the
              signed URL. Upload below bypasses the media element entirely.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy || !isOwner}
          onClick={() => uploadRef.current?.click()}
        >
          Upload repair still
        </Button>
        <input
          ref={uploadRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUploadStill(file);
          }}
        />
        <span className="text-[11px] text-muted-foreground">
          Prefer clean still{" "}
          <span className="font-mono">{ARCHITECTURE_C_V2_REPAIR.recommendedStillAssetId.slice(0, 8)}…</span>{" "}
          (t=0.785) if in-page capture fails.
        </span>
      </div>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">
          Repair still asset (clean input only — repair outputs are blocked here)
        </span>
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
          value={stillAssetId}
          onChange={(e) => handleStillSelectorChange(e.target.value)}
          disabled={busy}
        >
          <option value="">Select, capture, or upload…</option>
          {stills.map((s) => {
            const repairOut = isStillRepairOutputMetadata(s.metadata_json);
            const stage =
              s.metadata_json &&
              typeof s.metadata_json === "object" &&
              "repair_stage" in s.metadata_json
                ? String((s.metadata_json as { repair_stage?: string }).repair_stage)
                : "";
            return (
              <option key={s.id} value={s.id} disabled={repairOut}>
                {repairOut ? `[repair:${stage}] ` : ""}
                {s.id === ARCHITECTURE_C_V2_REPAIR.recommendedStillAssetId ? "★ " : ""}
                {s.file_url.split("/").pop()}
              </option>
            );
          })}
        </select>
      </label>
      {selectedIsRepairOutput ? (
        <p className="text-[11px] text-amber-200/90">
          Selected asset looks like a repair output. Reselect the clean capture before logo_chest.
        </p>
      ) : null}

      {stillPreviewUrl ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <ManualKeyframeQuadEditor
              key={`chest-${stillAssetId}-${quadEditorEpoch}`}
              imageUrl={stillPreviewUrl}
              initialQuad={logoQuad}
              keyframeId="v2-still-0.785-logo"
              disabled={busy || !isOwner}
              heading="Chest band + logo_zone quad"
              hint="Seeded from the measured band (y ≈ 0.503–0.578). Drag corners or type numeric x/y. Full-band navy cover + one wearer's-left wordmark."
              saveLabel="Lock chest quad"
              onQuadChange={setLogoQuad}
              onSave={async (q) => {
                setLogoQuad(q);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setLogoQuad(cloneQuad(MEASURED_V2_CHEST_BAND_QUAD));
                setQuadEditorEpoch((n) => n + 1);
              }}
            >
              Reset to measured band
            </Button>
            {!chestAssessment.ok ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                <p className="font-medium">Placement warning (do not treat as silent success)</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {chestAssessment.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Quad overlaps measured chest band (center y={chestAssessment.centerY.toFixed(3)}).
              </p>
            )}
          </div>
          <div className="space-y-3">
            <Button
              type="button"
              size="sm"
              disabled={busy || !isOwner || !stillAssetId || selectedIsRepairOutput}
              onClick={handleLogoChest}
            >
              {busy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              1 · Repair chest_band + logo_zone
            </Button>
            {logoResultUrl ? (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  Stage-1 result (review only — not auto-selected as next input)
                </p>
                <img
                  src={logoResultUrl}
                  alt="logo_chest repair"
                  className="max-h-80 w-full rounded-md border border-border object-contain"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {(logoResultUrl || stillPreviewUrl) && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Sleeve panels: drag or type quads onto the <strong>visible upper-arm</strong> navy only.
            Arms are crossed for the entire clip — this cannot prove armhole→cuff.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <ManualKeyframeQuadEditor
              key={`sleeve-l-${logoResultAssetId ?? stillAssetId}`}
              imageUrl={logoResultUrl ?? stillPreviewUrl!}
              initialQuad={leftSleeveQuad}
              keyframeId="v2-still-0.785-sleeve-left"
              disabled={busy || !isOwner}
              heading="Left upper-arm sleeve_panel"
              hint="Visible upper arm only (arms crossed)."
              saveLabel="Lock left sleeve quad"
              onQuadChange={setLeftSleeveQuad}
              onSave={async (q) => setLeftSleeveQuad(q)}
            />
            <ManualKeyframeQuadEditor
              key={`sleeve-r-${logoResultAssetId ?? stillAssetId}`}
              imageUrl={logoResultUrl ?? stillPreviewUrl!}
              initialQuad={rightSleeveQuad}
              keyframeId="v2-still-0.785-sleeve-right"
              disabled={busy || !isOwner}
              heading="Right upper-arm sleeve_panel"
              hint="Visible upper arm only (arms crossed)."
              saveLabel="Lock right sleeve quad"
              onQuadChange={setRightSleeveQuad}
              onSave={async (q) => setRightSleeveQuad(q)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !isOwner || !(logoResultAssetId || stillAssetId)}
            onClick={handleSleeve}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            2 · Repair sleeve_panel (manual, upper arm)
          </Button>
          {sleeveResultUrl ? (
            <img
              src={sleeveResultUrl}
              alt="sleeve_panel repair"
              className="max-h-80 w-full rounded-md border border-border object-contain"
            />
          ) : null}
        </div>
      )}

      <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        HARD STOP: temporal propagation / SAM-3 master composite are{" "}
        <span className="font-mono">not</span> wired here (
        <span className="font-mono">temporalTrackingEnabled=false</span>). V3 prompt is installed
        but inactive — no paid V3 call until this still passes.{" "}
        {hardStop ?? "Pass this still visually against the flat ref before any tracking work."}
      </p>
    </section>
  );
}
