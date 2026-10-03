import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Check, Download, Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatTimecode } from "@/components/treatment/shotLabels";
import type { Assignment, MediaAsset, TakeSync, TimelineSegment } from "@/lib/storyboard/media";
import { runReviewCheck, type PlayerHandle, type ReviewCheckReport } from "@/lib/storyboard/reviewCheck";
import { cn } from "@/lib/utils";
import { mediaRefKey, playbackRef, signRefs, type MediaRef } from "./signedUrls";

/** The player on the page, read from its own elements. */
function playerOnPage(): PlayerHandle | null {
  const root = document.querySelector('[data-testid="sequence-player"]');
  if (!root) return null;
  const videos = new Map<string, HTMLVideoElement>();
  for (const el of root.querySelectorAll<HTMLVideoElement>("video[data-asset-id]")) videos.set(el.dataset.assetId ?? "", el);
  return { audio: root.querySelector<HTMLAudioElement>('audio[data-testid="sequence-audio"]'), videos };
}

const Mark = ({ state }: { state: "ok" | "bad" | "skipped" }) => (
  <span
    className={cn(
      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
      state === "ok" ? "bg-emerald-500/20 text-emerald-300" : state === "bad" ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-foreground/50",
    )}
  >
    {state === "ok" ? <Check className="h-3 w-3" /> : state === "bad" ? <AlertTriangle className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
  </span>
);

const mb = (bytes: number | null) => (bytes === null ? "" : bytes > 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Review → "Check this cut". Proves, on the project's real files, everything about the cut that does not need eyes:
 * the files open and decode, each shot plays its own selected file from the right place, the take stays on the
 * song's clock across every cut. It reads; it changes nothing.
 */
export function CutCheck({
  timeline,
  boxes,
  assignments,
  assets,
  syncs,
  song,
}: {
  timeline: readonly TimelineSegment[];
  boxes: readonly { id: string; key: string; start: number; end: number }[];
  assignments: readonly Assignment[];
  assets: ReadonlyMap<string, MediaAsset>;
  syncs: readonly TakeSync[];
  song: { ref: MediaRef; name: string; analysisSeconds: number | null } | null;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<ReviewCheckReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const r = await runReviewCheck({
        timeline,
        boxes,
        assignments,
        assets,
        syncs,
        song,
        playbackRef,
        refKey: mediaRefKey,
        sign: (refs) => signRefs(refs),
        onProgress: setProgress,
        player: playerOnPage(),
      });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check could not be run.");
    } finally {
      busy.current = false;
      setRunning(false);
      setProgress("");
    }
  }, [timeline, boxes, assignments, assets, syncs, song]);

  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cut-check-${report.at.slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const rows: { id: string; state: "ok" | "bad" | "skipped"; label: string; detail: string; failures: string[] }[] = [];
  if (report) {
    if (report.song) {
      const s = report.song;
      rows.push({
        id: "song",
        state: s.ok ? "ok" : "bad",
        label: "The song opens and is the length the cut was built on",
        detail: [s.seconds !== null ? `${s.seconds.toFixed(2)} s` : null, s.sampleRate ? `${s.sampleRate} Hz` : null, mb(s.totalBytes) || null, s.decodes === true ? "decodes" : null].filter(Boolean).join(" · "),
        failures: s.ok || !s.note ? [] : [s.note],
      });
    }
    const bad = report.files.filter((f) => !f.ok);
    const frames = report.files.reduce((n, f) => n + f.decoded.length, 0);
    rows.push({
      id: "files",
      state: bad.length ? "bad" : "ok",
      label: "Every file the cut plays opens and decodes",
      detail: `${report.files.length - bad.length} of ${report.files.length} files · ${frames} frame${frames === 1 ? "" : "s"} decoded where the cut enters them`,
      failures: bad.map((f) => `${f.name}: ${f.note ?? "could not be read"}`),
    });
    for (const c of report.cut.checks) rows.push({ id: c.id, state: c.ok ? "ok" : "bad", label: c.label, detail: c.detail, failures: c.failures });
    rows.push({ id: report.player.id, state: report.player.ok ? "ok" : "bad", label: report.player.label, detail: report.player.detail, failures: report.player.failures });
    rows.push(
      report.live.ran
        ? {
            id: "live",
            state: report.live.ok ? "ok" : "bad",
            label: "The player itself, put at moments across the song, shows each shot's video at the right place",
            detail: `${report.live.samples.filter((s) => s.ok).length} of ${report.live.samples.length} moments`,
            failures: report.live.samples.filter((s) => !s.ok).map((s) => `${formatTimecode(s.songTime)} (${s.key}): ${s.note ?? "not where the song puts it"}`).slice(0, 6),
          }
        : { id: "live", state: "skipped", label: "The player itself, put at moments across the song", detail: `not run — ${report.live.reason ?? ""}`, failures: [] },
    );
  }

  return (
    <Card className="space-y-3 p-4" data-testid="review-verify-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Check this cut</h2>
          <p className="mt-1 text-xs text-foreground/55">Opens every file the cut plays, decodes it where each shot enters it, and runs the whole song through the player's own rules. It reads only; nothing is changed.</p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 text-[11px]" onClick={() => void run()} disabled={running || timeline.length === 0} data-testid="review-verify">
          {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {running ? "Checking…" : report ? "Check again" : "Check this cut"}
        </Button>
      </div>

      {running && (
        <p className="text-[11px] text-foreground/55" data-testid="review-verify-progress">
          {progress}
        </p>
      )}
      {error && (
        <p className="text-xs text-amber-300" data-testid="review-verify-error">
          {error}
        </p>
      )}

      {report && (
        <div className="space-y-3" data-testid="review-verify-result" data-ok={report.ok ? "true" : "false"} data-window={report.window}>
          <p className={cn("text-xs font-medium", report.ok ? "text-emerald-300" : "text-amber-300")} data-testid="review-verify-summary">
            {report.ok ? "Everything that can be checked without watching it holds." : "Something does not hold — see below."}{" "}
            <span className="font-normal text-foreground/45">
              {report.cut.cuts.length} shots · {report.cut.samples} moments of the song stepped through
            </span>
          </p>

          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.id} className="flex items-start gap-2 text-xs" data-testid="review-verify-check" data-id={r.id} data-ok={r.state === "ok" ? "true" : r.state === "bad" ? "false" : "skipped"}>
                <Mark state={r.state} />
                <span className="min-w-0">
                  <span className="text-foreground/85">{r.label}</span> <span className="text-foreground/45">— {r.detail}</span>
                  {r.failures.map((f) => (
                    <span key={f} className="block text-amber-300/90">
                      {f}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>

          <details className="text-xs" data-testid="review-verify-files">
            <summary className="cursor-pointer text-foreground/60">The files ({report.files.length})</summary>
            <ul className="mt-2 space-y-1">
              {report.files.map((f) => (
                <li key={f.assetId} className="flex flex-wrap gap-x-2 text-[11px] text-foreground/60" data-testid="review-verify-file" data-asset-id={f.assetId} data-ok={f.ok ? "true" : "false"} data-use={f.use}>
                  <span className={cn("font-medium", f.ok ? "text-foreground/80" : "text-amber-300")}>{f.name}</span>
                  <span>{f.use}</span>
                  <span>
                    {f.shots} shot{f.shots === 1 ? "" : "s"}
                  </span>
                  {f.width && f.height ? (
                    <span>
                      {f.width}×{f.height}
                    </span>
                  ) : null}
                  {f.codec ? <span>{f.codec}</span> : f.container !== "unknown" ? <span>{f.container}</span> : null}
                  {f.seconds !== null ? <span>{f.seconds.toFixed(2)} s</span> : null}
                  {f.bytes !== null ? <span>{mb(f.bytes)}</span> : null}
                  {f.decoded.length ? (
                    <span>
                      {f.decoded.filter((d) => d.ok).length}/{f.decoded.length} frames
                    </span>
                  ) : null}
                  {f.note ? <span className={f.ok ? "text-foreground/40" : "text-amber-300/90"}>{f.note}</span> : null}
                </li>
              ))}
            </ul>
          </details>

          <details className="text-xs" data-testid="review-verify-cuts">
            <summary className="cursor-pointer text-foreground/60">The cut, shot by shot ({report.cut.cuts.length})</summary>
            <div className="mt-2 max-h-72 overflow-auto">
              <table className="w-full text-left text-[11px] text-foreground/60">
                <thead className="text-foreground/40">
                  <tr>
                    <th className="pr-2 font-normal">Shot</th>
                    <th className="pr-2 font-normal">Song</th>
                    <th className="pr-2 font-normal">Shows</th>
                    <th className="pr-2 font-normal">From the file at</th>
                    <th className="font-normal">Holds</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cut.cuts.map((c) => (
                    <tr key={c.key} data-testid="review-verify-cut" data-box-key={c.key} data-shows={c.shows}>
                      <td className="pr-2 font-mono">{String(c.index).padStart(2, "0")}</td>
                      <td className="pr-2 font-mono">
                        {formatTimecode(c.songIn)}–{formatTimecode(c.songOut)}
                      </td>
                      <td className="pr-2">{c.shows}</td>
                      <td className="pr-2 font-mono">{c.sourceIn === null ? "" : `${c.sourceIn.toFixed(2)}–${(c.sourceOut ?? c.sourceIn).toFixed(2)} s`}</td>
                      <td>{[c.holdsFirstFrame > 0.05 ? `first frame ${c.holdsFirstFrame.toFixed(1)} s` : null, c.holdsLastFrame > 0.05 ? `last frame ${c.holdsLastFrame.toFixed(1)} s` : null].filter(Boolean).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="text-[11px] leading-relaxed text-foreground/45" data-testid="review-verify-not-checked">
            Not checked here: {report.notChecked.join("; ")}.
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" className="text-[11px]" onClick={download} data-testid="review-verify-download">
              <Download className="mr-1.5 h-3.5 w-3.5" /> Save the full report
            </Button>
          </div>
          <details className="text-[10px] text-foreground/40">
            <summary className="cursor-pointer">The full report as text</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all" data-testid="review-verify-json">
              {JSON.stringify(report)}
            </pre>
          </details>
        </div>
      )}
    </Card>
  );
}
