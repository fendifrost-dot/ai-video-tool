/**
 * The project's frame. One value on the project (`video_projects.aspect_ratio`) that everything showing or making
 * a picture derives from: the storyboard and Review stages, the image and clip requests, and the frame written into
 * the export for a renderer. A project that has never been given one is 9:16 — what every project was before the
 * setting existed — so nothing that exists changes shape.
 *
 * The frame never crops footage. Media of another shape is shown whole inside the frame; cropping to fill is an edit
 * decision, not a default.
 */
export const PROJECT_ASPECTS = ["9:16", "16:9", "1:1", "4:5"] as const;
export type ProjectAspect = (typeof PROJECT_ASPECTS)[number];
export const DEFAULT_PROJECT_ASPECT: ProjectAspect = "9:16";

/** How media of another shape sits in the frame. "contain" = whole picture, bars where it does not reach. */
export type FrameFit = "contain";
export const DEFAULT_FRAME_FIT: FrameFit = "contain";

const LABEL: Record<ProjectAspect, string> = {
  "9:16": "9:16 — vertical (Reels, Shorts, TikTok)",
  "16:9": "16:9 — wide (YouTube, TV)",
  "1:1": "1:1 — square",
  "4:5": "4:5 — portrait (feed)",
};

export function isProjectAspect(v: unknown): v is ProjectAspect {
  return typeof v === "string" && (PROJECT_ASPECTS as readonly string[]).includes(v);
}

/** The aspect stored on a project row (or anything else): a known value, else the default. */
export function parseAspect(v: unknown): ProjectAspect {
  return isProjectAspect(v) ? v : DEFAULT_PROJECT_ASPECT;
}

/** The aspect of a project row. (Read loosely: the column is newer than some generated row types.) */
export function aspectOfProject(project: unknown): ProjectAspect {
  return parseAspect((project as { aspect_ratio?: unknown } | null | undefined)?.aspect_ratio);
}

export const aspectLabel = (a: ProjectAspect): string => LABEL[a];

/** Width over height. */
export function aspectNumber(a: ProjectAspect): number {
  const [w, h] = a.split(":").map(Number);
  return w / h;
}

/** For CSS `aspect-ratio`. */
export function aspectCss(a: ProjectAspect): string {
  const [w, h] = a.split(":");
  return `${w} / ${h}`;
}

/** Pixel size of the frame at a given short side (1080 → 1080×1920 for 9:16), even numbers. */
export function frameSize(a: ProjectAspect, shortSide = 1080): { width: number; height: number } {
  const r = aspectNumber(a);
  const even = (n: number) => Math.round(n / 2) * 2;
  return r >= 1 ? { width: even(shortSide * r), height: even(shortSide) } : { width: even(shortSide), height: even(shortSide / r) };
}

/**
 * The aspects an image model can be asked for. The world-still lane draws with xAI's image model, which has no 4:5
 * (docs.x.ai image generation, read 2026-10-03: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3 …).
 */
export const STILL_REQUEST_ASPECTS = ["9:16", "16:9", "1:1", "4:3", "3:4"] as const;
export type RequestAspect = (typeof STILL_REQUEST_ASPECTS)[number];

/**
 * What to ask the image model for, for a project frame. Exact where the model has the shape; otherwise the nearest
 * shape it has, and `exact: false` — the picture is then shown whole inside the frame, never cropped to it.
 */
export function stillRequestAspect(project: ProjectAspect): { aspect: RequestAspect; exact: boolean } {
  if ((STILL_REQUEST_ASPECTS as readonly string[]).includes(project)) return { aspect: project as RequestAspect, exact: true };
  const want = aspectNumber(project);
  let best: RequestAspect = STILL_REQUEST_ASPECTS[0];
  let bestDistance = Infinity;
  for (const a of STILL_REQUEST_ASPECTS) {
    const [w, h] = a.split(":").map(Number);
    const d = Math.abs(Math.log(w / h / want));
    if (d < bestDistance) {
      best = a;
      bestDistance = d;
    }
  }
  return { aspect: best, exact: false };
}

/**
 * The largest box of the frame's shape inside a viewer `maxHeight` tall and as wide as its container, as a style:
 * the width is whichever is smaller — the container, or the width that height allows — and the height follows.
 */
export function frameBoxStyle(a: ProjectAspect, maxHeight: string): { aspectRatio: string; width: string } {
  const [w, h] = a.split(":");
  return { aspectRatio: `${w} / ${h}`, width: `min(100%, calc(${maxHeight} * ${w} / ${h}))` };
}
