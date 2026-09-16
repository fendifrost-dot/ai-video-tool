import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { prepareHeroFrameTemporalDispatch } from "@/lib/heroFrame/temporalDispatch";
import {
  buildHeroFrameTemporalRunRequest,
  formatHeroFrameTemporalGateCopy,
  formatTemporalPropagateError,
  heroFrameTemporalRunEnabledFromDispatch,
  sanitizeHeroFrameHardStopCopy,
  summarizeTemporalPropagateResult,
} from "@/lib/heroFrame/temporalRunControl";
import { callTemporalPropagate } from "@/lib/queries/temporalPropagate";

type RunStatus = "idle" | "running" | "ok" | "error";

export function HeroFrameTemporalRunControl({
  busy = false,
  onBusyChange,
  stillRepairHardStop = null,
}: {
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  stillRepairHardStop?: string | null;
}) {
  const dispatch = useMemo(() => prepareHeroFrameTemporalDispatch(), []);
  const canRun = heroFrameTemporalRunEnabledFromDispatch(dispatch);
  const disabled = busy || !canRun;

  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultLine, setResultLine] = useState<string | null>(null);

  const gateCopy = formatHeroFrameTemporalGateCopy(dispatch);
  const paintNote = sanitizeHeroFrameHardStopCopy(
    stillRepairHardStop,
    dispatch.temporalTrackingEnabled,
  );

  async function handleRun() {
    if (disabled) return;
    setStatus("running");
    setError(null);
    setResultLine(null);
    onBusyChange?.(true);
    try {
      const request = buildHeroFrameTemporalRunRequest();
      if (!heroFrameTemporalRunEnabledFromDispatch(request.dispatch)) {
        throw new Error("temporal_run_not_enabled");
      }
      const json = await callTemporalPropagate({
        clip: request.body.clip,
        approved: request.body.approved,
        sleeveGate: request.body.sleeveGate,
      });
      const summary = summarizeTemporalPropagateResult(json);
      setStatus("ok");
      setResultLine(summary);
      toast.success(summary);
    } catch (err) {
      const message = formatTemporalPropagateError(err);
      setStatus("error");
      setError(message);
      toast.error(message);
    } finally {
      onBusyChange?.(false);
    }
  }

  return (
    <div
      className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3"
      data-testid="hero-frame-temporal-run-control"
    >
      <p className="text-xs text-emerald-100">{gateCopy}</p>
      <p className="font-mono text-[11px] text-emerald-100/80">
        temporalTrackingEnabled={String(dispatch.temporalTrackingEnabled)} armed=
        {String(dispatch.armed)} explicitArm={String(dispatch.explicitArm)} canDispatch=
        {String(dispatch.canDispatch)}
      </p>
      {paintNote ? <p className="text-[11px] text-muted-foreground">{paintNote}</p> : null}
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={handleRun}
        data-testid="hero-frame-temporal-run"
        aria-disabled={disabled}
      >
        {status === "running" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Run temporal propagate
      </Button>
      {!canRun ? (
        <p className="text-[11px] text-amber-100/90">
          Button disabled until canDispatch, armed, and temporalTrackingEnabled are all true.
        </p>
      ) : null}
      {status === "ok" && resultLine ? (
        <p className="text-[11px] text-emerald-50" data-testid="hero-frame-temporal-run-ok">
          {resultLine}
        </p>
      ) : null}
      {status === "error" && error ? (
        <p className="text-[11px] text-red-200" data-testid="hero-frame-temporal-run-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
