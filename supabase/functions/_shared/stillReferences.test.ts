import { describe, expect, it } from "vitest";
import { parseReferenceRequest, resolveReferences } from "./stillReferences.ts";

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
        { id: id(1), project_id: P, file_url: "u/p/worlds/a.png", asset_type: "reference_image", metadata_json: { bucket: "project-references", mime_type: "image/png" } },
        { id: id(2), project_id: "22222222-2222-4222-8222-222222222222", file_url: "u/q/b.png", asset_type: "reference_image", metadata_json: {} },
        { id: id(3), project_id: P, file_url: "u/p/take.mp4", asset_type: "reference_video", metadata_json: { mime_type: "video/mp4" } },
        { id: id(4), project_id: P, file_url: "u/p/x.png", asset_type: "reference_image", metadata_json: { bucket: "project-exports", mime_type: "image/png" } },
      ],
      features: [],
      ownArtists: new Set(),
    });
    expect(r.resolved.map((x) => [x.ref.label, x.path, x.buckets])).toEqual([["mine", "u/p/worlds/a.png", ["project-references"]]]);
    expect(r.refused.map((x) => [x.ref.label, x.why])).toEqual([
      ["someone else's", "not an asset of this project"],
      ["a video", "it is not an image"],
      ["an export", "its file is in project-exports, which this route does not read"],
    ]);
  });

  it("a generated still with no bucket on its row is read where the app reads it (project-clips)", () => {
    const refs = parseReferenceRequest([{ source: "project_asset", id: id(5), role: "screen", label: "s" }]).refs;
    const r = resolveReferences(refs, { projectId: P, assets: [{ id: id(5), project_id: P, file_url: "u/p/still.jpg", asset_type: "generated_still", metadata_json: { mime_type: "image/jpeg" } }], features: [], ownArtists: new Set() });
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
        { id: id(6), artist_id: "artist-1", storage_path: "artist-1/jacket.jpg", file_url: null },
        { id: id(7), artist_id: "artist-2", storage_path: "artist-2/coat.jpg", file_url: null },
      ],
      ownArtists: new Set(["artist-1"]),
    });
    expect(r.resolved.map((x) => x.ref.label)).toEqual(["jacket"]);
    expect(r.resolved[0].buckets).toContain("wardrobe-refs");
    expect(r.refused).toEqual([{ ref: expect.objectContaining({ label: "not mine" }), why: "not a picture of one of your artists" }]);
  });

  it("keeps the order it was given — the order the prompt names them in", () => {
    const refs = parseReferenceRequest([
      { source: "character_feature", id: id(6), role: "garment", label: "jacket" },
      { source: "project_asset", id: id(1), role: "place", label: "place" },
    ]).refs;
    const r = resolveReferences(refs, {
      projectId: P,
      assets: [{ id: id(1), project_id: P, file_url: "u/p/a.png", asset_type: "reference_image", metadata_json: {} }],
      features: [{ id: id(6), artist_id: "a1", storage_path: "a1/j.png", file_url: null }],
      ownArtists: new Set(["a1"]),
    });
    expect(r.resolved.map((x) => x.ref.label)).toEqual(["jacket", "place"]);
  });
});
