import { describe, expect, it } from "vitest";
import { analyzeFootage, type AnalysisInput, type FileFacts } from "./footage";
import { compatibilityOf, isMandatory, routeFor, type TreatmentIntent } from "./compatibility";
import type { FaceFrame } from "./takeCheck";
import type { SeriesFrame } from "@/lib/media/frameSeries";
import { DETAIL_TILES, type DetailFrame } from "@/lib/media/detailSeries";

const FILE: FileFacts = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationSeconds: 7,
  rotation: 0,
  hasAudio: true,
  codec: "avc1",
  transfer: null,
};
const face = (t: number, over: Partial<NonNullable<FaceFrame["face"]>> = {}): FaceFrame => ({
  t,
  face: { mouth: 0.1, size: 0.06, cx: 0.5, cy: 0.35, reach: 11, seen: 0.2, ...over },
});
const grid = (): SeriesFrame => ({ t: 0, cells: Array.from({ length: 12 * 12 * 3 }, () => 0.5) });
const detail = (t: number, over: Partial<DetailFrame> = {}): DetailFrame => ({
  t,
  sharp: Array.from({ length: DETAIL_TILES * DETAIL_TILES }, () => 0.05),
  luma: 0.5,
  clipLow: 0,
  clipHigh: 0,
  shift: null,
  borderShift: null,
  residual: null,
  ...over,
});

const analysis = (over: Partial<AnalysisInput> = {}) =>
  analyzeFootage(
    {
      file: FILE,
      faces: Array.from({ length: 30 }, (_, i) => face(i / 30)),
      light: Array.from({ length: 30 }, (_, i) => ({ ...grid(), t: i / 30 })),
      detail: Array.from({ length: 30 }, (_, i) => detail(i / 30)),
      range: [0, 1],
      ...over,
    },
    "2026-10-04T00:00:00.000Z",
  );

describe("authority is not evidence", () => {
  // The rule this module was corrected on (4 October): who says a thing must hold, and whether AVT can check it,
  // are different questions. An earlier version collapsed them and demoted the treatment's own asks to preferences
  // the moment a property turned out to be one AVT only estimates.
  const a = analysis();

  it("never files an inference as a binding source constraint", () => {
    const c = compatibilityOf(a);
    for (const r of c.requirements) {
      if (r.authority === "source") expect(r.verification, r.from).toBe("measured");
      if (r.authority === "advisory") expect(r.verification, r.from).toBe("estimated");
    }
    expect(c.requirements.some((r) => r.authority === "source")).toBe(true);
    expect(c.requirements.some((r) => r.authority === "advisory")).toBe(true);
  });

  it("keeps a treatment requirement MANDATORY even where it can only be estimated", () => {
    const c = compatibilityOf(a, { wantsKeyDirection: "frame_left" } satisfies TreatmentIntent);
    const r = c.requirements.find((x) => x.from === "treatment.wantsKeyDirection")!;
    expect(r.authority).toBe("approved");
    expect(isMandatory(r)).toBe(true);
    // …and says plainly that the checking is the weak part, not the obligation
    expect(r.verification).toBe("estimated");
    expect(r.needsToVerify).toContain("not from where a lamp stands");
  });

  it("keeps a treatment requirement MANDATORY even where it cannot be checked at all", () => {
    const c = compatibilityOf(a, { wantsFloorContact: true });
    const r = c.requirements.find((x) => x.from === "treatment.wantsFloorContact")!;
    expect(isMandatory(r)).toBe(true);
    expect(r.verification).toBe("unverifiable");
    expect(r.needsToVerify).toContain("nothing here sees a foot");
  });

  it("does not quietly drop a treatment ask the footage cannot satisfy", () => {
    const c = compatibilityOf(a, { wantsCoverage: "full_body" });
    // the requirement is carried…
    expect(c.requirements.some((r) => r.from === "treatment.wantsCoverage" && isMandatory(r))).toBe(
      true,
    );
    // …AND the disagreement is reported, with neither side softened
    const conflict = c.conflicts.find((x) => x.wants.includes("full body"))!;
    expect(conflict.footage).toContain("thigh up");
    expect(conflict.resolvableBy).toBeNull();
  });

  it("carries a treatment ask even when the footage cannot be read at all", () => {
    const blind = analysis({
      faces: Array.from({ length: 30 }, (_, i) => ({ t: i / 30, face: null })),
    });
    const r = compatibilityOf(blind, { wantsCoverage: "full_body" }).requirements.find(
      (x) => x.from === "treatment.wantsCoverage",
    )!;
    expect(isMandatory(r)).toBe(true);
    expect(r.verification).toBe("unverifiable");
  });

  it("makes a locked camera binding, because stillness is measured on both readings", () => {
    const c = compatibilityOf(a);
    const r = c.requirements.find((x) => x.kind === "camera" && x.text.includes("locked off"))!;
    expect(r.authority).toBe("source");
    expect(isMandatory(r)).toBe(true);
  });

  it("files the camera's own stability as guidance, because it is estimated", () => {
    const moving = Array.from({ length: 30 }, (_, i) =>
      detail(i / 30, i === 0 ? {} : { shift: [0.02, 0], borderShift: [0.02, 0] }),
    );
    const c = compatibilityOf(analysis({ detail: moving }));
    const r = c.requirements.find((x) => x.from === "camera.stability")!;
    expect(r.authority).toBe("advisory");
    expect(isMandatory(r)).toBe(false);
  });
});

describe("the route", () => {
  it("prefers a composite when the camera is locked and he separates", () => {
    const c = compatibilityOf(analysis());
    expect(c.route.choice).toBe("composite");
    expect(c.route.because.join(" ")).toContain(
      "performance, timing and lip movement survive a composite",
    );
    expect(c.route.rejected.map((r) => r.choice)).toContain("reshoot");
  });

  it("asks for a reshoot only when the footage itself is unusable", () => {
    const noFace = analysis({
      faces: Array.from({ length: 30 }, (_, i) => ({ t: i / 30, face: null })),
    });
    expect(routeFor(noFace, { hardCount: 0, risks: [], conflicts: [] }).choice).toBe("reshoot");
  });

  it("does not ask for a reshoot merely because the background is hard to cut him off", () => {
    // a busy, detailed background on otherwise good frames: hard to matte, not a reason to film again
    const busy = Array.from({ length: 30 }, (_, i) =>
      detail(i / 30, { sharp: Array.from({ length: DETAIL_TILES * DETAIL_TILES }, () => 0.09) }),
    );
    const c = compatibilityOf(analysis({ detail: busy }));
    expect(c.route.choice).not.toBe("reshoot");
    expect(c.route.rejected.some((r) => r.choice === "reshoot" && r.why.includes("usable"))).toBe(
      true,
    );
  });

  it("DOES ask for a reshoot when most frames are lost to movement", () => {
    const blurry = Array.from({ length: 30 }, (_, i) =>
      detail(i / 30, {
        sharp: Array.from({ length: DETAIL_TILES * DETAIL_TILES }, () => (i % 2 ? 0.05 : 0.01)),
      }),
    );
    const c = compatibilityOf(analysis({ detail: blurry }));
    expect(c.route.choice).toBe("reshoot");
    // …and still says to look at the frames before booking a day
    expect(c.route.risks.join(" ")).toContain("look at the frames before booking a day");
  });

  it("keeps the take rather than restaging when the movement cannot be attributed", () => {
    const odd = Array.from({ length: 30 }, (_, i) =>
      detail(i / 30, i === 0 ? {} : { shift: null, borderShift: [0.02, 0] }),
    );
    const c = compatibilityOf(analysis({ detail: odd }));
    expect(c.route.choice).toBe("keep");
    expect(c.route.rejected.some((r) => r.choice === "composite")).toBe(true);
  });

  it("names what AVT cannot do for the route it picked", () => {
    const c = compatibilityOf(analysis());
    expect(c.gaps.join(" ")).toContain("matting exists but only as a local script");
  });
});

describe("the treatment is not rewritten, and neither is the footage", () => {
  const a = analysis();

  it("reports a conflict the take cannot satisfy, with no way out", () => {
    const c = compatibilityOf(a, { wantsCoverage: "full_body" } satisfies TreatmentIntent);
    const conflict = c.conflicts.find((x) => x.wants.includes("full body"));
    expect(conflict).toBeTruthy();
    expect(conflict!.resolvableBy).toBeNull();
  });

  it("offers a crop rather than a reshoot when the take holds MORE than the treatment asks", () => {
    const c = compatibilityOf(a, { wantsCoverage: "chest_up" });
    const conflict = c.conflicts.find((x) => x.wants.includes("chest up"));
    expect(conflict!.resolvableBy).toContain("a crop");
    expect(c.route.choice).not.toBe("reshoot");
  });

  it("offers the 2D move that exists rather than calling a locked take wrong", () => {
    const c = compatibilityOf(a, { wantsCameraMove: "push" });
    expect(c.conflicts.find((x) => x.wants.includes("push"))!.resolvableBy).toContain(
      "camera_engine.py",
    );
  });

  it("says plainly that he cannot be relit", () => {
    const c = compatibilityOf(a, { wantsKeyDirection: "frame_left" });
    const conflict = c.conflicts.find((x) => x.wants.includes("frame left"));
    expect(conflict?.resolvableBy ?? "").toContain("he cannot be relit");
  });
});

describe("the capture checklist is built from this take, not from a list of good practice", () => {
  it("says nothing about sound when the take has sound", () => {
    expect(compatibilityOf(analysis()).capture.join(" ")).not.toContain("Record audio");
  });

  it("says it when the take has none", () => {
    expect(
      compatibilityOf(analysis({ file: { ...FILE, hasAudio: false } })).capture.join(" "),
    ).toContain("Record audio");
  });

  it("calls out an edge only when he actually goes near one", () => {
    expect(compatibilityOf(analysis()).capture.join(" ")).not.toContain("frame-edge band");
    const edgy = analysis({
      faces: Array.from({ length: 30 }, (_, i) => face(i / 30, { cx: i < 3 ? 0.03 : 0.5 })),
    });
    expect(compatibilityOf(edgy).capture.join(" ")).toContain("frame-edge band");
  });
});

describe("colour", () => {
  it("makes a tagged transfer a hard constraint and names the gap it opens", () => {
    const c = compatibilityOf(analysis({ file: { ...FILE, transfer: "arib-std-b67" } }));
    expect(c.requirements.some((h) => h.kind === "colour" && h.text.includes("arib-std-b67"))).toBe(
      true,
    );
    expect(c.gaps.join(" ")).toContain("no colour-transfer step");
  });
});
