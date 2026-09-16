import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildHeroFrameTemporalRunRequest } from "@/lib/heroFrame/temporalRunControl";
import { callTemporalPropagate } from "@/lib/queries/temporalPropagate";
import {
  formatHeroFrameReconstructGateCopy,
  formatReconstructE2eError,
  heroFrameReconstructRunEnabledFromDispatch,
  prepareHeroFrameReconstructDispatch,
  reconstructE2eResultJson,
  runHeroFrameReconstructFromTemporalJson,
  summarizeReconstructE2eResult,
} from "@/lib/reconstruct/heroFrameRun";

type RunStatus = "idle" | "running" | "ok" | "error";

export function HeroFrameReconstructRunControl({
  busy = false,
  onBusyChange,
}: {
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const dispatch = useMemo(() => prepareHeroFrameReconstructDispatch(), []);
  const canRun = heroFrameReconstructRunEnabledFromDispatch(dispatch);
  const disabled = busy || !canRun;

  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [reportJson, setReportJson] = useState<string | null>(null);

  const gateCopy = formatHeroFrameReconstructGateCopy(dispatch);

  async function handleRun() {
    if (disabled) return;
    setStatus("running");
    setError(null);
    setResultLine(null);
    setReportJson(null);
    onBusyChange?.(true);
    try {
      if (!heroFrameReconstructRunEnabledFromDispatch(dispatch)) {
        throw new Error("reconstruct_run_not_enabled");
      }
      const temporalRequest = buildHeroFrameTemporalRunRequest();
      const temporalJson = await callTemporalPropagate({
        clip: temporalRequest.body.clip,
        approved: temporalRequest.body.approved,
        sleeveGate: temporalRequest.body.sleeveGate,
      });
      const { report } = runHeroFrameReconstructFromTemporalJson(temporalJson);
      const summary = summarizeReconstructE2eResult(report);
      const json = reconstructE2eResultJson(report);
      setReportJson(JSON.stringify(json));
      if (report.verdict !== "PASS") {
        setStatus("error");
        setError(summary);
        toast.error(summary);
        return;
      }
      setStatus("ok");
      setResultLine(summary);
      toast.success(summary);
    } catch (err) {
      const message = formatReconstructE2eError(err);
      setStatus("error");
      setError(message);
      toast.error(message);
    } finally {
      onBusyChange?.(false);
    }
  }

  return (
    <div
      className="space-y-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-3"
      data-testid="hero-frame-reconstruct-run-control"
    >
      <p className="text-xs text-sky-100">{gateCopy}</p>
      <p className="font-mono text-[11px] text-sky-100/80">
        temporalTrackingEnabled={String(dispatch.temporalTrackingEnabled)} reconstructArmed=
        {String(dispatch.reconstructArmed)} explicitArm={String(dispatch.explicitArm)} canDispatch=
        {String(dispatch.canDispatch)}
      </p>
      <p className="text-[11px] text-muted-foreground">
        $0 path: live temporal-propagate-proxy (paidCalls=false) → in-lib reconstruct onto original
        master {dispatch.lineage.masterClipAssetId.slice(0, 8)}… No Grok. Do not click chest/sleeve
        paint.
      </p>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={handleRun}
        data-testid="hero-frame-reconstruct-run"
        aria-disabled={disabled}
      >
        {status === "running" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Run reconstruct E2E $0
      </Button>
      {!canRun ? (
        <p className="text-[11px] text-amber-100/90">
          Button disabled until canDispatch, reconstructArmed, and temporalTrackingEnabled are all
          true.
        </p>
      ) : null}
      {status === "ok" && resultLine ? (
        <p className="text-[11px] text-sky-50" data-testid="hero-frame-reconstruct-run-ok">
          {resultLine}
        </p>
      ) : null}
      {status === "error" && error ? (
        <p className="text-[11px] text-red-200" data-testid="hero-frame-reconstruct-run-error">
          {error}
        </p>
      ) : null}
      {reportJson ? (
        <pre
          className="max-h-40 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[10px] text-sky-50/90"
          data-testid="hero-frame-reconstruct-run-json"
        >
          {reportJson}
        </pre>
      ) : null}
    </div>
  );
}
