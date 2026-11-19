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

export type BeatTie = { kind: BeatTieKind; to: string; note: string; words: string };

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
  /** How this beat is cut from an earlier one — with the treatment's own words that state it. */
  ties: BeatTie[];
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
            items: { type: "object", additionalProperties: false, required: ["kind", "to", "note", "words"],
              properties: {
                kind: { type: "string", enum: [...BEAT_TIE_KINDS] },
                to: { type: "string", description: "the earlier beat's id" },
                note: { type: "string", description: "which screen, which door, which position — a few words" },
                words: { type: "string", description: "the treatment's own sentence that states this cut, copied verbatim" },
              } } },
          weight: { type: "integer", minimum: 1, maximum: 5, description: "how much of the song this beat deserves next to its neighbours: 1 a glimpse, 3 a scene, 5 a long sequence" },
        } } },
    },
  },
} as const;

/** How a montage treatment is read: a scene per quoted line, each its own beat, the quoted words its cue. */
export const MONTAGE_READING =
  "This treatment is a montage: a run of short scenes, each sitting on words of the song that it quotes (\"When he raps '…'\", \"On '…'\"). Every such scene is its own beat, however short — never fold two quoted lines into one beat — with the quoted words copied verbatim into `lyric_cue` and `weight` 1. A paragraph that only states the style, the through-line or a rule for the whole video is not a beat.";

/** The system prompt of the call that reads the beats out of the treatment. */
export function beatsSystemPrompt(people: readonly WriterEntity[], hasPerformanceFootage: boolean, montage = false): string {
  const list = people.filter((p) => p.kind === "character");
  return [
    "You read a music-video treatment and list its beats: every scene or moment it describes, in the order it describes them, each with what the camera must show there. You invent nothing and leave nothing out: a beat the treatment describes — a place, an arrival, a reveal, a cut to somewhere else, an animal, a crew, a screen showing something — is a beat even when it is one sentence. A beat is one place and one continuous stretch of action; a new place or a cut the treatment describes starts a new beat. Never fold several scenes into one beat: a treatment of many paragraphs has many beats, and a beat that would need many sentences of `action` is several beats.",
    "Keep the treatment's own words for `scene`, `action` and `wardrobe`. Where the treatment says certain words of the song are sung at a beat, copy those words verbatim into `lyric_cue`. Where it cuts from one beat to another by a device, say so in `ties` on the LATER beat, with the kind that names the device: `screen_shows` when a television, monitor, screen or reflection in this beat shows the earlier beat's picture (a pull-back from an image playing on a set is this); `match_position` when a person or thing keeps the earlier beat's place in the frame while the world around changes; `reveals` when this beat shows what the earlier beat was inside of or opening onto (a door, a vehicle); `continues` when the same action carries on across the cut. One tie per device; a beat may have none.",
    list.length
      ? ["People (the project's record of who can be in a shot, by key). Put a beat's people in 'people' by these keys; a person the treatment describes who is not here is 'unnamed_people':", ...list.map((p) => `- ${p.key} — ${p.name}${p.description ? `: ${p.description}` : ""}`)].join("\n")
      : "The project has no people on record: every person is 'unnamed_people'.",
    hasPerformanceFootage ? "The artist's performance to camera is real footage; `artist_performs` is true where the treatment has him perform the words." : null,
    montage ? MONTAGE_READING : null,
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
          .map((t) => ({ kind: BEAT_TIE_KINDS.find((k) => k === t?.kind) ?? null, to: str(t?.to, 24), note: str(t?.note, 240), words: str(t?.words, 400) }))
          .filter((t): t is BeatTie => !!t.kind && earlier.has(t.to))
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

/**
 * The kind a cut's words state, read deterministically — the check a model's typing is held against. A picture that
 * plays on a television, monitor, screen or in a reflection is `screen_shows`; the same position in the frame while
 * the place changes is `match_position`; a door, an exterior that shows what an interior was inside of, is
 * `reveals`; an action that carries on, a sound that lands, is `continues`. Null when the words say none of these.
 */
export function tieKindFromWords(words: string): BeatTieKind | null {
  const w = ` ${norm(words)} `;
  const has = (...res: RegExp[]) => res.some((r) => r.test(w));
  if (has(/\b(television|tv|crt|monitor|monitors|screen|screens|broadcast camera|playing on|reflection|security footage)\b/)) return "screen_shows";
  if (has(/\b(same position|position in the frame|place in the frame|holds? the frame|occupies the same)\b/)) return "match_position";
  if (has(/\b(door|doorway|opens onto|opening door|inside of|step(s|ped)? (down|out)|exterior|reveal(s|ed)?|turns out)\b/)) return "reveals";
  if (has(/\b(continues?|carries on|carry on|lands with|completes|follow(s)? through|same action)\b/)) return "continues";
  return null;
}

export type TieCorrection = { beat: string; to: string; from: BeatTieKind; kind: BeatTieKind; words: string };

/**
 * Ties retyped from their own words where the words state another kind than the model chose — deterministic, and
 * every change reported. A tie whose words state no kind keeps the model's.
 */
export function normalizeTieKinds(beats: readonly Beat[]): { beats: Beat[]; corrections: TieCorrection[] } {
  const corrections: TieCorrection[] = [];
  const out = beats.map((b) => ({
    ...b,
    ties: b.ties.map((t) => {
      const stated = tieKindFromWords(`${t.words} ${t.note}`);
      if (stated && stated !== t.kind) {
        corrections.push({ beat: b.id, to: t.to, from: t.kind, kind: stated, words: t.words || t.note });
        return { ...t, kind: stated };
      }
      return t;
    }),
  }));
  // the same device named twice (once mistyped) collapses to one tie
  for (const b of out) b.ties = b.ties.filter((t, i) => b.ties.findIndex((x) => x.kind === t.kind && x.to === t.to) === i);
  return { beats: out, corrections };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** The grid's sung words in order, each with the index of the shot that sings it. */
function wordStream(grid: readonly GridShot[]): { w: string; shot: number }[] {
  const out: { w: string; shot: number }[] = [];
  grid.forEach((g, shot) => {
    for (const w of norm(g.lyrics ?? "").split(" ")) if (w) out.push({ w, shot });
  });
  return out;
}

/**
 * Every shot that sings the cue, in order — the shot singing most of its words when the cue straddles a cut (a shot's
 * lyrics are cut at its boundary word by word, so a line sung across two shots is in neither one's text whole) — or,
 * when the whole cue is sung nowhere, the shots singing its first four words (a treatment quotes a line, a shot may
 * hold only part of it).
 */
export function cueMatches(grid: readonly GridShot[], cue: string): number[] {
  const words = norm(cue).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const stream = wordStream(grid);
  const needles = [words];
  if (words.length > 4) needles.push(words.slice(0, 4));
  for (const needle of needles) {
    const found = new Set<number>();
    for (let s = 0; s + needle.length <= stream.length; s++) {
      let k = 0;
      while (k < needle.length && stream[s + k].w === needle[k]) k++;
      if (k < needle.length) continue;
      const count = new Map<number, number>();
      for (let m = 0; m < needle.length; m++) count.set(stream[s + m].shot, (count.get(stream[s + m].shot) ?? 0) + 1);
      let best = -1;
      let most = 0;
      for (const [shot, n] of count) if (n > most || (n === most && shot < best)) { best = shot; most = n; }
      found.add(best);
    }
    if (found.size) return [...found].sort((a, b) => a - b);
  }
  return [];
}

/** The first shot from `from` onward that sings the cue (see cueMatches); -1 when the song never sings it there. */
export function cueIndex(grid: readonly GridShot[], cue: string, from = 0): number {
  return cueMatches(grid, cue).find((i) => i >= Math.max(0, from)) ?? -1;
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
  /**
   * Beats not pinned to their cue: the song sings it only before the beat before it (`earlier`), never (`never`), or
   * only long before this beat's turn by the beats' weights (`early` — pinning there would crush the beats before it;
   * `shot` is where it is sung). An `earlier` or `early` cue gets a flash shot on its words instead (inserts).
   */
  unanchored: { beat: string; cue: string; sung: "earlier" | "never" | "early"; shot?: string }[];
  /**
   * A beat whose cue is sung only BEFORE its turn gets one shot there — a flash of it on its words — and continues in
   * full where the treatment's order puts it. Lyric synchronisation is kept without reordering the narrative; the
   * director sees every insert.
   */
  inserts: { beat: string; shot: string; cue: string; takenFrom: string }[];
  /**
   * Shots that carry no beat ON PURPOSE (montage style, `beatCap`): the song's words there have no scene of their own,
   * so the shot is his performance of them — never a repeat of the scene before or after it.
   */
  fill?: string[];
};

/** The most one scene of a montage may hold before the picture goes back to him: a few shots, a few seconds. */
export type BeatCap = { shots: number; seconds: number };
/** Fendi, 19 Nov 2026, on board `fa7f6b85`: one twist ran four shots and 6–7 s (the books, the radios, the ring). */
export const MONTAGE_BEAT_CAP: BeatCap = { shots: 2, seconds: 4.5 };

/**
 * Where each scene of a montage sits, given every shot that sings its words (`matches[i]`, ascending; empty = the
 * song never sings them). The pins must rise strictly in scene order — two scenes never share a shot — and the choice
 * keeps the MOST scenes: a scene whose words are also sung later (a hook) is never pinned to that later singing at the
 * price of the scenes between (review of 19 Nov 2026: "ice on my wrist", sung in the shot of the scene before it and
 * again in the hook, took the hook and dropped three verse scenes). Among equal counts the earlier singing wins.
 * Returns a shot index per scene, or null for a scene that could not be kept.
 */
export function pinScenes(matches: readonly (readonly number[])[]): (number | null)[] {
  type Node = { count: number; shot: number; scene: number; prev: Node | null };
  // best chain ending at each shot so far; `better` = more scenes, then an earlier end
  const byShot = new Map<number, Node>();
  // held in an object: assigned inside a callback, a bare `let` is narrowed to null by the type checker (Deno)
  const state: { best: Node | null } = { best: null };
  const better = (a: Node, b: Node | null) => !b || a.count > b.count || (a.count === b.count && a.shot < b.shot);
  matches.forEach((list, scene) => {
    const made: Node[] = [];
    for (const shot of list) {
      let prev: Node | null = null;
      for (const node of byShot.values()) if (node.shot < shot && better(node, prev)) prev = node;
      made.push({ count: (prev?.count ?? 0) + 1, shot, scene, prev });
    }
    // added only after every singing of THIS scene was weighed, so a scene is never chained to itself
    for (const node of made) {
      const held = byShot.get(node.shot);
      if (!held || node.count > held.count) byShot.set(node.shot, node);
      if (better(node, state.best)) state.best = node;
    }
  });
  const pins: (number | null)[] = matches.map(() => null);
  for (let node: Node | null = state.best; node; node = node.prev) pins[node.scene] = node.shot;
  return pins;
}

/**
 * The grid's shots allotted to the beats, in order. A beat with a cue the song sings is pinned to the first shot that
 * sings it (never earlier than the beat before it). Between two pins the shots are shared by weight, every beat
 * getting at least one while shots remain. Beats after the last pin share what is left the same way. The order of the
 * treatment is the order of the board; a beat never takes shots from the beats after it.
 */
export function allocateBeats(
  beats: readonly Beat[],
  grid: readonly GridShot[],
  options: {
    lyricInserts?: boolean;
    /**
     * Montage style: a scene sits ON its words or nowhere. The pins are chosen to keep the most scenes in the song's
     * order (pinScenes); there is no "too early to pin" rule and no flash insert. A scene whose words cannot be
     * placed gets NO shot (it is reported uncovered and unanchored) — it is never put on other words.
     */
    cueOrder?: boolean;
    /** Montage style: a beat he does not perform in keeps at most this much; what is left goes back to him (`fill`). */
    beatCap?: BeatCap | null;
  } = {},
): Allocation {
  const byShot: Record<string, string> = {};
  const byBeat: Record<string, string[]> = Object.fromEntries(beats.map((b) => [b.id, []]));
  const anchors: Allocation["anchors"] = [];
  const unanchored: Allocation["unanchored"] = [];
  const inserts: Allocation["inserts"] = [];
  const lyricInserts = options.lyricInserts !== false;
  if (beats.length === 0 || grid.length === 0) return { byShot, byBeat, uncovered: beats.map((b) => b.id), anchors, unanchored, inserts };

  // 1. pins: for each cue, the singing of it nearest the beat's turn by weight, strictly increasing in beat order and
  //    never before the beat's own rank. A singing long before that turn (before half-way to it) is not a pin — a pin
  //    there would leave the beats before it a handful of shots — but a flash of the beat on its words (step 3).
  const pin: (number | null)[] = beats.map(() => null);
  const totalWeight = beats.reduce((n, b) => n + b.weight, 0) || beats.length;
  let floor = -1;
  let weightBefore = 0;
  if (options.cueOrder) {
    const cued = beats.map((b, i) => ({ b, i })).filter((x) => x.b.lyricCue);
    const lists = cued.map((x) => cueMatches(grid, x.b.lyricCue));
    pinScenes(lists).forEach((at, n) => {
      const { b, i } = cued[n];
      if (at === null) unanchored.push({ beat: b.id, cue: b.lyricCue, sung: lists[n].length ? "earlier" : "never" });
      else {
        pin[i] = at;
        anchors.push({ beat: b.id, shot: grid[at].key, cue: b.lyricCue });
      }
    });
  }
  beats.forEach((b, i) => {
    if (options.cueOrder) return;
    const expected = Math.floor((grid.length * weightBefore) / totalWeight);
    weightBefore += b.weight;
    if (!b.lyricCue) return;
    const all = cueMatches(grid, b.lyricCue);
    // strictly after the pin before it: two beats never share a shot
    const hits = all.filter((x) => x >= Math.max(floor + 1, i));
    if (hits.length === 0) {
      unanchored.push({ beat: b.id, cue: b.lyricCue, sung: all.length ? "earlier" : "never" });
      return;
    }
    const at = hits.reduce((best, x) => (Math.abs(x - expected) < Math.abs(best - expected) ? x : best));
    if (at < Math.floor(expected / 2)) {
      unanchored.push({ beat: b.id, cue: b.lyricCue, sung: "early", shot: grid[at].key });
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
    // montage: a scene whose words could not be placed takes no shot of this run
    const run = beats.slice(i, j).filter((b, k) => !(options.cueOrder && b.lyricCue && pin[i + k] === null));
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

  // 3. inserts: a cue sung only before its beat's turn gets that one shot as a flash of the beat, taken from the beat
  //    that holds it — unless that would leave the holder with nothing
  if (lyricInserts && !options.cueOrder) {
    for (const u of unanchored) {
      if (u.sung === "never") continue;
      const at = u.shot ? grid.findIndex((g) => g.key === u.shot) : cueIndex(grid, u.cue, 0);
      if (at < 0) continue;
      const key = grid[at].key;
      const holder = byShot[key];
      // never from a beat left with nothing, and never a shot that is already another beat's flash (two cues sung in
      // one shot: the first keeps it; the second is reported as not placed on its words)
      if (!holder || holder === u.beat || byBeat[holder].length < 2 || inserts.some((i) => i.shot === key)) continue;
      byBeat[holder] = byBeat[holder].filter((k) => k !== key);
      byShot[key] = u.beat;
      byBeat[u.beat] = [key, ...byBeat[u.beat]];
      inserts.push({ beat: u.beat, shot: key, cue: u.cue, takenFrom: holder });
    }
  }
  // 4. the cap (montage style): a scene he does not perform in keeps its first shots, up to the cap; the rest of its
  //    run, and every shot no beat reached, carries no beat — it is his performance of the words sung there
  let fill: string[] | undefined;
  if (options.beatCap) {
    const cap = options.beatCap;
    const seconds = new Map(grid.map((g) => [g.key, Math.max(0, g.end - g.start)]));
    const flashes = new Set(inserts.map((i) => i.shot));
    for (const b of beats) {
      if (b.artistPerforms) continue;
      let kept = 0;
      let held = 0;
      // a scene keeps a RUN of shots from its first one: once a shot does not fit, nothing after it is kept either
      // (a later, shorter shot would put him between two halves of one scene)
      let closed = false;
      byBeat[b.id] = byBeat[b.id].filter((key) => {
        if (flashes.has(key)) return true;
        const length = seconds.get(key) ?? 0;
        const keep = !closed && (kept === 0 || (kept < Math.max(1, cap.shots) && held + length <= cap.seconds));
        if (keep) {
          kept++;
          held += length;
        } else {
          closed = true;
          delete byShot[key];
        }
        return keep;
      });
    }
    fill = grid.map((g) => g.key).filter((key) => !byShot[key]);
  }
  return { byShot, byBeat, uncovered: beats.filter((b) => byBeat[b.id].length === 0).map((b) => b.id), anchors, unanchored, inserts, ...(fill ? { fill } : {}) };
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
  /** A flash of the beat on its words, before the beat's own run (allocateBeats inserts). */
  insert: boolean;
  /**
   * No beat on purpose (allocation `fill`). `performance`: his real performance of the words sung here. `mood`: no
   * words are sung here, or the project has no footage of him — a plain shot of the world, never him rapping.
   */
  fill?: "performance" | "mood";
};

/** The brief of every allotted shot: the beat's facts, and the links its ties resolve to (first shot ← last shot of the earlier beat). */
export function shotBriefs(
  beats: readonly Beat[],
  allocation: Allocation,
  fillWith: { grid?: readonly GridShot[]; hasPerformanceFootage?: boolean } = {},
): Record<string, ShotBrief> {
  const out: Record<string, ShotBrief> = {};
  const byId = new Map(beats.map((b) => [b.id, b]));
  const inserted = new Set(allocation.inserts.map((i) => i.shot));
  for (const b of beats) {
    const all = allocation.byBeat[b.id] ?? [];
    const run = all.filter((k) => !inserted.has(k));
    all.forEach((key) => {
      const insert = inserted.has(key);
      const n = run.indexOf(key);
      const first = !insert && n === 0;
      const links = first
        ? b.ties.flatMap((t) => {
            const target = (allocation.byBeat[t.to] ?? []).filter((k) => !inserted.has(k));
            const to = target[target.length - 1];
            return to && byId.has(t.to) ? [{ kind: t.kind, shot: to, note: t.note }] : [];
          })
        : [];
      out[key] = { beat: b.id, title: b.title, scene: b.scene, action: b.action, people: b.people, unnamedPeople: b.unnamedPeople, artistPerforms: b.artistPerforms, wardrobe: b.wardrobe, first, last: !insert && n === run.length - 1, links, insert };
    });
  }
  const sung = new Map((fillWith.grid ?? []).map((g) => [g.key, (g.lyrics ?? "").trim().length > 0]));
  for (const key of allocation.fill ?? []) {
    if (out[key]) continue;
    // he performs only where there is real footage of him AND words to perform; anything else is a shot of the world
    const performs = fillWith.hasPerformanceFootage === true && sung.get(key) === true;
    out[key] = { beat: "", title: performs ? "His performance, between two scenes" : "The world, between two scenes", scene: "", action: "", people: [], unnamedPeople: false, artistPerforms: performs, wardrobe: "", first: false, last: false, links: [], insert: false, fill: performs ? "performance" : "mood" };
  }
  return out;
}

/** Methods that use the artist's real take: his body and action are the take's, so they can only show him performing. */
export const TAKE_METHODS: ReadonlySet<string> = new Set(["footage", "restage", "edit_footage", "composite"]);

export type ProductionCorrection = { shot: string; from: string; to: string; why: string };

/**
 * Production feasibility: a take-based method on a shot of a beat in which the artist does NOT perform (he sits, he
 * watches, he walks in) is infeasible — the take shows him rapping, and nothing moves a rapping take into a seated
 * man. Such a shot is re-routed to `generate` (drawn, with his identity pictures) and the change reported. Nothing
 * else about the shot changes.
 */
export function withFeasibleProduction(clips: readonly Record<string, unknown>[], briefs: Readonly<Record<string, ShotBrief>>): { clips: Record<string, unknown>[]; corrections: ProductionCorrection[] } {
  const corrections: ProductionCorrection[] = [];
  const out = clips.map((c) => {
    const key = String(c.key ?? "");
    const brief = briefs[key];
    const production = (c.production ?? {}) as { method?: string; note?: string };
    const method = String(production.method ?? "");
    if (!brief || brief.artistPerforms || !TAKE_METHODS.has(method)) return c;
    const why = brief.fill
      ? "no scene sits here and he does not perform here: a shot of the world, made, not cut from his take"
      : `the take shows him performing; in this beat he ${brief.action.slice(0, 80).replace(/\s+/g, " ") || "does something else"} — drawn with his identity pictures, not cut from the take`;
    corrections.push({ shot: key, from: method, to: "generate", why });
    return { ...c, production: { method: "generate", note: [production.note, why].filter(Boolean).join(" ") } };
  });
  return { clips: out, corrections };
}

/** The word-shingles of a text (three words in a row, normalised) — what two texts must share to be about the same thing. */
function shingles(text: string, n = 3): Set<string> {
  const words = norm(text).split(" ").filter((w) => w.length > 1);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

export type TreatmentAudit = { ok: boolean; paragraphs: number; uncovered: { index: number; text: string }[] };

/**
 * The extracted beats held against the treatment itself: every paragraph of the treatment that says something
 * (eight words or more) must share at least one three-word phrase with some beat's scene, action or title.
 * A paragraph no beat answers is a part of the treatment the beats left out — and complete coverage of an
 * incomplete beat list is not coverage of the treatment.
 */
/** The treatment's paragraphs of at least eight words — the units a reading is held against. */
export function paragraphsOf(treatment: string): string[] {
  return treatment.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.split(" ").length >= 8);
}

/**
 * The fewest beats a reading of the treatment may return without having folded scenes together: a quarter of its
 * paragraphs, at least three, at most twelve. Fewer, and the treatment is read again with that said.
 */
export function fewestBeats(treatment: string): number {
  return Math.min(12, Math.max(3, Math.ceil(paragraphsOf(treatment).length / 4)));
}

export function auditBeatsAgainstTreatment(treatment: string, beats: readonly Beat[]): TreatmentAudit {
  const paragraphs = paragraphsOf(treatment);
  const beatText = beats.map((b) => `${b.title}. ${b.scene} ${b.action}`).join("\n");
  const have = shingles(beatText);
  const uncovered: TreatmentAudit["uncovered"] = [];
  paragraphs.forEach((p, index) => {
    const mine = shingles(p);
    let hit = false;
    for (const sh of mine) if (have.has(sh)) { hit = true; break; }
    if (!hit) uncovered.push({ index, text: p.slice(0, 120) });
  });
  return { ok: uncovered.length === 0, paragraphs: paragraphs.length, uncovered };
}

export type Verdict = "pass" | "gaps" | "fail";

export type Coverage = {
  /** True only when every section passes with nothing to say. */
  ok: boolean;
  /** pass = nothing to say; gaps = the board carries the treatment but something was corrected, inserted or left unsynced; fail = something the treatment requires is not on the board. */
  verdict: Verdict;
  structural: {
    verdict: Verdict;
    beats: { id: string; title: string; shots: string[]; people: { key: string; castIn: string[]; onScreenIn: string[] }[]; emptied: string[] }[];
    uncoveredBeats: string[];
    missingPeople: { beat: string; key: string }[];
    /** Beats holding more than half the board (the reader folded several scenes into one). */
    lumped: { beat: string; shots: number; share: number }[];
    /** How many beats each reading of the treatment returned (a second reading is asked for when the first is too few). */
    readings: number[];
  };
  lyrics: {
    verdict: Verdict;
    anchors: Allocation["anchors"];
    inserts: Allocation["inserts"];
    unanchored: Allocation["unanchored"];
    /** Scenes the writer wrote and the board does not carry: their words could not be placed (montage). */
    dropped: { words: string; why: string }[];
  };
  relationships: {
    verdict: Verdict;
    ties: { beat: string; to: string; kind: BeatTieKind; statedKind: BeatTieKind | null; fromShot: string | null; toShot: string | null; typeOk: boolean; directionOk: boolean; targetOk: boolean; present: boolean }[];
    corrected: TieCorrection[];
    missing: { beat: string; kind: BeatTieKind; to: string }[];
    mistyped: { beat: string; kind: BeatTieKind; statedKind: BeatTieKind; to: string }[];
  };
  production: { verdict: Verdict; corrected: ProductionCorrection[] };
  treatment: TreatmentAudit & { verdict: Verdict };
  // the flat fields earlier readers use (same facts, one level up)
  beats: { id: string; title: string; shots: string[]; people: { key: string; castIn: string[]; onScreenIn: string[] }[]; emptied: string[]; ties: { kind: BeatTieKind; to: string; fromShot: string | null; toShot: string | null; present: boolean }[] }[];
  uncoveredBeats: string[];
  missingPeople: { beat: string; key: string }[];
  missingLinks: { beat: string; kind: BeatTieKind; to: string }[];
  anchors: Allocation["anchors"];
  unanchored: Allocation["unanchored"];
};

const worst = (...vs: Verdict[]): Verdict => (vs.includes("fail") ? "fail" : vs.includes("gaps") ? "gaps" : "pass");

/**
 * Whether the written shots carry the treatment, said in five parts so a board with a known failure never reads as
 * an unqualified pass: structural (every beat has shots, every named person is cast or shown on a screen, no peopled beat emptied), lyric
 * alignment (cues anchored, inserted, or not sung where the beat is), relationships (each tie's kind against its own
 * words, its direction, its target shot, and the link's presence), production feasibility (what was re-routed), and
 * the beats against the treatment's paragraphs.
 */
export function coverageOf(
  beats: readonly Beat[],
  allocation: Allocation,
  clips: readonly Record<string, unknown>[],
  extra: {
    treatment?: string;
    tieCorrections?: TieCorrection[];
    productionCorrections?: ProductionCorrection[];
    beatReadings?: number[];
    /** Scenes the writer wrote that could not be placed on their words and were left out (montage). */
    droppedScenes?: { words: string; why: string }[];
  } = {},
): Coverage {
  const byKey = new Map(clips.map((c) => [String(c.key ?? ""), c]));
  const inserted = new Set(allocation.inserts.map((i) => i.shot));
  const castOf = (key: string) => {
    const cast = (byKey.get(key)?.cast ?? {}) as { members?: { key: string }[]; none?: boolean };
    return { members: new Set((cast.members ?? []).map((m) => m.key)), none: cast.none === true };
  };
  const linksOf = (key: string) => (((byKey.get(key)?.continuity ?? {}) as { links?: { kind: string; shot: string }[] }).links ?? []);
  const order = new Map(beats.map((b, i) => [b.id, i]));
  const missingPeople: Coverage["missingPeople"] = [];
  const missingLinks: Coverage["missingLinks"] = [];
  const mistyped: Coverage["relationships"]["mistyped"] = [];
  const ties: Coverage["relationships"]["ties"] = [];
  const rows = beats.map((b) => {
    const shots = allocation.byBeat[b.id] ?? [];
    const run = shots.filter((k) => !inserted.has(k));
    const people = b.people.map((key) => {
      const castIn = shots.filter((s) => castOf(s).members.has(key));
      // seen on a screen instead: a shot of this beat whose screen shows a shot that casts them
      const onScreenIn = shots.filter((s) => linksOf(s).some((l) => l.kind === "screen_shows" && castOf(l.shot).members.has(key)));
      if (shots.length > 0 && castIn.length === 0 && onScreenIn.length === 0) missingPeople.push({ beat: b.id, key });
      return { key, castIn, onScreenIn };
    });
    const emptied = b.people.length > 0 || b.unnamedPeople ? shots.filter((s) => byKey.has(s) && castOf(s).none) : [];
    const beatTies = b.ties.map((t) => {
      const fromShot = run[0] ?? null;
      const target = (allocation.byBeat[t.to] ?? []).filter((k) => !inserted.has(k));
      const toShot = target[target.length - 1] ?? null;
      const statedKind = tieKindFromWords(`${t.words} ${t.note}`);
      const typeOk = statedKind === null || statedKind === t.kind;
      const directionOk = (order.get(t.to) ?? Infinity) < (order.get(b.id) ?? -1);
      const link = fromShot ? linksOf(fromShot).find((l) => l.shot === toShot) : undefined;
      const targetOk = !!toShot && !!link;
      const present = !!link && link.kind === t.kind;
      if (!present) missingLinks.push({ beat: b.id, kind: t.kind, to: t.to });
      if (!typeOk && statedKind) mistyped.push({ beat: b.id, kind: t.kind, statedKind, to: t.to });
      ties.push({ beat: b.id, to: t.to, kind: t.kind, statedKind, fromShot, toShot, typeOk, directionOk, targetOk, present });
      return { kind: t.kind, to: t.to, fromShot, toShot, present };
    });
    return { id: b.id, title: b.title, shots, people, emptied, ties: beatTies };
  });
  // a beat holding more than half the board while the treatment has several: the reader folded scenes into it
  const lumped = beats.length >= 3 ? rows.filter((r) => r.shots.length * 2 > clips.length).map((r) => ({ beat: r.id, shots: r.shots.length, share: Math.round((100 * r.shots.length) / Math.max(1, clips.length)) })) : [];
  const structuralVerdict: Verdict = allocation.uncovered.length || missingPeople.length || rows.some((r) => r.emptied.length) ? "fail" : lumped.length ? "gaps" : "pass";
  // scenes left out are never silent: any is a gap, and losing a third of them or more is a failure of the run
  const dropped = extra.droppedScenes ?? [];
  const droppedVerdict: Verdict = dropped.length === 0 ? "pass" : dropped.length * 3 >= dropped.length + beats.length ? "fail" : "gaps";
  const lyricsVerdict: Verdict = worst(
    allocation.unanchored.some((u) => u.sung !== "never" && !allocation.inserts.some((i) => i.beat === u.beat)) ? "fail" : allocation.unanchored.length || allocation.inserts.length ? "gaps" : "pass",
    droppedVerdict,
  );
  const relationshipsVerdict: Verdict = missingLinks.length || mistyped.length || ties.some((t) => !t.directionOk) ? "fail" : (extra.tieCorrections?.length ?? 0) ? "gaps" : "pass";
  const productionVerdict: Verdict = (extra.productionCorrections?.length ?? 0) ? "gaps" : "pass";
  const audit = extra.treatment ? auditBeatsAgainstTreatment(extra.treatment, beats) : { ok: true, paragraphs: 0, uncovered: [] };
  const treatmentVerdict: Verdict = audit.ok ? "pass" : "fail";
  const verdict = worst(structuralVerdict, lyricsVerdict, relationshipsVerdict, productionVerdict, treatmentVerdict);
  return {
    ok: verdict === "pass",
    verdict,
    structural: { verdict: structuralVerdict, beats: rows.map(({ ties: _t, ...r }) => r), uncoveredBeats: allocation.uncovered, missingPeople, lumped, readings: extra.beatReadings ?? [beats.length] },
    lyrics: { verdict: lyricsVerdict, anchors: allocation.anchors, inserts: allocation.inserts, unanchored: allocation.unanchored, dropped },
    relationships: { verdict: relationshipsVerdict, ties, corrected: extra.tieCorrections ?? [], missing: missingLinks, mistyped },
    production: { verdict: productionVerdict, corrected: extra.productionCorrections ?? [] },
    treatment: { ...audit, verdict: treatmentVerdict },
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
    ...(brief?.fill
      ? { between_scenes: brief.fill === "performance" ? BETWEEN_SCENES : BETWEEN_SCENES_MOOD }
      : brief
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
            position: brief.insert ? "a flash of this beat on its words — the beat continues in full later; show the one thing the words name" : brief.first && brief.last ? "the only shot of this beat" : brief.first ? "opens this beat" : brief.last ? "closes this beat" : "inside this beat",
            must_link: brief.links,
          },
        }
      : {}),
  };
}

/** What a shot with no scene of its own is told (montage style). */
export const BETWEEN_SCENES =
  "no scene of the treatment sits on these words: this shot is his performance of them — `shot_type` performance, him delivering these words to camera. It is never a repeat, a continuation or another angle of the scene before it or after it";

/** The same, where no words are sung or there is no footage of him: a shot of the world, not him and not a new twist. */
export const BETWEEN_SCENES_MOOD =
  "no scene of the treatment sits here and he does not perform here: one plain, real shot of the world of the scene nearest to it, in the montage's style, that carries the section's mood — nobody rapping, no new impossible event, and never a repeat, a continuation or another angle of the scene before it or after it";

/**
 * The paragraphs of a montage text that are scenes: the ones that OPEN by quoting sung words ("When he raps "…"",
 * "On '…'", "He raps ‘…’", or the quote itself first). A quote further in — a song title in the idea, a possessive
 * in the through-line — does not make a paragraph a scene, and the first paragraph (the idea) never is one. With no
 * such paragraph, every paragraph.
 */
export function montageSceneParagraphs(treatment: string): string[] {
  const all = paragraphsOf(treatment);
  // a short lead-in with no quote in it, then an opening quote (straight or curly, double or single), words, a closing quote
  const opener = /^(?:[^"“”‘’']{0,48}[\s—:,(-])?["“‘'][^"“”]{1,}?["”’'](?=[\s,.;:—)-]|$)/;
  const scenes = all.filter((p, i) => i > 0 && opener.test(p));
  return scenes.length ? scenes : all;
}

/**
 * The beats of a montage treatment the writer wrote itself, made from its own scenes — no second reading by a model.
 * A scene's sung words are its cue; a scene whose words the song never sings is dropped and reported (its line falls
 * back to his performance), never placed somewhere else.
 */
export function beatsFromScenes<S extends { words: string; event: string; place: string; people?: readonly string[] }>(
  scenes: readonly S[],
  grid: readonly GridShot[],
  people: readonly WriterEntity[],
): { beats: Beat[]; kept: S[]; dropped: { words: string; why: string }[] } {
  const known = new Set(people.filter((p) => p.kind === "character").map((p) => p.key));
  const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const usable = scenes.slice(0, 80).filter((sc) => clean(sc.event, 1200));
  const lists = usable.map((sc) => cueMatches(grid, clean(sc.words, 300)));
  const pins = pinScenes(lists);
  const beats: Beat[] = [];
  const kept: S[] = [];
  const dropped: { words: string; why: string }[] = [];
  usable.forEach((sc, n) => {
    const words = clean(sc.words, 300);
    const event = clean(sc.event, 1200);
    if (pins[n] === null) {
      dropped.push({ words, why: !words ? "it quotes no words" : lists[n].length === 0 ? "the song does not sing these words" : "its words are sung only in a shot another scene holds, or out of the song's order" });
      return;
    }
    kept.push(sc);
    beats.push({
      id: `b${String(beats.length + 1).padStart(2, "0")}`,
      title: event.split(/[.;:]/)[0].slice(0, 80),
      scene: clean(sc.place, 400),
      action: event,
      people: [...new Set((sc.people ?? []).map((p) => String(p).trim()).filter((p) => known.has(p)))],
      unnamedPeople: false,
      artistPerforms: false,
      wardrobe: "",
      lyricCue: words,
      ties: [],
      weight: 1,
    });
  });
  return { beats, kept, dropped };
}

/** What the writer is told about beats, once, in the system prompt. */
export const BEAT_RULES = [
  "Each shot you are handed carries its `beat`: the part of the treatment it belongs to — where it is, what happens there, who the treatment puts in it, what he wears. Write the shot INSIDE that beat and nowhere else: not the beat before, not the one after, however the words of the song might tempt you. The beats are in the treatment's order; the board follows it.",
  "- A shot of a beat with `people` casts them: each of them in `cast.members` by key, with what they do in this shot. A shot of a beat with people is never `none: true`. Where a beat has several shots, each shot may hold a different one of its moments, but its people stay its people.",
  "- `wardrobe` of the beat is the artist's wardrobe in every shot of it he is in, in those words, with `wardrobe_from: treatment`.",
  "- `must_link` are ties the treatment states: say each one in `continuity.links` exactly as given (kind, shot) — the shot that opens the beat carries it, and its picture answers it (a screen shows that shot's picture; he holds the frame position that shot ends on; this reveals what that one was inside of).",
  "- A shot that `opens this beat` is where the beat's first thing happens; one that `closes this beat` is where its last thing happens; the shots between carry the rest in order.",
  "- A shot marked `a flash of this beat on its words` sits where the song sings the beat's words, before the beat's own run: show the one thing those words name, from this beat, and nothing of the beats around it; the beat continues in full later.",
].join("\n");

/** The one beat rule the montage style adds (kept apart so the classic prompt stays word for word what it was). */
export const BETWEEN_SCENES_RULE =
  "- A shot that carries `between_scenes` instead of a beat has no scene of the treatment: write it as that field says. This holds even when the words sung in it are words a scene quotes — that scene has its own shots, and this is not one of them.";
