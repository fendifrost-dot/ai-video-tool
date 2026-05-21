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
  | "kontext_multi"
  | "lora_idm_vton";

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
export type BuildIdentityPreambleOptions = {
  // When false, omit the tattoos section AND filter any continuity-rules
  // entries that mention tattoos. Used by the compose_prompt (Stage 2 /
  // Seedream) builder because Seedream was reading tattoo descriptions —
  // "FENDI", "Modest Bear", "Chicago Blackhawks", "Warrior Blood" — as
  // graphic inspiration and painting those wordmarks onto jacket fabric.
  // Stage 1 (FLUX_LoRA / base_prompt) still needs tattoos to render them on
  // skin, so the default stays true.
  includeTattoos?: boolean;
};

export function buildIdentityPreamble(
  name: string | null | undefined,
  identity: Record<string, unknown> | null | undefined,
  continuityRules: string | null | undefined,
  options: BuildIdentityPreambleOptions = {},
): string {
  const { includeTattoos = true } = options;
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
  //
  // includeTattoos=false skips this block entirely. The skin-scoping copy
  // wasn't enough — Seedream was still ingesting the tattoo names as
  // graphic inspiration. The cleanest fix is to keep the tattoo description
  // out of compose_prompt and rely on Stage 1 (FLUX_LoRA) to paint the
  // tattoos on skin, then Stage 2 (Seedream) only sees the rendered pixels
  // and the wardrobe brief.
  if (includeTattoos && typeof id.tattoos === "string") {
    const tattoosRaw = id.tattoos.trim().replace(/\.+$/, "");
    if (tattoosRaw) {
      parts.push(
        `Tattoos located on skin only (forearm and body, never clothing): ${tattoosRaw}.`,
      );
      parts.push(
        `Tattoo text appears only on skin, never as clothing graphics, jacket text, or wardrobe wordmarks.`,
      );
      // Coverage rule: a tattoo on a body part isn't visible when a garment
      // covers that part. Without this, the model paints tattoos on top of
      // clothing or shows them "through" sleeves — both wrong.
      parts.push(
        `Tattoos are visible only on exposed skin. If a garment, jacket, or layer covers the body region (forearm under long sleeves, torso under a shirt, neck under a collar), no tattoo appears on that area. Never paint tattoos onto clothing fabric or through clothing.`,
      );
    }
  }

  // Eyewear: per-artist frame description (e.g. "Cazal MOD octagonal aviator
  // frames..."). Reference images alone shifted shape ~70% of the way from
  // round wireframes toward squared/gold; adding a prompt cue closes the gap.
  //
  // The actual eyewear emission has moved into the LOCKED ATTRIBUTES section
  // below so it sits near the LoRA trigger token at the end of the preamble
  // (image models weight prompt tail most heavily). This block is intentionally
  // empty here — see LOCKED ATTRIBUTES for the eyewear lines.

  // Body proportions + measurements:
  //
  // Diagnostic context: FLUX_LoRA Stage 1 was rendering the head clearly
  // oversized relative to the body ("alien" / bobblehead look). Root causes
  // we identified:
  //   1. The Body field copy emphasized "ectomorphic / narrow torso / narrow
  //      hips / fashion-model proportions" which nudged the model to shrink
  //      the body while keeping FLUX's default male-portrait head size.
  //   2. The raw-inch measurements line ("torso 20.5in, arms 27.25in, ...")
  //      gave the model dimensions but no head-to-body anchor, so it filled
  //      the gap with its own prior.
  //
  // Fix: prepend a proportion_summary line (when present in
  // body_measurements) BEFORE the raw inches, so the head-to-body ratio is
  // anchored explicitly. Keep the inches line too — Seedream + FLUX both
  // respond to the structured measurements.
  if (id.body_measurements && typeof id.body_measurements === "object") {
    const bm = id.body_measurements as Record<string, unknown>;
    // proportion_summary first — sets the head-to-body anchor before
    // any specific dimensions land.
    const propSummary = bm.proportion_summary;
    if (typeof propSummary === "string" && propSummary.trim()) {
      parts.push(propSummary.trim().replace(/\.+$/, "") + ".");
    }
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

  // Wardrobe rules: per-artist silhouette guardrails so we don't need an
  // on-body photo per wardrobe item. Each value in identity.wardrobe_rules
  // is already a full natural-language sentence (e.g. "Jackets and outerwear
  // extend at minimum to the natural waist and ideally to the hip"), so we
  // just concatenate them under a single "Wardrobe rules:" header rather
  // than emitting the raw JSON. Unknown keys are accepted as-is so artists
  // can extend the ruleset (e.g. fabric_default, footwear_default) without a
  // code change.
  if (id.wardrobe_rules && typeof id.wardrobe_rules === "object") {
    const wr = id.wardrobe_rules as Record<string, unknown>;
    const sentences: string[] = [];
    for (const value of Object.values(wr)) {
      if (typeof value !== "string") continue;
      const cleaned = value.trim().replace(/\.+$/, "");
      if (cleaned) sentences.push(cleaned);
    }
    if (sentences.length > 0) {
      parts.push(`Wardrobe rules for this subject: ${sentences.join(". ")}.`);
    }
  }

  if (typeof continuityRules === "string" && continuityRules.trim()) {
    const rules = continuityRules
      .split(/\r?\n/)
      .map((r) => r.trim().replace(/\.+$/, ""))
      .filter((r) => r.length > 0)
      // When tattoos are stripped, also drop any continuity entry that
      // mentions tattoos — otherwise a line like "tattoos must remain
      // asymmetrical" would still leak the word "tattoo" into compose_prompt
      // and Seedream would treat it as a presence mandate.
      .filter((r) => includeTattoos || !/tattoo/i.test(r));
    if (rules.length > 0) {
      parts.push(`Always-on traits: ${rules.join(", ")}.`);
    }
  }

  // Framing block: always emitted, regardless of identity content. This
  // counteracts FLUX_LoRA's tendency to render an enlarged "portrait" head
  // (the "alien" / bobblehead failure mode) by anchoring the framing and
  // the head-to-body ratio for both Stage 1 and Stage 2.
  //
  // Note: framing is intentionally NOT "three-quarter body" — that tight
  // crop was pulling the bottom edge up to the mid-ribs and giving the
  // model permission to shorten the jacket. Asking for full body framing
  // gives the model vertical room to render the jacket at its real length.
  parts.push(
    "Framing: full-body or upper-body photograph showing the subject from head to at least mid-thigh, with the entire jacket/top hem visible in frame. The head fits naturally on the body at realistic adult proportions — head approximately 1/7.5 of total height, do not enlarge the head. Editorial portrait or three-quarter crops are NOT acceptable when wardrobe is shown — wardrobe must be fully visible. Avoid sunglasses styling, fashion-editorial framing, or any composition that crops above the natural waist.",
  );

  // ----- LOCKED ATTRIBUTES (end-of-prompt) ---------------------------------
  //
  // Single unified tail block. Image models weight the tail of the prompt
  // most heavily, and the existing field-specific rules buried mid-prompt
  // were being overridden by visual priors and reference-photo bias. This
  // block consolidates the non-negotiable attribute locks into one place so
  // every generation sees the same identity-critical constraints last.
  //
  // Failure modes this block targets, observed across iterations:
  //   - Cazal aviator frames rendering as DARK sunglasses (model assumes
  //     gold-rim aviator → sunglasses). The eyewear field already says
  //     "clear prescription lenses (not tinted, never sunglasses)" — the
  //     mid-prompt copy is being ignored, so we restate it at the tail.
  //   - Asymmetric sleeves (one wrist-length, one bicep-length). Image
  //     models often "complete" a partially-visible arm independently per
  //     side. Restating sleeve symmetry at the tail forces the model to
  //     treat the two sleeves as a paired attribute.
  //   - Cropped jacket / exposed midriff. Already addressed in R2; kept
  //     verbatim in the unified block.
  //   - Enlarged head ("alien" look). Already addressed in R1; restated
  //     here for tail-weight reinforcement.
  //
  // Wordmark/brand spelling on fabric (e.g. "SAINT LAURENT") is a known
  // limitation of image models that text prompts cannot reliably fix; we
  // intentionally do NOT add a wordmark-accuracy lock here because
  // promising spelling we can't deliver wastes prompt tokens.
  parts.push(
    "LOCKED ATTRIBUTES (these constraints are non-negotiable and override any visual interpretation from reference images; they apply equally to Stage 1 and Stage 2):",
  );
  // Eyewear field push, hoisted to the TOP of LOCKED ATTRIBUTES so it sits
  // adjacent to the LoRA trigger token at the preamble tail. Putting the
  // Eyewear: ... description and the always-on cue here, immediately before
  // the glasses LOCK, lets the clear-lens identity bind tightly to the
  // trigger-token-anchored identity in Stage 1 and gets maximum tail-weight
  // in Stage 2.
  pushField("Eyewear", id.eyewear);
  if (typeof id.eyewear === "string" && id.eyewear.trim()) {
    parts.push("Glasses always-on per continuity rules.");
  }
  parts.push(
    "LOCK: glasses are CLEAR prescription eyeglasses. The lenses are TRANSPARENT — the eyes are fully visible through the lenses. NOT sunglasses. NOT tinted. NOT dark. NOT mirrored. NOT shaded. The frame may be gold or black, but the lenses themselves transmit light like normal eyeglasses.",
  );
  parts.push(
    "LOCK: sleeves are SYMMETRIC. Both the left sleeve and the right sleeve are the SAME length. If the garment is long-sleeved, BOTH sleeves extend all the way to the wrist crease and cover the entire forearm — neither sleeve is rolled, pushed up, shortened, missing, or rendered as a short sleeve. If the garment is short-sleeved, BOTH sleeves stop at the same point on the upper arm. NEVER render one long sleeve and one short sleeve on the same garment.",
  );
  parts.push(
    "LOCK: jacket hem fully overlaps the pants waistband — NO bare skin, NO exposed stomach, NO visible midriff, NO gap between hem and waistband. The jacket is a full-length men's jacket extending past the natural waist. Even if the reference photo shows the garment flat or styled short, render the worn hem at the natural waist or hip. NEVER a crop-top, crop-jacket, midriff-baring, or above-waist silhouette.",
  );
  parts.push(
    "LOCK: head and body proportions are realistic adult human — head approximately 1/7.5 of total height, head naturally sized on the shoulders. Do not enlarge the head. Do not bobblehead. Do not exaggerate the face.",
  );

  return parts.join(" ");
}
