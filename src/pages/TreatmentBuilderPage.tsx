import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Sparkles, Wand2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/AppShell";
import { SongAnalysisCard } from "@/components/projects/SongAnalysisCard";
import { useProject } from "@/lib/queries/projects";
import { useArtist } from "@/lib/queries/artists";
import { useArtistLooks } from "@/lib/queries/looks";
import { useSongAnalysis } from "@/lib/queries/songAnalyses";
import { useProjectShots, useBulkCreateShots } from "@/lib/queries/shots";
import { buildClipGrid, gridSummary } from "@/lib/treatment/grid";
import {
  suggestConcepts,
  draftFullTreatment,
  parseSavedStructuredTreatment,
  type ConceptSuggestion,
  type ProjectType,
  type StructuredTreatment,
  type TreatmentContext,
} from "@/lib/treatment/api";
import type { ShotPriority, ShotStatus, ShotType, ProviderName } from "@/integrations/supabase/aliases";

const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: "music_video", label: "Music video" },
  { value: "commercial", label: "Commercial" },
  { value: "social", label: "Social content" },
];

const ENERGY_STYLES: Record<string, string> = {
  low: "bg-sky-500/15 text-sky-300",
  mid: "bg-emerald-500/15 text-emerald-300",
  high: "bg-amber-500/15 text-amber-300",
  drop: "bg-rose-500/15 text-rose-300",
};

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function TreatmentBuilderPage({ projectId }: { projectId: string }) {
  const projectQuery = useProject(projectId);
  const project = projectQuery.data;
  const analysisQuery = useSongAnalysis(projectId);
  const analysis = analysisQuery.data ?? null;
  const artistQuery = useArtist(project?.artist_id ?? undefined);
  const looksQuery = useArtistLooks(project?.artist_id ?? undefined);
  const shotsQuery = useProjectShots(projectId);
  const bulkCreate = useBulkCreateShots();

  const saved = useMemo(
    () => parseSavedStructuredTreatment(project?.treatment_json),
    [project?.treatment_json],
  );

  const [projectType, setProjectType] = useState<ProjectType>("music_video");
  const [mood, setMood] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [targetDuration, setTargetDuration] = useState("30");
  const [concepts, setConcepts] = useState<ConceptSuggestion[] | null>(null);
  const [chosenConcept, setChosenConcept] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [treatment, setTreatment] = useState<StructuredTreatment | null>(null);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  const current = treatment ?? saved;
  const effectiveMood = mood ?? project?.mood ?? "";

  const grid = useMemo(() => {
    if (projectType === "music_video" && analysis) return buildClipGrid({ analysis });
    const dur = Number(targetDuration);
    return buildClipGrid({ analysis: projectType === "music_video" ? analysis : null, durationSeconds: Number.isFinite(dur) ? dur : null });
  }, [analysis, projectType, targetDuration]);

  const context = (): TreatmentContext => {
    const profile = artistQuery.data?.identity_profile_json as Record<string, unknown> | undefined;
    const artistProfile = profile
      ? Object.entries(profile)
          .filter(([, v]) => typeof v === "string" && (v as string).length > 0)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")
      : artistQuery.data?.name ?? null;
    const energyCurve = analysis?.energy_curve_json ?? [];
    const bucket = Math.max(1, Math.floor(energyCurve.length / 12));
    const energyProfile = energyCurve.length
      ? Array.from({ length: Math.ceil(energyCurve.length / bucket) }, (_, i) => {
          const slice = energyCurve.slice(i * bucket, (i + 1) * bucket);
          const avg = slice.reduce((s, p) => s + p.energy, 0) / Math.max(1, slice.length);
          return Math.round(avg * 100) / 100;
        })
      : null;
    return {
      projectId,
      projectType,
      songTitle: project?.song_title,
      lyrics: project?.lyrics,
      artistProfile,
      visualStyle: project?.visual_style,
      mood: effectiveMood,
      additionalNotes: [project?.notes, notes].filter(Boolean).join("\n"),
      analysisSummary: analysis
        ? {
            bpm: analysis.bpm,
            duration_seconds: analysis.duration_seconds,
            drops: (analysis.drops_json ?? []).slice(0, 8),
            energy_profile_12_buckets: energyProfile,
          }
        : null,
      looks: (looksQuery.data ?? [])
        .filter((l) => !["archived", "failed", "error"].includes(l.status))
        .slice(0, 25)
        .map((l) => ({ name: l.name, description: l.description })),
    };
  };

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const result = await suggestConcepts(context());
      setConcepts(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Concept suggestion failed");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleGenerate() {
    if (!chosenConcept.trim()) {
      toast.error("Pick or write a concept first.");
      return;
    }
    if (grid.length === 0) {
      toast.error(
        projectType === "music_video"
          ? "Run song analysis first so clips can snap to the beat."
          : "Set a target duration first.",
      );
      return;
    }
    setGenerating(true);
    try {
      const result = await draftFullTreatment({ ...context(), concept: chosenConcept.trim(), grid });
      setTreatment(result);
      setCommitted(false);
      toast.success(`Treatment generated — ${result.clips.length} clips`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Treatment generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCommit(replace: boolean) {
    if (!current) return;
    setCommitting(true);
    try {
      const rows = current.clips.map((c) => ({
        song_section: c.section,
        timestamp_start: c.start,
        timestamp_end: c.end,
        shot_type: c.shot_type as ShotType,
        scene_description: c.scene_description,
        camera_direction: c.camera_direction || null,
        lighting: c.lighting || null,
        wardrobe: c.wardrobe || null,
        environment: c.environment || null,
        recommended_tool: c.recommended_tool as ProviderName,
        priority: c.priority as ShotPriority,
        status: "planned" as ShotStatus,
        notes: [
          `TKEY:${c.key}`,
          c.lyric_ref ? `LYRIC: "${c.lyric_ref}"` : null,
          ...c.dependencies.map(
            (d) => `PREP[${d.kind}${d.look ? `: ${d.look}` : ""}] ${d.note}`,
          ),
        ]
          .filter(Boolean)
          .join("\n"),
      }));
      const n = await bulkCreate.mutateAsync({ projectId, replace, rows });
      setCommitted(true);
      toast.success(`${n} shots ${replace ? "written (replaced existing)" : "appended"} to the shot list`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  const prepAssets = useMemo(() => {
    if (!current) return [];
    const seen = new Map<string, { kind: string; look: string | null; note: string; clips: string[] }>();
    for (const c of current.clips) {
      for (const d of c.dependencies) {
        const id = `${d.kind}|${d.look ?? ""}|${d.note}`;
        const entry = seen.get(id) ?? { kind: d.kind, look: d.look, note: d.note, clips: [] };
        entry.clips.push(c.key);
        seen.set(id, entry);
      }
    }
    return [...seen.values()];
  }, [current]);

  if (projectQuery.isLoading) {
    return (
      <>
        <PageHeader title="Treatment" />
        <div className="px-4 py-6 md:px-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      </>
    );
  }

  const existingShotCount = shotsQuery.data?.length ?? 0;
  const needsAnalysis = projectType === "music_video" && !analysis;

  return (
    <>
      <PageHeader
        title="Treatment Builder"
        subtitle="From song + concept to a beat-aligned, clip-by-clip plan. Commit it to the shot list when it's right."
      />
      <div className="space-y-6 px-4 py-4 md:px-8 md:py-6">
        {/* ---- Step 1: context ------------------------------------------- */}
        <Card className="space-y-4 p-4 md:p-5">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            1 · Brief
          </h2>
          <div className="flex flex-wrap gap-2">
            {PROJECT_TYPES.map((pt) => (
              <button
                key={pt.value}
                type="button"
                onClick={() => setProjectType(pt.value)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                  projectType === pt.value ? "glass-raised text-foreground" : "text-foreground/60 hover:bg-white/5"
                }`}
              >
                {pt.label}
              </button>
            ))}
          </div>

          {projectType === "music_video" ? (
            analysis ? (
              <p className="text-xs text-foreground/60">
                Beat grid ready: {analysis.bpm ? `${Math.round(analysis.bpm)} BPM` : "BPM unknown"} ·{" "}
                {Math.round(analysis.duration_seconds ?? 0)}s · {gridSummary(grid)}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> No song analysis yet — run it so clips snap to the beat.
                </p>
                <SongAnalysisCard projectId={projectId} />
              </div>
            )
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-xs text-foreground/60">Target duration (seconds)</label>
              <Input
                className="w-24"
                value={targetDuration}
                onChange={(e) => setTargetDuration(e.target.value)}
                inputMode="numeric"
              />
              <span className="text-xs text-foreground/50">{gridSummary(grid)}</span>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-foreground/60">Mood</label>
              <Input
                value={effectiveMood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="e.g. Opulent, cool, late-night confidence"
              />
            </div>
            <div>
              <label className="text-xs text-foreground/60">Direction notes (optional)</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="constraints, must-have shots, references…"
              />
            </div>
          </div>
        </Card>

        {/* ---- Step 2: concept ------------------------------------------- */}
        <Card className="space-y-4 p-4 md:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              2 · Concept
            </h2>
            <Button size="sm" variant="outline" onClick={handleSuggest} disabled={suggesting}>
              {suggesting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
              {concepts ? "Re-suggest" : "Suggest 3 concepts"}
            </Button>
          </div>

          {concepts && (
            <div className="grid gap-3 md:grid-cols-3">
              {concepts.map((c) => {
                const text = `${c.title} — ${c.logline} ${c.visual_world}`;
                const active = chosenConcept === text;
                return (
                  <button
                    key={c.title}
                    type="button"
                    onClick={() => setChosenConcept(text)}
                    className={`rounded-xl border p-3 text-left text-xs transition-all ${
                      active ? "border-primary glass-raised" : "border-border hover:bg-white/5"
                    }`}
                  >
                    <p className="font-semibold text-foreground">{c.title}</p>
                    <p className="mt-1 text-foreground/70">{c.logline}</p>
                    <p className="mt-1 text-foreground/50">{c.visual_world}</p>
                    <p className="mt-1 italic text-foreground/40">{c.why_it_fits}</p>
                  </button>
                );
              })}
            </div>
          )}

          <div>
            <label className="text-xs text-foreground/60">Concept (pick above or write your own)</label>
            <Textarea
              value={chosenConcept}
              onChange={(e) => setChosenConcept(e.target.value)}
              rows={3}
              placeholder="One paragraph: the idea, the world, the recurring motif."
            />
          </div>

          <Button onClick={handleGenerate} disabled={generating || needsAnalysis || !chosenConcept.trim()}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {generating ? "Generating treatment…" : `Generate full treatment (${grid.length} clips)`}
          </Button>
        </Card>

        {/* ---- Step 3: result -------------------------------------------- */}
        {current && (
          <>
            <Card className="space-y-3 p-4 md:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  3 · Treatment {treatment ? "" : "(saved)"}
                </h2>
                <span className="text-[10px] text-foreground/40">{current.model}</span>
              </div>
              <p className="text-sm font-medium text-foreground">{current.concept}</p>
              <p className="text-xs leading-relaxed text-foreground/70">{current.narrative}</p>
              {current.sections.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {current.sections.map((s) => (
                    <span key={s.name} className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-foreground/60" title={s.intent}>
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {prepAssets.length > 0 && (
              <Card className="space-y-2 border-amber-500/30 bg-amber-500/5 p-4 md:p-5">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                  Prep assets — generate these before their clips
                </h2>
                {prepAssets.map((p, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase text-amber-300">
                      {p.kind.replace("_", " ")}
                    </span>
                    {p.look && <span className="font-medium text-foreground">{p.look}</span>}
                    <span className="text-foreground/70">{p.note}</span>
                    <span className="text-foreground/40">({p.clips.length} clip{p.clips.length > 1 ? "s" : ""}: {p.clips.join(", ")})</span>
                  </div>
                ))}
                <p className="text-[10px] text-foreground/50">
                  Look composites → Looks tab · face swaps → Assets tab ("Apply My Face") · reference stills → Prompt Lab.
                </p>
              </Card>
            )}

            <Card className="p-0">
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 bg-background/95 backdrop-blur">
                    <tr className="border-b border-border text-[10px] uppercase tracking-wider text-foreground/50">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Section</th>
                      <th className="px-3 py-2">Energy</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Scene</th>
                      <th className="px-3 py-2">Tool</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.clips.map((c, i) => (
                      <tr key={c.key} className="border-b border-border/40 align-top">
                        <td className="px-3 py-2 text-foreground/40">{i + 1}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground/70">
                          {fmtTime(c.start)}–{fmtTime(c.end)}
                          <span className="ml-1 text-foreground/40">({(c.end - c.start).toFixed(1)}s)</span>
                        </td>
                        <td className="px-3 py-2 text-foreground/60">{c.section}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${ENERGY_STYLES[c.energy] ?? ""}`}>{c.energy}</span>
                        </td>
                        <td className="px-3 py-2 text-foreground/60">{c.shot_type}</td>
                        <td className="px-3 py-2 text-foreground/80">
                          {c.scene_description}
                          {c.lyric_ref && <span className="block text-[10px] italic text-foreground/40">"{c.lyric_ref}"</span>}
                          {c.dependencies.length > 0 && (
                            <span className="mt-0.5 block text-[10px] text-amber-300">
                              prep: {c.dependencies.map((d) => d.look ?? d.kind).join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-foreground/60">{c.recommended_tool}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="flex flex-wrap items-center gap-3 p-4 md:p-5">
              {committed ? (
                <p className="flex items-center gap-1.5 text-sm text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" /> Committed to the shot list — head to Shot List / Prompt Lab.
                </p>
              ) : (
                <>
                  <Button onClick={() => handleCommit(false)} disabled={committing}>
                    {committing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Commit {current.clips.length} clips to shot list
                  </Button>
                  {existingShotCount > 0 && (
                    <Button variant="outline" onClick={() => handleCommit(true)} disabled={committing}>
                      Replace existing {existingShotCount} shots
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" /> Regenerate
                  </Button>
                </>
              )}
            </Card>
          </>
        )}
      </div>
    </>
  );
}
