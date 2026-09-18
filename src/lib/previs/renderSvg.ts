/**
 * Animated SVG renderer for a previs plan (Lane E).
 *
 * Turns a {@link PrevisPlan} into a self-contained, animated SVG string. The
 * animation is pure SMIL (`<animateTransform>`) so it needs no CSS, no JS and
 * no external assets — it runs when the markup is inlined into the DOM. This is
 * the "cheap / deterministic / mock asset" mandate: zero model calls, zero cost,
 * identical output for identical input.
 *
 * The figure is a neutral placeholder (head + torso), NOT a rendered performer:
 * a previs blocks out framing and camera motion, it does not fabricate footage.
 */

import type { PrevisPlan } from "./previsPlan";

/** Escape the few characters that matter inside SVG text / attribute values. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function num(n: number): string {
  // Trim to 2dp so the string is stable and compact.
  return (Math.round(n * 100) / 100).toString();
}

function animateTransform(motion: PrevisPlan["motion"]): string {
  const t = motion.transform;
  if (!t) return "";
  const attrs = [
    'attributeName="transform"',
    'attributeType="XML"',
    `type="${t.type}"`,
    `values="${t.values}"`,
    `dur="${num(t.dur)}s"`,
    'repeatCount="indefinite"',
    'additive="sum"',
    'calcMode="spline"',
    // Ease in/out between each pair of key values so the move feels like camera work.
    `keySplines="${t.values
      .split(";")
      .slice(1)
      .map(() => "0.4 0 0.6 1")
      .join("; ")}"`,
    `keyTimes="${t.values
      .split(";")
      .map((_, i, arr) => num(i / (arr.length - 1)))
      .join("; ")}"`,
  ].join(" ");
  return `<animateTransform ${attrs} />`;
}

/** The neutral subject figure (head + torso) sized to the framing box. */
function figure(plan: PrevisPlan): string {
  const { subject } = plan.framing;
  const headR = Math.max(4, subject.w * 0.32);
  const headCx = subject.x + subject.w / 2;
  const headCy = subject.y + headR;
  const bodyY = headCy + headR * 0.8;
  const bodyH = Math.max(0, subject.y + subject.h - bodyY);
  const bodyRx = Math.min(subject.w / 2, 10);
  return [
    `<circle cx="${num(headCx)}" cy="${num(headCy)}" r="${num(headR)}" fill="${plan.palette.subject}" />`,
    `<rect x="${num(subject.x)}" y="${num(bodyY)}" width="${num(subject.w)}" height="${num(bodyH)}" rx="${num(bodyRx)}" fill="${plan.palette.subject}" />`,
  ].join("");
}

/** Rule-of-thirds guides + framing corners drawn in the accent colour. */
function framingGuides(plan: PrevisPlan): string {
  const { width, height, palette } = plan;
  const stroke = `stroke="${palette.accent}" stroke-width="0.75" opacity="0.5"`;
  const x1 = width / 3;
  const x2 = (width * 2) / 3;
  const y1 = height / 3;
  const y2 = (height * 2) / 3;
  return [
    `<line x1="${num(x1)}" y1="0" x2="${num(x1)}" y2="${height}" ${stroke} />`,
    `<line x1="${num(x2)}" y1="0" x2="${num(x2)}" y2="${height}" ${stroke} />`,
    `<line x1="0" y1="${num(y1)}" x2="${width}" y2="${num(y1)}" ${stroke} />`,
    `<line x1="0" y1="${num(y2)}" x2="${width}" y2="${num(y2)}" ${stroke} />`,
  ].join("");
}

/**
 * Render a previs plan to an animated SVG string.
 *
 * @param opts.animated  When false, emits a static poster frame (no SMIL). Used
 *   for environments/tests where animation is undesirable. Default true.
 * @param opts.title     Include the accessible `<title>`. Default true.
 */
export function renderPrevisSvg(
  plan: PrevisPlan,
  opts: { animated?: boolean; title?: boolean } = {},
): string {
  const animated = opts.animated ?? true;
  const withTitle = opts.title ?? true;
  const { width, height, palette } = plan;
  const gradId = `sky-${plan.seed.toString(36)}`;

  const cameraContent = [figure(plan)].join("");
  const camAnim = animated ? animateTransform(plan.motion) : "";

  const caption = esc(
    `${plan.captions.framing} · ${plan.captions.motion} · ${plan.captions.duration}`,
  );
  const titleText = esc(plan.title);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(`Previs: ${plan.title}`)}">`,
    withTitle ? `<title>${titleText}</title>` : "",
    `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${palette.skyTop}" />`,
    `<stop offset="1" stop-color="${palette.skyBottom}" />`,
    `</linearGradient></defs>`,
    // Backdrop + ground plane.
    `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#${gradId})" />`,
    `<rect x="0" y="${num(height * 0.72)}" width="${width}" height="${num(height * 0.28)}" fill="${palette.ground}" />`,
    // Camera group carries the motion animation; subject lives inside it.
    `<g>${camAnim}${cameraContent}</g>`,
    framingGuides(plan),
    // Caption bar.
    `<rect x="0" y="${num(height - 16)}" width="${width}" height="16" fill="rgba(0,0,0,0.55)" />`,
    `<text x="6" y="${num(height - 5)}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" fill="#fff">${caption}</text>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("");
}

/**
 * Encode an SVG string as a `data:` URI suitable for `previs.uri` or an `<img>`
 * src. Uses `encodeURIComponent` (not base64) so the payload stays diffable and
 * deterministic across platforms.
 */
export function previsSvgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
