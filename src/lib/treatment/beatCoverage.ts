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

export type BeatCoverage = {
  ok: boolean;
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
  unanchored: { beat: string; cue: string }[];
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
  return {
    ok: v.ok === true,
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
    unanchored: Array.isArray(v.unanchored) ? (v.unanchored as Record<string, unknown>[]).map((a) => ({ beat: str(a.beat), cue: str(a.cue) })) : [],
  };
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
