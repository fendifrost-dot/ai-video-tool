import { describe, expect, it } from "vitest";
import { parseShotSpec, type ShotSpecInput } from "@/lib/treatment/shotSpec";
import { hashString, hueFrom, buildPalette } from "./palette";
import { buildPrevisPlan, PREVIS_HEIGHT, PREVIS_WIDTH } from "./previsPlan";
import { renderPrevisSvg, previsSvgToDataUri } from "./renderSvg";
import { applyPrevisToSpec, generatePrevis, hasRealPrevis } from "./generatePrevis";

const BASE: ShotSpecInput = {
  id: "shot-001",
  purpose: "Establish the rooftop and drop the beat",
  timeline: { start: 12, end: 16 },
};

function spec(overrides: Partial<ShotSpecInput> = {}) {
  return parseShotSpec({ ...BASE, ...overrides });
}

describe("palette", () => {
  it("hashString is deterministic and unsigned 32-bit", () => {
    expect(hashString("rooftop")).toBe(hashString("rooftop"));
    expect(hashString("rooftop")).not.toBe(hashString("basement"));
    expect(hashString("x")).toBeGreaterThanOrEqual(0);
    expect(hashString("")).toBe(0x811c9dc5);
  });

  it("hueFrom stays in range and falls back for empty input", () => {
    for (const s of ["", "night club", "golden hour", "studio"]) {
      const h = hueFrom(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
    expect(hueFrom("", 123)).toBe(123);
  });

  it("night keywords produce a dark palette; day does not", () => {
    const night = buildPalette({
      environment: "alley",
      timeOfDay: "night",
      lighting: "moonlight",
      wardrobe: "coat",
    });
    const day = buildPalette({
      environment: "alley",
      timeOfDay: "midday",
      lighting: "sun",
      wardrobe: "coat",
    });
    expect(night.dark).toBe(true);
    expect(day.dark).toBe(false);
    expect(night.ink).not.toBe(day.ink);
  });
});

describe("buildPrevisPlan", () => {
  it("is deterministic for identical specs", () => {
    expect(buildPrevisPlan(spec())).toEqual(buildPrevisPlan(spec()));
  });

  it("defaults framing/motion when the spec omits them", () => {
    const plan = buildPrevisPlan(spec());
    expect(plan.framing.key).toBe("medium");
    expect(plan.motion.key).toBe("static");
    expect(plan.motion.transform).toBeNull();
  });

  it("clamps duration to the watchable loop window", () => {
    expect(buildPrevisPlan(spec({ timeline: { start: 0, end: 0.2 } })).durationSeconds).toBe(2);
    expect(buildPrevisPlan(spec({ timeline: { start: 0, end: 40 } })).durationSeconds).toBe(8);
  });

  it("keeps the subject box within the canvas for normal framings", () => {
    for (const framing of ["extreme_wide", "wide", "medium", "medium_close"] as const) {
      const { subject } = buildPrevisPlan(spec({ framing })).framing;
      expect(subject.x).toBeGreaterThanOrEqual(0);
      expect(subject.x + subject.w).toBeLessThanOrEqual(PREVIS_WIDTH + 0.01);
      expect(subject.y + subject.h).toBeLessThanOrEqual(PREVIS_HEIGHT + 0.01);
    }
  });

  it("maps camera motions to the expected transform kind", () => {
    expect(buildPrevisPlan(spec({ cameraMotion: { type: "dolly" } })).motion.transform?.type).toBe(
      "scale",
    );
    expect(buildPrevisPlan(spec({ cameraMotion: { type: "pan" } })).motion.transform?.type).toBe(
      "translate",
    );
    expect(buildPrevisPlan(spec({ cameraMotion: { type: "orbit" } })).motion.transform?.type).toBe(
      "rotate",
    );
    expect(buildPrevisPlan(spec({ cameraMotion: { type: "static" } })).motion.transform).toBeNull();
  });

  it("changing wardrobe changes the seed and subject colour", () => {
    const a = buildPrevisPlan(spec({ wardrobe: { description: "black leather" } }));
    const b = buildPrevisPlan(spec({ wardrobe: { description: "white silk" } }));
    expect(a.seed).not.toBe(b.seed);
    expect(a.palette.subject).not.toBe(b.palette.subject);
  });
});

describe("renderPrevisSvg", () => {
  it("produces a well-formed, deterministic SVG", () => {
    const plan = buildPrevisPlan(spec({ cameraMotion: { type: "dolly" } }));
    const svg = renderPrevisSvg(plan);
    expect(svg).toBe(renderPrevisSvg(plan));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${PREVIS_WIDTH} ${PREVIS_HEIGHT}"`);
  });

  it("includes an animateTransform for moving shots and omits it for static", () => {
    expect(renderPrevisSvg(buildPrevisPlan(spec({ cameraMotion: { type: "dolly" } })))).toContain(
      "<animateTransform",
    );
    expect(
      renderPrevisSvg(buildPrevisPlan(spec({ cameraMotion: { type: "static" } }))),
    ).not.toContain("<animateTransform");
  });

  it("static option suppresses animation even for moving shots", () => {
    const plan = buildPrevisPlan(spec({ cameraMotion: { type: "orbit" } }));
    expect(renderPrevisSvg(plan, { animated: false })).not.toContain("<animateTransform");
  });

  it("escapes untrusted text in the title/caption", () => {
    const svg = renderPrevisSvg(buildPrevisPlan(spec({ title: '<script>"x"' })));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("data URI round-trips the SVG payload", () => {
    const svg = renderPrevisSvg(buildPrevisPlan(spec()));
    const uri = previsSvgToDataUri(svg);
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(uri.slice("data:image/svg+xml,".length))).toBe(svg);
  });
});

describe("generatePrevis / applyPrevisToSpec", () => {
  it("returns a sketch previs with a data URI, deterministically", () => {
    const g1 = generatePrevis(spec());
    const g2 = generatePrevis(spec());
    expect(g1.previs.status).toBe("sketch");
    expect(g1.previs.uri).toBe(g2.previs.uri);
    expect(g1.dataUri.startsWith("data:image/svg+xml,")).toBe(true);
  });

  it("hasRealPrevis distinguishes stored assets from synthesized sketches", () => {
    expect(hasRealPrevis({ status: "none", uri: null, notes: "" })).toBe(false);
    expect(hasRealPrevis({ status: "sketch", uri: "data:image/svg+xml,x", notes: "" })).toBe(false);
    expect(hasRealPrevis({ status: "approved", uri: "data:image/svg+xml,x", notes: "" })).toBe(
      false,
    );
    expect(hasRealPrevis({ status: "rendered", uri: "https://cdn/clip.mp4", notes: "" })).toBe(
      true,
    );
    expect(hasRealPrevis({ status: "approved", uri: "s3://a/b.mp4", notes: "" })).toBe(true);
  });

  it("applyPrevisToSpec fills a sketch but never clobbers a real asset", () => {
    const filled = applyPrevisToSpec(spec());
    expect(filled.previs.status).toBe("sketch");
    expect(filled.previs.uri).toContain("data:image/svg+xml,");

    const withReal = spec({
      previs: { status: "approved", uri: "https://cdn/clip.mp4", notes: "final" },
    });
    expect(applyPrevisToSpec(withReal)).toBe(withReal);
    expect(applyPrevisToSpec(withReal).previs.uri).toBe("https://cdn/clip.mp4");
  });

  it("result of applyPrevisToSpec is a valid ShotSpec", () => {
    const filled = applyPrevisToSpec(spec());
    expect(() => parseShotSpec(filled)).not.toThrow();
  });
});
