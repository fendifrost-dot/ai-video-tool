// treatment-writer-proxy — the treatment's beats, and how the storyboard's shots are allotted to them.
//
// A treatment is a sequence of things that must happen, in order. Before any shot is written, that sequence is
// read out of the text ONCE (one small model call, `BEATS_SCHEMA`), checked here against what the project has
// (people by key, the words of the song), and the grid's shots are allotted to the beats by code — so a run of
// shots written in parallel cannot spend the whole board on the first scene and lose the ones after it, and so a
// person the treatment puts in a scene, a garment it names for it, and a cut it ties to another scene reach the
// shots that carry that scene. Nothing here is specific to any treatment, song or project.

import type { GridShot, WriterEntity } from "./contract.ts";

export const BEAT_TIE_KINDS = ["screen_shows", "match_position", "reveals", "continues"] as const;
export type BeatTieKind = (typeof BEAT_TIE_KINDS)[number];

/** One beat of the treatment, as the writer must respect it. */
export type Beat = {
  id: string;
  title: string;
  /** Where it happens, in the treatment's own words. */
  scene: string;
  /** What happens, in the treatment's own words, in order. */
  action: string;
  /** People of the variation (by key) the treatment puts in this beat. */
  people: string[];
  /** The treatment puts people in it whom the project has no record for (a crowd, models, a crew, a janitor…). */
  unnamedPeople: boolean;
  /** The artist performs the song to camera in this beat. */
  artistPerforms: boolean;
  /** What the artist wears here, in the treatment's own words ("" = the treatment does not say). */
  wardrobe: string;
  /** The words of the song the treatment ties this beat to, verbatim ("" = none). */
  lyricCue: string;
  /** How this beat is cut from an earlier one. */
  ties: { kind: BeatTieKind; to: string; note: string }[];
  /** Its share of the shots between its anchors, 1–5. */
  weight: number;
};

export const BEATS_SCHEMA = {
  name: "treatment_beats",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["beats"],
    properties: {
      beats: { type: "array", items: { type: "object", additionalProperties: false,
        required: ["id", "title", "scene", "action", "people", "unnamed_people", "artist_performs", "wardrobe", "lyric_cue", "ties", "weight"],
        properties: {
          id: { type: "string", description: "a short key for this beat: b01, b02, … in order" },
          title: { type: "string", description: "the beat in a few words (the treatment's own heading where it has one)" },
          scene: { type: "string", description: "where it happens, in the treatment's words — one sentence" },
          action: { type: "string", description: "what happens in it, in order, in the treatment's words — the things a shot of it must show" },
          people: { type: "array", items: { type: "string" }, description: "keys from People of everyone the treatment puts in this beat; the artist's key when he is in it" },
          unnamed_people: { type: "boolean", description: "true when the treatment puts people in it that People does not list" },
          artist_performs: { type: "boolean", description: "true when the artist performs the song to camera in this beat" },
          wardrobe: { type: "string", description: "what the artist wears here, exactly as the treatment names it; empty when it does not say or he is not in it" },
          lyric_cue: { type: "string", description: "the words of the song the treatment ties this beat to, copied verbatim; empty when it names none" },
          ties: { type: "array", description: "how this beat is cut from an EARLIER beat: a screen here shows that beat's picture; the subject holds its frame position from there; this reveals what that was inside of; the action continues from it",
            items: { type: "object", additionalProperties: false, required: ["kind", "to", "note"],
              properties: {
                kind: { type: "string", enum: [...BEAT_TIE_KINDS] },
                to: { type: "string", description: "the earlier beat's id" },
                note: { type: "string", description: "which screen, which door, which position — a few words" },
              } } },
          weight: { type: "integer", minimum: 1, maximum: 5, description: "how much of the song this beat deserves next to its neighbours: 1 a glimpse, 3 a scene, 5 a long sequence" },
        } } },
    },
  },
} as const;

/** The system prompt of the call that reads the beats out of the treatment. */
export function beatsSystemPrompt(people: readonly WriterEntity[], hasPerformanceFootage: boolean): string {
  const list = people.filter((p) => p.kind === "character");
  return [
    "You read a music-video treatment and list its beats: every scene or moment it describes, in the order it describes them, each with what the camera must show there. You invent nothing and leave nothing out: a beat the treatment describes — a place, an arrival, a reveal, a cut to somewhere else, an animal, a crew, a screen showing something — is a beat even when it is one sentence. A beat is one place and one continuous stretch of action; a new place or a cut the treatment describes starts a new beat.",
    "Keep the treatment's own words for `scene`, `action` and `wardrobe`. Where the treatment says certain words of the song are sung at a beat, copy those words verbatim into `lyric_cue`. Where it cuts from one beat to another by a device — a picture on a screen, the same position in a new place, a door that opens onto a reveal, an action that carries on — say so in `ties` on the LATER beat.",
    list.length
      ? ["People (the project's record of who can be in a shot, by key). Put a beat's people in 'people' by these keys; a person the treatment describes who is not here is 'unnamed_people':", ...list.map((p) => `- ${p.key} — ${p.name}${p.description ? `: ${p.description}` : ""}`)].join("\n")
      : "The project has no people on record: every person is 'unnamed_people'.",
    hasPerformanceFootage ? "The artist's performance to camera is real footage; `artist_performs` is true where the treatment has him perform the words." : null,
    "Reply with the beats only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The beats a call returned, cleaned: known people only, ties to beats that come before, ids made unique. */
export function acceptBeats(raw: unknown, people: readonly WriterEntity[]): Beat[] {
  const known = new Set(people.filter((p) => p.kind === "character").map((p) => p.key));
  const list = Array.isArray((raw as { beats?: unknown })?.beats) ? ((raw as { beats: unknown[] }).beats as Record<string, unknown>[]) : [];
  const out: Beat[] = [];
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  for (const r of list.slice(0, 80)) {
    const action = str(r.action, 1200);
    const scene = str(r.scene, 400);
    if (!action && !scene) continue;
    let id = str(r.id, 24) || `b${String(out.length + 1).padStart(2, "0")}`;
    if (out.some((b) => b.id === id)) id = `${id}_${out.length + 1}`;
    const earlier = new Set(out.map((b) => b.id));
    const ties = Array.isArray(r.ties)
      ? (r.ties as Record<string, unknown>[])
          .map((t) => ({ kind: BEAT_TIE_KINDS.find((k) => k === t?.kind) ?? null, to: str(t?.to, 24), note: str(t?.note, 240) }))
          .filter((t): t is { kind: BeatTieKind; to: string; note: string } => !!t.kind && earlier.has(t.to))
      : [];
    const weightRaw = Number(r.weight);
    out.push({
      id,
      title: str(r.title, 120) || scene.slice(0, 60) || `Beat ${out.length + 1}`,
      scene,
      action,
      people: Array.isArray(r.people) ? [...new Set((r.people as unknown[]).map((p) => str(p, 60)).filter((p) => known.has(p)))] : [],
      unnamedPeople: r.unnamed_people === true,
      artistPerforms: r.artist_performs === true,
      wardrobe: str(r.wardrobe, 300),
      lyricCue: str(r.lyric_cue, 300),
      ties,
      weight: Number.isFinite(weightRaw) ? Math.min(5, Math.max(1, Math.round(weightRaw))) : 3,
    });
  }
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * The first shot of the grid whose words contain the cue (or the cue's first four words — a treatment quotes a line,
 * a shot may hold only part of it), looking from `from` onward. -1 when the song never sings it after that point.
 */
export function cueIndex(grid: readonly GridShot[], cue: string, from = 0): number {
  const c = norm(cue);
  if (!c) return -1;
  const head = c.split(" ").slice(0, 4).join(" ");
  for (const needle of [c, head]) {
    if (needle.split(" ").length < 2 && needle !== c) continue;
    for (let i = Math.max(0, from); i < grid.length; i++) {
      const words = norm(grid[i].lyrics ?? "");
      if (words && words.includes(needle)) return i;
    }
  }
  return -1;
}

export type Allocation = {
  /** The beat each shot carries, by shot key (a shot with no beat: the beats ran out before the grid did). */
  byShot: Record<string, string>;
  /** The shots of each beat, in order. */
  byBeat: Record<string, string[]>;
  /** Beats that got no shot: the grid has fewer shots than the treatment has beats, or an anchor left them no room. */
  uncovered: string[];
  /** Beats whose lyric cue was found on the song, with the shot it anchors to. */
  anchors: { beat: string; shot: string; cue: string }[];
  /** Beats whose cue was NOT found after the beat before it (the words are not sung there, or not at all). */
  unanchored: { beat: string; cue: string }[];
};

/**
 * The grid's shots allotted to the beats, in order. A beat with a cue the song sings is pinned to the first shot that
 * sings it (never earlier than the beat before it). Between two pins the shots are shared by weight, every beat
 * getting at least one while shots remain. Beats after the last pin share what is left the same way. The order of the
 * treatment is the order of the board; a beat never takes shots from the beats after it.
 */
export function allocateBeats(beats: readonly Beat[], grid: readonly GridShot[]): Allocation {
  const byShot: Record<string, string> = {};
  const byBeat: Record<string, string[]> = Object.fromEntries(beats.map((b) => [b.id, []]));
  const anchors: Allocation["anchors"] = [];
  const unanchored: Allocation["unanchored"] = [];
  if (beats.length === 0 || grid.length === 0) return { byShot, byBeat, uncovered: beats.map((b) => b.id), anchors, unanchored };

  // 1. pins: the earliest shot singing each cue, strictly increasing in beat order, never before the beat's own rank
  const pin: (number | null)[] = beats.map(() => null);
  let floor = -1;
  beats.forEach((b, i) => {
    if (!b.lyricCue) return;
    // strictly after the pin before it: two beats never share a shot
    const at = cueIndex(grid, b.lyricCue, Math.max(floor + 1, i));
    if (at < 0) {
      unanchored.push({ beat: b.id, cue: b.lyricCue });
      return;
    }
    pin[i] = at;
    floor = at;
    anchors.push({ beat: b.id, shot: grid[at].key, cue: b.lyricCue });
  });

  // 2. runs of beats between pins: a pinned beat opens its run at its pin; the run ends where the next pin begins
  //    (or where the grid ends); the run's shots are shared by weight. A gap before a pin (the song sings the cue
  //    later than the beats before it needed) stays with the last beat before it.
  const give = (beat: Beat, from: number, to: number) => {
    for (let n = from; n < to; n++) {
      byShot[grid[n].key] = beat.id;
      byBeat[beat.id].push(grid[n].key);
    }
  };
  let cursor = 0;
  let previous: Beat | null = null;
  let i = 0;
  while (i < beats.length) {
    let j = i + 1;
    while (j < beats.length && pin[j] === null) j++;
    const start = pin[i] !== null ? Math.max(cursor, pin[i] as number) : cursor;
    if (previous && start > cursor) give(previous, cursor, start);
    const end = j < beats.length ? Math.max(start, pin[j] as number) : grid.length;
    const run = beats.slice(i, j);
    const shares = share(run.map((b) => b.weight), end - start);
    let at = start;
    run.forEach((b, k) => {
      give(b, at, at + shares[k]);
      at += shares[k];
    });
    cursor = Math.max(cursor, at, end);
    previous = [...run].reverse().find((b) => byBeat[b.id].length > 0) ?? previous;
    i = j;
  }
  if (previous && cursor < grid.length) give(previous, cursor, grid.length);
  return { byShot, byBeat, uncovered: beats.filter((b) => byBeat[b.id].length === 0).map((b) => b.id), anchors, unanchored };
}

/** `count` shots shared by weight, each weight getting at least one while shots remain, the rest by largest remainder. */
export function share(weights: readonly number[], count: number): number[] {
  const n = weights.length;
  if (n === 0 || count <= 0) return weights.map(() => 0);
  if (count <= n) return weights.map((_, k) => (k < count ? 1 : 0));
  const total = weights.reduce((a, b) => a + b, 0) || n;
  const exact = weights.map((w) => 1 + ((count - n) * w) / total);
  const base = exact.map((e) => Math.floor(e));
  let left = count - base.reduce((a, b) => a + b, 0);
  const order = exact.map((e, k) => ({ k, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.k - b.k);
  for (const o of order) {
    if (left <= 0) break;
    base[o.k]++;
    left--;
  }
  return base;
}

/** What a shot must carry for its beat, as the writer is told it and as the board is checked against. */
export type ShotBrief = {
  beat: string;
  title: string;
  scene: string;
  action: string;
  people: string[];
  unnamedPeople: boolean;
  artistPerforms: boolean;
  wardrobe: string;
  /** This shot opens the beat (a tie from an earlier beat lands here). */
  first: boolean;
  /** This shot closes the beat (a later beat's tie points at it). */
  last: boolean;
  /** The ties this shot must say in `continuity.links`, resolved to shot keys. */
  links: { kind: BeatTieKind; shot: string; note: string }[];
};

/** The brief of every allotted shot: the beat's facts, and the links its ties resolve to (first shot ← last shot of the earlier beat). */
export function shotBriefs(beats: readonly Beat[], allocation: Allocation): Record<string, ShotBrief> {
  const out: Record<string, ShotBrief> = {};
  const byId = new Map(beats.map((b) => [b.id, b]));
  for (const b of beats) {
    const shots = allocation.byBeat[b.id] ?? [];
    shots.forEach((key, n) => {
      const first = n === 0;
      const links = first
        ? b.ties.flatMap((t) => {
            const target = allocation.byBeat[t.to] ?? [];
            const to = target[target.length - 1];
            return to && byId.has(t.to) ? [{ kind: t.kind, shot: to, note: t.note }] : [];
          })
        : [];
      out[key] = { beat: b.id, title: b.title, scene: b.scene, action: b.action, people: b.people, unnamedPeople: b.unnamedPeople, artistPerforms: b.artistPerforms, wardrobe: b.wardrobe, first, last: n === shots.length - 1, links };
    });
  }
  return out;
}

export type Coverage = {
  ok: boolean;
  beats: {
    id: string;
    title: string;
    shots: string[];
    /** People the beat puts in it, and the shots of the beat that cast each; empty = nobody cast them. */
    people: { key: string; castIn: string[] }[];
    /** Shots of a beat WITH people that came back `none: true` — a scene with people silently written empty. */
    emptied: string[];
    ties: { kind: BeatTieKind; to: string; fromShot: string | null; toShot: string | null; present: boolean }[];
  }[];
  uncoveredBeats: string[];
  /** People a beat names that no shot of the beat casts. */
  missingPeople: { beat: string; key: string }[];
  /** Ties the treatment states that no shot carries as a link. */
  missingLinks: { beat: string; kind: BeatTieKind; to: string }[];
  anchors: Allocation["anchors"];
  unanchored: Allocation["unanchored"];
};

/**
 * Whether the written shots carry the treatment: every beat has shots, every person a beat names is cast in one of
 * its shots, no shot of a peopled beat was emptied, every tie is a link from the beat's first shot to the earlier
 * beat's last. Said before anything is persisted; the director sees it beside the board.
 */
export function coverageOf(beats: readonly Beat[], allocation: Allocation, clips: readonly Record<string, unknown>[]): Coverage {
  const byKey = new Map(clips.map((c) => [String(c.key ?? ""), c]));
  const castOf = (key: string) => {
    const cast = (byKey.get(key)?.cast ?? {}) as { members?: { key: string }[]; none?: boolean };
    return { members: new Set((cast.members ?? []).map((m) => m.key)), none: cast.none === true };
  };
  const linksOf = (key: string) => (((byKey.get(key)?.continuity ?? {}) as { links?: { kind: string; shot: string }[] }).links ?? []);
  const missingPeople: Coverage["missingPeople"] = [];
  const missingLinks: Coverage["missingLinks"] = [];
  const rows = beats.map((b) => {
    const shots = allocation.byBeat[b.id] ?? [];
    const people = b.people.map((key) => {
      const castIn = shots.filter((s) => castOf(s).members.has(key));
      if (shots.length > 0 && castIn.length === 0) missingPeople.push({ beat: b.id, key });
      return { key, castIn };
    });
    const emptied = b.people.length > 0 || b.unnamedPeople ? shots.filter((s) => byKey.has(s) && castOf(s).none) : [];
    const ties = b.ties.map((t) => {
      const fromShot = shots[0] ?? null;
      const target = allocation.byBeat[t.to] ?? [];
      const toShot = target[target.length - 1] ?? null;
      const present = !!fromShot && !!toShot && linksOf(fromShot).some((l) => l.kind === t.kind && l.shot === toShot);
      if (!present) missingLinks.push({ beat: b.id, kind: t.kind, to: t.to });
      return { kind: t.kind, to: t.to, fromShot, toShot, present };
    });
    return { id: b.id, title: b.title, shots, people, emptied, ties };
  });
  return {
    ok: allocation.uncovered.length === 0 && missingPeople.length === 0 && missingLinks.length === 0 && rows.every((r) => r.emptied.length === 0),
    beats: rows,
    uncoveredBeats: allocation.uncovered,
    missingPeople,
    missingLinks,
    anchors: allocation.anchors,
    unanchored: allocation.unanchored,
  };
}

/**
 * The links the allocation requires, put on the clips that lack them. A tie is a fact of the treatment and of the
 * board's order — not a creative choice — so a shot that owes one carries it whether or not the writer wrote it.
 */
export function withRequiredLinks(clips: readonly Record<string, unknown>[], briefs: Readonly<Record<string, ShotBrief>>): Record<string, unknown>[] {
  return clips.map((c) => {
    const brief = briefs[String(c.key ?? "")];
    if (!brief || brief.links.length === 0) return c;
    const continuity = { ...((c.continuity ?? {}) as Record<string, unknown>) };
    const have = (Array.isArray(continuity.links) ? continuity.links : []) as { kind: string; shot: string; note: string }[];
    const links = [...have];
    for (const l of brief.links) if (!links.some((h) => h.kind === l.kind && h.shot === l.shot)) links.push({ kind: l.kind, shot: l.shot, note: l.note });
    return { ...c, continuity: { ...continuity, links } };
  });
}

/** The shots of a chunk as the writer is handed them: each with its window, its words and its beat. */
export function briefedShot(s: GridShot, brief: ShotBrief | undefined) {
  return {
    key: s.key,
    seconds: Math.round((s.end - s.start) * 10) / 10,
    section: s.section ?? "",
    energy: s.energy ?? "",
    lyrics: (s.lyrics ?? "").trim(),
    ...(brief
      ? {
          beat: {
            id: brief.beat,
            title: brief.title,
            scene: brief.scene,
            action: brief.action,
            people: brief.people,
            unnamed_people: brief.unnamedPeople,
            artist_performs: brief.artistPerforms,
            wardrobe: brief.wardrobe,
            position: brief.first && brief.last ? "the only shot of this beat" : brief.first ? "opens this beat" : brief.last ? "closes this beat" : "inside this beat",
            must_link: brief.links,
          },
        }
      : {}),
  };
}

/** What the writer is told about beats, once, in the system prompt. */
export const BEAT_RULES = [
  "Each shot you are handed carries its `beat`: the part of the treatment it belongs to — where it is, what happens there, who the treatment puts in it, what he wears. Write the shot INSIDE that beat and nowhere else: not the beat before, not the one after, however the words of the song might tempt you. The beats are in the treatment's order; the board follows it.",
  "- A shot of a beat with `people` casts them: each of them in `cast.members` by key, with what they do in this shot. A shot of a beat with people is never `none: true`. Where a beat has several shots, each shot may hold a different one of its moments, but its people stay its people.",
  "- `wardrobe` of the beat is the artist's wardrobe in every shot of it he is in, in those words, with `wardrobe_from: treatment`.",
  "- `must_link` are ties the treatment states: say each one in `continuity.links` exactly as given (kind, shot) — the shot that opens the beat carries it, and its picture answers it (a screen shows that shot's picture; he holds the frame position that shot ends on; this reveals what that one was inside of).",
  "- A shot that `opens this beat` is where the beat's first thing happens; one that `closes this beat` is where its last thing happens; the shots between carry the rest in order.",
].join("\n");
