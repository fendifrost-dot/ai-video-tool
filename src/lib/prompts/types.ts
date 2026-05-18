import type {
  Artist,
  ArtistIdentityProfile,
  ProviderName,
  PromptTemplate,
  Shot,
  VideoProject,
} from "@/integrations/supabase/aliases";

/**
 * Input passed to the compiler. Any of artist/shot may be null — the compiler
 * leaves their placeholders blank and surfaces an `unfilledPlaceholders` list
 * so the UI can warn before the user copies.
 */
export type CompileInput = {
  template: PromptTemplate;
  project: VideoProject;
  artist: Artist | null;
  shot: Shot | null;
  /**
   * Per-call overrides. Useful for the Prompt Builder when the user is
   * iterating on a one-off variation without writing it back to the shot row.
   */
  overrides?: PromptOverrides;
  /**
   * Legacy single-reference path. From the pre-Phase-A model where each artist
   * had one is_primary_reference asset on artist_assets. Still consulted as a
   * fallback when no Character DNA features are available. May be null.
   */
  lockedReferenceAssetPath?: string | null;
  /**
   * Phase A: the artist's locked Character DNA paths, in priority order
   * (face, hands, jewelry, tattoos, hair, teeth, body). Each entry is a path
   * inside the artist-assets bucket. The compiler emits these into
   * `referenceImagePaths` on the output and providers that support multi-image
   * conditioning consume the full list. Pre-de-duped by the caller.
   */
  lockedCharacterFeaturePaths?: string[];
  /**
   * Phase 2: when a shot is bound to a saved `artist_looks` row, the look's
   * generated image is the strongest reference we have — it already encodes
   * face, body, outfit, jewelry. The compiler prepends this to
   * `referenceImagePaths` so image-to-video providers (Runway gen4_turbo,
   * Higgsfield, Veo, etc.) pull it as the primary subject reference.
   *
   * Stored as a path inside the `look-composites` bucket.
   */
  lockedLookImagePath?: string | null;
};

export type PromptOverrides = {
  scene_description?: string;
  camera_direction?: string;
  lighting?: string;
  wardrobe?: string;
  environment?: string;
  duration_seconds?: number | null;
  /**
   * Extra negative-prompt fragments the user wants appended for this run only.
   */
  extra_negative?: string;
};

/**
 * Output of the compiler before a provider's formatPrompt runs.
 */
export type CompiledPrompt = {
  templateId: string;
  templateName: string;
  templateProvider: ProviderName | null;
  templateCategory: string;

  /** The substituted prompt body. */
  promptText: string;
  /** Merged negative prompt (template default + artist forbidden + override). */
  negativePrompt: string;
  /** Settings carried from the template. The provider may augment these. */
  settings: Record<string, unknown>;

  /** Placeholders that had no matching value. */
  unfilledPlaceholders: string[];

  /**
   * Legacy single reference path. Kept for backwards compatibility with the
   * existing GenerateButton + provider formatters that only know about one
   * image. Set to the first entry in `referenceImagePaths` when that list is
   * non-empty, falling back to `lockedReferenceAssetPath`.
   */
  referenceImagePath: string | null;

  /**
   * Phase A: full list of locked Character DNA reference paths (face, hands,
   * jewelry, tattoos, hair, teeth, body) in priority order, de-duped. Empty
   * when the artist has no locked features yet — in that case
   * `referenceImagePath` may still be set from the legacy single-reference
   * path. Providers that support multi-image conditioning should resolve each
   * entry to a signed URL.
   */
  referenceImagePaths: string[];

  /** Bookkeeping so the UI can store result back to the prompts table. */
  context: {
    projectId: string;
    artistId: string | null;
    shotId: string | null;
  };
};

/**
 * Output after the provider's formatPrompt runs. Same shape as CompiledPrompt
 * plus a final provider stamp.
 */
export type FormattedPrompt = CompiledPrompt & {
  provider: ProviderName;
};

/**
 * The compact variable bag the compiler builds from artist/project/shot.
 * Exposed so tests can assert against it.
 */
export type PromptVariables = {
  artist: Partial<ArtistIdentityProfile> & {
    name?: string;
    continuity?: string;
    forbidden?: string;
    /** Combined tattoos + jewelry + distinguishing_features, comma-joined. */
    distinguishing?: string;
  };
  project: {
    mood?: string;
    visual_style?: string;
    color_palette?: string;
    genre?: string;
    bpm?: string;
    title?: string;
    song_title?: string;
  };
  shot: {
    scene_description?: string;
    camera_direction?: string;
    lighting?: string;
    wardrobe?: string;
    environment?: string;
    duration?: string;
    shot_type?: string;
    priority?: string;
  };
};

/** A placeholder string that didn't resolve to a value. */
export type UnfilledPlaceholder = string;
