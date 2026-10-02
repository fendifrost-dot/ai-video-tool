/**
 * A still that is two pictures.
 *
 * An image model asked for a frame "with the stoop in the upper half and the car in the lower half" returns exactly
 * that: two photographs stacked, with a hard edge between them (2026-10-02, both candidates of a $0.14 still — and the
 * motion model then animated the diptych for another $0.35). Nothing downstream can use it, and nothing downstream
 * notices: it passes the look check, because each panel is a good photograph.
 *
 * Two measurements, because one is not enough:
 *   frac      at a small size, the share of one row (or column) across which the picture jumps. On the diptych the
 *             seam crossed 0.92 of the width — but a kerb photographed square-on crosses 0.70–0.90 too: a real edge
 *             can span the frame.
 *   straight  at the still's own resolution, the share of columns whose strongest jump falls on the SAME single row.
 *             A seam between two pictures is ruler-straight and one pixel thick (0.75); a kerb, a horizon or a table
 *             edge wanders by a few pixels and has thickness (0.15 for that kerb, ≤ 0.13 across 24 ordinary stills).
 * A still is stacked panels when a line both spans the frame and is that straight.
 *
 * Pure: takes luma samples at the still's own size, so the browser (canvas) and a test (an array) use the same code.
 * Mirrored in scripts/broll/run_world_batch.py `panel_seam`.
 */
export type PanelSeam = {
  /** share of the line (0–1) across which the picture jumps, at the small size */
  frac: number;
  /** share of the line (0–1) whose strongest jump is on one and the same row/column at full size */
  straight: number;
  /** where the line is, as a fraction of the frame (from the top for a row, from the left for a column) */
  at: number;
  axis: "row" | "column";
};

export const PANEL_SEAM_FRAC_MIN = 0.6;
export const PANEL_SEAM_STRAIGHT_MIN = 0.5;
/** The luma step that counts as "the picture changes here" (0–255 scale), at the small size. */
export const PANEL_SEAM_JUMP = 18;
const SMALL = 320;

/** Block-average the picture so its longer side is about SMALL (integer factor: the same sum in every implementation). */
function small(luma: ArrayLike<number>, w: number, h: number) {
  const k = Math.max(1, Math.ceil(Math.max(w, h) / SMALL));
  const sw = Math.floor(w / k);
  const sh = Math.floor(h / k);
  const out = new Float32Array(sw * sh);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      let s = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += luma[(y * k + j) * w + x * k + i];
      out[y * sw + x] = s / (k * k);
    }
  return { px: out, w: sw, h: sh, k };
}

/** `get(line, pos)` reads the picture with `line` along the seam's normal and `pos` along the seam. */
function straightness(get: (line: number, pos: number) => number, length: number, a: number, b: number): number {
  if (b - a < 2) return 0;
  const votes = new Map<number, number>();
  const where: number[] = [];
  for (let p = 0; p < length; p++) {
    let best = 0;
    let at = -1;
    for (let l = a; l < b; l++) {
      const d = Math.abs(get(l + 1, p) - get(l, p));
      if (d > best) { best = d; at = l; }
    }
    where.push(best > 12 ? at : -1);
    if (best > 12) votes.set(at, (votes.get(at) ?? 0) + 1);
  }
  let mode = -1;
  let n = 0;
  for (const [l, c] of votes) if (c > n) { n = c; mode = l; }
  return mode < 0 ? 0 : where.filter((l) => l === mode).length / length;
}

/** How many of the most complete lines per axis get the full-size look. */
const CANDIDATES = 6;

export function panelSeam(luma: ArrayLike<number>, w: number, h: number, jump = PANEL_SEAM_JUMP): PanelSeam {
  const s = small(luma, w, h);
  // First pass, small: lines the picture jumps across. The jump is taken over TWO small rows, because a seam rarely
  // falls on a block boundary and block-averaging spreads it over two. Skip the outer 8 % (letterbox, vignette).
  const lines: { frac: number; line: number; axis: "row" | "column" }[] = [];
  for (let y = Math.ceil(s.h * 0.08); y < Math.floor(s.h * 0.92) - 2; y++) {
    let n = 0;
    for (let x = 0; x < s.w; x++) if (Math.abs(s.px[y * s.w + x] - s.px[(y + 2) * s.w + x]) > jump) n++;
    lines.push({ frac: n / s.w, line: y, axis: "row" });
  }
  for (let x = Math.ceil(s.w * 0.08); x < Math.floor(s.w * 0.92) - 2; x++) {
    let n = 0;
    for (let y = 0; y < s.h; y++) if (Math.abs(s.px[y * s.w + x] - s.px[y * s.w + x + 2]) > jump) n++;
    lines.push({ frac: n / s.h, line: x, axis: "column" });
  }
  lines.sort((a, b) => b.frac - a.frac);
  // Second pass, full size, on the most complete lines of each axis: is it ruler-straight?
  let best: PanelSeam | null = null;
  for (const axis of ["row", "column"] as const) {
    for (const c of lines.filter((l) => l.axis === axis).slice(0, CANDIDATES)) {
      const a = c.line * s.k;
      const straight =
        axis === "row"
          ? straightness((l, p) => luma[l * w + p], w, a, Math.min(h - 1, a + 3 * s.k))
          : straightness((l, p) => luma[p * w + l], h, a, Math.min(w - 1, a + 3 * s.k));
      const seam: PanelSeam = {
        frac: Number(c.frac.toFixed(3)),
        straight: Number(straight.toFixed(3)),
        at: Number(((c.line + 1.5) / (axis === "row" ? s.h : s.w)).toFixed(3)),
        axis,
      };
      // the line that decides is the straightest of those that span the frame; failing that, the most complete one
      const rank = (x: PanelSeam) => (x.frac >= PANEL_SEAM_FRAC_MIN ? 1 + x.straight : x.frac);
      if (!best || rank(seam) > rank(best)) best = seam;
    }
  }
  return best ?? { frac: 0, straight: 0, at: 0, axis: "row" };
}

export function isStackedPanels(seam: PanelSeam | null | undefined): boolean {
  return !!seam && seam.frac >= PANEL_SEAM_FRAC_MIN && seam.straight >= PANEL_SEAM_STRAIGHT_MIN;
}

/** One line a person can act on. */
export function describeSeam(seam: PanelSeam): string {
  const where = `${Math.round(seam.at * 100)} % from the ${seam.axis === "row" ? "top" : "left"}`;
  return `a ruler-straight edge across ${Math.round(seam.frac * 100)} % of the frame, ${where}`;
}
