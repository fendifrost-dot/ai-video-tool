import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, Sparkles } from "lucide-react";
import { DEFAULT_PROJECT_ASPECT, frameBoxStyle, frameSize, type ProjectAspect } from "@/lib/project/aspect";
import { cn } from "@/lib/utils";
import { formatTimecode } from "@/components/treatment/shotLabels";
import { clipSpans, effectsAt, effectsCoverage, effectsLabel, effectsMediaTime, type EffectsSpan } from "@/lib/storyboard/effectsPreview";
import { pictureAt, pictureFilter } from "@/lib/storyboard/events";
import { DRIFT_TOLERANCE, segmentAt, videoStateAt, videoTick, type MediaAsset, type TimelineSegment } from "@/lib/storyboard/media";
import { reframeStyle } from "@/lib/storyboard/reframe";
import { ROLE_STYLE, mediaLabel } from "./BoxMediaView";
import { safePlay } from "./RangeVideo";
import { mediaRefKey, playbackRef, useSignedRefs, type MediaRef } from "./signedUrls";

type Placement = ReturnType<typeof reframeStyle>;

/**
 * A media element where its shot's reframe puts it (reframe.ts reframeStyle — the rect a render crops, fitted whole
 * in the frame), or back to the whole picture. The stage hides what falls outside it.
 */
function placeMedia(el: HTMLElement, place: Placement) {
  const s = el.style;
  s.left = place ? `${place.left}%` : "";
  s.top = place ? `${place.top}%` : "";
  s.width = place ? `${place.width}%` : "";
  s.height = place ? `${place.height}%` : "";
  if (place) el.dataset.reframed = "true";
  else delete el.dataset.reframed;
}

/**
 * The storyboard played as one continuous piece: the SONG is the clock, and at every moment the stage shows the
 * media of the shot that owns that moment, at the place in that media the shot's record says. A take is never
 * slid or stretched to fit — it is addressed by song time — so performance stays in sync across every cut.
 *
 * This is a preview assembled in the browser. It reads the same timeline a renderer would read (media.ts
 * buildTimeline); it is not a render.
 *
 * EFFECTS (effectsPreview.ts): where post has filed a preview copy of what it built, that copy is laid over the
 * board for its stretch of the song, addressed by song time like everything else. It is the effect as rendered, at
 * a small size; the shot's own timed events and reframe are not put on it (they are already in it). Switched off,
 * or with no copies, the board plays exactly as it did.
 */
export function SequencePlayer({
  timeline,
  assets,
  song,
  onSegment,
  jumpTo,
  aspect = DEFAULT_PROJECT_ASPECT,
  effects,
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
  /** The stretches of the song that have a preview copy of built effects (effectsPreview.ts effectsLayer), whole song. */
  effects?: readonly EffectsSpan[];
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  // the preview copies of built effects, one element per file, laid over the picture
  const fxVideos = useRef(new Map<string, HTMLVideoElement>());
  const [fxOn, setFxOn] = useState(true);
  const [activeFx, setActiveFx] = useState<string | null>(null);
  // the picture layer (every video and image) and the white laid over it: a shot's timed effects are put on these
  const pictureLayer = useRef<HTMLDivElement>(null);
  const flashLayer = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(timeline[0]?.shotId ?? null);
  // the frame a render draws into: a reframe is placed in it as a render crops it
  const frame = useMemo(() => frameSize(aspect), [aspect]);
  const [imageSize, setImageSize] = useState<{ src: string; w: number; h: number } | null>(null);

  const end = timeline.length ? timeline[timeline.length - 1].end : 0;
  const start = timeline.length ? timeline[0].start : 0;

  // the copies that fall inside what is being played (the whole song, or a section of it)
  const spans = useMemo(() => (effects?.length && end > start ? clipSpans(effects, start, end) : []), [effects, start, end]);
  const fxPreviews = useMemo(() => [...new Map(spans.map((s) => [s.preview.assetId, s.preview])).values()], [spans]);
  const fxCovered = useMemo(() => effectsCoverage(spans, start, end), [spans, start, end]);

  const videoAssetIds = useMemo(() => [...new Set(timeline.flatMap((s) => (s.media.kind === "video" ? [s.media.assetId] : [])))], [timeline]);
  const refs = useMemo(() => {
    const out: MediaRef[] = song ? [song] : [];
    for (const s of timeline) {
      if (s.media.kind === "none") continue;
      const a = assets.get(s.media.assetId);
      if (a) out.push(playbackRef(a));
    }
    for (const p of fxPreviews) out.push({ bucket: p.bucket, path: p.path });
    return out;
  }, [timeline, assets, song, fxPreviews]);
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
      // a preview copy of built effects owns this moment when there is one and the switch is on
      const fx = fxOn ? effectsAt(spans, now) : null;
      const fxId = fx?.preview.assetId ?? null;
      setActiveFx((prev) => (prev === fxId ? prev : fxId));
      // the shot's timed effects, at this moment of the song — the arithmetic a render applies (events.ts pictureAt).
      // Not under a preview copy: what post built already has them in it.
      const p = !fx && seg && seg.events?.length ? pictureAt(seg.events, Math.max(0, now - seg.start)) : null;
      if (pictureLayer.current) {
        pictureLayer.current.style.filter = p ? pictureFilter(p) : "none";
        pictureLayer.current.dataset.brightness = String(p ? p.brightness : 1);
      }
      if (flashLayer.current) flashLayer.current.style.opacity = String(p ? p.flash : 0);
      for (const [id, el] of fxVideos.current) {
        if (id !== fxId) {
          if (!el.paused) el.pause();
          continue;
        }
        // addressed by the song, like a take: never slid, and held on its last frame if the file is short
        const tick = videoTick({ state: effectsMediaTime(fx!.preview, now, el.duration), currentTime: el.currentTime, ended: el.ended, playing: isPlaying });
        if (tick.seekTo != null) {
          try {
            el.currentTime = tick.seekTo;
          } catch {
            // not seekable yet
          }
        }
        if (tick.seekTo != null || tick.run) el.playbackRate = tick.rate;
        if (tick.run) {
          if (el.paused) safePlay(el);
        } else if (!el.paused) el.pause();
      }
      // have the next copy waiting on the frame it comes in on
      const nextFx = fxOn ? spans.find((s) => s.start > now && s.start - now < 1.5 && s.preview.assetId !== fxId) : undefined;
      if (nextFx) {
        const el = fxVideos.current.get(nextFx.preview.assetId);
        const at = nextFx.start - nextFx.preview.songStart;
        if (el && el.paused && Math.abs(el.currentTime - at) > DRIFT_TOLERANCE) {
          try {
            el.currentTime = at;
          } catch {
            // not seekable yet
          }
        }
      }
      // under a copy the board's own video rests; it is cued again when the copy ends
      const activeAsset = !fx && seg?.media.kind === "video" ? seg.media.assetId : null;
      for (const [id, el] of videos.current) {
        if (id !== activeAsset) {
          if (!el.paused) el.pause();
          continue;
        }
        // the shot's reframe, on the element its media plays in (one element per file: two shots of the same take
        // can be framed differently, so it is put on at every tick, as the shot changes)
        placeMedia(el, reframeStyle(el.videoWidth, el.videoHeight, seg!.reframe, frame));
        const state = videoStateAt(seg!, now, el.duration);
        if (!state) continue;
        // it holds its first frame inside a take's lead-in, and its last frame once the media has run out before
        // the shot has — or once the element itself has played to its end (media.ts videoTick)
        const tick = videoTick({ state, currentTime: el.currentTime, ended: el.ended, playing: isPlaying });
        if (tick.seekTo != null) {
          try {
            el.currentTime = tick.seekTo;
          } catch {
            // not seekable yet
          }
        }
        if (tick.seekTo != null || tick.run) el.playbackRate = tick.rate;
        if (tick.run) {
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
    [timeline, activeId, onSegment, frame, spans, fxOn],
  );

  // the switch is thrown while paused: no tick would put the right picture up
  useEffect(() => {
    sync(audio.current?.currentTime ?? t, !!audio.current && !audio.current.paused);
    // only when the switch or the copies change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxOn, spans]);

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
        else if (a.currentTime < start - 0.05) a.currentTime = start;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sync, end]);

  const seek = useCallback(
    (to: number) => {
      const a = audio.current;
      const clamped = Math.max(start, Math.min(end || to, to));
      if (a) a.currentTime = clamped;
      setT(clamped);
      sync(clamped, !!a && !a.paused);
    },
    [start, end, sync],
  );

  // the timeline is the whole song or a section of it: when it changes, the playhead goes to where it starts
  useEffect(() => {
    const a = audio.current;
    const now = a?.currentTime ?? 0;
    if (now < start - 0.01 || (end > 0 && now > end)) {
      if (a && !a.paused) a.pause();
      seek(start + 0.001);
    }
    // only when the section itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  useEffect(() => {
    if (jumpTo) seek(jumpTo.t + 0.001);
    // a jump is the request, not the seek function's identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.n]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if ((end > 0 && a.currentTime >= end - 0.05) || a.currentTime < start) a.currentTime = start;
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
  const activeFxSpan = activeFx ? spans.find((s) => s.preview.assetId === activeFx) ?? null : null;
  const imagePlace = activeImage && imageSize?.src === activeImage ? reframeStyle(imageSize.w, imageSize.h, active?.reframe, frame) : null;

  return (
    <div className="space-y-3" data-testid="sequence-player" data-active-shot={active?.key ?? ""} data-playing={playing ? "true" : "false"}>
      <div className="relative mx-auto overflow-hidden rounded-xl bg-black" style={frameBoxStyle(aspect, "68vh")} data-testid="sequence-stage" data-media-kind={active?.media.kind ?? "none"} data-aspect={aspect} data-effects={activeFx ?? ""}>
        <div ref={pictureLayer} className="absolute inset-0" data-testid="sequence-picture">
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
              // the picture's size is known only now: a reframe can be placed (when paused, no tick would)
              onLoadedMetadata={() => id === activeVideoId && sync(audio.current?.currentTime ?? t, !!audio.current && !audio.current.paused)}
              data-asset-id={id}
            />
          );
        })}
        {activeImage && (
          <img
            src={activeImage}
            alt=""
            onLoad={(e) => setImageSize({ src: activeImage, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="absolute inset-0 h-full w-full object-contain"
            style={imagePlace ? { left: `${imagePlace.left}%`, top: `${imagePlace.top}%`, width: `${imagePlace.width}%`, height: `${imagePlace.height}%` } : undefined}
            data-reframed={imagePlace ? "true" : undefined}
            data-testid="sequence-image"
          />
        )}
        </div>
        {/* what post has built, as rendered: over the board's picture, under the labels */}
        <div className="pointer-events-none absolute inset-0" data-testid="sequence-effects">
          {fxPreviews.map((p) => {
            const src = urls[mediaRefKey({ bucket: p.bucket, path: p.path })];
            if (!src) return null;
            return (
              <video
                key={p.assetId}
                ref={(el) => {
                  if (el) fxVideos.current.set(p.assetId, el);
                  else fxVideos.current.delete(p.assetId);
                }}
                src={src}
                muted
                playsInline
                preload={p.assetId === activeFx ? "auto" : "metadata"}
                className={cn("absolute inset-0 h-full w-full bg-black object-contain", p.assetId === activeFx ? "opacity-100" : "opacity-0")}
                onLoadedMetadata={() => p.assetId === activeFx && sync(audio.current?.currentTime ?? t, !!audio.current && !audio.current.paused)}
                data-effects-asset-id={p.assetId}
              />
            );
          })}
        </div>
        <div ref={flashLayer} className="pointer-events-none absolute inset-0 bg-white" style={{ opacity: 0 }} data-testid="sequence-flash" aria-hidden />
        {active?.media.kind === "none" && !activeFx && (
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
        {activeFxSpan && (
          <span className="pointer-events-none absolute right-2 top-2 rounded bg-sky-500/25 px-1.5 py-0.5 text-[10px] font-medium text-sky-100 backdrop-blur" data-testid="sequence-effects-badge">
            effects · {effectsLabel(activeFxSpan.preview)}
          </span>
        )}
        {active && active.media.kind !== "none" && !activeFx && (
          <span className={cn("pointer-events-none absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium backdrop-blur", ROLE_STYLE[active.media.role])}>
            {mediaLabel({ role: active.media.role, base: active.media.base, asset: assets.get(active.media.assetId) })}
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
        {spans.length > 0 && (
          <button
            type="button"
            onClick={() => setFxOn((on) => !on)}
            aria-pressed={fxOn}
            className={cn("ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium", fxOn ? "border-sky-400/50 bg-sky-500/15 text-sky-100" : "border-border text-foreground/55 hover:bg-white/5")}
            title="Play the preview copies post has filed of the effects it built, in place over the board"
            data-testid="sequence-effects-toggle"
            data-on={fxOn ? "true" : "false"}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Effects {fxOn ? "on" : "off"}
            <span className="font-normal text-foreground/45" data-testid="sequence-effects-coverage">
              · built for {formatTimecode(fxCovered.seconds)} of {formatTimecode(Math.max(0, end - start))}
            </span>
          </button>
        )}
      </div>

      {/* the song, with every cut marked ---------------------------------------- */}
      <div className="relative h-8 w-full select-none">
        <input
          type="range"
          min={start}
          max={end || 1}
          step={0.01}
          value={Math.max(start, Math.min(t, end || 1))}
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
              style={{ left: `${((s.start - start) / Math.max(0.001, end - start)) * 100}%` }}
            />
          ))}
        {/* where post has built effects: one bar per stretch that has a preview copy */}
        {spans.map((s) => (
          <button
            key={`${s.preview.assetId}:${s.start}`}
            type="button"
            onClick={() => seek(s.start + 0.001)}
            className={cn("absolute bottom-0 h-1.5 rounded-sm", fxOn ? "bg-sky-400/80" : "bg-sky-400/30", s.preview.assetId === activeFx && "bg-sky-300")}
            style={{ left: `${((s.start - start) / Math.max(0.001, end - start)) * 100}%`, width: `${((s.end - s.start) / Math.max(0.001, end - start)) * 100}%` }}
            title={`Effects: ${effectsLabel(s.preview)} · ${formatTimecode(s.start)}–${formatTimecode(s.end)}`}
            aria-label={`Go to the effects preview ${effectsLabel(s.preview)}`}
            data-testid="sequence-effects-span"
            data-section={s.preview.section}
            data-version={s.preview.version}
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
