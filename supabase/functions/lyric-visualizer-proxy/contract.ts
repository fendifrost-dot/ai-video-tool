// lyric-visualizer-proxy — the decidable half: modes, template rendering, prompt assembly.
//
// Split out from index.ts so the prompt can be tested without an edge runtime or an xAI
// key. The one property worth a test here is that `mode: "all"` (the default, and what
// every existing caller sends) produces EXACTLY the prompt it produced before these
// fields existed — the additions are additive or they are a regression.

/**
 * Which scenes the call should come back with.
 *   all          today's three (world + performance_plate + garment_character) — the default
 *   literal      one scene, every noun in the line made physically real in frame
 *   surreal      one scene, the line's metaphor pushed past reality but shot as a real event
 *   performance  one scene, the artist delivering the line with the world behind him
 */
export const LYRIC_MODES = ["all", "literal", "surreal", "performance"] as const;
export type LyricMode = (typeof LYRIC_MODES)[number];

export function isLyricMode(v: unknown): v is LyricMode {
  return typeof v === "string" && (LYRIC_MODES as readonly string[]).includes(v);
}

/** The shot window a regenerated scene is written for. */
export type ShotWindow = {
  start?: number | null;
  end?: number | null;
  section?: string | null;
  framing?: string | null;
  cameraMotion?: string | null;
};

// ---------------------------------------------------------------------------
// Template slots
// ---------------------------------------------------------------------------

/**
 * A private-use character stands in for a slot the context could not fill, so the tidy-up
 * below can see where one WAS before deleting it (a parenthetical that held only slots has
 * to go with them). U+E000 is unassigned and cannot occur in a template body.
 */
const HOLE = "\uE000";
const HOLE_GROUP_RE = /\(\s*(?:\uE000[\s:,;·—-]*)+\)/g;
/**
 * A slot governed by a preposition takes the preposition with it. Without this,
 * "a piece for {{project.audience}}: every scene…" strips to "a piece for: every scene…",
 * which is not a placeholder but is just as bad — the model reads broken prose and
 * compensates by inventing what the sentence seems to be missing.
 */
const HOLE_CONNECTOR_RE =
  /[ \t]+(?:for|to|in|of|with|as|on|at|from|by|about|into|like)[ \t]+\uE000(?=[\s,.;:!?)]|$)/gi;
const HOLE_RE = /\uE000/g;

/**
 * Render a `prompt_templates.template_body` against the request's context.
 *
 * Two rules, and the second is the one that matters: every `{{slot}}` the context
 * can fill is filled, and every slot it CANNOT fill is STRIPPED. A brace that
 * survives into a system prompt is a bracket placeholder shipped to a model — it
 * reads as an instruction to invent, and the output quietly drifts.
 */
export function renderTemplate(
  body: string,
  context: Record<string, string | null | undefined>,
): string {
  const filled = body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = context[key];
    return v != null && String(v).trim() !== "" ? String(v).trim() : HOLE;
  });
  return (
    filled
      // Drop the unfillable slots, then tidy what their removal left behind: a dangling
      // "(…)" that held only slots, doubled spaces, and a space before punctuation.
      .replace(HOLE_GROUP_RE, "")
      .replace(HOLE_CONNECTOR_RE, "")
      .replace(HOLE_RE, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/[ \t]+$/gm, "")
      .trim()
  );
}

/** Flatten the request's template context into the dotted keys the seed templates use. */
export type TemplateContext = {
  project?: { title?: string | null; audience?: string | null } | null;
  look?: { name?: string | null; preamble?: string | null } | null;
  artist?: { name?: string | null; description?: string | null } | null;
};

export function templateSlots(ctx: TemplateContext | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  };
  put("project.title", ctx?.project?.title);
  put("project.audience", ctx?.project?.audience);
  put("look.name", ctx?.look?.name);
  put("look.preamble", ctx?.look?.preamble);
  put("artist.name", ctx?.artist?.name);
  put("artist.description", ctx?.artist?.description);
  return out;
}

/**
 * `template` on the request may name a seed row either by its `name`
 * ("Story-led motion piece") or by the basename of the structured file it points at
 * ("motion_story_v1"), because that is the id the plan and the handoffs use.
 */
export function templateMatches(
  row: { name: string; default_settings_json: unknown },
  requested: string,
): boolean {
  const want = requested.trim().toLowerCase();
  if (row.name.trim().toLowerCase() === want) return true;
  const settings = row.default_settings_json as { template_json?: string } | null;
  const path = settings?.template_json;
  if (typeof path !== "string") return false;
  const base = path
    .split("/")
    .pop()
    ?.replace(/\.json$/i, "")
    .toLowerCase();
  return base === want;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

/**
 * The three-scene instruction. This exact string is what shipped before `mode`
 * existed; `mode: "all"` must keep producing it verbatim.
 */
export const SCENES_ALL =
  "For every line produce three scenes, one of each kind: (1) world — a place and its inhabitants built around the line, the artist absent or present as a character (a model opens a door, flicks a switch, the room is the arctic: penguins and polar bears in diamond tennis chains and Cuban links, a half-snowman half-human in urban winter gear with diamond gold teeth walking around as if everything is normal); (2) performance_plate — the artist raps in the foreground while the line plays out BEHIND him with real depth (a fashion show running behind him; a Bentley truck passing followed by four kids carrying a wheel-less car on their shoulders, one at each wheel; a luxury car pulling up and reporters hopping out to film him); (3) garment_character — the artist in the locked garment, animated from his still, doing one thing the line implies.";

const SCENES_BY_MODE: Record<Exclude<LyricMode, "all">, string> = {
  literal:
    "For every line produce EXACTLY ONE scene, and make the line literally true in frame: every noun the line says is a physical thing the camera sees, at its real scale, behaving as if this were ordinary. If he says gator boots, the boots are alligator and they snap; if he says the kids carried the car, four kids carry a wheel-less car on their shoulders, one at each wheel. No symbol stands in for an object the line already names. Pick the scene kind that lets the camera see those nouns best — world when the line is about a place or its inhabitants, performance_plate when the line is about him and what is around him, garment_character when the line is about what he is wearing or doing with his body.",
  surreal:
    "For every line produce EXACTLY ONE scene that takes the line's METAPHOR past what is possible and then shoots it as a real event: practical light, real weather, real weight, a camera that could have been there. The impossibility is in what happens, never in the rendering — no animation look, no dream blur, no particles. Pick the scene kind that serves the metaphor.",
  performance:
    "For every line produce EXACTLY ONE performance_plate scene: the artist delivers this line in the foreground while the line plays out BEHIND him with real depth. Stage the action in the mid-ground and background and leave the centre foreground clear for him. The plate must read as a place he is standing in, not a backdrop behind him.",
};

export function scenesInstruction(mode: LyricMode): string {
  return mode === "all" ? SCENES_ALL : SCENES_BY_MODE[mode];
}

/** How many scenes a mode asks for — drives the output-token estimate, so the cost gate stays honest. */
export function scenesPerLine(mode: LyricMode): number {
  return mode === "all" ? 3 : 1;
}

export function shotInstruction(shot: ShotWindow | null | undefined): string | null {
  if (!shot) return null;
  const parts: string[] = [];
  if (typeof shot.start === "number" && typeof shot.end === "number" && shot.end > shot.start) {
    parts.push(
      `the window ${shot.start.toFixed(2)}s–${shot.end.toFixed(2)}s (${(shot.end - shot.start).toFixed(2)}s long)`,
    );
  }
  if (shot.section?.trim()) parts.push(`the ${shot.section.trim()} section`);
  if (shot.framing?.trim()) parts.push(`framing already chosen: ${shot.framing.trim()}`);
  if (shot.cameraMotion?.trim())
    parts.push(`camera move already chosen: ${shot.cameraMotion.trim()}`);
  if (parts.length === 0) return null;
  return (
    "This scene is for one storyboard box that already exists on the song clock: " +
    parts.join("; ") +
    ". Write the beats to fit that window exactly, and honour the framing and camera move if they are given rather than proposing your own."
  );
}

export type SystemPromptInput = {
  mode: LyricMode;
  clipSeconds: number;
  exemplars: string;
  rules: string;
  limits: string;
  /** The rendered prompt-template body, placed AHEAD of the standing instructions. */
  templateBody?: string | null;
  shot?: ShotWindow | null;
  /**
   * The project's ONE treatment (2026-10-03). When present it is the creative brief every scene serves, and the
   * exemplars block is left out unless exemplars were actually supplied — two briefs in one prompt pull apart.
   */
  treatment?: string | null;
  /** One line each about the boxes before and after this one, so two boxes in a row do not stage the same picture. */
  neighbours?: { before?: string | null; after?: string | null } | null;
  /**
   * Structured, locked facts about the box (its window, the take that plays in it, footage already on it, the look,
   * what the director fixed). DATA, not direction: it stops a rewrite drifting off what is already decided.
   */
  projectState?: unknown;
  /** Whether exemplars were supplied at all (the caller passes the formatted list in `exemplars` either way). */
  hasExemplars?: boolean;
};

/** The neighbours as two lines, or null when there are none. */
export function neighboursInstruction(n: SystemPromptInput["neighbours"]): string | null {
  const before = n?.before?.trim();
  const after = n?.after?.trim();
  if (!before && !after) return null;
  return (
    "The boxes on either side of this one. Let this scene follow from the one before and hand on to the one after; do not stage the same picture twice in a row. They are context only: write what is seen inside this box, and never mention the other boxes, \"the next scene\" or \"the previous shot\" in anything you write:\n" +
    [before ? `Before: ${before}` : null, after ? `After: ${after}` : null].filter(Boolean).join("\n")
  );
}

/** The locked project state as a JSON block, or null when there is nothing to state. */
export function projectStateInstruction(state: unknown): string | null {
  if (!state || typeof state !== "object" || Object.keys(state as object).length === 0) return null;
  return (
    "Project state — locked facts, given as data. This is not creative direction and nothing in it may be contradicted: the window is fixed, real footage plays as filmed, and anything listed under locked_by_director stays exactly as stated.\n" +
    JSON.stringify(state)
  );
}

/**
 * Assemble the system prompt. With `mode: "all"`, no template and no shot, the result
 * is byte-identical to what this function shipped before those fields existed — the
 * snapshot test in contract.test.ts holds that.
 */
export function buildSystemPrompt(input: SystemPromptInput): string {
  const head: string[] = [];
  if (input.templateBody?.trim()) {
    head.push(
      "Work to the following production template. It governs structure, motion and transitions; the instructions after it govern the scenes themselves.\n\n" +
        input.templateBody.trim(),
    );
  }
  const treatment = input.treatment?.trim() ?? "";
  const body = [
    "You are the creative director of a photoreal, big-budget-looking music video. The job is to BRING EVERY LYRIC TO LIFE " +
      (treatment ? "inside the treatment below, which is the one creative brief for this video" : "at the level of the artist's own exemplars below") +
      " — worlds and characters a viewer remembers, staged so a camera could have witnessed them. Dull is a failure: a man walking down a corridor is not a scene.",
    scenesInstruction(input.mode),
    "Specify everything: the world's architecture, weather, light and surfaces; every character's wardrobe and jewelry by name (diamond tennis chains, Cuban links, grills, gold teeth), and the behaviour that makes the impossible read as normal; the beats in order with seconds; the camera; the FX. Characters other than the artist are invented people or creatures — never a real public figure. No readable text or logos. No crowds beyond what the beat needs.",
    "render_prompt must be self-contained and photographic: lenses, light, textures, motion; end with 'photographed on a cinema camera, photoreal, no animation look'. For garment_character scenes the render_prompt starts with the hero description VERBATIM and ends with: keep his face, body and clothing exactly as in the image, keep the environment the same, only add motion and atmosphere. For performance_plate scenes also write performance_plate_prompt: the plate alone, the centre-foreground left clear for the artist, the action staged in the mid-ground and background so the space reads deep.",
    "Each scene is for one clip of about " +
      input.clipSeconds +
      " seconds. Rate realism_risk honestly against the renderer limits; a high-risk idea is welcome when it is strong — the gate downstream decides.",
  ];
  const shotLine = shotInstruction(input.shot);
  if (shotLine) body.push(shotLine);
  if (treatment) {
    body.push("The treatment (every scene serves it; none contradicts it):\n" + treatment);
    const neighbours = neighboursInstruction(input.neighbours);
    if (neighbours) body.push(neighbours);
  }
  // With a treatment, exemplars are a second brief: they go in only when the caller really supplied some.
  if (!treatment || input.hasExemplars) body.push("The artist's exemplars (this is the bar):\n" + input.exemplars);
  body.push("Locked rules (must hold in every prompt):\n" + input.rules, "Renderer limits:\n" + input.limits);
  const state = projectStateInstruction(input.projectState);
  if (state) body.push(state);
  return [...head, ...body].join("\n\n");
}
