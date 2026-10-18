import { useEffect, useRef } from "react";
import {
  durationSeconds,
  type EditSequence,
} from "../../../supabase/functions/edit-render/model";
import { clipAtTime, formatTimecode, sourceTimeAt, songTimeAt } from "@/lib/editor/playback";
import { cn } from "@/lib/utils";

type Props = {
  sequence: EditSequence;
  playhead: number;
  playing: boolean;
  playbackRate: number;
  mediaByAsset: Record<string, string>;
  songUrl: string | null;
  compareUrl?: string | null;
  compareLabel?: string | null;
  className?: string;
};

/**
 * Large monitor: active clip + locked song. Timing uses the same edit model as export
 * (source in/out, timeline placement, song offset applied once).
 */
export function SequencePreview({
  sequence,
  playhead,
  playing,
  playbackRate,
  mediaByAsset,
  songUrl,
  compareUrl,
  compareLabel,
  className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const compareRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const clip = clipAtTime(sequence, playhead);
  const url = clip?.assetId ? mediaByAsset[clip.assetId] ?? null : null;
  const srcTime = clip ? sourceTimeAt(clip, playhead) : 0;
  const songTime = songTimeAt(sequence, playhead);
  const dur = durationSeconds(sequence);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    if (v.dataset.src !== url) {
      v.dataset.src = url;
      v.src = url;
    }
    if (Math.abs(v.currentTime - srcTime) > 0.08) {
      try {
        v.currentTime = Math.max(0, srcTime);
      } catch {
        /* seek before metadata */
      }
    }
    v.playbackRate = playbackRate;
    if (playing) void v.play().catch(() => undefined);
    else v.pause();
  }, [url, srcTime, playing, playbackRate, playhead]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !songUrl) return;
    if (a.dataset.src !== songUrl) {
      a.dataset.src = songUrl;
      a.src = songUrl;
    }
    if (Math.abs(a.currentTime - songTime) > 0.08) {
      try {
        a.currentTime = Math.max(0, songTime);
      } catch {
        /* seek before metadata */
      }
    }
    a.playbackRate = playbackRate;
    if (playing) void a.play().catch(() => undefined);
    else a.pause();
  }, [songUrl, songTime, playing, playbackRate]);

  useEffect(() => {
    const c = compareRef.current;
    if (!c || !compareUrl) return;
    if (c.dataset.src !== compareUrl) {
      c.dataset.src = compareUrl;
      c.src = compareUrl;
    }
    if (Math.abs(c.currentTime - songTime) > 0.12) {
      try {
        c.currentTime = Math.max(0, songTime);
      } catch {
        /* ignore */
      }
    }
    c.playbackRate = playbackRate;
    if (playing) void c.play().catch(() => undefined);
    else c.pause();
  }, [compareUrl, songTime, playing, playbackRate]);

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="sequence-preview">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-black ring-1 ring-primary/20",
          compareUrl ? "grid grid-cols-2 gap-px" : "",
        )}
      >
        <div className="relative mx-auto aspect-[9/16] max-h-[min(68vh,760px)] w-full max-w-[420px] bg-black sm:max-w-none">
          {url ? (
            <video
              ref={videoRef}
              className="h-full w-full object-contain"
              playsInline
              muted
              preload="auto"
              data-testid="preview-video"
            />
          ) : (
            <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {clip?.placeholder
                ? "No take on this cut yet — pick a version from the right"
                : clip
                  ? "Loading picture…"
                  : "Move the playhead onto a clip"}
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-10">
            <p className="font-display text-base font-medium text-white">
              {clip?.shotKey || clip?.name || "—"}
            </p>
            <p className="text-[11px] text-white/70">
              {formatTimecode(playhead, sequence.fps)} / {formatTimecode(dur, sequence.fps)}
              {sequence.songName ? ` · ${sequence.songName}` : ""}
              {songUrl ? " · song locked" : ""}
            </p>
          </div>
        </div>
        {compareUrl && (
          <div className="relative mx-auto aspect-[9/16] max-h-[min(68vh,760px)] w-full max-w-[420px] bg-black sm:max-w-none">
            <video
              ref={compareRef}
              className="h-full w-full object-contain"
              playsInline
              muted
              preload="auto"
              data-testid="compare-video"
            />
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-white">
              {compareLabel || "Original performance"}
            </div>
          </div>
        )}
      </div>
      {songUrl && <audio ref={audioRef} preload="auto" data-testid="preview-song" />}
    </div>
  );
}
