/**
 * Beat coverage — whether a written board carries the treatment.
 *
 * The writer (supabase/functions/treatment-writer-proxy/beats.ts) reads the treatment's beats out once, allots the
 * board's shots to them in order, and after writing checks the result: every beat has shots, every person a beat
 * names is cast in one of its shots, no shot of a peopled beat came back empty, every tie the treatment states is a
 * link from the beat's first shot to the earlier beat's last. That check comes back with the shots and is kept with
 * the board (`treatment.storyboard.coverage`), so the director sees what the board does and does not carry — a shot
 * count alone says nothing.
 */

export type Verdict = "pass" | "gaps" | "fail";

export type BeatCoverage = {
  /** True only when every section passes with nothing to say. */
  ok: boolean;
  /** The overall word: never "pass" while any section has something to say. Absent on a coverage from before the sections. */
  verdict: Verdict | null;
  sections: {
    structural: Verdict | null;
    lyrics: Verdict | null;
    relationships: Verdict | null;
    production: Verdict | null;
    treatment: Verdict | null;
  };
  /** Lyric cues sung only before their beat's turn, given a flash shot there (allocation inserts). */
  inserts: { beat: string; shot: string; cue: string; takenFrom: string }[];
  /** Ties retyped from their own words. */
  tieCorrections: { beat: string; to: string; from: string; kind: string; words: string }[];
  /** Ties whose kind contradicts their words and were not corrected. */
  mistyped: { beat: string; kind: string; statedKind: string; to: string }[];
  /** Shots re-routed because a take-based method cannot show what the beat has him do. */
  productionCorrections: { shot: string; from: string; to: string; why: string }[];
  /** Paragraphs of the treatment no beat answers. */
  treatmentUncovered: { index: number; text: string }[];
  beats: {
    id: string;
    title: string;
    shots: string[];
    people: { key: string; castIn: string[] }[];
    emptied: string[];
    ties: { kind: string; to: string; fromShot: string | null; toShot: string | null; present: boolean }[];
  }[];
  uncoveredBeats: string[];
  missingPeople: { beat: string; key: string }[];
  missingLinks: { beat: string; kind: string; to: string }[];
  anchors: { beat: string; shot: string; cue: string }[];
  unanchored: { beat: string; cue: string; sung?: "earlier" | "never" }[];
};

/** A writer run's evidence as the board keeps it: the run's row, and what it cost — actual when known, never an estimate. */
export type WriterRunRecord = {
  id: string | null;
  model: string | null;
  /** The provider's own count at list price; null = unknown (no usage was reported). */
  actualCostUsd: number | null;
  /** What it should have cost from the sizes sent — kept apart from the actual. */
  estimatedCostUsd: number | null;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const nul = (v: unknown) => (typeof v === "string" ? v : null);

/** A coverage read back from JSON, or null when there is none / it is not a coverage. */
export function parseBeatCoverage(value: unknown): BeatCoverage | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.beats)) return null;
  const verdict = (x: unknown): Verdict | null => (x === "pass" || x === "gaps" || x === "fail" ? x : null);
  const sec = (name: string) => verdict((v[name] as Record<string, unknown> | undefined)?.verdict);
  const rel = (v.relationships ?? {}) as Record<string, unknown>;
  const prod = (v.production ?? {}) as Record<string, unknown>;
  const lyr = (v.lyrics ?? {}) as Record<string, unknown>;
  const tr = (v.treatment ?? {}) as Record<string, unknown>;
  return {
    ok: v.ok === true,
    verdict: verdict(v.verdict),
    sections: { structural: sec("structural"), lyrics: sec("lyrics"), relationships: sec("relationships"), production: sec("production"), treatment: sec("treatment") },
    inserts: Array.isArray(lyr.inserts) ? (lyr.inserts as Record<string, unknown>[]).map((i) => ({ beat: str(i.beat), shot: str(i.shot), cue: str(i.cue), takenFrom: str(i.takenFrom) })) : [],
    tieCorrections: Array.isArray(rel.corrected) ? (rel.corrected as Record<string, unknown>[]).map((c) => ({ beat: str(c.beat), to: str(c.to), from: str(c.from), kind: str(c.kind), words: str(c.words) })) : [],
    mistyped: Array.isArray(rel.mistyped) ? (rel.mistyped as Record<string, unknown>[]).map((m) => ({ beat: str(m.beat), kind: str(m.kind), statedKind: str(m.statedKind), to: str(m.to) })) : [],
    productionCorrections: Array.isArray(prod.corrected) ? (prod.corrected as Record<string, unknown>[]).map((c) => ({ shot: str(c.shot), from: str(c.from), to: str(c.to), why: str(c.why) })) : [],
    treatmentUncovered: Array.isArray(tr.uncovered) ? (tr.uncovered as Record<string, unknown>[]).map((u) => ({ index: Number(u.index ?? 0), text: str(u.text) })) : [],
    beats: (v.beats as Record<string, unknown>[]).map((b) => ({
      id: str(b.id),
      title: str(b.title),
      shots: strs(b.shots),
      people: Array.isArray(b.people) ? (b.people as Record<string, unknown>[]).map((p) => ({ key: str(p.key), castIn: strs(p.castIn) })) : [],
      emptied: strs(b.emptied),
      ties: Array.isArray(b.ties) ? (b.ties as Record<string, unknown>[]).map((t) => ({ kind: str(t.kind), to: str(t.to), fromShot: nul(t.fromShot), toShot: nul(t.toShot), present: t.present === true })) : [],
    })),
    uncoveredBeats: strs(v.uncoveredBeats),
    missingPeople: Array.isArray(v.missingPeople) ? (v.missingPeople as Record<string, unknown>[]).map((m) => ({ beat: str(m.beat), key: str(m.key) })) : [],
    missingLinks: Array.isArray(v.missingLinks) ? (v.missingLinks as Record<string, unknown>[]).map((m) => ({ beat: str(m.beat), kind: str(m.kind), to: str(m.to) })) : [],
    anchors: Array.isArray(v.anchors) ? (v.anchors as Record<string, unknown>[]).map((a) => ({ beat: str(a.beat), shot: str(a.shot), cue: str(a.cue) })) : [],
    unanchored: Array.isArray(v.unanchored) ? (v.unanchored as Record<string, unknown>[]).map((a) => ({ beat: str(a.beat), cue: str(a.cue), ...(a.sung === "earlier" || a.sung === "never" ? { sung: a.sung } : {}) })) : [],
  };
}

/** The word for a verdict, never an unqualified pass when there is something to say. */
export function verdictLabel(v: Verdict | null): string {
  return v === "pass" ? "passes" : v === "gaps" ? "passes with gaps" : v === "fail" ? "fails" : "not checked";
}

/** The five parts of a coverage, each with its word and what it says — for a reader who must not see one green light. */
export function coverageSections(c: BeatCoverage, shotLabel: (key: string) => string = (k) => k): { name: string; verdict: Verdict | null; lines: string[] }[] {
  const title = (id: string) => c.beats.find((b) => b.id === id)?.title || id;
  const structural: string[] = [];
  for (const id of c.uncoveredBeats) structural.push(`“${title(id)}” got no shot.`);
  for (const m of c.missingPeople) structural.push(`“${title(m.beat)}” puts ${m.key} in it, and no shot of it casts them.`);
  for (const b of c.beats) if (b.emptied.length) structural.push(`“${b.title}” has people, and shot${b.emptied.length === 1 ? "" : "s"} ${b.emptied.map(shotLabel).join(", ")} came back with nobody in ${b.emptied.length === 1 ? "it" : "them"}.`);
  const lyrics: string[] = [];
  for (const i of c.inserts) lyrics.push(`“${title(i.beat)}” is sung at shot ${shotLabel(i.shot)} (“${i.cue}”), before its turn: that shot is a flash of it, taken from “${title(i.takenFrom)}”; the beat continues in full later.`);
  for (const u of c.unanchored) {
    if (c.inserts.some((i) => i.beat === u.beat)) continue;
    lyrics.push(u.sung === "never" ? `“${title(u.beat)}” is tied to “${u.cue}”, which the song never sings.` : `“${title(u.beat)}” is tied to “${u.cue}”, sung only before its turn — placed in order, NOT on its words.`);
  }
  const relationships: string[] = [];
  for (const t of c.tieCorrections) relationships.push(`“${title(t.beat)}” → “${title(t.to)}”: the writer said ${t.from.replace("_", " ")}; its words (“${t.words.slice(0, 60)}…”) say ${t.kind.replace("_", " ")} — corrected.`);
  for (const m of c.mistyped) relationships.push(`“${title(m.beat)}” → “${title(m.to)}” is typed ${m.kind.replace("_", " ")} but its words say ${m.statedKind.replace("_", " ")}.`);
  for (const m of c.missingLinks) relationships.push(`“${title(m.beat)}” is cut from “${title(m.to)}” (${m.kind.replace("_", " ")}) and the opening shot carries no such link to the earlier beat's last shot.`);
  const production: string[] = c.productionCorrections.map((p) => `Shot ${shotLabel(p.shot)}: ${p.from} → ${p.to} — ${p.why}.`);
  const treatment: string[] = c.treatmentUncovered.map((u) => `Paragraph ${u.index + 1} of the treatment has no beat: “${u.text.slice(0, 90)}…”`);
  return [
    { name: "Structure — every beat has shots, every named person is cast", verdict: c.sections.structural ?? (structural.length ? "fail" : "pass"), lines: structural },
    { name: "Lyric alignment — beats on the words the treatment ties them to", verdict: c.sections.lyrics, lines: lyrics },
    { name: "Relationships — each tie by type, direction and target", verdict: c.sections.relationships, lines: relationships },
    { name: "Production feasibility — routes the take can carry", verdict: c.sections.production, lines: production },
    { name: "Beats against the treatment — nothing of the text left out", verdict: c.sections.treatment, lines: treatment },
  ];
}

export function parseWriterRun(value: unknown): WriterRunRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return { id: nul(v.id), model: nul(v.model), actualCostUsd: num(v.actualCostUsd), estimatedCostUsd: num(v.estimatedCostUsd) };
}

/** The gaps a coverage lists, as lines a director reads — empty when the board carries the treatment. */
export function coverageGaps(c: BeatCoverage, shotLabel: (key: string) => string = (k) => k): string[] {
  const title = (id: string) => c.beats.find((b) => b.id === id)?.title || id;
  const out: string[] = [];
  for (const id of c.uncoveredBeats) out.push(`“${title(id)}” got no shot — the song has fewer shots than the treatment has beats there.`);
  for (const m of c.missingPeople) out.push(`“${title(m.beat)}” puts ${m.key} in it, and no shot of it casts them.`);
  for (const b of c.beats) if (b.emptied.length) out.push(`“${b.title}” has people, and shot${b.emptied.length === 1 ? "" : "s"} ${b.emptied.map(shotLabel).join(", ")} came back with nobody in ${b.emptied.length === 1 ? "it" : "them"}.`);
  for (const m of c.missingLinks) out.push(`“${title(m.beat)}” is cut from “${title(m.to)}” (${m.kind.replace("_", " ")}) and no shot carries that link.`);
  for (const u of c.unanchored) out.push(`“${title(u.beat)}” is tied to the words “${u.cue}”, which the song does not sing after the beat before it — it was placed in order instead.`);
  return out;
}

/** What a run cost, said honestly: the actual when the provider counted it, else "unknown" with the estimate apart. */
export function costLine(run: WriterRunRecord | null | undefined): string {
  if (!run) return "cost not recorded";
  const est = run.estimatedCostUsd != null ? ` (estimate was $${run.estimatedCostUsd.toFixed(2)})` : "";
  return run.actualCostUsd != null ? `cost $${run.actualCostUsd.toFixed(4)} at list price${est}` : `actual cost unknown — the provider reported no usage${est}`;
}
