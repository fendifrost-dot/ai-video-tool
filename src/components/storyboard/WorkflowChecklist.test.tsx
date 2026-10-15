import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { workflowStatus } from "@/lib/storyboard/workflow";
import { WorkflowChecklist } from "./WorkflowChecklist";

describe("the workflow checklist", () => {
  it("shows the six steps with their counts, and integrate as not automated", () => {
    const steps = workflowStatus({
      hasTreatment: true,
      outfits: 1,
      scenes: [{ assigned: true }],
      shots: [
        {
          performance: true,
          hasTake: true,
          hasSelectedClip: false,
          needsDress: true,
          dressed: [{ stale: true }],
          composited: false,
        },
      ],
    });
    render(<WorkflowChecklist steps={steps} />);
    const items = screen.getByTestId("workflow-checklist").querySelectorAll("li");
    expect(items).toHaveLength(6);
    expect(screen.getByTestId("workflow-step-treatment").textContent).toContain("1/1");
    expect(screen.getByTestId("workflow-step-dress").textContent).toContain("0/1");
    expect(screen.getByTestId("workflow-step-dress").textContent).toContain("1 stale");
    expect(screen.getByTestId("workflow-step-integrate").textContent).toContain(
      "Integrate (composite)",
    );
    expect(screen.getByTestId("workflow-step-integrate").getAttribute("data-state")).toBe("manual");
    expect(screen.getByTestId("workflow-step-integrate").textContent).toMatch(/not automated yet/);
  });

  it("renders nothing without steps", () => {
    const { container } = render(<WorkflowChecklist steps={[]} />);
    expect(container.textContent).toBe("");
  });
});
