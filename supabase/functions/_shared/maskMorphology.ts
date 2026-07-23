// AVT edge — pure grayscale morphology on a normalized alpha channel.
//
// Deliberately DEPENDENCY-FREE (no imagescript, no deno.land imports) so the
// same functions run in the Deno edge pipeline AND are unit-tested in Vitest —
// the mask-hygiene guarantees below are the kind of thing that must be proven,
// not eyeballed on a live render.
//
// All operators are separable (a box structuring element == a 1-D pass on rows
// then columns), so cost is O(w·h·r) rather than O(w·h·r²). Alpha is row-major,
// one float per pixel, values in [0,1] (though the operators are value-agnostic).

/**
 * Grayscale-max dilation (box structuring element). GROWS bright regions by
 * `radiusPx`. Used to grow the face-guard before subtracting it from the
 * garment mask, and as the first half of {@link closeAlpha}.
 */
export function dilateAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
): Float32Array {
  if (radiusPx <= 0) return alpha;
  const r = Math.max(1, Math.round(radiusPx));
  const scratch = new Float32Array(alpha.length);
  const out = new Float32Array(alpha.length);
  // Separable: max over a box == max-over-row then max-over-column.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        const v = alpha[row + xx];
        if (v > m) m = v;
      }
      scratch[row + x] = m;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        const v = scratch[yy * width + x];
        if (v > m) m = v;
      }
      out[y * width + x] = m;
    }
  }
  return out;
}

/**
 * Grayscale-min erosion (box structuring element). SHRINKS bright regions by
 * `radiusPx`. The exact dual of {@link dilateAlpha} and the second half of
 * {@link closeAlpha}.
 *
 * At the image border a min-filter would otherwise read "off-canvas" as 0 and
 * eat the edge; we clamp the window to the valid range instead (same convention
 * dilateAlpha uses for its max), so a region touching the frame edge is not
 * spuriously eroded inward.
 */
export function erodeAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
): Float32Array {
  if (radiusPx <= 0) return alpha;
  const r = Math.max(1, Math.round(radiusPx));
  const scratch = new Float32Array(alpha.length);
  const out = new Float32Array(alpha.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let m = Infinity;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        const v = alpha[row + xx];
        if (v < m) m = v;
      }
      scratch[row + x] = m === Infinity ? 0 : m;
    }
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let m = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        const v = scratch[yy * width + x];
        if (v < m) m = v;
      }
      out[y * width + x] = m === Infinity ? 0 : m;
    }
  }
  return out;
}

/**
 * Morphological CLOSE = dilate(r) then erode(r).
 *
 * This is the fix for the "floating arm / doubled jacket" artefact. evf-sam
 * traces the outfit but routinely UNDER-segments the thin, low-contrast parts of
 * a limb — a forearm against a similar-toned background, a sleeve behind a hand.
 * The garment mask then covers the shoulder/torso but breaks at the forearm, so
 * the recomposite repaints only the connected part and leaves the original
 * forearm pixels standing: an arm that reads as detached, and the old garment
 * surviving next to the new one.
 *
 * A close BRIDGES gaps and fills holes up to ~2r wide WITHOUT net-growing the
 * outer silhouette (the erode gives back exactly what the dilate took on a
 * smooth boundary). So it reconnects the arm to the torso and seals pinholes in
 * the sleeve, but does NOT bleed the mask out into the face/hands/background —
 * which is why it is safe to run BEFORE the face-guard subtraction rather than
 * as a naked dilate.
 */
export function closeAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
): Float32Array {
  if (radiusPx <= 0) return alpha;
  return erodeAlpha(dilateAlpha(alpha, width, height, radiusPx), width, height, radiusPx);
}
