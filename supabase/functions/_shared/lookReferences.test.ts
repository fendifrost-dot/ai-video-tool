import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFERENCE_POLICY,
  composeConstraintsFirst,
  lookSpecificationText,
  orderLookReferences,
  resolveReferencePolicy,
} from "./lookReferences.ts";
import { getProviderCapability, SAFETY_MAX_REFERENCE_IMAGES } from "./providerCapabilities.ts";

const hero = {
  featureId: "hero",
  label: "Track jacket",
  featureType: "outerwear",
  refs: [
    { angle: "detail", storage_path: "w/hero_detail_collar.jpg" },
    { angle: "front", storage_path: "w/hero_flat.jpg" },
    { angle: "on_model", storage_path: "w/hero_on_model.jpg" },
    { angle: "detail", storage_path: "w/hero_detail_sleeve.jpg" },
  ],
};
const trousers = { featureId: "trs", label: "Pleated trousers", featureType: "bottoms", refs: [{ angle: "front", storage_path: "w/trs_flat.jpg" }] };
const glasses = { featureId: "gls", label: "Glasses", featureType: "accessory", refs: [{ angle: "on_model", storage_path: "w/hero_on_model.jpg" }] };

describe("resolveReferencePolicy", () => {
  it("layers artist < project < look < request and clamps to the provider ceiling", () => {
    const p = resolveReferencePolicy(8, { primaryPieceRefs: 2 }, { primaryPieceRefs: 3, maxRefs: 40 }, { otherPieceRefs: 2 }, { primaryPieceRefs: 5 });
    expect(p).toEqual({ outfitSheet: true, primaryPieceRefs: 5, otherPieceRefs: 2, maxRefs: 8 });
    expect(resolveReferencePolicy(8)).toEqual(DEFAULT_REFERENCE_POLICY);
    expect(resolveReferencePolicy(3, { maxRefs: 5 }).maxRefs).toBe(3);
  });
  it("ignores junk layers and non-numeric values", () => {
    expect(resolveReferencePolicy(8, null, undefined, { primaryPieceRefs: Number.NaN, outfitSheet: false })).toEqual({ ...DEFAULT_REFERENCE_POLICY, outfitSheet: false });
  });
});

describe("orderLookReferences (Look truth hierarchy)", () => {
  it("full_look: outfit sheet → hero primary refs → hero detail refs → other pieces, deduplicated, capped", () => {
    const policy = resolveReferencePolicy(8, { primaryPieceRefs: 4, otherPieceRefs: 1, maxRefs: 6 });
    const { paths, plan } = orderLookReferences({ mode: "full_look", outfitSheetPath: "looks/sheet.jpg", heroFeatureId: "hero", pieces: [trousers, hero, glasses], policy });
    expect(paths).toEqual(["looks/sheet.jpg", "w/hero_on_model.jpg", "w/hero_flat.jpg", "w/hero_detail_collar.jpg", "w/hero_detail_sleeve.jpg", "w/trs_flat.jpg"]);
    expect(plan.map((p) => p.role)).toEqual(["outfit_sheet", "primary_piece", "primary_piece", "detail", "detail", "other_piece"]);
    // glasses' only image is the hero's on-model shot — already sent, contributes nothing
    expect(plan.filter((p) => p.featureId === "gls")).toEqual([]);
  });
  it("respects maxRefs and the outfitSheet switch", () => {
    const policy = resolveReferencePolicy(8, { maxRefs: 2, outfitSheet: false });
    const { paths } = orderLookReferences({ mode: "full_look", outfitSheetPath: "looks/sheet.jpg", heroFeatureId: "hero", pieces: [hero, trousers], policy });
    expect(paths).toEqual(["w/hero_on_model.jpg", "w/hero_flat.jpg"]);
  });
  it("flat mode never sends on-model images or the outfit sheet (R4 benchmark rule)", () => {
    const policy = resolveReferencePolicy(8, { primaryPieceRefs: 1, otherPieceRefs: 1 });
    const { paths, plan } = orderLookReferences({ mode: "flat", outfitSheetPath: "looks/sheet.jpg", heroFeatureId: "hero", pieces: [hero, trousers, glasses], policy });
    expect(paths).toEqual(["w/hero_flat.jpg", "w/trs_flat.jpg"]);
    expect(plan.every((p) => p.role !== "outfit_sheet")).toBe(true);
  });
  it("a piece with no eligible gallery image contributes nothing (no degraded fallback)", () => {
    const policy = resolveReferencePolicy(8);
    const { paths } = orderLookReferences({ mode: "full_look", outfitSheetPath: null, heroFeatureId: "hero", pieces: [{ ...hero, refs: [] , fallbackPath: "w/hero_row.jpg" }], policy });
    expect(paths).toEqual([]);
  });
});

describe("lookSpecificationText + composeConstraintsFirst", () => {
  it("renders the recipe spec and one line per piece", () => {
    expect(lookSpecificationText({ spec: { collar: "stand collar", closure: "zipped" } }, [hero, trousers])).toBe(
      "collar: stand collar closure: zipped Pieces — outerwear: Track jacket; bottoms: Pleated trousers.",
    );
    expect(lookSpecificationText({}, [])).toBe("");
  });
  it("puts constraints first and never states them twice", () => {
    const once = composeConstraintsFirst(["ZIPPED CLOSED", "collar STANDS UP."], "body");
    expect(once).toBe("ZIPPED CLOSED. collar STANDS UP. Follow the reference photos exactly. body");
    expect(composeConstraintsFirst(["ZIPPED CLOSED", "collar STANDS UP."], once)).toBe(once);
    expect(composeConstraintsFirst([], "body")).toBe("body");
  });
});

describe("getProviderCapability", () => {
  const env = (v?: string) => ({ get: (n: string) => (n === "PROVIDER_CAPABILITIES_JSON" ? v : undefined) });
  it("returns defaults, applies env overrides, clamps to the safety ceiling", () => {
    expect(getProviderCapability("xai:videos/edits", env()).maxReferenceImages).toBe(8);
    expect(getProviderCapability("xai:videos/edits", env('{"xai:videos/edits":{"maxReferenceImages":3,"firstFrameConditioning":true}}'))).toMatchObject({ maxReferenceImages: 3, firstFrameConditioning: true });
    expect(getProviderCapability("xai:videos/edits", env('{"xai:videos/edits":{"maxReferenceImages":64}}')).maxReferenceImages).toBe(SAFETY_MAX_REFERENCE_IMAGES);
    expect(getProviderCapability("xai:videos/edits", env("not json")).maxReferenceImages).toBe(8);
    expect(getProviderCapability("nobody:nothing", env()).maxReferenceImages).toBe(1);
  });
});
