// Pure-Deno pixel-dimension reader for PNG / JPEG / WebP byte buffers.
//
// Reads only the header structures — no decoding, no image library, so it is
// safe to run inside an edge function on multi-megabyte 2K images.

export type ImageDimensions = {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
  byteLength: number;
};

function be16(b: Uint8Array, i: number): number {
  return (b[i]! << 8) | b[i + 1]!;
}
function be32(b: Uint8Array, i: number): number {
  return ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
}
function le16(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8);
}
function le24(b: Uint8Array, i: number): number {
  return b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
}

function pngDims(b: Uint8Array): ImageDimensions | null {
  // 8-byte signature, then IHDR chunk: length(4) "IHDR"(4) width(4) height(4).
  if (b.length < 24) return null;
  return { format: "png", width: be32(b, 16), height: be32(b, 20), byteLength: b.length };
}

function jpegDims(b: Uint8Array): ImageDimensions | null {
  // Walk the marker chain to the first Start-Of-Frame; SOFn payload is
  // length(2) precision(1) height(2) width(2).
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    // Standalone markers with no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const segLen = be16(b, i + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return {
        format: "jpeg",
        height: be16(b, i + 5),
        width: be16(b, i + 7),
        byteLength: b.length,
      };
    }
    if (segLen < 2) return null;
    i += 2 + segLen;
  }
  return null;
}

function webpDims(b: Uint8Array): ImageDimensions | null {
  // RIFF....WEBP then a VP8 / VP8L / VP8X chunk, each with its own layout.
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (chunk === "VP8X") {
    return {
      format: "webp",
      width: le24(b, 24) + 1,
      height: le24(b, 27) + 1,
      byteLength: b.length,
    };
  }
  if (chunk === "VP8L") {
    const bits = le32LE(b, 21);
    return {
      format: "webp",
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
      byteLength: b.length,
    };
  }
  if (chunk === "VP8 ") {
    return {
      format: "webp",
      width: le16(b, 26) & 0x3fff,
      height: le16(b, 28) & 0x3fff,
      byteLength: b.length,
    };
  }
  return null;
}

function le32LE(b: Uint8Array, i: number): number {
  return (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;
}

/** Read real pixel dimensions from image bytes. Returns null if unrecognised. */
export function readImageDimensions(b: Uint8Array): ImageDimensions | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return pngDims(b);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return jpegDims(b);
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return webpDims(b);
  return null;
}
