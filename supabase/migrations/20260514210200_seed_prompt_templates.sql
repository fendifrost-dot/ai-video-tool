-- AI Music Video OS — Seed Prompt Templates
-- Global templates (user_id = null, is_seed = true). Readable by all authenticated users.
-- Users cannot edit/delete these (RLS); they can clone to a personal template if they want to customize.
--
-- Placeholder syntax: {{artist.name}}, {{artist.face}}, {{artist.continuity}}, {{shot.scene_description}}, etc.
-- The compiler (src/lib/prompts/compiler.ts) handles substitution + auto-injection of artist continuity rules.

-- Idempotent: clear existing seeds before re-inserting
delete from public.prompt_templates where is_seed = true;

insert into public.prompt_templates
  (user_id, name, description, provider, category, template_body, default_negative_prompt, default_settings_json, is_seed)
values

-- =============================================================================
-- RUNWAY
-- =============================================================================
(null,
 'Runway — Image-to-Video Performance',
 'Drives motion off a reference image. Best for performance shots with a specific look already locked.',
 'runway',
 'image_to_video',
$body$cinematic shot, {{artist.name}} performing, {{shot.scene_description}}. Camera: {{shot.camera_direction}}. Lighting: {{shot.lighting}}. Wardrobe: {{shot.wardrobe}}. Environment: {{shot.environment}}. Mood: {{project.mood}}. Visual style: {{project.visual_style}}. Subtle natural motion, breathing, micro-expressions. {{artist.continuity}}$body$,
 'distorted face, warped features, extra fingers, mangled hands, identity drift, inconsistent jewelry, missing tattoos, blurry, low quality, watermark, jpeg artifacts, oversaturated, deepfake-look',
 '{"duration_seconds": 5, "motion_amount": "low", "aspect_ratio": "9:16"}'::jsonb,
 true),

(null,
 'Runway — Text-to-Video Cinematic',
 'Cold-start text-to-video. Best when no reference image exists yet.',
 'runway',
 'text_to_video',
$body$cinematic music video shot of {{artist.name}}. {{artist.face}} {{artist.body}} wearing {{artist.wardrobe}}. {{artist.distinguishing}}. {{shot.scene_description}}. Camera: {{shot.camera_direction}}. Lighting: {{shot.lighting}}. Environment: {{shot.environment}}. Mood: {{project.mood}}. Color palette: {{project.color_palette}}. Visual style: {{project.visual_style}}. {{artist.continuity}}$body$,
 'distorted face, identity drift, extra limbs, warped hands, missing tattoos, inconsistent jewelry, blurry, low quality, watermark, oversaturated, low contrast, deepfake',
 '{"duration_seconds": 5, "aspect_ratio": "9:16"}'::jsonb,
 true),

-- =============================================================================
-- VEO / GEMINI
-- =============================================================================
(null,
 'Veo — Cinematic Performance',
 'Veo prefers natural-language paragraphs. Excellent at camera language and physical realism.',
 'veo',
 'text_to_video',
$body$A {{shot.duration}}-second cinematic music video shot of {{artist.name}}, a {{artist.body}} artist with {{artist.face}} and {{artist.hair}}, wearing {{artist.wardrobe}}. {{artist.distinguishing}}. The scene: {{shot.scene_description}}. The camera {{shot.camera_direction}}. The lighting is {{shot.lighting}}. The setting is {{shot.environment}}. Visual style is {{project.visual_style}} with a {{project.mood}} mood and a {{project.color_palette}} palette. Continuity: {{artist.continuity}}.$body$,
 'distorted face, identity drift, extra fingers, warped hands, missing tattoos, inconsistent jewelry, blurry, low quality, watermark, text overlay, jpeg artifacts',
 '{"duration_seconds": 8, "aspect_ratio": "9:16", "quality": "high"}'::jsonb,
 true),

(null,
 'Veo — Image-to-Video Continuation',
 'Animates a still while preserving artist identity. Pair with a strong reference image.',
 'veo',
 'image_to_video',
$body$Animate this still of {{artist.name}} for {{shot.duration}} seconds with subtle, naturalistic motion. {{shot.scene_description}}. The camera {{shot.camera_direction}}. Lighting holds at {{shot.lighting}}. Preserve all wardrobe, jewelry, and identifying features exactly: {{artist.continuity}}. Do not add or remove any tattoos, accessories, or wardrobe items.$body$,
 'identity drift, distorted face, warped wardrobe, missing jewelry, extra tattoos, character morphing, jump cut, blurry, low quality, watermark',
 '{"duration_seconds": 8, "aspect_ratio": "9:16", "motion_amount": "moderate"}'::jsonb,
 true),

-- =============================================================================
-- GROK IMAGINE
-- =============================================================================
(null,
 'Grok — Stylized Performance',
 'Grok responds well to comma-separated descriptors and edgier aesthetics.',
 'grok',
 'text_to_video',
$body${{artist.name}}, {{artist.face}}, {{artist.body}}, {{artist.hair}}, wearing {{artist.wardrobe}}, {{artist.distinguishing}}, {{shot.scene_description}}, {{shot.camera_direction}}, {{shot.lighting}}, {{shot.environment}}, {{project.mood}} mood, {{project.visual_style}} style, {{project.color_palette}} palette, {{shot.duration}} seconds, music video aesthetic, continuity: {{artist.continuity}}$body$,
 'distorted face, identity drift, extra limbs, warped hands, missing tattoos, inconsistent jewelry, blurry, low quality, watermark, jpeg artifacts',
 '{"duration_seconds": 6, "aspect_ratio": "9:16"}'::jsonb,
 true),

-- =============================================================================
-- HIGGSFIELD — camera-language specialist
-- =============================================================================
(null,
 'Higgsfield — Hero Performance with Camera Move',
 'Higgsfield excels at named camera moves. Lean into camera language.',
 'higgsfield',
 'performance',
$body$Camera move: {{shot.camera_direction}}. Subject: {{artist.name}}, {{artist.face}}, {{artist.body}}, wearing {{artist.wardrobe}}, {{artist.distinguishing}}. Scene: {{shot.scene_description}}. Lighting: {{shot.lighting}}. Environment: {{shot.environment}}. Visual style: {{project.visual_style}}. Mood: {{project.mood}}. Duration: {{shot.duration}} seconds. Continuity locks: {{artist.continuity}}.$body$,
 'identity drift, distorted face, extra fingers, missing tattoos, warped jewelry, jitter, motion blur on subject, blurry, low quality, watermark',
 '{"duration_seconds": 5, "camera_preset": "dolly_in", "aspect_ratio": "9:16"}'::jsonb,
 true),

-- =============================================================================
-- PIKA / FAL
-- =============================================================================
(null,
 'Pika — Short Punchy Clip',
 'Pika favors short, dense prompts. Front-load the subject and key descriptors.',
 'pika',
 'image_to_video',
$body${{artist.name}}, {{shot.scene_description}}, {{shot.camera_direction}}, {{shot.lighting}}, {{project.mood}} mood, {{project.visual_style}} style, music video, {{shot.duration}}s. Preserve identity: {{artist.continuity}}.$body$,
 'distorted face, identity drift, extra fingers, warped hands, missing tattoos, inconsistent jewelry, blurry, low quality, watermark',
 '{"duration_seconds": 3, "aspect_ratio": "9:16"}'::jsonb,
 true),

(null,
 'Fal — General Cinematic',
 'Fal hosts many models. This template is the safe baseline; tune per-model.',
 'fal',
 'text_to_video',
$body$Cinematic music video shot of {{artist.name}}. {{artist.face}}, {{artist.body}}, wearing {{artist.wardrobe}}, {{artist.distinguishing}}. {{shot.scene_description}}. Camera: {{shot.camera_direction}}. Lighting: {{shot.lighting}}. Environment: {{shot.environment}}. Mood: {{project.mood}}. Style: {{project.visual_style}}. Palette: {{project.color_palette}}. Duration: {{shot.duration}}s. Continuity: {{artist.continuity}}.$body$,
 'distorted face, identity drift, extra fingers, warped hands, missing tattoos, inconsistent jewelry, blurry, low quality, watermark, jpeg artifacts',
 '{"duration_seconds": 5, "aspect_ratio": "9:16"}'::jsonb,
 true),

-- =============================================================================
-- UNIVERSAL CATEGORIES (provider = null, use formatPrompt per provider)
-- =============================================================================
(null,
 'Universal — B-Roll Environment',
 'Atmospheric scene without the artist. Wide environmental shot.',
 null,
 'b_roll',
$body${{shot.scene_description}}. {{shot.camera_direction}}. {{shot.lighting}}. {{shot.environment}}. {{project.mood}} mood, {{project.visual_style}} style, {{project.color_palette}} palette. No characters in frame unless specified. Cinematic, music video aesthetic, {{shot.duration}}s.$body$,
 'people in frame, character, face, hands, identity drift, blurry, low quality, watermark, text overlay',
 '{"duration_seconds": 4, "aspect_ratio": "9:16"}'::jsonb,
 true),

(null,
 'Universal — Lyric Performance Direct-to-Camera',
 'Talking-head style direct address with lip-sync intent. Pair with audio-driven lipsync provider.',
 null,
 'lipsync',
$body${{artist.name}} performing directly to camera, {{artist.face}}, {{artist.body}}, wearing {{artist.wardrobe}}, {{artist.distinguishing}}. Singing the lyric: "{{shot.scene_description}}". {{shot.camera_direction}}. {{shot.lighting}}. {{shot.environment}}. {{project.mood}} mood. Mouth movements must match the audio precisely. Continuity: {{artist.continuity}}.$body$,
 'closed mouth on vocals, lip-sync drift, identity drift, distorted face, warped jaw, extra teeth, missing tattoos, jewelry pop, blurry, watermark',
 '{"duration_seconds": 6, "aspect_ratio": "9:16", "audio_driven": true}'::jsonb,
 true),

(null,
 'Universal — Greenscreen Performance Plate',
 'Performance against pure green, intended for compositing in After Effects.',
 null,
 'greenscreen',
$body${{artist.name}} performing against a clean chroma-key green background, {{artist.face}}, {{artist.body}}, wearing {{artist.wardrobe}}, {{artist.distinguishing}}. {{shot.scene_description}}. Lighting: {{shot.lighting}} with hard rim light to separate subject from green. Camera locked, no motion in background. Edges crisp for keying. Continuity: {{artist.continuity}}.$body$,
 'green spill on subject, soft edges, motion blur on hair, identity drift, distorted face, missing tattoos, jewelry pop, low contrast, blurry, watermark',
 '{"duration_seconds": 5, "aspect_ratio": "9:16", "background": "chroma_green"}'::jsonb,
 true),

(null,
 'Universal — VFX Hero Shot',
 'Effects-heavy hero moment. Pair with After Effects work downstream.',
 null,
 'vfx',
$body$Hero VFX shot of {{artist.name}}. {{artist.face}}, {{artist.body}}, wearing {{artist.wardrobe}}, {{artist.distinguishing}}. Effect: {{shot.scene_description}}. {{shot.camera_direction}}. {{shot.lighting}}. {{shot.environment}}. {{project.mood}} mood, {{project.visual_style}} style. The effect must not distort or replace the artist's face, hands, or identifying features. Continuity locks: {{artist.continuity}}.$body$,
 'identity drift on subject, melted face, distorted body, missing tattoos, jewelry replacement, effect overtaking subject, blurry, watermark, jpeg artifacts',
 '{"duration_seconds": 5, "aspect_ratio": "9:16", "complexity": "high"}'::jsonb,
 true),

(null,
 'Universal — Transition Whip-Pan',
 'Fast camera transition between two scenes. Use on hook breaks.',
 null,
 'transition',
$body$Whip-pan transition shot, {{shot.duration}}s. Starting: {{shot.scene_description}}. Camera: {{shot.camera_direction}} with motion blur. Lighting shifts from {{shot.lighting}}. Mood: {{project.mood}}. Visual style: {{project.visual_style}}. Edges of motion sharp enough to cut into the next shot.$body$,
 'static camera, slow motion, identity drift, face in frame, blurry subject, low quality, watermark',
 '{"duration_seconds": 1, "aspect_ratio": "9:16", "motion": "high"}'::jsonb,
 true),

(null,
 'Universal — Performance Wide Establish',
 'Establishing wide shot of the artist in the environment. Hook opener.',
 null,
 'performance',
$body$Wide establishing shot of {{artist.name}} in {{shot.environment}}. {{artist.face}}, {{artist.body}}, wearing {{artist.wardrobe}}, {{artist.distinguishing}}. {{shot.scene_description}}. {{shot.camera_direction}}. {{shot.lighting}}. {{project.mood}} mood, {{project.visual_style}} style, {{project.color_palette}} palette. Duration: {{shot.duration}}s. Continuity: {{artist.continuity}}.$body$,
 'identity drift, distorted face, extra fingers, warped hands, missing tattoos, inconsistent jewelry, blurry, low quality, watermark, jpeg artifacts',
 '{"duration_seconds": 6, "aspect_ratio": "9:16"}'::jsonb,
 true);
