import type { AffineMatrix, AffineTransform, Point2, QuadNorm } from "./contract.ts";

export const IDENTITY_MATRIX: AffineMatrix = [1, 0, 0, 0, 1, 0];

export function identityTransform(): AffineTransform {
  return { kind: "affine", matrix: IDENTITY_MATRIX };
}

export function translationTransform(dx: number, dy: number): AffineTransform {
  return { kind: "affine", matrix: [1, 0, dx, 0, 1, dy] };
}

export function applyAffine(t: AffineTransform, p: Point2): Point2 {
  const [a, b, tx, c, d, ty] = t.matrix;
  return { x: a * p.x + b * p.y + tx, y: c * p.x + d * p.y + ty };
}

/** Compose `outer ∘ inner` — apply `inner` first. */
export function composeAffine(outer: AffineTransform, inner: AffineTransform): AffineTransform {
  const [a1, b1, tx1, c1, d1, ty1] = outer.matrix;
  const [a2, b2, tx2, c2, d2, ty2] = inner.matrix;
  return {
    kind: "affine",
    matrix: [
      a1 * a2 + b1 * c2,
      a1 * b2 + b1 * d2,
      a1 * tx2 + b1 * ty2 + tx1,
      c1 * a2 + d1 * c2,
      c1 * b2 + d1 * d2,
      c1 * tx2 + d1 * ty2 + ty1,
    ],
  };
}

export function invertAffine(t: AffineTransform): AffineTransform | null {
  const [a, b, tx, c, d, ty] = t.matrix;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  const ia = d * invDet;
  const ib = -b * invDet;
  const ic = -c * invDet;
  const id = a * invDet;
  return {
    kind: "affine",
    matrix: [ia, ib, -(ia * tx + ib * ty), ic, id, -(ic * tx + id * ty)],
  };
}

export function applyAffineToQuad(t: AffineTransform, quad: QuadNorm): QuadNorm {
  return [
    applyAffine(t, quad[0]),
    applyAffine(t, quad[1]),
    applyAffine(t, quad[2]),
    applyAffine(t, quad[3]),
  ];
}

/** Pixel-space transform applied to a normalized quad (needs frame size). */
export function warpQuadNorm(
  t: AffineTransform,
  quad: QuadNorm,
  width: number,
  height: number,
): QuadNorm {
  const toPx = (p: Point2): Point2 => ({ x: p.x * width, y: p.y * height });
  const toNorm = (p: Point2): Point2 => ({
    x: clamp01(p.x / width),
    y: clamp01(p.y / height),
  });
  const pixelQuad: QuadNorm = [toPx(quad[0]), toPx(quad[1]), toPx(quad[2]), toPx(quad[3])];
  const warped = applyAffineToQuad(t, pixelQuad);
  return [toNorm(warped[0]), toNorm(warped[1]), toNorm(warped[2]), toNorm(warped[3])];
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function almostEqualMatrix(a: AffineMatrix, b: AffineMatrix, eps = 1e-6): boolean {
  for (let i = 0; i < 6; i++) {
    if (Math.abs(a[i]! - b[i]!) > eps) return false;
  }
  return true;
}

export function translationOf(t: AffineTransform): { dx: number; dy: number } {
  return { dx: t.matrix[2], dy: t.matrix[5] };
}
