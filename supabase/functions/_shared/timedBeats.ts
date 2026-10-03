// Timed beats — how a WRITER (the treatment writer, the one-shot scene writer) says that something changes at a
// moment inside a shot. One definition, used by both writers and read by the app (src/lib/storyboard/writtenBeats.ts),
// so there is one form for "change inside a shot" from the model to the shot record.
//
// Pure: no Deno, no network, no project knowledge. Importable from the browser build and from an edge function.

export const WRITTEN_EFFECTS = ["none", "dim", "blackout", "lights_up", "flash", "fade_out"] as const;
export type WrittenEffect = (typeof WRITTEN_EFFECTS)[number];

/** The most beats a writer may give one shot. (The shot record itself holds more — a director can add his own.) */
export const WRITTEN_BEATS_MAX = 4;

/** One beat as a writer returns it. */
export type WrittenBeat = {
  at_seconds: number;
  on_words: string;
  lighting: string;
  camera: string;
  action: string;
  picture: string;
  effect: WrittenEffect;
  /** The key of one of the project's lighting states the light switches to at this moment; "" when none. */
  lighting_state: string;
};

/** The JSON-schema property a writer's shot object carries (strict mode: every key required, empty when unused). */
export const TIMED_BEATS_PROPERTY = {
  type: "array",
  description:
    "moments INSIDE this shot at which something changes. Empty for a shot that is one state from first frame to last — which is most shots",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["at_seconds", "on_words", "lighting", "camera", "action", "picture", "effect", "lighting_state"],
    properties: {
      at_seconds: { type: "number", description: "seconds from the shot's first frame, inside the shot's own length" },
      on_words: { type: "string", description: "the words of this shot's lyrics the change lands on, verbatim — an empty string when it lands on none" },
      lighting: { type: "string", description: "what the light does from this moment, in a few words — empty when the light does not change" },
      camera: { type: "string", description: "what the camera starts doing at this moment, in a few words — empty when it does not change" },
      action: { type: "string", description: "what the subject does at this moment, in a few words — empty when nothing new" },
      picture: { type: "string", description: "anything else that changes in the picture, in a few words — empty when nothing" },
      effect: { type: "string", enum: [...WRITTEN_EFFECTS], description: "a change of the whole picture's exposure that the edit makes exactly on time; `none` when the change has to be in the footage" },
      lighting_state: { type: "string", description: "the KEY of one of the project's lighting states on file that the light switches to at this moment, exactly as given — an empty string when none is on file or none fits" },
    },
  },
} as const;

/** What a writer is told about timed beats. `sceneField` is the name of the field that holds the shot's scene. */
export function timedBeatsRules(sceneField: string): string {
  return [
    "Change inside a shot (`timed_beats`):",
    "- Most shots are ONE state from the first frame to the last: return an empty list for those.",
    "- Give a shot timed beats only when the idea needs something to CHANGE at a moment inside it — the light dying on a word, a camera move that starts on a hit, something entering the frame. Do not use them for motion that simply runs through the whole shot: that is the camera direction.",
    `- \`${sceneField}\` is then how the shot OPENS. Each beat is one moment after that, and what it changes holds until a later beat changes it again.`,
    "- `at_seconds` is counted from the shot's first frame and lies inside the shot's own length. When the change lands on words sung in this shot, quote them in `on_words` exactly as given; the beat is then placed where they are sung.",
    "- Say each change in a few plain words (twelve at most) under the kind it is — `lighting`, `camera`, `action`, `picture` — and leave the others empty.",
    "- `effect` is for a change to the exposure of the SAME picture, which the edit makes exactly on time: `blackout` (the light goes and only the brightest things still read), `dim`, `lights_up`, `flash`, `fade_out`. Use it together with the `lighting` words that say what the change is. Everything else is `none`.",
    "- When the light becomes a DIFFERENT light — a beam, points of light, a colour, one of the project's lighting states — the footage has to show it: `effect` is `none`. When the project has lighting states on file and the light switches to one of them, give its key in `lighting_state` instead of describing that light again. Never give a `lighting_state` and an exposure effect on the same beat.",
    "- A beat is a CHANGE: something that is already so when the shot opens is the shot's scene, not a beat at 0 seconds.",
    `- At most ${WRITTEN_BEATS_MAX} beats in a shot, never two at the same second.`,
  ].join("\n");
}

const words = (v: unknown, max = 140): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * The beats a writer returned for one shot, kept only when they are beats: a number inside the shot, and something
 * said. Anything else is dropped rather than repaired — a beat the writer did not really write is not a beat.
 */
export function acceptTimedBeats(returned: unknown, shotSeconds: number, lightingKeys?: ReadonlySet<string> | null): WrittenBeat[] {
  if (!Array.isArray(returned)) return [];
  const out: WrittenBeat[] = [];
  const taken = new Set<number>();
  for (const raw of returned) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const at = typeof r.at_seconds === "number" && Number.isFinite(r.at_seconds) ? Math.round(r.at_seconds * 100) / 100 : NaN;
    if (!(at >= 0) || !(at < shotSeconds)) continue;
    const effect = (WRITTEN_EFFECTS as readonly unknown[]).includes(r.effect) ? (r.effect as WrittenEffect) : "none";
    // a lighting state is kept only when it is one the project has (when the caller says which those are)
    const state = words(r.lighting_state, 60);
    const lighting_state = state && (!lightingKeys || lightingKeys.has(state)) ? state : "";
    // a switch to a lighting state is a light the footage shows: no exposure effect is kept on the same beat
    const kept: WrittenEffect = lighting_state && effect !== "flash" ? "none" : effect;
    const beat: WrittenBeat = { at_seconds: at, on_words: words(r.on_words), lighting: words(r.lighting), camera: words(r.camera), action: words(r.action), picture: words(r.picture), effect: kept, lighting_state };
    if (!beat.lighting && !beat.camera && !beat.action && !beat.picture && beat.effect === "none" && !beat.lighting_state) continue;
    if (taken.has(at)) continue;
    taken.add(at);
    out.push(beat);
  }
  return out.sort((a, b) => a.at_seconds - b.at_seconds).slice(0, WRITTEN_BEATS_MAX);
}
