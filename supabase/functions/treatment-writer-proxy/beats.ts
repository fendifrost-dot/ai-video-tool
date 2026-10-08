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

/** The system prompt of the call that reads the beats out of the treatment. */
export function beatsSystemPrompt(people: readonly WriterEntity[], hasPerformanceFootage: boolean): string {
  const list = people.filter((p) => p.kind === "character");
  return [
    "You read a music-video treatment and list its beats: every scene or moment it describes, in the order it describes them, each with what the camera must show there. You invent nothing and leave nothing out: a beat the treatment describes — a place, an arrival, a reveal, a cut to somewhere else, an animal, a crew, a screen showing something — is a beat even when it is one sentence. A beat is one place and one continuous stretch of action; a new place or a cut the treatment describes starts a new beat.",
    "Keep the treatment's own words for `scene`, `action` and `wardrobe`. Where the treatment says certain words of the song are sung at a beat, copy those words verbatim into `lyric_cue`. Where it cuts from one beat to another by a device, say so in `ties` on the LATER beat, with the kind that names the device: `screen_shows` when a television, monitor, screen or reflection in this beat shows the earlier beat's picture (a pull-back from an image playing on a set is this); `match_position` when a person or thing keeps the earlier beat's place in the frame while the world around changes; `reveals` when this beat shows what the earlier beat was inside of or opening onto (a door, a vehicle); `continues` when the same action carries on across the cut. One tie per device; a beat may have none.",
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
 * The shot that sings the cue — the one singing most of its words when the cue straddles a cut (a shot's lyrics are
 * cut at its boundary word by word, so a line sung across two shots is in neither one's text whole) — or, failing the
 * whole cue, its first four words (a treatment quotes a line, a shot may hold only part of it). Only shots from `from`
 * onward count; -1 when the song never sings it there.
 */
export function cueIndex(grid: readonly GridShot[], cue: string, from = 0): number {
  const words = norm(cue).split(" ").filter(Boolean);
  if (words.length === 0) return -1;
  const stream = wordStream(grid);
  const floor = Math.max(0, from);
  const needles = [words];
  if (words.length > 4) needles.push(words.slice(0, 4));
  for (const needle of needles) {
    for (let s = 0; s + needle.length <= stream.length; s++) {
      if (stream[s + needle.length - 1].shot < floor) continue;
      let k = 0;
      while (k < needle.length && stream[s + k].w === needle[k]) k++;
      if (k < needle.length) continue;
      const count = new Map<number, number>();
      for (let m = 0; m < needle.length; m++) count.set(stream[s + m].shot, (count.get(stream[s + m].shot) ?? 0) + 1);
      let best = -1;
      let most = 0;
      for (const [shot, n] of count) if (n > most || (n === most && shot < best)) { best = shot; most = n; }
      if (best >= floor) return best;
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
  /** Beats whose cue the song never sings after the beat before it — and whether it is sung earlier, or never. */
  unanchored: { beat: string; cue: string; sung: "earlier" | "never" }[];
  /**
   * A beat whose cue is sung only BEFORE its turn gets one shot there — a flash of it on its words — and continues in
   * full where the treatment's order puts it. Lyric synchronisation is kept without reordering the narrative; the
   * director sees every insert.
   */
  inserts: { beat: string; shot: string; cue: string; takenFrom: string }[];
};

/**
 * The grid's shots allotted to the beats, in order. A beat with a cue the song sings is pinned to the first shot that
 * sings it (never earlier than the beat before it). Between two pins the shots are shared by weight, every beat
 * getting at least one while shots remain. Beats after the last pin share what is left the same way. The order of the
 * treatment is the order of the board; a beat never takes shots from the beats after it.
 */
export function allocateBeats(beats: readonly Beat[], grid: readonly GridShot[], options: { lyricInserts?: boolean } = {}): Allocation {
  const byShot: Record<string, string> = {};
  const byBeat: Record<string, string[]> = Object.fromEntries(beats.map((b) => [b.id, []]));
  const anchors: Allocation["anchors"] = [];
  const unanchored: Allocation["unanchored"] = [];
  const inserts: Allocation["inserts"] = [];
  const lyricInserts = options.lyricInserts !== false;
  if (beats.length === 0 || grid.length === 0) return { byShot, byBeat, uncovered: beats.map((b) => b.id), anchors, unanchored, inserts };

  // 1. pins: the earliest shot singing each cue, strictly increasing in beat order, never before the beat's own rank
  const pin: (number | null)[] = beats.map(() => null);
  let floor = -1;
  beats.forEach((b, i) => {
    if (!b.lyricCue) return;
    // strictly after the pin before it: two beats never share a shot
    const at = cueIndex(grid, b.lyricCue, Math.max(floor + 1, i));
    if (at < 0) {
      unanchored.push({ beat: b.id, cue: b.lyricCue, sung: cueIndex(grid, b.lyricCue, 0) >= 0 ? "earlier" : "never" });
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

  // 3. inserts: a cue sung only before its beat's turn gets that one shot as a flash of the beat, taken from the beat
  //    that holds it — unless that would leave the holder with nothing
  if (lyricInserts) {
    for (const u of unanchored) {
      if (u.sung !== "earlier") continue;
      const at = cueIndex(grid, u.cue, 0);
      if (at < 0) continue;
      const key = grid[at].key;
      const holder = byShot[key];
      if (!holder || holder === u.beat || byBeat[holder].length < 2) continue;
      byBeat[holder] = byBeat[holder].filter((k) => k !== key);
      byShot[key] = u.beat;
      byBeat[u.beat] = [key, ...byBeat[u.beat]];
      inserts.push({ beat: u.beat, shot: key, cue: u.cue, takenFrom: holder });
    }
  }
  return { byShot, byBeat, uncovered: beats.filter((b) => byBeat[b.id].length === 0).map((b) => b.id), anchors, unanchored, inserts };
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
};

/** The brief of every allotted shot: the beat's facts, and the links its ties resolve to (first shot ← last shot of the earlier beat). */
export function shotBriefs(beats: readonly Beat[], allocation: Allocation): Record<string, ShotBrief> {
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
    const why = `the take shows him performing; in this beat he ${brief.action.slice(0, 80).replace(/\s+/g, " ") || "does something else"} — drawn with his identity pictures, not cut from the take`;
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
export function auditBeatsAgainstTreatment(treatment: string, beats: readonly Beat[]): TreatmentAudit {
  const paragraphs = treatment.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.split(" ").length >= 8);
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
  };
  lyrics: {
    verdict: Verdict;
    anchors: Allocation["anchors"];
    inserts: Allocation["inserts"];
    unanchored: Allocation["unanchored"];
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
  extra: { treatment?: string; tieCorrections?: TieCorrection[]; productionCorrections?: ProductionCorrection[] } = {},
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
  const structuralVerdict: Verdict = allocation.uncovered.length || missingPeople.length || rows.some((r) => r.emptied.length) ? "fail" : "pass";
  const lyricsVerdict: Verdict = allocation.unanchored.some((u) => u.sung === "earlier" && !allocation.inserts.some((i) => i.beat === u.beat)) ? "fail" : allocation.unanchored.length || allocation.inserts.length ? "gaps" : "pass";
  const relationshipsVerdict: Verdict = missingLinks.length || mistyped.length || ties.some((t) => !t.directionOk) ? "fail" : (extra.tieCorrections?.length ?? 0) ? "gaps" : "pass";
  const productionVerdict: Verdict = (extra.productionCorrections?.length ?? 0) ? "gaps" : "pass";
  const audit = extra.treatment ? auditBeatsAgainstTreatment(extra.treatment, beats) : { ok: true, paragraphs: 0, uncovered: [] };
  const treatmentVerdict: Verdict = audit.ok ? "pass" : "fail";
  const verdict = worst(structuralVerdict, lyricsVerdict, relationshipsVerdict, productionVerdict, treatmentVerdict);
  return {
    ok: verdict === "pass",
    verdict,
    structural: { verdict: structuralVerdict, beats: rows.map(({ ties: _t, ...r }) => r), uncoveredBeats: allocation.uncovered, missingPeople },
    lyrics: { verdict: lyricsVerdict, anchors: allocation.anchors, inserts: allocation.inserts, unanchored: allocation.unanchored },
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
            position: brief.insert ? "a flash of this beat on its words — the beat continues in full later; show the one thing the words name" : brief.first && brief.last ? "the only shot of this beat" : brief.first ? "opens this beat" : brief.last ? "closes this beat" : "inside this beat",
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
  "- A shot marked `a flash of this beat on its words` sits where the song sings the beat's words, before the beat's own run: show the one thing those words name, from this beat, and nothing of the beats around it; the beat continues in full later.",
].join("\n");
