/**
 * Lane H — integration / UX QA.
 *
 * Locks the merged Wave 1+2 acceptance criteria for the project rail:
 *   • Primary rail is the creative workflow (Setup → Treatment → Storyboard →
 *     Review → Export) and exposes NO engineering / Architecture-C surfaces in
 *     the default creative mode.
 *   • Flipping to Advanced (engineering mode) reveals the engineering
 *     destinations — nothing is deleted, only gated.
 *   • Deep-linking straight to an advanced route reveals Advanced even in
 *     creative mode (no dead nav).
 *   • The rail split and the shared `ADVANCED_DESTINATION_KEYS` contract stay
 *     in sync so Lane A (sidebar) and Lane G (mode store) cannot drift apart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectSidebar, primaryItems, advancedItems } from "./ProjectSidebar";
import {
  ADVANCED_DESTINATION_KEYS,
  isDestinationVisible,
  setEngineeringMode,
  _internal,
} from "@/lib/ux/engineeringMode";

// --- module mocks -----------------------------------------------------------

let mockPathname = "/projects/p1/treatment";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => (
    <a data-testid="nav-link" {...props}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: unknown) => unknown }) =>
    select({ location: { pathname: mockPathname } }),
}));

vi.mock("@/lib/queries/projects", () => ({
  useProject: () => ({
    data: { title: "YSL Acceptance", active_variation_id: "v1" },
    isLoading: false,
  }),
}));

// the variation switcher under the title talks to the backend through these; the rail test is about the rail
vi.mock("@/components/VariationSwitcher", () => ({
  VariationSwitcher: ({ projectId }: { projectId: string }) => (
    <div data-testid="variation-switcher" data-project={projectId} />
  ),
}));

const PROJECT_ID = "p1";

/** Count matching labels — the rail renders both a desktop aside and a mobile row. */
function labelCount(label: string): number {
  return screen.queryAllByText(label).length;
}

beforeEach(() => {
  mockPathname = "/projects/p1/treatment";
  localStorage.clear();
  _internal.reset();
});

afterEach(() => {
  localStorage.clear();
  _internal.reset();
});

describe("ProjectSidebar rail composition", () => {
  it("shows the creative funnel and hides engineering surfaces by default", () => {
    render(<ProjectSidebar projectId={PROJECT_ID} />);

    // Primary funnel is always present.
    for (const label of ["Setup", "Treatment", "Storyboard", "Review", "Export"]) {
      expect(labelCount(label)).toBeGreaterThanOrEqual(1);
    }
    expect(primaryItems.map((i) => i.key)).toEqual([
      "setup",
      "treatment",
      "storyboard",
      "review",
      "export",
    ]);

    // Engineering surfaces (incl. Architecture-C keyframe/temporal studios) are
    // NOT in the default rail.
    for (const label of [
      "Assets",
      "Produce Video",
      "Clip Scorecards",
      "Shot List",
      "Cover Flight",
      "Hero Frame",
      "Prompt Lab",
      "Music Video Editor",
      "Continuity",
    ]) {
      expect(labelCount(label)).toBe(0);
    }
  });

  it("reveals the engineering destinations in engineering mode", () => {
    setEngineeringMode("engineering");
    render(<ProjectSidebar projectId={PROJECT_ID} />);

    for (const label of [
      "Assets",
      "Produce Video",
      "Clip Scorecards",
      "Shot List",
      "Cover Flight",
      "Hero Frame",
      "Prompt Lab",
      "Music Video Editor",
      "Continuity",
    ]) {
      expect(labelCount(label)).toBeGreaterThanOrEqual(1);
    }
  });

  it("reveals Advanced when deep-linked onto an advanced route in creative mode", () => {
    mockPathname = "/projects/p1/hero-frame";
    render(<ProjectSidebar projectId={PROJECT_ID} />);

    // Still in creative mode, but the active advanced route must be reachable.
    expect(labelCount("Hero Frame")).toBeGreaterThanOrEqual(1);
  });
});

describe("rail ↔ engineering-mode contract", () => {
  it("advancedItems keys match ADVANCED_DESTINATION_KEYS exactly", () => {
    const railAdvanced = [...advancedItems.map((i) => i.key)].sort();
    const contractAdvanced = [...ADVANCED_DESTINATION_KEYS].sort();
    expect(railAdvanced).toEqual(contractAdvanced);
  });

  it("no destination is both primary and advanced", () => {
    const primaryKeys = new Set(primaryItems.map((i) => i.key));
    for (const item of advancedItems) {
      expect(primaryKeys.has(item.key)).toBe(false);
    }
  });

  it("every primary destination is visible in creative mode", () => {
    for (const item of primaryItems) {
      expect(isDestinationVisible(item.key, "creative")).toBe(true);
    }
  });

  it("every advanced destination is hidden in creative and shown in engineering", () => {
    for (const item of advancedItems) {
      expect(isDestinationVisible(item.key, "creative")).toBe(false);
      expect(isDestinationVisible(item.key, "engineering")).toBe(true);
    }
  });
});

describe("the phone row is the only project navigation under md", () => {
  // Reported 9 Oct 2026: on a phone only "Setup" was reachable. The row scrolls, but the variation switcher
  // sits in front of the steps with `w-full` and no cap, so a name like "Interrupted Broadcast · candidate 5"
  // took most of the screen and pushed Treatment and Storyboard off the right edge — with `scrollbar-none`
  // leaving nothing to say they were there.
  //
  // jsdom has no layout engine, so these assert the two things it CAN see: that every step is in the DOM, and
  // that the cap which makes the name clip instead of the navigation is still on the wrapper. The second is a
  // class assertion and would not catch the cap being defeated by some other rule — only a device or a
  // real-browser screenshot shows that.
  it("renders every one of the five steps, not just the first", () => {
    render(<ProjectSidebar projectId={PROJECT_ID} />);
    for (const label of ["Setup", "Treatment", "Storyboard", "Review", "Export"]) {
      expect(
        labelCount(label),
        `${label} should be in the phone row as well as the rail`,
      ).toBeGreaterThan(1);
    }
  });

  it("caps the variation switcher so the name clips instead of the steps", () => {
    const { container } = render(<ProjectSidebar projectId={PROJECT_ID} />);
    const row = container.querySelector(".md\\:hidden");
    expect(row, "the phone row should exist").not.toBeNull();
    // the switcher itself needs project data this test does not stand up, so assert on the wrapper that caps it
    const wrapper = row!.querySelector('[class*="max-w-[38vw]"]');
    expect(wrapper, "the switcher wrapper should carry a phone-width cap").not.toBeNull();
    expect(wrapper!.className).toMatch(/md:max-w-none/);
  });
});
