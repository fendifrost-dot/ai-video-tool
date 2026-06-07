import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ProviderName } from "@/integrations/supabase/aliases";
import type { Look } from "@/lib/queries/looks";
import {
  signLookPreviewUrl,
  useArtistLooks,
} from "@/lib/queries/looks";
import {
  useGenerateClip,
  useIngestOnSuccess,
  useJobPoller,
  useProviderJob,
} from "@/lib/providerJobs/queries";
import { useProviderCapabilities } from "@/lib/providers/capabilities";
import { LookSelector } from "@/components/looks/LookSelector";
import { ProviderSelector } from "@/components/providers/ProviderSelector";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

const CAMERA_MOVE_OPTIONS = [
  { value: "static", label: "Static shot" },
  { value: "slow_pan", label: "Slow pan" },
  { value: "orbit", label: "Orbit" },
  { value: "dolly", label: "Dolly zoom" },
  { value: "dynamic", label: "Dynamic (high motion)" },
] as const;

function byId(items: Look[]) {
  const map = new Map<string, Look>();
  for (const item of items) map.set(item.id, item);
  return map;
}

function parseSubmitError(err: unknown): string {
  if (!(err instanceof Error)) return "Video generation failed.";
  const msg = err.message || "Video generation failed.";
  if (msg.includes("UNAUTHORISED") || msg.toLowerCase().includes("not signed in")) {
    return "You are not signed in. Please refresh and sign in again.";
  }
  if (msg.includes("INVALID_INPUT") || msg.toLowerCase().includes("prompt")) {
    return "Invalid generation settings. Check prompt, duration, and motion fields.";
  }
  if (msg.includes("not supported")) {
    return "Selected provider is not available for this generation mode.";
  }
  return msg;
}

function JobProgress({
  status,
  ingesting,
  hasAsset,
}: {
  status: string;
  ingesting: boolean;
  hasAsset: boolean;
}) {
  const steps = [
    { key: "queued", label: "Queued" },
    { key: "running", label: "Processing" },
    { key: "ingesting", label: "Ingesting" },
    { key: "ready", label: "Ready" },
  ] as const;

  const activeIdx = hasAsset
    ? 3
    : ingesting
      ? 2
      : status === "running"
        ? 1
        : 0;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Progress</p>
      <div className="grid min-w-0 grid-cols-4 gap-2 text-[11px]">
        {steps.map((step, idx) => (
          <div
            key={step.key}
            className={
              idx <= activeIdx
                ? "min-w-0 truncate rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-200"
                : "min-w-0 truncate rounded border border-border bg-card/30 px-2 py-1 text-muted-foreground"
            }
          >
            {step.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VideoComposer({
  artistId,
  projectId,
}: {
  artistId: string;
  projectId: string;
}) {
  const looksQuery = useArtistLooks(artistId);
  const capsQuery = useProviderCapabilities();
  const looks = useMemo(() => looksQuery.data ?? [], [looksQuery.data]);
  const looksById = useMemo(() => byId(looks), [looks]);

  const [selectedLookIds, setSelectedLookIds] = useState<string[]>([]);
  const [firstFrameLookId, setFirstFrameLookId] = useState<string | null>(null);
  const [lastFrameLookId, setLastFrameLookId] = useState<string | null>(null);
  const [duration, setDuration] = useState(5);
  const [motionStrength, setMotionStrength] = useState(0.65);
  const [cameraMove, setCameraMove] = useState<string>("static");
  const [selectedProvider, setSelectedProvider] = useState<ProviderName>("veo");
  const [promptText, setPromptText] = useState("");
  const [firstPreviewUrl, setFirstPreviewUrl] = useState<string | null>(null);
  const [lastPreviewUrl, setLastPreviewUrl] = useState<string | null>(null);

  const generate = useGenerateClip();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const jobQuery = useProviderJob(activeJobId ?? undefined);
  useJobPoller(activeJobId ?? undefined, jobQuery.data);
  const ingestState = useIngestOnSuccess(activeJobId ?? undefined, jobQuery.data);

  const firstFrameLook = firstFrameLookId
    ? looksById.get(firstFrameLookId) ?? null
    : null;
  const lastFrameLook = lastFrameLookId
    ? looksById.get(lastFrameLookId) ?? null
    : null;

  const providerCap = capsQuery.data?.[selectedProvider] ?? null;
  const maxDuration = providerCap?.max_duration_seconds ?? 12;

  useEffect(() => {
    if (duration > maxDuration) {
      setDuration(maxDuration);
      toast.info(`Duration clamped to ${maxDuration}s for ${selectedProvider}.`);
    }
  }, [duration, maxDuration, selectedProvider]);

  useEffect(() => {
    let cancelled = false;
    if (!firstFrameLook?.generated_storage_path) {
      setFirstPreviewUrl(firstFrameLook?.generated_image_url ?? null);
      return;
    }
    signLookPreviewUrl(firstFrameLook.generated_storage_path, 3600).then((url) => {
      if (!cancelled) setFirstPreviewUrl(url ?? firstFrameLook.generated_image_url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [firstFrameLook]);

  useEffect(() => {
    let cancelled = false;
    if (!lastFrameLook?.generated_storage_path) {
      setLastPreviewUrl(lastFrameLook?.generated_image_url ?? null);
      return;
    }
    signLookPreviewUrl(lastFrameLook.generated_storage_path, 3600).then((url) => {
      if (!cancelled) setLastPreviewUrl(url ?? lastFrameLook.generated_image_url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [lastFrameLook]);

  const canSubmit =
    !!firstFrameLook &&
    !generate.isPending &&
    !ingestState.ingesting &&
    promptText.trim().length >= 12;

  const validationWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (providerCap?.max_duration_seconds && duration > providerCap.max_duration_seconds) {
      warnings.push(
        `Duration ${duration}s exceeds ${selectedProvider} max of ${providerCap.max_duration_seconds}s.`,
      );
    }
    if (
      firstFrameLook?.generated_storage_path &&
      providerCap &&
      !providerCap.supports_reference_image
    ) {
      warnings.push(
        `${selectedProvider} may ignore first-frame image references.`,
      );
    }
    return warnings;
  }, [providerCap, duration, selectedProvider, firstFrameLook]);

  async function handleSubmit() {
    if (!firstFrameLook) {
      toast.error("Pick a first-frame look.");
      return;
    }
    if (promptText.trim().length < 12) {
      toast.error("Add a prompt with at least 12 characters.");
      return;
    }
    try {
      const mode = firstFrameLook.generated_storage_path
        ? "image_to_video"
        : "text_to_video";
      const result = await generate.mutateAsync({
        provider: selectedProvider,
        projectId,
        promptId: null,
        shotId: null,
        promptText: promptText.trim(),
        mode,
        referenceImagePath: firstFrameLook.generated_storage_path ?? null,
        duration: Math.min(duration, maxDuration),
        settings: {
          motionStrength,
          cameraMove,
          firstFrameLookId,
          lastFrameLookId,
          lookIds: selectedLookIds,
        },
      });
      setActiveJobId(result.providerJobRowId);
      toast.success(`Submitted to ${selectedProvider} (${result.envelope.status}).`);
    } catch (err) {
      toast.error(parseSubmitError(err));
    }
  }

  return (
    <div className="space-y-6 px-8 py-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Video composer</h2>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {generate.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate clip"
          )}
        </Button>
      </div>

      {validationWarnings.length > 0 && (
        <Card className="space-y-1 border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          {validationWarnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-1 xl:grid-cols-3">
        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            1. Select looks
          </h3>
          {looks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No looks found for this artist yet.
            </p>
          ) : (
            <LookSelector
              artistId={artistId}
              selected={looks.filter((look) => selectedLookIds.includes(look.id))}
              onChange={(next) => setSelectedLookIds(next.map((look) => look.id))}
              multiSelect
              placeholder="Select looks for style guidance..."
            />
          )}
        </Card>

        <Card className="space-y-5 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            2. Frame setup
          </h3>
          <div className="space-y-2">
            <Label>First frame look</Label>
            <LookSelector
              artistId={artistId}
              selected={firstFrameLook ? [firstFrameLook] : []}
              onChange={(next) => setFirstFrameLookId(next[0]?.id ?? null)}
              placeholder="Choose a look"
            />
          </div>

          <div className="space-y-2">
            <Label>Last frame look (optional)</Label>
            <LookSelector
              artistId={artistId}
              selected={lastFrameLook ? [lastFrameLook] : []}
              onChange={(next) => setLastFrameLookId(next[0]?.id ?? null)}
              placeholder="Optional transition target"
            />
            {lastFrameLook && (
              <Button
                variant="ghost"
                size="sm"
                className="px-1 text-xs text-muted-foreground"
                onClick={() => setLastFrameLookId(null)}
              >
                Clear last-frame look
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">First frame</p>
              <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted/20">
                {firstPreviewUrl ? (
                  <img src={firstPreviewUrl} alt="First frame preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-content-center text-xs text-muted-foreground">No preview</div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Last frame</p>
              <div className="aspect-video overflow-hidden rounded-md border border-border bg-muted/20">
                {lastPreviewUrl ? (
                  <img src={lastPreviewUrl} alt="Last frame preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-content-center text-xs text-muted-foreground">Optional</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Duration: {duration}s</Label>
            <Slider
              value={[duration]}
              onValueChange={([v]) => setDuration(v)}
              min={3}
              max={Math.max(3, maxDuration)}
              step={1}
            />
            {providerCap?.max_duration_seconds && (
              <p className="text-xs text-muted-foreground">
                {selectedProvider} max: {providerCap.max_duration_seconds}s
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Motion strength: {Math.round(motionStrength * 100)}%</Label>
            <Slider
              value={[Math.round(motionStrength * 100)]}
              onValueChange={([v]) => setMotionStrength(v / 100)}
              min={20}
              max={95}
              step={1}
            />
          </div>
        </Card>

        <Card className="space-y-5 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            3. Generation settings
          </h3>
          <div className="space-y-2">
            <Label>Provider</Label>
            <ProviderSelector
              value={selectedProvider}
              onChange={(v) => setSelectedProvider(v as ProviderName)}
              capabilitiesFilter="video"
            />
          </div>

          <div className="space-y-2">
            <Label>Camera movement</Label>
            <Select value={cameraMove} onValueChange={setCameraMove}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMERA_MOVE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea
              rows={7}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Describe the clip, action, camera language, lighting, and style."
            />
            <p className="text-xs text-muted-foreground">
              Use at least 12 characters. First-frame look is used as image
              reference when available.
            </p>
          </div>
        </Card>
      </div>

      {jobQuery.data && (
        <Card className="space-y-3 p-4 text-sm">
          <p>
            <span className="text-muted-foreground">Job status:</span>{" "}
            <span className="font-medium">{jobQuery.data.status}</span>
          </p>
          <JobProgress
            status={jobQuery.data.status}
            ingesting={ingestState.ingesting}
            hasAsset={!!jobQuery.data.result_asset_id}
          />
          {jobQuery.data.error_text && (
            <p className="text-destructive">{jobQuery.data.error_text}</p>
          )}
          {ingestState.ingesting && (
            <p className="text-muted-foreground">Saving generated clip to Assets...</p>
          )}
          {jobQuery.data.result_asset_id && (
            <p className="text-emerald-300">Clip saved to project assets.</p>
          )}
        </Card>
      )}
    </div>
  );
}
