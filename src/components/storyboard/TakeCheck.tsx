import { Loader2, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aspectCss } from "@/lib/project/aspect";
import { FRAMING_LABEL, LIP_LABEL, framingLine, lipLine, type FramingVerdict, type LipVerdict } from "@/lib/storyboard/takeCheck";
import type { BoxMediaItem } from "@/lib/storyboard/media";
import { cn } from "@/lib/utils";
import { FrameThumb } from "./FrameThumb";
import { mediaRefKey, playbackRef } from "./signedUrls";
import { useStoryboard } from "./useStoryboardController";

const LIP_STYLE: Record<LipVerdict, string> = {
  in_sync: "bg-emerald-500/15 text-emerald-300",
  off: "bg-rose-500/15 text-rose-300",
  unclear: "bg-amber-500/15 text-amber-200",
  unmeasured: "bg-white/10 text-foreground/70",
};
const FRAMING_STYLE: Record<FramingVerdict, string> = {
  kept: "bg-emerald-500/15 text-emerald-300",
  wider: "bg-rose-500/15 text-rose-300",
  unmeasured: "bg-white/10 text-foreground/70",
};

/**
 * A restaged clip held against the take it was made from: the two things a restaging is asked to keep. His face is
 * read on every frame of both files; from it, whether his mouth moves at the same moments, and whether the frame
 * shows more of his body than the take filmed. Pressed, not automatic — it fetches the face reader and reads two
 * files frame by frame. The result is kept on the clip.
 */
export function TakeCheckPanel({ item }: { item: BoxMediaItem }) {
  const sb = useStoryboard();
  const asset = item.asset;
  const from = sb.takeOf(asset);
  if (!from || item.kind !== "video") return null;
  const check = asset.takeCheck ?? null;
  const busy = sb.checkingOf(asset.id);
  const clipKey = mediaRefKey(playbackRef(asset));
  const takeKey = mediaRefKey(playbackRef(from.take));
  const clipUrl = sb.urlFor(asset);
  const takeUrl = sb.urlFor(from.take);
  const frames: { key: string; url: string | undefined; t: number; label: string }[] = check
    ? [
        { key: takeKey, url: takeUrl, t: Math.round((from.window[0] + 0.05) * 1000) / 1000, label: "the take" },
        { key: clipKey, url: clipUrl, t: Math.max(0.05, check.faceFrom ?? 0.05), label: "this clip opens" },
        ...(check.framing.widestAt != null && Math.abs(check.framing.widestAt - (check.faceFrom ?? 0)) > 0.4 ? [{ key: clipKey, url: clipUrl, t: check.framing.widestAt, label: "its widest" }] : []),
      ]
    : [];

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-white/[0.02] p-2.5" data-testid="take-check" data-asset-id={asset.id} data-lip={check?.lip.verdict ?? ""} data-framing={check?.framing.verdict ?? ""} data-state={busy ? "checking" : check ? "checked" : "unchecked"}>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/55">Held against the take</p>
        {busy ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-foreground/50" data-testid="take-check-stage">
            <Loader2 className="h-3 w-3 animate-spin" /> {busy}
          </span>
        ) : (
          <Button size="sm" variant="ghost" className="ml-auto h-6 px-1.5 text-[10px] text-foreground/50" onClick={() => void sb.checkAgainstTake(asset)} data-testid="take-check-run">
            <ScanFace className="mr-1 h-3 w-3" /> {check ? "Check again" : "Check lips and framing"}
          </Button>
        )}
      </div>

      {!check && !busy && <p className="text-[11px] leading-snug text-foreground/50">Not checked yet. A clip made from a take is asked to keep his mouth on the take's moments and to show no more of him than the take filmed; this measures both.</p>}

      {check && (
        <>
          <p className="text-[11px] leading-snug text-foreground/80" data-testid="take-check-lip" data-verdict={check.lip.verdict} data-lag={check.lip.worstLag ?? ""} data-corr={check.lip.best?.corr ?? ""} data-retime={check.lip.best?.retime ?? ""} data-offset={check.lip.best?.offset ?? ""} data-on-clock={check.lip.onClock ?? ""} data-compared={check.lip.compared}>
            <span className={cn("mr-1.5 rounded-full px-1.5 py-px text-[10px] font-medium", LIP_STYLE[check.lip.verdict])}>{LIP_LABEL[check.lip.verdict]}</span>
            {lipLine(check)}
          </p>
          <p className="text-[11px] leading-snug text-foreground/80" data-testid="take-check-framing" data-verdict={check.framing.verdict} data-ratio={check.framing.ratio ?? ""} data-take-reach={check.framing.takeReach ?? ""} data-widest-reach={check.framing.widestReach ?? ""} data-opening-reach={check.framing.openingReach ?? ""} data-widest-at={check.framing.widestAt ?? ""}>
            <span className={cn("mr-1.5 rounded-full px-1.5 py-px text-[10px] font-medium", FRAMING_STYLE[check.framing.verdict])}>{FRAMING_LABEL[check.framing.verdict]}</span>
            {framingLine(check)}
          </p>
          <div className="flex gap-1 overflow-x-auto">
            {frames.map((f) => (
              <div key={`${f.label}:${f.t}`} className="relative h-40 shrink-0 overflow-hidden rounded bg-black" style={{ aspectRatio: aspectCss(sb.aspect) }}>
                <FrameThumb fileKey={f.key} url={f.url} seconds={f.t} className="absolute inset-0" testId="take-check-frame" maxWidth={320} />
                <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/65 px-1 font-mono text-[9px] text-white/85">{f.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] leading-snug text-foreground/45" data-testid="take-check-note">
            His face was read on {check.faceFrames} of {check.frames} frames of the clip and {check.takeFaceFrames} of {check.takeFrames} of the take. Lip sync here is WHEN his mouth moves, not its shape, and says nothing about a stretch where his face is not seen. In sync = within two frames. The lip reading is a pointer, not a verdict: its threshold comes from made series and has not been held against real footage whose answer is known, so it does not settle lip sync — watching the clip with the song does.
          </p>
        </>
      )}
    </div>
  );
}
