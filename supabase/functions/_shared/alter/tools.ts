import { listPresets } from "./catalog.ts";
import { rejudge } from "./judge.ts";
import { planAlter, planFinalize } from "./plan.ts";
import { buildAlterPrompt } from "./prompt.ts";
import type { AlterMode } from "./types.ts";

type Result = { ok: true; value: unknown } | { ok: false; error: string };

function uiMode(value: unknown): AlterMode | undefined {
  if (value === "swap" || value === "motion" || value === "restyle") return value;
  return undefined;
}

function text(value: unknown, name: string, max = 4000): string | { error: string } {
  if (typeof value !== "string") return { error: `${name} must be text.` };
  if (value.length > max) return { error: `${name} is longer than ${max} characters.` };
  return value;
}

/** Slot values: a plain object of short strings, or nothing. Anything else is an error, never a cast. */
class SlotError {
  readonly message: string;
  constructor(message: string) {
    this.message = message;
  }
}

function slotsOf(value: unknown): Record<string, string> | undefined | SlotError {
  if (value == null) return undefined;
  if (typeof value !== "object" || Array.isArray(value))
    return new SlotError("slots must be an object.");
  const out: Record<string, string> = Object.create(null);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\w{1,40}$/.test(key))
      return new SlotError(`slot name ${JSON.stringify(key.slice(0, 40))} is not a word.`);
    if (key === "who" || key === "style")
      return new SlotError(`${key} is its own argument, not a slot.`);
    if (typeof item !== "string") return new SlotError(`slot ${key} must be text.`);
    if (item.length > 4000) return new SlotError(`slot ${key} is longer than 4000 characters.`);
    out[key] = item;
  }
  return out;
}

function common(
  args: Record<string, unknown>,
):
  | { error: string }
  | { preset: string; who: string; slots?: Record<string, string>; style?: string } {
  const preset = text(args.preset ?? "", "preset", 80);
  if (typeof preset !== "string") return preset;
  const who = text(args.who ?? "", "who", 400);
  if (typeof who !== "string") return who;
  const slots = slotsOf(args.slots);
  if (slots instanceof SlotError) return { error: slots.message };
  let style: string | undefined;
  if (args.style != null) {
    const value = text(args.style, "style", 400);
    if (typeof value !== "string") return value;
    style = value;
  }
  return { preset, who, slots, style };
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
    const base = common(args);
    if ("error" in base) return { ok: false, error: base.error };
    const prompt = buildAlterPrompt({ ...base, performance: args.performance !== false });
    if (!prompt.ok) return prompt;
    return { ok: true, value: { ...prompt, submitted: false, spendUsd: 0 } };
  }
  if (name === "avt_alter_plan") {
    const base = common(args);
    if ("error" in base) return { ok: false, error: base.error };
    if (args.face_image_urls != null && !Array.isArray(args.face_image_urls))
      return { ok: false, error: "face_image_urls must be a list of https links." };
    if (Array.isArray(args.face_image_urls) && args.face_image_urls.length > 16)
      return { ok: false, error: "face_image_urls: at most 4 are used; more than 16 were given." };
    for (const key of ["video_url", "target_frame_url", "project_id"] as const)
      if (args[key] != null && typeof args[key] !== "string")
        return { ok: false, error: `${key} must be text.` };
    if (typeof args.project_id === "string" && !/^[\w-]{1,64}$/.test(args.project_id))
      return { ok: false, error: "project_id must be the project's id (letters, digits, dashes)." };
    const plan = planAlter({
      ...base,
      performance: args.performance !== false,
      videoUrl: args.video_url as string | undefined,
      targetFrameUrl: args.target_frame_url as string | undefined,
      faceImageUrls: args.face_image_urls as unknown[] | undefined,
      projectId: args.project_id as string | undefined,
    });
    if ("ok" in plan) return plan;
    // A full-resolution call is attached only when the caller hands back the draft's own report.
    if (args.draft_check != null) {
      if (args.resolution != null && args.resolution !== "720p" && args.resolution !== "1080p")
        return { ok: false, error: "resolution must be 720p or 1080p." };
      if (args.face_approval != null && typeof args.face_approval !== "string")
        return { ok: false, error: "face_approval must be text: Fendi's own words." };
      return {
        ok: true,
        value: planFinalize(plan, args.draft_check, {
          resolution: (args.resolution as "720p" | "1080p" | undefined) ?? "1080p",
          faceApproval: args.face_approval as string | undefined,
        }),
      };
    }
    return { ok: true, value: plan };
  }
  if (name === "avt_alter_check") {
    const judged = rejudge(args.report);
    if (!judged.ok) return judged;
    const r = judged.value;
    return {
      ok: true,
      value: {
        verdict: r.verdict,
        mode: r.mode,
        performance: r.performance,
        redrawCleared: r.redrawCleared,
        faceNeedsHisEye: r.faceNeedsHisEye,
        next: r.next,
        issues: r.issues,
        mouth: r.mouth,
        identity: r.identity,
        measurements: r.measurements,
        basis:
          "Judged from the numbers in the supplied report. This server read no video; a report that was edited by hand is judged as edited.",
        submitted: false,
        spendUsd: 0,
      },
    };
  }
  return { ok: false, error: `unknown alter tool ${name}` };
}
