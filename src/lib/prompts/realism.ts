/**
 * Photographic realism — an OPTIONAL, composable modifier on a compiled prompt.
 *
 * ── WHAT THIS IS FOR ───────────────────────────────────────────────────────────
 * Every seed template's negative prompt guards anatomy and identity (`extra fingers`,
 * `missing tattoos`, `identity drift`). Audited 2026-10-04: NONE of the 15 guards against
 * plastic, airbrushed, waxy or CGI skin. This fills that hole and only that hole.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────────
 * It is NOT an identity authority. It never says who a person is, and it holds no record
 * of anyone. Identity is resolved by the caller, from what AVT already keeps:
 *
 *   the primary artist   `artists` (identity_profile_json, continuity_rules,
 *                        forbidden_inaccuracies) + `character_features` (Character DNA)
 *                        + `artist_looks`, reaching the compiler as reference image paths
 *   a recurring person   NOTHING YET — see IDENTITY MODES below. Named, not papered over.
 *   places / props       `continuity_entities`
 *
 * It is also NOT a style authority. The approved treatment outranks it everywhere they
 * disagree, and the disagreement is recorded rather than resolved in realism's favour —
 * see CONFLICT below. This is the same authority-vs-evidence split as
 * `src/lib/storyboard/compatibility.ts`: the treatment is approved, realism is advisory,
 * and advisory never silently overrides approved.
 *
 * ── IDENTITY MODES ─────────────────────────────────────────────────────────────
 * AVT makes complete music videos: the primary artist, recurring supporting characters,
 * and people invented for one shot. The three are NOT the same job, and the difference is
 * the single most load-bearing thing in this module:
 *
 *   "preserve"   A real photographed person. Realism says RETAIN WHAT THE REFERENCE HAS.
 *                It must never list a feature — no complexion, no eye colour, no freckles,
 *                no beauty mark, no asymmetry. Telling a model to "add visible pores and
 *                natural asymmetry" to a referenced face is an instruction to CHANGE that
 *                face. Invented imperfection is still invention.
 *   "recurring"  An approved supporting character. Identical wording to "preserve",
 *                because the job is identical: hold a person already decided on. It is a
 *                separate mode because AVT has no record for one yet (ENTITY_KINDS is
 *                location | prop | lighting), so this mode reports that gap in `requires`
 *                instead of pretending a reference resolved.
 *   "invent"     A new fictional person. Only here may realism describe a human at all,
 *                and even then only in subject-neutral terms. The supplied source package
 *                (docs/research/prompt-packages/) describes one specific woman and one
 *                specific man; reusing those features would stamp the same two faces on
 *                every extra in the video. Their COMPLEXION, EYE COLOUR, FACIAL
 *                PROPORTIONS, FRECKLES, BEAUTY MARKS, GENDER and CAMERA BODY are
 *                deliberately excluded from this module.
 *
 * ── NATURALISM vs LOOKS ────────────────────────────────────────────────────────
 * Two separate things, which the source package runs together:
 *   NATURALISM  how a real lens and real skin behave. Compatible with any treatment.
 *   LOOKS       Portra colour, macro framing, shallow depth of field, warm window light.
 *               Each is a creative choice that can contradict an approved treatment, so
 *               each is opt-in by name and none is implied by asking for naturalism.
 * A surreal environment under hard magenta light can be photographically naturalistic.
 * Conflating the two is what makes "realism" presets quietly flatten a music video.
 *
 * ── CONFLICT ───────────────────────────────────────────────────────────────────
 * Deliberate fashion styling, makeup, artificial light and surreal staging are CREATIVE
 * REQUIREMENTS, not realism failures. When a fragment would contradict what the treatment
 * already asked for, it is WITHHELD and reported in `withheld[]` with the phrase that
 * triggered it. The negatives are derived from the fragments that SURVIVED, so withholding
 * "bare skin, no makeup" also withholds `makeup, lipstick` from the negative block. A
 * modifier that bans makeup on a beauty-lit fashion shot is not a realism modifier, it is
 * a bug.
 *
 * ── STATUS: EXPERIMENTAL ───────────────────────────────────────────────────────
 * The template audit establishes MISSING VOCABULARY. It does not establish IMPROVED
 * OUTPUT. Nothing here has been run against a real AVT route, no paid generation was
 * authorised for it, and `status` says so on every result. Per the project's evidence
 * taxonomy this module is a HYPOTHESIS with a named test, not a VERIFIED improvement.
 *
 * Pure module: no react, no supabase, no provider knowledge, no I/O.
 */
import type { CompiledPrompt } from "./types";

/** Bumped when the emitted wording changes, so a stored prompt can be traced to its rules. */
export const REALISM_VERSION = 1;

/**
 * Who the person in the shot is. This decides whether realism may describe a face AT ALL,
 * so it is required — there is no default. A wrong guess here either flattens a real
 * person's likeness or leaves an invented extra with no description.
 */
export type IdentityMode = "preserve" | "recurring" | "invent";

/** Optional creative looks. None is implied by naturalism; each is asked for by name. */
export const REALISM_LOOKS = ["portra", "macro", "shallowDepth", "windowLight"] as const;
export type RealismLook = (typeof REALISM_LOOKS)[number];

/**
 * Whether a requirement is shown to hold. Mirrors `compatibility.ts` deliberately: a
 * requirement does not become optional because we cannot check it — it becomes unverified.
 */
export type RealismVerification = "unverified" | "caller" | "gap";

export type RealismRequirement = {
  verification: RealismVerification;
  text: string;
  /** The check that would settle it. Never empty — an unverifiable claim names its test. */
  settledBy: string;
};

export type WithheldFragment = {
  text: string;
  /** The treatment phrase that outranked it. Quoted so a human can audit the decision. */
  conflictsWith: string;
  reason: string;
};

export type RealismOptions = {
  identity: IdentityMode;
  /** Opt-in creative looks. Omitted or empty means naturalism only. */
  looks?: readonly RealismLook[];
  /**
   * Emit temporal-consistency wording. For video routes only; a still has no frames to
   * drift between. Asking for it does not make it hold — see `requires`.
   */
  temporal?: boolean;
  /**
   * Extra text the caller knows is part of the approved treatment but which is not in the
   * prompt body (shot notes, a look's description, a continuity entity's constraints).
   * Scanned for conflicts alongside the prompt itself.
   */
  treatmentText?: string;
};

export type RealismResult = {
  version: number;
  status: "experimental";
  identity: IdentityMode;
  /** Fragments appended to the prompt body, in order. */
  added: string[];
  /** Fragments NOT appended, and the approved wording that outranked each. */
  withheld: WithheldFragment[];
  /** Negative terms added. Derived from `added` — never a fixed global list. */
  negatives: string[];
  /** What must be true that this module cannot show is true. */
  requires: RealismRequirement[];
};

export type RealismApplication = {
  prompt: CompiledPrompt;
  realism: RealismResult;
};

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------
/**
 * A fragment of realism wording.
 *
 * `conflicts` lists the treatment signals that veto it. They are matched against the
 * prompt body and the caller's treatment text, so a deliberate choice already written into
 * the shot wins without anyone having to disable realism by hand.
 *
 * `negatives` ride WITH the fragment: when it is withheld, they are withheld too. This is
 * the coupling that stops a realism preset from banning the makeup a treatment asked for.
 */
type Fragment = {
  id: string;
  text: string;
  negatives: string[];
  conflicts: readonly string[];
};

/**
 * Light and lens behaviour. Subject-neutral: none of this describes a person, so all of it
 * is safe in every identity mode, including "preserve".
 *
 * Deliberately absent: a camera body, a focal length and an aperture. "Sony A7R V, 85mm
 * GM, f/1.8" is not physics to a generative model — there is no sensor and nothing is
 * exposed. It is a token that points at an aesthetic region of the training set, and the
 * source package contradicts itself about which one (a 90mm G Macro and an 85mm GM, two
 * sentences apart). Lens BEHAVIOUR is described instead, because that is the part a model
 * can actually render.
 */
const OPTICS: Fragment[] = [
  {
    id: "optics.falloff",
    text: "light falls off continuously across the subject, with shadow edges as soft or as hard as the source implies",
    negatives: ["flat even lighting", "uniform ambient fill"],
    // A treatment may deliberately ask for flat, shadowless or stylised light.
    conflicts: ["flat light", "shadowless", "ring light", "high key", "silhouette"],
  },
  {
    id: "optics.focus",
    text: "a single plane of focus with the rest falling off optically rather than by uniform blur",
    negatives: ["uniformly blurred background", "cut-out subject"],
    conflicts: ["deep focus", "everything in focus", "flat graphic", "2d"],
  },
  {
    id: "optics.grain",
    text: "fine sensor or film grain present throughout rather than a denoised plastic surface",
    negatives: ["denoised", "oversharpened", "waxy"],
    conflicts: ["clean digital", "grainless", "crisp vector"],
  },
];

/**
 * Surface and material behaviour. Also subject-neutral — it describes how any real
 * material photographs, not what a particular person looks like. "Skin" appears here only
 * as a material, never with a complexion.
 */
const SURFACE: Fragment[] = [
  {
    id: "surface.texture",
    text: "skin and fabric keep their real surface texture, with specular variation across the surface rather than one uniform sheen",
    negatives: [
      "plastic skin",
      "waxy skin",
      "airbrushed",
      "smooth skin",
      "beauty filter",
      "3d render",
      "cgi",
    ],
    // Nothing vetoes this one: a fashion shot with full makeup still has texture. The
    // makeup-specific wording lives in INVENT_ONLY, where it can be withheld on its own.
    conflicts: [],
  },
  {
    id: "surface.translucency",
    text: "light enters the surface slightly before it scatters, instead of stopping at a hard matte boundary",
    negatives: ["matte plastic surface", "mannequin"],
    conflicts: ["mannequin", "doll", "statue", "porcelain"],
  },
  {
    id: "surface.tonality",
    text: "highlights roll off without clipping and shadows retain separation",
    negatives: ["blown highlights", "crushed blacks", "hdr halo"],
    conflicts: ["blown out", "high contrast graphic", "silhouette", "hdr"],
  },
];

/**
 * Only emitted for `identity: "invent"`. Each of these describes a HUMAN, which is exactly
 * what must never be said about a referenced face.
 *
 * Subject-neutral by construction: no complexion, no eye colour, no gender, no freckles,
 * no beauty mark, no proportions. It asks for variation WITHOUT naming which variation, so
 * two invented extras do not come out as the same person.
 */
const INVENT_ONLY: Fragment[] = [
  {
    id: "invent.variation",
    text: "an ordinary human face with the small natural variation real faces have, not a symmetrical idealised one",
    negatives: ["perfect symmetry", "idealised face", "doll-like proportions", "uncanny valley"],
    conflicts: ["symmetrical", "idealised", "stylised character", "mask"],
  },
  {
    id: "invent.bare",
    text: "skin as it is, without cosmetic retouching",
    negatives: ["retouched", "magazine retouching", "glamour retouch"],
    // The one most likely to fight a music video, so it carries the widest veto list.
    conflicts: [
      "makeup",
      "make-up",
      "lipstick",
      "gloss",
      "glossy",
      "editorial",
      "beauty",
      "glam",
      "glitter",
      "highlighter",
      "contour",
      "eyeliner",
      "mascara",
      "painted",
      "bodypaint",
      "body paint",
      "prosthetic",
      "mask",
      "costume makeup",
    ],
  },
];

/** Opt-in creative looks, each contradicting a treatment that already decided otherwise. */
const LOOKS: Record<RealismLook, Fragment> = {
  portra: {
    id: "look.portra",
    text: "colour in the register of Kodak Portra 400 — warm, gentle contrast, restrained saturation",
    negatives: ["oversaturated", "neon colour cast"],
    conflicts: [
      "neon",
      "saturated",
      "monochrome",
      "black and white",
      "duotone",
      "infrared",
      "cyberpunk",
      "teal and orange",
    ],
  },
  macro: {
    id: "look.macro",
    text: "framed close enough that surface detail is the subject",
    negatives: ["wide establishing framing"],
    conflicts: ["wide shot", "establishing", "full body", "long shot", "crowd"],
  },
  shallowDepth: {
    id: "look.shallowDepth",
    text: "a shallow plane of focus that separates the subject from the background",
    negatives: ["deep focus"],
    conflicts: ["deep focus", "everything in focus", "landscape"],
  },
  windowLight: {
    id: "look.windowLight",
    text: "soft directional daylight from one side, as from a window",
    negatives: ["hard studio strobe"],
    conflicts: [
      "studio",
      "strobe",
      "neon",
      "stage lighting",
      "night",
      "club",
      "practical lights",
      "firelight",
    ],
  },
};

/**
 * Identity wording. Note the asymmetry, which is the whole point of the module:
 * "preserve" and "recurring" tell the model to CHANGE NOTHING, and name no feature.
 */
const IDENTITY_TEXT: Record<IdentityMode, string> = {
  preserve:
    "render the referenced person exactly as photographed — keep their own skin, features and proportions, and do not substitute, idealise or regularise any of them",
  recurring:
    "render the established character exactly as previously approved — keep their own skin, features and proportions consistent with the reference, and do not restyle them",
  invent: "this person is newly invented for this shot and matches no existing reference",
};

/** Negatives that belong to identity itself, not to any realism fragment. */
const IDENTITY_NEGATIVES: Record<IdentityMode, string[]> = {
  preserve: ["identity drift", "face replacement", "different person"],
  recurring: ["identity drift", "character drift", "different person"],
  invent: ["resembles a specific real person"],
};

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------
/**
 * Does `haystack` contain this treatment signal as a WORD?
 *
 * Substring matching would be wrong in a way that matters: "beauty" inside "beautiful"
 * would veto bare skin on a shot that never asked for a beauty look, and "night" inside
 * "nightclub" is a true hit while "night" inside "knight" is not. Signals containing a
 * space are matched as phrases, which have the same boundary requirement at each end.
 */
export function mentions(haystack: string, signal: string): boolean {
  const escaped = signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

/** The first treatment signal that vetoes this fragment, or null when none does. */
function vetoFor(fragment: Fragment, haystack: string): string | null {
  for (const signal of fragment.conflicts) {
    if (mentions(haystack, signal)) return signal;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
/**
 * Decide the realism wording for a prompt, WITHOUT modifying it.
 *
 * Exported separately from `applyRealism` so the UI can show what realism would add, and
 * what it withheld and why, before anyone commits to a generation.
 */
export function buildRealism(promptText: string, options: RealismOptions): RealismResult {
  // The treatment's own words are whatever is already in the prompt, plus what the caller
  // knows about but did not put there. Both outrank realism equally.
  const haystack = `${promptText}\n${options.treatmentText ?? ""}`;

  const added: string[] = [];
  const withheld: WithheldFragment[] = [];
  const negatives: string[] = [];

  const consider = (fragment: Fragment, reason: string) => {
    const veto = vetoFor(fragment, haystack);
    if (veto) {
      withheld.push({ text: fragment.text, conflictsWith: veto, reason });
      return;
    }
    added.push(fragment.text);
    negatives.push(...fragment.negatives);
  };

  // Identity goes first and is never withheld: it is the caller's decision, not realism's
  // suggestion. A treatment phrase cannot veto who the person is.
  added.push(IDENTITY_TEXT[options.identity]);
  negatives.push(...IDENTITY_NEGATIVES[options.identity]);

  for (const fragment of [...OPTICS, ...SURFACE]) {
    consider(
      fragment,
      "the approved treatment already specifies this, and realism does not overrule it",
    );
  }

  if (options.identity === "invent") {
    for (const fragment of INVENT_ONLY) {
      consider(fragment, "deliberate styling is a creative requirement, not a realism failure");
    }
  }

  for (const look of options.looks ?? []) {
    consider(
      LOOKS[look],
      "the look was asked for but the treatment specifies otherwise; the treatment wins",
    );
  }

  if (options.temporal) {
    added.push(
      "hold the same face, wardrobe and lighting across every frame, with no feature drift, no boiling skin texture and no flicker between frames",
    );
    negatives.push(
      "temporal flicker",
      "identity drift between frames",
      "boiling texture",
      "morphing",
    );
  }

  return {
    version: REALISM_VERSION,
    status: "experimental",
    identity: options.identity,
    added,
    withheld,
    negatives: dedupe(negatives),
    requires: requirementsFor(options),
  };
}

/**
 * What must hold that this module cannot show holds.
 *
 * Every entry is something a reader might otherwise assume the wording guarantees. Asking
 * a model for temporal stability is not temporal stability; the clip has to be measured
 * (`scripts/qa/composite_verify.py` does that for a composite). Keeping these in the
 * result means a stored prompt carries its own caveats.
 */
function requirementsFor(options: RealismOptions): RealismRequirement[] {
  const out: RealismRequirement[] = [];

  if (options.identity === "preserve") {
    out.push({
      verification: "caller",
      text: "a reference image of the person must reach the provider, or 'preserve' asks the model to match something it cannot see",
      settledBy:
        "CompiledPrompt.referenceImagePaths is non-empty AND the provider's supports_reference_image is true",
    });
  }

  if (options.identity === "recurring") {
    out.push({
      verification: "gap",
      text: "AVT has no record of an approved recurring character: continuity_entities covers location, prop and lighting only, and a 'character' row would be dropped by entityFromRow. This mode relies entirely on references the caller supplies by hand",
      settledBy:
        "a character entity kind, or an equivalent cast record, with an approved reference asset",
    });
  }

  if (options.temporal) {
    out.push({
      verification: "unverified",
      text: "the temporal clause is a REQUEST. No provider guarantees it, and prompt wording is not evidence that a delivered clip holds together",
      settledBy:
        "measuring the delivered clip frame to frame, as scripts/qa/composite_verify.py does for a composite",
    });
  }

  out.push({
    verification: "unverified",
    text: "that this wording improves output at all. The 2026-10-04 template audit found 0 of 15 templates guarded against plastic or airbrushed skin, which establishes MISSING VOCABULARY, not measured improvement",
    settledBy:
      "an A/B on one real AVT route, same seed and settings, with and without the modifier — needs a generation budget",
  });

  return out;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------
/**
 * Append the realism wording to a compiled prompt.
 *
 * The prompt body is EXTENDED, never rewritten: the treatment's own sentences survive
 * verbatim, and realism is a trailing clause. Negatives are appended with the compiler's
 * own merge semantics (comma-joined, deduped case-insensitively), so an existing term is
 * not repeated.
 *
 * Nothing here consults a provider. That is deliberate: `applyCapability` already drops
 * the whole negative block when `supports_negative_prompt` is false and warns about it, so
 * realism is gated per route by the machinery that already exists. Re-implementing that
 * check here would create a second, divergent answer to the same question.
 */
export function applyRealism(prompt: CompiledPrompt, options: RealismOptions): RealismApplication {
  const realism = buildRealism(prompt.promptText, options);

  const body = realism.added.join("; ");
  const promptText = prompt.promptText.trim()
    ? `${prompt.promptText.trim().replace(/[.,;]+$/, "")}. ${body}.`
    : `${body}.`;

  const existing = prompt.negativePrompt
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const negativePrompt = dedupe([...existing, ...realism.negatives]).join(", ");

  return { prompt: { ...prompt, promptText, negativePrompt }, realism };
}
