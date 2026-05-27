import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { ProviderName } from "@/integrations/supabase/aliases";
import type { Look } from "@/lib/queries/looks";
import { useArtistLooks } from "@/lib/queries/looks";
import {
  useGenerateClip,
  useIngestOnSuccess,
  useJobPoller,
  useProviderJob,
} from "@/lib/providerJobs/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

const PROVIDERS: ProviderName[] = [
  "veo",
  "higgsfield",
  "runway",
  "grok",
  "pika",
  "fal",
];

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

export function VideoComposer({
  artistId,
  projectId,
}: {
  artistId: string;
  projectId: string;
}) {
  const looksQuery = useArtistLooks(artistId);
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

  const generate = useGenerateClip();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const jobQuery = useProviderJob(activeJobId ?? undefined);
  useJobPoller(activeJobId ?? undefined, jobQuery.data);
  const ingestState = useIngestOnSuccess(activeJobId ?? undefined, jobQuery.data);

  const firstFrameLook = firstFrameLookId ? looksById.get(firstFrameLookId) ?? null : null;
  const lastFrameLook = lastFrameLookId ? looksById.get(lastFrameLookId) ?? null : null;

  const canSubmit =
    !!firstFrameLook &&
    !generate.isPending &&
    !ingestState.ingesting &&
    promptText.trim().length >= 12;

  function toggleLookId(lookId: string, checked: boolean) {
    setSelectedLookIds((curr) => {
      if (checked) return curr.includes(lookId) ? curr : [...curr, lookId];
      return curr.filter((id) => id !== lookId);
    });
  }

  async function handleSubmit() {
    if (!firstFrameLook) {
      toast.error("Pick a first-frame look");
      return;
    }
    if (promptText.trim().length < 12) {
      toast.error("Add a prompt with at least 12 characters");
      return;
    }
    try {
      const mode = firstFrameLook.generated_storage_path ? "image_to_video" : "text_to_video";
      const result = await generate.mutateAsync({
        provider: selectedProvider,
        projectId,
        promptId: null,
        shotId: null,
        promptText: promptText.trim(),
        mode,
        referenceImagePath: firstFrameLook.generated_storage_path ?? null,
        duration,
        settings: {
          motionStrength,
          cameraMove,
          firstFrameLookId,
          lastFrameLookId,
          lookIds: selectedLookIds,
        },
      });
      setActiveJobId(result.providerJobRowId);
      toast.success(`Submitted to ${selectedProvider} (${result.envelope.status})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Video generation failed");
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            1. Select looks
          </h3>
          {looks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No looks found for this artist yet.
            </p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {looks.map((look) => (
                <label
                  key={look.id}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card/30 px-3 py-2"
                >
                  <Checkbox
                    checked={selectedLookIds.includes(look.id)}
                    onCheckedChange={(checked) => toggleLookId(look.id, checked === true)}
                  />
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium">{look.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {look.status}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-5 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            2. Frame setup
          </h3>
          <div className="space-y-2">
            <Label>First frame look</Label>
            <Select
              value={firstFrameLookId ?? "_none_"}
              onValueChange={(v) => setFirstFrameLookId(v === "_none_" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a look" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">Choose a look</SelectItem>
                {looks.map((look) => (
                  <SelectItem key={look.id} value={look.id}>
                    {look.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Last frame look (optional)</Label>
            <Select
              value={lastFrameLookId ?? "_none_"}
              onValueChange={(v) => setLastFrameLookId(v === "_none_" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional transition target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">None</SelectItem>
                {looks.map((look) => (
                  <SelectItem key={look.id} value={look.id}>
                    {look.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Duration: {duration}s</Label>
            <Slider
              value={[duration]}
              onValueChange={([v]) => setDuration(v)}
              min={3}
              max={12}
              step={1}
            />
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
            <Select
              value={selectedProvider}
              onValueChange={(v) => setSelectedProvider(v as ProviderName)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {provider}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              Use at least 12 characters. First-frame look is used as image reference when available.
            </p>
          </div>
        </Card>
      </div>

      {jobQuery.data && (
        <Card className="space-y-1 p-4 text-sm">
          <p>
            <span className="text-muted-foreground">Job status:</span>{" "}
            <span className="font-medium">{jobQuery.data.status}</span>
          </p>
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
