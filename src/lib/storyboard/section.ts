/**
 * A section of the cut looked at on its own in Review: the shots from one number to another. It is a way of
 * LOOKING — the player, the list and the frames show only those shots — and never changes the storyboard.
 */
export type ReviewSection = { from: number; to: number };

/** A section in order and inside the cut; null when it is the whole cut (or nothing sensible). */
export function normalSection(s: ReviewSection, shots: number): ReviewSection | null {
  if (!Number.isFinite(s.from) || !Number.isFinite(s.to) || shots <= 0) return null;
  const from = Math.max(1, Math.min(shots, Math.round(Math.min(s.from, s.to))));
  const to = Math.max(1, Math.min(shots, Math.round(Math.max(s.from, s.to))));
  return from === 1 && to === shots ? null : { from, to };
}

/** The section named in a link: ?from=14&to=23. */
export function sectionFromSearch(search: string): ReviewSection | null {
  const q = new URLSearchParams(search);
  if (!q.has("from") && !q.has("to")) return null;
  const from = Number(q.get("from") ?? 1);
  const to = Number(q.get("to") ?? Number.MAX_SAFE_INTEGER);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < 1) return null;
  return { from: Math.round(Math.min(from, to)), to: Math.round(Math.max(from, to)) };
}

/** The shots of a section, by their number in the cut. The whole cut when there is no section. */
export function sectionOf<T extends { index: number }>(timeline: readonly T[], section: ReviewSection | null): T[] {
  if (!section) return [...timeline];
  const part = timeline.filter((s) => s.index >= section.from && s.index <= section.to);
  return part.length ? part : [...timeline];
}
