/**
 * Previs generation entry point (Lane E).
 *
 * `generatePrevis(spec)` is the whole product surface: a Shot Spec in, a
 * deterministic animated preview out — no paid model call, no network, no
 * randomness. The result carries the raw SVG (for inline animation), a portable
 * `data:` URI (for `ShotSpec.previs.uri` / storage), and the {@link PrevisPlan}
 * (for captions / engineering inspection).
 *
 * Production note: this synthesizes ONLY the cheap sketch. A real rendered or
 * approved previs asset (`status: "rendered" | "approved"` with a non-data URI)
 * comes from elsewhere and is never overwritten here — see {@link applyPrevisToSpec}.
 */

import { parseShotSpec, type Previs, type ShotSpec } from "@/lib/treatment/shotSpec";
import { buildPrevisPlan, type PrevisPlan } from "./previsPlan";
import { previsSvgToDataUri, renderPrevisSvg } from "./renderSvg";

export type GeneratedPrevis = {
  plan: PrevisPlan;
  /** Inline-able animated SVG markup. */
  svg: string;
  /** `data:image/svg+xml,...` — deterministic, portable. */
  dataUri: string;
  /** Ready-to-store `ShotSpec.previs` value (status "sketch"). */
  previs: Previs;
};

export type GeneratePrevisOptions = {
  /** Emit a static poster frame instead of the animated loop. Default false. */
  static?: boolean;
};

/**
 * Build the full deterministic previs bundle for a shot. Idempotent: same spec
 * → byte-identical `svg`/`dataUri`.
 */
export function generatePrevis(spec: ShotSpec, opts: GeneratePrevisOptions = {}): GeneratedPrevis {
  const plan = buildPrevisPlan(spec);
  const svg = renderPrevisSvg(plan, { animated: !opts.static });
  const dataUri = previsSvgToDataUri(svg);

  const previs: Previs = {
    status: "sketch",
    uri: dataUri,
    notes: `Auto previs · ${plan.captions.framing} · ${plan.captions.motion} · ${plan.captions.duration}`,
  };

  return { plan, svg, dataUri, previs };
}

/**
 * A real previs asset is one authored outside this synthesizer: an approved or
 * rendered status backed by a non-`data:` URI (an actual clip/frame in storage).
 * We must never clobber it with the cheap sketch.
 */
export function hasRealPrevis(previs: Previs): boolean {
  const isReal = (previs.status === "rendered" || previs.status === "approved") && !!previs.uri;
  return isReal && !previs.uri!.startsWith("data:");
}

/**
 * Return a copy of the spec with a freshly generated previs sketch merged in.
 * If the spec already references a real (rendered/approved) previs asset, the
 * spec is returned unchanged so we don't overwrite production work.
 *
 * The result is re-parsed so the caller always gets a valid {@link ShotSpec}.
 */
export function applyPrevisToSpec(spec: ShotSpec, opts: GeneratePrevisOptions = {}): ShotSpec {
  if (hasRealPrevis(spec.previs)) return spec;
  const { previs } = generatePrevis(spec, opts);
  return parseShotSpec({ ...spec, previs });
}
