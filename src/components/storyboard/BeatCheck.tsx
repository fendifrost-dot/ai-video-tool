import { useEffect, useRef } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aspectCss } from "@/lib/project/aspect";
import { beatLine, checkAnswers, VERDICT_LABEL, type BeatVerdict, type ChangePoint, type MeasuredBeat } from "@/lib/storyboard/beatCheck";
import type { BoxMediaItem } from "@/lib/storyboard/media";
import { cn } from "@/lib/utils";
import { FrameThumb } from "./FrameThumb";
import { mediaRefKey, playbackRef } from "./signedUrls";
import { useStoryboard } from "./useStoryboardController";

const VERDICT_STYLE: Record<BeatVerdict, string> = {
  on_time: "bg-emerald-500/15 text-emerald-300",
  displaced: "bg-amber-500/15 text-amber-200",
  not_seen: "bg-rose-500/15 text-rose-300",
};

const clip = (n: number, max: number) => Math.round(Math.max(0, Math.min(n, Math.max(0, max - 0.05))) * 1000) / 1000;

/** The moments of a clip worth looking at for one beat: just before it was asked, at it, where the change began, and after. */
export function framesForBeat(b: MeasuredBeat, clipSeconds: number): { t: number; label: string }[] {
  const out: { t: number; label: string }[] = [
    { t: clip(b.offset - 0.3, clipSeconds), label: "before" },
    { t: clip(b.offset + 0.05, clipSeconds), label: "asked" },
  ];
  if (b.change && Math.abs(b.change.begins - b.offset) > 0.12) out.push({ t: clip(b.change.begins + 0.05, clipSeconds), label: "changes" });
  out.push({ t: clip(Math.max(b.offset, b.change?.arrived ?? b.offset) + 0.4, clipSeconds), label: "after" });
  return out.sort((x, y) => x.t - y.t);
}

/**
 * A generated clip held against what it was asked for. A clip asked for with a script of timed changes is measured
 * the first time it is seen here — every frame is read, and where the picture goes from one state to another is
 * compared with where the script said it should — and the numbers are kept on the clip. The frames beside each
 * number are for the eye: arithmetic says THAT the picture changed and when, not whether it is the change asked for.
 */
export function BeatCheckPanel({ item }: { item: BoxMediaItem }) {
  const sb = useStoryboard();
  const asset = item.asset;
  const request = sb.requestOf(asset);
  const url = sb.urlFor(asset);
  const check = asset.beatCheck ?? null;
  const busy = sb.measuringOf(asset.id);
  const answers = !!request && checkAnswers(check, request.asked);
  const tried = useRef<string | null>(null);

  // measured once, when the clip is first seen with nothing measured for the script it was made from
  useEffect(() => {
    if (!request || !url || busy || answers || tried.current === asset.id) return;
    tried.current = asset.id;
    void sb.measureClip(asset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, url, answers, !!request]);

  if (!request || item.kind !== "video") return null;
  const timed = request.asked.filter((b) => b.offset > 0.05);
  const fileKey = mediaRefKey(playbackRef(asset));
  const shown = answers ? check : null;
  // nothing asked and nothing found: there is nothing to say about this clip
  if (timed.length === 0 && (!shown || shown.unasked.length === 0) && !busy) return null;

  const unaskedLine = (c: ChangePoint) => `the ${c.kind === "light" ? "light" : "picture"} changes at ${c.begins.toFixed(2)} s — nothing in the request asked for a change there`;

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-white/[0.02] p-2.5" data-testid="beat-check" data-asset-id={asset.id} data-verdict={shown?.verdict ?? (busy ? "measuring" : "unmeasured")} data-mode={request.mode}>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">
          {timed.length > 0 ? (request.mode === "timed_script" ? "Asked with timed changes — measured" : "Asked with its beats in order — measured") : "Measured"}
        </p>
        {busy && (
          <span className="inline-flex items-center gap-1 text-[10px] text-foreground/50">
            <Loader2 className="h-3 w-3 animate-spin" /> reading every frame…
          </span>
        )}
        {!busy && (
          <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[10px] text-foreground/50" onClick={() => void sb.measureClip(asset)} data-testid="beat-check-again">
            <RefreshCw className="mr-1 h-3 w-3" /> Measure again
          </Button>
        )}
      </div>

      {shown &&
        shown.beats.map((b) => (
          <div key={b.id} className="space-y-1.5" data-testid="beat-check-beat" data-event-id={b.id} data-asked={b.offset} data-begins={b.change?.begins ?? ""} data-arrived={b.change?.arrived ?? ""} data-error={b.error ?? ""} data-verdict={b.verdict} data-kind={b.change?.kind ?? ""}>
            <p className="text-[11px] leading-snug text-foreground/80">
              <span className={cn("mr-1.5 rounded-full px-1.5 py-px text-[10px] font-medium", VERDICT_STYLE[b.verdict])}>{VERDICT_LABEL[b.verdict]}</span>
              <span className="italic text-foreground/60">“{b.says}”</span> — {beatLine(b)}
            </p>
            <div className="flex gap-1 overflow-x-auto">
              {framesForBeat(b, shown.clipSeconds).map((f) => (
                <div key={`${f.label}:${f.t}`} className="relative h-40 shrink-0 overflow-hidden rounded bg-black" style={{ aspectRatio: aspectCss(sb.aspect) }}>
                  <FrameThumb fileKey={fileKey} url={url} seconds={f.t} className="absolute inset-0" testId="beat-check-frame" maxWidth={320} />
                  <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/65 px-1 font-mono text-[9px] text-white/85">
                    {f.label} · {f.t.toFixed(2)} s
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

      {shown?.unasked.map((c) => (
        <p key={c.begins} className="text-[11px] leading-snug text-amber-200/90" data-testid="beat-check-unasked" data-begins={c.begins}>
          {unaskedLine(c)}
        </p>
      ))}

      {shown && timed.length > 0 && (
        <p className="text-[10px] leading-snug text-foreground/45" data-testid="beat-check-note">
          {shown.frames} frames at {shown.fps.toFixed(0)} per second were read. On time = the change begins within a quarter of a second of where it was asked. The numbers say that the picture changed and when; whether it is the change that was asked
          for is what the frames are for.
        </p>
      )}
      {!shown && !busy && timed.length > 0 && <p className="text-[11px] text-foreground/50">Not measured yet.</p>}
    </div>
  );
}
