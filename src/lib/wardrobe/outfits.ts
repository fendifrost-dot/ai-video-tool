/**
 * Outfits — what the artist wears, defined once per video and inherited by the shots of a scene.
 *
 * An OUTFIT is a continuity entity of kind `outfit` (entities.ts OutfitFacts): its words (description, constraints)
 * and its exact pieces — the artist's own garment photographs (character_features rows of a wardrobe_* type, shared
 * across projects), in the order they are sent as reference pictures. The database versions it: the version moves
 * when the name, the words or the pieces change.
 *
 * A SCENE is a stretch of the song that wears one outfit (variation_scenes). A shot inside it inherits that outfit
 * unless its own record says otherwise (wardrobe.outfitMode: inherit | exception | none).
 *
 * The WRITER puts the treatment's own wardrobe words on each shot (wardrobe.description with source "treatment":
 * "exact YSL denim look"). Those words never dress anyone by themselves: they are what scenes are resolved from
 * (scenesFromWriter) and checked against (outfitFlags), so a scene that contradicts the treatment is seen, never
 * silently obeyed.
 *
 * Everything here is pure. A job records what it was given (jobOutfitRecord) and a box made from an older outfit
 * version is outdated (outfitOutdated) — never silently current.
 */
import type { ContinuityEntity, EntityIndex, OutfitFacts } from "@/lib/continuity/entities";
import type { ShotSpec } from "@/lib/treatment/shotSpec";

export type Scene = {
  id: string;
  projectId: string;
  variationId: string;
  name: string;
  /** Song seconds. */
  start: number;
  end: number;
  /** The outfit worn (continuity_entities.key of an outfit); null = not decided yet. */
  outfitKey: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SceneRow = {
  id: string;
  project_id: string;
  variation_id: string;
  name: string;
  start_seconds: number | string;
  end_seconds: number | string;
  outfit_key: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export function sceneFromRow(r: SceneRow): Scene {
  return {
    id: r.id,
    projectId: r.project_id,
    variationId: r.variation_id,
    name: r.name,
    start: Number(r.start_seconds),
    end: Number(r.end_seconds),
    outfitKey: r.outfit_key ?? null,
    notes: r.notes ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type Outfit = ContinuityEntity & { outfit: OutfitFacts };

export const isOutfit = (e: ContinuityEntity): e is Outfit => e.kind === "outfit" && !!e.outfit;

/** The scene a moment of the song falls in: the one containing it; when scenes overlap, the one that starts last (the more specific). */
export function sceneAt(scenes: readonly Scene[], at: number): Scene | null {
  let best: Scene | null = null;
  for (const s of scenes)
    if (at >= s.start && at < s.end && (!best || s.start >= best.start)) best = s;
  return best;
}

/** The scene a shot plays in: by the moment it opens. */
export function sceneOfShot(scenes: readonly Scene[], window: { start: number }): Scene | null {
  return sceneAt(scenes, window.start);
}

export type ShotOutfit = {
  /** The outfit the shot wears, resolved; null = none. */
  outfit: Outfit | null;
  /** Where that came from: the shot's own record, its scene, or nowhere. */
  source: "shot" | "scene" | "none";
  mode: ShotSpec["wardrobe"]["outfitMode"];
  /** The scene the shot falls in, whatever it wears. */
  scene: Scene | null;
  /** A key the shot or its scene names that this variation has no outfit for. Never dropped silently. */
  missingKey: string | null;
};

/**
 * What a shot wears. The shot's own record wins (an exception, or "none" on purpose); otherwise its scene's outfit;
 * otherwise nothing. A key that names no outfit of the variation is reported, not ignored.
 */
export function resolveOutfit(
  spec: Pick<ShotSpec, "wardrobe">,
  window: { start: number },
  scenes: readonly Scene[],
  index: EntityIndex,
): ShotOutfit {
  const scene = sceneOfShot(scenes, window);
  const mode = spec.wardrobe.outfitMode ?? "inherit";
  const find = (key: string | null): { outfit: Outfit | null; missing: string | null } => {
    if (!key) return { outfit: null, missing: null };
    const e = index.get(key);
    return e && isOutfit(e) ? { outfit: e, missing: null } : { outfit: null, missing: key };
  };
  if (mode === "none") return { outfit: null, source: "shot", mode, scene, missingKey: null };
  if (mode === "exception") {
    const { outfit, missing } = find(spec.wardrobe.outfitKey ?? null);
    return { outfit, source: outfit ? "shot" : "none", mode, scene, missingKey: missing };
  }
  const { outfit, missing } = find(scene?.outfitKey ?? null);
  return { outfit, source: outfit ? "scene" : "none", mode, scene, missingKey: missing };
}

/** The outfit's words as the artist's line carries them: its name, then its description and constraints. */
export function outfitWords(outfit: Pick<Outfit, "name" | "description" | "constraints">): string {
  const sentence = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : "";
  };
  const words = [sentence(outfit.description), sentence(outfit.constraints)]
    .filter(Boolean)
    .join(" ");
  return words ? `${outfit.name.trim()}: ${words}` : outfit.name.trim();
}

/**
 * The exact pieces a shot is dressed in: its own `wardrobe.garments` when it names any (the shot's own choice, an
 * exception at the piece level), else its outfit's pieces, else none.
 */
export function effectiveGarments(
  spec: Pick<ShotSpec, "wardrobe">,
  resolved: Pick<ShotOutfit, "outfit">,
): { ids: string[]; from: "shot" | "outfit" | "none" } {
  if (spec.wardrobe.garments.length > 0) return { ids: [...spec.wardrobe.garments], from: "shot" };
  if (resolved.outfit)
    return { ids: [...resolved.outfit.outfit.garmentFeatureIds], from: "outfit" };
  return { ids: [], from: "none" };
}

// --- the treatment's words against the scenes ---------------------------------------------------------------------

const NOISE = new Set([
  "exact",
  "exactly",
  "his",
  "her",
  "their",
  "the",
  "a",
  "an",
  "in",
  "look",
  "outfit",
  "wearing",
  "wears",
  "specified",
  "same",
]);

/** The words that identify an outfit in prose: lower-case, no punctuation, without the filler. */
export function outfitTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !NOISE.has(w));
}

/**
 * Does the writer's wardrobe phrase name this outfit? True when every identifying word of the outfit's name is in the
 * phrase, or every identifying word of the phrase is in the outfit's name (an outfit "YSL denim look" against "exact
 * YSL denim look"; "YSL leather coat" against "exact YSL denim look" is not a match).
 */
export function phraseNamesOutfit(phrase: string, outfit: Pick<Outfit, "name">): boolean {
  const p = new Set(outfitTokens(phrase));
  const n = outfitTokens(outfit.name);
  if (p.size === 0 || n.length === 0) return false;
  const nameInPhrase = n.every((w) => p.has(w));
  const phraseInName = [...p].every((w) => n.includes(w));
  return nameInPhrase || phraseInName;
}

/** The outfits of the variation a writer's phrase names. One = resolved; none = unresolved; several = ambiguous. */
export function outfitsNamedBy(phrase: string, outfits: readonly Outfit[]): Outfit[] {
  const t = phrase.trim();
  if (!t || /^(none|n\/a|-)$/i.test(t)) return [];
  return outfits.filter((o) => !o.archived && phraseNamesOutfit(t, o));
}

export type OutfitFlag = {
  /** blocking = the still is not generated as asked; warning = your decision is missing or contradicted; info = said, not stopped. */
  level: "blocking" | "warning" | "info";
  text: string;
  fix: string;
};

/**
 * What stands between a shot and being dressed as the treatment asks, said before anything is generated:
 *   • the writer dresses him and no scene or exception does (your selection is missing);
 *   • the outfit worn contradicts the writer's words (a scene boundary or an exception the treatment did not ask for);
 *   • the outfit names a piece the wardrobe no longer has (blocking: an exact piece cannot be sent);
 *   • the outfit has no pieces (words only — he is described, not held exactly);
 *   • a key names no outfit of this video.
 * A performance shot is his real footage: its wardrobe is what he was filmed in (boxes.ts wardrobeGap), not these.
 */
export function outfitFlags(
  spec: Pick<ShotSpec, "wardrobe" | "shotType">,
  resolved: ShotOutfit,
  wardrobeOnFile: ReadonlySet<string>,
  outfits: readonly Outfit[],
): OutfitFlag[] {
  const flags: OutfitFlag[] = [];
  if (spec.shotType === "performance") return flags;
  const phrase = spec.wardrobe.source === "treatment" ? spec.wardrobe.description.trim() : "";
  const named = phrase ? outfitsNamedBy(phrase, outfits) : [];
  if (resolved.missingKey) {
    flags.push({
      level: "blocking",
      text: `This shot points at an outfit this video does not have (${resolved.missingKey}).`,
      fix: "Choose the outfit again, or set the shot to inherit its scene's.",
    });
  }
  if (!resolved.outfit) {
    if (phrase && resolved.mode !== "none") {
      flags.push({
        level: "warning",
        text: `The treatment dresses him in “${phrase}” here and no outfit is assigned: nothing exact is sent and the words are an interpretation.`,
        fix:
          named.length === 1
            ? `Assign “${named[0].name}” to this stretch of the song (a scene), or set it on this shot as an exception.`
            : named.length > 1
              ? `Several outfits match those words (${named.map((o) => o.name).join(", ")}): assign one to this stretch of the song.`
              : "Define the outfit once (its pieces from the wardrobe), then assign it to this stretch of the song.",
      });
    }
    return flags;
  }
  const o = resolved.outfit;
  if (phrase && named.length > 0 && !named.some((n) => n.key === o.key)) {
    flags.push({
      level: "warning",
      text: `The treatment dresses him in “${phrase}” here, but the shot wears “${o.name}” (${resolved.source === "shot" ? "set on this shot" : `from the scene “${resolved.scene?.name ?? ""}”`}).`,
      fix: "Move the scene boundary, change the scene's outfit, or keep it and the treatment is overruled here on purpose.",
    });
  } else if (phrase && named.length === 0) {
    flags.push({
      level: "info",
      text: `The treatment's words here (“${phrase}”) name no outfit of this video; the shot wears “${o.name}”.`,
      fix: "Rename the outfit to the treatment's words if it is the same thing, or leave it: the scene decides.",
    });
  }
  const pieces = effectiveGarments(spec, resolved);
  const gone = pieces.ids.filter((id) => !wardrobeOnFile.has(id));
  if (gone.length)
    flags.push({
      level: "blocking",
      text: `${gone.length === 1 ? "A piece" : `${gone.length} pieces`} of “${o.name}” ${gone.length === 1 ? "is" : "are"} no longer in the wardrobe: it cannot be sent as a picture.`,
      fix: "Choose the piece again in the outfit, or take it off.",
    });
  if (pieces.ids.length === 0)
    flags.push({
      level: "info",
      text: `“${o.name}” has no pieces: he is described in words only, nothing is held exactly.`,
      fix: "Add its pieces from the wardrobe (upload them there first if they are not photographed yet).",
    });
  if (pieces.from === "shot")
    flags.push({
      level: "info",
      text: `This shot names its own pieces instead of “${o.name}”'s.`,
      fix: "Clear the shot's garments to wear the outfit's pieces.",
    });
  return flags;
}

// --- scenes from the writer's words -------------------------------------------------------------------------------

export type ProposedScene = {
  name: string;
  start: number;
  end: number;
  /** The writer's phrase these shots share. */
  phrase: string;
  /** The one outfit the phrase names, when it names exactly one. */
  outfitKey: string | null;
  /** How the phrase resolved: one outfit, none, or several. */
  resolution: "resolved" | "unresolved" | "ambiguous";
  candidates: string[];
  shotKeys: string[];
};

/**
 * The scenes the writer's words imply: each run of consecutive shots the treatment dresses in the same phrase is one
 * scene, named by the phrase, resolved to the one outfit the phrase names. Nothing is written here; the director
 * adopts them (and gives them pieces) in the storyboard. A shot the writer did not dress breaks a run.
 */
export function scenesFromWriter(
  boxes: readonly { key: string; start: number; end: number; spec: Pick<ShotSpec, "wardrobe"> }[],
  outfits: readonly Outfit[],
): ProposedScene[] {
  const sorted = [...boxes].sort((a, b) => a.start - b.start);
  const out: ProposedScene[] = [];
  for (const b of sorted) {
    const phrase = b.spec.wardrobe.source === "treatment" ? b.spec.wardrobe.description.trim() : "";
    if (!phrase || /^(none|n\/a|-)$/i.test(phrase)) continue;
    const last = out[out.length - 1];
    const prevKey = sorted[sorted.indexOf(b) - 1]?.key;
    if (
      last &&
      last.phrase.toLowerCase() === phrase.toLowerCase() &&
      last.shotKeys[last.shotKeys.length - 1] === prevKey
    ) {
      last.end = Math.max(last.end, b.end);
      last.shotKeys.push(b.key);
      continue;
    }
    const named = outfitsNamedBy(phrase, outfits);
    out.push({
      name: phrase.replace(/^exact\s+/i, ""),
      start: b.start,
      end: b.end,
      phrase,
      outfitKey: named.length === 1 ? named[0].key : null,
      resolution: named.length === 1 ? "resolved" : named.length === 0 ? "unresolved" : "ambiguous",
      candidates: named.map((o) => o.name),
      shotKeys: [b.key],
    });
  }
  return out;
}

// --- what a job records, and what is outdated ------------------------------------------------------------------

/** What a generation job keeps of the outfit it was given — enough to say later whether the result is current. */
export type OutfitRecord = {
  key: string;
  name: string;
  version: number;
  pieces: string[];
  words: string;
  source: ShotOutfit["source"];
};

export function jobOutfitRecord(
  resolved: ShotOutfit,
  pieces: readonly string[],
): OutfitRecord | null {
  if (!resolved.outfit) return null;
  return {
    key: resolved.outfit.key,
    name: resolved.outfit.name,
    version: resolved.outfit.outfit.version,
    pieces: [...pieces],
    words: outfitWords(resolved.outfit),
    source: resolved.source,
  };
}

/** Read an outfit record back from a job's settings (anything else there is ignored). */
export function outfitRecordOf(
  settings: Record<string, unknown> | null | undefined,
): OutfitRecord | null {
  const o = settings?.outfit;
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r.key !== "string" || typeof r.version !== "number") return null;
  return {
    key: r.key,
    name: String(r.name ?? ""),
    version: r.version,
    pieces: Array.isArray(r.pieces)
      ? r.pieces.filter((x): x is string => typeof x === "string")
      : [],
    words: String(r.words ?? ""),
    source: (r.source as ShotOutfit["source"]) ?? "none",
  };
}

/**
 * Why a picture or clip made earlier no longer matches what the shot wears now — or null when it still does. A box
 * is outdated when the outfit changed since (a newer version), when it now wears a different outfit, or when it
 * wore one and now wears none (and the other way round). "Made with no outfit, still no outfit" is current.
 */
export function outfitOutdated(
  resolved: ShotOutfit,
  made: OutfitRecord | null,
  pieces: readonly string[],
): string | null {
  const now = resolved.outfit;
  if (!now && !made) return null;
  if (!now && made) return `made wearing “${made.name}”; the shot now wears no outfit`;
  if (now && !made) return `made before the shot wore “${now.name}”`;
  if (now && made) {
    if (made.key !== now.key)
      return `made wearing “${made.name}”; the shot now wears “${now.name}”`;
    if (made.version < now.outfit.version)
      return `made with “${now.name}” v${made.version}; it is now v${now.outfit.version}`;
    const same =
      made.pieces.length === pieces.length && made.pieces.every((p, i) => p === pieces[i]);
    if (!same) return `made with other pieces of “${now.name}” than the shot wears now`;
  }
  return null;
}
