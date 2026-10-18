import { useEffect, useRef } from "react";
import {
  durationSeconds,
  type EditSequence,
} from "../../../supabase/functions/edit-render/model";
import { clipAtTime, formatTimecode, sourceTimeAt, songTimeAt } from "@/lib/editor/playback";
import { needsSeek, seekMediaExact, snapToFrame } from "@/lib/editor/mediaSeek";
import { cn } from "@/lib/utils";

type Props = {
  sequence: EditSequence;
  playhead: number;
  playing: boolean;
  playbackRate: number;
  mediaByAsset: Record<string, string>;
  songUrl: string | null;
  compareUrl?: string | null;
  /** Source time on the compare video (original take clock — not song time). */
  compareSourceTime?: number | null;
  compareLabel?: string | null;
  compareNote?: string | null;
  className?: string;
};

async function syncElement(
  el: HTMLMediaElement | null,
  url: string | null,
  targetTime: number,
  playing: boolean,
  playbackRate: number,
  fps: number,
) {
  if (!el || !url) return;
  if (el.dataset.src !== url) {
    el.dataset.src = url;
    el.src = url;
    // Wait briefly for metadata so the first paused seek lands.
    await new Promise<void>((resolve) => {
      if (el.readyState >= 1) {
        resolve();
        return;
      }
      const done = () => {
        el.removeEventListener("loadedmetadata", done);
        resolve();
      };
      el.addEventListener("loadedmetadata", done);
      setTimeout(done, 1500);
    });
  }

  const target = snapToFrame(Math.max(0, targetTime), fps);
  if (
    needsSeek({
      currentTime: el.currentTime,
      targetTime: target,
      playing,
      fps,
    })
  ) {
    if (!playing) {
      el.pause();
      await seekMediaExact(el, target);
    } else {
      try {
        el.currentTime = target;
      } catch {
        /* ignore mid-play seek races */
      }
    }
  }

  el.playbackRate = playbackRate;
  if (playing) void el.play().catch(() => undefined);
  else el.pause();
}

/**
 * Large monitor: active clip + locked song. Timing uses the same edit model as export
 * (source in/out, timeline placement, song offset applied once).
 * Paused seeks are frame-accurate; playback drift correction stays separate.
 */
export function SequencePreview({
  sequence,
  playhead,
  playing,
  playbackRate,
  mediaByAsset,
  songUrl,
  compareUrl,
  compareSourceTime,
  compareLabel,
  compareNote,
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
  const fps = sequence.fps;

  useEffect(() => {
    void syncElement(videoRef.current, url, srcTime, playing, playbackRate, fps);
  }, [url, srcTime, playing, playbackRate, fps, playhead]);

  useEffect(() => {
    void syncElement(audioRef.current, songUrl, songTime, playing, playbackRate, fps);
  }, [songUrl, songTime, playing, playbackRate, fps]);

  useEffect(() => {
    if (!compareUrl) return;
    const t = compareSourceTime ?? null;
    if (t == null) return;
    void syncElement(compareRef.current, compareUrl, t, playing, playbackRate, fps);
  }, [compareUrl, compareSourceTime, playing, playbackRate, fps, playhead]);

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="sequence-preview">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-black ring-1 ring-primary/20",
          compareUrl || compareNote ? "grid grid-cols-2 gap-px" : "",
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
        {(compareUrl || compareNote) && (
          <div className="relative mx-auto flex aspect-[9/16] max-h-[min(68vh,760px)] w-full max-w-[420px] items-center justify-center bg-black sm:max-w-none">
            {compareUrl && compareSourceTime != null ? (
              <video
                ref={compareRef}
                className="h-full w-full object-contain"
                playsInline
                muted
                preload="auto"
                data-testid="compare-video"
              />
            ) : (
              <p
                className="px-4 text-center text-xs text-muted-foreground"
                data-testid="compare-unavailable"
              >
                {compareNote || "Original comparison unavailable."}
              </p>
            )}
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
