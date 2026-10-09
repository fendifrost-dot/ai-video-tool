import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/voiceDirector/api", () => ({ runDirectorTurn: vi.fn(), speakDirectorReply: vi.fn(), transcribeDirectorAudio: vi.fn() }));

import { VoiceDirector } from "./VoiceDirector";

/**
 * On a phone the director must not sit on the storyboard: it is a small button until it is tapped, a sheet while
 * it is open, and a button again when closed. (From md up the panel is always shown — that is CSS: `md:block`.)
 */
describe("the voice director on a phone", () => {
  it("starts as a compact button, with the panel hidden below md", () => {
    render(<VoiceDirector projectId="p1" />);
    expect(screen.getByTestId("voice-director-open")).toBeTruthy();
    const panel = screen.getByTestId("voice-director-panel");
    expect(panel.getAttribute("data-open")).toBe("false");
    expect(panel.className).toContain("hidden");
    expect(panel.className).toContain("md:block"); // still there on a wide screen
    expect(screen.getByTestId("voice-director-open").className).toContain("md:hidden");
  });

  it("opens as a sheet on tap and goes back to the button on close", () => {
    render(<VoiceDirector projectId="p1" />);
    fireEvent.click(screen.getByTestId("voice-director-open"));
    const panel = screen.getByTestId("voice-director-panel");
    expect(panel.getAttribute("data-open")).toBe("true");
    expect(panel.className.split(" ")).not.toContain("hidden");
    expect(screen.queryByTestId("voice-director-open")).toBeNull();
    expect(panel.textContent).toContain("Hold to talk");
    fireEvent.click(screen.getByTestId("voice-director-close"));
    expect(screen.getByTestId("voice-director-panel").getAttribute("data-open")).toBe("false");
    expect(screen.getByTestId("voice-director-open")).toBeTruthy();
  });
});
