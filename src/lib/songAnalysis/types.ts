/**
 * Phase A — Song intelligence row shape (mirrors public.song_analyses).
 *
 * The Database type from supabase/types.ts doesn't include this table yet;
 * Lovable's typegen runs on its own cadence. Until then, the query layer
 * casts to `any` at the seam and returns strongly-typed rows from here.
 */

export type BeatMarker = { t: number; beat: number; bar: number };

export type EnergySample = { t: number; energy: number };

export type Drop = { t: number; intensity: number };

export type Section = {
  name: string;
  start: number;
  end: number;
  energy?: "low" | "mid" | "high";
};

export type Hook = { t: number; end: number; label: string };

export type SongAnalysis = {
  id: string;
  project_id: string;
  bpm: number | null;
  duration_seconds: number | null;
  energy_curve_json: EnergySample[];
  beat_map_json: BeatMarker[];
  sections_json: Section[];
  drops_json: Drop[];
  hooks_json: Hook[];
  analysis_provider: string | null;
  analyzed_at: string;
};

export type SongAnalysisInsert = Omit<SongAnalysis, "id" | "analyzed_at"> & {
  id?: string;
  analyzed_at?: string;
};
