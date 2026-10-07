/**
 * THE FULL PATH — a cast member saved, reloaded, put on a shot, and carried into the request a
 * provider would receive, without submitting anything.
 *
 * Each step here is a place casting could be silently lost, and each has been lost by something in
 * this repo before: a row read back by a reader that drops unknown kinds, a spec field dropped by a
 * zod parse, a reference never added to the request, a provider that cannot take one.
 */
import { describe, expect, it } from "vitest";
import { entityFromRow, indexEntities, type EntityRow } from "@/lib/continuity/entities";
import { ShotSpecSchema } from "@/lib/treatment/shotSpec";
import { compilePrompt } from "@/lib/prompts/compiler";
import { castProblems, castRouteCheck, castSource, resolveCast } from "./cast";
import type { Artist, PromptTemplate, Shot, VideoProject } from "@/integrations/supabase/aliases";

/** Exactly the shape `continuity_entities` returns, including the new columns. */
const row = (over: Partial<EntityRow> & { key: string }): EntityRow => ({
  id: `id-${over.key}`,
  project_id: "proj-1",
  variation_id: "var-1",
  kind: "character",
  name: over.key,
  description: null,
  constraints: null,
  approved_asset_id: null,
  reference_asset_ids: null,
  archived: false,
  created_at: "t",
  updated_at: "t",
  ...over,
});

const ARTIST_ROW = row({
  key: "FENDI",
  name: "Fendi",
  description: "The artist, as himself.",
  cast_role: "primary_artist",
  identity_mode: "preserve",
  artist_id: "artist-1",
  approved_asset_id: "asset-fendi",
});
const DRIVER_ROW = row({
  key: "DRIVER",
  name: "The driver",
  description: "Older man in a grey suit, waits by the car.",
  constraints: "Never smiles.",
  cast_role: "recurring",
  identity_mode: "recurring",
  approved_asset_id: "asset-driver",
});

const template: PromptTemplate = {
  id: "tpl-1",
  name: "T",
  category: "performance",
  provider: "runway",
  template_body: "{{shot.scene_description}}, {{shot.camera_direction}}",
  default_negative_prompt: "blurry",
  default_settings_json: {},
  description: null,
  is_seed: true,
  user_id: null,
  created_at: "t",
  updated_at: "t",
} as unknown as PromptTemplate;

const project = { id: "proj-1", title: "Song", color_palette: [] } as unknown as VideoProject;
const artist = { id: "artist-1", name: "Fendi" } as unknown as Artist;
const shot = {
  id: "shot-1",
  scene_description: "A car at night",
  camera_direction: "slow push",
} as unknown as Shot;

describe("1 · an artist and a supporting character save and reload", () => {
  it("reads both back from database rows with their role, mode and artist link intact", () => {
    const fendi = entityFromRow(ARTIST_ROW);
    const driver = entityFromRow(DRIVER_ROW);

    expect(fendi?.cast).toEqual({
      role: "primary_artist",
      identityMode: "preserve",
      artistId: "artist-1",
    });
    expect(driver?.cast).toEqual({ role: "recurring", identityMode: "recurring", artistId: null });
    expect(driver?.description).toBe("Older man in a grey suit, waits by the car.");
  });

  it("a character row is no longer dropped by the reader", () => {
    // The gap this whole feature came from: entityFromRow returned null for any kind outside
    // location | prop | lighting, so a character inserted today vanished on read.
    expect(entityFromRow(ARTIST_ROW)).not.toBeNull();
  });

  it("a row with an unrecognised role or mode still loads, at the safest setting", () => {
    const odd = entityFromRow(row({ key: "ODD", cast_role: "villain", identity_mode: "clone" }));
    expect(odd).not.toBeNull();
    expect(odd?.cast).toEqual({ role: "fictional", identityMode: "invent", artistId: null });
  });
});

describe("2 · they go on a shot, and the shot survives a save/reload round trip", () => {
  const authored = {
    id: "c001",
    purpose: "The car arrives",
    timeline: { start: 0, end: 4 },
    cast: {
      members: [
        {
          key: "FENDI",
          action: "steps out of the car",
          placement: "foreground left",
          framing: "waist up",
          identityMode: null,
        },
        {
          key: "DRIVER",
          action: "holds the door",
          placement: "behind him",
          framing: "full figure",
          identityMode: null,
        },
      ],
      open: false,
      none: false,
    },
  };

  it("parses, serialises to JSON and parses again with every field intact", () => {
    const first = ShotSpecSchema.parse(authored);
    const reloaded = ShotSpecSchema.parse(JSON.parse(JSON.stringify(first)));

    expect(reloaded.cast.members).toHaveLength(2);
    expect(reloaded.cast.members[0]).toEqual({
      key: "FENDI",
      action: "steps out of the car",
      placement: "foreground left",
      framing: "waist up",
      identityMode: null,
    });
    expect(reloaded.cast.members[1].key).toBe("DRIVER");
    expect(reloaded).toEqual(first);
  });

  it("a shot authored before casting existed loads with an empty, unsaid cast", () => {
    const old = ShotSpecSchema.parse({
      id: "c002",
      purpose: "Old shot",
      timeline: { start: 0, end: 4 },
    });
    expect(old.cast).toEqual({ members: [], open: false, none: false });
    // and it reports as unsaid rather than quietly casting nobody
    expect(
      castProblems(resolveCast(old, indexEntities([]))).some((p) => p.level === "unsaid"),
    ).toBe(true);
  });

  it("nobody is auto-cast — the artist is not added on their behalf", () => {
    const old = ShotSpecSchema.parse({
      id: "c003",
      purpose: "Crowd",
      timeline: { start: 0, end: 4 },
    });
    expect(old.cast.members).toEqual([]);
  });
});

describe("3 · the request a provider would receive", () => {
  const index = indexEntities([entityFromRow(ARTIST_ROW)!, entityFromRow(DRIVER_ROW)!]);
  const spec = ShotSpecSchema.parse({
    id: "c001",
    purpose: "The car arrives",
    timeline: { start: 0, end: 4 },
    cast: {
      members: [
        {
          key: "FENDI",
          action: "steps out of the car",
          placement: "foreground left",
          framing: "waist up",
        },
        { key: "DRIVER", action: "holds the door", placement: "behind him" },
      ],
    },
  });
  const cast = resolveCast(spec, index);

  it("carries both people, their direction and their identity requirement", () => {
    const compiled = compilePrompt({ template, project, artist, shot, cast });

    expect(compiled.promptText).toContain("A car at night"); // the shot's own words survive
    expect(compiled.promptText).toContain("Fendi — The artist, as himself.");
    expect(compiled.promptText).toContain("Action: steps out of the car.");
    expect(compiled.promptText).toContain("Placement: foreground left.");
    expect(compiled.promptText).toContain(
      "The driver — Older man in a grey suit, waits by the car. Never smiles.",
    );
    expect(compiled.promptText).toContain("do not substitute or idealise"); // preserve
    expect(compiled.promptText).toContain("consistent with the approved reference"); // recurring
  });

  it("attaches both identity references, the cast's first", () => {
    const compiled = compilePrompt({
      template,
      project,
      artist,
      shot,
      cast,
      lockedCharacterFeaturePaths: ["dna/face.png"],
    });
    expect(compiled.referenceImagePaths).toEqual(["asset-fendi", "asset-driver", "dna/face.png"]);
    expect(compiled.referenceImagePath).toBe("asset-fendi");
  });

  it("keeps the cast record on the compiled prompt, so a stored request says who it was for", () => {
    const compiled = compilePrompt({ template, project, artist, shot, cast });
    expect(compiled.cast?.artistIds).toEqual(["artist-1"]);
    expect(compiled.cast?.referenceAssetIds).toEqual(["asset-fendi", "asset-driver"]);
  });

  it("changes nothing when a shot names no cast", () => {
    const withCast = compilePrompt({ template, project, artist, shot, cast });
    const without = compilePrompt({ template, project, artist, shot });
    expect(without.cast).toBeNull();
    expect(without.promptText).not.toContain("Fendi —");
    expect(withCast.promptText.startsWith(without.promptText.replace(/[.,;]+$/, ""))).toBe(true);
  });

  it("a route that cannot take a reference says which ones it will not get", () => {
    const check = castRouteCheck(castSource(cast), {
      provider: "veo",
      supportsReferenceImage: false,
    });
    expect(check.dropped?.assetIds).toEqual(["asset-fendi", "asset-driver"]);
    expect(check.warnings.join(" ")).toContain("veo");
  });
});

describe("4 · variations are isolated", () => {
  it("the same key cast differently in two variations resolves differently in each", () => {
    // One song, two videos. In the first the driver is an approved recurring character; in the
    // second the same slot is a new invented person. Neither read can see the other's row.
    const v1 = indexEntities([entityFromRow(row({ ...DRIVER_ROW, variation_id: "var-1" }))!]);
    const v2 = indexEntities([
      entityFromRow(
        row({
          key: "DRIVER",
          variation_id: "var-2",
          name: "A courier",
          description: "Young, in a hurry.",
          cast_role: "fictional",
          identity_mode: "invent",
        }),
      )!,
    ]);
    const spec = ShotSpecSchema.parse({
      id: "c001",
      purpose: "p",
      timeline: { start: 0, end: 4 },
      cast: { members: [{ key: "DRIVER" }] },
    });

    const a = resolveCast(spec, v1);
    const b = resolveCast(spec, v2);

    expect(a.members[0].mode).toBe("recurring");
    expect(b.members[0].mode).toBe("invent");
    expect(castSource(a).referenceAssetIds).toEqual(["asset-driver"]);
    expect(castSource(b).referenceAssetIds).toEqual([]); // invented: nothing to match
    expect(castSource(a).lines[0]).toContain("Older man in a grey suit");
    expect(castSource(b).lines[0]).toContain("Young, in a hurry");
  });
});
