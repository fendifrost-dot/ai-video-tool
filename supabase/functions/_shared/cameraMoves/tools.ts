import { getMove, listCategories, listMoves } from "./catalog.ts";
import { planCameraMove, type FalAspect, type FalResolution } from "./fal.ts";
import { matchMoves } from "./match.ts";
import { buildCameraPrompt } from "./prompt.ts";
import { CAMERA_MOVE_TOOL_NAMES } from "./toolDefs.ts";
import type { Likeness, MotionSignature, SubjectMode } from "./types.ts";

export { CAMERA_MOVE_TOOL_NAMES };

type Result = { ok: true; value: unknown } | { ok: false; error: string };

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function modeOf(value: unknown): SubjectMode | undefined {
  if (value === "environment" || value === "performance_plate" || value === "non_performance")
    return value;
  if (value == null || value === "") return undefined;
  return undefined;
}

function likenessOf(value: unknown): Likeness | null {
  if (value === "face_check" || value === "put_back") return value;
  return null;
}

export function runCameraMoveTool(name: string, args: Record<string, unknown>): Result {
  if (name === "avt_camera_move_list") {
    const moves = listMoves({
      category: typeof args.category === "string" ? args.category : undefined,
      query: typeof args.query === "string" ? args.query : undefined,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
    return {
      ok: true,
      value: {
        count: moves.length,
        categories: listCategories(),
        moves: moves.map((move) => ({
          id: move.id,
          name: move.name,
          category: move.category,
          kind: move.kind,
          durationSec: move.durationSec,
          studyOnly: move.studyOnly,
          says: move.says,
        })),
      },
    };
  }
  if (name === "avt_camera_move_get") {
    const move = getMove(String(args.id ?? ""));
    if (!move) return { ok: false, error: `No camera move ${String(args.id ?? "")}.` };
    return { ok: true, value: move };
  }
  if (name === "avt_camera_move_prompt" || name === "avt_camera_move_plan") {
    const move = getMove(String(args.id ?? ""));
    if (!move) return { ok: false, error: `No camera move ${String(args.id ?? "")}.` };
    const place = String(args.place ?? "");
    const mode = modeOf(args.mode);
    if (args.mode != null && args.mode !== "" && !mode)
      return {
        ok: false,
        error: "mode must be environment, performance_plate, or non_performance.",
      };
    if (name === "avt_camera_move_prompt") {
      const prompt = buildCameraPrompt({ move, place, mode, likeness: likenessOf(args.likeness) });
      if (!prompt.ok) return prompt;
      return { ok: true, value: { id: move.id, ...prompt, submitted: false, spendUsd: 0 } };
    }
    const plan = planCameraMove({
      move,
      place,
      mode,
      likeness: likenessOf(args.likeness),
      videoUrl: typeof args.video_url === "string" ? args.video_url : undefined,
      faceImageUrl: typeof args.face_image_url === "string" ? args.face_image_url : undefined,
      resolution:
        typeof args.resolution === "string" ? (args.resolution as FalResolution) : undefined,
      aspectRatio:
        typeof args.aspect_ratio === "string" ? (args.aspect_ratio as FalAspect) : undefined,
      endpoint: typeof args.endpoint === "string" ? args.endpoint : undefined,
    });
    if ("ok" in plan && plan.ok === false) return plan;
    return { ok: true, value: plan };
  }
  if (name === "avt_camera_move_match") {
    const signature: MotionSignature = {
      pan: num(args.pan),
      tilt: num(args.tilt),
      dolly: num(args.dolly),
      zoom: num(args.zoom),
      rise: num(args.rise),
      orbit: num(args.orbit),
      roll: num(args.roll),
      shake: num(args.shake),
      lateral: num(args.lateral),
    };
    return {
      ok: true,
      value: {
        matches: matchMoves(signature, num(args.limit, 5) || 5),
        note: "A 2D signature cannot separate an orbit from a pan. Use the top row as a starting plate, then watch the pill.",
      },
    };
  }
  return { ok: false, error: `unknown camera-move tool ${name}` };
}
