import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  formatHeroFramePlayableExportCopy,
  heroFramePlayableExportEnabled,
  prepareHeroFramePlayableExport,
  runHeroFramePlayableExport,
} from "@/lib/reconstruct/playable/heroFrameExport";

type RunStatus = "idle" | "running" | "ok" | "error";

export function HeroFramePlayableExportControl({
  busy = false,
  onBusyChange,
}: {
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const intent = useMemo(() => prepareHeroFramePlayableExport(), []);
  const canRun = heroFramePlayableExportEnabled(intent);
  const disabled = busy || !canRun;

  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [hookJson, setHookJson] = useState<string | null>(null);

  const gateCopy = formatHeroFramePlayableExportCopy(intent);

  function handleRun() {
    if (disabled) return;
    setStatus("running");
    setError(null);
    setResultLine(null);
    setHookJson(null);
    onBusyChange?.(true);
    try {
      const { compose, summary, hookJson: json } = runHeroFramePlayableExport();
      if (!compose.ok || !json) {
        setStatus("error");
        setError(summary);
        toast.error(summary);
        return;
      }
      setStatus("ok");
      setResultLine(summary);
      setHookJson(JSON.stringify(json, null, 2));
      toast.success(summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setError(message);
      toast.error(message);
    } finally {
      onBusyChange?.(false);
    }
  }

  return (
    <div
      className="space-y-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-3"
      data-testid="hero-frame-playable-export-control"
    >
      <p className="text-xs text-violet-100">{gateCopy}</p>
      <p className="font-mono text-[11px] text-violet-100/80">
        {intent.spec.width}×{intent.spec.height} windowFrames={intent.spec.frameCount} fps=
        {intent.spec.fps} master={intent.spec.masterClipAssetId.slice(0, 8)}…
      </p>
      <p className="text-[11px] text-muted-foreground">
        $0 path: intended Stage 1h SAM-3 + in-lib full-window temporal + original-master
        reconstruct. No Grok. Full-clip MP4 is the ffmpeg artifact
        (docs/reconstruct/artifacts/playable-76fe7438/). E2 scores the hook JSON — this control does
        not own eval modules.
      </p>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={handleRun}
        data-testid="hero-frame-playable-export"
        aria-disabled={disabled}
      >
        {status === "running" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Export playable reconstruct $0
      </Button>
      {status === "ok" && resultLine ? (
        <p className="text-[11px] text-violet-50" data-testid="hero-frame-playable-export-ok">
          {resultLine}
        </p>
      ) : null}
      {status === "error" && error ? (
        <p className="text-[11px] text-red-200" data-testid="hero-frame-playable-export-error">
          {error}
        </p>
      ) : null}
      {hookJson ? (
        <pre
          className="max-h-40 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[10px] text-violet-50/90"
          data-testid="hero-frame-playable-export-json"
        >
          {hookJson}
        </pre>
      ) : null}
    </div>
  );
}
