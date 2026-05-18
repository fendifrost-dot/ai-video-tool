import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import type {
  PromptTemplate,
  ProviderName,
  Shot,
  VideoProject,
} from "@/integrations/supabase/aliases";
import { compilePrompt } from "@/lib/prompts/compiler";
import { getProvider, PROVIDER_ORDER } from "@/lib/providers/registry";
import type {
  CompiledPrompt,
  PromptOverrides,
} from "@/lib/prompts/types";
import { useArtist, useArtistAssets } from "@/lib/queries/artists";
import {
  pickLockedFeaturePaths,
  useCharacterFeatures,
} from "@/lib/queries/characterFeatures";
import { useProjectShots } from "@/lib/queries/shots";
import { useShotLockedLook } from "@/lib/queries/shotLockedLook";
import { usePromptTemplates } from "@/lib/queries/promptTemplates";
import { useSavePrompt } from "@/lib/queries/prompts";
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
import { TemplatePicker } from "./TemplatePicker";
import { PromptOutputView } from "./PromptOutputView";

const NONE_VALUE = "_none_";

export function PromptBuilder({
  project,
  initialShotId,
}: {
  project: VideoProject;
  initialShotId?: string;
}) {
  const templatesQuery = usePromptTemplates();
  const shotsQuery = useProjectShots(project.id);
  const artistQuery = useArtist(project.artist_id ?? undefined);
  const artistAssetsQuery = useArtistAssets(project.artist_id ?? undefined);
  const characterFeaturesQuery = useCharacterFeatures(project.artist_id ?? undefined);

  // Phase A: the canonical locked-feature paths from character_features, in
  // priority order (face → hands → jewelry → tattoos → hair → teeth → body).
  // Each path is inside the artist-assets bucket.
  const lockedFeaturePaths = useMemo(() => {
    return pickLockedFeaturePaths(characterFeaturesQuery.data ?? []);
  }, [characterFeaturesQuery.data]);

  // Legacy single-asset fallback: whichever artist_asset has
  // is_primary_reference = true, or the face_front 360 slot otherwise. Used
  // only when no locked Character DNA features exist yet — keeps existing
  // artist profiles working through the dual-write window.
  const lockedAsset = useMemo(() => {
    const assets = artistAssetsQuery.data ?? [];
    return (
      assets.find((a) => a.is_primary_reference) ??
      assets.find((a) => a.asset_type === "face_front") ??
      null
    );
  }, [artistAssetsQuery.data]);

  const savePrompt = useSavePrompt();

  const [templateId, setTemplateId] = useState<string | null>(null);
  const [shotId, setShotId] = useState<string | null>(initialShotId ?? null);
  const [providerOverride, setProviderOverride] = useState<ProviderName | null>(null);
  const [overrides, setOverrides] = useState<PromptOverrides>({});
  const [extraNegative, setExtraNegative] = useState("");
  const [notes, setNotes] = useState("");

  // Pick the first matching template once data loads
  useEffect(() => {
    if (templateId) return;
    if (!templatesQuery.data || templatesQuery.data.length === 0) return;
    setTemplateId(templatesQuery.data[0].id);
  }, [templatesQuery.data, templateId]);

  const template: PromptTemplate | null = useMemo(() => {
    if (!templateId) return null;
    return templatesQuery.data?.find((t) => t.id === templateId) ?? null;
  }, [templateId, templatesQuery.data]);

  const shot: Shot | null = useMemo(() => {
    if (!shotId) return null;
    return shotsQuery.data?.find((s) => s.id === shotId) ?? null;
  }, [shotId, shotsQuery.data]);

  const effectiveProvider: ProviderName = useMemo(() => {
    if (providerOverride) return providerOverride;
    if (template?.provider) return template.provider;
    return "runway";
  }, [providerOverride, template]);

  // Phase 2: if the picked shot has a locked_look_id, fetch the look so we
  // can prepend its composed image to the reference list. The composed image
  // already encodes face + body + outfit + jewelry, so it's the strongest
  // single reference for image-to-video providers.
  const lockedLookQuery = useShotLockedLook(shot?.id ?? undefined);
  const lockedLookImagePath = useMemo(
    () => lockedLookQuery.data?.generated_storage_path ?? null,
    [lockedLookQuery.data],
  );

  const compiled: CompiledPrompt | null = useMemo(() => {
    if (!template) return null;
    return compilePrompt({
      template,
      project,
      artist: artistQuery.data ?? null,
      shot,
      overrides: {
        ...overrides,
        extra_negative: extraNegative.trim() || undefined,
      },
      lockedLookImagePath,
      lockedReferenceAssetPath: lockedAsset?.file_url ?? null,
      lockedCharacterFeaturePaths: lockedFeaturePaths,
    });
  }, [
    template,
    project,
    artistQuery.data,
    shot,
    overrides,
    extraNegative,
    lockedLookImagePath,
    lockedAsset,
    lockedFeaturePaths,
  ]);

  async function handleSave() {
    if (!compiled || !template) return;
    try {
      const formatted = getProvider(effectiveProvider).formatPrompt(compiled);
      await savePrompt.mutateAsync({
        formatted,
        templateId: template.id,
        notes: notes.trim() || null,
      });
      toast.success("Prompt saved");
      setNotes("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* LEFT COLUMN — configuration */}
      <div className="space-y-5">
        <Section title="Template">
          <TemplatePicker
            templates={templatesQuery.data ?? []}
            value={templateId}
            onChange={setTemplateId}
            providerHint={effectiveProvider}
          />
          {template?.description && (
            <p className="text-xs text-muted-foreground">{template.description}</p>
          )}
        </Section>

        <Section title="Provider">
          <Select
            value={providerOverride ?? template?.provider ?? "runway"}
            onValueChange={(v) => setProviderOverride(v as ProviderName)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_ORDER.map((id) => {
                const p = getProvider(id);
                return (
                  <SelectItem key={id} value={id}>
                    {p.displayName}
                    {!p.apiReady && (
                      <span className="ml-1 text-[10px] text-muted-foreground">manual</span>
                    )}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Choose a different provider to apply that provider's formatter (e.g. Grok normalizes to comma-tags, Veo to sentences).
          </p>
        </Section>

        <Section title="Shot (optional)">
          <Select
            value={shotId ?? NONE_VALUE}
            onValueChange={(v) => setShotId(v === NONE_VALUE ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="No shot — use overrides only" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No shot</SelectItem>
              {(shotsQuery.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  #{s.shot_number}
                  {s.song_section ? ` · ${s.song_section}` : ""}
                  {s.scene_description ? ` · ${truncate(s.scene_description, 36)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>

        <Section title="Overrides">
          <p className="text-xs text-muted-foreground">
            Fill any field to override the linked shot. Leave blank to use the shot value.
          </p>
          <OverrideField
            label="Scene description"
            placeholder={shot?.scene_description ?? ""}
            value={overrides.scene_description ?? ""}
            onChange={(v) => setOverrides((o) => ({ ...o, scene_description: v || undefined }))}
            multiline
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <OverrideField
              label="Camera"
              placeholder={shot?.camera_direction ?? ""}
              value={overrides.camera_direction ?? ""}
              onChange={(v) => setOverrides((o) => ({ ...o, camera_direction: v || undefined }))}
            />
            <OverrideField
              label="Lighting"
              placeholder={shot?.lighting ?? ""}
              value={overrides.lighting ?? ""}
              onChange={(v) => setOverrides((o) => ({ ...o, lighting: v || undefined }))}
            />
            <OverrideField
              label="Wardrobe"
              placeholder={shot?.wardrobe ?? ""}
              value={overrides.wardrobe ?? ""}
              onChange={(v) => setOverrides((o) => ({ ...o, wardrobe: v || undefined }))}
            />
            <OverrideField
              label="Environment"
              placeholder={shot?.environment ?? ""}
              value={overrides.environment ?? ""}
              onChange={(v) => setOverrides((o) => ({ ...o, environment: v || undefined }))}
            />
          </div>
          <OverrideField
            label="Extra negative prompt"
            placeholder='e.g. "no logos, no text overlays"'
            value={extraNegative}
            onChange={setExtraNegative}
            multiline
          />
        </Section>

        <Section title="Save to project (optional)">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Notes
          </Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='e.g. "v2 — tightened wardrobe, swapped camera move"'
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleSave}
              disabled={!compiled || savePrompt.isPending}
            >
              <Save className="mr-1.5 h-4 w-4" />
              {savePrompt.isPending ? "Saving..." : "Save prompt"}
            </Button>
          </div>
        </Section>
      </div>

      {/* RIGHT COLUMN — output */}
      <div className="lg:sticky lg:top-4">
        <Section title="Compiled output">
          <PromptOutputView compiled={compiled} initialProvider={effectiveProvider} />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-md border border-border bg-card/30 p-4">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function OverrideField({
  label,
  placeholder,
  value,
  onChange,
  multiline,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {multiline ? (
        <Textarea
          rows={2}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
