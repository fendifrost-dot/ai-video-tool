/**
 * A shot that changes, and the generators that can and cannot draw a change (Fendi, 2026-10-03: "Generation
 * providers that support temporal/keyframe direction should receive these events in their appropriate form.
 * Providers that cannot support them must fail honestly or use an explicitly defined alternative mechanism. Never
 * silently flatten a temporal shot into one static prompt and claim compliance.")
 *
 * What each route can do with change inside a shot is DATA here, with what it rests on:
 *
 *   timed_script   the model takes a script with times and is given one, in its own form;
 *   none           the model draws one continuous move from one picture and one sentence. It is never handed a shot
 *                  with directed events as if the shot were one state.
 *
 * For a route that cannot, the storyboard does not generate; it says so and offers the mechanisms that are defined:
 *   • SPLIT AT THE BEATS — each state becomes its own shot (a cut on the beat), which every route can draw;
 *   • an EFFECT — a light change made by the edit, exactly on the clock, on whatever the shot shows (events.ts);
 *   • IN ORDER, NOT ON TIME — asked for by name: the model is told the beats in order, the job is recorded as
 *     "ordered", and nothing anywhere calls the result timed. The frames at each beat are there to be looked at.
 *
 * Pure module.
 */
import { EFFECT_LABEL, EVENT_FACETS, FACET_LABEL, drawnFacets, eventStates, isDirected, offsetLabel, type EventFacet, type ResolvedEvent, type ShotState } from "./events";

export type TemporalSupport = "timed_script" | "none";

/** The generation routes the storyboard uses, and the still. */
export type TemporalRoute = "image" | "still_kling" | "kling_t2v" | "still_dop" | "still_runway" | "still_runway45" | "runway_t2v" | "seedance_ref";

/**
 * What AVT has measured of a route keeping to the times it is given: for each returned clip read frame by frame
 * (storyboard/beatCheck.ts), where the asked change BEGAN relative to where it was asked — seconds, negative is
 * early. A fact about clips already made, not a promise about the next one.
 */
export type TimingEvidence = { on: string; errorsSeconds: readonly number[]; where: string };

export type RouteTemporal = {
  support: TemporalSupport;
  /** True only when measurement shows the route KEEPS to the times it is given. Seedance has been measured and did not (its evidence), so nothing here is, yet. */
  measured: boolean;
  /** What was measured, when anything was. */
  evidence?: TimingEvidence;
  /** Why, in words a director reads. */
  note: string;
};

const ONE_MOVE = "draws one continuous move from one picture and one sentence — it cannot place a change at a set time";

export const ROUTE_TEMPORAL: Record<TemporalRoute, RouteTemporal> = {
  image: { support: "none", measured: true, note: "an image is one moment: it is drawn as the shot OPENS, before any of its beats" },
  still_kling: { support: "none", measured: false, note: `Kling image-to-video ${ONE_MOVE}` },
  kling_t2v: { support: "none", measured: false, note: `Kling text-to-video ${ONE_MOVE}` },
  still_dop: { support: "none", measured: false, note: `DoP image-to-video ${ONE_MOVE}` },
  still_runway: { support: "none", measured: false, note: `Runway image-to-video ${ONE_MOVE}` },
  still_runway45: { support: "none", measured: false, note: `Runway image-to-video ${ONE_MOVE}` },
  runway_t2v: { support: "none", measured: false, note: `Runway text-to-video ${ONE_MOVE}` },
  seedance_ref: {
    support: "timed_script",
    measured: false,
    // the fresh-section test: c038 asked at 4.69 s, began at 3.67 s; c035 asked at 1.90 s, began at 0.96 s
    evidence: { on: "3 October 2026", errorsSeconds: [-1.02, -0.94], where: "docs/research/results/2026-10-03-fresh-section/RESULTS.md" },
    note: "Seedance reference-to-video takes a script with times; on the restagings measured it drew the change asked for, about a second early, so every clip is measured when it comes back",
  },
};

const signed = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(2)} s`;

/**
 * What a director is told about a route's timing before anything is spent: what was measured, in numbers, or that
 * nothing has been. Never "it works".
 */
export function timingSaid(route: TemporalRoute): string {
  const e = ROUTE_TEMPORAL[route].evidence;
  if (!e || e.errorsSeconds.length === 0) return "How closely it keeps to them has not been measured — the frames at each beat are the check.";
  const mean = e.errorsSeconds.reduce((a, b) => a + b, 0) / e.errorsSeconds.length;
  const n = e.errorsSeconds.length;
  const where = Math.abs(mean) <= 0.25 ? "on time" : `${Math.abs(mean).toFixed(1)} s ${mean < 0 ? "early" : "late"} on average`;
  return `On the ${n} restaging${n === 1 ? "" : "s"} measured so far (${e.on}) the change asked for was drawn and began ${where} (${e.errorsSeconds.map(signed).join(", ")}). Each clip is measured against its beats when it comes back.`;
}

export type TemporalPlan =
  /** Nothing in the shot has to be drawn changing: generate as always. (Effects are the edit's and are not sent.) */
  | { mode: "single"; effects: number }
  /** The image of a shot that changes: the opening state, said plainly. */
  | { mode: "opening_state"; beats: number; note: string }
  /** The route takes a timed script and is given one. `asked` is the script as data: what a check of the footage is held against. */
  | { mode: "timed_script"; script: string; beats: number; measured: boolean; note: string; /** What has been measured of this route's timing, said to the director (timingSaid). */ timing: string; asked: AskedBeat[] }
  /** The route cannot: nothing is generated. `alternatives` are the mechanisms the storyboard offers instead. */
  | { mode: "refused"; beats: number; reason: string; alternatives: TemporalAlternative[] }
  /** Asked for by name: the beats in order, with no claim about when. */
  | { mode: "ordered"; script: string; beats: number; note: string; asked: AskedBeat[] };

/**
 * One line of a script, as data: the moment a state begins (seconds from the shot's first frame), which kinds of
 * thing change there, and the words the model is given for what holds from then. The request and the check of what
 * came back are both made from this list, so the footage is measured against exactly what was asked.
 */
export type AskedBeat = { id: string; offset: number; kinds: EventFacet[]; says: string };

export type TemporalAlternative = "split" | "effect" | "ordered";

export const ALTERNATIVE_LABEL: Record<TemporalAlternative, string> = {
  split: "Split the shot at its beats — each state becomes its own shot, cut on the beat",
  effect: "Make the light change an effect — the edit does it, exactly on the clock",
  ordered: "Generate with the beats in order — the timing is not kept",
};

/** The events a generator would have to draw. */
export function directedEvents<T extends ResolvedEvent>(resolved: readonly T[]): T[] {
  return resolved.filter((e) => isDirected(e));
}

function statePhrases(s: ShotState): string {
  // the light is said in full: a switch to one of the project's lighting states carries that state's canonical words
  const said = (f: EventFacet) => (f === "lighting" && s.lightingWords ? s.lightingWords.replace(/[.\s]+$/, "") : s[f]);
  return EVENT_FACETS.filter((f) => s[f] || (f === "lighting" && s.lightingWords))
    .map((f) => `${FACET_LABEL[f].toLowerCase()}: ${said(f)}`)
    .join("; ");
}

/** The states of a shot that say something, as the lines a script is made of. */
export function askedBeats(resolved: readonly ResolvedEvent[], shotSeconds: number): AskedBeat[] {
  const states = eventStates(resolved, shotSeconds);
  const out: AskedBeat[] = [];
  states.forEach((s, i) => {
    const says = statePhrases(s);
    if (!says) return;
    const prev = i > 0 ? states[i - 1] : null;
    out.push({ id: s.eventId ?? "open", offset: Math.round(s.from * 1000) / 1000, kinds: EVENT_FACETS.filter((f) => s[f] && s[f] !== (prev?.[f] ?? "")), says });
  });
  return out;
}

/**
 * A script WITH times from its lines. `lead` = seconds of footage the clip has before the shot's first frame (a cut
 * that had to open on an earlier sync frame): the times given to the model are the CLIP's, so they are moved by it.
 */
export function scriptOf(asked: readonly AskedBeat[], lead = 0): string {
  if (asked.length === 0) return "";
  return `Timed changes inside this shot, in seconds from its first frame. Each holds until the next; nothing else changes: ${asked.map((b) => `from ${(b.offset + lead).toFixed(1)} s: ${b.says}`).join(". ")}.`;
}

/**
 * The beats as a script WITH times, in seconds from the first frame — the form a model that reads times is given.
 * Each line is what holds FROM that moment (the newest phrase of every kind), so a line is never ambiguous about
 * whether an earlier change still stands.
 */
export function timedScript(resolved: readonly ResolvedEvent[], shotSeconds: number): string {
  return scriptOf(askedBeats(resolved, shotSeconds));
}

/** The beats in order, WITHOUT times — only ever sent when the director asked for "in order, not on time". */
export function orderedScript(resolved: readonly ResolvedEvent[], shotSeconds: number): string {
  const states = eventStates(resolved, shotSeconds).filter((s) => statePhrases(s));
  if (states.length === 0) return "";
  const words = ["First", "Then", "Then", "Then", "Then", "Then", "Then", "Then", "Then", "Then", "Then", "Then"];
  return states.map((s, i) => `${i === 0 && s.eventId === null ? "It opens" : (words[i] ?? "Then")}: ${statePhrases(s)}`).join(". ") + ".";
}

/**
 * What generating does with this shot's events on this route. The only place that decides it.
 * `allowOrdered` is true only when the director pressed "in order, not on time".
 */
export function temporalPlan(input: { route: TemporalRoute; resolved: readonly ResolvedEvent[]; shotSeconds: number; allowOrdered?: boolean }): TemporalPlan {
  const directed = directedEvents(input.resolved);
  const effects = input.resolved.filter((e) => e.effect).length;
  if (directed.length === 0) return { mode: "single", effects };
  const cap = ROUTE_TEMPORAL[input.route];
  if (input.route === "image") return { mode: "opening_state", beats: directed.length, note: cap.note };
  // a beat that points at a lighting state the project has no words for cannot be asked of any model
  const wordless = directed.filter((e) => !drawnFacets(e).some((f) => e[f].trim()));
  if (wordless.length > 0) {
    return {
      mode: "refused",
      beats: directed.length,
      reason: `The beat at ${wordless.map((e) => offsetLabel(e.offset)).join(", ")} switches to a lighting state (${wordless.map((e) => e.lightingState).join(", ")}) that has no description in this project, so there is nothing to ask a model for.`,
      alternatives: [],
    };
  }
  if (cap.support === "timed_script") {
    const asked = askedBeats(input.resolved, input.shotSeconds);
    return { mode: "timed_script", script: scriptOf(asked), beats: directed.length, measured: cap.measured, note: cap.note, timing: timingSaid(input.route), asked };
  }
  if (input.allowOrdered) {
    return { mode: "ordered", script: orderedScript(input.resolved, input.shotSeconds), beats: directed.length, note: `${cap.note}. It is told the beats in order; when each happens is its own choice.`, asked: askedBeats(input.resolved, input.shotSeconds) };
  }
  // an effect can stand in for a change of light only; a split and "in order" are always there
  const lightOnly = directed.every((e) => drawnFacets(e).every((f) => f === "lighting"));
  const alternatives: TemporalAlternative[] = lightOnly ? ["effect", "split", "ordered"] : ["split", "ordered"];
  return {
    mode: "refused",
    beats: directed.length,
    reason: `This shot changes ${directed.length === 1 ? "once" : `${directed.length} times`} while it plays (${directed.map((e) => offsetLabel(e.offset)).join(", ")}), and ${cap.note}.`,
    alternatives,
  };
}

/** The shot's beats, one line each, for a confirmation or a record. */
export function beatLines(resolved: readonly ResolvedEvent[]): string[] {
  return resolved.map((e) => {
    const parts = EVENT_FACETS.filter((f) => e[f].trim()).map((f) => `${FACET_LABEL[f].toLowerCase()}: ${e[f].trim()}`);
    if (e.effect) parts.push(`effect: ${EFFECT_LABEL[e.effect.type].toLowerCase()}`);
    return `${offsetLabel(e.offset)} ${parts.join("; ")}`;
  });
}

/**
 * The scene of one state, for a shot made by splitting at the beats: the base scene with what has changed by then.
 * The base stays the subject of the sentence; the changes are added as what now holds.
 */
export function stateScene(base: string, state: ShotState): string {
  const now = statePhrases(state);
  const b = base.trim().replace(/\s+$/, "");
  if (!now) return b;
  return `${b}${/[.!?]$/.test(b) ? "" : "."} Now — ${now}.`;
}

/**
 * The last line of defence against a flattened shot: a plan that says "nothing changes" (or "the opening state") is
 * not accepted for a clip of a shot whose events have to be drawn. A stale or mistaken plan fails here, loudly,
 * before anything is sent.
 */
export function assertPlanCovers(spec: { events: readonly Pick<ResolvedEvent, "lighting" | "camera" | "action" | "visual" | "lightingState" | "effect">[] }, plan: TemporalPlan): void {
  const directed = spec.events.filter((e) => isDirected(e)).length;
  if (directed > 0 && (plan.mode === "single" || plan.mode === "opening_state")) {
    throw new Error(`This shot changes ${directed === 1 ? "once" : `${directed} times`} while it plays and the request said nothing about it. Nothing was generated.`);
  }
}
