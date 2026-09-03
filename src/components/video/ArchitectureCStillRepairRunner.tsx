import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ManualKeyframeQuadEditor, defaultChestStripeQuad } from "@/components/products/ManualKeyframeQuadEditor";
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
  const [stillAssetId, setStillAssetId] = useState("");
  const [stillPreviewUrl, setStillPreviewUrl] = useState<string | null>(null);
  const [logoQuad, setLogoQuad] = useState<QuadNorm>(defaultChestStripeQuad());
  const [leftSleeveQuad, setLeftSleeveQuad] = useState<QuadNorm>(defaultUpperArmQuad("left"));
  const [rightSleeveQuad, setRightSleeveQuad] = useState<QuadNorm>(defaultUpperArmQuad("right"));
  const [busy, setBusy] = useState(false);
  const [logoResultUrl, setLogoResultUrl] = useState<string | null>(null);
  const [logoResultAssetId, setLogoResultAssetId] = useState<string | null>(null);
  const [sleeveResultUrl, setSleeveResultUrl] = useState<string | null>(null);
  const [hardStop, setHardStop] = useState<string | null>(null);
  const [captureHint, setCaptureHint] = useState<string | null>(null);

  const isOwner = isEditR4CanonicalOwner(sessionUid);

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
      // Do NOT pre-seek + await seeked here. When readyState stays 0, seeked never
      // fires and that timeout used to block the WebCodecs fallback entirely.
      // captureVideoFrame prefers WebCodecs when the element has not decoded.
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
      setStillAssetId(assetId);
      await assetsQuery.refetch();
      setCaptureHint(null);
      toast.success(`Captured still at t=${scrubTime.toFixed(3)}s`);
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
      setStillAssetId(assetId);
      await assetsQuery.refetch();
      toast.success("Uploaded repair still — continue with logo_chest");
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
    setBusy(true);
    try {
      const result = await callArchitectureCStillRepair({
        projectId,
        stillAssetId,
        wardrobeFeatureId,
        stage: "logo_chest",
        logoZoneQuad: logoQuad,
      });
      setLogoResultAssetId(result.assetId);
      setLogoResultUrl(result.previewUrl);
      setHardStop(result.hardStop);
      await assetsQuery.refetch();
      toast.success("logo_chest repair saved — review vs flat ref before sleeve");
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
          Freeze V2. No Grok spend. Prove <span className="font-mono">chest_band</span> +{" "}
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
          Use Claude&apos;s t=0.785 extract if in-page capture still fails.
        </span>
      </div>

      <label className="block space-y-1 text-xs">
        <span className="text-muted-foreground">Repair still asset</span>
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
          value={stillAssetId}
          onChange={(e) => setStillAssetId(e.target.value)}
          disabled={busy}
        >
          <option value="">Select, capture, or upload…</option>
          {stills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.file_url.split("/").pop()}
            </option>
          ))}
        </select>
      </label>

      {stillPreviewUrl ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ManualKeyframeQuadEditor
            imageUrl={stillPreviewUrl}
            initialQuad={logoQuad}
            keyframeId="v2-still-0.785-logo"
            disabled={busy || !isOwner}
            onSave={async (q) => {
              setLogoQuad(q);
            }}
          />
          <div className="space-y-3">
            <Button
              type="button"
              size="sm"
              disabled={busy || !isOwner || !stillAssetId}
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
              <img
                src={logoResultUrl}
                alt="logo_chest repair"
                className="max-h-80 w-full rounded-md border border-border object-contain"
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {(logoResultUrl || stillPreviewUrl) && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            Sleeve panels: drag quads onto the <strong>visible upper-arm</strong> navy only.
            This clip cannot prove armhole→cuff.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <ManualKeyframeQuadEditor
              imageUrl={logoResultUrl ?? stillPreviewUrl!}
              initialQuad={leftSleeveQuad}
              keyframeId="v2-still-0.785-sleeve-left"
              disabled={busy || !isOwner}
              onSave={async (q) => setLeftSleeveQuad(q)}
            />
            <ManualKeyframeQuadEditor
              imageUrl={logoResultUrl ?? stillPreviewUrl!}
              initialQuad={rightSleeveQuad}
              keyframeId="v2-still-0.785-sleeve-right"
              disabled={busy || !isOwner}
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
        <span className="font-mono">temporalTrackingEnabled=false</span>).{" "}
        {hardStop ?? "Pass this still visually against the flat ref before any tracking work."}
      </p>
    </section>
  );
}
