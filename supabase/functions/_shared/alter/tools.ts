import { listPresets } from "./catalog.ts";
import {
  CHANGED_RANGE,
  IDENTITY_DISTANCE_MAX,
  MOTION_GATED,
  MOTION_MIN,
  RESTYLE_STRUCTURE_MAX,
  STRUCTURE_FLOOR,
} from "./gates.ts";
import { gateTrackScore, scoreMouth, type MouthScore, type TrackScore } from "./mouth.ts";
import { planAlter, planFinalize } from "./plan.ts";
import type { AlterReport } from "./check.ts";
import { buildAlterPrompt } from "./prompt.ts";
import type { AlterMode, CheckMode, MouthFrame } from "./types.ts";

type Result = { ok: true; value: unknown } | { ok: false; error: string };

function uiMode(value: unknown): AlterMode | undefined {
  if (value === "swap" || value === "motion" || value === "restyle") return value;
  return undefined;
}

function checkMode(value: unknown): CheckMode | null {
  if (
    value === "swap" ||
    value === "recast" ||
    value === "motion" ||
    value === "restyle" ||
    value === "action"
  )
    return value;
  return null;
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
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
      videoUrl: typeof args.video_url === "string" ? args.video_url : undefined,
      targetFrameUrl: typeof args.target_frame_url === "string" ? args.target_frame_url : undefined,
      faceImageUrls: strings(args.face_image_urls),
      projectId: typeof args.project_id === "string" ? args.project_id : undefined,
    });
    if ("ok" in plan) return plan;
    // A full-resolution call is attached only when the caller hands back the draft's own check.
    const checked = args.draft_check;
    if (checked && typeof checked === "object") {
      const full = args.resolution === "720p" ? "720p" : "1080p";
      return {
        ok: true,
        value: planFinalize(plan, checked as AlterReport, {
          resolution: full,
          faceApproval: typeof args.face_approval === "string" ? args.face_approval : undefined,
        }),
      };
    }
    return { ok: true, value: plan };
  }
  if (name === "avt_alter_check") {
    const mode = checkMode(args.mode);
    if (!mode)
      return { ok: false, error: "mode must be swap, recast, motion, restyle, or action." };
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
    if (MOTION_GATED[mode] && motion < MOTION_MIN) issues.push(`motion ${motion} < ${MOTION_MIN}`);
    const performance = args.performance !== false;
    const mouthSource = series(args.mouth_source);
    const mouthOutput = series(args.mouth_output);
    const tracked =
      args.track_score && typeof args.track_score === "object"
        ? (args.track_score as TrackScore)
        : null;
    let mouth: MouthScore | null = null;
    if (tracked) mouth = gateTrackScore(tracked);
    else if (mouthSource && mouthOutput) mouth = scoreMouth(mouthSource, mouthOutput);
    if (mouth) issues.push(...mouth.issues);
    else if (performance) {
      issues.push("mouth: landmarks were not supplied. A rapping shot is not cleared.");
    }
    const distance =
      typeof args.identity_distance === "number"
        ? args.identity_distance
        : typeof tracked?.identity_distance === "number"
          ? tracked.identity_distance
          : null;
    if (performance && distance == null)
      issues.push(
        "identity was not measured. The face is cleared by the number or by Fendi's word on the face sheet, not by this check.",
      );
    if (distance != null && distance > IDENTITY_DISTANCE_MAX)
      issues.push(`identity distance ${distance} is above ${IDENTITY_DISTANCE_MAX}`);
    const mouthFail =
      mouth?.timingFails === true ||
      mouth?.shapeFails === true ||
      (performance && !mouth?.measured);
    const measured = distance != null;
    const identityFail = measured && distance > IDENTITY_DISTANCE_MAX;
    const redrawCleared = !performance || (!mouthFail && measured && !identityFail);
    const faceNeedsHisEye = performance && !mouthFail && !measured;
    const hard = issues.filter((issue) => !issue.includes("provisional"));
    const verdict = hard.length ? "CHECK" : "PASS";
    return {
      ok: true,
      value: {
        verdict,
        mode,
        changedArea: changed,
        structureMedian: structure,
        motionCorrelation: motion,
        mouth,
        identity: { measured, fails: identityFail, distance },
        redrawCleared,
        faceNeedsHisEye,
        next: redrawCleared
          ? "The redraw is cleared by the numbers. Post it with the face sheet."
          : faceNeedsHisEye
            ? "The mouth passed. The face has no number: post the side-by-side and the face sheet, and Fendi judges the face."
            : "Not cleared. Re-roll, change the staging, or use his real take. Do not lay his original face back onto the redraw (failed by Fendi, 27 Nov 2026).",
        issues,
        submitted: false,
        spendUsd: 0,
      },
    };
  }
  return { ok: false, error: `unknown alter tool ${name}` };
}
