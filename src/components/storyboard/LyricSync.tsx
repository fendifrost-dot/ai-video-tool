/**
 * Lyric sync — line a performance up to the words by hand (Fendi, 17 Oct 2026: "create a function to slice and move
 * performance shots to line up to actual lyrics manually inside the tool").
 *
 * Find the frame where he starts a line (scrub the take), press that line: the take is SLIPPED on this shot so that
 * frame lands on the line's first word. Nudge by a frame or a tenth either way, play the shot with the song under it,
 * and read back what the export carries: the in-point inside the clip and where it sits on the song. The flag says
 * whether the shot holds its lines, needs extending, or needs a new clip (lyricSync.ts lyricFit).
 *
 * What is written is this variation's own slip (footageEdit.ts); the project's sync is never touched.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { editOf, isUsableSync, MAX_SLIP_SECONDS, slipSeconds } from "@/lib/storyboard/footageEdit";
import {
  footageOnSong,
  linesOfShot,
  lyricFit,
  slipToLine,
  type LyricFitStatus,
} from "@/lib/storyboard/lyricSync";
import { mouthClock, type BoxMediaItem } from "@/lib/storyboard/media";
import type { StoryboardBox } from "@/lib/storyboard/boxes";
import { mediaRefKey, useSignedRefs } from "./signedUrls";
import { useStoryboard } from "./useStoryboardController";

const FRAME = 1 / 24;
/** Seconds of song played before and after the shot when it is played with the song. */
const PRE_ROLL = 1;
const POST_ROLL = 0.5;

const FIT_STYLE: Record<LyricFitStatus, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  extend_shot: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  needs_clip: "border-red-500/40 bg-red-500/10 text-red-300",
  no_lyrics: "border-border bg-background/40 text-foreground/50",
  no_clip: "border-border bg-background/40 text-foreground/50",
};
const FIT_LABEL: Record<LyricFitStatus, string> = {
  ok: "holds its lines",
  extend_shot: "extend the shot",
  needs_clip: "needs a new clip",
  no_lyrics: "no lyrics",
  no_clip: "no clip",
};

const fmt = (s: number) => `${s < 0 ? "−" : ""}${Math.abs(s).toFixed(3)} s`;

export function LyricSyncPanel({ item, box }: { item: BoxMediaItem; box: StoryboardBox }) {
  const sb = useStoryboard();
  const sync = sb.syncOf?.(item.asset.id) ?? null;
  const row = item.assignmentId ? (sb.assignmentOf?.(item.assignmentId) ?? null) : null;
  const slip = editOf(row).slip;
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [at, setAt] = useState(item.sourceIn ?? 0);
  const [typed, setTyped] = useState(String(slip));
  const [playing, setPlaying] = useState(false);
  // the slip asked for and not yet read back: quick nudges add up instead of each starting from the saved one
  const pending = useRef<number | null>(null);
  useEffect(() => {
    setTyped(String(slip));
    pending.current = null;
  }, [slip]);

  const songRefs = useMemo(() => (sb.song ? [sb.song] : []), [sb.song]);
  const signed = useSignedRefs(songRefs);
  const songUrl = sb.song ? signed[mediaRefKey(sb.song)] : undefined;
  const clipUrl = sb.urlFor(item.asset);

  const clock = item.kind === "video" ? mouthClock(item.asset) : null;
  // a take left out of this shot has nothing to line up (a nudge would put it back without saying so)
  const usable =
    clock === "camera" &&
    item.role === "performance" &&
    item.edit?.from !== "excluded" &&
    !!sync &&
    isUsableSync(sync);
  const lines = useMemo(() => linesOfShot(sb.songLines ?? [], box), [sb.songLines, box]);
  const fit = useMemo(
    () =>
      lyricFit({
        shot: box,
        lines: sb.songLines ?? [],
        footage:
          item.sourceIn != null
            ? footageOnSong({
                shotStart: box.start,
                sourceIn: item.sourceIn,
                leadIn: item.leadIn,
                durationSeconds: item.asset.durationSeconds,
              })
            : null,
      }),
    [box, sb.songLines, item.sourceIn, item.leadIn, item.asset.durationSeconds],
  );

  // while the song plays, the take follows it (song = take·k + offset + slip)
  useEffect(() => {
    if (!playing || !sync) return;
    const k = 1 + (sync.driftPpm ?? 0) / 1e6;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      const v = video.current;
      if (a && v) {
        const take = (a.currentTime - sync.offsetSeconds - slip) / k;
        if (Math.abs(v.currentTime - take) > 0.06) v.currentTime = Math.max(0, take);
        setAt(v.currentTime);
        if (a.currentTime >= box.end + POST_ROLL || a.ended) {
          a.pause();
          v.pause();
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, sync, slip, box.end]);

  if (clock === "model") {
    return (
      <div
        className="space-y-1 rounded-md border border-border/60 bg-background/40 px-2 py-1.5"
        data-testid="lyric-sync-model"
        data-fit={fit.status}
      >
        <p className="text-[10px] text-foreground/70">
          This clip’s mouth is the model’s. Moving it on the song does not line the mouth up. A
          camera take, or a dress retimed to that take, is what a lyric slip can align.
        </p>
        <p className="text-[10px] text-foreground/50" data-testid="lyric-sync-fit-message">
          {fit.message}
        </p>
      </div>
    );
  }

  if (!usable || !sync) return null;

  const setSlip = (s: number) => {
    pending.current = slipSeconds(s);
    void sb.editFootage(box, item.asset.id, { do: "slip", seconds: pending.current });
  };
  const nudge = (d: number) => setSlip((pending.current ?? slip) + d);
  const play = () => {
    const a = audio.current;
    const v = video.current;
    if (!a || !v) return;
    a.currentTime = Math.max(0, box.start - PRE_ROLL);
    v.muted = true;
    void a.play();
    void v.play();
    setPlaying(true);
  };
  const stop = () => {
    audio.current?.pause();
    video.current?.pause();
    setPlaying(false);
  };
  const scrub = (t: number) => {
    stop();
    if (video.current) video.current.currentTime = t;
    setAt(t);
  };
  const k = 1 + (sync.driftPpm ?? 0) / 1e6;
  const songAt = at * k + sync.offsetSeconds + slip;
  const duration = item.asset.durationSeconds ?? 0;

  return (
    <div
      className="space-y-1.5 rounded-md border border-border/60 bg-background/40 px-2 py-1.5"
      data-testid="lyric-sync"
      data-fit={fit.status}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-foreground/70">Lyric sync</span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wide",
            FIT_STYLE[fit.status],
          )}
          data-testid="lyric-sync-fit"
          title={fit.message}
        >
          {FIT_LABEL[fit.status]}
        </span>
      </div>
      {fit.status !== "ok" && (
        <p className="text-[10px] text-foreground/60" data-testid="lyric-sync-fit-message">
          {fit.message}
        </p>
      )}

      {clipUrl && (
        <video
          ref={video}
          src={clipUrl}
          // on the shot's own first frame, so the frame on screen is the one a line press aligns
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = item.sourceIn ?? 0;
            setAt(item.sourceIn ?? 0);
          }}
          muted
          playsInline
          preload="auto"
          className="max-h-48 rounded border border-border/50"
          data-testid="lyric-sync-video"
        />
      )}
      {songUrl && <audio ref={audio} src={songUrl} preload="auto" />}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-1.5 text-[10px]"
          onClick={playing ? stop : play}
          disabled={!songUrl || !clipUrl}
          data-testid="lyric-sync-play"
        >
          {playing ? "Stop" : "Play the shot with the song"}
        </Button>
        {duration > 0 && (
          <input
            type="range"
            min={0}
            max={duration}
            step={FRAME}
            value={at}
            onChange={(e) => scrub(Number(e.target.value))}
            className="min-w-24 flex-1"
            aria-label="Frame of the take"
            data-testid="lyric-sync-scrub"
          />
        )}
        <span className="font-mono text-[10px] text-foreground/50" data-testid="lyric-sync-at">
          take {at.toFixed(3)} s → song {songAt.toFixed(3)} s
        </span>
      </div>

      {lines.length > 0 && (
        <div className="space-y-1" data-testid="lyric-sync-lines">
          <p className="text-[10px] text-foreground/50">
            Scrub to where he starts a line, then press it:
          </p>
          {lines.map((l) => {
            const s = slipToLine({ sync, takeSeconds: at, songSeconds: l.start });
            return (
              <button
                key={l.lineIndex}
                type="button"
                disabled={s == null}
                onClick={() => s != null && setSlip(s)}
                className="block w-full rounded border border-border/60 px-1.5 py-0.5 text-left text-[10px] hover:border-primary/60 disabled:opacity-40"
                data-testid="lyric-sync-line"
                title={s == null ? `more than ${MAX_SLIP_SECONDS} s away` : `slip ${fmt(s)}`}
              >
                <span className="font-mono text-foreground/40">{l.start.toFixed(2)}</span> {l.text}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {[-0.5, -0.1, -FRAME, FRAME, 0.1, 0.5].map((d) => (
          <Button
            key={d}
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 font-mono text-[10px]"
            onClick={() => nudge(d)}
            data-testid="lyric-sync-nudge"
          >
            {d < 0 ? "−" : "+"}
            {Math.abs(d) === FRAME ? "1f" : Math.abs(d).toFixed(1)}
          </Button>
        ))}
        <label className="flex items-center gap-1 text-[10px] text-foreground/60">
          slip
          <input
            type="number"
            step={FRAME}
            min={-MAX_SLIP_SECONDS}
            max={MAX_SLIP_SECONDS}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={(e) => {
              // an emptied field is not a request for 0: it goes back to what is saved
              const v = e.target.value.trim();
              if (v === "" || !Number.isFinite(Number(v))) return setTyped(String(slip));
              if (Number(v) !== slip) setSlip(Number(v));
            }}
            className="h-6 w-20 rounded border border-border bg-background/60 px-1 font-mono text-[10px]"
            aria-label="Seconds this take plays later on this shot than its sync"
            data-testid="lyric-sync-slip"
          />
        </label>
        {slip !== 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[10px]"
            onClick={() => setSlip(0)}
            data-testid="lyric-sync-reset"
          >
            Back on the sync
          </Button>
        )}
      </div>

      <p className="font-mono text-[10px] text-foreground/50" data-testid="lyric-sync-readout">
        clip in {item.sourceIn != null ? fmt(item.sourceIn) : "—"} · on the song at{" "}
        {fmt(box.start + item.leadIn)} · slip {fmt(slip)}
      </p>
    </div>
  );
}
