/**
 * The reference PICTURES a storyboard still is drawn with — chosen, ordered, capped, and said out loud.
 *
 * Before this, a still was text only: a place on file, a garment in the treatment, a screen that shows another shot
 * all reached the image model as words, and the approved pictures stayed on the shelf. This module decides which
 * pictures go with a still, in what order, under the endpoint's limit, and what the prompt says each one IS. What does
 * not fit is reported (`notSent`), never quietly dropped; what the shot needs and does not have is a problem
 * (`problems`), said before any money moves.
 *
 * Order, most decisive first — the endpoint takes few (xAI images/edits: 3 on grok-imagine-image-quality), and xAI
 * edits the FIRST picture, so the picture a screen must show stays <IMAGE_0>:
 *   1. the picture another shot's screen must show / the position a cut must hold (links.ts)
 *   2. the people in it (the cast's identity pictures — casting/cast.ts decides who): a wrong face is unusable, a
 *      wrong second garment is a retry
 *   3. the exact garments the shot is dressed in (a picture of each, never a summary)
 *   4. the place, when the shot is set in an approved location (its words are in the prompt anyway)
 *   5. props with an approved picture
 *
 * Under the cap the pictures a shot cannot do without (a screen, a person, an exact garment) take their places before
 * the ones its words can carry (a position, a place, a prop); the order of what is sent does not change.
 *
 * A picture that does NOT fit is never a quiet demotion: a screen picture, an exact garment or an identity left out
 * BLOCKS the shot before spend. The cap is the route's limit, not a reason to weaken what the shot requires — the
 * director takes a reference off, splits the shot, or relaxes a piece on purpose (unticks it).
 *
 * A performance still is the empty PLACE his take is restaged into: nobody is drawn, so garments and people are not
 * sent with it (they would put a stranger in the plate).
 *
 * Pure: no react, no supabase.
 */
import type { ShotContinuity } from "@/lib/continuity/entities";
import type { LinkNeed } from "./links";

export type ReferenceSource = "project_asset" | "character_feature";
export type ReferenceRole = "screen" | "position" | "place" | "garment" | "cast" | "prop";

/** One picture, by the record it is on — the server resolves and signs it after checking it is the caller's. */
export type StillReference = {
  source: ReferenceSource;
  /** project_assets.id or character_features.id */
  id: string;
  role: ReferenceRole;
  /** What it is, in a few words ("the YSL Trucker Jacket — French Black Denim", "shot 2"). */
  label: string;
};

export type ReferenceProblem = { level: "blocking" | "warning"; text: string; fix: string };

export type ReferencePlan = {
  /** The pictures that go with the request, in the order the prompt names them (<IMAGE_0>, <IMAGE_1>, …). */
  sent: StillReference[];
  /** Pictures the shot has that the endpoint cannot also take, with why. Recorded on the job. */
  notSent: { ref: StillReference; why: string }[];
  problems: ReferenceProblem[];
  /** The sentences that tell the model what each sent picture is. Empty when nothing is sent. */
  legend: string;
  /** The endpoint's limit this plan was made under. */
  cap: number;
};

/** A garment the shot is dressed in, as the wardrobe holds it. `null` = the id names no wardrobe picture on file. */
export type GarmentOnFile = { id: string; label: string } | null;

export type ReferenceInput = {
  isPerformance: boolean;
  continuity: Pick<ShotContinuity, "location" | "props">;
  /** The pictures linked shots need (links.ts linkPictureNeeds), with the other shot's selected still when it has one. */
  linkNeeds: readonly (LinkNeed & { still: { assetId: string } | null })[];
  /** The shot's `wardrobe.garments`, resolved against the artist's wardrobe. */
  garments: readonly { id: string; onFile: GarmentOnFile }[];
  /** References another module adds (the cast's identity pictures). Sent after garments, before props. */
  extra?: readonly StillReference[];
  /** The endpoint's reference limit (providerCapabilities). */
  cap: number;
};

const ROLE_SENTENCE: Record<ReferenceRole, (label: string) => string> = {
  screen: (l) => `is the exact picture the screen shows (${l}) — put this picture on the screen, as it is`,
  position: (l) => `is ${l}: keep the subject in the same place in the frame and the same pose; everything around it changes as described`,
  place: (l) => `is the place, ${l}: this is that place — the same architecture, surfaces and light`,
  garment: (l) => `is a garment worn in this shot, ${l}: reproduce it exactly — cut, colour, fabric, seams, hardware and any mark on it — and do not redesign it`,
  cast: (l) => `is ${l}: the same person`,
  prop: (l) => `is ${l}: the same object`,
};

/** What the prompt says the sent pictures are. xAI image edits address its inputs as <IMAGE_n>, in order. */
export function referenceLegend(sent: readonly StillReference[]): string {
  if (sent.length === 0) return "";
  return `Reference pictures: ${sent.map((r, i) => `<IMAGE_${i}> ${ROLE_SENTENCE[r.role](r.label)}`).join("; ")}.`;
}

/** The roles a still cannot do without: a picture of these that is not actually delivered means the shot is not generated. */
export const REQUIRED_ROLES: ReadonlySet<ReferenceRole> = new Set<ReferenceRole>(["screen", "garment", "cast"]);

export function planStillReferences(input: ReferenceInput): ReferencePlan {
  const wanted: StillReference[] = [];
  const problems: ReferenceProblem[] = [];
  const notSent: ReferencePlan["notSent"] = [];

  for (const need of input.linkNeeds) {
    const name = need.link.other ? `shot ${need.link.other.shotNumber}` : `shot ${need.link.otherKey}`;
    if (!need.link.other) {
      problems.push({ level: "blocking", text: `This shot is linked to ${need.link.otherKey}, which is not a shot of this board.`, fix: "Point the link at a shot of this board, or remove it." });
      continue;
    }
    if (!need.still) {
      problems.push(
        need.role === "screen"
          ? { level: "blocking", text: `The screen in this shot shows ${name}, and ${name} has no image yet.`, fix: `Generate and choose ${name}'s image first — then the screen shows exactly that picture.` }
          : { level: "warning", text: `This shot holds the position of ${name}, which has no image yet; the position is asked for in words only.`, fix: `Generate ${name}'s image first to send it as the position to hold.` },
      );
      continue;
    }
    wanted.push({ source: "project_asset", id: need.still.assetId, role: need.role, label: name });
  }

  const place = input.continuity.location;
  const placeRef: StillReference | null = place?.approvedAssetId ? { source: "project_asset", id: place.approvedAssetId, role: "place", label: place.name } : null;

  if (input.isPerformance) {
    // the plate is the place, drawn empty: the place picture leads and nobody is sent with it
    if (placeRef) wanted.push(placeRef);
    // the plate is drawn empty: a garment or a person sent with it would put somebody in it
    for (const g of input.garments) if (g.onFile) notSent.push({ ref: { source: "character_feature", id: g.id, role: "garment", label: g.onFile.label }, why: "a performance still is the empty place; he is his take" });
    for (const r of input.extra ?? []) notSent.push({ ref: r, why: "a performance still is the empty place; nobody is drawn in it" });
  } else {
    wanted.push(...(input.extra ?? []));
    for (const g of input.garments) {
      if (!g.onFile) {
        problems.push({ level: "blocking", text: `A garment this shot is dressed in (${g.id}) is not in the artist's wardrobe.`, fix: "Choose the garment again from the wardrobe, or take it off the shot." });
        continue;
      }
      wanted.push({ source: "character_feature", id: g.id, role: "garment", label: g.onFile.label });
    }
    if (placeRef) wanted.push(placeRef);
  }

  for (const p of input.continuity.props) if (p.approvedAssetId) wanted.push({ source: "project_asset", id: p.approvedAssetId, role: "prop", label: p.name });

  // one picture is sent once, in its most decisive role
  const seen = new Set<string>();
  const unique = wanted.filter((r) => (seen.has(`${r.source}:${r.id}`) ? false : (seen.add(`${r.source}:${r.id}`), true)));
  const cap = Math.max(0, Math.floor(input.cap));
  // Under the cap, the pictures the shot cannot be made without take their places first, in order; what is left goes
  // to the rest, in order. A position, a place or a prop is carried by its words when it does not fit — a screen, a
  // person or an exact garment is not, so a position to hold must never be what pushes an exact garment out and
  // blocks the shot (IB c017, 10 Oct 2026). The sent pictures keep the order above: a screen stays <IMAGE_0>.
  const kept = new Set<StillReference>();
  for (const r of unique) if (kept.size < cap && REQUIRED_ROLES.has(r.role)) kept.add(r);
  for (const r of unique) if (kept.size < cap && !REQUIRED_ROLES.has(r.role)) kept.add(r);
  const sent = unique.filter((r) => kept.has(r));
  const takes = `the image endpoint takes ${cap} reference picture${cap === 1 ? "" : "s"}`;
  for (const r of unique) {
    if (kept.has(r)) continue;
    notSent.push({ ref: r, why: REQUIRED_ROLES.has(r.role) ? `${takes}; the ones before it are more decisive` : `${takes}, and the people, screens and exact garments of the shot need them; this one is asked for in words` });
  }
  for (const n of notSent) {
    if (input.isPerformance) continue;
    if (!REQUIRED_ROLES.has(n.ref.role)) continue;
    // a required picture that does not fit BLOCKS: the cap is the route's limit, not a licence to draw the shot from
    // words. The way out is the director's: take a reference off, split the look across shots, or say in so many
    // words that a piece need not be exact (untick it) — never a quiet downgrade.
    const why =
      n.ref.role === "cast" ? `${n.ref.label}'s identity picture does not fit in this request (${cap} pictures): the still would draw a stranger.`
      : n.ref.role === "screen" ? `The picture the screen must show (${n.ref.label}) does not fit in this request (${cap} pictures): the screen would show something made up.`
      : `${n.ref.label} is marked exact and does not fit in this request (${cap} pictures): it would be drawn from words.`;
    problems.push({
      level: "blocking",
      text: why,
      fix: n.ref.role === "garment"
        ? "Take a prop or another garment off the shot, split the look across shots (production: multi_shot), or untick this piece so it is described in words on purpose."
        : "Take a prop or a garment off the shot, or split it across shots (production: multi_shot) so every screen and every person gets its picture.",
    });
  }
  return { sent, notSent, problems, legend: referenceLegend(sent), cap };
}

/** One line per reference for the confirmation and the job record: "sent: shot 2 (screen) · not sent: …". */
export function referenceSummary(plan: Pick<ReferencePlan, "sent" | "notSent">): string {
  const sent = plan.sent.map((r) => `${r.label} (${r.role})`).join(", ");
  const left = plan.notSent.map((n) => `${n.ref.label} (${n.ref.role}: ${n.why})`).join(", ");
  return [sent ? `Sent as pictures: ${sent}.` : "No reference pictures are sent.", left ? `Not sent: ${left}.` : ""].filter(Boolean).join(" ");
}

/**
 * What stands in the way when the pictures a shot needs cannot go with the request — the generator does not take
 * them (not deployed, probe failed). "Not sent" is a record, not a permission: a shot that needs a screen picture, an
 * exact garment or an identity is BLOCKED, never drawn from words and logged.
 */
export function undeliveredProblem(sent: readonly StillReference[], delivered: boolean): ReferenceProblem | null {
  if (delivered) return null;
  const needed = sent.filter((r) => REQUIRED_ROLES.has(r.role));
  if (needed.length === 0) return null;
  return {
    level: "blocking",
    text: `This shot needs its pictures (${needed.map((r) => `${r.label} — ${r.role}`).join(", ")}) and the image generator is not taking reference pictures.`,
    fix: "Redeploy world-still-proxy with reference delivery, then generate. Nothing was generated.",
  };
}
