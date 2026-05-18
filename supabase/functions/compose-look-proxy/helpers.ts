// Pure helpers for compose-look-proxy. Tiny set — the heavy prompt-building
// logic now lives in CC's compose-look, since CC owns the Fal pipeline.

export function sniffMime(
  buf: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

export function defaultLookName(wardrobeLabels: string[]): string {
  const labels = wardrobeLabels.filter(Boolean);
  if (labels.length === 0) return "Untitled look";
  return labels.slice(0, 2).join(" + ");
}

export type PipelineMode =
  | "auto"
  | "lora_seedream"
  | "seedream_only"
  | "kontext_multi";
