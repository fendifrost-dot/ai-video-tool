import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/** Start a media element without letting a refused or unsupported play() surface as an error. */
export function safePlay(el: HTMLMediaElement): void {
  try {
    const p = el.play() as Promise<void> | undefined;
    if (p && typeof p.catch === "function") p.catch(() => undefined);
  } catch {
    // the browser refused (no user gesture yet); the play button is there
  }
}

/**
 * Plays ONE RANGE of a video — the part of a take (or a clip) that belongs to a storyboard box. The file is never
 * cut for this: the element seeks to the in-point, plays to the out-point and loops there.
 *
 * `lazy` (the board): nothing is loaded until the box is on screen, and nothing plays until it is tapped — forty
 * boxes can point at the same three-minute take without forty downloads.
 * Without `lazy` (the full-screen view): it loads and plays at once, with a scrub bar over the range.
 */
export function RangeVideo({
  src,
  start,
  end,
  lazy = false,
  autoPlay = false,
  showControls = false,
  loop = true,
  className,
  testId,
}: {
  src: string;
  /** In-point inside the file, seconds. */
  start: number;
  /** Out-point inside the file, seconds. Null = to the end of the file. */
  end: number | null;
  lazy?: boolean;
  autoPlay?: boolean;
  showControls?: boolean;
  loop?: boolean;
  className?: string;
  testId?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(!lazy);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [at, setAt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!lazy || inView) return;
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        io.disconnect();
      }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, inView]);

  // a new range (another box, a moved take) starts from its own in-point
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    setFailed(false);
    const seek = () => {
      try {
        v.currentTime = start;
      } catch {
        // not seekable yet; loadedmetadata will do it
      }
    };
    if (v.readyState >= 1) seek();
    v.addEventListener("loadedmetadata", seek, { once: true });
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [src, start, inView]);

  useEffect(() => {
    const v = video.current;
    if (!v || !autoPlay) return;
    safePlay(v);
  }, [autoPlay, src, start, inView]);

  const span = end != null ? Math.max(0.05, end - start) : null;

  const onTime = () => {
    const v = video.current;
    if (!v) return;
    if (end != null && v.currentTime >= end - 0.03) {
      if (loop) v.currentTime = start;
      else v.pause();
    }
    setAt(Math.max(0, v.currentTime - start));
  };

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      if (end != null && (v.currentTime < start - 0.05 || v.currentTime >= end - 0.05)) v.currentTime = start;
      safePlay(v);
    } else v.pause();
  };

  return (
    <div ref={holder} className={cn("relative h-full w-full bg-black", className)} data-testid={testId}>
      {inView && !failed && (
        <video
          ref={video}
          src={src}
          className="absolute inset-0 h-full w-full object-contain"
          muted={muted}
          playsInline
          preload="metadata"
          onTimeUpdate={onTime}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
          onClick={toggle}
        />
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-white/60">
          This file could not be played in the browser.
        </div>
      )}
      {!failed && !playing && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center text-white/90 transition-colors hover:bg-black/10"
          data-testid={testId ? `${testId}-play` : undefined}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 backdrop-blur">
            <Play className="h-5 w-5 translate-x-px" />
          </span>
        </button>
      )}
      {showControls && !failed && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-white">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="rounded p-1 hover:bg-white/10">
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={span ?? Math.max(at, 1)}
            step={0.01}
            value={Math.min(at, span ?? at)}
            onChange={(e) => {
              const v = video.current;
              if (v) v.currentTime = start + Number(e.target.value);
            }}
            className="h-1 flex-1 cursor-pointer accent-white"
            aria-label="Position in this shot"
          />
          <span className="font-mono text-[10px] tabular-nums text-white/80">
            {at.toFixed(1)}
            {span != null ? ` / ${span.toFixed(1)}` : ""} s
          </span>
          <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} className="rounded p-1 hover:bg-white/10">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
