// treatment-writer-proxy — the pure half: what the writer is told and what it must hand back.
//
// Nothing here knows a song or a project. The lyrics, the artist, the direction, the notes, the real footage and the
// storyboard's own shot grid all come in on the request; this file turns them into two kinds of model call:
//   1. the TREATMENT — the idea of the video, how it moves across the song, what each section is for;
//   2. the SHOTS — one scene for every shot of the grid it is handed, written inside that treatment.
// The grid owns timing: the writer is told each shot's window and the words sung in it, and never moves a cut.

import { acceptTimedBeats, TIMED_BEATS_PROPERTY, timedBeatsRules } from "../_shared/timedBeats.ts";
import { BEAT_RULES, briefedShot, type ShotBrief } from "./beats.ts";

export const SHOT_TYPES = ["performance", "b_roll", "narrative", "lyric_visual", "transition", "vfx"] as const;

/** List prices per million tokens; a model not listed is priced at the dearest known, so an estimate never flatters. */
export const PRICE_PER_M: Record<string, { input: number; output: number }> = { "grok-4.6": { input: 3, output: 15 }, "grok-4-fast": { input: 0.2, output: 0.5 } };
export const SHOTS_PER_CALL = 9;

/** The treatment's fingerprint, the same as the app's (src/lib/treatment/treatmentDoc.ts): length and a djb2 hash. */
export function fingerprint(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

/** What a run should cost at the model's list price, from the sizes of what is sent and asked — an estimate, kept apart from the actual. */
export function estimateCostUsd(model: string, shots: number, treatmentChars: number, contextChars: number): number {
  const price = PRICE_PER_M[model] ?? { input: 5, output: 25 };
  const perCall = Math.ceil((treatmentChars + contextChars + shots * 90) / 4) + 1800; // prompt tokens of one shots call (~4 chars a token + the rules)
  const calls = Math.ceil(shots / SHOTS_PER_CALL) + 1; // + the beats call
  const inputTokens = calls * perCall + Math.ceil(treatmentChars / 4);
  const outputTokens = shots * 420 + 1600 + Math.ceil(shots / 3) * 420; // the shots, the beats, one re-ask of a third
  return Number(((inputTokens * price.input + outputTokens * price.output) / 1_000_000).toFixed(4));
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const fail = (status: number, errorCode: string, errorMessage: string) => json(status, { ok: false, errorCode, errorMessage });
const text = (v: unknown, max = MAX_TEXT) => (typeof v === "string" ? v.slice(0, max) : null);

type Usage = { prompt_tokens: number; completion_tokens: number };

/** The cost of what the provider counted, at list price. */
export function costOf(model: string, usage: { prompt_tokens: number; completion_tokens: number }): number {
  const price = PRICE_PER_M[model] ?? { input: 5, output: 25 };
  return Number(((usage.prompt_tokens * price.input + usage.completion_tokens * price.output) / 1_000_000).toFixed(4));
}

export const PRIORITIES = ["normal", "high", "hero"] as const;

export type GridShot = { key: string; start: number; end: number; section?: string | null; energy?: string | null; lyrics?: string | null };

export type WriterContext = {
  projectType?: string | null;
  songTitle?: string | null;
  lyrics?: string | null;
  artistProfile?: string | null;
  visualStyle?: string | null;
  mood?: string | null;
  /** The director's notes, and the statement of the real footage: constraints, not suggestions. */
  notes?: string | null;
  analysis?: unknown;
  looks?: { name: string; description?: string | null }[];
  /** The project has real performance footage in sync with the song. */
  hasPerformanceFootage?: boolean;
  /** The project's continuity entities — places, props and lighting states described once. A shot points at them by key. */
  entities?: WriterEntity[];
};

export type WriterEntity = { key: string; kind: "location" | "prop" | "lighting" | "character"; name: string; description?: string | null };
export const ENTITY_KINDS = ["location", "prop", "lighting", "character"] as const;

/** The entities a writer may point at, cleaned: a key, a known kind, a name. */
export function writerEntities(value: unknown): WriterEntity[] {
  if (!Array.isArray(value)) return [];
  const out: WriterEntity[] = [];
  for (const raw of value.slice(0, 60)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    const kind = ENTITY_KINDS.find((k) => k === r.kind) ?? null;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!key || !kind || !name || out.some((e) => e.key === key)) continue;
    out.push({ key, kind, name: name.slice(0, 120), description: typeof r.description === "string" ? r.description.trim().slice(0, 600) : null });
  }
  return out;
}

const KIND_HEAD = { location: "Places", prop: "Props", lighting: "Lighting states", character: "People" } as const;

/** The entities as a block the writer reads, or null when the project has none. */
export function entitiesBlock(entities: readonly WriterEntity[] | undefined): string | null {
  const list = entities ?? [];
  if (list.length === 0) return null;
  const group = (kind: WriterEntity["kind"]) => {
    const of = list.filter((e) => e.kind === kind);
    return of.length ? `${KIND_HEAD[kind]}:\n${of.map((e) => `- ${e.key} — ${e.name}${e.description ? `: ${e.description}` : ""}`).join("\n")}` : null;
  };
  return [
    "The project's continuity entities — each is described ONCE, here, and looks the same in every shot. A shot set in one of these places, showing one of these props or lit by one of these lighting states points at it by its KEY (`continuity`) and does not describe it again differently. A shot that one of these PEOPLE is in points at them by KEY in `cast.members` and says what they do there:",
    group("location"),
    group("prop"),
    group("lighting"),
    group("character"),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * What one shot owes another (src/lib/treatment/shotSpec.ts SHOT_LINK_KINDS — the same four words):
 * screen_shows = a screen in this shot shows that shot's picture; match_position = the subject keeps that shot's place in
 * the frame while the world changes; reveals = this shot reveals what that one opened onto; continues = the same action
 * carries across the cut.
 */
export const LINK_KINDS = ["screen_shows", "match_position", "reveals", "continues"] as const;

/**
 * How a shot gets made (shotSpec PRODUCTION_METHODS). The writer says what the shot NEEDS; whether the app can do it is
 * decided downstream (storyboard/route.ts), and a method it cannot do is reported, never swapped for an easier shot.
 */
export const PRODUCTION_METHODS = ["footage", "restage", "generate", "edit_footage", "composite", "multi_shot"] as const;

/** Where a shot's wardrobe comes from. `treatment` on a shot whose footage shows something else is a gap to be told. */
export const WARDROBE_SOURCES = ["footage", "treatment", "none"] as const;

export const TREATMENT_SCHEMA = {
  name: "treatment",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["concept", "narrative", "sections"],
    properties: {
      concept: { type: "string", description: "the idea of the video in one or two sentences a director would say out loud" },
      narrative: { type: "string", description: "one paragraph, at most 130 words: what the viewer sees from the first shot to the last, section by section" },
      sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "intent"],
        properties: { name: { type: "string", description: "the song section, as the grid names it" }, intent: { type: "string", description: "what this section of the video is for, in one sentence" } } } },
    },
  },
} as const;

export const SHOTS_SCHEMA = {
  name: "treatment_shots",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["clips"],
    properties: {
      clips: { type: "array", items: { type: "object", additionalProperties: false,
        required: ["key", "shot_type", "scene_description", "environment", "camera_direction", "lighting", "wardrobe", "wardrobe_from", "lyric_ref", "priority", "timed_beats", "continuity", "cast", "production"],
        properties: {
          key: { type: "string", description: "the shot's key, exactly as given" },
          shot_type: { type: "string", enum: [...SHOT_TYPES] },
          scene_description: { type: "string", description: "what the camera sees, in one or two concrete sentences" },
          environment: { type: "string", description: "the place itself with NOBODY in it, in one full sentence a set designer could build from: what stands where, the surfaces, the light. Never mention the artist here" },
          camera_direction: { type: "string", description: "framing and the one camera move" },
          lighting: { type: "string" },
          wardrobe: { type: "string", description: "what the artist wears in this shot, or 'none' when he is not in it. Where the treatment names a garment for this part of the video, exactly that garment in the treatment's own words" },
          wardrobe_from: { type: "string", enum: [...WARDROBE_SOURCES], description: "where that wardrobe comes from: `treatment` when the treatment dresses him in it for this shot; `footage` when he wears what he was filmed in (or the treatment says nothing about his clothes here); `none` when he is not in the shot" },
          lyric_ref: { type: "string", description: "the words of this shot's lyrics that the picture answers, verbatim — an empty string when it answers none" },
          priority: { type: "string", enum: [...PRIORITIES] },
          timed_beats: TIMED_BEATS_PROPERTY,
          continuity: { type: "object", additionalProperties: false, required: ["location", "props", "lighting", "links"],
            description: "the project's continuity entities this shot points at, by KEY exactly as given — empty when the project has none or none fits",
            properties: {
              location: { type: "string", description: "the key of the place this shot is set in, or an empty string" },
              props: { type: "array", items: { type: "string" }, description: "the keys of the props seen in this shot" },
              lighting: { type: "string", description: "the key of the lighting state the shot OPENS in, or an empty string" },
              links: { type: "array", description: "what this shot owes ANOTHER shot of the storyboard, by that shot's key from the outline — empty when the treatment ties it to nothing",
                items: { type: "object", additionalProperties: false, required: ["kind", "shot", "note"],
                  properties: {
                    kind: { type: "string", enum: [...LINK_KINDS] },
                    shot: { type: "string", description: "the other shot's key, exactly as the outline gives it" },
                    note: { type: "string", description: "the relationship in a few words: which screen, which door, which position" },
                  } } },
            } },
          cast: { type: "object", additionalProperties: false, required: ["members", "open", "none"],
            description: "who is in this shot. `members` names people from the People list by KEY with what each does here; `none` is true when no person is in the shot; `open` is true when people appear whom the treatment does not name (extras, a crowd) — their casting is left open on purpose",
            properties: {
              members: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "action", "placement", "framing"],
                properties: {
                  key: { type: "string", description: "the person's key, exactly as given in People" },
                  action: { type: "string", description: "what they do in THIS shot, one phrase" },
                  placement: { type: "string", description: "where they are in the frame and the place, one phrase" },
                  framing: { type: "string", description: "how the camera holds them here (wide, medium, close, from behind…), one phrase" },
                } } },
              open: { type: "boolean" },
              none: { type: "boolean" },
            } },
          production: { type: "object", additionalProperties: false, required: ["method", "note"],
            description: "how this shot gets made",
            properties: {
              method: { type: "string", enum: [...PRODUCTION_METHODS] },
              note: { type: "string", description: "the effect or constraint that decides the method, in one sentence; empty when the method is the obvious one" },
            } },
        } } },
    },
  },
} as const;

const line = (label: string, value: string | null | undefined) => (value && value.trim() ? `${label}:\n${value.trim()}` : null);

/** Everything the writer knows about the project, as labelled blocks. Empty fields are left out, never sent blank. */
export function contextBlocks(ctx: WriterContext): string {
  const looks = (ctx.looks ?? []).filter((l) => l?.name).slice(0, 12);
  return [
    line("Song", ctx.songTitle),
    line("The artist", ctx.artistProfile),
    line("Mood", ctx.mood),
    line(VISUAL_DIRECTION_LABEL, ctx.visualStyle),
    line(NOTES_LABEL, ctx.notes),
    ctx.analysis ? `The song, measured:\n${JSON.stringify(ctx.analysis)}` : null,
    // looks dress a GENERATED artist; with real footage he wears what he was filmed in
    !ctx.hasPerformanceFootage && looks.length ? `Wardrobe looks on file:\n${looks.map((l) => `- ${l.name}${l.description ? `: ${l.description}` : ""}`).join("\n")}` : null,
    line("Lyrics", ctx.lyrics),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * What the notes are to the writer. They hold two different things: facts about the footage (what was filmed, in
 * what, in which frame), which nothing can change — and the director's standing wishes about places, wardrobe and
 * content, which were written beside SOME treatment. When the treatment is replaced, those wishes are the older
 * decision. Told as one unbreakable block, the notes of the last concept overrule the new one ("reuse these places",
 * "never another outfit", "no logos") and the board comes back as the old video.
 */
export const NOTES_LABEL =
  "The director's notes and the real footage. What they say about the footage itself — what was filmed, what he wears in it, the frame — is fact. What they say about places, wardrobe and what may appear is the director's wish, and holds wherever the treatment does not say otherwise: where a note and the treatment disagree, the treatment is the later decision and the treatment wins";

/** The look the director set for the project. A look, not a list of places: the treatment says where the video is. */
export const VISUAL_DIRECTION_LABEL =
  "Visual direction — how the video should look and feel. Where it names places, wardrobe or things to show that the treatment does not, or that the treatment has replaced, the treatment decides and this is only the look";

/**
 * The treatment is the creative authority. The rules about footage below are how a video is cut when the treatment
 * leaves it open; they are not a second brief. Said last in the footage rules, and again where it bites.
 */
export const TREATMENT_DECIDES =
  "- The treatment decides. Where it says who is in a shot, where the shot is, what he wears there, or that the picture stays away from him for a stretch, write exactly that: these rules fill only what the treatment leaves open. Never swap something the treatment names for something easier or more usual.";

/**
 * How the writer casts a shot. The people are described once (the People list); a shot points at them by key and
 * says only what they do in it. Nobody is cast on the director's behalf: the artist is in a shot only where the
 * treatment puts him, and silence is never ambiguous (`none` / `open`).
 */
export const CAST_RULES = [
  "- `cast`: who is in the shot. `members` lists each person from the People list who is in it, by KEY, with what they do, where they are and how they are framed in THIS shot — never describe who they are again (that is on their record). The artist is a member only in the shots the treatment puts him in. `none: true` when no person is in the shot (a place, an object, animals). `open: true` when people the treatment does not name are in it (a crowd, extras, a crew) — their casting is left open on purpose. A person the treatment names who is not in People cannot be cast: write them into the scene and leave `members` without them.",
].join("\n");

/** How the writer chooses `production.method`. It says what the shot needs — not what is easy. */
export const PRODUCTION_RULES = [
  "- `production.method` — how this shot gets made, chosen from what the shot NEEDS, never from what would be easier:",
  "  footage = his real performance as filmed, place and clothes unchanged; restage = his real performance moved into the place you describe (his body and clothes are the take's); generate = a picture made from nothing (a world, an object, other people, animals); edit_footage = his real footage with something changed INSIDE it (an object in his mouth or hands moves, his clothes become a named garment); composite = his real performance cut out and laid over a made place; multi_shot = the moment only exists across a cut between this shot and a linked one (an interior that turns out to be inside a vehicle).",
  "  When the method is not the obvious one for the shot type, `production.note` says in one sentence what decides it.",
].join("\n");

const FOOTAGE_RULES = [
  "The project has the artist's REAL performance footage, in sync with the song. That footage is the spine of the video: a `performance` shot IS that footage — his real performance, as filmed or re-shot inside the place you describe.",
  "- For a performance shot write the PLACE he performs in and how the camera sees him there. He keeps the body position and framing he was filmed in (the notes say how), so put him where a man could be standing like that. He wears what the notes say he wears in the footage — unless the treatment itself dresses him in something else for that part of the video: then `wardrobe` is exactly what the treatment names, `wardrobe_from` is `treatment`, and the footage's clothes are never written in their place. (That shot cannot come from the footage as filmed; saying so is how the director finds out before anything is made.)",
  "- He appears in performance shots. Every other shot shows the world around him — places, objects, details, other people — and not his face, unless the treatment stages him in a scene of its own (watching, arriving, walking in): that shot is `narrative` and says what he does.",
  "- Cut it like a real music video: his performance carries the song, and the picture keeps leaving him and coming back. Of every three shots about two are performance and one is a cutaway. Never four performance shots in a row; never more than two cutaways in a row — except where the treatment lays out its own run of scenes (an opening before he appears, a sequence that stays with other people): there the treatment's order is the cut.",
  "- A cutaway goes where the words name something that can be shown — an object, a place, a move: show THAT thing, in the treatment's world. Where there are no words, a cutaway carries the section's mood.",
  "- Performance shots that follow each other may stay in one place, but each is a different frame of him — wide, medium, close on the face, low angle, profile, a slow push, a slow orbit — and you say which.",
  TREATMENT_DECIDES,
].join("\n");
const NO_FOOTAGE_RULES =
  "There is no real footage of the artist yet: a `performance` shot is him performing the words to camera in the place you describe, dressed in one of the looks on file.";

/** The system prompt of the call that writes the treatment itself. */
export function treatmentSystemPrompt(ctx: WriterContext): string {
  return [
    `You are the director of a ${projectLabel(ctx.projectType)}. Write its treatment: ONE idea, strong enough to hold the whole song, that a crew could shoot and a viewer would remember.`,
    "It must come out of this song's own words and this artist — not a stock idea that would fit any song. Stage it in a small number of places that return, so the video feels like one world. Everything must be photoreal and filmable.",
    ctx.hasPerformanceFootage ? FOOTAGE_RULES : NO_FOOTAGE_RULES,
    ctx.entities?.length ? `The project already has these places, props and lighting states on file — stage the video in them where they fit, by name:\n${ctx.entities.map((e) => `- ${e.name}${e.description ? `: ${e.description}` : ""}`).join("\n")}` : null,
    "Do not write shot lists, timecodes, or camera specs here. Do not mention AI, prompts or generators.",
    "A shot may change while it plays. When the idea needs that — the light dying on a word, a move that begins on a hit — say in plain words what changes and on which words; the storyboard places it on the song.",
    contextBlocks(ctx),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The system prompt of the calls that write the shots. `treatment` is the one brief every shot serves. */
export function shotsSystemPrompt(ctx: WriterContext, treatment: string, outline: readonly GridShot[], allotted = false): string {
  return [
    `You are the director of a ${projectLabel(ctx.projectType)}, writing its storyboard shot by shot inside the treatment below. The treatment is the one creative brief: every shot belongs to its world and moves its idea forward.`,
    `The treatment:\n${treatment.trim()}`,
    "You are handed some shots of the storyboard. Each has a fixed window on the song and the words sung in it. Write ONE scene for each, and return every shot you were handed, by its key, changing nothing about its timing.",
    [
      "How to write a shot:",
      "- `scene_description` is what the camera SEES, in one or two concrete sentences: who or what, where, doing what. No abstractions, no 'symbolising', no camera jargon. People are named by their names in prose, never by their KEYS (the key goes in `cast.members`, the name in the sentence).",
      "- When the shot has words, the picture answers THOSE words — name what they name, show what they claim. When it has none, it carries the mood of its section.",
      "- `shot_type`: performance = the artist delivering the words to camera; b_roll = an insert of the world (an object, a detail, a place); narrative = a staged moment with people; lyric_visual = the lyric made literally, physically real; transition = a move that carries one place into the next; vfx = something impossible, shot as if it happened.",
      "- Never write the same sentence for two shots, never stage the same picture twice in a row, and do not repeat a cutaway idea the song has already used. A person, animal, vehicle, object or place the treatment brings back on purpose is not a repeat: it returns as the SAME one, named in the same words every time, doing the next thing the treatment gives it.",
      "- What the treatment links across shots stays linked: a picture seen on a screen is the picture of the shot it names; a cut the treatment describes (the same position in a new place, a door that opens onto somewhere else, a reveal) is written into BOTH shots — the one that hands over says what it ends on, the one that receives opens on it.",
      "- Say every such tie in `continuity.links`, on the shot that owes it, naming the other shot by its key from the outline: `screen_shows` (a screen, monitor or reflection here shows that shot's picture), `match_position` (he or the subject holds the place in the frame it had there while the world around changes), `reveals` (this shot reveals what that shot was inside of or opening onto), `continues` (the same action carries on across the cut). Only shots of this storyboard; never a key you were not given.",
      PRODUCTION_RULES,
      CAST_RULES,
      allotted ? BEAT_RULES : null,
      "- A performance shot is its own picture too. He cannot be redirected — but the world around him can answer the words: say where in the place he stands in THIS shot and what the place and the light are doing around him. When its words name something the place can show or do, it happens there, on those words.",
      "- What the treatment says happens on certain words, or every time a section returns (in every hook), is binding on the shots: each shot in which those words are sung carries it — as a timed beat on those words when it happens inside the shot, as the state the shot opens in when it has already happened. A shot never contradicts the treatment.",
      "- Keep to the places the treatment names — and, where it leaves the place open, the ones the notes name. One clear subject per shot; a crowd, a formation or a group the treatment asks for IS the subject. Photoreal and filmable: an impossible event the treatment asks for is written as a thing that physically happens in front of the camera, never softened into something ordinary. No readable text or logos — except a mark the treatment itself calls for: name that one mark, where the treatment puts it, and nothing else.",
      "- `priority`: hero for the two or three shots the whole video is remembered by, high for the first shot of a hook, normal otherwise.",
    ].filter(Boolean).join("\n"),
    timedBeatsRules("scene_description"),
    entitiesBlock(ctx.entities),
    ctx.hasPerformanceFootage ? FOOTAGE_RULES : NO_FOOTAGE_RULES,
    `The whole storyboard, so you know what comes before and after your shots (context only — write only the shots you are handed):\n${outline.map(outlineLine).join("\n")}`,
    contextBlocks({ ...ctx, lyrics: null }),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function projectLabel(type: string | null | undefined): string {
  return type === "commercial" ? "commercial" : type === "social" ? "short social video" : "music video";
}

const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** One shot of the grid as a line of the outline. */
export function outlineLine(s: GridShot): string {
  const words = (s.lyrics ?? "").replace(/\s+/g, " ").trim();
  return `${s.key} ${clock(s.start)}–${clock(s.end)} [${s.section || "—"}${s.energy ? `, ${s.energy}` : ""}] ${words ? `"${words}"` : "(no words)"}`;
}

/** The shots handed to one call — each with its beat of the treatment when the board was allotted (beats.ts). */
export function shotsUserMessage(chunk: readonly GridShot[], briefs: Readonly<Record<string, ShotBrief>> = {}): string {
  return JSON.stringify({ shots: chunk.map((s) => briefedShot(s, briefs[s.key])) });
}

const sceneKey = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * The shots whose scene is, word for word, the scene of a shot before them. The runs are written at once and none
 * sees another's sentences, so a writer asked for forty shots hands back the same sentence many times ("he stands on
 * the runway facing forward, delivering the line…"): those are found here and asked for again, once. The first shot
 * of every such group keeps its sentence.
 */
export function repeatedScenes(clips: readonly Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of clips) {
    const k = sceneKey(c.scene_description);
    if (!k) continue;
    if (seen.has(k)) out.push(String(c.key ?? ""));
    else seen.add(k);
  }
  return out.filter(Boolean);
}

/** The second ask for shots that came back with a sentence another shot already has. */
export function rewriteUserMessage(chunk: readonly GridShot[], used: readonly string[], briefs: Readonly<Record<string, ShotBrief>> = {}): string {
  return JSON.stringify({
    note: "These shots came back with a scene another shot of this storyboard already has, word for word. Write each again as its own picture — what is different in THIS shot: where he is in the place, what the place and the light do around him on its words, what the camera sees. None may repeat a sentence below.",
    sentences_already_used: [...new Set(used.map((u) => u.trim()).filter(Boolean))].slice(0, 60),
    shots: chunk.map((s) => briefedShot(s, briefs[s.key])),
  });
}

/**
 * The board after the second ask: a rewritten shot replaces the repeated one only when its new scene is a sentence no
 * shot has (a repeat handed back again is left as it was — nothing is invented to make it differ).
 */
export function withRewrites(clips: readonly Record<string, unknown>[], rewrites: readonly Record<string, unknown>[]): { clips: Record<string, unknown>[]; replaced: string[] } {
  const used = new Set(clips.map((c) => sceneKey(c.scene_description)));
  const byKey = new Map<string, Record<string, unknown>>();
  for (const r of rewrites) {
    const k = sceneKey(r.scene_description);
    if (!k || used.has(k)) continue;
    used.add(k);
    byKey.set(String(r.key ?? ""), r);
  }
  return { clips: clips.map((c) => byKey.get(String(c.key ?? "")) ?? c), replaced: [...byKey.keys()] };
}

/** The grid in runs of at most `size` shots, in order: each run is one call, so no call outlives the gateway. */
export function chunkGrid<T>(grid: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < grid.length; i += n) out.push(grid.slice(i, i + n));
  return out;
}

/** The shots a call returned, kept only when they are shots it was handed (a key it invented is dropped). */
export function acceptShots(
  chunk: readonly GridShot[],
  returned: unknown,
  entities: readonly WriterEntity[] = [],
  /** Every key of the board — a link may point outside the chunk, never outside the board. Default: the chunk's. */
  boardKeys: readonly string[] = chunk.map((s) => s.key),
): { clips: Record<string, unknown>[]; missing: string[] } {
  const board = new Set(boardKeys);
  const keysOf = (kind: WriterEntity["kind"]) => new Set(entities.filter((e) => e.kind === kind).map((e) => e.key));
  const places = keysOf("location");
  const props = keysOf("prop");
  const lights = keysOf("lighting");
  const people = keysOf("character");
  // a reference is kept only when it is to an entity the project has, of the right kind — a key the model made up is dropped
  const continuityOf = (raw: unknown) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const one = (v: unknown, known: Set<string>) => (typeof v === "string" && known.has(v.trim()) ? v.trim() : "");
    return {
      location: one(r.location, places),
      props: Array.isArray(r.props) ? [...new Set(r.props.map((p) => one(p, props)).filter(Boolean))] : [],
      lighting: one(r.lighting, lights),
      links: acceptLinks(r.links, board, String((raw as { key?: unknown })?.key ?? "")),
    };
  };
  const wanted = new Set(chunk.map((s) => s.key));
  const list = Array.isArray((returned as { clips?: unknown })?.clips) ? ((returned as { clips: unknown[] }).clips as Record<string, unknown>[]) : [];
  const seen = new Set<string>();
  const seconds = new Map(chunk.map((s) => [s.key, s.end - s.start]));
  const clips = list
    .filter((c) => {
      const key = String(c?.key ?? "");
      if (!wanted.has(key) || seen.has(key)) return false;
      if (!String(c.scene_description ?? "").trim()) return false;
      seen.add(key);
      return true;
    })
    // a shot's timed beats are kept only when they are beats inside ITS window (never repaired, never invented)
    .map((c) => ({
      ...c,
      timed_beats: acceptTimedBeats(c.timed_beats, seconds.get(String(c.key)) ?? 0, lights),
      continuity: continuityOf({ ...((c.continuity ?? {}) as Record<string, unknown>), key: c.key }),
      cast: acceptCast(c.cast, people),
      production: acceptProduction(c.production),
    }));
  return { clips, missing: chunk.map((s) => s.key).filter((k) => !seen.has(k)) };
}

/** A shot's links, kept only when they are a known kind pointing at ANOTHER shot of the board (an invented key is dropped). */
export function acceptLinks(raw: unknown, board: ReadonlySet<string>, self: string): { kind: string; shot: string; note: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { kind: string; shot: string; note: string }[] = [];
  for (const l of raw.slice(0, 8)) {
    const r = (l ?? {}) as Record<string, unknown>;
    const kind = LINK_KINDS.find((k) => k === r.kind);
    const shot = typeof r.shot === "string" ? r.shot.trim() : "";
    if (!kind || !shot || shot === self || !board.has(shot) || out.some((o) => o.kind === kind && o.shot === shot)) continue;
    out.push({ kind, shot, note: typeof r.note === "string" ? r.note.trim().slice(0, 240) : "" });
  }
  return out;
}

/** A shot's production method, kept only when it is one of the known words ("" = not said). */
export function acceptProduction(raw: unknown): { method: string; note: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const method = PRODUCTION_METHODS.find((m) => m === r.method) ?? "";
  return { method, note: method && typeof r.note === "string" ? r.note.trim().slice(0, 400) : "" };
}

/**
 * The shots a link touches, from either end, with the keys of their partners. The runs are written at once and none
 * sees another's sentences, so a shot that hands over to a shot in another run cannot know what that shot opens on:
 * these are written again, once, beside their partners' scenes (`linkUserMessage`).
 */
export function linkedShots(clips: readonly Record<string, unknown>[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!out.has(a)) out.set(a, new Set());
    out.get(a)!.add(b);
  };
  for (const c of clips) {
    const key = String(c.key ?? "");
    const links = ((c.continuity as { links?: { shot: string }[] } | undefined)?.links ?? []) as { shot: string }[];
    for (const l of links) {
      add(key, l.shot);
      add(l.shot, key);
    }
  }
  return out;
}

/** The second ask for linked shots: each is written again knowing the scene of every shot it is tied to. */
export function linkUserMessage(chunk: readonly GridShot[], clips: readonly Record<string, unknown>[], partners: ReadonlyMap<string, ReadonlySet<string>>, briefs: Readonly<Record<string, ShotBrief>> = {}): string {
  const byKey = new Map(clips.map((c) => [String(c.key ?? ""), c]));
  const scene = (k: string) => {
    const c = byKey.get(k);
    return c ? { key: k, scene_description: String(c.scene_description ?? ""), links: (c.continuity as { links?: unknown } | undefined)?.links ?? [] } : { key: k, scene_description: "(not written)", links: [] };
  };
  return JSON.stringify({
    note: "These shots are tied to other shots of this storyboard (a screen that shows another shot, a held position across a cut, a reveal, an action that carries on). They were written without seeing those shots. Write each again so that BOTH ends of every tie agree: what a screen shows is that shot's picture; what one shot ends on, the next opens on. Keep every tie in `continuity.links`. The linked shots' current scenes are below — do not rewrite them here.",
    linked_shots: [...new Set(chunk.flatMap((s) => [...(partners.get(s.key) ?? [])]))].filter((k) => !chunk.some((s) => s.key === k)).map(scene),
    current: chunk.map((s) => scene(s.key)),
    shots: chunk.map((s) => briefedShot(s, briefs[s.key])),
  });
}

/**
 * A shot's cast, kept only for people the variation has (a key the model made up is dropped, never invented into a
 * character). `open` and `none` are kept as said; both true is contradictory and read as `none`.
 */
export function acceptCast(raw: unknown, people: ReadonlySet<string>): { members: { key: string; action: string; placement: string; framing: string }[]; open: boolean; none: boolean } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const members: { key: string; action: string; placement: string; framing: string }[] = [];
  const phrase = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 240) : "");
  if (Array.isArray(r.members)) {
    for (const m of r.members.slice(0, 12)) {
      const o = (m ?? {}) as Record<string, unknown>;
      const key = typeof o.key === "string" ? o.key.trim() : "";
      if (!key || !people.has(key) || members.some((x) => x.key === key)) continue;
      members.push({ key, action: phrase(o.action), placement: phrase(o.placement), framing: phrase(o.framing) });
    }
  }
  const none = r.none === true && members.length === 0;
  return { members, open: r.open === true && !none, none };
}
