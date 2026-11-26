import { listPresets } from "./catalog.ts";
import {
  CHANGED_RANGE,
  IDENTITY_DISTANCE_MAX,
  MOTION_MIN,
  RESTYLE_STRUCTURE_MAX,
  STRUCTURE_FLOOR,
} from "./gates.ts";
import { scoreMouth } from "./mouth.ts";
import { planAlter } from "./plan.ts";
import { buildAlterPrompt } from "./prompt.ts";
import type { AlterMode, CheckMode, MouthFrame } from "./types.ts";

type Result = { ok: true; value: unknown } | { ok: false; error: string };

function uiMode(value: unknown): AlterMode | undefined {
  if (value === "swap" || value === "motion" || value === "restyle") return value;
  return undefined;
}

function checkMode(value: unknown): CheckMode | null {
  if (value === "swap" || value === "recast" || value === "motion" || value === "restyle")
    return value;
  return null;
}

function series(value: unknown): MouthFrame[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((item): item is number => typeof item === "number")
    .map((openness) => ({ openness }));
}

export function runAlterTool(name: string, args: Record<string, unknown>): Result {
  if (name === "avt_alter_presets") {
    const mode = args.mode == null || args.mode === "" ? undefined : uiMode(args.mode);
    if (args.mode != null && args.mode !== "" && !mode)
      return { ok: false, error: "mode must be swap, motion, or restyle." };
    const presets = listPresets(mode);
    return {
      ok: true,
      value: {
        count: presets.length,
        presets: presets.map((preset) => ({
          name: preset.name,
          group: preset.group,
          mode: preset.mode,
          check: preset.check,
          targetFrame: preset.targetFrame,
          fill: Object.keys(preset.fill),
        })),
      },
    };
  }
  if (name === "avt_alter_prompt") {
    const prompt = buildAlterPrompt({
      preset: String(args.preset ?? ""),
      who: String(args.who ?? ""),
      slots: (args.slots ?? undefined) as Record<string, string> | undefined,
      style: typeof args.style === "string" ? args.style : undefined,
      performance: args.performance !== false,
    });
    if (!prompt.ok) return prompt;
    return { ok: true, value: { ...prompt, submitted: false, spendUsd: 0 } };
  }
  if (name === "avt_alter_plan") {
    const plan = planAlter({
      preset: String(args.preset ?? ""),
      who: String(args.who ?? ""),
      slots: (args.slots ?? undefined) as Record<string, string> | undefined,
      style: typeof args.style === "string" ? args.style : undefined,
      performance: args.performance !== false,
      putFaceBack: args.put_face_back !== false,
      videoUrl: typeof args.video_url === "string" ? args.video_url : undefined,
      targetFrameUrl: typeof args.target_frame_url === "string" ? args.target_frame_url : undefined,
      sourceSeconds: typeof args.source_seconds === "number" ? args.source_seconds : undefined,
    });
    if ("ok" in plan && plan.ok === false) return plan;
    return { ok: true, value: plan };
  }
  if (name === "avt_alter_check") {
    const mode = checkMode(args.mode);
    if (!mode) return { ok: false, error: "mode must be swap, recast, motion, or restyle." };
    const changed = Number(args.changed_area);
    const structure = Number(args.structure_median);
    const motion = Number(args.motion_correlation);
    if (![changed, structure, motion].every((value) => Number.isFinite(value))) {
      return {
        ok: false,
        error: "changed_area, structure_median, and motion_correlation are required numbers.",
      };
    }
    const [low, high] = CHANGED_RANGE[mode];
    const issues: string[] = [];
    if (Math.abs(Number(args.frame_delta ?? 0)) > 1) issues.push("length: frame counts differ");
    if (mode === "restyle" && structure > RESTYLE_STRUCTURE_MAX)
      issues.push(`restyle structure ${structure} > ${RESTYLE_STRUCTURE_MAX}`);
    if (structure < STRUCTURE_FLOOR[mode])
      issues.push(`structure ${structure} < ${STRUCTURE_FLOOR[mode]}`);
    if (changed < low) issues.push(`change ${changed} below ${low}`);
    else if (changed > high) issues.push(`change ${changed} above ${high}`);
    if (motion < MOTION_MIN) issues.push(`motion ${motion} < ${MOTION_MIN}`);
    const performance = args.performance !== false;
    const mouthSource = series(args.mouth_source);
    const mouthOutput = series(args.mouth_output);
    let mouth: { timing: number | null; timingFails: boolean } | null = null;
    if (mouthSource && mouthOutput) {
      const scored = scoreMouth(mouthSource, mouthOutput);
      mouth = { timing: scored.timing, timingFails: scored.timingFails };
      issues.push(...scored.issues);
    } else if (performance) {
      issues.push("mouth: landmarks were not supplied. A rapping shot is not cleared.");
    }
    const distance = typeof args.identity_distance === "number" ? args.identity_distance : null;
    if (performance && distance == null) issues.push("identity was not measured.");
    if (distance != null && distance > IDENTITY_DISTANCE_MAX)
      issues.push(`identity distance ${distance} is above ${IDENTITY_DISTANCE_MAX}`);
    const verdict = issues.length ? "CHECK" : "PASS";
    return {
      ok: true,
      value: {
        verdict,
        mode,
        changedArea: changed,
        structureMedian: structure,
        motionCorrelation: motion,
        mouth,
        fallback: performance && verdict === "CHECK",
        issues,
        submitted: false,
        spendUsd: 0,
      },
    };
  }
  return { ok: false, error: `unknown alter tool ${name}` };
}
