// Manually maintained until Lovable auto-regen catches up.
// Mirrors supabase/migrations/20260514210000_initial_schema.sql.
// If Lovable regenerates this file, the auto-generated version should be
// functionally identical — overwrite freely.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// Enum types
// ---------------------------------------------------------------------------
export type ProjectStatus =
  | "draft"
  | "in_production"
  | "editing"
  | "complete"
  | "archived";

export type ArtistAssetType =
  | "face_front"
  | "face_left"
  | "face_right"
  | "face_3q_left"
  | "face_3q_right"
  | "face_top"
  | "face_bottom"
  | "mouth_open"
  | "mouth_closed"
  | "expression"
  | "body"
  | "wardrobe"
  | "jewelry"
  | "tattoo"
  | "hair"
  | "other";

export type ShotType =
  | "performance"
  | "b_roll"
  | "narrative"
  | "vfx"
  | "transition"
  | "lyric_visual";

export type ShotStatus =
  | "planned"
  | "generated"
  | "approved"
  | "rejected"
  | "needs_regen";

export type ShotPriority = "low" | "normal" | "high" | "hero";

export type ProviderName =
  | "runway"
  | "veo"
  | "gemini"
  | "grok"
  | "higgsfield"
  | "pika"
  | "fal"
  | "openai"
  | "firefly"
  | "frame_io"
  | "manual"
  | "other";

export type PromptTemplateCategory =
  | "text_to_video"
  | "image_to_video"
  | "lipsync"
  | "greenscreen"
  | "vfx"
  | "b_roll"
  | "transition"
  | "performance"
  | "universal";

export type ProjectAssetType =
  | "reference_image"
  | "reference_video"
  | "audio"
  | "lyrics_doc"
  | "generated_still"
  | "generated_clip"
  | "edited_clip"
  | "premiere_export"
  | "ae_asset"
  | "lut"
  | "overlay"
  | "sfx"
  | "thumbnail"
  | "social_cutdown"
  | "other";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "archived";

export type ExportType =
  | "premiere_ready"
  | "after_effects"
  | "full_package"
  | "approved_clips_only"
  | "review_pack";

export type ExportStatus = "pending" | "building" | "complete" | "failed";

export type ProviderJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

// ---------------------------------------------------------------------------
// Database tables
// ---------------------------------------------------------------------------
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      artists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          bio: string | null;
          identity_profile_json: Json;
          continuity_rules: string | null;
          forbidden_inaccuracies: string | null;
          preferred_lighting: string | null;
          camera_rules: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          bio?: string | null;
          identity_profile_json?: Json;
          continuity_rules?: string | null;
          forbidden_inaccuracies?: string | null;
          preferred_lighting?: string | null;
          camera_rules?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          bio?: string | null;
          identity_profile_json?: Json;
          continuity_rules?: string | null;
          forbidden_inaccuracies?: string | null;
          preferred_lighting?: string | null;
          camera_rules?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      artist_assets: {
        Row: {
          id: string;
          user_id: string;
          artist_id: string;
          asset_type: ArtistAssetType;
          file_url: string;
          description: string | null;
          tags: string[];
          is_primary_reference: boolean;
          metadata_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          artist_id: string;
          asset_type: ArtistAssetType;
          file_url: string;
          description?: string | null;
          tags?: string[];
          is_primary_reference?: boolean;
          metadata_json?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          artist_id?: string;
          asset_type?: ArtistAssetType;
          file_url?: string;
          description?: string | null;
          tags?: string[];
          is_primary_reference?: boolean;
          metadata_json?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "artist_assets_artist_id_fkey";
            columns: ["artist_id"];
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
        ];
      };

      video_projects: {
        Row: {
          id: string;
          user_id: string;
          artist_id: string | null;
          title: string;
          song_title: string | null;
          genre: string | null;
          bpm: number | null;
          mood: string | null;
          visual_style: string | null;
          color_palette: string[];
          wardrobe_notes: string | null;
          lyrics: string | null;
          song_structure_json: Json;
          treatment_json: Json;
          status: ProjectStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          artist_id?: string | null;
          title: string;
          song_title?: string | null;
          genre?: string | null;
          bpm?: number | null;
          mood?: string | null;
          visual_style?: string | null;
          color_palette?: string[];
          wardrobe_notes?: string | null;
          lyrics?: string | null;
          song_structure_json?: Json;
          treatment_json?: Json;
          status?: ProjectStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["video_projects"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "video_projects_artist_id_fkey";
            columns: ["artist_id"];
            referencedRelation: "artists";
            referencedColumns: ["id"];
          },
        ];
      };

      shots: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          shot_number: number;
          song_section: string | null;
          timestamp_start: number | null;
          timestamp_end: number | null;
          duration_seconds: number | null;
          shot_type: ShotType | null;
          scene_description: string | null;
          camera_direction: string | null;
          lighting: string | null;
          wardrobe: string | null;
          environment: string | null;
          recommended_tool: ProviderName | null;
          priority: ShotPriority;
          status: ShotStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          shot_number: number;
          song_section?: string | null;
          timestamp_start?: number | null;
          timestamp_end?: number | null;
          shot_type?: ShotType | null;
          scene_description?: string | null;
          camera_direction?: string | null;
          lighting?: string | null;
          wardrobe?: string | null;
          environment?: string | null;
          recommended_tool?: ProviderName | null;
          priority?: ShotPriority;
          status?: ShotStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["shots"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "shots_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "video_projects";
            referencedColumns: ["id"];
          },
        ];
      };

      prompt_templates: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          description: string | null;
          provider: ProviderName | null;
          category: PromptTemplateCategory;
          template_body: string;
          default_negative_prompt: string | null;
          default_settings_json: Json;
          is_seed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          description?: string | null;
          provider?: ProviderName | null;
          category?: PromptTemplateCategory;
          template_body: string;
          default_negative_prompt?: string | null;
          default_settings_json?: Json;
          is_seed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["prompt_templates"]["Insert"]>;
        Relationships: [];
      };

      prompts: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          shot_id: string | null;
          template_id: string | null;
          provider: ProviderName;
          prompt_text: string;
          negative_prompt: string | null;
          settings_json: Json;
          version_number: number;
          parent_prompt_id: string | null;
          result_asset_id: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          shot_id?: string | null;
          template_id?: string | null;
          provider: ProviderName;
          prompt_text: string;
          negative_prompt?: string | null;
          settings_json?: Json;
          version_number?: number;
          parent_prompt_id?: string | null;
          result_asset_id?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["prompts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "prompts_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "video_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompts_shot_id_fkey";
            columns: ["shot_id"];
            referencedRelation: "shots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompts_template_id_fkey";
            columns: ["template_id"];
            referencedRelation: "prompt_templates";
            referencedColumns: ["id"];
          },
        ];
      };

      project_assets: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          shot_id: string | null;
          prompt_id: string | null;
          asset_type: ProjectAssetType;
          file_url: string;
          source_tool: ProviderName | null;
          approval_status: ApprovalStatus;
          version_number: number;
          parent_asset_id: string | null;
          metadata_json: Json;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          shot_id?: string | null;
          prompt_id?: string | null;
          asset_type: ProjectAssetType;
          file_url: string;
          source_tool?: ProviderName | null;
          approval_status?: ApprovalStatus;
          version_number?: number;
          parent_asset_id?: string | null;
          metadata_json?: Json;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["project_assets"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "project_assets_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "video_projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_assets_shot_id_fkey";
            columns: ["shot_id"];
            referencedRelation: "shots";
            referencedColumns: ["id"];
          },
        ];
      };

      clip_reviews: {
        Row: {
          id: string;
          user_id: string;
          asset_id: string;
          face_consistency_score: number | null;
          realism_score: number | null;
          lighting_score: number | null;
          wardrobe_score: number | null;
          camera_score: number | null;
          lipsync_score: number | null;
          final_usefulness: boolean | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          asset_id: string;
          face_consistency_score?: number | null;
          realism_score?: number | null;
          lighting_score?: number | null;
          wardrobe_score?: number | null;
          camera_score?: number | null;
          lipsync_score?: number | null;
          final_usefulness?: boolean | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["clip_reviews"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "clip_reviews_asset_id_fkey";
            columns: ["asset_id"];
            referencedRelation: "project_assets";
            referencedColumns: ["id"];
          },
        ];
      };

      export_packages: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          export_type: ExportType;
          file_url: string | null;
          manifest_json: Json;
          status: ExportStatus;
          error_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          export_type: ExportType;
          file_url?: string | null;
          manifest_json?: Json;
          status?: ExportStatus;
          error_text?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["export_packages"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "export_packages_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "video_projects";
            referencedColumns: ["id"];
          },
        ];
      };

      provider_jobs: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          prompt_id: string | null;
          provider: ProviderName;
          external_job_id: string | null;
          status: ProviderJobStatus;
          result_asset_id: string | null;
          request_payload_json: Json;
          response_payload_json: Json;
          error_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          prompt_id?: string | null;
          provider: ProviderName;
          external_job_id?: string | null;
          status?: ProviderJobStatus;
          result_asset_id?: string | null;
          request_payload_json?: Json;
          response_payload_json?: Json;
          error_text?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["provider_jobs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      project_status: ProjectStatus;
      artist_asset_type: ArtistAssetType;
      shot_type: ShotType;
      shot_status: ShotStatus;
      shot_priority: ShotPriority;
      provider_name: ProviderName;
      prompt_template_category: PromptTemplateCategory;
      project_asset_type: ProjectAssetType;
      approval_status: ApprovalStatus;
      export_type: ExportType;
      export_status: ExportStatus;
      provider_job_status: ProviderJobStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// ---------------------------------------------------------------------------
// Convenience helpers (same shape as Lovable's auto-generated file)
// ---------------------------------------------------------------------------
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"];

export type Enums<T extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][T];

// Concrete row aliases for ergonomic imports
export type Artist = Tables<"artists">;
export type ArtistAsset = Tables<"artist_assets">;
export type VideoProject = Tables<"video_projects">;
export type Shot = Tables<"shots">;
export type PromptTemplate = Tables<"prompt_templates">;
export type Prompt = Tables<"prompts">;
export type ProjectAsset = Tables<"project_assets">;
export type ClipReview = Tables<"clip_reviews">;
export type ExportPackage = Tables<"export_packages">;
export type ProviderJob = Tables<"provider_jobs">;

// Common helpers
export type ArtistIdentityProfile = {
  face?: string;
  body?: string;
  skin?: string;
  hair?: string;
  tattoos?: string;
  jewelry?: string;
  wardrobe_defaults?: string;
  distinguishing_features?: string;
};
