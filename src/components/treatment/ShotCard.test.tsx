import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseShotSpec } from "@/lib/treatment/shotSpec";
import { ShotCard } from "./ShotCard";
import { ShotStoryboard } from "./ShotStoryboard";

const hero = parseShotSpec({
  id: "c001",
  title: "Rooftop wide",
  purpose: "Establish the artist against the skyline",
  shotType: "performance",
  timeline: { start: 12, end: 16 },
  framing: "wide",
  cameraAngle: "low",
  cameraMotion: { type: "dolly", description: "slow push in" },
  environment: { description: "rooftop", timeOfDay: "dusk" },
  lighting: { style: "hard key", description: "neon rim" },
  wardrobe: { name: "Look A", description: "tailored coat" },
  performanceDirection: "confident, chin up",
  fx: [{ type: "lens flare" }],
  transitionOut: { type: "whip_pan" },
});

describe("ShotCard", () => {
  it("renders filmmaker-readable fields, not engineering jargon", () => {
    render(<ShotCard spec={hero} index={1} energy="high" />);

    expect(screen.getByText("Establish the artist against the skyline")).toBeInTheDocument();
    expect(screen.getByText("Rooftop wide")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Wide")).toBeInTheDocument();
    expect(screen.getByText("Low Angle")).toBeInTheDocument();
    // timecode (shown on both the previs overlay and the slate line) + slate number
    expect(screen.getAllByText(/0:12–0:16/).length).toBeGreaterThan(0);
    expect(screen.getByText("01")).toBeInTheDocument();
    // transition surfaces its human label
    expect(screen.getByText(/Whip Pan/)).toBeInTheDocument();

    // No engineering vocabulary leaks onto the card.
    expect(screen.queryByText(/SAM|keyframe|mask|temporal|reconstruction/i)).toBeNull();
  });

  it("hides fields that have no value", () => {
    const bare = parseShotSpec({ id: "x", purpose: "bare beat", timeline: { start: 0, end: 3 } });
    render(<ShotCard spec={bare} />);
    expect(screen.getByText("bare beat")).toBeInTheDocument();
    expect(screen.queryByText("Lighting")).toBeNull();
    expect(screen.queryByText("Wardrobe")).toBeNull();
  });
});

describe("ShotStoryboard", () => {
  it("orders shots chronologically by timeline start", () => {
    const later = parseShotSpec({ id: "b", purpose: "second", timeline: { start: 20, end: 24 } });
    const earlier = parseShotSpec({ id: "a", purpose: "first", timeline: { start: 0, end: 4 } });
    render(<ShotStoryboard specs={[later, earlier]} />);
    const purposes = screen.getAllByText(/first|second/).map((n) => n.textContent);
    expect(purposes).toEqual(["first", "second"]);
  });

  it("shows an empty state when there are no shots", () => {
    render(<ShotStoryboard specs={[]} />);
    expect(screen.getByText("No shots yet.")).toBeInTheDocument();
  });
});
