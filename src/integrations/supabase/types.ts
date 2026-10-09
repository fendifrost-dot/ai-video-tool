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
      artist_looks: {
        Row: {
          artist_id: string
          composition_recipe_json: Json
          cost_cents: number
          created_at: string
          description: string | null
          error_message: string | null
          generated_image_url: string | null
          generated_storage_path: string | null
          id: string
          iterations: number
          name: string
          notes: string | null
          parent_look_id: string | null
          pipeline_used: string | null
          status: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          artist_id: string
          composition_recipe_json?: Json
          cost_cents?: number
          created_at?: string
          description?: string | null
          error_message?: string | null
          generated_image_url?: string | null
          generated_storage_path?: string | null
          id?: string
          iterations?: number
          name: string
          notes?: string | null
          parent_look_id?: string | null
          pipeline_used?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          artist_id?: string
          composition_recipe_json?: Json
          cost_cents?: number
          created_at?: string
          description?: string | null
          error_message?: string | null
          generated_image_url?: string | null
          generated_storage_path?: string | null
          id?: string
          iterations?: number
          name?: string
          notes?: string | null
          parent_look_id?: string | null
          pipeline_used?: string | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_looks_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_looks_parent_look_id_fkey"
            columns: ["parent_look_id"]
            isOneToOne: false
            referencedRelation: "artist_looks"
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
      batch_credential_mints: {
        Row: {
          at: string
          credential_id: string | null
          id: string
          ip_hash: string | null
          outcome: string
          owner_user_id: string | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          at?: string
          credential_id?: string | null
          id?: string
          ip_hash?: string | null
          outcome: string
          owner_user_id?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          at?: string
          credential_id?: string | null
          id?: string
          ip_hash?: string | null
          outcome?: string
          owner_user_id?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_credential_mints_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "batch_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_credential_sessions: {
        Row: {
          access_token: string
          credential_id: string
          expires_at: string
          minted_at: string
          owner_user_id: string
          refresh_count: number
          refresh_token: string
          refreshed_at: string | null
          reuse_count: number
          updated_at: string
        }
        Insert: {
          access_token: string
          credential_id: string
          expires_at: string
          minted_at?: string
          owner_user_id: string
          refresh_count?: number
          refresh_token: string
          refreshed_at?: string | null
          reuse_count?: number
          updated_at?: string
        }
        Update: {
          access_token?: string
          credential_id?: string
          expires_at?: string
          minted_at?: string
          owner_user_id?: string
          refresh_count?: number
          refresh_token?: string
          refreshed_at?: string | null
          reuse_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_credential_sessions_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: true
            referencedRelation: "batch_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_credentials: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string
          last_used_at: string | null
          note: string | null
          owner_user_id: string
          revoked_at: string | null
          secret_sha256: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label: string
          last_used_at?: string | null
          note?: string | null
          owner_user_id: string
          revoked_at?: string | null
          secret_sha256: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          note?: string | null
          owner_user_id?: string
          revoked_at?: string | null
          secret_sha256?: string
        }
        Relationships: []
      }
      character_features: {
        Row: {
          artist_id: string
          dimensions_description: string | null
          feature_type: string
          file_url: string | null
          id: string
          is_locked: boolean
          is_primary: boolean
          label: string
          metadata_json: Json
          reference_images: Json | null
          reinforce_on_drift: boolean
          source_url: string | null
          storage_path: string | null
          tags: string[]
          uploaded_at: string
        }
        Insert: {
          artist_id: string
          dimensions_description?: string | null
          feature_type: string
          file_url?: string | null
          id?: string
          is_locked?: boolean
          is_primary?: boolean
          label: string
          metadata_json?: Json
          reference_images?: Json | null
          reinforce_on_drift?: boolean
          source_url?: string | null
          storage_path?: string | null
          tags?: string[]
          uploaded_at?: string
        }
        Update: {
          artist_id?: string
          dimensions_description?: string | null
          feature_type?: string
          file_url?: string | null
          id?: string
          is_locked?: boolean
          is_primary?: boolean
          label?: string
          metadata_json?: Json
          reference_images?: Json | null
          reinforce_on_drift?: boolean
          source_url?: string | null
          storage_path?: string | null
          tags?: string[]
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
          drift_flags: Json
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
          drift_flags?: Json
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
          drift_flags?: Json
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
      collection_products: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          metadata_json: Json
          name: string
          season: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata_json?: Json
          name: string
          season?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata_json?: Json
          name?: string
          season?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      continuity_entities: {
        Row: {
          approved_asset_id: string | null
          archived: boolean
          artist_id: string | null
          cast_role: string | null
          constraints: string
          created_at: string
          description: string
          garment_feature_ids: string[] | null
          id: string
          identity_mode: string | null
          key: string
          kind: string
          name: string
          project_id: string
          reference_asset_ids: string[]
          updated_at: string
          user_id: string
          variation_id: string | null
          version: number | null
        }
        Insert: {
          approved_asset_id?: string | null
          archived?: boolean
          artist_id?: string | null
          cast_role?: string | null
          constraints?: string
          created_at?: string
          description?: string
          garment_feature_ids?: string[] | null
          id?: string
          identity_mode?: string | null
          key: string
          kind: string
          name: string
          project_id: string
          reference_asset_ids?: string[]
          updated_at?: string
          user_id?: string
          variation_id?: string | null
          version?: number | null
        }
        Update: {
          approved_asset_id?: string | null
          archived?: boolean
          artist_id?: string | null
          cast_role?: string | null
          constraints?: string
          created_at?: string
          description?: string
          garment_feature_ids?: string[] | null
          id?: string
          identity_mode?: string | null
          key?: string
          kind?: string
          name?: string
          project_id?: string
          reference_asset_ids?: string[]
          updated_at?: string
          user_id?: string
          variation_id?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "continuity_entities_approved_asset_id_fkey"
            columns: ["approved_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_entities_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_entities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_entities_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "video_variations"
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
          manifest_id: string | null
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
          manifest_id?: string | null
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
          manifest_id?: string | null
          manifest_json?: Json
          project_id?: string
          status?: Database["public"]["Enums"]["export_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_packages_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "timeline_manifests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_packages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_feasibility: {
        Row: {
          alternative_suggestion: string | null
          computed_at: string
          continuity_probability: number | null
          drift_probability: number | null
          estimated_retry_count: number | null
          id: string
          lipsync_probability: number | null
          realism_probability: number | null
          recommended_workflow: string | null
          storyboard_node_id: string
        }
        Insert: {
          alternative_suggestion?: string | null
          computed_at?: string
          continuity_probability?: number | null
          drift_probability?: number | null
          estimated_retry_count?: number | null
          id?: string
          lipsync_probability?: number | null
          realism_probability?: number | null
          recommended_workflow?: string | null
          storyboard_node_id: string
        }
        Update: {
          alternative_suggestion?: string | null
          computed_at?: string
          continuity_probability?: number | null
          drift_probability?: number | null
          estimated_retry_count?: number | null
          id?: string
          lipsync_probability?: number | null
          realism_probability?: number | null
          recommended_workflow?: string | null
          storyboard_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_feasibility_storyboard_node_id_fkey"
            columns: ["storyboard_node_id"]
            isOneToOne: false
            referencedRelation: "storyboard_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_consolidation_backup_20260806: {
        Row: {
          moved_at: string | null
          new_user_id: string | null
          old_user_id: string | null
          row_id: string | null
          tbl: string | null
        }
        Insert: {
          moved_at?: string | null
          new_user_id?: string | null
          old_user_id?: string | null
          row_id?: string | null
          tbl?: string | null
        }
        Update: {
          moved_at?: string | null
          new_user_id?: string | null
          old_user_id?: string | null
          row_id?: string | null
          tbl?: string | null
        }
        Relationships: []
      }
      job_runner_config: {
        Row: {
          created_at: string
          cron_key: string
          function_url: string
          id: boolean
        }
        Insert: {
          created_at?: string
          cron_key: string
          function_url: string
          id?: boolean
        }
        Update: {
          created_at?: string
          cron_key?: string
          function_url?: string
          id?: boolean
        }
        Relationships: []
      }
      location_library: {
        Row: {
          category: string | null
          file_url: string
          id: string
          name: string
          notes: string | null
          reference_images: Json | null
          source_url: string | null
          storage_path: string | null
          tags: string[]
          uploaded_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          file_url: string
          id?: string
          name: string
          notes?: string | null
          reference_images?: Json | null
          source_url?: string | null
          storage_path?: string | null
          tags?: string[]
          uploaded_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          file_url?: string
          id?: string
          name?: string
          notes?: string | null
          reference_images?: Json | null
          source_url?: string | null
          storage_path?: string | null
          tags?: string[]
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lyric_lines: {
        Row: {
          block: number | null
          confidence: number
          created_at: string
          end_seconds: number
          id: string
          line_index: number
          project_id: string
          section: string
          source: string
          start_seconds: number
          text: string
          updated_at: string
          user_id: string
          words_json: Json
        }
        Insert: {
          block?: number | null
          confidence?: number
          created_at?: string
          end_seconds: number
          id?: string
          line_index: number
          project_id: string
          section?: string
          source?: string
          start_seconds: number
          text: string
          updated_at?: string
          user_id: string
          words_json?: Json
        }
        Update: {
          block?: number | null
          confidence?: number
          created_at?: string
          end_seconds?: number
          id?: string
          line_index?: number
          project_id?: string
          section?: string
          source?: string
          start_seconds?: number
          text?: string
          updated_at?: string
          user_id?: string
          words_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lyric_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturing_packages: {
        Row: {
          created_at: string
          id: string
          package_json: Json
          product_id: string
          storage_path: string | null
          tech_pack_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          package_json?: Json
          product_id: string
          storage_path?: string | null
          tech_pack_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          package_json?: Json
          product_id?: string
          storage_path?: string | null
          tech_pack_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_packages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_packages_tech_pack_id_fkey"
            columns: ["tech_pack_id"]
            isOneToOne: false
            referencedRelation: "tech_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_syncs: {
        Row: {
          confidence_json: Json
          created_at: string
          drift_ppm: number
          id: string
          method: string
          notes: string | null
          offset_seconds: number
          performance_asset_id: string | null
          project_id: string
          song_asset_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence_json?: Json
          created_at?: string
          drift_ppm?: number
          id?: string
          method?: string
          notes?: string | null
          offset_seconds: number
          performance_asset_id?: string | null
          project_id: string
          song_asset_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          confidence_json?: Json
          created_at?: string
          drift_ppm?: number
          id?: string
          method?: string
          notes?: string | null
          offset_seconds?: number
          performance_asset_id?: string | null
          project_id?: string
          song_asset_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_syncs_performance_asset_id_fkey"
            columns: ["performance_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_syncs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_syncs_song_asset_id_fkey"
            columns: ["song_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assets: {
        Row: {
          asset_role: Database["public"]["Enums"]["product_asset_role"]
          file_url: string
          id: string
          product_id: string
          reference_images: Json
          sort_order: number
          storage_path: string | null
          uploaded_at: string
          variant_id: string | null
        }
        Insert: {
          asset_role: Database["public"]["Enums"]["product_asset_role"]
          file_url: string
          id?: string
          product_id: string
          reference_images?: Json
          sort_order?: number
          storage_path?: string | null
          uploaded_at?: string
          variant_id?: string | null
        }
        Update: {
          asset_role?: Database["public"]["Enums"]["product_asset_role"]
          file_url?: string
          id?: string
          product_id?: string
          reference_images?: Json
          sort_order?: number
          storage_path?: string | null
          uploaded_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_assets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_assets_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          colorway_json: Json
          created_at: string
          id: string
          is_default: boolean
          name: string
          product_id: string
          sku_suffix: string | null
          updated_at: string
        }
        Insert: {
          colorway_json?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          product_id: string
          sku_suffix?: string | null
          updated_at?: string
        }
        Update: {
          colorway_json?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          product_id?: string
          sku_suffix?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_wardrobe_links: {
        Row: {
          character_feature_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          character_feature_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          character_feature_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_wardrobe_links_character_feature_id_fkey"
            columns: ["character_feature_id"]
            isOneToOne: true
            referencedRelation: "character_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_wardrobe_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          design_prompt: string | null
          fit_profile_json: Json
          id: string
          materials_json: Json
          metadata_json: Json
          name: string
          season: string | null
          sku: string
          slot: Database["public"]["Enums"]["product_slot"]
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          design_prompt?: string | null
          fit_profile_json?: Json
          id?: string
          materials_json?: Json
          metadata_json?: Json
          name: string
          season?: string | null
          sku: string
          slot: Database["public"]["Enums"]["product_slot"]
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          design_prompt?: string | null
          fit_profile_json?: Json
          id?: string
          materials_json?: Json
          metadata_json?: Json
          name?: string
          season?: string | null
          sku?: string
          slot?: Database["public"]["Enums"]["product_slot"]
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_assets: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"]
          asset_type: Database["public"]["Enums"]["project_asset_type"]
          created_at: string
          file_url: string
          footage_role: string | null
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
          footage_role?: string | null
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
          footage_role?: string | null
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
      project_location_picks: {
        Row: {
          location_id: string
          pinned_at: string
          project_id: string
        }
        Insert: {
          location_id: string
          pinned_at?: string
          project_id: string
        }
        Update: {
          location_id?: string
          pinned_at?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_location_picks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_location_picks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_look_picks: {
        Row: {
          id: string
          look_id: string
          picked_at: string
          project_id: string
          user_id: string
        }
        Insert: {
          id?: string
          look_id: string
          picked_at?: string
          project_id: string
          user_id: string
        }
        Update: {
          id?: string
          look_id?: string
          picked_at?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_look_picks_look_id_fkey"
            columns: ["look_id"]
            isOneToOne: false
            referencedRelation: "artist_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_look_picks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_prop_picks: {
        Row: {
          pinned_at: string
          project_id: string
          prop_id: string
        }
        Insert: {
          pinned_at?: string
          project_id: string
          prop_id: string
        }
        Update: {
          pinned_at?: string
          project_id?: string
          prop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_prop_picks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_prop_picks_prop_id_fkey"
            columns: ["prop_id"]
            isOneToOne: false
            referencedRelation: "prop_library"
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
      prop_library: {
        Row: {
          category: string | null
          file_url: string
          id: string
          name: string
          notes: string | null
          reference_images: Json | null
          source_url: string | null
          storage_path: string | null
          tags: string[]
          uploaded_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          file_url: string
          id?: string
          name: string
          notes?: string | null
          reference_images?: Json | null
          source_url?: string | null
          storage_path?: string | null
          tags?: string[]
          uploaded_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          file_url?: string
          id?: string
          name?: string
          notes?: string | null
          reference_images?: Json | null
          source_url?: string | null
          storage_path?: string | null
          tags?: string[]
          uploaded_at?: string
          user_id?: string
        }
        Relationships: []
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
          finalized_at: string | null
          id: string
          progress_claimed_at: string | null
          progress_failures: number
          progress_note: string | null
          project_id: string
          prompt_id: string | null
          provider: Database["public"]["Enums"]["provider_name"]
          request_payload_json: Json
          response_payload_json: Json
          result_asset_id: string | null
          status: Database["public"]["Enums"]["provider_job_status"]
          updated_at: string
          user_id: string
          variation_id: string | null
        }
        Insert: {
          created_at?: string
          error_text?: string | null
          external_job_id?: string | null
          finalized_at?: string | null
          id?: string
          progress_claimed_at?: string | null
          progress_failures?: number
          progress_note?: string | null
          project_id: string
          prompt_id?: string | null
          provider: Database["public"]["Enums"]["provider_name"]
          request_payload_json?: Json
          response_payload_json?: Json
          result_asset_id?: string | null
          status?: Database["public"]["Enums"]["provider_job_status"]
          updated_at?: string
          user_id: string
          variation_id?: string | null
        }
        Update: {
          created_at?: string
          error_text?: string | null
          external_job_id?: string | null
          finalized_at?: string | null
          id?: string
          progress_claimed_at?: string | null
          progress_failures?: number
          progress_note?: string | null
          project_id?: string
          prompt_id?: string | null
          provider?: Database["public"]["Enums"]["provider_name"]
          request_payload_json?: Json
          response_payload_json?: Json
          result_asset_id?: string | null
          status?: Database["public"]["Enums"]["provider_job_status"]
          updated_at?: string
          user_id?: string
          variation_id?: string | null
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
          {
            foreignKeyName: "provider_jobs_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "video_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_asset_assignments: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          is_primary: boolean
          notes: string | null
          project_id: string
          role: string
          shot_id: string
          sort_order: number
          source_in_seconds: number | null
          source_out_seconds: number | null
          updated_at: string
          user_id: string
          variation_id: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          project_id: string
          role: string
          shot_id: string
          sort_order?: number
          source_in_seconds?: number | null
          source_out_seconds?: number | null
          updated_at?: string
          user_id?: string
          variation_id?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          notes?: string | null
          project_id?: string
          role?: string
          shot_id?: string
          sort_order?: number
          source_in_seconds?: number | null
          source_out_seconds?: number | null
          updated_at?: string
          user_id?: string
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shot_asset_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shot_asset_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shot_asset_assignments_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shot_asset_assignments_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "video_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      shot_overrides: {
        Row: {
          camera_motion: Json | null
          direction: string | null
          frame: string | null
          framing: string | null
          id: string
          notes: string | null
          project_id: string
          required_elements: string[] | null
          spec_id: string
          transition_in: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          camera_motion?: Json | null
          direction?: string | null
          frame?: string | null
          framing?: string | null
          id?: string
          notes?: string | null
          project_id: string
          required_elements?: string[] | null
          spec_id: string
          transition_in?: Json | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          camera_motion?: Json | null
          direction?: string | null
          frame?: string | null
          framing?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          required_elements?: string[] | null
          spec_id?: string
          transition_in?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shot_overrides_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          box_origin: string | null
          camera_direction: string | null
          created_at: string
          duration_seconds: number | null
          environment: string | null
          generated_json: Json | null
          history_json: Json
          id: string
          lighting: string | null
          locked: boolean
          locked_look_id: string | null
          notes: string | null
          override_json: Json | null
          priority: Database["public"]["Enums"]["shot_priority"]
          project_id: string
          recommended_tool: Database["public"]["Enums"]["provider_name"] | null
          scene_description: string | null
          shot_number: number
          shot_type: Database["public"]["Enums"]["shot_type"] | null
          song_section: string | null
          spec_json: Json | null
          spec_key: string | null
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
          variation_id: string | null
          wardrobe: string | null
        }
        Insert: {
          box_origin?: string | null
          camera_direction?: string | null
          created_at?: string
          duration_seconds?: number | null
          environment?: string | null
          generated_json?: Json | null
          history_json?: Json
          id?: string
          lighting?: string | null
          locked?: boolean
          locked_look_id?: string | null
          notes?: string | null
          override_json?: Json | null
          priority?: Database["public"]["Enums"]["shot_priority"]
          project_id: string
          recommended_tool?: Database["public"]["Enums"]["provider_name"] | null
          scene_description?: string | null
          shot_number: number
          shot_type?: Database["public"]["Enums"]["shot_type"] | null
          song_section?: string | null
          spec_json?: Json | null
          spec_key?: string | null
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
          variation_id?: string | null
          wardrobe?: string | null
        }
        Update: {
          box_origin?: string | null
          camera_direction?: string | null
          created_at?: string
          duration_seconds?: number | null
          environment?: string | null
          generated_json?: Json | null
          history_json?: Json
          id?: string
          lighting?: string | null
          locked?: boolean
          locked_look_id?: string | null
          notes?: string | null
          override_json?: Json | null
          priority?: Database["public"]["Enums"]["shot_priority"]
          project_id?: string
          recommended_tool?: Database["public"]["Enums"]["provider_name"] | null
          scene_description?: string | null
          shot_number?: number
          shot_type?: Database["public"]["Enums"]["shot_type"] | null
          song_section?: string | null
          spec_json?: Json | null
          spec_key?: string | null
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
          variation_id?: string | null
          wardrobe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shots_locked_look_id_fkey"
            columns: ["locked_look_id"]
            isOneToOne: false
            referencedRelation: "artist_looks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shots_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "video_variations"
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
      storyboard_nodes: {
        Row: {
          camera_motion: string | null
          camera_type: string | null
          continuity_dependencies_json: Json
          created_at: string
          duration_seconds: number | null
          emotional_purpose: string | null
          environment: string | null
          estimated_cost_cents: number | null
          estimated_drift_risk: number | null
          generation_difficulty: string | null
          generation_strategy: string | null
          id: string
          lighting_style: string | null
          node_order: number
          notes: string | null
          realism_target: string | null
          recommended_model: string | null
          scene_purpose: string | null
          shot_id: string | null
          shot_type: string | null
          status: string
          storyboard_id: string
          timestamp_end_seconds: number
          timestamp_start_seconds: number
          updated_at: string
          wardrobe: string | null
        }
        Insert: {
          camera_motion?: string | null
          camera_type?: string | null
          continuity_dependencies_json?: Json
          created_at?: string
          duration_seconds?: number | null
          emotional_purpose?: string | null
          environment?: string | null
          estimated_cost_cents?: number | null
          estimated_drift_risk?: number | null
          generation_difficulty?: string | null
          generation_strategy?: string | null
          id?: string
          lighting_style?: string | null
          node_order: number
          notes?: string | null
          realism_target?: string | null
          recommended_model?: string | null
          scene_purpose?: string | null
          shot_id?: string | null
          shot_type?: string | null
          status?: string
          storyboard_id: string
          timestamp_end_seconds: number
          timestamp_start_seconds: number
          updated_at?: string
          wardrobe?: string | null
        }
        Update: {
          camera_motion?: string | null
          camera_type?: string | null
          continuity_dependencies_json?: Json
          created_at?: string
          duration_seconds?: number | null
          emotional_purpose?: string | null
          environment?: string | null
          estimated_cost_cents?: number | null
          estimated_drift_risk?: number | null
          generation_difficulty?: string | null
          generation_strategy?: string | null
          id?: string
          lighting_style?: string | null
          node_order?: number
          notes?: string | null
          realism_target?: string | null
          recommended_model?: string | null
          scene_purpose?: string | null
          shot_id?: string | null
          shot_type?: string | null
          status?: string
          storyboard_id?: string
          timestamp_end_seconds?: number
          timestamp_start_seconds?: number
          updated_at?: string
          wardrobe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storyboard_nodes_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storyboard_nodes_storyboard_id_fkey"
            columns: ["storyboard_id"]
            isOneToOne: false
            referencedRelation: "storyboards"
            referencedColumns: ["id"]
          },
        ]
      }
      storyboards: {
        Row: {
          created_at: string
          id: string
          mood_profile_json: Json
          notes: string | null
          project_id: string
          title: string | null
          total_duration_seconds: number | null
          updated_at: string
          waveform_json: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          mood_profile_json?: Json
          notes?: string | null
          project_id: string
          title?: string | null
          total_duration_seconds?: number | null
          updated_at?: string
          waveform_json?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          mood_profile_json?: Json
          notes?: string | null
          project_id?: string
          title?: string | null
          total_duration_seconds?: number | null
          updated_at?: string
          waveform_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "storyboards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      style_profiles: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          params_json: Json
          project_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          params_json?: Json
          project_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          params_json?: Json
          project_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "style_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_packs: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          product_id: string
          spec_json: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          spec_json?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          spec_json?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_packs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          actor_name: string | null
          actor_type: string
          change_summary: string | null
          created_at: string
          event_type: string
          id: string
          manifest_id: string
          payload_json: Json
          version_id: string | null
        }
        Insert: {
          actor_name?: string | null
          actor_type: string
          change_summary?: string | null
          created_at?: string
          event_type: string
          id?: string
          manifest_id: string
          payload_json?: Json
          version_id?: string | null
        }
        Update: {
          actor_name?: string | null
          actor_type?: string
          change_summary?: string | null
          created_at?: string
          event_type?: string
          id?: string
          manifest_id?: string
          payload_json?: Json
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "timeline_manifests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "timeline_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_items: {
        Row: {
          approved: boolean
          asset_id: string | null
          color_profile_id: string | null
          created_at: string
          cut_type: string | null
          end_frame: number
          id: string
          item_order: number
          look_id: string | null
          manifest_id: string
          notes: string | null
          output_asset_id: string | null
          production_status: string
          provenance_json: Json
          shot_id: string | null
          song_section: string | null
          source_asset_id: string | null
          source_in_seconds: number | null
          source_out_seconds: number | null
          speed: number
          start_frame: number
          storyboard_node_id: string | null
          sync_id: string | null
          text_overlays_json: Json
          track: string
          transition_in_json: Json
          transition_out_json: Json
          treatment_shot_id: string | null
          trim_in_frame: number
          trim_out_frame: number | null
          updated_at: string
          vfx_profile_id: string | null
        }
        Insert: {
          approved?: boolean
          asset_id?: string | null
          color_profile_id?: string | null
          created_at?: string
          cut_type?: string | null
          end_frame?: number
          id?: string
          item_order: number
          look_id?: string | null
          manifest_id: string
          notes?: string | null
          output_asset_id?: string | null
          production_status?: string
          provenance_json?: Json
          shot_id?: string | null
          song_section?: string | null
          source_asset_id?: string | null
          source_in_seconds?: number | null
          source_out_seconds?: number | null
          speed?: number
          start_frame?: number
          storyboard_node_id?: string | null
          sync_id?: string | null
          text_overlays_json?: Json
          track?: string
          transition_in_json?: Json
          transition_out_json?: Json
          treatment_shot_id?: string | null
          trim_in_frame?: number
          trim_out_frame?: number | null
          updated_at?: string
          vfx_profile_id?: string | null
        }
        Update: {
          approved?: boolean
          asset_id?: string | null
          color_profile_id?: string | null
          created_at?: string
          cut_type?: string | null
          end_frame?: number
          id?: string
          item_order?: number
          look_id?: string | null
          manifest_id?: string
          notes?: string | null
          output_asset_id?: string | null
          production_status?: string
          provenance_json?: Json
          shot_id?: string | null
          song_section?: string | null
          source_asset_id?: string | null
          source_in_seconds?: number | null
          source_out_seconds?: number | null
          speed?: number
          start_frame?: number
          storyboard_node_id?: string | null
          sync_id?: string | null
          text_overlays_json?: Json
          track?: string
          transition_in_json?: Json
          transition_out_json?: Json
          treatment_shot_id?: string | null
          trim_in_frame?: number
          trim_out_frame?: number | null
          updated_at?: string
          vfx_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeline_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_items_color_profile_id_fkey"
            columns: ["color_profile_id"]
            isOneToOne: false
            referencedRelation: "style_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_items_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "timeline_manifests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_items_output_asset_id_fkey"
            columns: ["output_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_items_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "shots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_items_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "project_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_items_storyboard_node_id_fkey"
            columns: ["storyboard_node_id"]
            isOneToOne: false
            referencedRelation: "storyboard_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_items_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "performance_syncs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_items_vfx_profile_id_fkey"
            columns: ["vfx_profile_id"]
            isOneToOne: false
            referencedRelation: "style_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_manifests: {
        Row: {
          aspect_ratio: string | null
          created_at: string
          duration_frames: number | null
          export_status: Database["public"]["Enums"]["export_status"]
          frame_rate: number
          id: string
          manifest_json: Json
          project_id: string
          resolution: string | null
          song_analysis_id: string | null
          title: string | null
          updated_at: string
          variation_id: string | null
          version_number: number
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string
          duration_frames?: number | null
          export_status?: Database["public"]["Enums"]["export_status"]
          frame_rate?: number
          id?: string
          manifest_json?: Json
          project_id: string
          resolution?: string | null
          song_analysis_id?: string | null
          title?: string | null
          updated_at?: string
          variation_id?: string | null
          version_number?: number
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string
          duration_frames?: number | null
          export_status?: Database["public"]["Enums"]["export_status"]
          frame_rate?: number
          id?: string
          manifest_json?: Json
          project_id?: string
          resolution?: string | null
          song_analysis_id?: string | null
          title?: string | null
          updated_at?: string
          variation_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "timeline_manifests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_manifests_song_analysis_id_fkey"
            columns: ["song_analysis_id"]
            isOneToOne: false
            referencedRelation: "song_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_manifests_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "video_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_versions: {
        Row: {
          actor_name: string | null
          actor_type: string
          change_summary: string
          created_at: string
          id: string
          manifest_id: string
          manifest_json: Json
          version_number: number
        }
        Insert: {
          actor_name?: string | null
          actor_type: string
          change_summary: string
          created_at?: string
          id?: string
          manifest_id: string
          manifest_json?: Json
          version_number: number
        }
        Update: {
          actor_name?: string | null
          actor_type?: string
          change_summary?: string
          created_at?: string
          id?: string
          manifest_id?: string
          manifest_json?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "timeline_versions_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "timeline_manifests"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_versions: {
        Row: {
          created_at: string
          id: string
          mood: string | null
          notes: string | null
          project_id: string
          replaced_by: string
          treatment_json: Json | null
          treatment_mode: string | null
          treatment_model: string | null
          treatment_text: string
          treatment_updated_at: string | null
          user_id: string
          variation_id: string | null
          visual_style: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mood?: string | null
          notes?: string | null
          project_id: string
          replaced_by?: string
          treatment_json?: Json | null
          treatment_mode?: string | null
          treatment_model?: string | null
          treatment_text?: string
          treatment_updated_at?: string | null
          user_id: string
          variation_id?: string | null
          visual_style?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mood?: string | null
          notes?: string | null
          project_id?: string
          replaced_by?: string
          treatment_json?: Json | null
          treatment_mode?: string | null
          treatment_model?: string | null
          treatment_text?: string
          treatment_updated_at?: string | null
          user_id?: string
          variation_id?: string | null
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_versions_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "video_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_scenes: {
        Row: {
          created_at: string
          end_seconds: number
          id: string
          name: string
          notes: string
          outfit_key: string | null
          project_id: string
          start_seconds: number
          updated_at: string
          user_id: string
          variation_id: string
        }
        Insert: {
          created_at?: string
          end_seconds: number
          id?: string
          name: string
          notes?: string
          outfit_key?: string | null
          project_id: string
          start_seconds: number
          updated_at?: string
          user_id?: string
          variation_id: string
        }
        Update: {
          created_at?: string
          end_seconds?: number
          id?: string
          name?: string
          notes?: string
          outfit_key?: string | null
          project_id?: string
          start_seconds?: number
          updated_at?: string
          user_id?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variation_scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variation_scenes_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "video_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_projects: {
        Row: {
          active_variation_id: string | null
          artist_id: string | null
          aspect_ratio: string
          bpm: number | null
          color_palette: string[]
          created_at: string
          creative_exemplars: string[]
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
          active_variation_id?: string | null
          artist_id?: string | null
          aspect_ratio?: string
          bpm?: number | null
          color_palette?: string[]
          created_at?: string
          creative_exemplars?: string[]
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
          active_variation_id?: string | null
          artist_id?: string | null
          aspect_ratio?: string
          bpm?: number | null
          color_palette?: string[]
          created_at?: string
          creative_exemplars?: string[]
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
            foreignKeyName: "video_projects_active_variation_id_fkey"
            columns: ["active_variation_id"]
            isOneToOne: false
            referencedRelation: "video_variations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_projects_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      video_variations: {
        Row: {
          archived: boolean
          created_at: string
          duplicated_from: string | null
          id: string
          mood: string | null
          name: string
          notes: string | null
          project_id: string
          treatment_json: Json
          updated_at: string
          user_id: string
          visual_style: string | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          duplicated_from?: string | null
          id?: string
          mood?: string | null
          name: string
          notes?: string | null
          project_id: string
          treatment_json?: Json
          updated_at?: string
          user_id?: string
          visual_style?: string | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          duplicated_from?: string | null
          id?: string
          mood?: string | null
          name?: string
          notes?: string | null
          project_id?: string
          treatment_json?: Json
          updated_at?: string
          user_id?: string
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_variations_duplicated_from_fkey"
            columns: ["duplicated_from"]
            isOneToOne: false
            referencedRelation: "video_variations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_variations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      writer_runs: {
        Row: {
          actual_cost_usd: number | null
          allocation_json: Json | null
          beats_json: Json | null
          clips_json: Json | null
          coverage_json: Json | null
          created_at: string
          error_text: string | null
          estimated_cost_usd: number | null
          finished_at: string | null
          id: string
          missing_json: Json | null
          mode: string
          model: string | null
          project_id: string
          shots_asked: number | null
          shots_written: number | null
          status: string
          treatment_chars: number | null
          treatment_fingerprint: string | null
          usage_json: Json | null
          user_id: string
          variation_id: string | null
        }
        Insert: {
          actual_cost_usd?: number | null
          allocation_json?: Json | null
          beats_json?: Json | null
          clips_json?: Json | null
          coverage_json?: Json | null
          created_at?: string
          error_text?: string | null
          estimated_cost_usd?: number | null
          finished_at?: string | null
          id?: string
          missing_json?: Json | null
          mode?: string
          model?: string | null
          project_id: string
          shots_asked?: number | null
          shots_written?: number | null
          status?: string
          treatment_chars?: number | null
          treatment_fingerprint?: string | null
          usage_json?: Json | null
          user_id: string
          variation_id?: string | null
        }
        Update: {
          actual_cost_usd?: number | null
          allocation_json?: Json | null
          beats_json?: Json | null
          clips_json?: Json | null
          coverage_json?: Json | null
          created_at?: string
          error_text?: string | null
          estimated_cost_usd?: number | null
          finished_at?: string | null
          id?: string
          missing_json?: Json | null
          mode?: string
          model?: string | null
          project_id?: string
          shots_asked?: number | null
          shots_written?: number | null
          status?: string
          treatment_chars?: number | null
          treatment_fingerprint?: string | null
          usage_json?: Json | null
          user_id?: string
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "writer_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writer_runs_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "video_variations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_provider_jobs: {
        Args: { p_limit?: number; p_user?: string }
        Returns: {
          created_at: string
          error_text: string | null
          external_job_id: string | null
          finalized_at: string | null
          id: string
          progress_claimed_at: string | null
          progress_failures: number
          progress_note: string | null
          project_id: string
          prompt_id: string | null
          provider: Database["public"]["Enums"]["provider_name"]
          request_payload_json: Json
          response_payload_json: Json
          result_asset_id: string | null
          status: Database["public"]["Enums"]["provider_job_status"]
          updated_at: string
          user_id: string
          variation_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "provider_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      duplicate_variation: {
        Args: { p_name: string; p_source: string }
        Returns: string
      }
      kick_provider_jobs: { Args: never; Returns: undefined }
      lyric_lines_in_window: {
        Args: { p_end: number; p_project: string; p_start: number }
        Returns: {
          block: number | null
          confidence: number
          created_at: string
          end_seconds: number
          id: string
          line_index: number
          project_id: string
          section: string
          source: string
          start_seconds: number
          text: string
          updated_at: string
          user_id: string
          words_json: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "lyric_lines"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reap_stale_jacket_inpaints: { Args: never; Returns: Json }
      treatment_text_of: { Args: { j: Json }; Returns: string }
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
        | "premiere"
        | "resolve"
        | "remotion"
      product_asset_role:
        | "design_concept"
        | "inspiration"
        | "mood_board"
        | "logo_placement_experiment"
        | "front"
        | "back"
        | "side"
        | "detail"
        | "on_model_reference"
        | "tech_flat_front"
        | "tech_flat_back"
        | "tech_flat_side"
        | "material_swatch"
        | "manufacturer_spec"
      product_slot:
        | "top"
        | "bottom"
        | "outerwear"
        | "footwear"
        | "accessory"
        | "dress"
      product_status: "concept" | "approved" | "in_production" | "archived"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "premiere",
        "resolve",
        "remotion",
      ],
      product_asset_role: [
        "design_concept",
        "inspiration",
        "mood_board",
        "logo_placement_experiment",
        "front",
        "back",
        "side",
        "detail",
        "on_model_reference",
        "tech_flat_front",
        "tech_flat_back",
        "tech_flat_side",
        "material_swatch",
        "manufacturer_spec",
      ],
      product_slot: [
        "top",
        "bottom",
        "outerwear",
        "footwear",
        "accessory",
        "dress",
      ],
      product_status: ["concept", "approved", "in_production", "archived"],
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
