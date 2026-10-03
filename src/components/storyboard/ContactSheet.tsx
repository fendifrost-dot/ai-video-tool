import { useMemo, useState } from "react";
import { Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTimecode } from "@/components/treatment/shotLabels";
import { aspectCss, type ProjectAspect } from "@/lib/project/aspect";
import { videoStateAt, type MediaAsset, type TimelineSegment } from "@/lib/storyboard/media";
import { cn } from "@/lib/utils";
import { ROLE_STYLE, mediaLabel } from "./BoxMediaView";
import { FrameThumb } from "./FrameThumb";
import { mediaRefKey, playbackRef, useSignedRefs, type MediaRef } from "./signedUrls";

/** Where in a shot its frame is taken: far enough in to be past a cut's first frames, the same place in every shot. */
export const SHEET_AT = 0.4;

/** Where a shot's frames are taken when a section is looked at closely: its opening, its middle, its close. */
export const SHEET_AT_CLOSE = [0.08, 0.5, 0.92] as const;

/** The moment of the song a shot's frame is taken at, and where that is in its file. */
export function sheetFrame(seg: TimelineSegment, fileSeconds: number | null = null, fraction: number = SHEET_AT): { songTime: number; at: number | null } {
  const songTime = seg.start + (seg.end - seg.start) * fraction;
  const state = seg.media.kind === "video" ? videoStateAt(seg, songTime, fileSeconds) : null;
  return { songTime, at: state ? state.at : null };
}

/**
 * The cut at a glance: one frame from every shot, in song order, read straight from each shot's own file at the
 * moment the cut would be showing it. Nothing is played. It answers "what is actually in this cut" in one look, and
 * it is how a cut can be looked at from a window that is not on screen.
 */
export function ContactSheet({
  timeline,
  assets,
  aspect,
  from,
  to,
  close = false,
}: {
  timeline: readonly TimelineSegment[];
  assets: ReadonlyMap<string, MediaAsset>;
  aspect: ProjectAspect;
  /** Song seconds: only the shots that overlap [from, to] (the whole cut when not given). */
  from?: number | null;
  to?: number | null;
  /** true = three frames a shot (opening, middle, close) instead of one: for a section looked at closely. */
  close?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shots = useMemo(() => timeline.filter((s) => (from == null || s.end > from) && (to == null || s.start < to)), [timeline, from, to]);
  const refs = useMemo(() => {
    if (!open) return [];
    const out: MediaRef[] = [];
    for (const s of shots) {
      if (s.media.kind === "none") continue;
      const a = assets.get(s.media.assetId);
      if (a) out.push(playbackRef(a));
    }
    return out;
  }, [open, shots, assets]);
  const urls = useSignedRefs(refs);

  return (
    <Card className="space-y-3 p-4" data-testid="contact-sheet-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">The cut at a glance</h2>
          <p className="mt-1 text-xs text-foreground/55">
            {close ? "Three frames from every shot of the section — its opening, middle and close" : "One frame from every shot"}, read from the shot's own file at the moment the cut shows it. Nothing is played.
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 text-[11px]" onClick={() => setOpen((v) => !v)} disabled={shots.length === 0} data-testid="contact-sheet-toggle">
          <Images className="mr-1.5 h-3.5 w-3.5" />
          {open ? "Hide the frames" : "Show the frames"}
        </Button>
      </div>
      {open && (
        <div className={cn("grid gap-2", close ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-3 sm:grid-cols-5 lg:grid-cols-8")} data-testid="contact-sheet" data-close={close ? "true" : "false"}>
          {shots.map((s) => {
            const asset = s.media.kind === "none" ? null : (assets.get(s.media.assetId) ?? null);
            const ref = asset ? playbackRef(asset) : null;
            const url = ref ? urls[mediaRefKey(ref)] : undefined;
            const fractions: readonly number[] = close && s.media.kind === "video" ? SHEET_AT_CLOSE : [SHEET_AT];
            return (
              <figure key={s.shotId} className="space-y-1" data-testid="contact-sheet-shot" data-box-key={s.key} data-media-kind={s.media.kind}>
                <div className={cn("grid gap-1", fractions.length > 1 ? "grid-cols-3" : "grid-cols-1")}>
                  {fractions.map((fraction, i) => {
                    const { at } = sheetFrame(s, asset?.durationSeconds ?? null, fraction);
                    return (
                      <div key={fraction} className="relative overflow-hidden rounded bg-black" style={{ aspectRatio: aspectCss(aspect) }}>
                        {s.media.kind === "video" && ref && at != null && <FrameThumb fileKey={mediaRefKey(ref)} url={url} seconds={at} className="absolute inset-0" testId="contact-sheet-frame" maxWidth={close ? 360 : 240} />}
                        {s.media.kind === "image" && url && <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain" data-testid="contact-sheet-image" />}
                        {s.media.kind === "none" && <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-[9px] text-white/40">no footage</span>}
                        {i === 0 && <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/65 px-1 font-mono text-[10px] font-semibold text-white/90">{String(s.index).padStart(2, "0")}</span>}
                      </div>
                    );
                  })}
                </div>
                <figcaption className="space-y-0.5">
                  <span className="block font-mono text-[9px] text-foreground/50">
                    {formatTimecode(s.start)}–{formatTimecode(s.end)}
                  </span>
                  {s.media.kind !== "none" && <span className={cn("inline-block rounded-full px-1.5 py-px text-[9px] font-medium", ROLE_STYLE[s.media.role])}>{mediaLabel({ role: s.media.role, base: s.media.base, asset: asset ?? undefined })}</span>}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </Card>
  );
}
