import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CollapsibleSection } from "@/components/projects/CollapsibleSection";
import {
  AudioUploader,
  type StagedAudio,
} from "@/components/projects/AudioUploader";
import { SongStructureEditor } from "@/components/projects/SongStructureEditor";
import { ColorPaletteEditor } from "@/components/projects/ColorPaletteEditor";
import { useArtists } from "@/lib/queries/artists";
import {
  useCreateProject,
  useSetProjectAudio,
  type SongSection,
} from "@/lib/queries/projects";
import {
  buildStoragePath,
  makeUploadFilename,
  uploadToBucket,
} from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type {
  Json,
  ProjectStatus,
} from "@/integrations/supabase/types";

type FormState = {
  title: string;
  song_title: string;
  artist_id: string;            // "" means none
  genre: string;
  mood: string;
  visual_style: string;
  status: ProjectStatus;
  bpm: string;                  // input as string, parsed on submit
  lyrics: string;
  song_structure: SongSection[];
  color_palette: string[];
  wardrobe_notes: string;
  notes: string;
};

const INITIAL: FormState = {
  title: "",
  song_title: "",
  artist_id: "",
  genre: "",
  mood: "",
  visual_style: "",
  status: "draft",
  bpm: "",
  lyrics: "",
  song_structure: [],
  color_palette: [],
  wardrobe_notes: "",
  notes: "",
};

export default function ProjectNew() {
  const navigate = useNavigate();
  const artistsQuery = useArtists();
  const create = useCreateProject();
  const setAudio = useSetProjectAudio();

  const [state, setState] = useState<FormState>(INITIAL);
  const [staged, setStaged] = useState<StagedAudio | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  const sectionCounts = useMemo(
    () => ({
      audio: staged ? 1 : 0,
      lyrics: state.lyrics.trim().length > 0 ? 1 : 0,
      structure: state.song_structure.length,
      palette: state.color_palette.length,
    }),
    [staged, state.lyrics, state.song_structure, state.color_palette],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state.title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);

    try {
      // 1. Create the project row
      const bpm = state.bpm.trim() ? Number(state.bpm) : null;
      const project = await create.mutateAsync({
        title: state.title.trim(),
        song_title: state.song_title.trim() || null,
        artist_id: state.artist_id || null,
        genre: state.genre.trim() || null,
        mood: state.mood.trim() || null,
        visual_style: state.visual_style.trim() || null,
        status: state.status,
        bpm: bpm != null && !Number.isNaN(bpm) ? bpm : null,
        lyrics: state.lyrics.trim() || null,
        song_structure_json: state.song_structure as unknown as Json,
        color_palette: state.color_palette,
        wardrobe_notes: state.wardrobe_notes.trim() || null,
        notes: state.notes.trim() || null,
      });

      // 2. Upload audio if staged
      if (staged) {
        try {
          const { data: userData } = await supabase.auth.getUser();
          const user = userData.user;
          if (!user) throw new Error("Not signed in");

          const filename = makeUploadFilename(staged.file.name);
          const path = buildStoragePath(user.id, project.id, filename);
          await uploadToBucket("project-audio", path, staged.file);
          await setAudio.mutateAsync({
            projectId: project.id,
            filePath: path,
            metadata: {
              original_filename: staged.file.name,
              size_bytes: staged.file.size,
              mime_type: staged.file.type,
              duration_seconds: staged.durationSeconds,
            },
          });
        } catch (err) {
          // Project was created; flag the audio failure but don't block nav.
          toast.error(
            "Project created, but audio upload failed: " +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }

      toast.success("Project created");
      navigate({ to: "/projects/$id", params: { id: project.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New project"
        subtitle="Fill what you have. You can refine everything later."
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-4 px-8 py-6">
        {/* IDENTITY */}
        <CollapsibleSection
          title="Identity"
          description="The basics. Title is required; everything else can be deferred."
          defaultOpen
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Project title" required>
              <Input
                value={state.title}
                onChange={(e) => set("title", e.target.value)}
                required
                autoFocus
                placeholder="e.g. Midnight Roses (music video)"
              />
            </Field>
            <Field label="Song title">
              <Input
                value={state.song_title}
                onChange={(e) => set("song_title", e.target.value)}
                placeholder="The song this video is for"
              />
            </Field>
            <Field label="Artist">
              <Select
                value={state.artist_id || "_none_"}
                onValueChange={(v) => set("artist_id", v === "_none_" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick an artist" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">No artist linked</SelectItem>
                  {(artistsQuery.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={state.status}
                onValueChange={(v) => set("status", v as ProjectStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="in_production">In production</SelectItem>
                  <SelectItem value="editing">Editing</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Genre">
              <Input
                value={state.genre}
                onChange={(e) => set("genre", e.target.value)}
                placeholder="trap, R&B, indie..."
              />
            </Field>
            <Field label="Mood">
              <Input
                value={state.mood}
                onChange={(e) => set("mood", e.target.value)}
                placeholder="grimy, nostalgic, ethereal..."
              />
            </Field>
            <Field label="Visual style" full>
              <Input
                value={state.visual_style}
                onChange={(e) => set("visual_style", e.target.value)}
                placeholder="35mm grain, Hype Williams fish-eye, 2000s music video aesthetic..."
              />
            </Field>
          </div>
        </CollapsibleSection>

        {/* AUDIO */}
        <CollapsibleSection
          title="Audio"
          description="Drop the song. BPM is manual — type it in if you know it."
          badge={
            sectionCounts.audio ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                Staged
              </span>
            ) : undefined
          }
          defaultOpen
        >
          <AudioUploader staged={staged} onChange={setStaged} />
          <div className="max-w-[200px] pt-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              BPM
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              step="0.1"
              value={state.bpm}
              onChange={(e) => set("bpm", e.target.value)}
              placeholder="e.g. 142"
              className="mt-1.5 font-mono"
            />
          </div>
        </CollapsibleSection>

        {/* LYRICS */}
        <CollapsibleSection
          title="Lyrics"
          description="Paste the full lyrics. Used by the treatment generator and prompt compiler."
          badge={
            sectionCounts.lyrics ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                Filled
              </span>
            ) : undefined
          }
          defaultOpen={false}
        >
          <Textarea
            rows={12}
            value={state.lyrics}
            onChange={(e) => set("lyrics", e.target.value)}
            placeholder="[Intro]&#10;...&#10;&#10;[Verse 1]&#10;..."
            className="font-mono text-sm"
          />
        </CollapsibleSection>

        {/* SONG STRUCTURE */}
        <CollapsibleSection
          title="Song structure"
          description="Section markers used when planning shots. Add what you have; you can fill timestamps later."
          badge={
            sectionCounts.structure ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                {sectionCounts.structure} {sectionCounts.structure === 1 ? "section" : "sections"}
              </span>
            ) : undefined
          }
          defaultOpen={false}
        >
          <SongStructureEditor
            value={state.song_structure}
            onChange={(next) => set("song_structure", next)}
          />
        </CollapsibleSection>

        {/* VISUAL */}
        <CollapsibleSection
          title="Visual"
          description="Color palette and wardrobe defaults. These flow into prompts."
          badge={
            sectionCounts.palette ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                {sectionCounts.palette} {sectionCounts.palette === 1 ? "color" : "colors"}
              </span>
            ) : undefined
          }
          defaultOpen={false}
        >
          <Field label="Color palette" full>
            <ColorPaletteEditor
              value={state.color_palette}
              onChange={(next) => set("color_palette", next)}
            />
          </Field>
          <Field label="Wardrobe notes" full>
            <Textarea
              rows={3}
              value={state.wardrobe_notes}
              onChange={(e) => set("wardrobe_notes", e.target.value)}
              placeholder="Black silk shirt across all shots. Gold chain. Mid-rise jeans..."
            />
          </Field>
          <Field label="Production notes" full>
            <Textarea
              rows={2}
              value={state.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Anything else you want to remember."
            />
          </Field>
        </CollapsibleSection>

        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-2 rounded-md border border-border bg-background/95 p-3 backdrop-blur">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate({ to: "/" })}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!state.title.trim() || submitting}>
            {submitting ? "Creating..." : "Create project"}
          </Button>
        </div>
      </form>
    </>
  );
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
