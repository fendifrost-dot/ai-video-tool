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

  // Tattoos: scope explicitly to skin to prevent the model from leaking
  // tattoo text/imagery onto clothing graphics, jacket wordmarks, etc.
  // (e.g. a "FENDI" forearm tattoo bleeding onto a YSL jacket chest stripe).
  if (typeof id.tattoos === "string") {
    const tattoosRaw = id.tattoos.trim().replace(/\.+$/, "");
    if (tattoosRaw) {
      parts.push(
        `Tattoos located on skin only (forearm and body, never clothing): ${tattoosRaw}.`,
      );
      parts.push(
        `Tattoo text appears only on skin, never as clothing graphics, jacket text, or wardrobe wordmarks.`,
      );
    }
  }

  // Eyewear: per-artist frame description (e.g. "Cazal MOD octagonal aviator
  // frames..."). Reference images alone shifted shape ~70% of the way from
  // round wireframes toward squared/gold; adding a prompt cue closes the gap.
  pushField("Eyewear", id.eyewear);
  if (typeof id.eyewear === "string" && id.eyewear.trim()) {
    parts.push("Glasses always-on per continuity rules.");
  }

  // Body measurements: structured measurements compiled into a natural-
  // language line. Image models respond to phrases like "torso 20.5in,
  // arms 27.25in" better than to raw JSON. Skip a declared height — the
  // proportions carry the build read on their own.
  if (id.body_measurements && typeof id.body_measurements === "object") {
    const bm = id.body_measurements as Record<string, unknown>;
    const bits: string[] = [];
    const torso = bm.torso_length_in;
    const arms = bm.arm_length_in;
    const legs = bm.leg_length_in;
    const waist = bm.waist_in;
    const waistPant = bm.waist_pant_size_in;
    const neck = bm.neck_circumference_in;
    const shoe = bm.shoe_size_us;
    if (typeof torso === "number") bits.push(`torso ${torso}in`);
    if (typeof arms === "number") bits.push(`arms ${arms}in`);
    if (typeof legs === "number") bits.push(`legs ${legs}in`);
    if (typeof waist === "number") {
      const pantNote = typeof waistPant === "string" && waistPant.trim()
        ? ` (wears ${waistPant.trim()})`
        : "";
      bits.push(`waist ${waist}in${pantNote}`);
    }
    if (typeof neck === "number") bits.push(`neck ${neck}in`);
    if (typeof shoe === "number") bits.push(`US shoe ${shoe}`);
    if (bits.length > 0) {
      parts.push(`Build measurements: lean frame, ${bits.join(", ")}.`);
    }
  }

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
