import { useEffect, useState } from "react";
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
  const [state, setState] = useState<FormState>(() => fromShot(shot));
  const [dirty, setDirty] = useState(false);

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
