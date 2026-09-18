/**
 * Lane H — integration / UX QA.
 *
 * Smoke test for the merged Treatment surface: given a project with a saved
 * structured treatment, the builder must mount and wire together the Wave 2
 * pieces end-to-end —
 *   • the Creative Director planning panel (Lane D),
 *   • the cinematic Shot Storyboard fed by generalized Shot Specs (Lanes B/C).
 *
 * This guards the "Create Project → Treatment (storyboard + CD panel)" glue,
 * not the individual lane internals (those have their own unit tests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { TreatmentBuilderPage } from "./TreatmentBuilderPage";
import { setEngineeringMode, _internal } from "@/lib/ux/engineeringMode";

// --- fixtures ---------------------------------------------------------------

function clip(overrides: Record<string, unknown> = {}) {
  return {
    key: "v1",
    start: 0,
    end: 4,
    section: "intro",
    energy: "high",
    shot_type: "performance",
    scene_description: "Rooftop wide as the beat drops",
    camera_direction: "slow dolly in",
    lighting: "golden hour rim",
    wardrobe: "YSL tuxedo look",
    environment: "downtown rooftop",
    recommended_tool: "manual",
    lyric_ref: null,
    priority: "hero",
    dependencies: [],
    ...overrides,
  };
}

const SAVED_TREATMENT = {
  version: 2,
  project_type: "music_video",
  concept: "Opulent late-night runway",
  narrative: "A closet performance transforms into a luxury runway commercial.",
  sections: [{ name: "intro", intent: "establish the world" }],
  clips: [clip(), clip({ key: "v2", start: 4, end: 8, priority: "normal", energy: "drop" })],
  model: "test-model",
  generated_at: "2026-09-18T00:00:00.000Z",
};

// --- module mocks -----------------------------------------------------------

vi.mock("@/lib/queries/projects", () => ({
  useProject: () => ({
    data: {
      id: "p1",
      title: "YSL Acceptance",
      artist_id: "a1",
      treatment_json: SAVED_TREATMENT,
      song_title: "Ice On",
      visual_style: "luxury runway",
      mood: "opulent",
      notes: "",
    },
    isLoading: false,
  }),
}));

vi.mock("@/lib/queries/artists", () => ({
  useArtist: () => ({ data: { name: "Test Artist" } }),
}));

vi.mock("@/lib/queries/looks", () => ({
  useArtistLooks: () => ({ data: [] }),
}));

vi.mock("@/lib/queries/songAnalyses", () => ({
  useSongAnalysis: () => ({
    data: {
      bpm: 120,
      duration_seconds: 8,
      drops_json: [],
      energy_curve_json: [],
    },
  }),
}));

vi.mock("@/lib/queries/shots", () => ({
  useProjectShots: () => ({ data: [] }),
  useBulkCreateShots: () => ({ mutateAsync: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  _internal.reset();
});

afterEach(() => {
  localStorage.clear();
  _internal.reset();
});

describe("TreatmentBuilderPage integration", () => {
  it("mounts the treatment builder with the Creative Director panel and storyboard", () => {
    render(<TreatmentBuilderPage projectId="p1" />);

    // Page shell.
    expect(screen.getByText("Treatment Builder")).toBeInTheDocument();

    // Creative Director panel (Lane D) is mounted.
    expect(screen.getByText("Creative Director")).toBeInTheDocument();

    // Saved treatment surfaces its concept and the storyboard (default view).
    expect(screen.getByText("Opulent late-night runway")).toBeInTheDocument();
    expect(screen.getByText(/2 shots/)).toBeInTheDocument();
  });

  it("keeps engineering vocabulary out of the director-facing storyboard", () => {
    setEngineeringMode("creative");
    const { container } = render(<TreatmentBuilderPage projectId="p1" />);

    // "Hide complexity, do not remove capability": the storyboard is a
    // director's surface — engineering-stage vocabulary must never leak into it.
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/keyframe|\bSAM\b|temporal|reconstruction|propagation/i);
  });
});
