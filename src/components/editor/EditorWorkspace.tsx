import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyGesture,
  durationSeconds,
  mediaWarnings,
  replaceTake,
  type EditSequence,
  type Gesture,
} from "../../../supabase/functions/edit-render/model";
import { signedUrls, type StorageBucket } from "@/lib/storage";
import {
  canRedo,
  canUndo,
  historyOf,
  pushEdit,
  redoEdit,
  undoEdit,
  type EditHistory,
} from "@/lib/editor/history";
import { phraseLoopWindow, stepFrame } from "@/lib/editor/playback";
import { useEditMediaUrls } from "@/lib/queries/editMediaUrls";
import {
  downloadSequenceXml,
  requestEditRender,
  useSaveEditSequence,
} from "@/lib/queries/editSequences";
import { useProjectAssets } from "@/lib/queries/projectAssets";
import type { ProjectAsset } from "@/integrations/supabase/aliases";
import { Button } from "@/components/ui/button";
import { MediaBrowser } from "./MediaBrowser";
import { SequencePreview } from "./SequencePreview";
import { SongWaveform } from "./SongWaveform";
import { SyncPanel } from "./SyncPanel";
import { TimelineCanvas } from "./TimelineCanvas";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  sequence: EditSequence;
  onSequenceId?: (id: string) => void;
};

function assetDuration(asset: ProjectAsset): number | null {
  const meta = (asset.metadata_json ?? {}) as Record<string, unknown>;
  const d = meta.duration_seconds;
  return typeof d === "number" && d > 0 ? d : null;
}

export function EditorWorkspace({ projectId, sequence: initial, onSequenceId }: Props) {
  const [history, setHistory] = useState<EditHistory>(() => historyOf(initial));
  const sequence = history.present;
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(64);
  const [songLocked] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const [slipBaselines, setSlipBaselines] = useState<
    Record<string, { sourceIn: number; sourceOut: number }>
  >({});
  const [extraUrls, setExtraUrls] = useState<Record<string, string>>({});

  const mediaQ = useEditMediaUrls(sequence);
  const assetsQ = useProjectAssets(projectId);
  const saveMut = useSaveEditSequence(projectId);

  async function ensureAssetUrl(asset: ProjectAsset): Promise<string | null> {
    if (mediaQ.data?.byAssetId[asset.id]) return mediaQ.data.byAssetId[asset.id]!;
    if (extraUrls[asset.id]) return extraUrls[asset.id]!;
    const meta = (asset.metadata_json ?? {}) as Record<string, unknown>;
    const bucket = (typeof meta.bucket === "string" ? meta.bucket : "project-clips") as StorageBucket;
    const path = asset.file_url.replace(/^\/+/, "");
    const urls = await signedUrls(bucket, [path], 3600);
    const url = urls[path] ?? null;
    if (url) setExtraUrls((m) => ({ ...m, [asset.id]: url }));
    return url;
  }

  // Remount history when a different sequence is loaded from the server.
  useEffect(() => {
    setHistory(historyOf(initial));
    setPlayhead(0);
    setPlaying(false);
    setSelectedId(null);
    setSaveState("idle");
    setSlipBaselines({});
  }, [initial.id]);

  const selected = sequence.clips.find((c) => c.id === selectedId) ?? null;
  const warnings = useMemo(() => mediaWarnings(sequence), [sequence]);
  const dur = durationSeconds(sequence);

  const commit = useCallback((next: EditSequence) => {
    setHistory((h) => pushEdit(h, next));
    setSaveState("idle");
  }, []);

  const onGesture = useCallback(
    (g: Gesture) => {
      if (g.kind === "slip" && !slipBaselines[g.clipId]) {
        const c = sequence.clips.find((x) => x.id === g.clipId);
        if (c) {
          setSlipBaselines((b) => ({
            ...b,
            [g.clipId]: { sourceIn: c.sourceIn, sourceOut: c.sourceOut },
          }));
        }
      }
      commit(applyGesture(sequence, g));
    },
    [commit, sequence, slipBaselines],
  );

  // Playback clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * rate;
      last = now;
      setPlayhead((t) => {
        let next = t + dt;
        if (loop) {
          if (next >= loop.end) next = loop.start;
        } else if (next >= dur) {
          setPlaying(false);
          return dur;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, dur, loop]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setPlayhead((t) => stepFrame(t, sequence.fps, e.shiftKey ? -12 : -1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setPlayhead((t) => stepFrame(t, sequence.fps, e.shiftKey ? 12 : 1));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redoEdit(h) : undoEdit(h)));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence.fps, history]);

  async function save() {
    setSaveState("saving");
    setSaveError(null);
    try {
      const id = await saveMut.mutateAsync(sequence);
      onSequenceId?.(id);
      setHistory((h) => historyOf({ ...h.present, version: h.present.version + 1 }));
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function addAsset(asset: ProjectAsset) {
    const mediaDur = assetDuration(asset);
    const start = playhead;
    const len = Math.min(mediaDur ?? 2, 4);
    const clip = {
      id: crypto.randomUUID(),
      name: asset.notes?.trim() || asset.file_url.split("/").pop() || "Clip",
      assetId: asset.id,
      fileName: asset.file_url.split("/").pop() ?? null,
      sourceIn: 0,
      sourceOut: len,
      timelineIn: start,
      timelineOut: start + len,
      mediaDuration: mediaDur,
      mouth: null as "camera" | "model" | null,
      track: "V1" as const,
      order: sequence.clips.length,
      shotId: null,
      shotKey: null,
      speed: 1,
      transition: "cut" as const,
      transitionSeconds: 0,
      labelColor: null,
      placeholder: false,
      comment: "",
      enabled: true,
    };
    commit({ ...sequence, clips: [...sequence.clips, clip] });
  }

  function replaceSelected(asset: ProjectAsset) {
    if (!selectedId) return;
    commit(
      replaceTake(sequence, selectedId, {
        assetId: asset.id,
        fileName: asset.file_url.split("/").pop() ?? null,
        mediaDuration: assetDuration(asset),
        clearPlaceholder: true,
      }),
    );
  }

  const mediaByAsset = { ...(mediaQ.data?.byAssetId ?? {}), ...extraUrls };
  const songUrl = mediaQ.data?.songUrl ?? null;
  const previewUrl = previewAssetId ? mediaByAsset[previewAssetId] ?? null : null;

  // Side-by-side: when compare is on, try an original-take asset from the browser.
  const originalCompareUrl = useMemo(() => {
    if (!compareOriginal) return null;
    const originals = (assetsQ.data ?? []).filter((a) => a.footage_role === "performance");
    const first = originals[0];
    return first ? mediaByAsset[first.id] ?? null : null;
  }, [compareOriginal, assetsQ.data, mediaByAsset]);

  const lyricMarker = sequence.markers.find((m) => m.kind === "lyric");

  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="editor-workspace">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Button size="sm" variant={playing ? "secondary" : "default"} onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPlayhead((t) => stepFrame(t, sequence.fps, -1))}>
          −1f
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPlayhead((t) => stepFrame(t, sequence.fps, 1))}>
          +1f
        </Button>
        <Button
          size="sm"
          variant={rate < 1 ? "default" : "outline"}
          onClick={() => setRate((r) => (r === 1 ? 0.5 : 1))}
        >
          {rate === 1 ? "½ speed" : "Normal speed"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selectedId}
          onClick={() => selectedId && onGesture({ kind: "split", clipId: selectedId, atTimelineSeconds: playhead })}
        >
          Split at playhead
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!selectedId}
          onClick={() => selectedId && onGesture({ kind: "remove", clipId: selectedId, ripple: false })}
        >
          Remove from edit
        </Button>
        <Button size="sm" variant="outline" disabled={!canUndo(history)} onClick={() => setHistory(undoEdit)}>
          Undo
        </Button>
        <Button size="sm" variant="outline" disabled={!canRedo(history)} onClick={() => setHistory(redoEdit)}>
          Redo
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(24, z / 1.25))}>
          Zoom −
        </Button>
        <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(200, z * 1.25))}>
          Zoom +
        </Button>
        <Button
          size="sm"
          variant={loop ? "default" : "outline"}
          disabled={!lyricMarker}
          onClick={() => {
            if (loop) {
              setLoop(null);
              return;
            }
            if (!lyricMarker) return;
            setLoop(
              phraseLoopWindow({
                timeIn: Math.max(0, lyricMarker.timeIn - sequence.songOffset),
                timeOut:
                  lyricMarker.timeOut != null
                    ? Math.max(0, lyricMarker.timeOut - sequence.songOffset)
                    : null,
                preRoll: 0.35,
                sequenceDuration: dur,
              }),
            );
            setPlaying(true);
          }}
        >
          Loop phrase
        </Button>
        <Button
          size="sm"
          variant={compareOriginal ? "default" : "outline"}
          onClick={() => setCompareOriginal((v) => !v)}
        >
          Compare original
        </Button>
        <div className="flex-1" />
        <span
          className={cn(
            "text-xs",
            saveState === "error" ? "text-destructive" : "text-muted-foreground",
          )}
          data-testid="save-status"
        >
          {saveState === "saving" && "Saving…"}
          {saveState === "saved" && "Saved"}
          {saveState === "error" && (saveError || "Save failed")}
          {saveState === "idle" && "Unsaved changes stay on this device until you save"}
        </span>
        <Button size="sm" onClick={() => void save()} disabled={saveMut.isPending}>
          Save
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            downloadSequenceXml(sequence);
            setExportNote("Downloaded Premiere/FCP XML for this cut.");
          }}
        >
          Download cut (XML)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void (async () => {
              setExportNote("Planning export…");
              try {
                await saveMut.mutateAsync(sequence);
                const dry = await requestEditRender({ sequenceId: sequence.id, dryRun: true });
                const queued = await requestEditRender({ sequenceId: sequence.id, dryRun: false });
                setExportNote(
                  [
                    dry.media
                      ? `Resolved ${dry.media.resolved} picture file(s)${dry.media.missing?.length ? `; missing: ${dry.media.missing.join(", ")}` : ""}`
                      : "Plan ready",
                    queued.renderId
                      ? `Queued render ${queued.renderId} (cost $0). MP4 encode runs via the approved edit-render worker — open the cut again after encode, or use Download cut (XML) now.`
                      : queued.note || "Queued.",
                  ].join(" · "),
                );
              } catch (err) {
                setExportNote(err instanceof Error ? err.message : "Export failed");
              }
            })();
          }}
        >
          Export preview
        </Button>
      </div>

      {exportNote && (
        <p className="text-xs text-muted-foreground" data-testid="export-note">
          {exportNote}
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/90">
          {warnings.slice(0, 6).map((w) => (
            <li key={`${w.clipId}-${w.message}`}>{w.message}</li>
          ))}
        </ul>
      )}

      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-3">
          <SequencePreview
            sequence={sequence}
            playhead={playhead}
            playing={playing}
            playbackRate={rate}
            mediaByAsset={mediaByAsset}
            songUrl={songUrl}
            compareUrl={originalCompareUrl}
            compareLabel="Original performance"
          />
          {previewUrl && previewAssetId && (
            <div className="rounded-xl border border-border bg-card p-2" data-testid="version-preview">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Version preview (not on the timeline yet)</p>
                <Button size="sm" variant="ghost" onClick={() => setPreviewAssetId(null)}>
                  Close
                </Button>
              </div>
              <video src={previewUrl} controls playsInline className="max-h-48 w-full rounded-lg bg-black object-contain" />
            </div>
          )}
          <div className="overflow-x-auto">
            <SongWaveform
              songUrl={songUrl}
              duration={dur}
              songOffset={sequence.songOffset}
              playhead={playhead}
              pxPerSecond={zoom}
              markers={sequence.markers}
              songLocked={songLocked}
              onSeek={(t) => {
                setPlayhead(t);
                setPlaying(false);
              }}
            />
          </div>
          <TimelineCanvas
            sequence={sequence}
            playhead={playhead}
            selectedId={selectedId}
            pxPerSecond={zoom}
            onSelect={setSelectedId}
            onSeek={(t) => {
              setPlayhead(t);
              setPlaying(false);
            }}
            onGesture={onGesture}
          />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <SyncPanel
            sequence={sequence}
            clip={selected}
            slipBaseline={selectedId ? slipBaselines[selectedId] ?? null : null}
            onGesture={onGesture}
            onResetSlip={() => {
              if (!selectedId || !slipBaselines[selectedId]) return;
              const base = slipBaselines[selectedId]!;
              commit({
                ...sequence,
                clips: sequence.clips.map((c) =>
                  c.id === selectedId
                    ? { ...c, sourceIn: base.sourceIn, sourceOut: base.sourceOut }
                    : c,
                ),
              });
            }}
          />
          <div className="min-h-[240px] flex-1">
            <MediaBrowser
              assets={assetsQ.data ?? []}
              previewAssetId={previewAssetId}
              onPreview={(a) => {
                setPreviewAssetId(a.id);
                void ensureAssetUrl(a);
              }}
              onAddToTimeline={addAsset}
              onReplaceSelected={replaceSelected}
              hasSelection={!!selectedId}
              className="h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
