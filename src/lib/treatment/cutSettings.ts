/**
 * The director's cut settings: how fast a board is cut and how long its shots are (2026-10-15).
 *
 * Kept on the variation's treatment record (`treatment_json.cut`), so every board can have its own pace and the tool
 * cuts the same way without anyone re-explaining it. Fendi, 14 Oct: "we want this to run in the event that Claude is
 * not available … easy to manipulate clip lengths". Read by the grid (lib/treatment/grid.ts) on a first write and on
 * a re-cut; an existing board's windows are never changed by a setting alone.
 */
import { DEFAULT_PACE, fastTargetsOf, type ClipEnergy, type GridPace } from "./grid";

/** How a treatment is shaped (the writer's `treatment_style`; supabase/functions/treatment-writer-proxy/contract.ts — the same two words). */
export const TREATMENT_STYLES = ["montage_twists", "classic"] as const;
export type TreatmentStyle = (typeof TREATMENT_STYLES)[number];

export type CutSettings = {
  /**
   * The board's treatment style. Unset = not chosen: a treatment the AI writes is a montage of twists, the director's
   * own text is cut the classic way (the writer's default). Set = that style for both.
   */
  style?: TreatmentStyle | null;
  pace: GridPace;
  /** Fast pace: seconds per shot by energy (high, mid, low; a drop cuts like high unless set). */
  targets: Record<ClipEnergy, number>;
};

export const DEFAULT_CUT: CutSettings = { pace: DEFAULT_PACE, targets: fastTargetsOf(null) };

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** The cut settings saved on a treatment record; anything missing or invalid is the default. */
export function parseCutSettings(treatmentJson: unknown): CutSettings {
  const cut = asObject(asObject(treatmentJson).cut);
  const pace: GridPace = cut.pace === "cinematic" || cut.pace === "fast" ? cut.pace : DEFAULT_PACE;
  const t = asObject(cut.targets);
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const style = TREATMENT_STYLES.find((x) => x === cut.style) ?? null;
  return { ...(style ? { style } : {}), pace, targets: fastTargetsOf({ high: num(t.high), mid: num(t.mid), low: num(t.low), drop: num(t.drop) }) };
}

/** The treatment record with these cut settings in it (everything else kept). */
export function withCutSettings(treatmentJson: unknown, cut: CutSettings): Record<string, unknown> {
  return { ...asObject(treatmentJson), cut: { ...(cut.style ? { style: cut.style } : {}), pace: cut.pace, targets: fastTargetsOf(cut.targets) } };
}

/** The grid options these settings give. */
export function gridPaceOptions(cut: CutSettings): { pace: GridPace; fastTargets: Record<ClipEnergy, number> } {
  return { pace: cut.pace, fastTargets: cut.targets };
}
