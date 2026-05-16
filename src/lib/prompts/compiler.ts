import type {
  Artist,
  ArtistIdentityProfile,
  Json,
  Shot,
  VideoProject,
} from "@/integrations/supabase/types";
import type {
  CompileInput,
  CompiledPrompt,
  PromptOverrides,
  PromptVariables,
} from "./types";

/**
 * Compile a prompt template against a project/artist/shot context.
 *
 * Behaviour:
 *  - Placeholders use the syntax `{{namespace.key}}` where namespace is one of
 *    `artist`, `project`, `shot`.
 *  - Missing values are substituted with an empty string and reported in
 *    `unfilledPlaceholders` (deduped, in order of first appearance).
 *  - The template's `default_negative_prompt` is merged with the artist's
 *    `forbidden_inaccuracies` (if present) and any per-call `extra_negative`
 *    override. Duplicates and whitespace-only fragments are dropped.
 *  - `settings` is a shallow copy of the template's `default_settings_json`
 *    so callers can mutate without affecting the source row.
 *
 * The compiler does not know about providers — provider-specific tweaks happen
 * in each provider's `formatPrompt()` (see src/lib/providers/*.ts).
 */
export function compilePrompt(input: CompileInput): CompiledPrompt {
  const { template, project, artist, shot, overrides } = input;

  const variables = buildVariables({ project, artist, shot, overrides });

  const { text: promptText, unfilled } = substitute(template.template_body, variables);
  const cleanedPrompt = tidy(promptText);

  const negativePrompt = mergeNegative({
    templateNegative: template.default_negative_prompt,
    artistForbidden: artist?.forbidden_inaccuracies ?? null,
    extra: overrides?.extra_negative ?? null,
  });

  const settings = cloneSettings(template.default_settings_json);

  return {
    templateId: template.id,
    templateName: template.name,
    templateProvider: template.provider,
    templateCategory: template.category,
    promptText: cleanedPrompt,
    negativePrompt,
    settings,
    unfilledPlaceholders: unfilled,
    context: {
      projectId: project.id,
      artistId: artist?.id ?? null,
      shotId: shot?.id ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Build the variable bag
// ---------------------------------------------------------------------------
export function buildVariables(input: {
  project: VideoProject;
  artist: Artist | null;
  shot: Shot | null;
  overrides?: PromptOverrides;
}): PromptVariables {
  const { project, artist, shot, overrides } = input;
  const identity = parseIdentity(artist?.identity_profile_json);

  const distinguishing = combineDistinguishing(identity);

  return {
    artist: {
      ...identity,
      name: artist?.name,
      continuity: artist?.continuity_rules ?? undefined,
      forbidden: artist?.forbidden_inaccuracies ?? undefined,
      distinguishing,
    },
    project: {
      mood: project.mood ?? undefined,
      visual_style: project.visual_style ?? undefined,
      color_palette:
        project.color_palette.length > 0
          ? project.color_palette.join(", ")
          : undefined,
      genre: project.genre ?? undefined,
      bpm: project.bpm != null ? String(project.bpm) : undefined,
      title: project.title,
      song_title: project.song_title ?? undefined,
    },
    shot: {
      scene_description: overrides?.scene_description ?? shot?.scene_description ?? undefined,
      camera_direction: overrides?.camera_direction ?? shot?.camera_direction ?? undefined,
      lighting: overrides?.lighting ?? shot?.lighting ?? undefined,
      wardrobe: overrides?.wardrobe ?? shot?.wardrobe ?? undefined,
      environment: overrides?.environment ?? shot?.environment ?? undefined,
      duration: pickDuration(overrides, shot),
      shot_type: shot?.shot_type ?? undefined,
      priority: shot?.priority ?? undefined,
    },
  };
}

function parseIdentity(value: Json | null | undefined): ArtistIdentityProfile {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ArtistIdentityProfile;
  }
  return {};
}

function combineDistinguishing(identity: ArtistIdentityProfile): string | undefined {
  const parts: string[] = [];
  if (identity.tattoos) parts.push(identity.tattoos);
  if (identity.jewelry) parts.push(identity.jewelry);
  if (identity.distinguishing_features) parts.push(identity.distinguishing_features);
  const joined = parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join("; ");
  return joined || undefined;
}

function pickDuration(overrides: PromptOverrides | undefined, shot: Shot | null): string | undefined {
  const explicit = overrides?.duration_seconds ?? shot?.duration_seconds ?? null;
  if (explicit == null) return undefined;
  return String(explicit);
}

// ---------------------------------------------------------------------------
// Substitution
// ---------------------------------------------------------------------------
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\.([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Substitute {{namespace.key}} occurrences in `body` from `variables`.
 * Unfilled placeholders are returned in order-of-first-appearance, deduped.
 */
export function substitute(
  body: string,
  variables: PromptVariables,
): { text: string; unfilled: string[] } {
  const unfilled: string[] = [];
  const seen = new Set<string>();

  const text = body.replace(PLACEHOLDER_RE, (_match, namespace: string, key: string) => {
    const value = resolve(variables, namespace, key);
    if (value == null || (typeof value === "string" && value.trim() === "")) {
      const token = `{{${namespace}.${key}}}`;
      if (!seen.has(token)) {
        seen.add(token);
        unfilled.push(token);
      }
      return "";
    }
    return String(value);
  });

  return { text, unfilled };
}

function resolve(
  vars: PromptVariables,
  namespace: string,
  key: string,
): string | number | undefined {
  const ns = vars[namespace as keyof PromptVariables];
  if (!ns || typeof ns !== "object") return undefined;
  const value = (ns as Record<string, string | number | undefined>)[key];
  if (value == null) return undefined;
  return value;
}

// ---------------------------------------------------------------------------
// Negative-prompt merge
// ---------------------------------------------------------------------------
export function mergeNegative(input: {
  templateNegative: string | null | undefined;
  artistForbidden: string | null | undefined;
  extra: string | null | undefined;
}): string {
  const fragments: string[] = [];
  for (const src of [input.templateNegative, input.artistForbidden, input.extra]) {
    if (!src) continue;
    for (const piece of src.split(/[,;]+/)) {
      const t = piece.trim().replace(/\s+/g, " ");
      if (t) fragments.push(t);
    }
  }
  // Dedup while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of fragments) {
    const k = f.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out.join(", ");
}

// ---------------------------------------------------------------------------
// Tidy: clean up obvious artifacts from missing values
// ---------------------------------------------------------------------------
/**
 * Collapse runs caused by empty placeholder substitution:
 *   "Lighting: . Wardrobe: black"       -> "Wardrobe: black"
 *   "Camera: , Lighting: warm"          -> "Lighting: warm"
 *   "wearing  , distinguishing: X"      -> "distinguishing: X"
 * Plus generic whitespace collapse.
 */
export function tidy(text: string): string {
  let out = text;
  // Empty "Label: ." / "Label: ," — drop the label
  out = out.replace(/\b[A-Za-z][A-Za-z _-]{1,30}:\s*([.,;])/g, "$1");
  // Empty "wearing , " / "wearing . "
  out = out.replace(/\b(wearing|with|in|featuring)\s+([.,;])/gi, "$2");
  // Repeated punctuation
  out = out.replace(/([.,;])\s*\1+/g, "$1");
  // Comma immediately before a period
  out = out.replace(/,\s*\./g, ".");
  // Multiple spaces / spaces before punctuation
  out = out.replace(/[ \t]+/g, " ");
  out = out.replace(/\s+([.,;])/g, "$1");
  // Empty parens or brackets
  out = out.replace(/\(\s*\)/g, "");
  out = out.replace(/\[\s*\]/g, "");
  // Stray leading/trailing punctuation per line
  out = out
    .split("\n")
    .map((line) => line.trim().replace(/^[.,;\s]+/, "").replace(/[\s,;]+$/, ""))
    .join("\n");
  return out.trim();
}

// ---------------------------------------------------------------------------
// Settings clone
// ---------------------------------------------------------------------------
function cloneSettings(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}
