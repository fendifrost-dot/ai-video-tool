import { describe, expect, it } from "vitest";
import {
  castBlocks,
  castProblems,
  castRouteCheck,
  castSource,
  isCastMember,
  resolveCast,
  type CastFacts,
  type CastRef,
} from "./cast";
import { indexEntities, type ContinuityEntity } from "@/lib/continuity/entities";

const entity = (over: Partial<ContinuityEntity> & { key: string }): ContinuityEntity => ({
  id: `id-${over.key}`,
  projectId: "p",
  variationId: "v1",
  kind: "character",
  name: over.key,
  description: "",
  constraints: "",
  approvedAssetId: null,
  referenceAssetIds: [],
  cast: null,
  archived: false,
  createdAt: "t",
  updatedAt: "t",
  ...over,
});

const facts = (over: Partial<CastFacts> = {}): CastFacts => ({
  role: "fictional",
  identityMode: "invent",
  artistId: null,
  ...over,
});

const ref = (over: Partial<CastRef> & { key: string }): CastRef => ({
  action: "",
  placement: "",
  framing: "",
  identityMode: null,
  ...over,
});

const ARTIST = entity({
  key: "FENDI",
  name: "Fendi",
  description: "The artist.",
  cast: facts({ role: "primary_artist", identityMode: "preserve", artistId: "artist-1" }),
  approvedAssetId: "asset-face",
});
const DRIVER = entity({
  key: "DRIVER",
  name: "Driver",
  description: "Waits by the car.",
  cast: facts({ role: "recurring", identityMode: "recurring" }),
  approvedAssetId: "asset-driver",
});
const EXTRA = entity({ key: "EXTRA", name: "Passer-by", cast: facts() });
const RUNWAY = entity({
  key: "RUNWAY",
  name: "Runway",
  kind: "location",
  description: "A black runway.",
});

const index = indexEntities([ARTIST, DRIVER, EXTRA, RUNWAY]);
const spec = (members: CastRef[], extra: Partial<{ open: boolean; none: boolean }> = {}) =>
  ({ cast: { members, open: false, none: false, ...extra } }) as Parameters<typeof resolveCast>[0];

describe("resolving who is in a shot", () => {
  it("resolves cast members by key and carries the shot's own direction", () => {
    const c = resolveCast(
      spec([ref({ key: "FENDI", action: "raps to camera", placement: "centre" })]),
      index,
    );
    expect(c.members).toHaveLength(1);
    expect(c.members[0].entity.name).toBe("Fendi");
    expect(c.members[0].ref.action).toBe("raps to camera");
    expect(c.missing).toEqual([]);
  });

  it("does NOT coerce a non-character entity into a person", () => {
    // Pointing at a location as if it were cast is a mistake to show, not to paper over.
    const c = resolveCast(spec([ref({ key: "RUNWAY" })]), index);
    expect(c.members).toEqual([]);
    expect(c.missing).toEqual(["RUNWAY"]);
  });

  it("reports a key this variation does not have", () => {
    const c = resolveCast(spec([ref({ key: "GHOST" })]), index);
    expect(c.missing).toEqual(["GHOST"]);
  });

  it("lets a shot override the character's identity mode for that shot only", () => {
    const c = resolveCast(spec([ref({ key: "DRIVER", identityMode: "invent" })]), index);
    expect(c.members[0].mode).toBe("invent");
    expect(c.members[0].entity.cast.identityMode).toBe("recurring");
  });

  it("isCastMember narrows only characters", () => {
    expect(isCastMember(ARTIST)).toBe(true);
    expect(isCastMember(RUNWAY)).toBe(false);
  });
});

describe("open casting is not the same as unsaid casting", () => {
  it("an empty cast with no flags is reported as UNSAID", () => {
    const problems = castProblems(resolveCast(spec([]), index));
    const unsaid = problems.find((p) => p.level === "unsaid");
    expect(unsaid?.text).toContain("not a decision");
    expect(castBlocks(resolveCast(spec([]), index))).toBe(false);
  });

  it("explicitly open casting raises nothing", () => {
    expect(castProblems(resolveCast(spec([], { open: true }), index))).toEqual([]);
  });

  it("explicitly no people raises nothing", () => {
    expect(castProblems(resolveCast(spec([], { none: true }), index))).toEqual([]);
  });

  it("no people AND a named cast member is blocking", () => {
    const p = castProblems(resolveCast(spec([ref({ key: "EXTRA" })], { none: true }), index));
    expect(p.some((x) => x.level === "blocking" && x.text.includes("no people"))).toBe(true);
  });
});

describe("a shot that needs a person it cannot show", () => {
  it("blocks when preserve has no reference", () => {
    const noRef = entity({
      key: "GUEST",
      name: "Guest",
      cast: facts({ role: "recurring", identityMode: "preserve" }),
    });
    const c = resolveCast(spec([ref({ key: "GUEST" })]), indexEntities([noRef]));
    const p = castProblems(c);
    expect(
      p.some((x) => x.level === "blocking" && x.text.includes("no approved or reference picture")),
    ).toBe(true);
    expect(castBlocks(c)).toBe(true);
  });

  it("does not block the artist, whose likeness lives on the artist record", () => {
    const artistNoAsset = entity({
      key: "FENDI",
      name: "Fendi",
      cast: facts({ role: "primary_artist", identityMode: "preserve", artistId: "artist-1" }),
    });
    const c = resolveCast(spec([ref({ key: "FENDI" })]), indexEntities([artistNoAsset]));
    expect(castBlocks(c)).toBe(false);
  });

  it("blocks a primary artist linked to no artist record", () => {
    const orphan = entity({
      key: "X",
      name: "X",
      cast: facts({ role: "primary_artist", identityMode: "preserve" }),
    });
    const c = resolveCast(spec([ref({ key: "X" })]), indexEntities([orphan]));
    expect(
      castProblems(c).some((p) => p.level === "blocking" && p.text.includes("no artist record")),
    ).toBe(true);
  });

  it("warns when a reference exists but the shot invents anyway", () => {
    const c = resolveCast(spec([ref({ key: "DRIVER", identityMode: "invent" })]), index);
    expect(
      castProblems(c).some((p) => p.level === "warning" && p.text.includes("will not be matched")),
    ).toBe(true);
  });

  it("reports an undescribed invented character as unsaid, and never fills it in", () => {
    const c = resolveCast(spec([ref({ key: "EXTRA" })]), index);
    const p = castProblems(c);
    expect(
      p.some((x) => x.level === "unsaid" && x.text.includes("entirely the model's choice")),
    ).toBe(true);
    // nothing anywhere guessed an appearance
    expect(castSource(c).lines.join(" ")).not.toMatch(
      /skin|complexion|ethnic|young|old|male|female/i,
    );
  });

  it("warns when an archived character is still cast", () => {
    const c = resolveCast(
      spec([ref({ key: "OLD" })]),
      indexEntities([entity({ key: "OLD", name: "Old", cast: facts(), archived: true })]),
    );
    expect(castProblems(c).some((p) => p.level === "warning" && p.text.includes("archived"))).toBe(
      true,
    );
  });

  it("every problem names a fix", () => {
    const c = resolveCast(
      spec([ref({ key: "GHOST" }), ref({ key: "EXTRA" })], { none: true }),
      index,
    );
    for (const p of castProblems(c)) expect(p.fix.length).toBeGreaterThan(0);
  });
});

describe("what the request carries", () => {
  it("one line per person: who they are, what they do, and what must survive", () => {
    const c = resolveCast(
      spec([
        ref({
          key: "FENDI",
          action: "raps to camera",
          placement: "centre frame",
          framing: "waist up",
        }),
      ]),
      index,
    );
    const line = castSource(c).lines[0];
    expect(line).toContain("Fendi — The artist.");
    expect(line).toContain("Action: raps to camera.");
    expect(line).toContain("Placement: centre frame.");
    expect(line).toContain("Framing: waist up.");
    expect(line).toContain("do not substitute or idealise");
  });

  it("the shot's wardrobe goes on the artist's line, not on anyone else's", () => {
    const c = resolveCast(spec([ref({ key: "FENDI" }), ref({ key: "DRIVER" })]), index);
    const lines = castSource(c, { wears: "his exact YSL denim look" }).lines;
    expect(lines[0]).toContain("Wears: his exact YSL denim look.");
    expect(lines[0].indexOf("Wears:")).toBeLessThan(lines[0].indexOf("Identity:"));
    expect(lines[1]).not.toContain("Wears:");
    expect(castSource(c).lines[0]).not.toContain("Wears:");
    expect(castSource(c, { wears: "  " }).lines[0]).not.toContain("Wears:");
  });

  it("collects references and artist ids only for people who must be matched", () => {
    const c = resolveCast(
      spec([ref({ key: "FENDI" }), ref({ key: "DRIVER" }), ref({ key: "EXTRA" })]),
      index,
    );
    const s = castSource(c);
    expect(s.referenceAssetIds).toEqual(["asset-face", "asset-driver"]);
    expect(s.artistIds).toEqual(["artist-1"]);
  });

  it("an invented person contributes no reference", () => {
    const c = resolveCast(spec([ref({ key: "DRIVER", identityMode: "invent" })]), index);
    expect(castSource(c).referenceAssetIds).toEqual([]);
  });

  it("states no-people and open casting rather than staying silent", () => {
    expect(castSource(resolveCast(spec([], { none: true }), index)).lines[0]).toContain(
      "No people",
    );
    expect(castSource(resolveCast(spec([], { open: true }), index)).lines[0]).toContain(
      "deliberately open",
    );
  });

  it("says in its notes what it could not carry", () => {
    const c = resolveCast(spec([ref({ key: "GHOST" }), ref({ key: "EXTRA" })]), index);
    const notes = castSource(c).notes.join(" ");
    expect(notes).toContain("GHOST");
    expect(notes).toContain("no description");
  });
});

describe("routes that cannot honour the casting say so", () => {
  const withRefs = () => castSource(resolveCast(spec([ref({ key: "FENDI" })]), index));

  it("names the references a provider will not receive, rather than dropping them silently", () => {
    const check = castRouteCheck(withRefs(), { provider: "veo", supportsReferenceImage: false });
    expect(check.dropped?.assetIds).toEqual(["asset-face"]);
    expect(check.dropped?.reason).toContain("veo");
    expect(check.warnings.join(" ")).toContain("cannot take their picture");
  });

  it("is quiet when the provider can take them", () => {
    const check = castRouteCheck(withRefs(), { provider: "runway", supportsReferenceImage: true });
    expect(check.dropped).toBeNull();
    expect(check.warnings).toEqual([]);
  });

  it("says so when the provider is not known yet", () => {
    expect(castRouteCheck(withRefs(), null).warnings[0]).toContain("not known yet");
  });
});
