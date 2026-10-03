import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Timer, Upload } from "lucide-react";
import { toast } from "sonner";
import { mediaRefKey, signRefs, type MediaRef } from "@/components/storyboard/signedUrls";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NothingMatchedError } from "@/lib/lyrics/align";
import { runLyricTiming, saveLyricTiming, type TimingRun } from "@/lib/lyrics/api";
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import { compareWithSaved, estimateTimingUsd } from "@/lib/lyrics/timing";
import { lyricLinesKeys } from "@/lib/queries/lyricLines";
import { useUpdateProject } from "@/lib/queries/projects";
import { NoAudioError, TooLargeError } from "@/lib/storyboard/syncAudio";
import { parseLrc } from "@/lib/storyboard/setup";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const LRC_TAG = /^\s*\[\d+:\d+(?:\.\d+)?\]/m;

type Progress = { stage: "reading" | "listening" | "aligning"; done: number; total: number };

/**
 * The lyrics, and where each line falls on the song.
 *
 * Paste (or import) the plain lyrics; "Time the lyrics to the song" hears the song and places every line on the song
 * clock. The timing is shown before it is saved, and when the project already has timed lines it is shown against
 * them and replaces them only on a second, explicit press — a timing that is already right is never recomputed or
 * overwritten by accident. Timed lyrics pasted as LRC remain as the manual way in.
 */
export function LyricsBlock({
  projectId,
  lyrics,
  savedLines,
  song,
  songSeconds,
  bpm,
}: {
  projectId: string;
  lyrics: string;
  savedLines: readonly LyricLine[];
  song: MediaRef | null;
  songSeconds: number | null;
  bpm: number | null;
}) {
  const qc = useQueryClient();
  const update = useUpdateProject();
  const [text, setText] = useState<string | null>(null);
  const [lrc, setLrc] = useState("");
  const [openLrc, setOpenLrc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [run, setRun] = useState<TimingRun | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stop = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const value = text ?? lyrics;
  const timedLines = savedLines.length;
  const parsed = useMemo(() => (lrc.trim() ? parseLrc(lrc, songSeconds) : null), [lrc, songSeconds]);
  const comparison = useMemo(() => (run && timedLines > 0 ? compareWithSaved(run.lines, savedLines) : null), [run, savedLines, timedLines]);
  const estimate = songSeconds ? estimateTimingUsd(songSeconds) : null;

  const saveText = async (next: string) => {
    if (next === lyrics) return;
    await update.mutateAsync({ id: projectId, patch: { lyrics: next } });
    setText(null);
  };

  const importFile = async (file: File) => {
    try {
      const content = await file.text();
      if (LRC_TAG.test(content)) {
        setLrc(content);
        setOpenLrc(true);
        toast.info("That file has times in it — check it below, then place the lines on the song");
        return;
      }
      await saveText(content.replace(/\r\n?/g, "\n").trim());
      toast.success("Lyrics imported");
    } catch (e) {
      toast.error(message(e));
    }
  };

  const importLrc = async () => {
    if (!parsed || parsed.lines.length === 0) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not signed in");
      const rows = parsed.lines.map((l) => ({
        user_id: data.user!.id,
        project_id: projectId,
        line_index: l.lineIndex,
        section: l.section,
        text: l.text,
        start_seconds: l.start,
        end_seconds: l.end,
        confidence: 1,
        words_json: [],
        source: "lrc",
      }));
      const { error } = await supabase.from("lyric_lines").insert(rows);
      if (error) throw new Error(error.message);
      if (!lyrics.trim()) await update.mutateAsync({ id: projectId, patch: { lyrics: parsed.lines.map((l) => l.text).join("\n") } });
      await qc.invalidateQueries({ queryKey: lyricLinesKeys.forProject(projectId) });
      setLrc("");
      setOpenLrc(false);
      toast.success(`${rows.length} lines placed on the song`);
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  };

  const align = async () => {
    if (!song) return void toast.info("Upload the song first");
    if (!value.trim()) return void toast.info("Paste the lyrics first");
    setBusy(true);
    setRun(null);
    setNote(null);
    setConfirmReplace(false);
    stop.current = new AbortController();
    try {
      if (text !== null) await saveText(text);
      const signed = await signRefs([song]);
      const songUrl = signed[mediaRefKey(song)];
      if (!songUrl) throw new Error("The song could not be opened");
      const result = await runLyricTiming({ projectId, songUrl, lyrics: value, bpm, onProgress: setProgress, signal: stop.current.signal });
      setRun(result);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setNote("Stopped. Nothing was changed.");
      else if (e instanceof NothingMatchedError) setNote(e.message);
      else if (e instanceof NoAudioError || e instanceof TooLargeError) setNote(`${e.message}. Paste timed lyrics instead.`);
      else setNote(message(e));
    } finally {
      setBusy(false);
      setProgress(null);
      stop.current = null;
    }
  };

  const save = async () => {
    if (!run) return;
    if (timedLines > 0 && !confirmReplace) return setConfirmReplace(true);
    setBusy(true);
    try {
      const source = `align_${run.provider ?? "hosted"}${run.model ? `_${run.model}` : ""}`;
      const n = await saveLyricTiming(projectId, run.lines, source);
      await qc.invalidateQueries({ queryKey: lyricLinesKeys.forProject(projectId) });
      setRun(null);
      setConfirmReplace(false);
      toast.success(`${n} lines placed on the song`);
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  };

  const progressText = !progress
    ? null
    : progress.stage === "reading"
      ? "Reading the song…"
      : progress.stage === "listening"
        ? `Listening to the song — part ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
        : "Placing the lines…";

  return (
    <div className="space-y-2" data-testid="setup-lyrics">
      <div className="flex items-end justify-between gap-2">
        <label className="block flex-1 text-xs text-foreground/60" htmlFor="setup-lyrics-text">
          Lyrics
        </label>
        <button type="button" className="flex items-center gap-1 text-[11px] text-foreground/50 underline" onClick={() => fileInput.current?.click()} data-testid="setup-lyrics-import">
          <Upload className="h-3 w-3" /> Import a text file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.lrc,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importFile(f);
          }}
          data-testid="setup-lyrics-file"
        />
      </div>
      <Textarea
        id="setup-lyrics-text"
        className="text-sm"
        rows={5}
        value={value}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== null && void saveText(text).catch((e) => toast.error(message(e)))}
        placeholder="Paste the lyrics, a blank line between sections. Leave empty for an instrumental."
        data-testid="setup-lyrics-text"
      />

      {timedLines > 0 && (
        <p className="text-[11px] text-emerald-300/90" data-testid="setup-lyrics-timed">
          {timedLines} lines are placed on the song — every shot shows the words sung inside it.
        </p>
      )}

      {value.trim() && (
        <div className={cn("space-y-2 rounded-lg border p-3 text-[11px]", timedLines > 0 ? "border-border/60 text-foreground/60" : "border-amber-500/30 bg-amber-500/5 text-amber-100/90")} data-testid={timedLines > 0 ? "setup-lyrics-retime" : "setup-lyrics-untimed"}>
          {timedLines === 0 && <p>The lyrics are not placed on the song yet. The song is listened to and every line is put where it is sung.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={timedLines > 0 ? "outline" : "default"} disabled={busy || !song} onClick={() => void align()} data-testid="setup-lyrics-align">
              {busy && progress ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Timer className="mr-1.5 h-3.5 w-3.5" />}
              {timedLines > 0 ? "Time them again" : "Time the lyrics to the song"}
              {estimate !== null && estimate > 0 ? ` · about $${estimate.toFixed(2)}` : ""}
            </Button>
            {busy && progress && (
              <>
                <span data-testid="setup-lyrics-progress">{progressText}</span>
                <button type="button" className="underline" onClick={() => stop.current?.abort()} data-testid="setup-lyrics-stop">
                  Stop
                </button>
              </>
            )}
            {!song && <span>Upload the song first.</span>}
            {timedLines > 0 && !busy && !run && <span>The saved timing stays as it is unless you replace it.</span>}
          </div>
          {note && (
            <p className="text-amber-200" data-testid="setup-lyrics-note">
              {note}
            </p>
          )}

          {run && (
            <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-2 text-foreground/80" data-testid="setup-lyrics-preview">
              <p data-testid="setup-lyrics-summary">
                {run.lines.length} lines placed · {Math.round(run.coverage * 100)}% of the words heard directly
                {run.suspect > 0 ? ` · ${run.suspect} line${run.suspect === 1 ? "" : "s"} not found in the song (written but not sung, or over an instrumental)` : ""}
                {run.lowConfidence - run.suspect > 0 ? ` · ${run.lowConfidence - run.suspect} to check` : ""}
              </p>
              {comparison && (
                <p className={comparison.beyond1s > 0 ? "text-amber-200" : "text-emerald-300/90"} data-testid="setup-lyrics-compare">
                  Against the timing already saved: {comparison.compared} lines compared, half of them within {comparison.medianSeconds.toFixed(2)} s, {comparison.beyond1s} more than a second apart.
                </p>
              )}
              <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-1 font-mono text-[10px] leading-relaxed" data-testid="setup-lyrics-lines">
                {run.lines.map((l) => (
                  <li key={l.line_index} className={cn("flex gap-2", l.suspect ? "text-amber-200/80" : l.confidence < 0.5 ? "text-amber-100/80" : "text-foreground/70")} data-testid="setup-lyrics-line" data-suspect={l.suspect ? "true" : "false"}>
                    <span className="w-24 shrink-0 tabular-nums">
                      {clock(l.start)}–{clock(l.end)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-sans">{l.text}</span>
                    {l.suspect ? <span className="shrink-0 font-sans">not found</span> : l.confidence < 0.5 ? <span className="shrink-0 font-sans">check</span> : null}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy} onClick={() => void save()} data-testid="setup-lyrics-save">
                  {busy && !progress && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {timedLines > 0 ? (confirmReplace ? `Yes, replace the ${timedLines} saved lines` : "Replace the saved timing with this") : "Save this timing"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setRun(null);
                    setConfirmReplace(false);
                  }}
                  data-testid="setup-lyrics-discard"
                >
                  {timedLines > 0 ? "Keep the saved timing" : "Discard"}
                </Button>
              </div>
            </div>
          )}

          {timedLines === 0 && (
            <>
              <button type="button" className="underline" onClick={() => setOpenLrc((v) => !v)} data-testid="setup-lrc-toggle">
                {openLrc ? "Hide" : "Advanced: paste timed lyrics (LRC) instead"}
              </button>
              {openLrc && (
                <div className="space-y-2">
                  <Textarea rows={5} value={lrc} onChange={(e) => setLrc(e.target.value)} placeholder={"[00:12.50] first line\n[00:15.80] second line"} className="font-mono text-xs" data-testid="setup-lrc-text" />
                  {parsed && (
                    <p>
                      {parsed.lines.length} line{parsed.lines.length === 1 ? "" : "s"} read{parsed.skipped.length ? `, ${parsed.skipped.length} row${parsed.skipped.length === 1 ? "" : "s"} without a time skipped` : ""}.
                    </p>
                  )}
                  <Button size="sm" variant="outline" disabled={busy || !parsed || parsed.lines.length === 0} onClick={() => void importLrc()} data-testid="setup-lrc-import">
                    Place these lines on the song
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
