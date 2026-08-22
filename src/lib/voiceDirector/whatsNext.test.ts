import { describe, expect, it } from "vitest";
import { computeWhatsNext, formatShotPrompt, pickShotForPrompt } from "./whatsNext";

describe("computeWhatsNext", () => {
  it("does not invent analysis and flags empty shot list", () => {
    const result = computeWhatsNext({
      hasTreatment: false,
      hasAnalysis: false,
      sections: [{ name: "verse_1" }, { name: "hook" }],
      shots: [],
    });
    expect(result.gaps.some((g) => /BPM/i.test(g))).toBe(true);
    expect(result.gaps.some((g) => /empty/i.test(g))).toBe(true);
    expect(result.options).toHaveLength(3);
    expect(result.toolsUsed).not.toContain("read_song_analysis");
  });

  it("reports uncovered sections without inventing shots", () => {
    const result = computeWhatsNext({
      hasTreatment: true,
      hasAnalysis: true,
      sections: [{ name: "verse 1" }, { name: "hook" }],
      shots: [
        {
          shot_number: 1,
          song_section: "verse_1",
          scene_description: "Wide",
          duration_seconds: 3,
          shot_type: "performance",
          status: "draft",
        },
      ],
    });
    expect(result.summary).toMatch(/uncovered/i);
    expect(result.gaps.join(" ")).toMatch(/hook/i);
    expect(result.toolsUsed).toContain("read_song_analysis");
  });
});

describe("pickShotForPrompt", () => {
  const shots = [
    {
      shot_number: 4,
      song_section: "hook",
      scene_description: "Jacket CU",
      duration_seconds: 3,
      shot_type: "performance",
      status: "draft",
    },
  ];

  it("picks by spoken shot number", () => {
    expect(pickShotForPrompt(shots, "read me shot 4")?.shot_number).toBe(4);
  });

  it("formats a working prompt from the scene, not a new generation", () => {
    expect(formatShotPrompt(shots[0])).toMatch(/Jacket CU/);
  });
});
