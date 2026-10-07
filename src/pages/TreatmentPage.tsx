import { useActiveVariation, useVariations, variationsKeys } from "@/lib/queries/variations";
import { coverageGaps, costLine, type BeatCoverage, type WriterRunRecord } from "@/lib/treatment/beatCoverage";
import { useEffect, useMemo, useState } from "react";
import { useContinuityEntities } from "@/lib/queries/continuity";
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
import { TreatmentVersions } from "@/components/treatment/TreatmentVersions";
import { projectsKeys, useUpdateProject } from "@/lib/queries/projects";
import { treatmentVersionsKeys, useRestoreTreatmentVersion, useTreatmentVersions } from "@/lib/queries/treatmentVersions";
import { applyAssignmentOps, storyboardKeys, useAssignments, useProjectMedia, useStoryboardBoxes, useTakeSyncs, writeBoxes } from "@/lib/queries/storyboard";
import { planRelease } from "@/lib/storyboard/rewrite";
import { useTreatmentInputs } from "@/lib/queries/treatmentInputs";
import { boxIsStale, unlockedForGeneration, type StoryboardBox } from "@/lib/storyboard/boxes";
import { deleteTreatment, saveTreatment, writeStoryboardFromTreatment } from "@/lib/storyboard/build";
import { isOriginalTake, isUsableSync } from "@/lib/storyboard/media";
import { footageSummary, setupStatus } from "@/lib/storyboard/setup";
import { directorNotes, hasTreatment, parseTreatmentDoc, storyboardIsStale, type TreatmentDoc } from "@/lib/treatment/treatmentDoc";
import { contextFromEarlierTreatment, currentSnapshot, versionReason, type TreatmentVersion } from "@/lib/treatment/versions";
import { cn } from "@/lib/utils";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Treatment — the ONE creative brief of the video. The AI writes it from the lyrics, the project and the real
 * footage, or the director writes it himself; either way it is one text, always editable, and the storyboard's shots
 * are written from it. Nothing else on this page directs the video.
 */
const CONTEXT_FIELD_NAME = { visual: "visual direction", mood: "mood", notes: "notes" } as const;
const listOf = (words: readonly string[]) => (words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`);

export default function TreatmentPage({ projectId }: { projectId: string }) {
  const variation = useActiveVariation(projectId);
  const variations = useVariations(projectId);
  const qc = useQueryClient();
  const inputs = useTreatmentInputs(projectId);
  const entitiesQuery = useContinuityEntities(projectId);
  const { project, analysis, lyricLines } = inputs;
  const boxesData = useStoryboardBoxes(projectId).data;
  const assignmentsData = useAssignments(projectId).data;
  const syncsData = useTakeSyncs(projectId).data;
  const boxes = useMemo(() => boxesData ?? [], [boxesData]);
  const assignments = useMemo(() => assignmentsData ?? [], [assignmentsData]);
  const syncs = useMemo(() => syncsData ?? [], [syncsData]);
  const media = useProjectMedia(projectId);
  const updateProject = useUpdateProject();
  const versionsQuery = useTreatmentVersions(projectId);
  const versions = useMemo(() => versionsQuery.data ?? [], [versionsQuery.data]);
  const restoreVersion = useRestoreTreatmentVersion(projectId);

  const doc = useMemo(() => parseTreatmentDoc(project?.treatment_json), [project?.treatment_json]);
  const exists = hasTreatment(doc);

  const [tab, setTab] = useState<"ai" | "manual">("ai");
  // the treatment card shows what is current, or the versions that came before it
  const [view, setView] = useState<"current" | "versions">("current");
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
  // Each shot answers for itself (boxes.ts `boxIsStale`). The board's own stamp cannot: a rewrite keeps the shots
  // that are the director's, stamps the board as written from this treatment, and those shots are still the old one.
  const staleBoxes = useMemo(() => boxes.filter((b) => boxIsStale(b, doc)), [boxes, doc]);
  const staleOpen = useMemo(() => unlockedForGeneration(staleBoxes, withMedia).length, [staleBoxes, withMedia]);
  const staleKept = staleBoxes.length - staleOpen;
  const stale = storyboardIsStale(doc) || staleBoxes.length > 0;
  // notes, mood and visual direction that have not changed since the treatment beside them was replaced
  const carriedOver = useMemo(() => contextFromEarlierTreatment(versions, currentSnapshot(project)), [versions, project]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: projectsKeys.detail(projectId) }),
      qc.invalidateQueries({ queryKey: storyboardKeys.boxes(projectId) }),
      // whatever was just replaced is a version now
      qc.invalidateQueries({ queryKey: treatmentVersionsKeys.forProject(projectId) }),
    ]);
  };

  const saveField = async (patch: { mood?: string; visual_style?: string }) => {
    try {
      await updateProject.mutateAsync({ id: projectId, patch });
      void qc.invalidateQueries({ queryKey: treatmentVersionsKeys.forProject(projectId) });
    } catch (e) {
      toast.error(message(e));
    }
  };

  /** Save the notes field as the project's one notes text (and empty the older second copy). */
  const saveNotes = async () => {
    if (notes === null || notes === storedNotes || !project) return;
    try {
      await updateProject.mutateAsync({ id: projectId, patch: { notes: notes.trim() || null } });
      if (doc.notes) await saveTreatment(projectId, project.treatment_json, { ...doc, notes: "" }, project.active_variation_id);
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
      await saveTreatment(projectId, project.treatment_json, { ...doc, text, mode, updatedAt: new Date().toISOString(), model: mode === "manual" ? null : doc.model, notes: "" }, project.active_variation_id);
      await refresh();
      setEditing(false);
      toast.success("Treatment saved");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setWorking(null);
    }
  };

  /** The name a candidate board gets: this variation's name and a count, so two candidates never share one. */
  const candidateName = () => {
    const base = variation?.name ?? "Board";
    const n = (variations.data ?? []).filter((v) => v.name.startsWith(`${base} · candidate`)).length + 1;
    return `${base} · candidate ${n}`;
  };

  /**
   * One writer run: the treatment text (when the AI writes it) and the scene of every shot it may write. With
   * `asCandidate` the shots go into a new variation and this board is left exactly as it is.
   */
  const write = async (aiWritesText: boolean, asCandidate = false) => {
    if (!project) return;
    setWorking(aiWritesText ? "Writing the treatment and the shots — this takes a minute or two…" : asCandidate ? "Reading the treatment's beats and writing a candidate board — this takes a minute or two…" : "Writing the shots from the treatment — this takes a minute or two…");
    try {
      await saveNotes();
      if (!project.active_variation_id) throw new Error("this project has no video variation");
      const candidate = asCandidate ? candidateName() : null;
      const res = await writeStoryboardFromTreatment({
        projectId,
        variationId: project.active_variation_id,
        // the project's places, props and lighting states: the writer points shots at them instead of describing them again
        context: {
          ...inputs.treatmentContext(notesValue, footageNote, setup.counts.takesSynced > 0),
          entities: (entitiesQuery.data ?? []).filter((e) => !e.archived).map((e) => ({ key: e.key, kind: e.kind, name: e.name, description: e.description })),
        },
        treatmentText: aiWritesText ? "" : doc.text,
        aiWritesText,
        treatmentJson: project.treatment_json,
        boxes,
        assignments,
        analysis,
        lyricLines,
        // the notes live on the project; nothing is kept a second time with the treatment
        notes: "",
        candidate: candidate ? { name: candidate } : null,
      });
      await refresh();
      await qc.invalidateQueries({ queryKey: variationsKeys.forProject(projectId) });
      setEditing(false);
      const cov = res.draft.coverage;
      const covLine = cov ? (cov.ok ? "; the board carries every beat of the treatment" : `; ${coverageGaps(cov).length} gap${coverageGaps(cov).length === 1 ? "" : "s"} against the treatment — see Coverage`) : "";
      if (res.candidateVariationId) {
        toast.success(`Candidate written — ${res.written} shots in “${candidate}”; this board is untouched${res.editsLeftBehind ? ` (${res.editsLeftBehind} of your edits here were not carried over)` : ""}${covLine}. Switch to it under the project title to review it.`, { duration: 12000 });
      } else {
        toast.success(`${aiWritesText ? "Treatment written" : "Shots written"} — ${res.written} shot${res.written === 1 ? "" : "s"} written${res.kept ? `, ${res.kept} of yours kept` : ""}${covLine}`);
      }
    } catch (e) {
      toast.error(message(e));
    } finally {
      setWorking(null);
    }
  };

  const askWrite = (aiWritesText: boolean, asCandidate = false) => {
    if (!setup.ready) {
      toast.info(`Setup is not finished — ${setup.blockedBy}`);
      return;
    }
    if (asCandidate) {
      setConfirm({
        title: "Write a candidate board from this treatment?",
        body: `The treatment's beats are read out first and every shot is written inside its beat, in the treatment's order. The shots go into a NEW variation, “${candidateName()}”, with this treatment and direction — this board stays exactly as it is${kept ? `, your ${kept} edited or locked shot${kept === 1 ? "" : "s"} included (they are not carried into the candidate)` : ""}. Nothing is made active; switch to the candidate under the project title to review it, and come back here any time.`,
        confirmLabel: "Write the candidate",
        testId: "confirm-write-candidate",
        onConfirm: () => write(false, true),
      });
      return;
    }
    const effect =
      boxes.length === 0
        ? "The storyboard's shots are cut on the beat and written from it."
        : `${open} of the ${boxes.length} shots are rewritten. ${kept} ${kept === 1 ? "is" : "are"} yours (edited, locked or holding footage) and ${kept === 1 ? "stays" : "stay"} exactly as ${kept === 1 ? "it is" : "they are"}.`;
    setConfirm({
      title: aiWritesText ? (exists ? "Write a new treatment?" : "Let the AI write the treatment?") : "Write the shots from this treatment?",
      body: (aiWritesText ? (exists ? (doc.mode === "manual" ? "This REPLACES the treatment you wrote with one the AI writes from the lyrics and the project — it is not shown your text. Yours is kept under Versions and can be restored. To keep your treatment and only write its shots, cancel and use \"Rewrite the shots\" below. " : "A new treatment text is written. The current one is kept under Versions and can be restored. ") : "The AI writes the treatment from the lyrics, the project and your footage. ") : "The treatment text is kept word for word. ") + effect,
      confirmLabel: aiWritesText ? "Generate treatment" : "Write the shots",
      testId: aiWritesText ? "confirm-generate-treatment" : "confirm-write-shots",
      onConfirm: () => write(aiWritesText),
    });
  };

  /** Hand the director's shots that are from an earlier treatment back to it (rewrite.ts `planRelease`). */
  const askRelease = () => {
    const plan = planRelease({ boxes, assignments, treatment: doc, at: new Date().toISOString() });
    if (plan.released === 0) return;
    const n = plan.released;
    setConfirm({
      title: `Release ${n} shot${n === 1 ? "" : "s"} to be rewritten?`,
      body:
        `${n === 1 ? "This shot is" : `These ${n} shots are`} yours — edited, locked or holding footage — and ${n === 1 ? "was" : "were"} written from an earlier treatment. Releasing ${n === 1 ? "it" : "them"} clears ${n === 1 ? "its" : "their"} edits and locks` +
        (plan.pieces > 0 ? ` and takes ${plan.pieces} piece${plan.pieces === 1 ? "" : "s"} of footage off ${plan.withFootage === 1 ? "one shot" : `${plan.withFootage} shots`}` : "") +
        `, so the next "Rewrite the shots" writes ${n === 1 ? "it" : "them"} from this treatment. ` +
        `Nothing is deleted: each shot's scene, and the list of what was on it, is kept under that shot's Versions, and every file stays in the project. ` +
        `It is not undone in one press — a shot is put back by restoring its version and putting its footage on it again. Nothing is rewritten or generated by this step.`,
      confirmLabel: `Release ${n} shot${n === 1 ? "" : "s"}`,
      testId: "confirm-release-shots",
      onConfirm: async () => {
        setWorking("Releasing the shots…");
        try {
          // the footage comes off first: a shot must never be left unlocked AND still showing a clip of the old scene
          const variationId = project?.active_variation_id;
          if (!variationId) throw new Error("this project has no video variation");
          await applyAssignmentOps(projectId, plan.assignmentOps, variationId);
          await writeBoxes(projectId, { updates: plan.updates }, variationId);
          await Promise.all([refresh(), qc.invalidateQueries({ queryKey: storyboardKeys.assignments(projectId) })]);
          toast.success(`${n} shot${n === 1 ? "" : "s"} released — rewrite the shots to write ${n === 1 ? "it" : "them"} from this treatment`);
        } catch (e) {
          toast.error(message(e));
        } finally {
          setWorking(null);
        }
      },
    });
  };

  const askDelete = () =>
    setConfirm({
      title: "Delete the treatment?",
      body: "The treatment text is taken away; it is kept under Versions and can be restored. The storyboard's shots, the footage on them and your edits stay exactly as they are.",
      confirmLabel: "Delete treatment",
      testId: "confirm-delete-treatment",
      onConfirm: async () => {
        if (!project) return;
        try {
          await deleteTreatment(projectId, project.treatment_json, project.active_variation_id);
          await refresh();
          setEditing(false);
          toast.success("Treatment deleted");
        } catch (e) {
          toast.error(message(e));
        }
      },
    });

  const askRestore = (version: TreatmentVersion) =>
    setConfirm({
      title: "Restore this version?",
      body:
        `This version (${versionReason(version)}) becomes the current treatment, with the notes, mood and visual direction it had. ` +
        "What is current now is kept as a version of its own, so this can be undone. The storyboard's shots, their footage and your edits are not touched.",
      confirmLabel: "Restore version",
      testId: "confirm-restore-treatment",
      onConfirm: async () => {
        if (!project) return;
        setWorking("Restoring…");
        try {
          await restoreVersion.mutateAsync({ version, currentTreatmentJson: project.treatment_json });
          // the fields on the page follow the project again
          setMood(null);
          setVisual(null);
          setNotes(null);
          setEditing(false);
          await refresh();
          setView("current");
          toast.success("Version restored — what it replaced is under Versions");
        } catch (e) {
          toast.error(message(e));
        } finally {
          setWorking(null);
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
      <PageHeader title="Treatment" subtitle="One treatment for the video. Let the AI write it, or write it yourself — the shots are written from it." variant="compact" context={variation?.name ?? null} />
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
          {carriedOver.length > 0 && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200" data-testid="treatment-context-carried">
              Your {listOf(carriedOver.map((f) => CONTEXT_FIELD_NAME[f]))} {carriedOver.length === 1 ? "is" : "are"} word for word what stood beside the previous treatment. {carriedOver.length === 1 ? "It is" : "They are"} still
              given to the writer and the reviewer — as wishes the treatment overrules where the two disagree. Read {carriedOver.length === 1 ? "it" : "them"} against the treatment you saved, and change or clear what belongs to the
              old one.
            </p>
          )}
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
            <div className="flex gap-1 rounded-lg bg-white/5 p-0.5" role="tablist" aria-label="Current treatment or its earlier versions">
              {(
                [
                  ["current", "Current"],
                  ["versions", `Versions${versions.length ? ` · ${versions.length}` : ""}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={cn("rounded-md px-2.5 py-1 text-[11px] font-medium", view === id ? "glass-raised text-foreground" : "text-foreground/50 hover:text-foreground/80")}
                  data-testid={`treatment-view-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {view === "versions" && (
            <div className="space-y-2">
              {versionsQuery.isError ? (
                <p className="text-xs text-rose-300" data-testid="treatment-versions-error">
                  {message(versionsQuery.error)}
                </p>
              ) : versionsQuery.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TreatmentVersions versions={versions} current={currentSnapshot(project)} busy={busy} onRestore={askRestore} />
              )}
            </div>
          )}

          {view === "current" && exists && !editing && (
            <p className="text-right text-[10px] text-foreground/40" data-testid="treatment-author">
              {doc.mode === "manual" ? "written by you" : `written by the AI${doc.model ? ` (${doc.model})` : ""}`}
              {doc.updatedAt ? ` · ${doc.updatedAt.slice(0, 10)}` : ""}
            </p>
          )}

          {view === "current" && !exists && !editing && (
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

          {view === "current" && exists && !editing && (
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

          {view === "current" && editing && (
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
                : staleBoxes.length > 0
                  ? `${staleBoxes.length === boxes.length ? `All ${boxes.length}` : `${staleBoxes.length} of them`} ${staleBoxes.length === 1 ? "was" : "were"} written from an earlier version of this treatment.`
                  : stale
                    ? "The treatment changed after the shots were written."
                    : `Written from this treatment${doc.storyboard?.at ? ` on ${doc.storyboard.at.slice(0, 10)}` : ""}.`}{" "}
              {kept > 0 && `${kept} ${kept === 1 ? "is" : "are"} yours and ${kept === 1 ? "is" : "are"} never rewritten from here.`}
              {staleKept > 0 && (
                <span data-testid="treatment-stale-kept">
                  {" "}
                  {staleKept} of yours {staleKept === 1 ? "is" : "are"} still from the earlier treatment: rewriting the rest does not touch {staleKept === 1 ? "it" : "them"}. Open {staleKept === 1 ? "it" : "each"} on the storyboard and
                  regenerate its scene — or release {staleKept === 1 ? "it" : "them"} below, so the rewrite here reaches {staleKept === 1 ? "it" : "them"} too.
                </span>
              )}
            </p>
          )}
          {boxes.length > 0 && doc.storyboard?.coverage && <CoverageBlock coverage={doc.storyboard.coverage} run={doc.storyboard.run ?? null} boxes={boxes} />}
          <div className="flex flex-wrap items-center gap-2">
            {exists && (boxes.length === 0 || staleOpen > 0 || (storyboardIsStale(doc) && open > 0)) && (
              <Button size="sm" onClick={() => askWrite(false)} disabled={busy} data-testid="treatment-write-shots">
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                {boxes.length === 0 ? "Write the shots from this treatment" : `Rewrite the ${open} shot${open === 1 ? " that is" : "s that are"} not yours`}
              </Button>
            )}
            {exists && boxes.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => askWrite(false, true)} disabled={busy} data-testid="treatment-write-candidate">
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                Write a candidate board…
              </Button>
            )}
            {exists && staleKept > 0 && (
              <Button size="sm" variant="outline" onClick={askRelease} disabled={busy} data-testid="treatment-release-kept">
                Release {staleKept === 1 ? "that shot" : `those ${staleKept} shots`} to be rewritten…
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

/**
 * What the board carries of the treatment, beat by beat: the shots of each, who is cast, the ties — and every gap,
 * said plainly. A shot count is not a success; this is what says whether the storyboard IS the treatment.
 */
function CoverageBlock({ coverage, run, boxes }: { coverage: BeatCoverage; run: WriterRunRecord | null; boxes: readonly StoryboardBox[] }) {
  const [open, setOpen] = useState(!coverage.ok);
  const number = (key: string) => {
    const b = boxes.find((x) => x.key === key);
    return b ? String(boxes.indexOf(b) + 1) : key;
  };
  const gaps = coverageGaps(coverage, number);
  const beatsWithShots = coverage.beats.filter((b) => b.shots.length > 0).length;
  return (
    <div className={cn("rounded-lg border p-3 text-xs", coverage.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-400/40 bg-amber-400/5")} data-testid="treatment-coverage" data-ok={coverage.ok}>
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)} data-testid="treatment-coverage-toggle">
        <span className="font-medium">
          Coverage — {beatsWithShots} of {coverage.beats.length} beats of the treatment have shots
          {coverage.ok ? "; every person and every tie is carried." : `; ${gaps.length} gap${gaps.length === 1 ? "" : "s"}.`}
        </span>
        <span className="text-foreground/50">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {gaps.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-amber-100/90" data-testid="treatment-coverage-gaps">
              {gaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          )}
          <ol className="space-y-1 text-foreground/75" data-testid="treatment-coverage-beats">
            {coverage.beats.map((b) => (
              <li key={b.id} className="flex flex-wrap gap-x-2" data-beat={b.id}>
                <span className="font-medium text-foreground/90">{b.title}</span>
                <span>{b.shots.length ? `shots ${number(b.shots[0])}${b.shots.length > 1 ? `–${number(b.shots[b.shots.length - 1])}` : ""}` : "no shot"}</span>
                {b.people.length > 0 && <span>· {b.people.map((p) => `${p.key}${p.castIn.length ? "" : " (not cast)"}`).join(", ")}</span>}
                {b.ties.map((t, i) => (
                  <span key={i} className={t.present ? "" : "text-amber-200"}>
                    · {t.kind.replace("_", " ")} → {coverage.beats.find((x) => x.id === t.to)?.title ?? t.to}
                    {t.present ? "" : " (missing)"}
                  </span>
                ))}
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-foreground/50" data-testid="treatment-coverage-run">
            Writer run{run?.model ? ` (${run.model})` : ""}: {costLine(run)}.
          </p>
        </div>
      )}
    </div>
  );
}
