import type {
  Artist,
  ArtistIdentityProfile,
  ProviderName,
  PromptTemplate,
  Shot,
  VideoProject,
} from "@/integrations/supabase/types";

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
   * The artist's locked reference asset (is_primary_reference = true on
   * artist_assets). The compiler reads this to populate `referenceImagePath`
   * on the output. May be null/undefined; in that case `referenceImagePath`
   * is null and providers fall back to text-only prompting.
   */
  lockedReferenceAssetPath?: string | null;
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
   * Path (within the artist-assets bucket) of the artist's locked reference
   * image, if one exists. Providers that support image-to-video should
   * resolve this to a signed URL and attach it to their API request. Null
   * = text-only generation.
   */
  referenceImagePath: string | null;

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
