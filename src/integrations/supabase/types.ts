export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      artist_assets: {
        Row: {
          artist_id: string
          asset_type: Database["public"]["Enums"]["artist_asset_type"]
          created_at: string
          description: string | null
          file_url: string
          id: string
          is_primary_reference: boolean
          metadata_json: Json
          tags: string[]
          user_id: string
        }
        Insert: {
          artist_id: string
          asset_type: Database["public"]["Enums"]["artist_asset_type"]
          created_at?: string
          description?: string | null
          file_url: string
          id?: string
          is_primary_reference?: boolean
          metadata_json?: Json
          tags?: string[]
          user_id: string
        }
        Update: {
          artist_id?: string
          asset_type?: Database["public"]["Enums"]["artist_asset_type"]
          created_at?: string
          description?: string | null
          file_url?: string
          id?: string
          is_primary_reference?: boolean
          metadata_json?: Json
          tags?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_assets_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          bio: string | null
          camera_rules: string | null
          continuity_rules: string | null
          created_at: string
          forbidden_inaccuracies: string | null
          id: string
          identity_profile_json: Json
          name: string
          notes: string | null
          preferred_lighting: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          camera_rules?: string | null
          continuity_rules?: string | null
          created_at?: string
          forbidden_inaccuracies?: string | null
          id?: string
          identity_profile_json?: Json
          name: string
          notes?: string | null
          preferred_lighting?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          camera_rules?: string | null
          continuity_rules?: string | null
          created_at?: string
          forbidden_inaccuracies?: string | null
          id?: string
          identity_profile_json?: Json
          name?: string
          notes?: string | null
          preferred_lighting?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      character_features: {
        Row: {
          artist_id: string
          feature_type: string
          file_url: string | null
          id: string
          is_locked: boolean
          is_primary: boolean
          label: string
          metadata_json: Json
          reinforce_on_drift: boolean
          storage_path: string | null
          uploaded_at: string
        }
        Insert: {
          artist_id: string
          feature_type: string
          file_url?: string | null
          id?: string
          is_locked?: boolean
          is_primary?: boolean
          label: string
          metadata_json?: Json
          reinforce_on_drift?: boolean
          storage_path?: string | null
          uploaded_at?: string
        }
        Update: {
          artist_id?: string
          feature_type?: string
          file_url?: string | null
          id?: string
          is_locked?: boolean
          is_primary?: boolean
          label?: string
          metadata_json?: Json
          reinforce_on_drift?: boolean
          storage_path?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_features_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_reviews: {
        Row: {
          asset_id: string
          camera_score: number | null
          created_at: string
          face_consistency_score: number | null
          final_usefulness: boolean | null
          id: string
          lighting_score: number | null
          lipsync_score: number | null
          notes: string | null
          realism_score: number | null
          user_id: string
          wardrobe_score: number | null
        }
        Insert: {
          asset_id: string
          camera_score?: number | null
          created_at?: string
          face_consistency_score?: number | null
          final_usefulness?: boolean | null
          id?: string
          lighting_score?: number | null
          lipsync_score?: number | null
          notes?: string | null
          realism_score?: number | null
          user_id: string
          wardrobe_score?: number | null
        }
        Update: {
          asset_id?: string
          camera_score?: number | null
          created_at?: string
          face_consistency_score?: number | null
          final_usefulness?: boolean | null
          id?: string
          lighting_score?: number | null
          lipsync_score?: number | null
          notes?: string | null
          realism_score?: number | null
          user_id?: string
          wardrobe_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clip_reviews_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      export_packages: {
        Row: {
          created_at: string
          error_text: string | null
          export_type: Database["public"]["Enums"]["export_type"]
          file_url: string | null
          id: string
          manifest_json: Json
          project_id: string
          status: Database["public"]["Enums"]["export_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          error_text?: string | null
          export_type: Database["public"]["Enums"]["export_type"]
          file_url?: string | null
          id?: string
          manifest_json?: Json
          project_id: string
          status?: Database["public"]["Enums"]["export_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          error_text?: string | null
          export_type?: Database["public"]["Enums"]["export_type"]
          file_url?: string | null
          id?: string
          manifest_json?: Json
          project_id?: string
          status?: Database["public"]["Enums"]["export_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assets: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"]
          asset_type: Database["public"]["Enums"]["project_asset_type"]
          created_at: string
          file_url: string
          id: string
          metadata_json: Json
          notes: string | null
          parent_asset_id: string | null
          project_id: string
          prompt_id: string | null
          shot_id: string | null
          source_tool: Database["public"]["Enums"]["provider_name"] | null
          user_id: string
          version_number: number
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          asset_type: Database["public"]["Enums"]["project_asset_type"]
          created_at?: string
          file_url: string
          id?: string
          metadata_json?: Json
          notes?: string | null
          parent_asset_id?: string | null
          project_id: string
          prompt_id?: string | null
          shot_id?: string | null
          source_tool?: Database["public"]["Enums"]["provider_name"] | null
          user_id: string
          version_number?: number
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          asset_type?: Database["public"]["Enums"]["project_asset_type"]
          created_at?: string
          file_url?: string
          id?: string
          metadata_json?: Json
          notes?: string | null
          parent_asset_id?: string | null
          project_id?: string
          prompt_id?: string | null
          shot_id?: string | null
          source_tool?: Database["public"]["Enums"]["provider_name"] | null
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_parent_asset_id_fkey"
            columns: ["parent_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assets_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assets_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          category: Database["public"]["Enums"]["prompt_template_category"]
          created_at: string
          default_negative_prompt: string | null
          default_settings_json: Json
          description: string | null
          id: string
          is_seed: boolean
          name: string
          provider: Database["public"]["Enums"]["provider_name"] | null
          template_body: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["prompt_template_category"]
          created_at?: string
          default_negative_prompt?: string | null
          default_settings_json?: Json
          description?: string | null
          id?: string
          is_seed?: boolean
          name: string
          provider?: Database["public"]["Enums"]["provider_name"] | null
          template_body: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["prompt_template_category"]
          created_at?: string
          default_negative_prompt?: string | null
          default_settings_json?: Json
          description?: string | null
          id?: string
          is_seed?: boolean
          name?: string
          provider?: Database["public"]["Enums"]["provider_name"] | null
          template_body?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      prompts: {
        Row: {
          created_at: string
          id: string
          negative_prompt: string | null
          notes: string | null
          parent_prompt_id: string | null
          project_id: string
          prompt_text: string
          provider: Database["public"]["Enums"]["provider_name"]
          result_asset_id: string | null
          settings_json: Json
          shot_id: string | null
          template_id: string | null
          user_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          negative_prompt?: string | null
          notes?: string | null
          parent_prompt_id?: string | null
          project_id: string
          prompt_text: string
          provider: Database["public"]["Enums"]["provider_name"]
          result_asset_id?: string | null
          settings_json?: Json
          shot_id?: string | null
          template_id?: string | null
          user_id: string
          version_number?: number
        }
        Update: {
          created_at?: string
          id?: string
          negative_prompt?: string | null
          notes?: string | null
          parent_prompt_id?: string | null
          project_id?: string
          prompt_text?: string
          provider?: Database["public"]["Enums"]["provider_name"]
          result_asset_id?: string | null
          settings_json?: Json
          shot_id?: string | null
          template_id?: string | null
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompts_parent_prompt_id_fkey"
            columns: ["parent_prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_result_asset_fk"
            columns: ["result_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_capabilities: {
        Row: {
          api_status: string
          last_verified_at: string
          max_duration_seconds: number | null
          notes: string | null
          optimal_prompt_style: string | null
          prompt_length_max_words: number | null
          provider: string
          recommended_shot_types: string[]
          strengths: string[]
          supported_aspect_ratios: string[]
          supports_negative_prompt: boolean
          supports_reference_image: boolean
          weaknesses: string[]
        }
        Insert: {
          api_status: string
          last_verified_at?: string
          max_duration_seconds?: number | null
          notes?: string | null
          optimal_prompt_style?: string | null
          prompt_length_max_words?: number | null
          provider: string
          recommended_shot_types?: string[]
          strengths?: string[]
          supported_aspect_ratios?: string[]
          supports_negative_prompt?: boolean
          supports_reference_image?: boolean
          weaknesses?: string[]
        }
        Update: {
          api_status?: string
          last_verified_at?: string
          max_duration_seconds?: number | null
          notes?: string | null
          optimal_prompt_style?: string | null
          prompt_length_max_words?: number | null
          provider?: string
          recommended_shot_types?: string[]
          strengths?: string[]
          supported_aspect_ratios?: string[]
          supports_negative_prompt?: boolean
          supports_reference_image?: boolean
          weaknesses?: string[]
        }
        Relationships: []
      }
      provider_jobs: {
        Row: {
          created_at: string
          error_text: string | null
          external_job_id: string | null
          id: string
          project_id: string
          prompt_id: string | null
          provider: Database["public"]["Enums"]["provider_name"]
          request_payload_json: Json
          response_payload_json: Json
          result_asset_id: string | null
          status: Database["public"]["Enums"]["provider_job_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_text?: string | null
          external_job_id?: string | null
          id?: string
          project_id: string
          prompt_id?: string | null
          provider: Database["public"]["Enums"]["provider_name"]
          request_payload_json?: Json
          response_payload_json?: Json
          result_asset_id?: string | null
          status?: Database["public"]["Enums"]["provider_job_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_text?: string | null
          external_job_id?: string | null
          id?: string
          project_id?: string
          prompt_id?: string | null
          provider?: Database["public"]["Enums"]["provider_name"]
          request_payload_json?: Json
          response_payload_json?: Json
          result_asset_id?: string | null
          status?: Database["public"]["Enums"]["provider_job_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_jobs_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_jobs_result_asset_id_fkey"
            columns: ["result_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          camera_direction: string | null
          created_at: string
          duration_seconds: number | null
          environment: string | null
          id: string
          lighting: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["shot_priority"]
          project_id: string
          recommended_tool: Database["public"]["Enums"]["provider_name"] | null
          scene_description: string | null
          shot_number: number
          shot_type: Database["public"]["Enums"]["shot_type"] | null
          song_section: string | null
          status: Database["public"]["Enums"]["shot_status"]
          timestamp_end: number | null
          timestamp_start: number | null
          transition_duration: number | null
          transition_in_type:
            | Database["public"]["Enums"]["shot_transition_type"]
            | null
          transition_out_type:
            | Database["public"]["Enums"]["shot_transition_type"]
            | null
          trim_in_seconds: number | null
          trim_out_seconds: number | null
          updated_at: string
          user_id: string
          wardrobe: string | null
        }
        Insert: {
          camera_direction?: string | null
          created_at?: string
          duration_seconds?: number | null
          environment?: string | null
          id?: string
          lighting?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["shot_priority"]
          project_id: string
          recommended_tool?: Database["public"]["Enums"]["provider_name"] | null
          scene_description?: string | null
          shot_number: number
          shot_type?: Database["public"]["Enums"]["shot_type"] | null
          song_section?: string | null
          status?: Database["public"]["Enums"]["shot_status"]
          timestamp_end?: number | null
          timestamp_start?: number | null
          transition_duration?: number | null
          transition_in_type?:
            | Database["public"]["Enums"]["shot_transition_type"]
            | null
          transition_out_type?:
            | Database["public"]["Enums"]["shot_transition_type"]
            | null
          trim_in_seconds?: number | null
          trim_out_seconds?: number | null
          updated_at?: string
          user_id: string
          wardrobe?: string | null
        }
        Update: {
          camera_direction?: string | null
          created_at?: string
          duration_seconds?: number | null
          environment?: string | null
          id?: string
          lighting?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["shot_priority"]
          project_id?: string
          recommended_tool?: Database["public"]["Enums"]["provider_name"] | null
          scene_description?: string | null
          shot_number?: number
          shot_type?: Database["public"]["Enums"]["shot_type"] | null
          song_section?: string | null
          status?: Database["public"]["Enums"]["shot_status"]
          timestamp_end?: number | null
          timestamp_start?: number | null
          transition_duration?: number | null
          transition_in_type?:
            | Database["public"]["Enums"]["shot_transition_type"]
            | null
          transition_out_type?:
            | Database["public"]["Enums"]["shot_transition_type"]
            | null
          trim_in_seconds?: number | null
          trim_out_seconds?: number | null
          updated_at?: string
          user_id?: string
          wardrobe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      song_analyses: {
        Row: {
          analysis_provider: string | null
          analyzed_at: string
          beat_map_json: Json
          bpm: number | null
          drops_json: Json
          duration_seconds: number | null
          energy_curve_json: Json
          hooks_json: Json
          id: string
          project_id: string
          sections_json: Json
        }
        Insert: {
          analysis_provider?: string | null
          analyzed_at?: string
          beat_map_json?: Json
          bpm?: number | null
          drops_json?: Json
          duration_seconds?: number | null
          energy_curve_json?: Json
          hooks_json?: Json
          id?: string
          project_id: string
          sections_json?: Json
        }
        Update: {
          analysis_provider?: string | null
          analyzed_at?: string
          beat_map_json?: Json
          bpm?: number | null
          drops_json?: Json
          duration_seconds?: number | null
          energy_curve_json?: Json
          hooks_json?: Json
          id?: string
          project_id?: string
          sections_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "song_analyses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_projects: {
        Row: {
          artist_id: string | null
          bpm: number | null
          color_palette: string[]
          created_at: string
          genre: string | null
          id: string
          lyrics: string | null
          mood: string | null
          notes: string | null
          song_structure_json: Json
          song_title: string | null
          status: Database["public"]["Enums"]["project_status"]
          title: string
          treatment_json: Json
          updated_at: string
          user_id: string
          visual_style: string | null
          wardrobe_notes: string | null
        }
        Insert: {
          artist_id?: string | null
          bpm?: number | null
          color_palette?: string[]
          created_at?: string
          genre?: string | null
          id?: string
          lyrics?: string | null
          mood?: string | null
          notes?: string | null
          song_structure_json?: Json
          song_title?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title: string
          treatment_json?: Json
          updated_at?: string
          user_id: string
          visual_style?: string | null
          wardrobe_notes?: string | null
        }
        Update: {
          artist_id?: string | null
          bpm?: number | null
          color_palette?: string[]
          created_at?: string
          genre?: string | null
          id?: string
          lyrics?: string | null
          mood?: string | null
          notes?: string | null
          song_structure_json?: Json
          song_title?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          title?: string
          treatment_json?: Json
          updated_at?: string
          user_id?: string
          visual_style?: string | null
          wardrobe_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_projects_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected" | "archived"
      artist_asset_type:
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
        | "other"
      export_status: "pending" | "building" | "complete" | "failed"
      export_type:
        | "premiere_ready"
        | "after_effects"
        | "full_package"
        | "approved_clips_only"
        | "review_pack"
      project_asset_type:
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
        | "other"
      project_status:
        | "draft"
        | "in_production"
        | "editing"
        | "complete"
        | "archived"
      prompt_template_category:
        | "text_to_video"
        | "image_to_video"
        | "lipsync"
        | "greenscreen"
        | "vfx"
        | "b_roll"
        | "transition"
        | "performance"
        | "universal"
      provider_job_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "cancelled"
      provider_name:
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
        | "other"
      shot_priority: "low" | "normal" | "high" | "hero"
      shot_status:
        | "planned"
        | "generated"
        | "approved"
        | "rejected"
        | "needs_regen"
      shot_transition_type:
        | "cut"
        | "crossfade"
        | "fade_black"
        | "fade_white"
        | "whip_pan"
        | "glitch"
        | "flash"
      shot_type:
        | "performance"
        | "b_roll"
        | "narrative"
        | "vfx"
        | "transition"
        | "lyric_visual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      approval_status: ["pending", "approved", "rejected", "archived"],
      artist_asset_type: [
        "face_front",
        "face_left",
        "face_right",
        "face_3q_left",
        "face_3q_right",
        "face_top",
        "face_bottom",
        "mouth_open",
        "mouth_closed",
        "expression",
        "body",
        "wardrobe",
        "jewelry",
        "tattoo",
        "hair",
        "other",
      ],
      export_status: ["pending", "building", "complete", "failed"],
      export_type: [
        "premiere_ready",
        "after_effects",
        "full_package",
        "approved_clips_only",
        "review_pack",
      ],
      project_asset_type: [
        "reference_image",
        "reference_video",
        "audio",
        "lyrics_doc",
        "generated_still",
        "generated_clip",
        "edited_clip",
        "premiere_export",
        "ae_asset",
        "lut",
        "overlay",
        "sfx",
        "thumbnail",
        "social_cutdown",
        "other",
      ],
      project_status: [
        "draft",
        "in_production",
        "editing",
        "complete",
        "archived",
      ],
      prompt_template_category: [
        "text_to_video",
        "image_to_video",
        "lipsync",
        "greenscreen",
        "vfx",
        "b_roll",
        "transition",
        "performance",
        "universal",
      ],
      provider_job_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "cancelled",
      ],
      provider_name: [
        "runway",
        "veo",
        "gemini",
        "grok",
        "higgsfield",
        "pika",
        "fal",
        "openai",
        "firefly",
        "frame_io",
        "manual",
        "other",
      ],
      shot_priority: ["low", "normal", "high", "hero"],
      shot_status: [
        "planned",
        "generated",
        "approved",
        "rejected",
        "needs_regen",
      ],
      shot_transition_type: [
        "cut",
        "crossfade",
        "fade_black",
        "fade_white",
        "whip_pan",
        "glitch",
        "flash",
      ],
      shot_type: [
        "performance",
        "b_roll",
        "narrative",
        "vfx",
        "transition",
        "lyric_visual",
      ],
    },
  },
} as const
