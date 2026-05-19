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

// ---------------------------------------------------------------------------
// buildIdentityPreamble
//
// Compiles the artist's identity_profile_json + continuity_rules into a
// natural-language preamble that prepends every prompt sent to CC's
// compose-look (which feeds both Stage 1 / FLUX_LoRA and Stage 2 / Seedream
// — CC's buildBasePhotoPrompt and buildComposePrompt both consume the same
// `base` param, so a single preamble lands in both stages).
//
// Diagnostic context: the UI promises "These fields are merged into every
// prompt by the compiler — keep them precise", but the compiler never ran.
// As a result, identity-critical traits (e.g. "shaved/bald appearance") were
// absent from the prompt and the model defaulted to FLUX's male-portrait
// hair prior. This helper closes that gap.
//
// Intentionally NOT injected:
//   - forbidden_inaccuracies — those are negatives, separate concern.
//   - identity.lora — handled via trigger word + lora_url out-of-band.
//   - identity.jewelry / wardrobe_defaults — per-look refs/labels carry that.
//   - any "no X" phrasing — never inject negatives that could contradict
//     positive identity (e.g. "no tattoos" while identity.tattoos lists them).
// ---------------------------------------------------------------------------
export function buildIdentityPreamble(
  name: string | null | undefined,
  identity: Record<string, unknown> | null | undefined,
  continuityRules: string | null | undefined,
): string {
  const id = (identity ?? {}) as Record<string, unknown>;
  const parts: string[] = [];

  const pushField = (label: string, value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    // Strip a trailing period so we control punctuation uniformly.
    const cleaned = trimmed.replace(/\.+$/, "");
    parts.push(`${label}: ${cleaned}.`);
  };

  if (typeof name === "string" && name.trim()) {
    parts.push(`Subject: ${name.trim()}.`);
  }
  pushField("Hair", id.hair);
  pushField("Beard", id.beard);
  pushField("Body", id.body);
  pushField("Face", id.face);
  pushField("Skin", id.skin);
  pushField("Tattoos", id.tattoos);

  if (typeof continuityRules === "string" && continuityRules.trim()) {
    const rules = continuityRules
      .split(/\r?\n/)
      .map((r) => r.trim().replace(/\.+$/, ""))
      .filter((r) => r.length > 0);
    if (rules.length > 0) {
      parts.push(`Always-on traits: ${rules.join(", ")}.`);
    }
  }

  return parts.join(" ");
}
