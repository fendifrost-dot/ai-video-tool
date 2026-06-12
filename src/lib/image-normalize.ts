// =============================================================================
// Image normalisation for uploads
// =============================================================================
// iPhones (and modern Android cameras) save photos as HEIC/HEIF by default.
// Most downstream consumers — Fal's image decoder, our preview <img>, browser
// canvas, web-side image models — don't understand HEIC. Fal returns a hard
// 422 image_load_error if you hand it HEIC bytes, which breaks any pipeline
// that ingests user-uploaded references (face refs, wardrobe, jewelry,
// locations, props).
//
// The fix is to transcode HEIC → JPEG at upload time, so Storage only ever
// holds web-safe bytes. Doing this client-side means:
//   - No additional round-trip latency on every generation
//   - Storage URLs end in `.jpg` and the MIME is `image/jpeg`, so signed URLs
//     are correctly typed for downstream consumers
//   - The transcoded File flows through the same `uploadToBucket` path as a
//     native JPG, so the metadata captured in our DB (size, mime_type) matches
//     what's actually in Storage.
//
// We use `heic2any` (browser-side WASM-backed HEIC decoder, ~200KB). It
// handles Safari-shot iPhone HEICs which is the common case here.
//
// The heic2any import is dynamic — the module touches `Worker` at top-level,
// which is fine in the browser but blows up in jsdom (and would blow up in
// any SSR pass too). Loading it on demand keeps non-HEIC code paths zero-cost
// and gives Vite a natural chunk-split for the ~200KB decoder bundle.
//
// This helper is a no-op for non-HEIC inputs — JPG/PNG/WEBP/GIF flow through
// untouched. Safe to call unconditionally on every image upload path.

/** Shared `accept` value for image file pickers. Extension hints matter because
 *  Safari (pre-17) reports empty `type` for HEIC — only the extension survives. */
export const IMAGE_UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

function looksLikeHeic(file: File): boolean {
  if (HEIC_MIME_TYPES.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
}

/**
 * Transcode HEIC/HEIF files to JPEG. Non-HEIC files are returned unchanged.
 *
 * The returned File has:
 *   - `name` rewritten from `.heic`/`.heif` to `.jpg`
 *   - `type` set to `image/jpeg`
 *   - JPEG-encoded bytes at the requested quality
 *
 * Throws if the decoder fails (corrupt HEIC, unsupported variant). Callers
 * should surface the error to the user with a "please re-export as JPG" hint.
 */
export async function normalizeImageForUpload(
  file: File,
  options?: { quality?: number },
): Promise<File> {
  if (!looksLikeHeic(file)) return file;

  // Lazy-load the decoder. See header comment for why.
  const { default: heic2any } = await import("heic2any");

  const quality = options?.quality ?? 0.92;

  // heic2any can return Blob | Blob[] depending on whether the source is a
  // single image or a sequence. We always pass single images so the cast is
  // safe in practice, but guard with Array.isArray to be defensive.
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality,
  });
  const blob = Array.isArray(result) ? result[0] : result;

  const baseName = file.name.replace(/\.(heic|heif)$/i, "");
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

// Exposed for tests; do not import elsewhere.
export const _internal = { looksLikeHeic };
