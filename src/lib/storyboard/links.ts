/**
 * Links between shots, read from BOTH ends.
 *
 * A link is written once, on the shot that owes it (shotSpec.ts `continuity.links`): shot 30's monitor shows shot 2;
 * shot 31 reveals what shot 30 was inside of. Each end then needs something different — the screen shot needs the
 * other shot's PICTURE; the shot shown on a screen needs nothing; the two halves of a reveal each need to know the
 * other's scene. This module says, for one box, what every link touching it asks of its picture: words for the prompt,
 * a picture to send as a reference, or a problem to say before anything is generated.
 *
 * Pure: no react, no supabase, no project knowledge.
 */
import type { ShotLinkKind } from "@/lib/treatment/shotSpec";
import type { StoryboardBox } from "./boxes";

export type ResolvedLink = {
  kind: ShotLinkKind;
  /** "out" = this box owes the link; "in" = another box's link points at this one. */
  direction: "out" | "in";
  /** The other shot's key, as written. */
  otherKey: string;
  /** The other box on this board, or null when the key names no shot of it (a dangling link — said, never dropped). */
  other: Pick<StoryboardBox, "id" | "key" | "shotNumber" | "spec"> | null;
  note: string;
};

type BoardBox = Pick<StoryboardBox, "id" | "key" | "shotNumber" | "spec">;

/** Every link that touches `box`: the ones it carries, and the ones other boxes carry to it. */
export function linksOfBox(box: BoardBox, board: readonly BoardBox[]): ResolvedLink[] {
  const byKey = new Map(board.map((b) => [b.key, b]));
  const out: ResolvedLink[] = (box.spec.continuity.links ?? []).map((l) => ({
    kind: l.kind,
    direction: "out" as const,
    otherKey: l.shot,
    other: byKey.get(l.shot) ?? null,
    note: l.note ?? "",
  }));
  for (const b of board) {
    if (b.key === box.key) continue;
    for (const l of b.spec.continuity.links ?? []) {
      if (l.shot !== box.key) continue;
      // the same tie written at both ends is one tie
      if (out.some((o) => o.direction === "out" && o.otherKey === b.key && o.kind === l.kind)) continue;
      out.push({ kind: l.kind, direction: "in", otherKey: b.key, other: b, note: l.note ?? "" });
    }
  }
  return out;
}

/** The picture a linked shot is, in words: its opening frame when one is written, else its scene. */
export function sceneOf(box: Pick<StoryboardBox, "spec">): string {
  const s = box.spec;
  return (s.openingFrame?.trim() || (s.origin === "override" && s.performanceDirection.trim() ? s.performanceDirection : s.purpose) || "").trim();
}

const shotName = (l: ResolvedLink) => (l.other ? `shot ${l.other.shotNumber}` : `shot ${l.otherKey}`);
const noteOf = (l: ResolvedLink) => (l.note.trim() ? ` (${l.note.trim().replace(/[.;]+$/, "")})` : "");
const sentence = (s: string) => s.trim().replace(/[.;]*$/, ".");
/** Fences a linked shot's words to the screen that shows it; the place around the screen stays this shot's own. */
export const SCREEN_ONLY = "What follows describes only what is on that screen, not the place, light or colour around it:";
/** Said in place of the linked shot's words when its picture itself goes with the request. */
export const SCREEN_PICTURE_SENT = "That picture is sent with this request and belongs on the screen only: the place around the screen keeps this shot's own light and colour.";

export type LinkPromptOptions = {
  /**
   * The keys of the shots whose PICTURE goes with this request as the screen's picture (references.ts
   * `screensPictured`). For those the screen's content is the picture, so the other shot's words are left out: said as
   * well, a sentence about that whole picture ("the whole picture is black and white") still coloured the room around
   * the screen, fence or no fence (10 Oct 2026). Without the picture the words are all the screen has, and stay.
   */
  pictured?: ReadonlySet<string>;
};

/**
 * What each link adds to this box's prompt. Empty for a link that asks nothing of this end (the shot whose picture is
 * shown on another shot's screen is drawn as itself).
 */
export function linkPromptLines(links: readonly ResolvedLink[], opts: LinkPromptOptions = {}): string[] {
  const lines: string[] = [];
  for (const l of links) {
    const scene = l.other ? sceneOf(l.other) : "";
    if (l.direction === "out") {
      // the other shot's words are fenced to the screen: said bare, a sentence about that whole picture ("the whole
      // picture is black and white", "at night") was read as this shot's own, and the room around the screen took it on
      if (l.kind === "screen_shows" && opts.pictured?.has(l.otherKey)) lines.push(`The screen in this picture${noteOf(l)} shows the picture of ${shotName(l)}. ${SCREEN_PICTURE_SENT}`);
      else if (l.kind === "screen_shows") lines.push(`The screen in this picture${noteOf(l)} shows the picture of ${shotName(l)}.${scene ? ` ${SCREEN_ONLY} ${sentence(scene)}` : ""}`);
      else if (l.kind === "match_position") lines.push(`The subject holds the same place in the frame and the same pose as in ${shotName(l)}${noteOf(l)}; only the place around changes.`);
      else if (l.kind === "reveals") lines.push(`This shot reveals what ${shotName(l)} was inside of or opening onto${noteOf(l)}${scene ? ` — that shot: ${sentence(scene)}` : "."}`);
      else if (l.kind === "continues") lines.push(`This shot continues the action of ${shotName(l)} across the cut${noteOf(l)}${scene ? ` — that shot: ${sentence(scene)}` : "."}`);
    } else {
      if (l.kind === "reveals") lines.push(`What this shot is inside of or opening onto is revealed by ${shotName(l)}${noteOf(l)}${scene ? `: ${sentence(scene)}` : "."} The two must agree.`);
      else if (l.kind === "continues") lines.push(`The action of this shot carries on in ${shotName(l)}${noteOf(l)}; it ends where that shot begins.`);
      // screen_shows / match_position in: this shot is the source — it is drawn as itself
    }
  }
  return lines;
}

export type LinkNeed = {
  link: ResolvedLink;
  /** What the other shot's picture is for. */
  role: "screen" | "position";
  /** "blocking": the shot cannot be what the treatment says without it. "warning": the words carry it, less exactly. */
  level: "blocking" | "warning";
};

/** The links whose OTHER shot's picture this box needs as a reference (the board supplies the picture, references.ts sends it). */
export function linkPictureNeeds(links: readonly ResolvedLink[]): LinkNeed[] {
  const needs: LinkNeed[] = [];
  for (const l of links) {
    if (l.direction !== "out") continue;
    if (l.kind === "screen_shows") needs.push({ link: l, role: "screen", level: "blocking" });
    else if (l.kind === "match_position") needs.push({ link: l, role: "position", level: "warning" });
  }
  return needs;
}

/** Links that name no shot of this board: the writer or the director pointed at something that is not here. */
export function danglingLinks(links: readonly ResolvedLink[]): ResolvedLink[] {
  return links.filter((l) => !l.other);
}

export const LINK_LABEL: Record<ShotLinkKind, { out: string; in: string }> = {
  screen_shows: { out: "shows on a screen", in: "is shown on a screen in" },
  match_position: { out: "holds the position of", in: "hands its position to" },
  reveals: { out: "reveals what is inside", in: "is revealed by" },
  continues: { out: "continues", in: "carries on in" },
};

/** "shows on a screen shot 2", "is revealed by shot 31" — one line per link, for the card. */
export function linkSummary(l: ResolvedLink): string {
  return `${LINK_LABEL[l.kind][l.direction]} ${shotName(l)}${noteOf(l)}`;
}
