import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AlterPage from "./AlterPage";

describe("alter page", () => {
  it("offers the three modes and prepares an unsent 480p draft", () => {
    render(<AlterPage projectId="project-1" />);
    expect(screen.getByRole("heading", { name: "Alter" })).toBeTruthy();
    expect(screen.getByTestId("alter-modes").textContent).toContain("Motion transfer");
    expect(screen.getByTestId("alter-modes").textContent).toContain("Restyle");
    fireEvent.click(screen.getByTestId("alter-prepare"));
    const plan = screen.getByTestId("alter-plan");
    expect(plan.textContent).toContain("Submitted: false");
    expect(plan.textContent).toContain("Resolution: 480p");
    expect(plan.textContent).toContain("Do not lay his original face back");
    expect(plan.textContent).toContain("Audio generated: false");
    expect(plan.textContent).toContain("mouth");
  });
});
