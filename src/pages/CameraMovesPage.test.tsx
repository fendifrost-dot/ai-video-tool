import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CameraMovesPage from "./CameraMovesPage";

describe("camera moves page", () => {
  it("lists the library and prepares an unsent environment plate", () => {
    render(<CameraMovesPage projectId="project-1" />);
    expect(screen.getByRole("heading", { name: "Camera moves" })).toBeTruthy();
    expect(screen.getByTestId("camera-move-list").textContent).toContain("Orbit");
    fireEvent.click(screen.getByTestId("camera-move-prepare"));
    const plan = screen.getByTestId("camera-move-plan");
    expect(plan.textContent).toContain("Submitted: false");
    expect(plan.textContent).toContain("【Generation Goal】");
    expect(plan.textContent).toContain("No person, face, mouth, or body is generated.");
  });
});
