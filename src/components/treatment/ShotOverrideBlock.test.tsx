import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseShotSpec, type ShotSpec } from "@/lib/treatment/shotSpec";
import type { ShotOverride } from "@/lib/treatment/overrides";
import type { RegeneratedShot } from "@/lib/treatment/regenerateFromLyrics";
import { ShotCard } from "./ShotCard";
import { ShotOverrideBlock } from "./ShotOverrideBlock";
import { ShotOverrideProvider, type ShotOverrideContextValue } from "./shotOverrideContext";

/**
 * B3 + B4 at the surface the director actually touches.
 *
 * The two behaviours worth holding: an empty field saves as NULL (= not overridden, so the
 * coverage planner keeps filling it), and "From the lyrics" lands its result UNSAVED so a
 * regeneration can never silently overwrite a box someone liked.
 */

const spec: ShotSpec = parseShotSpec({
  id: "clip-07",
  purpose: "Artist delivers the hook",
  shotType: "performance",
  timeline: { start: 12, end: 18 },
  performanceDirection: "Generated: steady delivery",
  framing: "medium",
  cameraMotion: { type: "dolly", description: "push 0.16" },
});

const regenerated: RegeneratedShot = {
  direction: "The stair lights come up; the gator boots snap.",
  frame: "A marble stairwell at night, one man mid-step, alligator boots catching the tread lights.",
  cameraMotion: { type: "zoom", description: "snap_zoom · anamorphic_35" },
  framing: "close_up",
  cameraAngle: "low",
  transitionIn: { type: "crossfade", preset: "match_cut" },
  requiredElements: ["alligator boots"],
  renderPrompt: "…photoreal, no animation look",
  realismRisk: "medium",
  scene: {},
};

function ctx(over: Partial<ShotOverrideContextValue> = {}): ShotOverrideContextValue {
  return {
    projectId: "p1",
    overrides: {},
    saving: false,
    save: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    regenerate: vi.fn().mockResolvedValue(regenerated),
    regenerateBlockedReason: () => null,
    regeneratingSpecId: null,
    ...over,
  };
}

const mount = (value: ShotOverrideContextValue, s: ShotSpec = spec) =>
  render(
    <ShotOverrideProvider value={value}>
      <ShotOverrideBlock spec={s} />
    </ShotOverrideProvider>,
  );

const open = () => fireEvent.click(screen.getByText("Override"));

describe("the block only exists where editing makes sense", () => {
  it("renders nothing without a provider — read-only surfaces are unaffected", () => {
    const { container } = render(<ShotOverrideBlock spec={spec} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a ShotCard outside the provider is exactly as it was", () => {
    render(<ShotCard spec={spec} index={1} />);
    expect(screen.queryByTestId("shot-override")).toBeNull();
  });
});

describe("saving", () => {
  it("sends only what was typed; the untouched fields go as null", async () => {
    const c = ctx();
    mount(c);
    open();
    fireEvent.change(screen.getByPlaceholderText("Generated: steady delivery"), {
      target: { value: "He turns away on the last word" },
    });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(c.save).toHaveBeenCalledTimes(1));
    expect(c.save).toHaveBeenCalledWith("clip-07", {
      direction: "He turns away on the last word",
      frame: "",
      cameraMotionType: "",
      cameraMotionDescription: "",
      framing: "",
      transitionInPreset: "",
      requiredElements: [],
      notes: "",
    });
  });

  it("seeds the fields from a stored override", () => {
    const stored: ShotOverride = {
      specId: "clip-07",
      direction: "stored direction",
      cameraMotion: { type: "orbit", description: "around his shoulder" },
      framing: "close_up",
      transitionIn: { type: "whip_pan", preset: "whip_left", durationSeconds: null },
      requiredElements: ["the boots"],
      notes: "hold the last beat",
      updatedAt: "2026-10-02T00:00:00.000Z",
    };
    mount(ctx({ overrides: { "clip-07": stored } }));
    expect(screen.getByText("· saved")).toBeInTheDocument();
    open();
    expect(screen.getByDisplayValue("stored direction")).toBeInTheDocument();
    expect(screen.getByDisplayValue("around his shoulder")).toBeInTheDocument();
    expect(screen.getByText("the boots")).toBeInTheDocument();
    // the stored PRESET, not the coarse family, is what the select shows
    expect(screen.getByText("whip left")).toBeInTheDocument();
  });

  it("offers Reset only once something is stored", () => {
    mount(ctx());
    open();
    expect(screen.queryByText("Reset to generated")).toBeNull();
  });

  it("resets to the generated treatment", async () => {
    const stored: ShotOverride = {
      specId: "clip-07",
      direction: "stored",
      cameraMotion: null,
      framing: null,
      transitionIn: null,
      requiredElements: null,
      notes: null,
      updatedAt: "t",
    };
    const c = ctx({ overrides: { "clip-07": stored } });
    mount(c);
    open();
    fireEvent.click(screen.getByText("Reset to generated"));
    await waitFor(() => expect(c.reset).toHaveBeenCalledWith("clip-07"));
  });
});

describe("required elements", () => {
  it("adds a chip on Enter and removes it on the x", () => {
    mount(ctx());
    open();
    const input = screen.getByPlaceholderText("Must be in frame — type and press Enter");
    fireEvent.change(input, { target: { value: "alligator boots" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("alligator boots")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Remove alligator boots"));
    expect(screen.queryByText("alligator boots")).toBeNull();
  });

  it("does not add the same element twice", () => {
    mount(ctx());
    open();
    const input = screen.getByPlaceholderText("Must be in frame — type and press Enter");
    for (let i = 0; i < 2; i++) {
      fireEvent.change(input, { target: { value: "the car" } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    expect(screen.getAllByText("the car")).toHaveLength(1);
  });
});

describe("the second reading: Push it further", () => {
  const insert: ShotSpec = { ...spec, id: "sp-insert", shotType: "b_roll" };

  it("a card cut between the takes can ask for the line pushed past the literal", async () => {
    const c = ctx();
    mount(c, insert);
    open();
    fireEvent.click(screen.getByText("Push it further"));
    await waitFor(() => expect(c.regenerate).toHaveBeenCalledWith(insert, "surreal"));
    expect(c.save).not.toHaveBeenCalled();
    expect(await screen.findByText("· unsaved")).toBeInTheDocument();
  });

  it("a performance card has one reading — it is his real take", () => {
    mount(ctx());
    open();
    expect(screen.queryByText("Push it further")).not.toBeInTheDocument();
    expect(screen.getByText("From the lyrics")).toBeInTheDocument();
  });
});

describe("From the lyrics (B4)", () => {
  it("fills the fields but does NOT save — the director commits", async () => {
    const c = ctx();
    mount(c);
    open();
    fireEvent.click(screen.getByText("From the lyrics"));

    await waitFor(() => expect(c.regenerate).toHaveBeenCalledWith(spec, undefined));
    expect(c.save).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByDisplayValue("The stair lights come up; the gator boots snap."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("snap_zoom · anamorphic_35")).toBeInTheDocument();
    expect(screen.getByText("alligator boots")).toBeInTheDocument();
    expect(screen.getByText("· unsaved")).toBeInTheDocument();
    // the frame — the picture the shot opens on — arrives with it and is saved with it
    expect(screen.getByTestId("override-frame")).toHaveValue("A marble stairwell at night, one man mid-step, alligator boots catching the tread lights.");
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(c.save).toHaveBeenCalledTimes(1));
    expect((c.save as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({
      direction: "The stair lights come up; the gator boots snap.",
      frame: "A marble stairwell at night, one man mid-step, alligator boots catching the tread lights.",
    });
  });

  it("then saves what was regenerated through the same path a hand edit uses", async () => {
    const c = ctx();
    mount(c);
    open();
    fireEvent.click(screen.getByText("From the lyrics"));
    await waitFor(() => expect(c.regenerate).toHaveBeenCalled());
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(c.save).toHaveBeenCalledTimes(1));
    expect(c.save).toHaveBeenCalledWith(
      "clip-07",
      expect.objectContaining({
        direction: "The stair lights come up; the gator boots snap.",
        cameraMotionType: "zoom",
        framing: "close_up",
        requiredElements: ["alligator boots"],
        transitionInPreset: "match_cut",
      }),
    );
  });

  it("is disabled with the reason when the window is instrumental", () => {
    const c = ctx({ regenerateBlockedReason: () => "Instrumental — nothing to regenerate from" });
    mount(c);
    open();
    const btn = screen.getByText("From the lyrics").closest("button")!;
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Instrumental — nothing to regenerate from");
  });
});

describe("the overridden tag", () => {
  it("appears on a card whose spec carries an override", () => {
    render(<ShotCard spec={{ ...spec, origin: "override" }} index={1} />);
    expect(screen.getByTestId("shot-overridden-tag")).toBeInTheDocument();
  });

  it("is absent on a generated card", () => {
    render(<ShotCard spec={spec} index={1} />);
    expect(screen.queryByTestId("shot-overridden-tag")).toBeNull();
  });
});
