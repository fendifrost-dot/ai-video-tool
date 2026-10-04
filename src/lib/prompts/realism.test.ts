import { describe, expect, it } from "vitest";
import {
  applyRealism,
  buildRealism,
  mentions,
  REALISM_VERSION,
  type RealismOptions,
} from "./realism";
import type { CompiledPrompt } from "./types";

const EMPTY: CompiledPrompt = {
  templateId: "t1",
  templateName: "Test",
  templateProvider: null,
  templateCategory: "performance",
  promptText: "",
  negativePrompt: "",
  settings: {},
  unfilledPlaceholders: [],
  referenceImagePath: null,
  referenceImagePaths: [],
  realism: null,
  context: { projectId: "p", artistId: null, shotId: null },
};

const compiled = (promptText: string, negativePrompt = ""): CompiledPrompt => ({
  ...EMPTY,
  promptText,
  negativePrompt,
});

const all = (o: RealismOptions, text = "") => buildRealism(text, o).added.join(" | ");

/** Every feature the source package names about its two specific people. */
const PACKAGE_FEATURES = [
  "mediterranean",
  "olive",
  "ice-blue",
  "ice blue",
  "blue eyes",
  "freckle",
  "beauty mark",
  "almond",
  "cheekbone",
  "stubble",
  "eyebrow",
  "eyelash",
  "woman",
  "man",
  "her",
  "his",
  "sony",
  "a7r",
  "85mm",
  "90mm",
  "f/1.8",
  "f/2.8",
  "portra 400 color science",
  "nude",
  "lip",
];

describe("the modifier never leaks the source package's specific people", () => {
  it.each(["preserve", "recurring", "invent"] as const)(
    "emits no complexion, eye colour, gender, feature or camera body in %s mode",
    (identity) => {
      const text = all({
        identity,
        looks: ["portra", "macro", "shallowDepth", "windowLight"],
        temporal: true,
      });
      for (const feature of PACKAGE_FEATURES) {
        // Word boundaries, not substrings: "her" lives inside "rather", "man" inside
        // "human" and "lip" inside "clipping". A substring check here fails on its own
        // prose rather than on a real leak.
        expect(mentions(text, feature), `leaked "${feature}"`).toBe(false);
      }
    },
  );

  it("names no camera body, focal length or aperture", () => {
    const text = all({ identity: "invent", looks: ["macro", "shallowDepth"] });
    expect(text).not.toMatch(/\b\d{2,3}\s?mm\b/);
    expect(text).not.toMatch(/f\/\d/);
    expect(text).not.toMatch(/sony|canon|nikon|leica|a7r/i);
  });
});

describe("identity mode decides whether a face may be described at all", () => {
  it("preserve tells the model to change nothing, and describes no feature", () => {
    const r = buildRealism("", { identity: "preserve" });
    expect(r.added[0]).toContain("exactly as photographed");
    expect(r.added.join(" ")).not.toMatch(/ordinary human face|without cosmetic/);
    expect(r.negatives).toContain("identity drift");
  });

  it("recurring holds an approved character the same way, without restyling", () => {
    const r = buildRealism("", { identity: "recurring" });
    expect(r.added[0]).toContain("exactly as previously approved");
    expect(r.added.join(" ")).not.toMatch(/ordinary human face/);
    expect(r.negatives).toContain("character drift");
  });

  it("invent is the ONLY mode that may describe a human", () => {
    const invented = buildRealism("", { identity: "invent" }).added.join(" ");
    expect(invented).toContain("ordinary human face");
    expect(invented).toContain("natural variation");

    for (const identity of ["preserve", "recurring"] as const) {
      expect(buildRealism("", { identity }).added.join(" ")).not.toContain("ordinary human face");
    }
  });

  it("never invents imperfections on a referenced person", () => {
    // The package asks for freckles, asymmetry and visible pores ON A FACE. Telling a
    // model to add those to a reference is an instruction to change that face.
    for (const identity of ["preserve", "recurring"] as const) {
      const text = all({ identity }).toLowerCase();
      expect(text).not.toMatch(/asymmetr|freckle|pore|peach fuzz|blemish|imperfection/);
      expect(text).toMatch(/do not substitute|do not restyle/);
    }
  });

  it("subject-neutral optics and surface wording is shared by every mode", () => {
    const preserve = buildRealism("", { identity: "preserve" }).added;
    const invent = buildRealism("", { identity: "invent" }).added;
    const shared = preserve.filter((f) => invent.includes(f));
    // everything except the identity line itself
    expect(shared).toHaveLength(preserve.length - 1);
    expect(shared.join(" ")).toContain("real surface texture");
  });
});

describe("the approved treatment outranks realism", () => {
  it("withholds bare-skin wording when the treatment asked for makeup", () => {
    const r = buildRealism("glossy editorial makeup, high fashion beauty lighting", {
      identity: "invent",
    });
    const withheldText = r.withheld.map((w) => w.text).join(" ");
    expect(withheldText).toContain("without cosmetic retouching");
    expect(r.added.join(" ")).not.toContain("without cosmetic retouching");
    expect(r.withheld.find((w) => w.text.includes("cosmetic"))?.conflictsWith).toBe("makeup");
  });

  it("withholds the NEGATIVES of a withheld fragment too", () => {
    // The failure this guards: banning "retouched" on a shot that asked for a retouched
    // editorial look. A withheld fragment must take its negatives with it.
    const styled = buildRealism("glossy editorial makeup", { identity: "invent" });
    expect(styled.negatives).not.toContain("retouched");
    expect(styled.negatives).not.toContain("magazine retouching");

    const plain = buildRealism("a person in a room", { identity: "invent" });
    expect(plain.negatives).toContain("retouched");
  });

  it("keeps surface texture even under full makeup — a fashion shot still has texture", () => {
    const r = buildRealism("heavy glitter makeup, contour, gloss", { identity: "invent" });
    expect(r.added.join(" ")).toContain("real surface texture");
    expect(r.negatives).toContain("plastic skin");
    expect(r.negatives).toContain("airbrushed");
  });

  it("does not fight artificial or stage lighting the treatment chose", () => {
    const r = buildRealism("hard neon stage lighting, strobe, club", {
      identity: "invent",
      looks: ["windowLight", "portra"],
    });
    const added = r.added.join(" ");
    expect(added).not.toContain("as from a window");
    expect(added).not.toContain("Kodak Portra");
    expect(r.withheld.map((w) => w.conflictsWith)).toEqual(
      expect.arrayContaining(["neon", "strobe"]),
    );
  });

  it("is compatible with a surreal environment", () => {
    // Surreal staging is not a realism conflict: a surreal scene can be photographed.
    const r = buildRealism("a surreal floating cathedral of melting glass, dreamlike", {
      identity: "invent",
    });
    expect(r.withheld).toHaveLength(0);
    expect(r.added.join(" ")).toContain("real surface texture");
  });

  it("reads treatment text the caller supplies but the prompt body does not contain", () => {
    const r = buildRealism("a performer on a riser", {
      identity: "invent",
      treatmentText: "LOOK: full glam, heavy gloss",
    });
    expect(r.added.join(" ")).not.toContain("without cosmetic retouching");
    expect(r.withheld.some((w) => w.conflictsWith === "gloss")).toBe(true);
  });

  it("records every withheld fragment with the phrase that outranked it", () => {
    const r = buildRealism("flat light, deep focus, makeup, neon", { identity: "invent" });
    expect(r.withheld.length).toBeGreaterThan(0);
    for (const w of r.withheld) {
      expect(w.conflictsWith).toBeTruthy();
      expect(w.reason).toBeTruthy();
      expect(r.added).not.toContain(w.text);
    }
  });

  it("never withholds the identity line — a treatment phrase cannot change who it is", () => {
    const r = buildRealism("makeup, neon, flat light, deep focus, symmetrical", {
      identity: "preserve",
    });
    expect(r.added[0]).toContain("exactly as photographed");
    expect(r.withheld.map((w) => w.text)).not.toContain(r.added[0]);
  });
});

describe("word-boundary matching", () => {
  it("matches a signal as a word, not a substring", () => {
    expect(mentions("beauty lighting", "beauty")).toBe(true);
    expect(mentions("a beautiful room", "beauty")).toBe(false);
    expect(mentions("a nightclub scene", "night")).toBe(false);
    expect(mentions("shot at night", "night")).toBe(true);
    expect(mentions("a knight in armour", "night")).toBe(false);
  });

  it("matches multi-word signals as phrases", () => {
    expect(mentions("lit by a ring light", "ring light")).toBe(true);
    expect(mentions("a ring and a light", "ring light")).toBe(false);
  });

  it("does not veto bare skin on a merely 'beautiful' scene", () => {
    const r = buildRealism("a beautiful morning in a quiet room", { identity: "invent" });
    expect(r.added.join(" ")).toContain("without cosmetic retouching");
  });
});

describe("naturalism and looks are separate", () => {
  it("asking for naturalism implies no look", () => {
    const text = all({ identity: "invent" });
    expect(text).not.toContain("Kodak Portra");
    expect(text).not.toContain("as from a window");
    expect(text).not.toContain("surface detail is the subject");
  });

  it("each look is opt-in by name", () => {
    expect(all({ identity: "invent", looks: ["portra"] })).toContain("Kodak Portra");
    expect(all({ identity: "invent", looks: ["windowLight"] })).toContain("as from a window");
    expect(all({ identity: "invent", looks: ["macro"] })).toContain(
      "surface detail is the subject",
    );
  });
});

describe("temporal consistency", () => {
  it("is emitted only when asked for, and only as a request", () => {
    expect(all({ identity: "preserve" })).not.toContain("every frame");

    const r = buildRealism("", { identity: "preserve", temporal: true });
    expect(r.added.join(" ")).toContain("no feature drift");
    expect(r.negatives).toContain("temporal flicker");

    const req = r.requires.find((x) => x.text.includes("REQUEST"));
    expect(req?.verification).toBe("unverified");
    expect(req?.settledBy).toContain("measuring the delivered clip");
  });
});

describe("what it refuses to claim", () => {
  it("is always experimental and always says improvement is unverified", () => {
    const r = buildRealism("", { identity: "invent" });
    expect(r.status).toBe("experimental");
    expect(r.version).toBe(REALISM_VERSION);
    const claim = r.requires.find((x) => x.text.includes("MISSING VOCABULARY"));
    expect(claim?.verification).toBe("unverified");
    expect(claim?.settledBy).toContain("generation budget");
  });

  it("flags that preserve needs a reference that actually reaches the provider", () => {
    const r = buildRealism("", { identity: "preserve" });
    const req = r.requires.find((x) => x.text.includes("reference image"));
    expect(req?.verification).toBe("caller");
    expect(req?.settledBy).toContain("referenceImagePaths");
  });

  it("reports the missing recurring-character record as a gap rather than papering over it", () => {
    const r = buildRealism("", { identity: "recurring" });
    const gap = r.requires.find((x) => x.verification === "gap");
    expect(gap?.text).toContain("continuity_entities covers location, prop and lighting only");
    expect(gap?.settledBy).toContain("character entity kind");
  });
});

describe("applying it to a compiled prompt", () => {
  it("extends the body instead of rewriting it", () => {
    const out = applyRealism(compiled("A wide shot of the artist on a rooftop"), {
      identity: "preserve",
    });
    expect(out.prompt.promptText).toContain("A wide shot of the artist on a rooftop");
    expect(out.prompt.promptText).toContain("exactly as photographed");
  });

  it("merges negatives without duplicating what is already there", () => {
    const out = applyRealism(compiled("x", "identity drift, blurry"), { identity: "preserve" });
    const terms = out.prompt.negativePrompt.split(", ");
    expect(terms.filter((t) => t === "identity drift")).toHaveLength(1);
    expect(terms).toContain("blurry");
    expect(terms).toContain("plastic skin");
  });

  it("does not double a terminal period", () => {
    const out = applyRealism(compiled("A rooftop at dusk."), { identity: "invent" });
    expect(out.prompt.promptText).not.toContain("..");
  });

  it("handles an empty prompt body", () => {
    const out = applyRealism(compiled(""), { identity: "invent" });
    expect(out.prompt.promptText.startsWith(".")).toBe(false);
    expect(out.prompt.promptText).toContain("newly invented");
  });

  it("leaves every other field of the compiled prompt alone", () => {
    const before = compiled("x", "blurry");
    const { prompt: after } = applyRealism(before, { identity: "preserve" });
    expect(after.templateId).toBe(before.templateId);
    expect(after.settings).toEqual(before.settings);
    expect(after.referenceImagePaths).toEqual(before.referenceImagePaths);
    expect(after.context).toEqual(before.context);
  });
});
