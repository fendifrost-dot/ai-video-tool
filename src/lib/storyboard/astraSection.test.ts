import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { frameLabel, parseSectionReview, readStoredReview, reviewBrief, reviewEstimateUsd, SECTION_REVIEW_SCHEMA, showsOf, type ReviewShot } from "./astraSection";
import type { TimelineSegment } from "./media";

const shots: ReviewShot[] = [
  { number: 13, key: "c013", shotId: "id13", start: 47.06, end: 50.98, shows: "the artist's real performance, re-shot…", scene: "He performs in the backstage fitting room.", lyrics: "Yves Saint Laurent / On the weekend" },
  { number: 14, key: "c014", shotId: "id14", start: 50.98, end: 54.9, shows: "a generated clip", scene: "A black car on a wet highway at night.", lyrics: "Drive like a getaway driver" },
];

describe("what the reviewer is told", () => {
  it("is the treatment, the notes, what he wears, and every shot with its scene and its words", () => {
    const brief = reviewBrief({ songTitle: "YSL (Ice On)", treatment: "ONE IDEA.", notes: "No logos.", takeWears: "a camouflage shirt", shots });
    expect(brief).toContain('for "YSL (Ice On)"');
    expect(brief).toContain("The section runs 0:47.1–0:54.9 of the song, shots 13–14.");
    expect(brief).toContain("The treatment — the one creative brief:\nONE IDEA.");
    expect(brief).toContain("In his real footage the artist wears: a camouflage shirt.");
    expect(brief).toContain('SHOT 14 (0:51.0–0:54.9, 3.9 s) — shows a generated clip.\n  Scene: A black car on a wet highway at night.\n  Words: "Drive like a getaway driver"');
    expect(brief).toContain("Every finding is about ONE shot, named by its number");
    // nothing blank is sent
    expect(reviewBrief({ treatment: "", shots })).toContain("(none written)");
    expect(reviewBrief({ treatment: "T", shots })).not.toContain("The director's notes");
  });

  it("labels every frame with the shot it belongs to", () => {
    expect(frameLabel({ number: 7 }, 62.75, "opening")).toBe("SHOT 07 — opening — song 1:02.8");
  });

  it("says what a shot is showing: real, restaged, generated, nothing", () => {
    const seg = (media: TimelineSegment["media"]) => ({ shotId: "s", key: "k", index: 1, start: 0, end: 4, section: null, media, scene: "", note: null }) as TimelineSegment;
    expect(showsOf(seg({ kind: "none" }), null)).toMatch(/nothing yet/);
    expect(showsOf(seg({ kind: "video", assetId: "a", role: "performance", sourceIn: 0, sourceOut: 4, leadIn: 0, base: true }), { derivedFrom: null })).toBe("the artist's real performance footage");
    expect(showsOf(seg({ kind: "video", assetId: "a", role: "performance", sourceIn: 0, sourceOut: 4, leadIn: 0, base: false }), { derivedFrom: { assetId: "t", songStart: 0 } })).toMatch(/re-shot by a video model/);
    expect(showsOf(seg({ kind: "image", assetId: "a", role: "generated_image", base: false }), null)).toMatch(/generated still/);
  });

  it("is priced from the pictures sent", () => {
    expect(reviewEstimateUsd(30, 3500)).toBe(0.79);
    expect(SECTION_REVIEW_SCHEMA.schema.properties.findings.items.required).toEqual(["shot", "severity", "area", "finding", "fix"]);
  });
});

describe("what comes back", () => {
  it("ties each finding to its shot record, in song order, worst first — and keeps an unknown shot number visible", () => {
    const r = parseSectionReview(
      {
        verdict: "revise",
        summary: " Strong hook. ",
        strengths: ["the runway"],
        release: "Fix 14 first.",
        findings: [
          { shot: 14, severity: "minor", area: "rhythm", finding: "holds a beat too long", fix: "trim" },
          { shot: 14, severity: "blocker", area: "artifact", finding: "the car melts", fix: "regenerate the clip" },
          { shot: 13, severity: "major", area: "identity", finding: "the face softens", fix: "restage again" },
          { shot: 99, severity: "weird", area: "nonsense", finding: "something", fix: "" },
          { shot: 13, severity: "minor", area: "wardrobe", finding: "  ", fix: "" },
        ],
      },
      shots,
    );
    expect(r.verdict).toBe("revise");
    expect(r.summary).toBe("Strong hook.");
    expect(r.findings.map((f) => [f.shot, f.severity, f.key, f.shotId])).toEqual([
      [13, "major", "c013", "id13"],
      [14, "blocker", "c014", "id14"],
      [14, "minor", "c014", "id14"],
      [99, "minor", null, null],
    ]);
    expect(r.findings[3].area).toBe("storyboard");
    expect(parseSectionReview(null, shots)).toMatchObject({ verdict: "revise", findings: [], strengths: [] });
  });

  it("is read back from the project, or not at all", () => {
    expect(readStoredReview(null)).toBeNull();
    expect(readStoredReview({ astra_review: { summary: "x" } })).toBeNull();
    const kept = readStoredReview({ treatment: {}, astra_review: { at: "2026-10-03T10:00:00Z", from: 13, to: 22, verdict: "pass", summary: "Good.", strengths: [], release: "", findings: [], costUsd: 0.81, model: "gpt-6-astra" } });
    expect(kept).toMatchObject({ from: 13, to: 22, verdict: "pass", costUsd: 0.81 });
  });
});
