import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseShotSpec, type ShotSpecInput } from "@/lib/treatment/shotSpec";
import { _internal, setEngineeringMode } from "@/lib/ux/engineeringMode";
import { ShotPrevis } from "./ShotPrevis";

const BASE: ShotSpecInput = {
  id: "shot-42",
  purpose: "Rooftop wide as the beat drops",
  timeline: { start: 0, end: 4 },
  framing: "wide",
  cameraMotion: { type: "dolly" },
};

function spec(overrides: Partial<ShotSpecInput> = {}) {
  return parseShotSpec({ ...BASE, ...overrides });
}

afterEach(() => {
  _internal.reset();
});

describe("ShotPrevis", () => {
  it("renders an inline animated SVG sketch with a status badge", () => {
    render(<ShotPrevis spec={spec()} />);
    const region = screen.getByTestId("shot-previs");
    const svg = region.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(region.querySelector("animateTransform")).not.toBeNull();
    expect(screen.getByText("sketch")).toBeInTheDocument();
    // The caption appears in both the SVG <text> and the footer <p>.
    expect(screen.getByText(/deterministic · no render cost/)).toBeInTheDocument();
    expect(screen.getAllByText(/Wide · Dolly in/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows the real asset image and no sketch when one exists", () => {
    render(
      <ShotPrevis
        spec={spec({ previs: { status: "approved", uri: "https://cdn/clip.mp4", notes: "" } })}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://cdn/clip.mp4");
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByTestId("shot-previs").querySelector("animateTransform")).toBeNull();
  });

  it("reveals derivation details only in engineering mode", () => {
    const { rerender } = render(<ShotPrevis spec={spec()} />);
    expect(screen.queryByText(/seed/)).toBeNull();

    setEngineeringMode("engineering");
    rerender(<ShotPrevis spec={spec()} />);
    expect(screen.getByText(/seed/)).toBeInTheDocument();
    expect(screen.getByText(/motion/)).toBeInTheDocument();
  });

  it("compact mode hides the caption footer", () => {
    render(<ShotPrevis spec={spec()} compact />);
    expect(screen.queryByText(/deterministic · no render cost/)).toBeNull();
  });
});
