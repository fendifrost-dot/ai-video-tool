/**
 * Deterministic animated previs (Lane E).
 *
 * Spec → animated preview asset, with no paid model calls. Public surface:
 *   • {@link generatePrevis} — the one-call entry point (svg + data URI + plan).
 *   • {@link applyPrevisToSpec} — merge a sketch into a Shot Spec (never clobbers
 *     a real rendered/approved asset).
 *   • {@link buildPrevisPlan} / {@link renderPrevisSvg} — the pure derivation and
 *     render stages, exposed for custom surfaces and tests.
 */
export {
  generatePrevis,
  applyPrevisToSpec,
  hasRealPrevis,
  type GeneratedPrevis,
  type GeneratePrevisOptions,
} from "./generatePrevis";
export {
  buildPrevisPlan,
  PREVIS_PLAN_VERSION,
  PREVIS_WIDTH,
  PREVIS_HEIGHT,
  type PrevisPlan,
  type PrevisMotion,
  type Rect,
} from "./previsPlan";
export { renderPrevisSvg, previsSvgToDataUri } from "./renderSvg";
export { buildPalette, hashString, hueFrom, type PrevisPalette } from "./palette";
