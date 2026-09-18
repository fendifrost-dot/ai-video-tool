/**
 * Lane H — integration / UX QA.
 *
 * Locks the merged Wave 1+2 acceptance criteria for the project rail:
 *   • Primary rail is the creative funnel (Treatment → Assets → Produce Video →
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
  useProject: () => ({ data: { title: "YSL Acceptance" }, isLoading: false }),
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
    for (const label of ["Treatment", "Assets", "Produce Video", "Review", "Export"]) {
      expect(labelCount(label)).toBeGreaterThanOrEqual(1);
    }

    // Engineering surfaces (incl. Architecture-C keyframe/temporal studios) are
    // NOT in the default rail.
    for (const label of [
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
