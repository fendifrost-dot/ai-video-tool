import { describe, expect, it } from "vitest";
import { indexEntities, type ContinuityEntity } from "@/lib/continuity/entities";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import {
  effectiveGarments,
  jobOutfitRecord,
  outfitFlags,
  outfitOutdated,
  outfitRecordOf,
  outfitWords,
  phraseNamesOutfit,
  resolveOutfit,
  scenesFromWriter,
  sceneAt,
  type Outfit,
  type Scene,
} from "./outfits";

const outfit = (
  over: Partial<ContinuityEntity> & {
    key: string;
    name: string;
    pieces?: string[];
    version?: number;
  },
): Outfit =>
  ({
    id: `id-${over.key}`,
    projectId: "p1",
    variationId: "v1",
    kind: "outfit",
    key: over.key,
    name: over.name,
    description: over.description ?? "",
    constraints: over.constraints ?? "",
    approvedAssetId: null,
    referenceAssetIds: [],
    cast: null,
    outfit: { garmentFeatureIds: over.pieces ?? [], version: over.version ?? 1 },
    archived: over.archived ?? false,
    createdAt: "t",
    updatedAt: "t",
  }) as Outfit;

const DENIM = outfit({
  key: "YSL_DENIM_LOOK",
  name: "YSL denim look",
  description: "black denim trucker jacket over black Mick jeans",
  pieces: ["jacket", "jeans"],
  version: 2,
});
const COAT = outfit({ key: "YSL_LEATHER_COAT", name: "YSL leather coat", pieces: ["coat"] });
const MASTIC = outfit({
  key: "MASTIC_TRACK_JACKET",
  name: "Mastic track jacket",
  pieces: ["track"],
});
const index = indexEntities([DENIM, COAT, MASTIC]);
const scene = (
  over: Partial<Scene> & { start: number; end: number; outfitKey: string | null },
): Scene => ({
  id: `s-${over.start}`,
  projectId: "p1",
  variationId: "v1",
  name: over.name ?? "scene",
  notes: "",
  createdAt: "t",
  updatedAt: "t",
  ...over,
});
const scenes = [
  scene({ name: "The viewer", start: 43, end: 59, outfitKey: "YSL_DENIM_LOOK" }),
  scene({ name: "Chicago", start: 59, end: 80, outfitKey: "YSL_LEATHER_COAT" }),
  scene({ name: "Undecided", start: 80, end: 90, outfitKey: null }),
];
const onFile = new Set(["jacket", "jeans", "coat", "track"]);

const spec = (over: Record<string, unknown> = {}, wardrobe: Record<string, unknown> = {}) =>
  parseShotSpec({
    id: "c012",
    purpose: "he watches",
    shotType: "narrative",
    kind: "generated",
    timeline: { start: 43.14, end: 47 },
    wardrobe: { description: "exact YSL denim look", source: "treatment", ...wardrobe },
    ...over,
  });

describe("which scene a moment falls in", () => {
  it("is the one containing it; the later start wins when scenes overlap", () => {
    expect(sceneAt(scenes, 45)?.name).toBe("The viewer");
    expect(sceneAt(scenes, 59)?.name).toBe("Chicago");
    expect(sceneAt(scenes, 100)).toBeNull();
    const nested = [
      ...scenes,
      scene({ name: "Close-up", start: 50, end: 52, outfitKey: "MASTIC_TRACK_JACKET" }),
    ];
    expect(sceneAt(nested, 51)?.name).toBe("Close-up");
  });
});

describe("what a shot wears", () => {
  it("inherits its scene's outfit", () => {
    const r = resolveOutfit(spec(), { start: 43.14 }, scenes, index);
    expect(r.outfit?.key).toBe("YSL_DENIM_LOOK");
    expect(r.source).toBe("scene");
    expect(r.scene?.name).toBe("The viewer");
  });
  it("a deliberate exception wears what the shot says, whatever the scene", () => {
    const r = resolveOutfit(
      spec({}, { outfitMode: "exception", outfitKey: "MASTIC_TRACK_JACKET" }),
      { start: 43.14 },
      scenes,
      index,
    );
    expect(r.outfit?.key).toBe("MASTIC_TRACK_JACKET");
    expect(r.source).toBe("shot");
  });
  it("none on purpose wears nothing even inside a dressed scene", () => {
    const r = resolveOutfit(spec({}, { outfitMode: "none" }), { start: 43.14 }, scenes, index);
    expect(r.outfit).toBeNull();
    expect(r.source).toBe("shot");
    expect(r.scene?.name).toBe("The viewer");
  });
  it("a key this video has no outfit for is reported, never ignored", () => {
    const r = resolveOutfit(
      spec({}, { outfitMode: "exception", outfitKey: "GONE" }),
      { start: 43.14 },
      scenes,
      index,
    );
    expect(r.outfit).toBeNull();
    expect(r.missingKey).toBe("GONE");
    const s = resolveOutfit(
      spec(),
      { start: 43.14 },
      [scene({ start: 40, end: 50, outfitKey: "GONE" })],
      index,
    );
    expect(s.missingKey).toBe("GONE");
  });
  it("outside every scene, nothing", () => {
    expect(resolveOutfit(spec(), { start: 200 }, scenes, index).source).toBe("none");
  });
});

describe("the pieces and the words generation receives", () => {
  it("are the outfit's pieces unless the shot names its own", () => {
    const r = resolveOutfit(spec(), { start: 43.14 }, scenes, index);
    expect(effectiveGarments(spec(), r)).toEqual({ ids: ["jacket", "jeans"], from: "outfit" });
    expect(effectiveGarments(spec({}, { garments: ["track"] }), r)).toEqual({
      ids: ["track"],
      from: "shot",
    });
    expect(effectiveGarments(spec(), { outfit: null })).toEqual({ ids: [], from: "none" });
  });
  it("words: the name, then the description and constraints", () => {
    expect(outfitWords(DENIM)).toBe(
      "YSL denim look: black denim trucker jacket over black Mick jeans.",
    );
    expect(outfitWords(COAT)).toBe("YSL leather coat");
  });
});

describe("the treatment's words against the outfits", () => {
  it("name an outfit when the identifying words agree, filler aside", () => {
    expect(phraseNamesOutfit("exact YSL denim look", DENIM)).toBe(true);
    expect(phraseNamesOutfit("his exact YSL leather coat", COAT)).toBe(true);
    expect(phraseNamesOutfit("exact YSL denim look", COAT)).toBe(false);
    expect(phraseNamesOutfit("specified YSL jacket", MASTIC)).toBe(false);
    expect(phraseNamesOutfit("none", DENIM)).toBe(false);
  });
  it("a dressed shot with no outfit assigned is a missing selection, with the matching outfit named", () => {
    const r = resolveOutfit(spec(), { start: 200 }, scenes, index);
    const f = outfitFlags(spec(), r, onFile, [DENIM, COAT, MASTIC]);
    expect(f).toHaveLength(1);
    expect(f[0].level).toBe("warning");
    expect(f[0].fix).toContain("YSL denim look");
  });
  it("a scene that contradicts the treatment is a warning, not obeyed in silence", () => {
    const r = resolveOutfit(spec(), { start: 60 }, scenes, index);
    const f = outfitFlags(spec(), r, onFile, [DENIM, COAT, MASTIC]);
    expect(f.map((x) => x.level)).toContain("warning");
    expect(f[0].text).toContain("YSL leather coat");
  });
  it("an outfit whose piece left the wardrobe blocks; an outfit with no pieces is words only", () => {
    const r = resolveOutfit(spec(), { start: 43.14 }, scenes, index);
    expect(
      outfitFlags(spec(), r, new Set(["jacket"]), [DENIM]).some((x) => x.level === "blocking"),
    ).toBe(true);
    const bare = indexEntities([outfit({ key: "YSL_DENIM_LOOK", name: "YSL denim look" })]);
    const r2 = resolveOutfit(spec(), { start: 43.14 }, scenes, bare);
    expect(outfitFlags(spec(), r2, onFile, [DENIM]).map((x) => x.level)).toEqual(["info"]);
  });
  it("a performance shot is his footage: no outfit flags", () => {
    const r = resolveOutfit(spec({ shotType: "performance" }), { start: 200 }, scenes, index);
    expect(outfitFlags(spec({ shotType: "performance" }), r, onFile, [DENIM])).toEqual([]);
  });
});

describe("scenes from the writer's words", () => {
  const box = (
    key: string,
    start: number,
    end: number,
    description: string,
    source = "treatment",
  ) => ({ key, start, end, spec: spec({}, { description, source }) });
  it("one scene per run of shots dressed in the same phrase, resolved to the outfit it names", () => {
    const boxes = [
      box("c011", 39, 43, "none", ""),
      box("c012", 43, 47, "exact YSL denim look"),
      box("c013", 47, 51, "exact YSL denim look"),
      box("c014", 51, 55, "none", ""),
      box("c015", 55, 59, "exact YSL denim look"),
      box("c017", 59, 63, "exact YSL leather coat"),
      box("c018", 63, 67, "exact YSL leather coat"),
      box("c023", 67, 71, "specified YSL jacket"),
    ];
    const out = scenesFromWriter(boxes, [DENIM, COAT, MASTIC]);
    expect(
      out.map((s) => [s.name, s.start, s.end, s.resolution, s.outfitKey, s.shotKeys.length]),
    ).toEqual([
      ["YSL denim look", 43, 51, "resolved", "YSL_DENIM_LOOK", 2],
      ["YSL denim look", 55, 59, "resolved", "YSL_DENIM_LOOK", 1],
      ["YSL leather coat", 59, 67, "resolved", "YSL_LEATHER_COAT", 2],
      ["specified YSL jacket", 67, 71, "unresolved", null, 1],
    ]);
  });
  it("a phrase several outfits answer to is ambiguous, with the candidates named", () => {
    const two = [outfit({ key: "A", name: "YSL denim" }), outfit({ key: "B", name: "denim look" })];
    const out = scenesFromWriter([box("c012", 43, 47, "exact YSL denim look")], two);
    expect(out[0].resolution).toBe("ambiguous");
    expect(out[0].candidates).toEqual(["YSL denim", "denim look"]);
  });
});

describe("what a job keeps, and what is outdated", () => {
  const r = resolveOutfit(spec(), { start: 43.14 }, scenes, index);
  const pieces = effectiveGarments(spec(), r).ids;
  it("the job records key, version, pieces and words; and reads them back", () => {
    const rec = jobOutfitRecord(r, pieces);
    expect(rec).toEqual({
      key: "YSL_DENIM_LOOK",
      name: "YSL denim look",
      version: 2,
      pieces: ["jacket", "jeans"],
      words: outfitWords(DENIM),
      source: "scene",
    });
    expect(outfitRecordOf({ outfit: rec })).toEqual(rec);
    expect(outfitRecordOf({ outfit: { name: "x" } })).toBeNull();
    expect(outfitRecordOf(null)).toBeNull();
  });
  it("current when made from the same outfit version and pieces", () => {
    expect(outfitOutdated(r, jobOutfitRecord(r, pieces), pieces)).toBeNull();
    expect(outfitOutdated({ ...r, outfit: null }, null, [])).toBeNull();
  });
  it("outdated when the outfit moved on, changed, appeared or went", () => {
    expect(outfitOutdated(r, { ...jobOutfitRecord(r, pieces)!, version: 1 }, pieces)).toContain(
      "v1",
    );
    expect(
      outfitOutdated(
        r,
        { ...jobOutfitRecord(r, pieces)!, key: "YSL_LEATHER_COAT", name: "YSL leather coat" },
        pieces,
      ),
    ).toContain("now wears");
    expect(outfitOutdated(r, null, pieces)).toContain("before the shot wore");
    expect(outfitOutdated({ ...r, outfit: null }, jobOutfitRecord(r, pieces), [])).toContain(
      "no outfit",
    );
    expect(
      outfitOutdated(r, { ...jobOutfitRecord(r, pieces)!, pieces: ["jacket"] }, pieces),
    ).toContain("other pieces");
  });
});
