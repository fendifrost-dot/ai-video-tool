import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { DEFAULT_PROJECT_ASPECT, frameBoxStyle, type ProjectAspect } from "@/lib/project/aspect";
import { cn } from "@/lib/utils";
import { formatTimecode } from "@/components/treatment/shotLabels";
import { segmentAt, videoStateAt, type MediaAsset, type TimelineSegment } from "@/lib/storyboard/media";
import { ROLE_STYLE, mediaLabel } from "./BoxMediaView";
import { safePlay } from "./RangeVideo";
import { mediaRefKey, playbackRef, useSignedRefs, type MediaRef } from "./signedUrls";

/** How far a video may run from where the song says it should be before it is pulled back with a seek, seconds. */
const DRIFT_TOLERANCE = 0.2;
/** Smaller errors than that are closed by nudging the speed; below this the video simply runs. About one frame. */
const NUDGE_ABOVE = 0.03;

/**
 * The storyboard played as one continuous piece: the SONG is the clock, and at every moment the stage shows the
 * media of the shot that owns that moment, at the place in that media the shot's record says. A take is never
 * slid or stretched to fit — it is addressed by song time — so performance stays in sync across every cut.
 *
 * This is a preview assembled in the browser. It reads the same timeline a renderer would read (media.ts
 * buildTimeline); it is not a render.
 */
export function SequencePlayer({
  timeline,
  assets,
  song,
  onSegment,
  jumpTo,
  aspect = DEFAULT_PROJECT_ASPECT,
}: {
  timeline: TimelineSegment[];
  assets: ReadonlyMap<string, MediaAsset>;
  song: MediaRef | null;
  /** Told which shot is playing, so the page can highlight it. */
  onSegment?: (segment: TimelineSegment | null) => void;
  /** Jump to a song time (a shot picked from the list). `n` changes on every request so the same time can be asked twice. */
  jumpTo?: { t: number; n: number } | null;
  /** The project's frame: the stage takes its shape. */
  aspect?: ProjectAspect;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(timeline[0]?.shotId ?? null);

  const end = timeline.length ? timeline[timeline.length - 1].end : 0;
  const start = timeline.length ? timeline[0].start : 0;

  const videoAssetIds = useMemo(() => [...new Set(timeline.flatMap((s) => (s.media.kind === "video" ? [s.media.assetId] : [])))], [timeline]);
  const refs = useMemo(() => {
    const out: MediaRef[] = song ? [song] : [];
    for (const s of timeline) {
      if (s.media.kind === "none") continue;
      const a = assets.get(s.media.assetId);
      if (a) out.push(playbackRef(a));
    }
    return out;
  }, [timeline, assets, song]);
  const urls = useSignedRefs(refs);
  const urlOf = useCallback(
    (assetId: string) => {
      const a = assets.get(assetId);
      return a ? urls[mediaRefKey(playbackRef(a))] : undefined;
    },
    [assets, urls],
  );
  const songUrl = song ? urls[mediaRefKey(song)] : undefined;

  const active = useMemo(() => timeline.find((s) => s.shotId === activeId) ?? null, [timeline, activeId]);

  /** Put every video where the song says it should be: the active one playing in place, the rest quiet. */
  const sync = useCallback(
    (now: number, isPlaying: boolean) => {
      const seg = segmentAt(timeline, now) ?? timeline[0] ?? null;
      if (seg && seg.shotId !== activeId) {
        setActiveId(seg.shotId);
        onSegment?.(seg);
      }
      const activeAsset = seg?.media.kind === "video" ? seg.media.assetId : null;
      for (const [id, el] of videos.current) {
        if (id !== activeAsset) {
          if (!el.paused) el.pause();
          continue;
        }
        const state = videoStateAt(seg!, now, el.duration);
        if (!state) continue;
        // it holds its first frame inside a take's lead-in, and its last frame once the media has run out before
        // the shot has (asking an ended video to play would restart it at zero)
        const run = isPlaying && !state.hold;
        const drift = el.currentTime - state.at;
        if (Math.abs(drift) > DRIFT_TOLERANCE) {
          try {
            el.currentTime = state.at;
          } catch {
            // not seekable yet
          }
          el.playbackRate = 1;
        } else if (run) {
          // a few hundredths out (a seek that landed late): close it by running slightly fast or slow, not by jumping
          el.playbackRate = Math.abs(drift) > NUDGE_ABOVE ? (drift > 0 ? 0.94 : 1.06) : 1;
        }
        if (run) {
          if (el.paused) safePlay(el);
        } else if (!el.paused) el.pause();
      }
      // have the next shot's video waiting on its first frame
      if (seg) {
        const i = timeline.indexOf(seg);
        const next = timeline[i + 1];
        if (next && next.media.kind === "video" && next.media.assetId !== activeAsset && seg.end - now < 1.5) {
          const el = videos.current.get(next.media.assetId);
          if (el && el.paused && Math.abs(el.currentTime - next.media.sourceIn) > DRIFT_TOLERANCE) {
            try {
              el.currentTime = next.media.sourceIn;
            } catch {
              // not seekable yet
            }
          }
        }
      }
    },
    [timeline, activeId, onSegment],
  );

  // the clock: while the song plays, follow it every frame
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (a) {
        setT(a.currentTime);
        sync(a.currentTime, !a.paused);
        if (end > 0 && a.currentTime >= end) a.pause();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sync, end]);

  const seek = useCallback(
    (to: number) => {
      const a = audio.current;
      const clamped = Math.max(0, Math.min(end || to, to));
      if (a) a.currentTime = clamped;
      setT(clamped);
      sync(clamped, !!a && !a.paused);
    },
    [end, sync],
  );

  useEffect(() => {
    if (jumpTo) seek(jumpTo.t + 0.001);
    // a jump is the request, not the seek function's identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.n]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (end > 0 && a.currentTime >= end - 0.05) a.currentTime = start;
      safePlay(a);
    } else a.pause();
  };

  const step = (delta: number) => {
    const i = active ? timeline.indexOf(active) : 0;
    const to = timeline[Math.max(0, Math.min(timeline.length - 1, i + delta))];
    if (to) seek(to.start + 0.001);
  };

  const activeImage = active?.media.kind === "image" ? urlOf(active.media.assetId) : undefined;
  const activeVideoId = active?.media.kind === "video" ? active.media.assetId : null;

  return (
    <div className="space-y-3" data-testid="sequence-player" data-active-shot={active?.key ?? ""} data-playing={playing ? "true" : "false"}>
      <div className="relative mx-auto overflow-hidden rounded-xl bg-black" style={frameBoxStyle(aspect, "68vh")} data-testid="sequence-stage" data-media-kind={active?.media.kind ?? "none"} data-aspect={aspect}>
        {videoAssetIds.map((id) => {
          const src = urlOf(id);
          if (!src) return null;
          return (
            <video
              key={id}
              ref={(el) => {
                if (el) videos.current.set(id, el);
                else videos.current.delete(id);
              }}
              src={src}
              muted
              playsInline
              preload={id === activeVideoId ? "auto" : "metadata"}
              className={cn("absolute inset-0 h-full w-full object-contain", id === activeVideoId ? "opacity-100" : "pointer-events-none opacity-0")}
              data-asset-id={id}
            />
          );
        })}
        {activeImage && <img src={activeImage} alt="" className="absolute inset-0 h-full w-full object-contain" />}
        {active?.media.kind === "none" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center" data-testid="sequence-slate">
            <span className="font-mono text-3xl font-semibold text-white/25">{String(active.index).padStart(2, "0")}</span>
            <p className="max-w-xl text-sm leading-relaxed text-white/70">{active.scene}</p>
            <span className="text-[10px] uppercase tracking-wider text-white/35">no footage on this shot yet</span>
          </div>
        )}
        {active && (
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] text-white/85 backdrop-blur" data-testid="sequence-shot-label">
            {String(active.index).padStart(2, "0")} · {formatTimecode(active.start)}–{formatTimecode(active.end)}
          </span>
        )}
        {active && active.media.kind !== "none" && (
          <span className={cn("pointer-events-none absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur", ROLE_STYLE[active.media.role])}>
            {mediaLabel({ role: active.media.role, base: active.media.base })}
          </span>
        )}
      </div>

      {/* transport ------------------------------------------------------------- */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => step(-1)} aria-label="Previous shot" className="rounded-md p-2 text-foreground/70 hover:bg-white/5" data-testid="sequence-prev">
          <SkipBack className="h-4 w-4" />
        </button>
        <button type="button" onClick={toggle} disabled={!songUrl} aria-label={playing ? "Pause" : "Play"} className="rounded-full bg-primary p-2.5 text-primary-foreground disabled:opacity-40" data-testid="sequence-play">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
        </button>
        <button type="button" onClick={() => step(1)} aria-label="Next shot" className="rounded-md p-2 text-foreground/70 hover:bg-white/5" data-testid="sequence-next">
          <SkipForward className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs tabular-nums text-foreground/70" data-testid="sequence-time">
          {formatTimecode(t)} / {formatTimecode(end)}
        </span>
      </div>

      {/* the song, with every cut marked ---------------------------------------- */}
      <div className="relative h-8 w-full select-none">
        <input
          type="range"
          min={0}
          max={end || 1}
          step={0.01}
          value={Math.min(t, end || 1)}
          onChange={(e) => seek(Number(e.target.value))}
          className="absolute inset-x-0 top-1/2 h-1 w-full -translate-y-1/2 cursor-pointer accent-primary"
          aria-label="Position in the song"
          data-testid="sequence-scrub"
        />
        {end > 0 &&
          timeline.map((s) => (
            <span
              key={s.shotId}
              className={cn("pointer-events-none absolute top-0 h-2 w-px", s.shotId === activeId ? "bg-primary" : "bg-foreground/25")}
              style={{ left: `${(s.start / end) * 100}%` }}
            />
          ))}
      </div>

      {songUrl ? (
        <audio
          ref={audio}
          src={songUrl}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            sync(audio.current?.currentTime ?? t, false);
          }}
          onSeeked={() => sync(audio.current?.currentTime ?? t, !audio.current?.paused)}
          // The frame loop above stops when the tab is in the background; the song's own clock does not. Following it
          // here as well keeps the right shot on the stage when the director comes back to the tab.
          onTimeUpdate={() => {
            const a = audio.current;
            if (!a) return;
            setT(a.currentTime);
            sync(a.currentTime, !a.paused);
          }}
          data-testid="sequence-audio"
        />
      ) : (
        <p className="text-xs text-foreground/50">{song ? "Loading the song…" : "Upload the song in Setup to play the storyboard against it."}</p>
      )}
    </div>
  );
}
