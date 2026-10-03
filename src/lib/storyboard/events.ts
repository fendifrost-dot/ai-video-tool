/**
 * Change inside a shot — timed events (Fendi, 2026-10-03: "a storyboard shot currently describes one state. Real
 * directing requires CHANGE WITHIN THE SHOT").
 *
 * A shot's own fields say the state it OPENS in. Its events say what changes after that, and when:
 *
 *   0:00.0  the runway, lights up                (the shot's base scene)
 *   0:01.2  ♪ "cut the lights on"   light: the house lights die        effect: blackout
 *   0:02.4                          light: the ice is the only light   camera: push-in begins
 *
 * An event is a time inside the shot, what that time hangs on (a typed offset, the moment some words are sung, a
 * beat), and at most one short phrase per kind of change. The song is the clock, as everywhere else: an event that
 * hangs on a lyric or a beat is placed by the lyric timing or the beat map every time it is read — never stored as
 * a second copy of that timing — so it stays on its word when the shot is split, merged or re-timed.
 *
 * Two kinds of change, kept apart because they are realised differently:
 *   • DIRECTED change (visual, camera, lighting, action) has to be IN the footage. A generator that can follow a
 *     timed script is given one; one that cannot is not handed the shot as if it were a single state
 *     (see temporal.ts).
 *   • an EFFECT (dim, blackout, lights up, flash, fade out) is made by the edit, exactly and on the clock, on
 *     whatever footage the shot shows. Review plays it; a render applies the same arithmetic (`pictureAt`).
 *
 * Pure module: no react, no supabase, no project knowledge.
 */
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import {
  SHOT_EVENT_EFFECTS,
  SHOT_EVENT_PHRASE_MAX,
  SHOT_EVENT_TRIGGERS,
  SHOT_EVENTS_MAX,
  type ShotEvent,
  type ShotEventEffectType,
  type ShotEventTrigger,
} from "@/lib/treatment/shotSpec";

export type { ShotEvent, ShotEventEffectType, ShotEventTrigger };

/** The kinds of directed change, in the order a beat is read. */
export const EVENT_FACETS = ["lighting", "camera", "action", "visual"] as const;
export type EventFacet = (typeof EVENT_FACETS)[number];

export const FACET_LABEL: Record<EventFacet, string> = { lighting: "Light", camera: "Camera", action: "Action", visual: "Picture" };

export const EFFECT_LABEL: Record<ShotEventEffectType, string> = {
  dim: "Dim",
  blackout: "Blackout",
  lights_up: "Lights up",
  flash: "Flash",
  fade_out: "Fade to black",
};

/** What an effect does when its own numbers are not given. `level` = the light left; `seconds` = how long the change takes. */
export const EFFECT_DEFAULTS: Record<ShotEventEffectType, { seconds: number; level: number; contrast: number }> = {
  dim: { seconds: 0.4, level: 0.35, contrast: 1.1 },
  // almost dark, with the contrast pulled up so what was brightest in the picture (metal, glass, stones) still reads
  blackout: { seconds: 0.25, level: 0.1, contrast: 1.6 },
  lights_up: { seconds: 0.4, level: 1, contrast: 1 },
  flash: { seconds: 0.18, level: 1, contrast: 1 },
  fade_out: { seconds: 0.6, level: 0, contrast: 1 },
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const phrase = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, SHOT_EVENT_PHRASE_MAX) : "");

type Drawable = Pick<ShotEvent, EventFacet> & { lightingState?: string | null; effect?: ShotEvent["effect"] | null };

/**
 * The kinds of change an event asks the FOOTAGE to show. A change of light that carries an effect is made by the
 * edit — its words name what the effect is, and it is not also asked of a generator (the picture would be darkened
 * twice). Camera, action and picture changes are always the footage's.
 */
export function drawnFacets(e: Drawable): EventFacet[] {
  return EVENT_FACETS.filter((f) => (f === "lighting" ? !e.effect && (e.lighting.trim().length > 0 || !!e.lightingState) : e[f].trim().length > 0));
}

/**
 * True when the event says something to draw (as opposed to an effect the edit makes). A switch to one of the
 * project's lighting states is a change of light to draw, whether or not the state's words are at hand.
 */
export function isDirected(e: Drawable): boolean {
  return drawnFacets(e).length > 0;
}

/** True when the event states anything at all. */
export function hasContent(e: Pick<ShotEvent, EventFacet | "effect" | "lightingState">): boolean {
  return isDirected(e) || !!e.effect || !!e.lightingState;
}

/** An id no event in the list has ("e1", "e2", …). */
export function nextEventId(events: readonly Pick<ShotEvent, "id">[]): string {
  const taken = new Set(events.map((e) => e.id));
  for (let n = 1; n < 10_000; n++) if (!taken.has(`e${n}`)) return `e${n}`;
  return `e${Date.now()}`;
}

/**
 * Events from anything (a stored value, a model's reply, an editor draft): only the ones that say something, each
 * phrase cut to a phrase, in time order, every id unique, at most SHOT_EVENTS_MAX. An event at or past the end of the
 * shot is pulled just inside it when the shot's length is known — a beat cannot happen after its shot.
 */
export function sanitizeEvents(value: unknown, shotSeconds?: number | null): ShotEvent[] {
  if (!Array.isArray(value)) return [];
  const out: ShotEvent[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const t = (r.trigger && typeof r.trigger === "object" ? r.trigger : {}) as Record<string, unknown>;
    const kind = (SHOT_EVENT_TRIGGERS as readonly unknown[]).includes(t.kind) ? (t.kind as ShotEventTrigger) : "time";
    const ref = phrase(t.ref);
    const fx = (r.effect && typeof r.effect === "object" ? r.effect : null) as Record<string, unknown> | null;
    const effect =
      fx && (SHOT_EVENT_EFFECTS as readonly unknown[]).includes(fx.type)
        ? {
            type: fx.type as ShotEventEffectType,
            seconds: typeof fx.seconds === "number" && fx.seconds > 0 ? Math.min(10, round3(fx.seconds)) : null,
            level: typeof fx.level === "number" && fx.level >= 0 && fx.level <= 1 ? round3(fx.level) : null,
          }
        : null;
    let at = typeof r.at === "number" && Number.isFinite(r.at) ? Math.max(0, r.at) : 0;
    if (shotSeconds != null && shotSeconds > 0) at = Math.min(at, Math.max(0, shotSeconds - 0.05));
    const e: ShotEvent = {
      id: typeof r.id === "string" && r.id.trim() ? r.id.trim() : "",
      at: round3(at),
      // a lyric or beat trigger with nothing to hang on is a typed time
      trigger: kind !== "time" && !ref ? { kind: "time", ref: "" } : { kind, ref: kind === "time" ? "" : ref },
      visual: phrase(r.visual),
      camera: phrase(r.camera),
      lighting: phrase(r.lighting),
      action: phrase(r.action),
      lightingState: typeof r.lightingState === "string" && r.lightingState.trim() ? r.lightingState.trim() : null,
      effect,
    };
    if (!hasContent(e)) continue;
    out.push(e);
  }
  out.sort((a, b) => a.at - b.at);
  const kept = out.slice(0, SHOT_EVENTS_MAX);
  for (const e of kept) {
    if (!e.id || ids.has(e.id)) e.id = nextEventId([...ids].map((id) => ({ id })));
    ids.add(e.id);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Where an event sits on the song
// ---------------------------------------------------------------------------

export type EventClock = {
  /** The project's timed lyric lines (with word times when the aligner gave them). */
  lyricLines?: readonly LyricLine[] | null;
  /** The song's beat times, seconds. */
  beats?: readonly number[] | null;
  /**
   * The project's lighting states, by key → canonical description (continuity entities). An event that switches to
   * a state and says nothing else about the light reads as that description — the same words wherever the state is used.
   */
  lightingStates?: ReadonlyMap<string, string> | null;
};

/**
 * The clock every reader of a project's events uses — the storyboard, Review and the render contract — built one way
 * from the project's lyric timing and the song analysis' beat map, so they cannot place a beat differently.
 */
export function eventClock(
  lyricLines: readonly LyricLine[] | null | undefined,
  beatMap: readonly { t: number }[] | null | undefined,
  lightingStates?: readonly { key: string; kind: string; description: string }[] | null,
): EventClock {
  const states = new Map<string, string>();
  for (const e of lightingStates ?? []) if (e.kind === "lighting" && e.description.trim()) states.set(e.key, phrase(e.description));
  return { lyricLines: lyricLines ?? null, beats: (beatMap ?? []).map((b) => b.t).filter((t) => typeof t === "number" && Number.isFinite(t)), lightingStates: states };
}

export type ResolvedEvent = ShotEvent & {
  /** Seconds from the shot's start, where the event actually is. */
  offset: number;
  /** Song clock, seconds. */
  songTime: number;
  /**
   * How the time was found: its own trigger ("time" | "lyric" | "beat"), or "fallback" — the lyric or beat it hangs
   * on is not inside this shot (any more), so its stored offset is used and the event says so.
   */
  placedBy: ShotEventTrigger | "fallback";
  /** True when `lighting` is the canonical description of the lighting state the event points at, not words of its own. */
  lightingFromState?: boolean;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The song time the words `ref` start being sung inside [start, end), or null when they are not sung there. */
export function lyricTimeIn(lines: readonly LyricLine[], window: { start: number; end: number }, ref: string): number | null {
  const want = norm(ref).split(" ").filter(Boolean);
  if (want.length === 0) return null;
  const inside = (t: number) => t >= window.start - 0.05 && t < window.end - 0.02;
  for (const line of lines) {
    if (line.end <= window.start || line.start >= window.end) continue;
    const words = line.words.filter((w) => w && typeof w.start === "number");
    if (words.length > 0) {
      const toks = words.map((w) => norm(w.w));
      for (let i = 0; i + want.length <= toks.length; i++) {
        if (!want.every((x, k) => toks[i + k] === x)) continue;
        if (inside(words[i].start)) return Math.max(window.start, words[i].start);
      }
    }
    // no word times (or the words did not match one by one): the line that says it starts the moment
    if (` ${norm(line.text)} `.includes(` ${want.join(" ")} `) && inside(Math.max(line.start, window.start)) && words.length === 0) {
      return Math.max(line.start, window.start);
    }
  }
  return null;
}

/** The song time of the nth beat (1-based) inside [start, end), or null. */
export function beatTimeIn(beats: readonly number[], window: { start: number; end: number }, ref: string): number | null {
  const n = Math.floor(Number(ref));
  if (!Number.isFinite(n) || n < 1) return null;
  const inside = beats.filter((t) => t >= window.start - 0.02 && t < window.end - 0.02).sort((a, b) => a - b);
  return inside[n - 1] ?? null;
}

/**
 * Place every event of a shot on the song. A lyric or beat trigger is looked up in the lyric timing / beat map; when
 * it is not there, the stored offset stands and the event is marked "fallback" so the storyboard can say so.
 */
export function resolveEvents(events: readonly ShotEvent[], window: { start: number; end: number }, clock: EventClock = {}): ResolvedEvent[] {
  const seconds = Math.max(0, window.end - window.start);
  const out = events.map((e): ResolvedEvent => {
    let songTime: number | null = null;
    if (e.trigger.kind === "lyric" && clock.lyricLines?.length) songTime = lyricTimeIn(clock.lyricLines, window, e.trigger.ref);
    else if (e.trigger.kind === "beat" && clock.beats?.length) songTime = beatTimeIn(clock.beats, window, e.trigger.ref);
    const found = songTime != null;
    const offset = found ? songTime! - window.start : e.at;
    const clamped = round3(Math.max(0, Math.min(offset, Math.max(0, seconds - 0.05))));
    // a lighting state pointed at, with no words of the event's own: the state's canonical description is the phrase
    const state = e.lightingState && !e.lighting.trim() ? clock.lightingStates?.get(e.lightingState) : undefined;
    return {
      ...e,
      ...(state ? { lighting: state, lightingFromState: true } : {}),
      offset: clamped,
      songTime: round3(window.start + clamped),
      placedBy: e.trigger.kind === "time" ? "time" : found ? e.trigger.kind : "fallback",
    };
  });
  return out.sort((a, b) => a.offset - b.offset || a.id.localeCompare(b.id));
}

/** The beats inside a shot, as offsets from its start — what "on beat n" can mean here. */
export function beatsInShot(beats: readonly number[] | null | undefined, window: { start: number; end: number }): { n: number; offset: number }[] {
  return (beats ?? [])
    .filter((t) => t >= window.start - 0.02 && t < window.end - 0.02)
    .sort((a, b) => a - b)
    .map((t, i) => ({ n: i + 1, offset: round3(Math.max(0, t - window.start)) }));
}

/** The words sung inside a shot with the offset each starts at — what "on the words …" can hang on. */
export function wordsInShot(lines: readonly LyricLine[] | null | undefined, window: { start: number; end: number }): { text: string; offset: number; lineIndex: number }[] {
  const out: { text: string; offset: number; lineIndex: number }[] = [];
  for (const line of lines ?? []) {
    if (line.end <= window.start || line.start >= window.end) continue;
    const words = line.words.filter((w) => typeof w.start === "number" && w.start >= window.start - 0.05 && w.start < window.end - 0.02);
    if (words.length > 0) {
      // from each word to the end of the line: "cut the lights on", "the lights on", …  — the director picks where it lands
      for (let i = 0; i < words.length; i++) {
        out.push({ text: words.slice(i, i + 4).map((w) => w.w).join(" "), offset: round3(Math.max(0, words[i].start - window.start)), lineIndex: line.lineIndex });
      }
    } else if (line.start >= window.start - 0.05) {
      out.push({ text: line.text, offset: round3(Math.max(0, line.start - window.start)), lineIndex: line.lineIndex });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

// ---------------------------------------------------------------------------
// What the shot is, stretch by stretch
// ---------------------------------------------------------------------------

export type ShotState = {
  /** Offsets from the shot's start. */
  from: number;
  to: number;
  /** The event that opens this stretch (null for the opening state). */
  eventId: string | null;
  /** What holds during the stretch, per kind: the newest phrase of each kind so far. Empty = as the base scene says. */
  lighting: string;
  camera: string;
  action: string;
  visual: string;
  lightingState: string | null;
};

/**
 * The shot as a run of states: the opening one, then one per moment something directed changes. Each state carries
 * the newest phrase of every kind — the light that died at 1.2 s is still dead at 2.4 s when the camera starts to move.
 * Events at the same moment are one state. Effects do not open a state: they are not drawn.
 */
export function eventStates(resolved: readonly ResolvedEvent[], shotSeconds: number): ShotState[] {
  const states: ShotState[] = [{ from: 0, to: shotSeconds, eventId: null, lighting: "", camera: "", action: "", visual: "", lightingState: null }];
  for (const e of resolved) {
    if (!isDirected(e)) continue;
    const last = states[states.length - 1];
    const sameMoment = Math.abs(e.offset - last.from) < 0.02 && last.eventId !== null;
    const next: ShotState = sameMoment ? last : { ...last, from: e.offset, to: shotSeconds, eventId: e.id };
    const drawn = drawnFacets(e);
    for (const f of drawn) if (e[f].trim()) next[f] = e[f].trim();
    if (e.lightingState && drawn.includes("lighting")) next.lightingState = e.lightingState;
    if (!sameMoment) {
      // an event at the very start replaces the opening state rather than leaving a zero-length one in front of it
      if (e.offset < 0.02 && states.length === 1) states[0] = { ...next, from: 0 };
      else {
        last.to = e.offset;
        states.push(next);
      }
    }
  }
  return states;
}

/** One event as the few words a storyboard shows for it, in the order a beat is read. */
export function eventPhrases(e: Pick<ShotEvent, EventFacet | "effect">): { kind: EventFacet | "effect"; label: string; text: string }[] {
  const out: { kind: EventFacet | "effect"; label: string; text: string }[] = [];
  for (const f of EVENT_FACETS) if (e[f].trim()) out.push({ kind: f, label: FACET_LABEL[f], text: e[f].trim() });
  if (e.effect) out.push({ kind: "effect", label: "Effect", text: effectWords(e.effect) });
  return out;
}

export function effectWords(fx: NonNullable<ShotEvent["effect"]>): string {
  const d = EFFECT_DEFAULTS[fx.type];
  const seconds = fx.seconds ?? d.seconds;
  if (fx.type === "dim") return `dim to ${Math.round((fx.level ?? d.level) * 100)}% over ${seconds.toFixed(1)} s`;
  if (fx.type === "blackout") return `blackout over ${seconds.toFixed(1)} s (highlights kept)`;
  if (fx.type === "lights_up") return `lights back up over ${seconds.toFixed(1)} s`;
  if (fx.type === "flash") return `white flash, ${seconds.toFixed(2)} s`;
  return `fade to black over ${seconds.toFixed(1)} s`;
}

/** "0:01.2" — an offset inside a shot. */
export function offsetLabel(offset: number): string {
  const s = Math.max(0, offset);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

/** What an event's time hangs on, in words. */
export function triggerLabel(e: Pick<ResolvedEvent, "trigger" | "placedBy">): string {
  if (e.trigger.kind === "lyric") return e.placedBy === "fallback" ? `"${e.trigger.ref}" — not sung in this shot, held at its time` : `on "${e.trigger.ref}"`;
  if (e.trigger.kind === "beat") return e.placedBy === "fallback" ? `beat ${e.trigger.ref} — not in this shot, held at its time` : `on beat ${e.trigger.ref}`;
  return "";
}

// ---------------------------------------------------------------------------
// The effect, as arithmetic
// ---------------------------------------------------------------------------

export type Picture = {
  /** Multiplies the picture's light: 1 = as filmed, 0 = black. */
  brightness: number;
  /** Contrast about mid-grey: 1 = as filmed. */
  contrast: number;
  /** White laid over the picture, 0–1. */
  flash: number;
};

export const PICTURE_AS_FILMED: Picture = { brightness: 1, contrast: 1, flash: 0 };

const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));

/**
 * What the edit does to the picture at `offset` seconds into the shot. The whole definition of the effects: the
 * player and a renderer both apply exactly this, so what Review plays is what a render makes.
 *
 * Light changes (dim, blackout, lights up, fade out) move the brightness and contrast from where they are to the
 * effect's target, linearly over its seconds, and hold there until the next one. A flash is white laid over the
 * picture at full strength at its moment, gone linearly over its seconds. Every shot starts as filmed.
 */
export function pictureAt(resolved: readonly Pick<ResolvedEvent, "offset" | "effect">[], offset: number): Picture {
  let brightness = 1;
  let contrast = 1;
  let flash = 0;
  const fx = resolved.filter((e) => e.effect).sort((a, b) => a.offset - b.offset);
  for (const e of fx) {
    if (offset < e.offset) break;
    const d = EFFECT_DEFAULTS[e.effect!.type];
    const seconds = e.effect!.seconds ?? d.seconds;
    const k = seconds > 0 ? (offset - e.offset) / seconds : 1;
    if (e.effect!.type === "flash") {
      flash = Math.max(flash, 1 - Math.max(0, Math.min(1, k)));
      continue;
    }
    const level = e.effect!.type === "dim" ? (e.effect!.level ?? d.level) : d.level;
    brightness = lerp(brightness, level, k);
    contrast = lerp(contrast, d.contrast, k);
  }
  return { brightness: round3(brightness), contrast: round3(contrast), flash: round3(flash) };
}

/**
 * What a director should know about a shot's beats before anything is generated: a change of light asked of the
 * footage while one of the edit's own light effects is still on the picture would be seen THROUGH that effect.
 * One line per such beat. Empty when the beats do not get in each other's way.
 */
export function eventNotes(resolved: readonly ResolvedEvent[]): string[] {
  const out: string[] = [];
  for (const e of resolved) {
    if (!drawnFacets(e).includes("lighting")) continue;
    const p = pictureAt(resolved, e.offset);
    if (p.brightness >= 1 && p.contrast === 1) continue;
    const since = [...resolved].reverse().find((x) => x.effect && x.effect.type !== "flash" && x.offset <= e.offset);
    out.push(
      `At ${offsetLabel(e.offset)} the light changes in the footage, but the edit's ${since ? EFFECT_LABEL[since.effect!.type].toLowerCase() : "effect"}${since ? ` from ${offsetLabel(since.offset)}` : ""} is still on the picture — the change would be seen through it. Let one of the two make it, or end the effect there (Lights up).`,
    );
  }
  return out;
}

/** True when the picture is exactly as filmed (nothing to apply). */
export function isAsFilmed(p: Picture): boolean {
  return p.brightness === 1 && p.contrast === 1 && p.flash === 0;
}

/** The CSS filter that is `pictureAt`'s brightness and contrast (the same string a canvas 2D context takes). */
export function pictureFilter(p: Picture): string {
  return p.brightness === 1 && p.contrast === 1 ? "none" : `brightness(${p.brightness}) contrast(${p.contrast})`;
}

/** The effect keys of a shot on the song clock — what a render plan carries. */
export function effectKeys(resolved: readonly ResolvedEvent[]): { event_id: string; song_time: number; offset: number; type: ShotEventEffectType; seconds: number; level: number; contrast: number }[] {
  return resolved
    .filter((e) => e.effect)
    .map((e) => {
      const d = EFFECT_DEFAULTS[e.effect!.type];
      return {
        event_id: e.id,
        song_time: e.songTime,
        offset: e.offset,
        type: e.effect!.type,
        seconds: e.effect!.seconds ?? d.seconds,
        level: e.effect!.type === "dim" ? (e.effect!.level ?? d.level) : d.level,
        contrast: d.contrast,
      };
    });
}

// ---------------------------------------------------------------------------
// Split and merge
// ---------------------------------------------------------------------------

/**
 * The event as the shot record stores it: without where it was placed, and without a lighting phrase that was its
 * lighting state's description (the record keeps the pointer, so the event keeps following the state).
 */
export function storedEvent({ offset: _o, songTime: _s, placedBy: _p, lightingFromState, ...e }: ResolvedEvent): ShotEvent {
  return lightingFromState ? { ...e, lighting: "" } : e;
}

/**
 * A shot's events when the shot is cut in two at `cutOffset` seconds: the first half keeps the events before the cut,
 * the second takes the rest, re-timed from its own start. A lyric or beat trigger goes with its event (a beat number
 * counted from the old start is re-counted by the caller's clock on the next read; its stored offset is the fallback).
 */
export function splitEvents(resolved: readonly ResolvedEvent[], cutOffset: number): { first: ShotEvent[]; second: ShotEvent[] } {
  const strip = storedEvent;
  const first = resolved.filter((e) => e.offset < cutOffset - 1e-6).map((e) => ({ ...strip(e), at: round3(e.offset) }));
  const second = resolved
    .filter((e) => e.offset >= cutOffset - 1e-6)
    .map((e) => {
      const base = strip(e);
      // "beat 5" of the whole shot is not beat 5 of its second half: keep the moment, drop the count
      const trigger = base.trigger.kind === "beat" ? { kind: "time" as const, ref: "" } : base.trigger;
      return { ...base, trigger, at: round3(e.offset - cutOffset) };
    });
  return { first, second };
}

/** The events of two shots that become one: the later shot's events, re-timed from the earlier shot's start, follow its own. */
export function mergeEvents(first: readonly ResolvedEvent[], second: readonly ResolvedEvent[], secondStartOffset: number): ShotEvent[] {
  const strip = storedEvent;
  const a = first.map((e) => ({ ...strip(e), at: round3(e.offset) }));
  const b = second.map((e) => {
    const base = strip(e);
    const trigger = base.trigger.kind === "beat" ? { kind: "time" as const, ref: "" } : base.trigger;
    return { ...base, trigger, at: round3(e.offset + secondStartOffset) };
  });
  return sanitizeEvents([...a, ...b.map((e) => ({ ...e, id: "" }))]);
}
