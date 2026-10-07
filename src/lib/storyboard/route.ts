/**
 * How ONE shot gets made — and whether this app can make it that way.
 *
 * Before this every shot went to one route by its type: a still → an image-to-video clip, or a performance → a
 * restaging. A rotating grill inside his real mouth, an interior that turns out to be inside a car, a coat the take
 * does not show — each came back as the nearest easy shot, with nothing said. Here the shot's production method (the
 * writer's or the director's, `spec.production.method`) is held against what the app can actually do, and the answer
 * is one of three: the storyboard makes it; it is made in another part of the tool (named); or nothing in the tool
 * can make it yet. The last two are outcomes to report, never a reason to make a weaker shot.
 *
 * Pure: no react, no supabase, no project knowledge.
 */
import type { ProductionMethod, ShotSpec } from "@/lib/treatment/shotSpec";
import type { ResolvedLink } from "./links";

export type RouteVerdict =
  /** The storyboard's own buttons make it. */
  | "storyboard"
  /** Another part of the tool makes it; the storyboard does not. `where` names it. */
  | "elsewhere"
  /** Nothing in the tool makes it as written. */
  | "unsupported";

export type ProductionRoute = {
  method: ProductionMethod;
  /** True when the method was not said and was read from the shot type. */
  inferred: boolean;
  verdict: RouteVerdict;
  /** The provider path, in words ("Grok still → Kling 2.5 turbo image-to-video"). */
  path: string;
  /** Where it is made when not on the storyboard. */
  where: string | null;
  /** What stands in the way, in the director's words. Empty when nothing does. */
  limits: string[];
};

export type RouteFacts = {
  /** A take of his real performance is in sync with this shot's window. */
  hasTake: boolean;
  /**
   * What the artist does in this shot, when he is cast in it with his real identity: the take shows him performing,
   * so a method that cuts from the take can only show that. Null when he is not in the shot.
   */
  artist?: { performs: boolean; action: string } | null;
  links: readonly ResolvedLink[];
  /** The longest piece of take one restaging can carry (restage.ts), seconds. */
  maxRestageSeconds?: number;
};

export const METHOD_LABEL: Record<ProductionMethod, string> = {
  footage: "His footage, as filmed",
  restage: "Restage his take in a new place",
  generate: "Generate (image → clip)",
  edit_footage: "Edit inside his footage",
  composite: "Composite his take over a made place",
  multi_shot: "Made across a cut",
};

const STILL_TO_CLIP = "Grok still → Kling 2.5 turbo image-to-video";
const RESTAGE = "his take + the place's picture → Seedance 2.5 reference-to-video";

/** The methods that cut from his real take: his body and his action are the take's. */
export const TAKE_METHODS: ReadonlySet<ProductionMethod> = new Set<ProductionMethod>(["footage", "restage", "edit_footage", "composite"]);

/** Whether a cast member's action, in words, is performing the song (the one thing the take can show). */
export function actionIsPerforming(action: string): boolean {
  return /\b(perform|performs|performing|rap|raps|rapping|sing|sings|singing|deliver|delivers|delivering|to camera|the words|the line|the hook|the verse)\b/i.test(action);
}

/** The one limit a take-based method hits when the shot has him doing something the take does not show. */
function takeCannotShow(facts: RouteFacts): string | null {
  if (!facts.artist || facts.artist.performs) return null;
  const doing = facts.artist.action.trim() ? `has him ${facts.artist.action.trim()}` : "does not have him performing";
  return `The take shows him performing; this shot ${doing}. It has to be drawn with his identity pictures (generate), not cut from the take.`;
}

/** The method a shot asks for: the one it says, else the one its type has always meant. */
export function methodOf(spec: Pick<ShotSpec, "production" | "shotType">, hasTake: boolean): { method: ProductionMethod; inferred: boolean } {
  const said = spec.production?.method;
  if (said) return { method: said, inferred: false };
  if (spec.shotType === "performance") return { method: hasTake ? "restage" : "generate", inferred: true };
  return { method: "generate", inferred: true };
}

export function productionRoute(spec: Pick<ShotSpec, "production" | "shotType" | "wardrobe" | "timeline">, facts: RouteFacts): ProductionRoute {
  const { method, inferred } = methodOf(spec, facts.hasTake);
  const limits: string[] = [];
  const treatmentDresses = spec.wardrobe.source === "treatment";
  const base = { method, inferred };

  // a take-based method on a shot where he does not perform is not made weaker: it is refused, with the reason
  const cannot = TAKE_METHODS.has(method) ? takeCannotShow(facts) : null;
  if (cannot) {
    const path = method === "restage" ? RESTAGE : method === "footage" ? "the synced take, as filmed" : method === "composite" ? "his take, cut out → laid over this shot's approved place picture" : "his take → a video edit";
    return { ...base, verdict: "unsupported", path, where: null, limits: [cannot] };
  }

  switch (method) {
    case "footage":
      if (!facts.hasTake) limits.push("No take of his performance is in sync with this shot.");
      if (treatmentDresses) limits.push(`The treatment dresses him in ${spec.wardrobe.description || "a garment"} here; the footage shows what he was filmed in.`);
      return { ...base, verdict: limits.length ? "unsupported" : "storyboard", path: "the synced take, as filmed", where: null, limits };

    case "restage": {
      if (!facts.hasTake) limits.push("No take of his performance is in sync with this shot, so there is nothing to restage.");
      const seconds = spec.timeline.end - spec.timeline.start;
      if (facts.maxRestageSeconds && seconds > facts.maxRestageSeconds) limits.push(`${seconds.toFixed(1)} s is longer than one restaging carries (${facts.maxRestageSeconds} s): split the shot first.`);
      if (treatmentDresses) {
        // a restaging keeps the take's clothes by construction — the coat cannot come from here
        limits.push(`A restaging keeps the clothes of the take. The treatment dresses him in ${spec.wardrobe.description || "a named garment"} here: that needs the garment lane (keyframe + propagation), not a restaging.`);
        return { ...base, verdict: "elsewhere", path: RESTAGE, where: "Garment lane — Hero Frame Studio (approved keyframe, then propagation onto the take)", limits };
      }
      return { ...base, verdict: limits.length ? "unsupported" : "storyboard", path: RESTAGE, where: null, limits };
    }

    case "generate":
      if (spec.shotType === "performance" && facts.hasTake)
        limits.push("This is his performance: generating it would draw a stand-in. Restage or composite the take instead, unless the shot really is someone else.");
      return { ...base, verdict: limits.length ? "unsupported" : "storyboard", path: STILL_TO_CLIP, where: null, limits };

    case "edit_footage":
      if (!facts.hasTake) limits.push("There is no synced take to edit.");
      return {
        ...base,
        verdict: facts.hasTake ? "elsewhere" : "unsupported",
        path: "his take → a video edit (xAI videos/edits or Runway video-to-video), masked to the region that changes",
        where: "Video edit — Hero Frame Studio / Grok video edit runner; the storyboard does not submit video edits",
        limits,
      };

    case "composite":
      if (!facts.hasTake) limits.push("There is no synced take to cut out.");
      return {
        ...base,
        verdict: facts.hasTake ? "elsewhere" : "unsupported",
        path: "his take, cut out → laid over this shot's approved place picture (colour-matched)",
        where: "Composite harness (scripts/qa/composite_take.py) — the result is filed on the shot and plays in Review",
        limits,
      };

    case "multi_shot": {
      const tied = facts.links.filter((l) => l.kind === "reveals" || l.kind === "match_position" || l.kind === "continues");
      if (tied.length === 0) limits.push("A moment made across a cut needs a link to the shot on the other side of it (reveals / holds the position of / continues).");
      if (tied.some((l) => !l.other)) limits.push("A linked shot is not on this board.");
      // each half is its own shot; the cut is the edit's
      return { ...base, verdict: limits.length ? "unsupported" : "storyboard", path: `each side its own shot (${STILL_TO_CLIP}), cut together in Review`, where: null, limits };
    }
  }
}

/** One line for the card and the confirmation. */
export function routeLine(r: ProductionRoute): string {
  const head = `${METHOD_LABEL[r.method]}${r.inferred ? " (from the shot type)" : ""}`;
  if (r.verdict === "storyboard") return `${head} — ${r.path}.`;
  if (r.verdict === "elsewhere") return `${head} — not made on the storyboard: ${r.where}. ${r.limits.join(" ")}`.trim();
  return `${head} — cannot be made as written: ${r.limits.join(" ")}`;
}
