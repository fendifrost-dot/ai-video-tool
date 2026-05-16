import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import type {
  ProviderName,
  Shot,
  ShotPriority,
  ShotStatus,
  ShotType,
} from "@/integrations/supabase/types";
import {
  SHOT_PRIORITY_OPTIONS,
  SHOT_STATUS_OPTIONS,
  SHOT_TYPE_OPTIONS,
  useUpdateShot,
} from "@/lib/queries/shots";
import { useArtist } from "@/lib/queries/artists";
import { useProject } from "@/lib/queries/projects";
import {
  lintShotContinuity,
  type ContinuityField,
  type ContinuityWarning,
} from "@/lib/continuity/lint";
import { PROVIDER_ORDER, getProvider } from "@/lib/providers/registry";
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

type FormState = {
  shot_number: number;
  song_section: string;
  timestamp_start: string;
  timestamp_end: string;
  shot_type: ShotType | "";
  recommended_tool: ProviderName | "";
  priority: ShotPriority;
  status: ShotStatus;
  scene_description: string;
  camera_direction: string;
  lighting: string;
  wardrobe: string;
  environment: string;
  notes: string;
};

function fromShot(s: Shot): FormState {
  return {
    shot_number: s.shot_number,
    song_section: s.song_section ?? "",
    timestamp_start: s.timestamp_start != null ? String(s.timestamp_start) : "",
    timestamp_end: s.timestamp_end != null ? String(s.timestamp_end) : "",
    shot_type: s.shot_type ?? "",
    recommended_tool: s.recommended_tool ?? "",
    priority: s.priority,
    status: s.status,
    scene_description: s.scene_description ?? "",
    camera_direction: s.camera_direction ?? "",
    lighting: s.lighting ?? "",
    wardrobe: s.wardrobe ?? "",
    environment: s.environment ?? "",
    notes: s.notes ?? "",
  };
}

export function ShotForm({ shot }: { shot: Shot }) {
  const update = useUpdateShot();
  const projectQuery = useProject(shot.project_id);
  const artistQuery = useArtist(projectQuery.data?.artist_id ?? undefined);
  const [state, setState] = useState<FormState>(() => fromShot(shot));
  const [dirty, setDirty] = useState(false);

  // Lint runs against the LIVE form state, not the persisted shot — the user
  // sees warnings as soon as they type "no jewelry" in wardrobe, before
  // saving. We build a synthetic Shot from the form state for the lint.
  const lintWarnings = useMemo<ContinuityWarning[]>(() => {
    const synthetic: Shot = {
      ...shot,
      scene_description: state.scene_description,
      camera_direction: state.camera_direction,
      lighting: state.lighting,
      wardrobe: state.wardrobe,
      environment: state.environment,
    };
    return lintShotContinuity(artistQuery.data ?? null, synthetic);
  }, [shot, state, artistQuery.data]);

  const warningsByField = useMemo(() => {
    const map = new Map<ContinuityField, ContinuityWarning[]>();
    for (const w of lintWarnings) {
      const arr = map.get(w.field) ?? [];
      arr.push(w);
      map.set(w.field, arr);
    }
    return map;
  }, [lintWarnings]);

  useEffect(() => {
    setState(fromShot(shot));
    setDirty(false);
  }, [shot.id, shot.updated_at]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    try {
      await update.mutateAsync({
        id: shot.id,
        patch: {
          shot_number: state.shot_number,
          song_section: state.song_section.trim() || null,
          timestamp_start:
            state.timestamp_start.trim() === "" ? null : Number(state.timestamp_start),
          timestamp_end:
            state.timestamp_end.trim() === "" ? null : Number(state.timestamp_end),
          shot_type: state.shot_type === "" ? null : state.shot_type,
          recommended_tool:
            state.recommended_tool === "" ? null : state.recommended_tool,
          priority: state.priority,
          status: state.status,
          scene_description: state.scene_description.trim() || null,
          camera_direction: state.camera_direction.trim() || null,
          lighting: state.lighting.trim() || null,
          wardrobe: state.wardrobe.trim() || null,
          environment: state.environment.trim() || null,
          notes: state.notes.trim() || null,
        },
      });
      setDirty(false);
      toast.success("Shot saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="space-y-6">
      {lintWarnings.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            Continuity check: {lintWarnings.length}{" "}
            {lintWarnings.length === 1 ? "issue" : "issues"} found
          </div>
          <div className="mt-2 space-y-1">
            {lintWarnings.map((w, i) => (
              <div
                key={i}
                className={`text-[11px] ${
                  w.severity === "error" ? "text-rose-200" : "text-amber-200/90"
                }`}
              >
                <span className="font-mono uppercase tracking-wider opacity-70">
                  {w.field.replace("_", " ")}
                </span>{" "}
                — {w.message}
              </div>
            ))}
          </div>
        </div>
      )}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Basics
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Shot number">
            <Input
              type="number"
              min={1}
              value={state.shot_number}
              onChange={(e) => set("shot_number", Number(e.target.value))}
              className="font-mono"
            />
          </Field>
          <Field label="Song section">
            <Input
              list="shot-form-sections"
              value={state.song_section}
              onChange={(e) => set("song_section", e.target.value)}
              placeholder="hook, verse_1, bridge..."
              className="font-mono"
            />
            <datalist id="shot-form-sections">
              <option value="intro" />
              <option value="verse_1" />
              <option value="pre_chorus" />
              <option value="hook" />
              <option value="verse_2" />
              <option value="bridge" />
              <option value="breakdown" />
              <option value="outro" />
            </datalist>
          </Field>
          <Field label="Shot type">
            <Select
              value={state.shot_type || "_none_"}
              onValueChange={(v) => set("shot_type", v === "_none_" ? "" : (v as ShotType))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">— not set —</SelectItem>
                {SHOT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Start (s)">
            <Input
              type="number"
              step="0.1"
              value={state.timestamp_start}
              onChange={(e) => set("timestamp_start", e.target.value)}
              className="font-mono"
            />
          </Field>
          <Field label="End (s)">
            <Input
              type="number"
              step="0.1"
              value={state.timestamp_end}
              onChange={(e) => set("timestamp_end", e.target.value)}
              className="font-mono"
            />
          </Field>
          <Field label="Recommended tool">
            <Select
              value={state.recommended_tool || "_none_"}
              onValueChange={(v) =>
                set("recommended_tool", v === "_none_" ? "" : (v as ProviderName))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">— not set —</SelectItem>
                {PROVIDER_ORDER.map((id) => (
                  <SelectItem key={id} value={id}>
                    {getProvider(id).displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={state.priority}
              onValueChange={(v) => set("priority", v as ShotPriority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOT_PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={state.status}
              onValueChange={(v) => set("status", v as ShotStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHOT_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Description
        </h2>
        <Field label="Scene" full>
          <Textarea
            rows={3}
            value={state.scene_description}
            onChange={(e) => set("scene_description", e.target.value)}
            placeholder="What's happening in the shot."
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Camera direction">
            <Textarea
              rows={2}
              value={state.camera_direction}
              onChange={(e) => set("camera_direction", e.target.value)}
              placeholder="slow dolly in, eye level, 35mm..."
            />
          </Field>
          <Field label="Lighting">
            <Textarea
              rows={2}
              value={state.lighting}
              onChange={(e) => set("lighting", e.target.value)}
              placeholder="warm key, hard rim, low fill..."
            />
          </Field>
          <Field label="Wardrobe">
            <Textarea
              rows={2}
              value={state.wardrobe}
              onChange={(e) => set("wardrobe", e.target.value)}
              placeholder="black silk shirt + gold chain"
            />
          </Field>
          <Field label="Environment">
            <Textarea
              rows={2}
              value={state.environment}
              onChange={(e) => set("environment", e.target.value)}
              placeholder="narrow alleyway at night, neon signage"
            />
          </Field>
        </div>
        <Field label="Notes" full>
          <Textarea
            rows={2}
            value={state.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </section>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button onClick={handleSave} disabled={!dirty || update.isPending}>
          {update.isPending ? "Saving..." : "Save shot"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

// =============================================================================
// Continuity-lint inline warnings
// =============================================================================
function FieldWarnings({ warnings }: { warnings: ContinuityWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`flex items-start gap-1.5 rounded-sm border px-2 py-1 text-[11px] ${
            w.severity === "error"
              ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          {w.severity === "error" ? (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}
