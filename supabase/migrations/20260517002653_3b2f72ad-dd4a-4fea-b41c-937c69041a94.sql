create table if not exists provider_capabilities (
  provider text primary key,
  api_status text not null check (api_status in ('live','manual_only','browser_automation')),
  max_duration_seconds numeric,
  supported_aspect_ratios text[] not null default '{}',
  supports_reference_image boolean not null default false,
  supports_negative_prompt boolean not null default false,
  optimal_prompt_style text,
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  recommended_shot_types text[] not null default '{}',
  prompt_length_max_words integer,
  notes text,
  last_verified_at timestamptz not null default now()
);

alter table provider_capabilities enable row level security;

drop policy if exists "provider_capabilities readable by anyone signed in" on provider_capabilities;
create policy "provider_capabilities readable by anyone signed in"
  on provider_capabilities for select
  to authenticated
  using (true);

insert into provider_capabilities (
  provider, api_status, max_duration_seconds, supported_aspect_ratios,
  supports_reference_image, supports_negative_prompt, optimal_prompt_style,
  strengths, weaknesses, recommended_shot_types, prompt_length_max_words, notes
) values
  ('runway','live',10,ARRAY['16:9','9:16','1:1','4:3','3:4','21:9'],true,true,'cinematic_camera_language',
    ARRAY['photoreal_performance','subtle_camera_moves','character_consistency','lighting_drama'],
    ARRAY['fast_camera_whips','complex_hand_action','dense_text_in_frame'],
    ARRAY['performance_close_up','performance_wide','b_roll_atmospheric','narrative_dialogue'],
    180,'Gen-4 / Gen-4.5. Source: https://docs.dev.runwayml.com/'),
  ('veo','live',8,ARRAY['16:9','9:16'],true,false,'short_descriptive',
    ARRAY['photoreal_general','natural_motion','audio_diegetic_sound','4k_output'],
    ARRAY['extreme_stylisation','only_two_aspect_ratios','english_only_prompts','synthid_watermark_mandatory'],
    ARRAY['performance_wide','b_roll_atmospheric','establishing_shot'],
    140,'Veo 3/3.1 via Gemini API. Single-gen 4-8s, extension up to 148s.'),
  ('pika','live',10,ARRAY['16:9','9:16','1:1','4:5','5:4'],true,true,'terse_dense',
    ARRAY['stylised_motion','vfx_morph','scene_extension','quick_iteration'],
    ARRAY['hands','dense_dialogue_lipsync','very_long_takes'],
    ARRAY['b_roll_atmospheric','vfx_transition','lyric_visual'],
    120,'Pika v2.2 routed via Fal (fal-ai/pika/v2.2/*).'),
  ('fal','live',10,ARRAY['16:9','9:16','1:1','4:5','5:4','21:9','3:2'],true,true,'model_dependent',
    ARRAY['model_buffet','low_cost','fast_iteration'],
    ARRAY['quality_varies_by_model','no_consistent_prompt_style'],
    ARRAY['b_roll_atmospheric','vfx_transition','test_iteration'],
    160,'Fal-serverless hosts many models (Mochi, Luma, Pika, etc.).'),
  ('grok','live',15,ARRAY['1:1','16:9','9:16','4:3','3:4','3:2','2:3'],true,false,'narrative_descriptive',
    ARRAY['narrative_storytelling','reference_to_video_up_to_3_refs','extension_to_148s_via_extend','wide_aspect_ratios'],
    ARRAY['no_negative_prompt','english_predominant','quality_mode_enterprise_gated'],
    ARRAY['narrative_dialogue','performance_close_up','establishing_shot'],
    160,'xAI Grok Imagine grok-imagine-video. Source: https://docs.x.ai/developers/model-capabilities/video/generation (verified 2026-05-12)'),
  ('higgsfield','live',16,ARRAY['16:9','9:16','1:1','4:3','9:21'],true,true,'cinematic_camera_language',
    ARRAY['camera_motion_presets','epic_action','quick_paid_tier_render'],
    ARRAY['paid_tier_for_full_features','newer_api_changes_often'],
    ARRAY['performance_wide','vfx_transition','establishing_shot','b_roll_atmospheric'],
    150,'Higgsfield 2.0. Paid plans extend to 16s; free 8s.')
on conflict (provider) do update set
  api_status = excluded.api_status,
  max_duration_seconds = excluded.max_duration_seconds,
  supported_aspect_ratios = excluded.supported_aspect_ratios,
  supports_reference_image = excluded.supports_reference_image,
  supports_negative_prompt = excluded.supports_negative_prompt,
  optimal_prompt_style = excluded.optimal_prompt_style,
  strengths = excluded.strengths,
  weaknesses = excluded.weaknesses,
  recommended_shot_types = excluded.recommended_shot_types,
  prompt_length_max_words = excluded.prompt_length_max_words,
  notes = excluded.notes,
  last_verified_at = now();