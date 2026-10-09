import { useMemo } from "react";
import { spreadTimes } from "@/lib/media/frames";
import { aspectCss, type ProjectAspect } from "@/lib/project/aspect";
import type { BoxMediaItem } from "@/lib/storyboard/media";
import { FrameThumb } from "./FrameThumb";
import { mediaRefKey, playbackRef } from "./signedUrls";

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/**
 * What a piece of footage shows across the part of it this shot plays: a few frames, first to last, read straight
 * from the file. A clip can be judged at a glance — and two versions compared — without playing either.
 */
export function FrameStrip({ item, url, aspect, count = 5 }: { item: BoxMediaItem; url: string | undefined; aspect: ProjectAspect; count?: number }) {
  const fileKey = mediaRefKey(playbackRef(item.asset));
  const start = item.sourceIn ?? 0;
  const end = item.sourceOut ?? (item.asset.durationSeconds != null ? item.asset.durationSeconds : start + 4);
  const times = useMemo(() => spreadTimes(start, Math.max(start, end), count), [start, end, count]);
  return (
    <div className="flex gap-1 overflow-x-auto" data-testid="focus-media-frames" data-asset-id={item.asset.id}>
      {times.map((t) => (
        <div key={t} className="relative h-28 shrink-0 overflow-hidden rounded bg-black" style={{ aspectRatio: aspectCss(aspect) }}>
          <FrameThumb fileKey={fileKey} url={url} seconds={t} className="absolute inset-0" testId="focus-media-frame" maxWidth={240} />
          <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 font-mono text-[9px] text-white/80">{clock(t)}</span>
        </div>
      ))}
    </div>
  );
}
