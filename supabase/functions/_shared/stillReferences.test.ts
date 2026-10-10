import { describe, expect, it } from "vitest";
import { boundedInt, inFolderOf, normalizeResolution, parseReferenceRequest, pickReferenceModel, planStillRequest, redactSigned, REFERENCE_MODELS, referenceRateUsd, referenceTiers, resolveReferences } from "./stillReferences.ts";
import { getProviderCapability } from "./providerCapabilities.ts";

const P = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("a still request's reference pictures are held to the caller before anything is signed", () => {
  it("parses records by id; refuses paths, URLs, unknown roles and duplicates", () => {
    expect(parseReferenceRequest(undefined)).toEqual({ refs: [], error: null });
    expect(parseReferenceRequest([{ source: "project_asset", id: id(1), role: "screen", label: "shot 1" }]).refs).toHaveLength(1);
    expect(parseReferenceRequest([{ source: "project_asset", id: "u/p/worlds/x.png", role: "place" }]).error).toMatch(/record id/);
    expect(parseReferenceRequest([{ source: "url", id: id(1), role: "place" }]).error).toMatch(/source/);
    expect(parseReferenceRequest([{ source: "project_asset", id: id(1), role: "anything" }]).error).toMatch(/role/);
    expect(parseReferenceRequest([{ source: "project_asset", id: id(1), role: "place" }, { source: "project_asset", id: id(1), role: "screen" }]).error).toMatch(/twice/);
    expect(parseReferenceRequest("x").error).toMatch(/list/);
  });

  it("an asset of another project, a non-image and a file in another bucket are refused by name", () => {
    const refs = parseReferenceRequest([
      { source: "project_asset", id: id(1), role: "screen", label: "mine" },
      { source: "project_asset", id: id(2), role: "place", label: "someone else's" },
      { source: "project_asset", id: id(3), role: "place", label: "a video" },
      { source: "project_asset", id: id(4), role: "place", label: "an export" },
    ]).refs;
    const r = resolveReferences(refs, {
      projectId: P,
      assets: [
        { id: id(1), project_id: P, file_url: `u/${P}/worlds/a.png`, asset_type: "reference_image", metadata_json: { bucket: "project-references", mime_type: "image/png" } },
        { id: id(2), project_id: "22222222-2222-4222-8222-222222222222", file_url: "u/q/b.png", asset_type: "reference_image", metadata_json: {} },
        { id: id(3), project_id: P, file_url: `u/${P}/take.mp4`, asset_type: "reference_video", metadata_json: { mime_type: "video/mp4" } },
        { id: id(4), project_id: P, file_url: `u/${P}/x.png`, asset_type: "reference_image", metadata_json: { bucket: "project-exports", mime_type: "image/png" } },
      ],
      features: [],
      ownArtists: new Set(),
    });
    expect(r.resolved.map((x) => [x.ref.label, x.path, x.buckets])).toEqual([["mine", `u/${P}/worlds/a.png`, ["project-references"]]]);
    expect(r.refused.map((x) => [x.ref.label, x.why])).toEqual([
      ["someone else's", "not an asset of this project"],
      ["a video", "it is not an image"],
      ["an export", "its file is in project-exports, which this route does not read"],
    ]);
  });

  it("a generated still with no bucket on its row is read where the app reads it (project-clips)", () => {
    const refs = parseReferenceRequest([{ source: "project_asset", id: id(5), role: "screen", label: "s" }]).refs;
    const r = resolveReferences(refs, { projectId: P, assets: [{ id: id(5), project_id: P, file_url: `u/${P}/still.jpg`, asset_type: "generated_still", metadata_json: { mime_type: "image/jpeg" } }], features: [], ownArtists: new Set() });
    expect(r.resolved[0].buckets).toEqual(["project-clips"]);
  });

  it("a wardrobe picture must belong to one of the caller's artists", () => {
    const refs = parseReferenceRequest([
      { source: "character_feature", id: id(6), role: "garment", label: "jacket" },
      { source: "character_feature", id: id(7), role: "garment", label: "not mine" },
    ]).refs;
    const r = resolveReferences(refs, {
      projectId: P,
      assets: [],
      features: [
        { id: id(6), artist_id: "artist-1", storage_path: "u/artist-1/jacket.jpg", feature_type: "wardrobe_outerwear", file_url: null },
        { id: id(7), artist_id: "artist-2", storage_path: "v/artist-2/coat.jpg", file_url: null },
      ],
      ownArtists: new Set(["artist-1"]),
    });
    expect(r.resolved.map((x) => x.ref.label)).toEqual(["jacket"]);
    expect(r.resolved[0].buckets).toEqual(["wardrobe-refs"]);
    expect(r.refused).toEqual([{ ref: expect.objectContaining({ label: "not mine" }), why: "not a picture of one of your artists" }]);
  });

  it("keeps the order it was given — the order the prompt names them in", () => {
    const refs = parseReferenceRequest([
      { source: "character_feature", id: id(6), role: "garment", label: "jacket" },
      { source: "project_asset", id: id(1), role: "place", label: "place" },
    ]).refs;
    const r = resolveReferences(refs, {
      projectId: P,
      assets: [{ id: id(1), project_id: P, file_url: `u/${P}/a.png`, asset_type: "reference_image", metadata_json: {} }],
      features: [{ id: id(6), artist_id: "a1", storage_path: "u/a1/j.png", file_url: null }],
      ownArtists: new Set(["a1"]),
    });
    expect(r.resolved.map((x) => x.ref.label)).toEqual(["jacket", "place"]);
  });

  it("a row the caller wrote that points at ANOTHER user's file is refused — the file must be in this project's or artist's folder", () => {
    const victim = "99999999-9999-4999-8999-999999999999";
    const refs = parseReferenceRequest([
      { source: "project_asset", id: id(8), role: "place", label: "pointed at someone else's still" },
      { source: "character_feature", id: id(9), role: "garment", label: "pointed at someone else's wardrobe" },
      { source: "project_asset", id: id(10), role: "place", label: "a legacy uid folder, this project" },
    ]).refs;
    const r = resolveReferences(refs, {
      projectId: P,
      assets: [
        { id: id(8), project_id: P, file_url: `victimuid/${victim}/worlds/x.png`, asset_type: "reference_image", metadata_json: { bucket: "project-references", mime_type: "image/png" } },
        { id: id(10), project_id: P, file_url: `old-anon-uid/${P}/upload.jpg`, asset_type: "reference_image", metadata_json: { bucket: "project-references", mime_type: "image/jpeg" } },
      ],
      features: [{ id: id(9), artist_id: "a1", storage_path: `victimuid/${victim}/coat.png`, file_url: null, feature_type: "wardrobe_outerwear" }],
      ownArtists: new Set(["a1"]),
    });
    expect(r.refused.map((x) => [x.ref.label, x.why])).toEqual([
      ["pointed at someone else's still", "its file is not in this project's folder"],
      ["pointed at someone else's wardrobe", "its file is not in its artist's folder"],
    ]);
    expect(r.resolved.map((x) => x.ref.label)).toEqual(["a legacy uid folder, this project"]);
  });

  it("folder checks refuse traversal; a video labelled as an image is refused; signed tokens are redacted; bad numbers fall back", () => {
    expect(inFolderOf(`u/${P}/../x/y.png`, P)).toBe(false);
    expect(inFolderOf(`u/${P}`, P)).toBe(false);
    const refs = parseReferenceRequest([{ source: "project_asset", id: id(11), role: "place", label: "mislabelled" }]).refs;
    const r = resolveReferences(refs, { projectId: P, assets: [{ id: id(11), project_id: P, file_url: `u/${P}/t.mp4`, asset_type: "reference_image", metadata_json: { mime_type: "image/png" } }], features: [], ownArtists: new Set() });
    expect(r.refused[0].why).toBe("it is not an image");
    expect(redactSigned('bad image "https://x.supabase.co/storage/v1/object/sign/b/p.png?token=eyJhbGci.abc"')).not.toContain("eyJhbGci");
    expect(boundedInt("NaN", 1, 1, 4)).toBe(1);
    expect(boundedInt(9, 1, 1, 4)).toBe(4);
    expect(boundedInt(undefined, 2, 1, 4)).toBe(2);
  });

  it("an identity picture (face) is signed from artist-assets, a wardrobe picture from wardrobe-refs — one bucket each", () => {
    const refs = parseReferenceRequest([
      { source: "character_feature", id: id(12), role: "cast", label: "the artist" },
      { source: "character_feature", id: id(13), role: "garment", label: "jacket" },
    ]).refs;
    const r = resolveReferences(refs, {
      projectId: P,
      assets: [],
      features: [
        { id: id(12), artist_id: "a1", storage_path: "u/a1/face/neutral.jpg", file_url: null, feature_type: "face" },
        { id: id(13), artist_id: "a1", storage_path: "u/a1/jacket.png", file_url: null, feature_type: "wardrobe_outerwear" },
      ],
      ownArtists: new Set(["a1"]),
    });
    expect(r.resolved.map((x) => x.buckets)).toEqual([["artist-assets"], ["wardrobe-refs"]]);
  });

  it("a picture row from before the multi-angle column (storage_path null, file_url set) is read from file_url — the same folder and image checks apply", () => {
    const refs = parseReferenceRequest([
      { source: "character_feature", id: id(14), role: "garment", label: "old row" },
      { source: "character_feature", id: id(15), role: "garment", label: "old row, elsewhere" },
    ]).refs;
    const r = resolveReferences(refs, {
      projectId: P,
      assets: [],
      features: [
        { id: id(14), artist_id: "a1", storage_path: null, file_url: "u/a1/coat.jpg", feature_type: "wardrobe_outerwear" },
        { id: id(15), artist_id: "a1", storage_path: null, file_url: "u/other/coat.jpg", feature_type: "wardrobe_outerwear" },
      ],
      ownArtists: new Set(["a1"]),
    });
    expect(r.resolved.map((x) => [x.ref.label, x.path])).toEqual([["old row", "u/a1/coat.jpg"]]);
    expect(r.refused.map((x) => x.why)).toEqual(["its file is not in its artist's folder"]);
  });
});

describe("the edit model of a still is the first that takes all its pictures", () => {
  const capOf = (m: string) => getProviderCapability("xai:images/edits", { get: () => undefined }, m).maxReferenceImages;

  it("a request the model in use takes is drawn on it, exactly as before; only a larger one moves", () => {
    for (const count of [0, 1, 2, 3]) expect(pickReferenceModel(count, capOf).pick?.model).toBe("grok-imagine-image-quality");
    for (const count of [4, 5]) expect(pickReferenceModel(count, capOf).pick?.model).toBe("grok-imagine-image-2.0");
  });

  it("what the app is told it may send is the most any listed model takes; one picture more than that is refused, not trimmed", () => {
    expect(pickReferenceModel(0, capOf).most).toBe(5);
    expect(pickReferenceModel(6, capOf)).toEqual({ pick: null, most: 5 });
  });

  it("the limit is the provider capability at request time, so an override that lowers a model sends the request elsewhere or nowhere", () => {
    const lowered = (m: string) => (m === "grok-imagine-image-2.0" ? 3 : capOf(m));
    expect(pickReferenceModel(3, lowered).pick?.model).toBe("grok-imagine-image-quality");
    expect(pickReferenceModel(4, lowered)).toEqual({ pick: null, most: 3 });
    expect(pickReferenceModel(1, () => Number.NaN)).toEqual({ pick: null, most: 0 });
  });

  it("the estimate counts the input pictures where the provider charges for them, and an unlisted resolution prices at the dearest", () => {
    const [quality, two] = REFERENCE_MODELS;
    expect(referenceRateUsd(quality, "2k", 3)).toBe(0.07);
    expect(referenceRateUsd(two, "2k", 5)).toBe(0.13);
    expect(referenceRateUsd(two, "1K", 4)).toBe(0.1);
    expect(referenceRateUsd(two, "4k", 0)).toBe(0.08);
  });
});

describe("what a still request is drawn on and estimated at is decided in one place, before any file or the provider is touched", () => {
  const capOf = (m: string) => getProviderCapability("xai:images/edits", { get: () => undefined }, m).maxReferenceImages;
  const generationRateOf = (m: string) => ({ "grok-imagine-image-quality": 0.07, "grok-imagine-image": 0.02, "grok-imagine-image-2.0": 0.08 })[m] ?? 0.08;
  const plan = (over: Partial<Parameters<typeof planStillRequest>[0]>) => planStillRequest({ pictures: 0, n: 2, resolution: "2k", defaultModel: "grok-imagine-image-quality", maxCostUsd: 0.5, capOf, generationRateOf, ...over });

  it("no pictures: the generations route, the caller's model honoured, the generations price, and no reference model named", () => {
    expect(plan({})).toMatchObject({ ok: true, model: "grok-imagine-image-quality", referenceModel: null, rate: 0.07, estimatedCostUsd: 0.14, overGate: false, modelOverridden: false, costBasis: null, maxReferences: 5 });
    expect(plan({ askedModel: "grok-imagine-image" })).toMatchObject({ ok: true, model: "grok-imagine-image", rate: 0.02, estimatedCostUsd: 0.04 });
  });

  it("up to three pictures: the model in use at its rate, exactly as before a second model was listed", () => {
    expect(plan({ pictures: 3 })).toMatchObject({ ok: true, model: "grok-imagine-image-quality", referenceModel: "grok-imagine-image-quality", rate: 0.07, estimatedCostUsd: 0.14, modelOverridden: false, costBasis: "generations list rate; edits rate unverified" });
    expect(plan({ pictures: 3, askedModel: "grok-imagine-image-quality" })).toMatchObject({ ok: true, modelOverridden: false });
  });

  it("four or five pictures: the larger model, priced with its input pictures, the basis of the estimate said", () => {
    expect(plan({ pictures: 4 })).toMatchObject({ ok: true, model: "grok-imagine-image-2.0", referenceModel: "grok-imagine-image-2.0", rate: 0.12, estimatedCostUsd: 0.24, overGate: false });
    const five = plan({ pictures: 5 });
    expect(five).toMatchObject({ ok: true, rate: 0.13, estimatedCostUsd: 0.26 });
    expect(five.ok && five.costBasis).toMatch(/list rate at medium quality.*billed amount unverified/);
  });

  it("six pictures are refused, never trimmed; five at four candidates is over the default gate", () => {
    expect(plan({ pictures: 6 })).toEqual({ ok: false, error: "references_over_capability", detail: expect.stringContaining("at most 5"), maxReferences: 5 });
    expect(plan({ pictures: 5, n: 4 })).toMatchObject({ ok: true, estimatedCostUsd: 0.52, overGate: true });
  });

  it("a listed model the caller names is the one when it takes the pictures — a board kept on one model, one shot drawn on both", () => {
    expect(plan({ pictures: 3, askedModel: "grok-imagine-image-2.0" })).toMatchObject({ ok: true, model: "grok-imagine-image-2.0", rate: 0.11, modelOverridden: false });
    // a listed model too small for the request, and a model that is not listed, are set aside and said
    expect(plan({ pictures: 4, askedModel: "grok-imagine-image-quality" })).toMatchObject({ ok: true, model: "grok-imagine-image-2.0", modelOverridden: true });
    expect(plan({ pictures: 2, askedModel: "grok-imagine-image" })).toMatchObject({ ok: true, model: "grok-imagine-image-quality", modelOverridden: true });
  });

  it("lowering the larger model by its own key is the way back without a redeploy: over three is refused before spend again", () => {
    const back = (m: string) => getProviderCapability("xai:images/edits", { get: () => JSON.stringify({ "xai:images/edits:grok-imagine-image-2.0": { maxReferenceImages: 3 } }) }, m).maxReferenceImages;
    expect(referenceTiers(back).map((t) => t.maxReferences)).toEqual([3, 3]);
    expect(plan({ pictures: 4, capOf: back })).toMatchObject({ ok: false, maxReferences: 3 });
    expect(plan({ pictures: 3, capOf: back })).toMatchObject({ ok: true, model: "grok-imagine-image-quality" });
  });

  it("a gate never opens on an estimate that is not a number, and the app is told each model with its own limit and rate", () => {
    expect(plan({ pictures: 2, generationRateOf: () => Number.NaN, capOf: () => 5, models: [{ model: "m", usdPerImage: { "2k": Number.NaN }, usdPerInputImage: 0, basis: "" }] })).toMatchObject({ ok: true, overGate: true });
    const p = plan({});
    expect(p.ok && p.referenceModels.map((t) => [t.model, t.maxReferences, t.usdPerImage["2k"], t.usdPerInputImage])).toEqual([["grok-imagine-image-quality", 3, 0.07, 0], ["grok-imagine-image-2.0", 5, 0.08, 0.01]]);
  });

  it("the resolution is the caller's and it prices the request: only the two a still is asked for at are taken", () => {
    expect(normalizeResolution(undefined)).toBe("2k");
    expect(normalizeResolution("2K")).toBe("2k");
    expect(normalizeResolution("1k")).toBe("1k");
    for (const bad of ["4k", "", 2, {}, "constructor", "__proto__"]) expect(normalizeResolution(bad)).toBeNull();
    expect(referenceRateUsd(REFERENCE_MODELS[1], "constructor", Number.NaN)).toBe(0.08);
  });
});
