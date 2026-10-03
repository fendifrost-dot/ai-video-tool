import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CircleDashed, Loader2, Minus, Music } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { AssetUploadDropzone } from "@/components/assets/AssetUploadDropzone";
import { AudioUploader, type StagedAudio } from "@/components/projects/AudioUploader";
import { SongAnalysisCard } from "@/components/projects/SongAnalysisCard";
import { RangeVideo } from "@/components/storyboard/RangeVideo";
import { mediaRefKey, playbackRef, signRefs } from "@/components/storyboard/signedUrls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { lyricLinesKeys } from "@/lib/queries/lyricLines";
import { projectAssetsKeys } from "@/lib/queries/projectAssets";
import { projectsKeys, useSetProjectAudio, useUpdateProject } from "@/lib/queries/projects";
import { useProjectMedia, useSaveTakeSync, useSetFootageRole, useTakeSyncs } from "@/lib/queries/storyboard";
import { useTreatmentInputs } from "@/lib/queries/treatmentInputs";
import { buildStoragePath, makeUploadFilename, uploadToBucket } from "@/lib/storage";
import { saveTreatment } from "@/lib/storyboard/build";
import { isUsableSync, type FootageRole, type MediaAsset, type TakeSync } from "@/lib/storyboard/media";
import { parseLrc, setupStatus, type SetupItem } from "@/lib/storyboard/setup";
import { NoAudioError, TooLargeError, matchTakeInBrowser } from "@/lib/storyboard/syncAudio";
import { isConfidentMatch, type MatchResult } from "@/lib/storyboard/syncMatch";
import { supabase } from "@/lib/supabase";
import { parseTreatmentDoc } from "@/lib/treatment/treatmentDoc";
import { cn } from "@/lib/utils";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const selectClass = "h-8 rounded-md border border-border bg-background/60 px-2 text-xs text-foreground";

/**
 * Setup — everything real goes in first. The song, the lyrics, the performance takes, the director's own B-roll and
 * the looks; then the tool establishes what it needs from them (the song's beat and length, where each lyric line
 * falls, where each take sits on the song). Only then does Treatment generate. None of this is redone when the
 * storyboard changes.
 */
export default function SetupPage({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const inputs = useTreatmentInputs(projectId);
  const { project, analysis, lyricLines } = inputs;
  const media = useProjectMedia(projectId);
  const syncsData = useTakeSyncs(projectId).data;
  const syncs = useMemo(() => syncsData ?? [], [syncsData]);
  const setRole = useSetFootageRole(projectId);
  const doc = useMemo(() => parseTreatmentDoc(project?.treatment_json), [project?.treatment_json]);

  const status = useMemo(
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

  const takes = media.list.filter((m) => m.footageRole === "performance" && m.isVideo);
  const broll = media.list.filter((m) => m.footageRole === "b_roll");
  const references = media.list.filter((m) => m.footageRole === "reference");
  const [showAll, setShowAll] = useState(false);
  // footage already in the project that nobody has said what it is: uploads first, everything else on request
  const untagged = media.list.filter((m) => m.isVideo && !m.footageRole && (showAll || m.sourceTool === "manual" || m.assetType === "reference_video"));

  const refreshAssets = () => void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });

  const confirmFootage = async (on: boolean) => {
    if (!project) return;
    try {
      await saveTreatment(projectId, project.treatment_json, { ...doc, footageConfirmedAt: on ? new Date().toISOString() : null });
      await qc.invalidateQueries({ queryKey: projectsKeys.detail(projectId) });
    } catch (e) {
      toast.error(message(e));
    }
  };

  if (inputs.projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Setup" variant="compact" />
        <div className="px-4 py-6 md:px-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Setup" subtitle="Everything real goes in first: the song, the lyrics, your performance takes, your own B-roll, your looks." variant="compact" />
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-4 md:px-8 md:py-6" data-testid="setup-page">
        {/* ---- The checklist ---------------------------------------------------- */}
        <Card className="space-y-3 p-4 md:p-5" data-testid="setup-checklist">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Source checklist</h2>
          <ul className="space-y-1.5">
            {status.items.map((item) => (
              <ChecklistRow key={item.id} item={item} />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
            {doc.footageConfirmedAt ? (
              <Button size="sm" variant="ghost" className="text-[11px] text-foreground/60" onClick={() => void confirmFootage(false)} data-testid="setup-unconfirm">
                I have more footage to add
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void confirmFootage(true)} data-testid="setup-confirm">
                <Check className="mr-1.5 h-3.5 w-3.5" /> All my real footage is in
              </Button>
            )}
            <Button asChild size="sm" className="ml-auto" variant={status.ready ? "default" : "outline"}>
              <Link to="/projects/$id/treatment" params={{ id: projectId }} data-testid="setup-continue">
                Continue to Treatment <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
          {!status.ready && (
            <p className="text-[11px] text-amber-200/90" data-testid="setup-blocked">
              Still to do before the treatment can be generated — {status.blockedBy}
            </p>
          )}
        </Card>

        {/* ---- Song and lyrics --------------------------------------------------- */}
        <Card className="space-y-4 p-4 md:p-5" data-testid="setup-song">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Song and lyrics</h2>
          {media.song ? (
            <p className="flex items-center gap-2 text-sm text-foreground/85">
              <Music className="h-4 w-4 text-primary" />
              {(media.song.metadata_json as { original_filename?: string } | null)?.original_filename ?? "Song"}
              {analysis?.duration_seconds ? <span className="text-foreground/45">· {mmss(analysis.duration_seconds)}</span> : null}
            </p>
          ) : (
            <SongUpload projectId={projectId} />
          )}
          {media.song && <SongAnalysisCard projectId={projectId} />}
          <LyricsBlock projectId={projectId} lyrics={project?.lyrics ?? ""} timedLines={lyricLines?.length ?? 0} songSeconds={analysis?.duration_seconds ?? null} />
        </Card>

        {/* ---- Performance ------------------------------------------------------- */}
        <Card className="space-y-4 p-4 md:p-5" data-testid="setup-performance">
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Performance footage</h2>
            <p className="mt-1 text-xs text-foreground/55">Your takes, sung to the song. Each one is matched to the song once; after that every shot knows which part of the take it plays.</p>
          </div>
          <AssetUploadDropzone projectId={projectId} footageRole="performance" accept="video/*" hint="Your performance takes." onUploaded={refreshAssets} testId="setup-upload-performance" />
          {takes.length > 0 && (
            <ul className="space-y-2">
              {takes.map((t) => (
                <TakeRow
                  key={t.id}
                  projectId={projectId}
                  take={t}
                  sync={syncs.find((s) => s.performanceAssetId === t.id) ?? null}
                  song={media.song ? { id: media.song.id, bucket: "project-audio", path: media.song.file_url } : null}
                  onUntag={() => setRole.mutate({ assetId: t.id, role: null })}
                />
              ))}
            </ul>
          )}
        </Card>

        {/* ---- B-roll ------------------------------------------------------------ */}
        <Card className="space-y-4 p-4 md:p-5" data-testid="setup-broll">
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your B-roll</h2>
            <p className="mt-1 text-xs text-foreground/55">Footage you shot yourself that is not performance. It can be put on any shot of the storyboard.</p>
          </div>
          <AssetUploadDropzone projectId={projectId} footageRole="b_roll" accept="video/*,image/*" hint="Your own non-performance footage." onUploaded={refreshAssets} testId="setup-upload-broll" />
          <FootageList items={broll} onUntag={(id) => setRole.mutate({ assetId: id, role: null })} />
        </Card>

        {/* ---- Looks and references ---------------------------------------------- */}
        <Card className="space-y-4 p-4 md:p-5" data-testid="setup-references">
          <div>
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Looks and references</h2>
            <p className="mt-1 text-xs text-foreground/55">
              Outfits, locations, reference images. {inputs.looks.length > 0 ? `${inputs.looks.length} look${inputs.looks.length === 1 ? "" : "s"} on the artist.` : "No looks on the artist yet."}
            </p>
          </div>
          <AssetUploadDropzone projectId={projectId} footageRole="reference" accept="image/*,video/*" hint="Reference images and clips." onUploaded={refreshAssets} testId="setup-upload-reference" />
          <FootageList items={references} onUntag={(id) => setRole.mutate({ assetId: id, role: null })} />
        </Card>

        {/* ---- Footage already in the project ------------------------------------ */}
        <Card className="space-y-3 p-4 md:p-5" data-testid="setup-existing">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Already in this project</h2>
              <p className="mt-1 text-xs text-foreground/55">Videos uploaded before. Say what each one is and it joins the lists above — nothing is uploaded again.</p>
            </div>
            <button type="button" onClick={() => setShowAll((v) => !v)} className="shrink-0 text-[11px] text-foreground/50 underline" data-testid="setup-existing-all">
              {showAll ? "Uploads only" : "Show every video"}
            </button>
          </div>
          {untagged.length === 0 ? (
            <p className="text-xs text-foreground/45">Nothing waiting to be sorted.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {untagged.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2" data-testid="setup-existing-row" data-asset-id={m.id} data-name={m.name}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-foreground/85">{m.name}</span>
                    <span className="block text-[10px] text-foreground/40">
                      {m.durationSeconds ? `${mmss(m.durationSeconds)} · ` : ""}
                      {m.createdAt.slice(0, 10)}
                    </span>
                  </span>
                  <select
                    className={selectClass}
                    value=""
                    onChange={(e) => e.target.value && setRole.mutate({ assetId: m.id, role: e.target.value as FootageRole })}
                    aria-label={`What is ${m.name}`}
                    data-testid="setup-existing-role"
                  >
                    <option value="">This is…</option>
                    <option value="performance">A performance take</option>
                    <option value="b_roll">My B-roll</option>
                    <option value="reference">A reference</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function ChecklistRow({ item }: { item: SetupItem }) {
  return (
    <li className="flex items-start gap-2 text-xs" data-testid="setup-item" data-item={item.id} data-state={item.state}>
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          item.state === "done" ? "bg-emerald-500/20 text-emerald-300" : item.state === "todo" ? "bg-amber-500/20 text-amber-300" : "bg-white/5 text-foreground/35",
        )}
      >
        {item.state === "done" ? <Check className="h-3 w-3" /> : item.state === "todo" ? <CircleDashed className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      </span>
      <span className="min-w-0">
        <span className="font-medium text-foreground/85">{item.label}</span> <span className="text-foreground/50">— {item.detail}</span>
      </span>
    </li>
  );
}

function SongUpload({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const setAudio = useSetProjectAudio();
  const [staged, setStaged] = useState<StagedAudio | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    if (!staged) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not signed in");
      const path = buildStoragePath(data.user.id, projectId, makeUploadFilename(staged.file.name));
      await uploadToBucket("project-audio", path, staged.file);
      await setAudio.mutateAsync({
        projectId,
        filePath: path,
        metadata: { original_filename: staged.file.name, size_bytes: staged.file.size, mime_type: staged.file.type, duration_seconds: staged.durationSeconds },
      });
      void qc.invalidateQueries({ queryKey: projectAssetsKeys.forProject(projectId) });
      setStaged(null);
      toast.success("Song uploaded");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <AudioUploader staged={staged} onChange={setStaged} disabled={busy} />
      {staged && (
        <Button size="sm" onClick={() => void upload()} disabled={busy}>
          {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Upload song
        </Button>
      )}
    </div>
  );
}

/** The lyrics as text, and where each line falls on the song. */
function LyricsBlock({ projectId, lyrics, timedLines, songSeconds }: { projectId: string; lyrics: string; timedLines: number; songSeconds: number | null }) {
  const qc = useQueryClient();
  const update = useUpdateProject();
  const [text, setText] = useState<string | null>(null);
  const [lrc, setLrc] = useState("");
  const [openLrc, setOpenLrc] = useState(false);
  const [busy, setBusy] = useState(false);
  const value = text ?? lyrics;
  const parsed = useMemo(() => (lrc.trim() ? parseLrc(lrc, songSeconds) : null), [lrc, songSeconds]);

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

  return (
    <div className="space-y-2" data-testid="setup-lyrics">
      <label className="block text-xs text-foreground/60">
        Lyrics
        <Textarea
          className="mt-1 text-sm"
          rows={5}
          value={value}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== null && text !== lyrics && void update.mutateAsync({ id: projectId, patch: { lyrics: text } }).then(() => setText(null))}
          placeholder="Paste the lyrics. Leave empty for an instrumental."
          data-testid="setup-lyrics-text"
        />
      </label>
      {timedLines > 0 ? (
        <p className="text-[11px] text-emerald-300/90" data-testid="setup-lyrics-timed">
          {timedLines} lines are placed on the song — every shot shows the words sung inside it.
        </p>
      ) : value.trim() ? (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-100/90" data-testid="setup-lyrics-untimed">
          <p>
            The lyrics are not placed on the song yet. Timing them automatically is not in the app yet; it is done for the project by the alignment tool (ask Claude to run it), or you can paste timed lyrics
            here.
          </p>
          <button type="button" className="underline" onClick={() => setOpenLrc((v) => !v)} data-testid="setup-lrc-toggle">
            {openLrc ? "Hide" : "Paste timed lyrics (LRC)"}
          </button>
          {openLrc && (
            <div className="space-y-2">
              <Textarea rows={5} value={lrc} onChange={(e) => setLrc(e.target.value)} placeholder={"[00:12.50] first line\n[00:15.80] second line"} className="font-mono text-xs" data-testid="setup-lrc-text" />
              {parsed && (
                <p>
                  {parsed.lines.length} line{parsed.lines.length === 1 ? "" : "s"} read{parsed.skipped.length ? `, ${parsed.skipped.length} row${parsed.skipped.length === 1 ? "" : "s"} without a time skipped` : ""}.
                </p>
              )}
              <Button size="sm" disabled={busy || !parsed || parsed.lines.length === 0} onClick={() => void importLrc()} data-testid="setup-lrc-import">
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Place these lines on the song
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FootageList({ items, onUntag }: { items: MediaAsset[]; onUntag: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y divide-border/50">
      {items.map((m) => (
        <li key={m.id} className="flex items-center gap-2 py-1.5" data-testid="setup-footage-row" data-asset-id={m.id}>
          <span className="min-w-0 flex-1 truncate text-xs text-foreground/85">{m.name}</span>
          <span className="shrink-0 text-[10px] text-foreground/40">{m.durationSeconds ? mmss(m.durationSeconds) : m.isImage ? "image" : ""}</span>
          <button type="button" className="shrink-0 text-[10px] text-foreground/40 underline hover:text-foreground/70" onClick={() => onUntag(m.id)}>
            not this
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * One performance take and its place on the song. Matching is done once, here: by the take's audio when the browser
 * can read it, or by an offset the director gives. The storyboard only ever reads the saved result.
 */
function TakeRow({
  projectId,
  take,
  sync,
  song,
  onUntag,
}: {
  projectId: string;
  take: MediaAsset;
  sync: TakeSync | null;
  song: { id: string; bucket: string; path: string } | null;
  onUntag: () => void;
}) {
  const save = useSaveTakeSync(projectId);
  const [busy, setBusy] = useState<string | null>(null);
  const [measured, setMeasured] = useState<MatchResult | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [manual, setManual] = useState<string>(sync ? String(sync.offsetSeconds) : "0");
  const [preview, setPreview] = useState<string | null>(null);
  const usable = !!sync && isUsableSync(sync);

  const match = async () => {
    if (!song) {
      toast.info("Upload the song first");
      return;
    }
    setBusy("Reading the audio of the song and the take…");
    setNote(null);
    try {
      const takeRef = { bucket: take.bucket, path: take.path }; // the file itself: a preview copy may carry no audio
      const signed = await signRefs([song, takeRef]);
      const songUrl = signed[mediaRefKey(song)];
      const takeUrl = signed[mediaRefKey(takeRef)];
      if (!songUrl || !takeUrl) throw new Error("The files could not be opened");
      const m = await matchTakeInBrowser(songUrl, takeUrl);
      if (!m) {
        setNote("The take's audio did not line up with the song anywhere. Enter the offset by hand.");
        return;
      }
      setMeasured(m);
      setManual(String(m.offsetSeconds));
      await save.mutateAsync({
        performanceAssetId: take.id,
        songAssetId: song.id,
        offsetSeconds: m.offsetSeconds,
        driftPpm: m.driftPpm,
        method: m.method,
        status: "auto",
        confidence: m.confidence,
      });
      setNote(
        isConfidentMatch(m)
          ? `Measured: ${m.confidence.windowsConsistent} of ${m.confidence.windowsTotal} parts of the take agree. Check the preview, then confirm.`
          : `Measured, but only ${m.confidence.windowsConsistent} of ${m.confidence.windowsTotal} parts of the take agree — check the preview carefully before confirming.`,
      );
    } catch (e) {
      if (e instanceof NoAudioError) setNote("This file has no sound the browser can read, so it cannot be matched by audio. Enter the offset by hand.");
      else if (e instanceof TooLargeError) setNote(`${e.message}. Enter the offset by hand.`);
      else setNote(message(e));
    } finally {
      setBusy(null);
    }
  };

  const saveOffset = async (status: "manual" | "confirmed") => {
    const offset = Number(manual);
    if (!Number.isFinite(offset)) {
      toast.error("The offset is a number of seconds, e.g. 0.85");
      return;
    }
    setBusy("Saving…");
    try {
      await save.mutateAsync({
        performanceAssetId: take.id,
        songAssetId: song?.id ?? null,
        offsetSeconds: offset,
        driftPpm: status === "confirmed" ? (sync?.driftPpm ?? measured?.driftPpm ?? 0) : 0,
        method: status === "confirmed" ? (sync?.method ?? "manual") : "manual",
        status,
        confidence: status === "confirmed" ? (sync?.confidence ?? measured?.confidence) : undefined,
        notes: status === "manual" ? "offset entered by hand" : null,
      });
      toast.success("Take matched to the song");
    } catch (e) {
      toast.error(message(e));
    } finally {
      setBusy(null);
    }
  };

  const openPreview = async () => {
    const ref = playbackRef(take);
    const signed = await signRefs([ref]);
    setPreview(signed[mediaRefKey(ref)] ?? null);
  };

  const offsetNow = Number(manual);
  // where the take is when the song is 30 s in: a spot with singing on most songs
  const probeSong = 30;
  const probeTake = Number.isFinite(offsetNow) ? Math.max(0, probeSong - offsetNow) : 0;

  return (
    <li className="space-y-2 rounded-lg border border-border p-3" data-testid="setup-take" data-asset-id={take.id} data-synced={usable ? "true" : "false"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">{take.name}</span>
        <span className="text-[11px] text-foreground/45">{take.durationSeconds ? mmss(take.durationSeconds) : ""}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", usable ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")} data-testid="setup-take-state">
          {usable ? "matched to the song" : sync ? "measured — confirm it" : "not matched yet"}
        </span>
      </div>
      {usable && sync && (
        <p className="text-[11px] text-foreground/55" data-testid="setup-take-offset">
          The take starts {Math.abs(sync.offsetSeconds).toFixed(2)} s {sync.offsetSeconds >= 0 ? "after" : "before"} the song does
          {take.durationSeconds ? ` and covers song ${mmss(Math.max(0, sync.offsetSeconds))}–${mmss(sync.offsetSeconds + take.durationSeconds)}` : ""}.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm" variant="outline" className="h-8 text-[11px]" disabled={!!busy} onClick={() => void match()} data-testid="setup-take-match">
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null} Match by audio
        </Button>
        <label className="text-[10px] text-foreground/50">
          Seconds the take starts after the song
          <Input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="decimal" className="mt-0.5 h-8 w-28 text-xs" data-testid="setup-take-offset-input" />
        </label>
        {sync && !usable && Number(manual) === sync.offsetSeconds ? (
          <Button size="sm" className="h-8 text-[11px]" disabled={!!busy} onClick={() => void saveOffset("confirmed")} data-testid="setup-take-confirm">
            Confirm
          </Button>
        ) : (
          <Button size="sm" className="h-8 text-[11px]" disabled={!!busy || (usable && Number(manual) === sync?.offsetSeconds)} onClick={() => void saveOffset("manual")} data-testid="setup-take-save">
            Use this offset
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => void openPreview()} data-testid="setup-take-preview">
          Check it
        </Button>
        <button type="button" className="ml-auto text-[10px] text-foreground/40 underline hover:text-foreground/70" onClick={onUntag}>
          not a take
        </button>
      </div>
      {busy && <p className="text-[11px] text-foreground/55">{busy}</p>}
      {note && (
        <p className="text-[11px] text-amber-200/90" data-testid="setup-take-note">
          {note}
        </p>
      )}
      {preview && (
        <div className="space-y-1">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            <RangeVideo src={preview} start={probeTake} end={probeTake + 8} autoPlay showControls />
          </div>
          <p className="text-[10px] text-foreground/45">
            With this offset, this is the take at {mmss(probeSong)} of the song. Unmute it: the words should be the ones sung at {mmss(probeSong)}.
          </p>
        </div>
      )}
    </li>
  );
}
