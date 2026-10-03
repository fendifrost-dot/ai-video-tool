/**
 * The shots.json dialect (scripts/broll/run_world_batch.py lines 8–24), parsed. One dialect for the Python runner,
 * the shot compiler and the in-app runner: nothing here invents a field.
 */
import { z } from "zod";

export const WORLD_BATCH_ROUTES = [
  "still_runway",
  "still_runway45",
  "still_kling",
  "still_dop",
  "runway_t2v",
  "kling_t2v",
  "seedance_ref",
] as const;
export type BatchRoute = (typeof WORLD_BATCH_ROUTES)[number];

export const BatchShotSchema = z
  .object({
    id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_.-]+$/, "id: letters, digits, _ . - only (it names files)"),
    kind: z.enum(["world", "plate", "angle"]).default("world"),
    aspect: z.enum(["9:16", "16:9", "4:3", "1:1", "3:4"]).default("9:16"),
    seconds: z.number().positive().max(30).default(5),
    prompt: z.string().default(""),
    motion: z.string().default(""),
    route: z.enum(WORLD_BATCH_ROUTES),
    stills: z.number().int().min(1).max(4).default(2),
    still_path: z.string().nullish(),
    /** false = accept a still that looks like stacked panels (a real horizon across the whole frame can read as one) */
    panel_check: z.boolean().default(true),
    model: z.string().nullish(),
    // seedance_ref
    source_path: z.string().nullish(),
    source_local: z.string().nullish(),
    source_trim: z.tuple([z.number(), z.number()]).nullish(),
    source_seconds: z.number().positive().nullish(),
    source_window: z.tuple([z.number(), z.number()]).nullish(),
    /** The project asset the source clip was cut from (the storyboard's restaging: the result keeps that take's clock). */
    source_asset_id: z.string().nullish(),
    masterStart: z.number().nullish(),
    angle: z.string().nullish(),
    keep: z.array(z.string()).default([]),
    resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
  })
  .passthrough();
export type BatchShot = z.infer<typeof BatchShotSchema>;

export type ParsedShots = { shots: BatchShot[]; errors: string[] };

/** Parse a shots.json text. Every problem is reported with the shot it belongs to; nothing is silently dropped. */
export function parseShotsJson(text: string): ParsedShots {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { shots: [], errors: [`not JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }
  if (!Array.isArray(raw)) return { shots: [], errors: ["shots.json is a list of shots"] };
  const shots: BatchShot[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    const r = BatchShotSchema.safeParse(item);
    const label = typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : `#${i + 1}`;
    if (!r.success) {
      errors.push(`${label}: ${r.error.issues.map((x) => `${x.path.join(".") || "shot"} ${x.message}`).join("; ")}`);
      return;
    }
    if (seen.has(r.data.id)) {
      errors.push(`${label}: duplicate id`);
      return;
    }
    seen.add(r.data.id);
    shots.push(r.data);
  });
  return { shots, errors };
}

/** What a shot still needs before it can be submitted from the browser ("" = ready). */
export function missingInput(shot: BatchShot): string {
  if (shot.route === "seedance_ref") {
    if (!shot.source_path) return "needs its source clip (the real take, 4–30 s) uploaded";
    if (!shot.angle?.trim()) return "needs an angle sentence";
    if (shot.keep.length === 0) return "needs keep[] — the wardrobe constants";
    return "";
  }
  if (!shot.prompt.trim() && !shot.motion.trim()) return "needs a prompt";
  if (shot.route === "still_dop" && !shot.still_path && !shot.prompt.trim()) return "needs a still or a scene prompt";
  return "";
}
