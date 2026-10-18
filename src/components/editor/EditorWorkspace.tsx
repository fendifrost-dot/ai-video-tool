import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyGesture,
  applyPerformanceProvenance,
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
import { resolveCompareOriginal } from "@/lib/editor/compareOriginal";
import { loopWindowForPhrase, phraseAtPlayhead } from "@/lib/editor/phraseAt";
import { stepFrame } from "@/lib/editor/playback";
import { useEditMediaUrls } from "@/lib/queries/editMediaUrls";
import {
  downloadSequenceXml,
  requestEditRender,
  useLatestEditRender,
  useSaveEditSequence,
} from "@/lib/queries/editSequences";
import { useProjectAssets } from "@/lib/queries/projectAssets";
import { useSequenceProvenance } from "@/lib/queries/editProvenance";
import { useTakeSyncs } from "@/lib/queries/storyboard";
import type { ProjectAsset } from "@/integrations/supabase/aliases";
import { Button } from "@/components/ui/button";
import { MediaBrowser } from "./MediaBrowser";
import { RenderStatus } from "./RenderStatus";
import { SequencePreview } from "./SequencePreview";
import { SongWaveform } from "./SongWaveform";
import { SyncPanel } from "./SyncPanel";
import { TimelineCanvas } from "./TimelineCanvas";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  sequence: EditSequence;
  onSequenceId?: (id: string) => void;
  /** Fired when unsaved edits appear or clear — parent uses this to guard navigation. */
  onDirtyChange?: (dirty: boolean) => void;
};

function editFingerprint(seq: EditSequence): string {
  return JSON.stringify({
    clips: seq.clips.map((c) => [
      c.id,
      c.assetId,
      c.sourceIn,
      c.sourceOut,
      c.timelineIn,
      c.timelineOut,
      c.enabled,
    ]),
    markers: seq.markers.map((m) => [m.id, m.timeIn, m.timeOut, m.kind]),
    songOffset: seq.songOffset,
  });
}

function assetDuration(asset: ProjectAsset): number | null {
  const meta = (asset.metadata_json ?? {}) as Record<string, unknown>;
  const d = meta.duration_seconds;
  return typeof d === "number" && d > 0 ? d : null;
}

export function EditorWorkspace({ projectId, sequence: initial, onSequenceId, onDirtyChange }: Props) {
  const [history, setHistory] = useState<EditHistory>(() => historyOf(initial));
  const sequence = history.present;
  const [baselineFp, setBaselineFp] = useState(() => editFingerprint(initial));
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
  const syncsQ = useTakeSyncs(projectId);
  const saveMut = useSaveEditSequence(projectId);
  const latestRender = useLatestEditRender(sequence.id);
  const dirty = editFingerprint(sequence) !== baselineFp;

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
    setBaselineFp(editFingerprint(initial));
    setPlayhead(0);
    setPlaying(false);
    setSelectedId(null);
    setSaveState("idle");
    setSlipBaselines({});
    setLoop(null);
    setCompareOriginal(false);
  }, [initial.id]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Each picture clip's performance label, read from its asset lineage. Only `mouth` differs from `sequence`:
  // timing, selection and approvals are the edit's own. Until the lineage loads, the stored label shows.
  const provQ = useSequenceProvenance(sequence);
  const labelled = useMemo(
    () =>
      provQ.data
        ? applyPerformanceProvenance(sequence, provQ.data.assets, provQ.data.jobs)
        : { sequence, byClip: {} as ReturnType<typeof applyPerformanceProvenance>["byClip"] },
    [sequence, provQ.data],
  );
  const view = labelled.sequence;
  const selected = sequence.clips.find((c) => c.id === selectedId) ?? null;
  const selectedView = view.clips.find((c) => c.id === selectedId) ?? null;
  const activeClip = selected ?? sequence.clips.find((c) => playhead >= c.timelineIn && playhead < c.timelineOut) ?? null;
  const warnings = useMemo(() => mediaWarnings(view), [view]);
  const dur = durationSeconds(sequence);
  const phraseMarker = useMemo(
    () => phraseAtPlayhead({ sequence, playhead, selectedClip: selected }),
    [sequence, playhead, selected],
  );

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
  }, [sequence.fps, history, view]);

  async function save() {
    setSaveState("saving");
    setSaveError(null);
    try {
      const id = await saveMut.mutateAsync(view);
      onSequenceId?.(id);
      const next = { ...sequence, version: sequence.version + 1 };
      setHistory(historyOf(next));
      setBaselineFp(editFingerprint(next));
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
      // labelled from the asset's history by applyPerformanceProvenance; never assumed
      mouth: "unknown" as const,
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

  const compareResolve = useMemo(() => {
    if (!compareOriginal) return null;
    return resolveCompareOriginal({
      sequence,
      clip: activeClip,
      playhead,
      assets: assetsQ.data ?? [],
      syncs: syncsQ.data ?? [],
    });
  }, [compareOriginal, sequence, activeClip, playhead, assetsQ.data, syncsQ.data]);

  // Sign the resolved original when Compare is on.
  useEffect(() => {
    if (!compareResolve?.ok) return;
    const asset = (assetsQ.data ?? []).find((a) => a.id === compareResolve.originalAssetId);
    if (asset) void ensureAssetUrl(asset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareResolve?.ok, compareResolve && compareResolve.ok ? compareResolve.originalAssetId : null]);

  const compareUrl =
    compareResolve?.ok && mediaByAsset[compareResolve.originalAssetId]
      ? mediaByAsset[compareResolve.originalAssetId]!
      : null;
  const compareSourceTime = compareResolve?.ok ? compareResolve.sourceTime : null;
  const compareNote =
    compareOriginal && compareResolve && !compareResolve.ok
      ? compareResolve.reason
      : compareOriginal && compareResolve?.ok && !compareUrl
        ? "Loading the original take…"
        : null;

  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="editor-workspace">
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/90">
          {warnings.slice(0, 6).map((w) => (
            <li key={`${w.clipId}-${w.message}`}>{w.message}</li>
          ))}
        </ul>
      )}

      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {/* Dominant monitor first — CapCut / VideoLeap order */}
          <div className="studio-card overflow-hidden rounded-2xl border border-border p-2 sm:p-3">
            <SequencePreview
              sequence={sequence}
              playhead={playhead}
              playing={playing}
              playbackRate={rate}
              mediaByAsset={mediaByAsset}
              songUrl={songUrl}
              compareUrl={compareUrl}
              compareSourceTime={compareSourceTime}
              compareLabel="Original performance"
              compareNote={compareNote}
            />
          </div>

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

          {/* Transport — grouped, primary actions gold */}
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
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
                {rate === 1 ? "½ speed" : "Normal"}
              </Button>
              <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" aria-hidden />
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedId}
                onClick={() => selectedId && onGesture({ kind: "split", clipId: selectedId, atTimelineSeconds: playhead })}
              >
                Split
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedId}
                onClick={() => selectedId && onGesture({ kind: "remove", clipId: selectedId, ripple: false })}
              >
                Remove
              </Button>
              <Button size="sm" variant="outline" disabled={!canUndo(history)} onClick={() => setHistory(undoEdit)}>
                Undo
              </Button>
              <Button size="sm" variant="outline" disabled={!canRedo(history)} onClick={() => setHistory(redoEdit)}>
                Redo
              </Button>
              <span className="mx-0.5 hidden h-5 w-px bg-border sm:block" aria-hidden />
              <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(24, z / 1.25))}>
                Zoom −
              </Button>
              <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(200, z * 1.25))}>
                Zoom +
              </Button>
              <Button
                size="sm"
                variant={loop ? "default" : "outline"}
                disabled={!phraseMarker}
                title={
                  phraseMarker
                    ? `Loop “${phraseMarker.name}” with pre-roll`
                    : "No lyric/lipsync marker at the playhead or selected clip"
                }
                onClick={() => {
                  if (loop) {
                    setLoop(null);
                    return;
                  }
                  if (!phraseMarker) return;
                  const win = loopWindowForPhrase(phraseMarker, dur, 0.35);
                  setLoop(win);
                  setPlayhead(win.start);
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
                Compare
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
              <span
                className={cn(
                  "text-xs",
                  saveState === "error" ? "text-destructive" : "text-muted-foreground",
                )}
                data-testid="save-status"
              >
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && "Saved to the server"}
                {saveState === "error" && (saveError || "Save failed")}
                {saveState === "idle" && dirty && "Unsaved edits — Save to keep them on the server"}
                {saveState === "idle" && !dirty && "All edits saved"}
              </span>
              <div className="flex-1" />
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
                Download cut
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void (async () => {
                    setExportNote("Planning export…");
                    try {
                      await saveMut.mutateAsync(view);
                      const dry = await requestEditRender({ sequenceId: sequence.id, dryRun: true });
                      const queued = await requestEditRender({ sequenceId: sequence.id, dryRun: false });
                      setExportNote(
                        [
                          dry.media
                            ? `Found ${dry.media.resolved} picture file(s)${dry.media.missing?.length ? `; missing: ${dry.media.missing.join(", ")}` : ""}`
                            : "Plan ready",
                          queued.renderId
                            ? `Queued preview (free). The render worker encodes it; the MP4 appears below when ready.`
                            : queued.note || "Queued.",
                        ].join(" · "),
                      );
                      void latestRender.refetch();
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
            <RenderStatus row={latestRender.data?.row ?? null} url={latestRender.data?.url ?? null} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-[#101417] p-2">
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
            <TimelineCanvas
              sequence={view}
              playhead={playhead}
              selectedId={selectedId}
              pxPerSecond={zoom}
              mediaByAsset={mediaByAsset}
              onSelect={setSelectedId}
              onSeek={(t) => {
                setPlayhead(t);
                setPlaying(false);
              }}
              onGesture={onGesture}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <SyncPanel
            sequence={view}
            clip={selectedView}
            provenance={selectedId ? labelled.byClip[selectedId] ?? null : null}
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
          <div className="min-h-[280px] flex-1">
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
