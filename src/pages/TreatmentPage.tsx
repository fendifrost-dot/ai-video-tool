import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Loader2, Pencil, RefreshCw, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmHost } from "@/components/storyboard/ConfirmHost";
import type { ConfirmRequest } from "@/components/storyboard/useStoryboardController";
import { projectsKeys, useUpdateProject } from "@/lib/queries/projects";
import { storyboardKeys, useAssignments, useProjectMedia, useStoryboardBoxes, useTakeSyncs } from "@/lib/queries/storyboard";
import { useTreatmentInputs } from "@/lib/queries/treatmentInputs";
import { unlockedForGeneration } from "@/lib/storyboard/boxes";
import { deleteTreatment, saveTreatment, writeStoryboardFromTreatment } from "@/lib/storyboard/build";
import { isOriginalTake, isUsableSync } from "@/lib/storyboard/media";
import { footageSummary, setupStatus } from "@/lib/storyboard/setup";
import { directorNotes, hasTreatment, parseTreatmentDoc, storyboardIsStale, type TreatmentDoc } from "@/lib/treatment/treatmentDoc";
import { cn } from "@/lib/utils";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Treatment — the ONE creative brief of the video. The AI writes it from the lyrics, the project and the real
 * footage, or the director writes it himself; either way it is one text, always editable, and the storyboard's shots
 * are written from it. Nothing else on this page directs the video.
 */
export default function TreatmentPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const inputs = useTreatmentInputs(projectId);
  const { project, analysis, lyricLines } = inputs;
  const boxesData = useStoryboardBoxes(projectId).data;
  const assignmentsData = useAssignments(projectId).data;
  const syncsData = useTakeSyncs(projectId).data;
  const boxes = useMemo(() => boxesData ?? [], [boxesData]);
  const assignments = useMemo(() => assignmentsData ?? [], [assignmentsData]);
  const syncs = useMemo(() => syncsData ?? [], [syncsData]);
  const media = useProjectMedia(projectId);
  const updateProject = useUpdateProject();

  const doc = useMemo(() => parseTreatmentDoc(project?.treatment_json), [project?.treatment_json]);
  const exists = hasTreatment(doc);

  const [tab, setTab] = useState<"ai" | "manual">("ai");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [visual, setVisual] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const moodValue = mood ?? project?.mood ?? "";
  const visualValue = visual ?? project?.visual_style ?? "";
  // one notes text: an older project's notes column and the treatment's notes are read together and saved as one
  const storedNotes = directorNotes(project?.notes, doc.notes);
  const notesValue = notes ?? storedNotes;

  useEffect(() => {
    if (!editing) setDraft(doc.text);
  }, [doc.text, editing]);

  const setup = useMemo(
    () =>
      setupStatus({
        hasSong: !!media.song,
        songSeconds: analysis?.duration_seconds ?? null,
        analysed: !!analysis,
        bpm: analysis?.bpm ?? null,
        lyricsText: project?.lyrics,
        lyricLines: lyricLines?.length ?? 0,
        media: media.list,
        syncs,
        footageConfirmedAt: doc.footageConfirmedAt,
      }),
    [media.song, media.list, analysis, project?.lyrics, lyricLines, syncs, doc.footageConfirmedAt],
  );

  /** What the writer is told about the real footage — facts, not direction. */
  const footageNote = useMemo(() => {
    const takes = media.list
      .filter(isOriginalTake)
      .map((m) => ({ m, sync: syncs.find((s) => s.performanceAssetId === m.id && isUsableSync(s)) }))
      .filter((x) => x.sync)
      .map(({ m, sync }) => ({ name: m.name, songStart: Math.max(0, sync!.offsetSeconds), songEnd: sync!.offsetSeconds + (m.durationSeconds ?? 0), shows: m.shows, filmedIn: m.filmedIn }));
    const broll = media.list.filter((m) => m.footageRole === "b_roll").map((m) => ({ name: m.name, seconds: m.durationSeconds, shows: m.shows }));
    return footageSummary({ takes, broll });
  }, [media.list, syncs]);

  const withMedia = useMemo(() => new Set(assignments.map((a) => a.shotId)), [assignments]);
  const open = useMemo(() => unlockedForGeneration(boxes, withMedia).length, [boxes, withMedia]);
  const kept = boxes.length - open;
  const stale = storyboardIsStale(doc);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: projectsKeys.detail(projectId) }),
      qc.invalidateQueries({ queryKey: storyboardKeys.boxes(projectId) }),
    ]);
  };

  const saveField = async (patch: { mood?: string; visual_style?: string }) => {
    try {
      await updateProject.mutateAsync({ id: projectId, patch });
    } catch (e) {
      toast.error(message(e));
    }
  };

  /** Save the notes field as the project's one notes text (and empty the older second copy). */
  const saveNotes = async () => {
    if (notes === null || notes === storedNotes || !project) return;
    try {
      await updateProject.mutateAsync({ id: projectId, patch: { notes: notes.trim() || null } });
      if (doc.notes) await saveTreatment(projectId, project.treatment_json, { ...doc, notes: "" });
      await refresh();
      setNotes(null);
    } catch (e) {
      toast.error(message(e));
    }
  };

  const saveText = async (text: string, mode: TreatmentDoc["mode"]) => {
    if (!project) return;
    setWorking("Saving…");
    try {
      await saveNotes();
      await saveTreatment(projectId, project.treatment_json, { ...doc, text, mode, updatedAt: new Date().toISOString(), model: mode === "manual" ? null : doc.model, notes: "" });
      await refresh();
      setEditing(false);
      toast.success("Treatment saved");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setWorking(null);
    }
  };

  /** One model call: the treatment text (when the AI writes it) and the scene of every shot it may write. */
  const write = async (aiWritesText: boolean) => {
    if (!project) return;
    setWorking(aiWritesText ? "Writing the treatment and the shots — this takes a minute or two…" : "Writing the shots from the treatment — this takes a minute or two…");
    try {
      await saveNotes();
      const res = await writeStoryboardFromTreatment({
        projectId,
        context: inputs.treatmentContext(notesValue, footageNote),
        treatmentText: aiWritesText ? "" : doc.text,
        aiWritesText,
        treatmentJson: project.treatment_json,
        boxes,
        assignments,
        analysis,
        lyricLines,
        // the notes live on the project; nothing is kept a second time with the treatment
        notes: "",
      });
      await refresh();
      setEditing(false);
      toast.success(`${aiWritesText ? "Treatment written" : "Shots written"} — ${res.written} shot${res.written === 1 ? "" : "s"} written${res.kept ? `, ${res.kept} of yours kept` : ""}`);
    } catch (e) {
      toast.error(message(e));
    } finally {
      setWorking(null);
    }
  };

  const askWrite = (aiWritesText: boolean) => {
    if (!setup.ready) {
      toast.info(`Setup is not finished — ${setup.blockedBy}`);
      return;
    }
    const effect =
      boxes.length === 0
        ? "The storyboard's shots are cut on the beat and written from it."
        : `${open} of the ${boxes.length} shots are rewritten. ${kept} ${kept === 1 ? "is" : "are"} yours (edited, locked or holding footage) and ${kept === 1 ? "stays" : "stay"} exactly as ${kept === 1 ? "it is" : "they are"}.`;
    setConfirm({
      title: aiWritesText ? (exists ? "Write a new treatment?" : "Let the AI write the treatment?") : "Write the shots from this treatment?",
      body: (aiWritesText ? (exists ? "The current treatment text is replaced by a new one. " : "The AI writes the treatment from the lyrics, the project and your footage. ") : "The treatment text is kept word for word. ") + effect,
      confirmLabel: aiWritesText ? "Generate treatment" : "Write the shots",
      testId: aiWritesText ? "confirm-generate-treatment" : "confirm-write-shots",
      onConfirm: () => write(aiWritesText),
    });
  };

  const askDelete = () =>
    setConfirm({
      title: "Delete the treatment?",
      body: "The treatment text is deleted. The storyboard's shots, the footage on them and your edits stay exactly as they are.",
      confirmLabel: "Delete treatment",
      testId: "confirm-delete-treatment",
      onConfirm: async () => {
        if (!project) return;
        try {
          await deleteTreatment(projectId, project.treatment_json);
          await refresh();
          setEditing(false);
          toast.success("Treatment deleted");
        } catch (e) {
          toast.error(message(e));
        }
      },
    });

  if (inputs.projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Treatment" variant="compact" />
        <div className="px-4 py-6 md:px-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </>
    );
  }

  const busy = !!working;

  return (
    <>
      <PageHeader title="Treatment" subtitle="One treatment for the video. Let the AI write it, or write it yourself — the shots are written from it." variant="compact" />
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-4 md:px-8 md:py-6" data-testid="treatment-page">
        {!setup.ready && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200" data-testid="treatment-gate">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">Setup comes first — {setup.blockedBy}. You can write the treatment now; generating waits for Setup.</span>
            <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
              <Link to="/projects/$id/setup" params={{ id: projectId }}>
                Go to Setup
              </Link>
            </Button>
          </div>
        )}

        {/* ---- What the writer is told --------------------------------------- */}
        <Card className="space-y-3 p-4 md:p-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Project context</h2>
          <label className="block text-xs text-foreground/60">
            Mood / style
            <Input
              className="mt-1"
              value={moodValue}
              onChange={(e) => setMood(e.target.value)}
              onBlur={() => mood !== null && mood !== (project?.mood ?? "") && void saveField({ mood })}
              placeholder="e.g. cinematic, luxury, moody, night city"
              data-testid="treatment-mood"
            />
          </label>
          <label className="block text-xs text-foreground/60">
            Visual direction
            <Textarea
              className="mt-1 text-sm"
              rows={2}
              value={visualValue}
              onChange={(e) => setVisual(e.target.value)}
              onBlur={() => visual !== null && visual !== (project?.visual_style ?? "") && void saveField({ visual_style: visual })}
              placeholder="The world the video lives in: places, light, texture"
              data-testid="treatment-visual"
            />
          </label>
          <label className="block text-xs text-foreground/60">
            Additional notes (optional)
            <Textarea
              className="mt-1 text-sm"
              rows={2}
              value={notesValue}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => void saveNotes()}
              placeholder="Constraints and must-haves: locations, colour palette, things to avoid"
              data-testid="treatment-notes"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-foreground/45" data-testid="treatment-facts">
            Also given to the writer: the lyrics{setup.counts.lyricLines ? ` (${setup.counts.lyricLines} lines timed to the song)` : ""}
            {analysis?.bpm ? `, the song's beat (${Math.round(analysis.bpm)} BPM)` : ""}
            {setup.counts.takes ? `, ${setup.counts.takesSynced} performance take${setup.counts.takesSynced === 1 ? "" : "s"} in sync` : ""}
            {setup.counts.broll ? `, ${setup.counts.broll} of your B-roll clip${setup.counts.broll === 1 ? "" : "s"}` : ""}
            {inputs.looks.length ? `, ${inputs.looks.length} look${inputs.looks.length === 1 ? "" : "s"}` : ""}.
          </p>
        </Card>

        {/* ---- The treatment -------------------------------------------------- */}
        <Card className="space-y-4 p-4 md:p-5" data-testid="treatment-card">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Treatment</h2>
            {exists && !editing && (
              <span className="text-[10px] text-foreground/40" data-testid="treatment-author">
                {doc.mode === "manual" ? "written by you" : `written by the AI${doc.model ? ` (${doc.model})` : ""}`}
                {doc.updatedAt ? ` · ${doc.updatedAt.slice(0, 10)}` : ""}
              </span>
            )}
          </div>

          {!exists && !editing && (
            <>
              <div className="flex gap-1 rounded-lg bg-white/5 p-0.5">
                {(
                  [
                    ["ai", "AI generate"],
                    ["manual", "Write manually"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium", tab === id ? "glass-raised text-foreground" : "text-foreground/50 hover:text-foreground/80")}
                    data-testid={`treatment-tab-${id}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "ai" ? (
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-foreground/60">
                    The AI writes the treatment from the lyrics, the context above and your real footage, and writes the storyboard's shots from it in the same pass.
                  </p>
                  <Button onClick={() => askWrite(true)} disabled={busy} data-testid="treatment-generate">
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    Generate treatment
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} placeholder="The idea, the world, what happens across the song. It is kept exactly as you write it." className="text-sm" data-testid="treatment-text" />
                  <Button onClick={() => void saveText(draft, "manual")} disabled={busy || !draft.trim()} data-testid="treatment-save">
                    <Save className="mr-2 h-4 w-4" /> Save treatment
                  </Button>
                </div>
              )}
            </>
          )}

          {exists && !editing && (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90" data-testid="treatment-saved-text">
                {doc.text}
              </p>
              <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                <Button size="sm" variant="outline" onClick={() => { setDraft(doc.text); setEditing(true); }} disabled={busy} data-testid="treatment-edit">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => askWrite(true)} disabled={busy} data-testid="treatment-regenerate">
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerate
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-300 hover:text-rose-200" onClick={askDelete} disabled={busy} data-testid="treatment-delete">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete treatment
                </Button>
              </div>
            </>
          )}

          {editing && (
            <div className="space-y-3">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={12} className="text-sm" data-testid="treatment-text" />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => void saveText(draft, "manual")} disabled={busy || !draft.trim() || draft === doc.text} data-testid="treatment-save">
                  <Save className="mr-1.5 h-3.5 w-3.5" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {working && (
            <p className="flex items-center gap-2 text-xs text-foreground/60" data-testid="treatment-working">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {working}
            </p>
          )}
        </Card>

        {/* ---- The storyboard written from it --------------------------------- */}
        <Card className="space-y-3 p-4 md:p-5" data-testid="treatment-storyboard">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Storyboard</h2>
          {boxes.length === 0 ? (
            <p className="text-xs text-foreground/60">No shots yet. {exists ? "Write them from this treatment." : "They are written from the treatment."}</p>
          ) : (
            <p className="text-xs leading-relaxed text-foreground/70" data-testid="treatment-storyboard-status">
              {boxes.length} shots.{" "}
              {!exists
                ? "There is no treatment at the moment; the shots are as they were."
                : stale
                  ? "The treatment changed after the shots were written."
                  : `Written from this treatment${doc.storyboard?.at ? ` on ${doc.storyboard.at.slice(0, 10)}` : ""}.`}{" "}
              {kept > 0 && `${kept} ${kept === 1 ? "is" : "are"} yours and ${kept === 1 ? "is" : "are"} never rewritten from here.`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {exists && (boxes.length === 0 || stale) && (
              <Button size="sm" onClick={() => askWrite(false)} disabled={busy} data-testid="treatment-write-shots">
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                {boxes.length === 0 ? "Write the shots from this treatment" : `Rewrite the ${open} shot${open === 1 ? " that is" : "s that are"} not yours`}
              </Button>
            )}
            {boxes.length > 0 && (
              <Button asChild size="sm" variant={stale && exists ? "outline" : "default"}>
                <Link to="/projects/$id/storyboard" params={{ id: projectId }} data-testid="treatment-open-storyboard">
                  Continue to Storyboard <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </Card>
      </div>
      <ConfirmHost request={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
