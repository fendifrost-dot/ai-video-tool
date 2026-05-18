import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Artist, ArtistIdentityProfile, Json } from "@/integrations/supabase/aliases";
import { useUpdateArtist } from "@/lib/queries/artists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const IDENTITY_FIELDS: { key: keyof ArtistIdentityProfile; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "face", label: "Face", placeholder: "Long face, sharp jawline, prominent cheekbones, deep-set brown eyes...", multiline: true },
  { key: "body", label: "Body", placeholder: "Lean athletic build, 6'1, broad shoulders..." },
  { key: "skin", label: "Skin", placeholder: "Warm brown, smooth, freckle across left cheek..." },
  { key: "hair", label: "Hair", placeholder: "Short coily black hair, fades on the sides, line-up..." },
  { key: "tattoos", label: "Tattoos", placeholder: "Left forearm: black ink rose, dates 2014. Right wrist: small cross.", multiline: true },
  { key: "jewelry", label: "Jewelry", placeholder: "Gold Cuban chain always worn. Diamond stud left ear.", multiline: true },
  { key: "wardrobe_defaults", label: "Wardrobe defaults", placeholder: "Black t-shirt, dark denim, white sneakers — base look unless shot specifies otherwise.", multiline: true },
  { key: "distinguishing_features", label: "Distinguishing features", placeholder: "Small scar above right eyebrow. Birthmark on left collarbone.", multiline: true },
];

type FormState = {
  name: string;
  bio: string;
  continuity_rules: string;
  forbidden_inaccuracies: string;
  preferred_lighting: string;
  camera_rules: string;
  notes: string;
  identity: ArtistIdentityProfile;
};

function buildInitialState(artist: Artist): FormState {
  const identity = parseIdentity(artist.identity_profile_json);
  return {
    name: artist.name,
    bio: artist.bio ?? "",
    continuity_rules: artist.continuity_rules ?? "",
    forbidden_inaccuracies: artist.forbidden_inaccuracies ?? "",
    preferred_lighting: artist.preferred_lighting ?? "",
    camera_rules: artist.camera_rules ?? "",
    notes: artist.notes ?? "",
    identity,
  };
}

function parseIdentity(value: Json): ArtistIdentityProfile {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ArtistIdentityProfile;
  }
  return {};
}

export function ArtistIdentityForm({ artist }: { artist: Artist }) {
  const update = useUpdateArtist();
  const [state, setState] = useState<FormState>(() => buildInitialState(artist));
  const [dirty, setDirty] = useState(false);

  // Reset form when underlying artist changes (e.g. external save).
  useEffect(() => {
    setState(buildInitialState(artist));
    setDirty(false);
  }, [artist.id, artist.updated_at]);

  function setTop<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function setIdentity<K extends keyof ArtistIdentityProfile>(
    key: K,
    value: ArtistIdentityProfile[K],
  ) {
    setState((s) => ({ ...s, identity: { ...s.identity, [key]: value } }));
    setDirty(true);
  }

  async function handleSave() {
    try {
      await update.mutateAsync({
        id: artist.id,
        patch: {
          name: state.name.trim() || artist.name,
          bio: state.bio.trim() || null,
          continuity_rules: state.continuity_rules.trim() || null,
          forbidden_inaccuracies: state.forbidden_inaccuracies.trim() || null,
          preferred_lighting: state.preferred_lighting.trim() || null,
          camera_rules: state.camera_rules.trim() || null,
          notes: state.notes.trim() || null,
          identity_profile_json: cleanIdentity(state.identity) as Json,
        },
      });
      setDirty(false);
      toast.success("Artist saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Basics
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input
              value={state.name}
              onChange={(e) => setTop("name", e.target.value)}
            />
          </Field>
          <Field label="Bio" full>
            <Textarea
              rows={2}
              value={state.bio}
              onChange={(e) => setTop("bio", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Identity profile
        </h2>
        <p className="text-xs text-muted-foreground">
          These fields are merged into every prompt by the compiler — keep them precise.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {IDENTITY_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} full={f.multiline}>
              {f.multiline ? (
                <Textarea
                  rows={3}
                  placeholder={f.placeholder}
                  value={state.identity[f.key] ?? ""}
                  onChange={(e) => setIdentity(f.key, e.target.value)}
                />
              ) : (
                <Input
                  placeholder={f.placeholder}
                  value={state.identity[f.key] ?? ""}
                  onChange={(e) => setIdentity(f.key, e.target.value)}
                />
              )}
            </Field>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Continuity & direction rules
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Continuity rules"
            help="Must-include rules. Auto-appended to every prompt."
            full
          >
            <Textarea
              rows={3}
              placeholder='e.g. "always wears gold Cuban chain", "tattoo on left forearm only", "never bares teeth"'
              value={state.continuity_rules}
              onChange={(e) => setTop("continuity_rules", e.target.value)}
            />
          </Field>
          <Field
            label="Forbidden inaccuracies"
            help="Folded into every negative prompt."
            full
          >
            <Textarea
              rows={3}
              placeholder='e.g. "extra tattoos", "wrong jewelry", "facial hair when shot is clean-shaven"'
              value={state.forbidden_inaccuracies}
              onChange={(e) => setTop("forbidden_inaccuracies", e.target.value)}
            />
          </Field>
          <Field label="Preferred lighting">
            <Input
              placeholder="warm key light, low fill, hard rim"
              value={state.preferred_lighting}
              onChange={(e) => setTop("preferred_lighting", e.target.value)}
            />
          </Field>
          <Field label="Camera rules">
            <Input
              placeholder="35mm equivalent, eye-level or slightly low, shallow DOF"
              value={state.camera_rules}
              onChange={(e) => setTop("camera_rules", e.target.value)}
            />
          </Field>
          <Field label="Notes" full>
            <Textarea
              rows={2}
              value={state.notes}
              onChange={(e) => setTop("notes", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button onClick={handleSave} disabled={!dirty || update.isPending}>
          {update.isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  help,
  children,
  full,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function cleanIdentity(identity: ArtistIdentityProfile): ArtistIdentityProfile {
  const out: ArtistIdentityProfile = {};
  for (const [k, v] of Object.entries(identity)) {
    if (typeof v === "string" && v.trim()) {
      (out as Record<string, string>)[k] = v.trim();
    }
  }
  return out;
}
