import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { EditMarker } from "../../../supabase/functions/edit-render/model";

type Props = {
  songUrl: string | null;
  duration: number;
  songOffset: number;
  playhead: number;
  pxPerSecond: number;
  markers: EditMarker[];
  songLocked: boolean;
  onSeek: (timelineSeconds: number) => void;
  className?: string;
};

/** Visible song track with optional peaks and lyric markers (editable timestamps stay on markers). */
export function SongWaveform({
  songUrl,
  duration,
  songOffset,
  playhead,
  pxPerSecond,
  markers,
  songLocked,
  onSeek,
  className,
}: Props) {
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    if (!songUrl) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(songUrl);
        const buf = await res.arrayBuffer();
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(buf.slice(0));
        const data = audio.getChannelData(0);
        const bars = Math.min(800, Math.max(80, Math.floor(duration * 8)));
        const block = Math.floor(data.length / bars) || 1;
        const next: number[] = [];
        for (let i = 0; i < bars; i++) {
          let sum = 0;
          const start = i * block;
          for (let j = 0; j < block && start + j < data.length; j++) {
            sum += Math.abs(data[start + j]!);
          }
          next.push(sum / block);
        }
        const max = Math.max(...next, 1e-6);
        if (!cancelled) setPeaks(next.map((v) => v / max));
        void ctx.close();
      } catch {
        if (!cancelled) setPeaks(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songUrl, duration]);

  const width = Math.max(320, duration * pxPerSecond);
  const lyricMarkers = useMemo(
    () => markers.filter((m) => m.kind === "lyric" || m.kind === "beat"),
    [markers],
  );

  return (
    <div className={cn("relative", className)} data-testid="song-waveform">
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          Song {songLocked ? "(locked — picture moves independently)" : "(unlocked)"} · offset{" "}
          {songOffset.toFixed(2)}s
        </span>
      </div>
      <div
        className="relative h-14 overflow-hidden rounded-lg border border-border bg-[#101417]"
        style={{ width }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          onSeek(Math.max(0, Math.min(duration, x / pxPerSecond)));
        }}
        role="presentation"
      >
        <div className="absolute inset-0 flex items-end gap-px px-0.5 py-1">
          {(peaks ?? Array.from({ length: Math.max(40, Math.floor(duration * 4)) }, () => 0.35)).map(
            (p, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-primary/55"
                style={{ height: `${12 + p * 88}%` }}
              />
            ),
          )}
        </div>
        {lyricMarkers.map((m) => {
          const t = Math.max(0, m.timeIn - songOffset);
          if (t > duration) return null;
          return (
            <div
              key={m.id}
              className="absolute top-0 h-full w-px bg-generation/80"
              style={{ left: t * pxPerSecond }}
              title={m.name || m.kind}
            />
          );
        })}
        <div
          className="absolute top-0 h-full w-0.5 bg-primary"
          style={{ left: playhead * pxPerSecond }}
          data-testid="song-playhead"
        />
      </div>
    </div>
  );
}
