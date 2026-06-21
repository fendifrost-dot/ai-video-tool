import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  Film,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/queries/projects";
import {
  bucketForAssetType,
  isVideoAsset,
  useProjectAssets,
} from "@/lib/queries/projectAssets";
import { useWardrobe } from "@/lib/queries/wardrobe";
import { signedUrl } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { captureVideoFrame } from "@/lib/video/captureFrame";
import {
  approveHeroFrameLook,
  buildSessionMeta,
  generateHeroCandidates,
  uploadHeroSourceFrame,
} from "@/lib/queries/heroFrame";
import type { HeroCandidateResult } from "@/lib/heroFrame/types";
import {
  pickFullLookGarmentPath,
  type RefImageLike,
} from "@/lib/garment/vtonReference";

export default function HeroFrameStudioPage({
  projectId,
}: {
  projectId: string;
}) {
  const projectQuery = useProject(projectId);
  const assetsQuery = useProjectAssets(projectId);
  const artistId = projectQuery.data?.artist_id ?? undefined;
  const wardrobeQuery = useWardrobe(artistId);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [scrubTime, setScrubTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [heroScenePath, setHeroScenePath] = useState<string | null>(null);
  const [heroPreviewUrl, setHeroPreviewUrl] = useState<string | null>(null);
  const [garmentId, setGarmentId] = useState("");
  const [productRefUrl, setProductRefUrl] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<HeroCandidateResult[]>([]);
  const [candidateUrls, setCandidateUrls] = useState<Record<string, string>>({});
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [approvedLookId, setApprovedLookId] = useState<string | null>(null);

  const videoAssets = useMemo(
    () => (assetsQuery.data ?? []).filter(isVideoAsset),
    [assetsQuery.data],
  );

  const outerwear = useMemo(
    () =>
      (wardrobeQuery.data ?? []).filter((w) =>
        ["wardrobe_outerwear", "wardrobe_top"].includes(w.feature_type),
      ),
    [wardrobeQuery.data],
  );

  useEffect(() => {
    if (!selectedVideoId) {
      setVideoUrl(null);
      return;
    }
    const asset = videoAssets.find((a) => a.id === selectedVideoId);
    if (!asset) return;
    signedUrl(bucketForAssetType(asset.asset_type), asset.file_url, 3600)
      .then(setVideoUrl)
      .catch(() => setVideoUrl(null));
  }, [selectedVideoId, videoAssets]);

  useEffect(() => {
    if (!garmentId) {
      setProductRefUrl(null);
      return;
    }
    const item = outerwear.find((w) => w.id === garmentId);
    if (!item) return;
    const refs = (item.reference_images ?? []) as RefImageLike[];
    const path = pickFullLookGarmentPath(refs, item.storage_path ?? item.file_url);
    if (!path) return;
    const bucket = path.startsWith("http") ? null : "wardrobe-refs";
    if (bucket) {
      signedUrl(bucket, path, 3600).then(setProductRefUrl).catch(() => setProductRefUrl(null));
    } else {
      setProductRefUrl(path);
    }
  }, [garmentId, outerwear]);

  useEffect(() => {
    let cancelled = false;
    async function loadCandidateUrls() {
      const next: Record<string, string> = {};
      for (const c of candidates) {
        if (!c.previewPath || c.error) continue;
        try {
          if (c.previewPath.startsWith("http")) {
            next[c.identityLookId] = c.previewPath;
          } else {
            next[c.identityLookId] = await signedUrl("look-composites", c.previewPath, 3600);
          }
        } catch {
          // skip
        }
      }
      if (!cancelled) setCandidateUrls(next);
    }
    void loadCandidateUrls();
    return () => {
      cancelled = true;
    };
  }, [candidates]);

  async function handleCaptureFrame() {
    const video = videoRef.current;
    if (!video || !artistId) return;
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Not signed in");

      const blob = await captureVideoFrame(video, scrubTime);
      const { scenePath } = await uploadHeroSourceFrame({
        projectId,
        userId: user.id,
        blob,
        frameTimeSec: scrubTime,
        videoAssetId: selectedVideoId || undefined,
      });
      setHeroScenePath(scenePath);
      setHeroPreviewUrl(URL.createObjectURL(blob));
      setCandidates([]);
      setSelectedCandidateId(null);
      setApprovedLookId(null);
      toast.success("Hero source frame captured");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateCandidates() {
    if (!artistId || !heroScenePath || !garmentId) return;
    setBusy(true);
    setProgress("Starting…");
    setCandidates([]);
    setSelectedCandidateId(null);
    setApprovedLookId(null);
    try {
      const results = await generateHeroCandidates({
        artistId,
        projectId,
        wardrobeFeatureId: garmentId,
        scenePath: heroScenePath,
        frameTimeSec: scrubTime,
        sessionId,
        onProgress: ({ phase, index, total, label }) => {
          setProgress(`${phase === "vton" ? "VTON" : phase === "identity" ? "Identity" : "Done"} ${index + 1}/${total}: ${label}`);
        },
      });
      setCandidates(results);
      const ok = results.filter((r) => !r.error).length;
      toast.success(`Generated ${ok}/${results.length} hero candidates`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function handleApprove() {
    if (!artistId || !selectedCandidateId || !heroScenePath || !garmentId) return;
    const picked = candidates.find((c) => c.identityLookId === selectedCandidateId);
    if (!picked) return;
    setBusy(true);
    try {
      const session = buildSessionMeta({
        sessionId,
        projectId,
        scenePath: heroScenePath,
        sceneBucket: "project-references",
        frameTimeSec: scrubTime,
        wardrobeFeatureId: garmentId,
        candidates,
        approvedLookId: picked.identityLookId,
      });
      await approveHeroFrameLook({
        artistId,
        lookId: picked.identityLookId,
        session,
      });
      setApprovedLookId(picked.identityLookId);
      toast.success("Hero frame approved — Phase 1 gate passed for this candidate");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Hero Frame Studio" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (!artistId) {
    return (
      <>
        <PageHeader title="Hero Frame Studio" subtitle="Attach an artist to this project first." />
        <div className="px-8 py-6 text-sm text-muted-foreground">
          Open project settings and link an artist before running hero-frame transfer.
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        variant="compact"
        title="Hero Frame Studio"
        subtitle="Phase 1 — capture source frame, generate full-look candidates, identity lock, approve one hero still."
      />
      <div className="space-y-6 px-4 py-6 md:px-8">
        <section className="rounded-md border border-border bg-card/30 p-4 space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            1 · Source video & hero frame
          </h2>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
            value={selectedVideoId}
            onChange={(e) => setSelectedVideoId(e.target.value)}
          >
            <option value="">Select source video…</option>
            {videoAssets.map((a) => (
              <option key={a.id} value={a.id}>
                {((a.metadata_json as { original_filename?: string } | null)?.original_filename) ??
                  a.file_url.split("/").pop()}
              </option>
            ))}
          </select>
          {videoUrl && (
            <div className="space-y-2">
              <video
                ref={videoRef}
                src={videoUrl}
                className="max-h-64 w-full rounded-md border border-border bg-black object-contain"
                controls
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onTimeUpdate={(e) => setScrubTime(e.currentTarget.currentTime)}
              />
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.033}
                value={scrubTime}
                onChange={(e) => {
                  const t = Number(e.target.value);
                  setScrubTime(t);
                  if (videoRef.current) videoRef.current.currentTime = t;
                }}
                className="w-full"
              />
              <Button size="sm" onClick={handleCaptureFrame} disabled={busy}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Capture hero frame at {scrubTime.toFixed(2)}s
              </Button>
            </div>
          )}
          {heroPreviewUrl && (
            <div className="flex items-start gap-3">
              <img
                src={heroPreviewUrl}
                alt="Captured hero frame"
                className="h-32 rounded-md border border-emerald-500/40 object-cover"
              />
              <p className="text-xs text-emerald-300">
                Source frame saved to project references. Ready for transfer.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-md border border-border bg-card/30 p-4 space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            2 · Garment reference
          </h2>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-xs"
            value={garmentId}
            onChange={(e) => setGarmentId(e.target.value)}
          >
            <option value="">Select garment…</option>
            {outerwear.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
          {productRefUrl && (
            <div className="flex items-start gap-3">
              <img
                src={productRefUrl}
                alt="Product reference"
                className="h-40 rounded-md border border-border object-contain bg-muted/20"
              />
              <p className="text-xs text-muted-foreground max-w-xs">
                Comparison reference uses the on-model garment shot when available
                (full-look transfer mode).
              </p>
            </div>
          )}
        </section>

        <section className="rounded-md border border-primary/30 bg-card/30 p-4 space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            3 · Generate candidates (4 variants)
          </h2>
          <p className="text-xs text-muted-foreground">
            Full-look + jacket-only × IDM-VTON + CatVTON. Each runs identity lock after transfer.
            Logo composite is skipped so you judge garment geometry honestly.
          </p>
          <Button
            onClick={handleGenerateCandidates}
            disabled={busy || !heroScenePath || !garmentId}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Generate hero candidates
          </Button>
          {progress && (
            <p className="text-xs text-muted-foreground">{progress}</p>
          )}
        </section>

        {candidates.length > 0 && (
          <section className="rounded-md border border-border bg-card/30 p-4 space-y-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              4 · Compare & approve
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
              {candidates.map((c) => {
                const url = candidateUrls[c.identityLookId];
                const selected = selectedCandidateId === c.identityLookId;
                return (
                  <button
                    key={`${c.index}-${c.identityLookId || "err"}`}
                    type="button"
                    disabled={!!c.error || !url}
                    onClick={() => setSelectedCandidateId(c.identityLookId)}
                    className={[
                      "rounded-md border p-3 text-left transition",
                      selected
                        ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                        : "border-border bg-card/40 hover:border-border/80",
                      c.error ? "opacity-60 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <p className="text-xs font-medium">{c.plan.label}</p>
                    {c.error ? (
                      <p className="mt-2 text-[11px] text-rose-300">{c.error}</p>
                    ) : (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {productRefUrl && (
                          <div>
                            <p className="mb-1 text-[10px] text-muted-foreground">Product</p>
                            <img src={productRefUrl} alt="" className="h-36 w-full rounded object-contain bg-muted/20" />
                          </div>
                        )}
                        <div className={productRefUrl ? "" : "col-span-2"}>
                          <p className="mb-1 text-[10px] text-muted-foreground">Candidate</p>
                          {url ? (
                            <img src={url} alt="" className="h-36 w-full rounded object-contain bg-muted/20" />
                          ) : (
                            <div className="flex h-36 items-center justify-center text-xs text-muted-foreground">
                              Loading…
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleApprove}
                disabled={busy || !selectedCandidateId || !!approvedLookId}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Approve selected hero
              </Button>
              {approvedLookId && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    to="/artists/$id/looks/$lookId"
                    params={{ id: artistId, lookId: approvedLookId }}
                  >
                    Open approved look
                  </Link>
                </Button>
              )}
            </div>
            {approvedLookId && (
              <p className="text-xs text-emerald-300">
                Phase 1 gate passed for this candidate. Do not start Phase 2 propagation until
                garment fidelity is visually confirmed against the product reference.
              </p>
            )}
          </section>
        )}

        {!videoAssets.length && (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            <Film className="h-4 w-4" />
            Upload a reference video on the Assets tab first.
          </div>
        )}
      </div>
    </>
  );
}
