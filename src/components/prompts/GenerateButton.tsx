import { useState } from "react";
import { Play, Loader2, RefreshCw, CheckCircle2, AlertCircle, CloudDownload } from "lucide-react";
import { toast } from "sonner";
import type { ProviderName } from "@/integrations/supabase/types";
import type { CompiledPrompt, FormattedPrompt } from "@/lib/prompts/types";
import {
  useGenerateClip,
  useProviderJob,
  useJobPoller,
  useIngestOnSuccess,
} from "@/lib/providerJobs/queries";
import { Button } from "@/components/ui/button";

/**
 * Per-provider Generate button.
 *
 * - First click: creates a provider_jobs row, calls Control Center.
 * - While running: shows a spinner with the live status (queued/running).
 * - On success: shows a checkmark + link to the new clip in Assets.
 * - On failure: shows the error + a Retry button.
 *
 * Ingest is driven by a separate hook (`useIngestOnSuccess`) that watches the
 * row and fires the server-side `ingest-provider-job` edge function. So even
 * if the user refreshes after the row hits succeeded, the asset still lands.
 *
 * Only providers with apiReady=true (or that have a CC proxy endpoint)
 * accept clicks. Manual-only providers (and providers we don't yet have
 * a CC endpoint for) show a disabled button with a tooltip.
 */
export function GenerateButton({
  compiled,
  formatted,
  provider,
  providerDisplay,
  apiReady,
}: {
  compiled: CompiledPrompt | null;
  formatted: FormattedPrompt | null;
  provider: ProviderName;
  providerDisplay: string;
  apiReady: boolean;
}) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const generate = useGenerateClip();
  const jobQuery = useProviderJob(activeJobId ?? undefined);
  useJobPoller(activeJobId ?? undefined, jobQuery.data);
  const { ingesting, error: ingestError } = useIngestOnSuccess(
    activeJobId ?? undefined,
    jobQuery.data,
  );

  const SUPPORTED: ProviderName[] = ["runway", "veo", "gemini", "pika", "fal", "grok", "higgsfield"];
  const supported = SUPPORTED.includes(provider);

  async function handleGenerate() {
    if (!compiled || !formatted) {
      toast.error("Compile a prompt first");
      return;
    }
    try {
      const { providerJobRowId, envelope } = await generate.mutateAsync({
        provider,
        projectId: compiled.context.projectId,
        promptId: null, // PromptBuilder owner can pass via context if saved
        shotId: compiled.context.shotId ?? null,
        promptText: formatted.promptText,
        mode: compiled.referenceImagePath ? "image_to_video" : "text_to_video",
        referenceImagePath: compiled.referenceImagePath,
        modelVariant: typeof formatted.settings.modelVariant === "string"
          ? (formatted.settings.modelVariant as string)
          : undefined,
        duration: typeof formatted.settings.duration === "number"
          ? (formatted.settings.duration as number)
          : undefined,
        aspectRatio: typeof formatted.settings.aspectRatio === "string"
          ? (formatted.settings.aspectRatio as string)
          : undefined,
      });
      setActiveJobId(providerJobRowId);
      toast.success(`${providerDisplay}: job ${envelope.status}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`${providerDisplay}: ${msg}`);
    }
  }

  const job = jobQuery.data;
  const status = job?.status;
  const hasAsset = !!job?.result_asset_id;
  const isRunning = generate.isPending || status === "queued" || status === "running";
  // "succeeded" without an asset yet means the ingest hook is fetching the
  // bytes server-side — surface that as its own state so users don't think
  // Done means saved.
  const isIngesting = ingesting || (status === "succeeded" && !hasAsset);
  const isDone = status === "succeeded" && hasAsset;
  const isFailed = status === "failed";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={isDone ? "secondary" : "default"}
        onClick={handleGenerate}
        disabled={!supported || !compiled || isRunning || isIngesting}
        className="h-7 text-xs"
        title={!supported ? `${providerDisplay} doesn't have a Control Center proxy endpoint yet — Copy Prompt and run manually.` : undefined}
      >
        {isRunning ? (
          <>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            {status === "queued" ? "Queued" : status === "running" ? "Generating" : "Sending"}
          </>
        ) : isIngesting ? (
          <>
            <CloudDownload className="mr-1 h-3 w-3 animate-pulse" />
            Saving clip
          </>
        ) : isDone ? (
          <>
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Done
          </>
        ) : isFailed ? (
          <>
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry
          </>
        ) : (
          <>
            <Play className="mr-1 h-3 w-3" />
            Generate
          </>
        )}
      </Button>
      {isFailed && job?.error_text && (
        <span className="flex items-center gap-1 text-xs text-amber-300" title={job.error_text}>
          <AlertCircle className="h-3 w-3" />
          {truncate(job.error_text, 60)}
        </span>
      )}
      {ingestError && !isDone && (
        <span className="flex items-center gap-1 text-xs text-rose-300" title={ingestError}>
          <AlertCircle className="h-3 w-3" />
          Ingest failed — retry
        </span>
      )}
      {!apiReady && supported && !isRunning && !isDone && !isFailed && !isIngesting && (
        <span className="text-[10px] text-muted-foreground" title="The Control Center proxy will fail-clean if the upstream key is missing.">
          (proxy active)
        </span>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
