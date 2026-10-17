import { describe, expect, it } from "vitest";
import * as app from "../../../src/lib/storyboard/dress";
import * as edge from "./dressWords";

const PIECES: app.DressPiece[] = [
  {
    id: "jacket",
    label: "Saint Laurent Track Jacket - Mastic Cotton Navy Stripe",
    featureType: "wardrobe_outerwear",
    storagePath: "u/a/jacket.jpg",
    images: [
      { storagePath: "u/a/jacket.jpg", angle: "front" },
      { storagePath: "u/a/jacket_side.jpg", angle: "side" },
    ],
    construction: "mastic cotton, a navy stripe down each sleeve",
  },
  {
    id: "cap",
    label: "Saint Laurent Cap in Cotton Gabardine - Beige and Ivory",
    featureType: "wardrobe_accessory",
    storagePath: "u/a/cap.jpg",
    images: [
      { storagePath: "u/a/cap.jpg", angle: "front" },
      { storagePath: "u/a/cap_side.jpg", angle: "side" },
    ],
    construction: null,
  },
  {
    id: "shoes",
    label: "Prada America's Cup Sneakers - Cream (Raw White)",
    featureType: "wardrobe_footwear",
    storagePath: "u/a/prada_front.jpg",
    images: [
      { storagePath: "u/a/prada_front.jpg", angle: "front" },
      { storagePath: "u/a/prada_back.jpg", angle: "back three-quarter" },
    ],
    construction: "Cream soft rubber and silver-grey bike mesh, red Prada Linea Rossa tab",
  },
  {
    id: "nopic",
    label: "No picture",
    featureType: "wardrobe_bottom",
    storagePath: null,
    images: [],
    construction: null,
  },
];

describe("the Deno copy of the dress words is the app's, word for word", () => {
  it("constants", () => {
    expect(edge.DRESS_MIN_SOURCE_SECONDS).toBe(app.DRESS_MIN_SOURCE_SECONDS);
    expect(edge.DRESS_MAX_SOURCE_SECONDS).toBe(app.DRESS_MAX_SOURCE_SECONDS);
    expect(edge.DRESS_RESOLUTION).toBe(app.DRESS_RESOLUTION);
    expect(edge.DRESS_MILLS_PER_SECOND).toBe(app.DRESS_MILLS_PER_SECOND);
    expect(edge.DRESS_PROVIDER).toBe(app.DRESS_PROVIDER);
    expect(edge.DRESS_ENDPOINT).toBe(app.DRESS_ENDPOINT);
    expect(edge.DRESS_MODEL_VARIANT).toBe(app.DRESS_MODEL_VARIANT);
    expect(edge.DRESS_ROUTE).toBe(app.DRESS_ROUTE);
    expect(edge.DRESS_MAX_REFERENCES).toBe(app.DRESS_MAX_REFERENCES);
    expect(edge.DRESS_PROMPT_VERSION).toBe(app.DRESS_PROMPT_VERSION);
  });

  it("kinds, pictures, prompt, billed seconds, scrub", () => {
    for (const p of PIECES) expect(edge.pieceKind(p)).toBe(app.pieceKind(p));
    expect(edge.pieceKind(PIECES[2])).toBe("footwear");
    for (const set of [PIECES, [PIECES[2]], [PIECES[1], PIECES[2]], [PIECES[3]]]) {
      expect(edge.dressReferences(set)).toEqual(app.dressReferences(set));
      const sent = app.dressReferences(set).sent;
      if (sent.length)
        expect(edge.buildDressPrompt(set, sent)).toBe(app.buildDressPrompt(set, sent));
    }
    for (const s of [3.2, 4, 4.004, 4.0417, 9.99, 12])
      expect(edge.dressBilledSeconds(s)).toBe(app.dressBilledSeconds(s));
    const env = {
      ok: true,
      providerJobId: "x",
      resultUrl: "https://cdn/x.mp4",
      input: { a: 1 },
      nested: ["https://y", 2],
    };
    expect(edge.scrubEnvelope(env)).toEqual(app.scrubEnvelope(env));
  });

  it("the shoes alone: both pictures go, and the words name only his shoes", () => {
    const { sent } = edge.dressReferences([PIECES[2]]);
    expect(sent.map((r) => r.path)).toEqual(["u/a/prada_front.jpg", "u/a/prada_back.jpg"]);
    const prompt = edge.buildDressPrompt([PIECES[2]], sent);
    expect(prompt).toMatch(
      /^Replace ONLY the man's shoes with the exact piece shown in the reference images: the Prada America's Cup Sneakers - Cream \(Raw White\) \(reference images 1–2\)\./,
    );
    expect(prompt).toContain(
      "Keep everything else exactly as in the source video: his face, hair, glasses, skin, hands, the rest of his clothes, the room, the lighting, the camera move and his performance timing.",
    );
  });

  it("among other people: he is named by what he keeps on, and nobody else changes", () => {
    const { sent } = edge.dressReferences([PIECES[2]]);
    const prompt = edge.buildDressPrompt([PIECES[2]], sent, {
      wearer: "Saint Laurent Track Jacket - Mastic Cotton Navy Stripe",
    });
    expect(prompt).toMatch(
      /^Replace ONLY the shoes of the man wearing the Saint Laurent Track Jacket - Mastic Cotton Navy Stripe with the exact piece/,
    );
    expect(prompt).toMatch(
      /Only he changes: every other person in the frame keeps their own clothes and shoes exactly as in the source video\.$/,
    );
    // without a wearer the words are what every dress so far was sent
    expect(edge.buildDressPrompt([PIECES[2]], sent, { wearer: " " })).toBe(
      edge.buildDressPrompt([PIECES[2]], sent),
    );
  });
});
