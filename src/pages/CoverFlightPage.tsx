import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { saveAs } from "file-saver";
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  MousePointer2,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { CoverFlightAnnotator, type CoverFlightTool } from "@/components/coverFlight/CoverFlightAnnotator";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  buildPresetGuides,
  classifyCoverAspect,
  compileCoverFlightFromGuides,
  COVER_FLIGHT_FLOW_SETTINGS,
  describeFlightPath,
  GOOGLE_FLOW_URL,
  renderAnnotatedCover,
  suggestPathKind,
  type FlightGuides,
  type PathKind,
} from "@/lib/coverFlight";
import {
  isImageAsset,
  useBatchAssetSignedUrls,
  useProjectAssets,
} from "@/lib/queries/projectAssets";
import { useProject } from "@/lib/queries/projects";
import type { ProjectAsset } from "@/integrations/supabase/aliases";

const EMPTY_GUIDES: FlightGuides = { path: [], arrows: [] };

function CoverFlightPageInner({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const assetsQuery = useProjectAssets(projectId);
  const imageAssets = useMemo(
    () => (assetsQuery.data ?? []).filter(isImageAsset),
    [assetsQuery.data],
  );
  const { urls, loading: urlsLoading } = useBatchAssetSignedUrls(imageAssets);

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const localUrlRef = useRef<string | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [guides, setGuides] = useState<FlightGuides>(EMPTY_GUIDES);
  const [tool, setTool] = useState<CoverFlightTool>("path");
  const [undo, setUndo] = useState<FlightGuides[]>([]);
  const [pathDescription, setPathDescription] = useState("");
  const [keyElements, setKeyElements] = useState("");
  const [descTouched, setDescTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    };
  }, []);

  const imageUrl = localUrl ?? (selectedAssetId ? urls[selectedAssetId] ?? null : null);

  const compiled = useMemo(
    () => compileCoverFlightFromGuides(guides, pathDescription, keyElements),
    [guides, pathDescription, keyElements],
  );

  const aspect = imageSize
    ? classifyCoverAspect(imageSize.width, imageSize.height)
    : null;

  const guidesRef = useRef(guides);
  guidesRef.current = guides;

  const snapshotUndo = useCallback(() => {
    setUndo((stack) => [...stack.slice(-19), guidesRef.current]);
  }, []);

  const applyGuides = useCallback((next: FlightGuides) => {
    snapshotUndo();
    setGuides(next);
  }, [snapshotUndo]);

  const handleGuidesChange = useCallback(
    (next: FlightGuides) => {
      setGuides(next);
      if (!descTouched) {
        setPathDescription(describeFlightPath(next.path, { keyElements }));
      }
    },
    [descTouched, keyElements],
  );

  function applyPreset(kind: PathKind) {
    const next = buildPresetGuides(kind);
    applyGuides(next);
    setPathDescription(describeFlightPath(next.path, { keyElements }));
    setDescTouched(false);
    setTool("arrow");
  }

  function handleLocalFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file for the cover.");
      return;
    }
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const url = URL.createObjectURL(file);
    localUrlRef.current = url;
    setLocalUrl(url);
    setSelectedAssetId(null);
    setGuides(EMPTY_GUIDES);
    setUndo([]);
    setPathDescription("");
    setDescTouched(false);
    setImageSize(null);
  }

  function pickAsset(asset: ProjectAsset) {
    if (localUrlRef.current) {
      URL.revokeObjectURL(localUrlRef.current);
      localUrlRef.current = null;
    }
    setLocalUrl(null);
    setSelectedAssetId(asset.id);
    setGuides(EMPTY_GUIDES);
    setUndo([]);
    setPathDescription("");
    setDescTouched(false);
    setImageSize(null);
  }

  async function copyPrompt() {
    if (compiled.unfilled) {
      toast.error(compiled.issues[0] ?? "Finish the path and description first.");
      return;
    }
    try {
      await navigator.clipboard.writeText(compiled.promptText);
      toast.success("Prompt copied — paste into Flow with Omni Flash.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Copy failed");
    }
  }

  async function downloadAnnotated() {
    if (!imageUrl) {
      toast.error("Load a cover first.");
      return;
    }
    if (guides.path.length < 2) {
      toast.error("Draw the red flight line before exporting.");
      return;
    }
    try {
      const img = await loadImage(imageUrl);
      const canvas = renderAnnotatedCover(
        img,
        img.naturalWidth,
        img.naturalHeight,
        guides,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Could not export PNG (canvas may be tainted).");
      const title = projectQuery.data?.song_title || projectQuery.data?.title || "cover";
      saveAs(blob, `${slug(title)}-flight-guides.png`);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Export failed — try a local image if the cover is CORS-blocked.",
      );
    }
  }

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Cover Flight" />
        <div className="px-8 py-6">
          <div className="h-24 animate-pulse rounded-md border border-border bg-muted/20" />
        </div>
      </>
    );
  }

  if (projectQuery.error || !projectQuery.data) {
    return (
      <>
        <PageHeader title="Cover Flight" />
        <div className="px-8 py-6">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {projectQuery.error instanceof Error
              ? projectQuery.error.message
              : "Project not found."}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        variant="compact"
        title="Cover Flight"
        subtitle="Annotate a music cover, then paste the Omni Flash prompt into Google Flow."
      />
      <div className="space-y-6 px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/projects/$id" params={{ id: projectId }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to project
            </Link>
          </Button>
          <a
            href={GOOGLE_FLOW_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            Open labs.google/flow
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <section className="rounded-md border border-border bg-card/30 p-4 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Red line</span> = where
            the camera flies.{" "}
            <span className="font-medium text-foreground">White arrows</span> = where
            it looks. Guides are production marks only — Flow erases them and
            keeps the cover a flat, unchanged picture.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Cover
                </h2>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleLocalFile(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-1.5 h-4 w-4" />
                    Local image
                  </Button>
                </div>
              </div>
              {urlsLoading && imageAssets.length > 0 && !imageUrl && (
                <p className="mb-2 text-xs text-muted-foreground">Signing previews…</p>
              )}
              {imageAssets.length > 0 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {imageAssets.map((asset) => {
                    const url = urls[asset.id];
                    const active = selectedAssetId === asset.id && !localUrl;
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => pickAsset(asset)}
                        className={`h-16 w-16 shrink-0 overflow-hidden rounded-sm border ${
                          active
                            ? "border-primary ring-1 ring-primary"
                            : "border-border"
                        } bg-muted/30`}
                        title={asset.file_url}
                      >
                        {url ? (
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="block h-full w-full bg-muted/40" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {imageAssets.length === 0 && !localUrl && (
                <p className="mb-3 text-xs text-muted-foreground">
                  No project stills yet — upload a cover here, or add a reference
                  image on{" "}
                  <Link
                    to="/projects/$id/assets"
                    params={{ id: projectId }}
                    className="text-primary hover:underline"
                  >
                    Assets
                  </Link>
                  . Square (1:1) works best.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                value={tool}
                onValueChange={(v) => {
                  if (v === "path" || v === "arrow") setTool(v);
                }}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="path" aria-label="Draw red flight path">
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Red line
                </ToggleGroupItem>
                <ToggleGroupItem value="arrow" aria-label="Place white viewing arrows">
                  <MousePointer2 className="mr-1 h-3.5 w-3.5" />
                  White arrows
                </ToggleGroupItem>
              </ToggleGroup>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const prev = undo[undo.length - 1];
                  if (!prev) return;
                  setUndo((stack) => stack.slice(0, -1));
                  setGuides(prev);
                }}
                disabled={undo.length === 0}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Undo
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  applyGuides(EMPTY_GUIDES);
                  setPathDescription("");
                  setDescTouched(false);
                }}
                disabled={guides.path.length === 0 && guides.arrows.length === 0}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Clear
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="self-center text-[10px] uppercase tracking-wider text-muted-foreground">
                Presets
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset("horizontal")}>
                Horizontal
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset("circle")}>
                Circle loop
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset("diagonal")}>
                Diagonal
              </Button>
              {aspect && (
                <span className="self-center text-xs text-muted-foreground">
                  {aspect} cover — try{" "}
                  {suggestPathKind(aspect) === "circle" ? "circle loop" : "horizontal"}
                </span>
              )}
            </div>

            <CoverFlightAnnotator
              imageUrl={imageUrl}
              guides={guides}
              tool={tool}
              onChange={handleGuidesChange}
              onBeginEdit={snapshotUndo}
              onImageSize={setImageSize}
            />
            <p className="text-xs text-muted-foreground">
              Draw one continuous red route. Switch to arrows and click the line
              (start → middle → end), then drag to aim the camera. Max three
              arrows.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cover-flight-path">Path description</Label>
              <Textarea
                id="cover-flight-path"
                value={pathDescription}
                onChange={(e) => {
                  setDescTouched(true);
                  setPathDescription(e.target.value);
                }}
                rows={4}
                placeholder="Start at the top left → clockwise curve past the face and title type → Endpoint at the bottom right"
              />
              <p className="text-xs text-muted-foreground">
                Fills the [INSERT PATH] block. Name collage panels or type when
                the cover is busy.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cover-flight-keys">Key elements (optional)</Label>
              <Input
                id="cover-flight-keys"
                value={keyElements}
                onChange={(e) => {
                  setKeyElements(e.target.value);
                  if (!descTouched) {
                    setPathDescription(
                      describeFlightPath(guides.path, { keyElements: e.target.value }),
                    );
                  }
                }}
                placeholder="title type, face, gold logo"
              />
            </div>

            {compiled.issues.length > 0 && (
              <ul className="list-disc space-y-1 rounded-md border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                {compiled.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Omni Flash prompt</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void downloadAnnotated()}>
                    <Download className="mr-1.5 h-4 w-4" />
                    Annotated PNG
                  </Button>
                  <Button type="button" size="sm" onClick={() => void copyPrompt()}>
                    <Copy className="mr-1.5 h-4 w-4" />
                    Copy prompt
                  </Button>
                </div>
              </div>
              <pre className="max-h-72 min-w-0 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card/40 p-3 font-mono text-xs leading-relaxed">
                {compiled.promptText}
              </pre>
            </div>

            <ol className="space-y-2 rounded-md border border-border bg-card/30 p-4 text-sm text-muted-foreground">
              <li>
                1. Download the annotated PNG (red line + white arrows on the
                cover).
              </li>
              <li>
                2. Open{" "}
                <a
                  href={GOOGLE_FLOW_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  labs.google/flow
                </a>{" "}
                and select <strong className="text-foreground">{COVER_FLIGHT_FLOW_SETTINGS.model}</strong>{" "}
                (Google AI Pro).
              </li>
              <li>
                3. Upload the annotated cover, paste the prompt, set{" "}
                <strong className="text-foreground">
                  {COVER_FLIGHT_FLOW_SETTINGS.durationMode}
                </strong>
                , generate.
              </li>
            </ol>

            <p className="text-xs text-muted-foreground">
              Covers of real artists/albums can get flagged — use an invented
              scene in the cover&apos;s style if Flow blocks the run. Never
              describe a visible drone; the prompt already says POV camera, no
              vehicle visible.
            </p>
            <p className="text-[10px] text-muted-foreground/80">
              Flight guide by @by.jadla. AVT compiles the prompt and draws the
              two-line system; generation stays in Flow (manual workflow — Veo
              API is not wired).
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the cover image."));
    img.src = url;
  });
}

function slug(value: string): string {
  const s = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "cover";
}

export default function CoverFlightPage({ projectId }: { projectId: string }) {
  return <CoverFlightPageInner projectId={projectId} />;
}
