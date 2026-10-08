import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { committedOf, validBudget, type McpBudget } from "@/lib/queries/mcpBudgets";
import { AiBudgetsPanel } from "./AiBudgetsPanel";

const budget = (over: Partial<McpBudget>): McpBudget => ({
  id: "b1",
  label: "Interrupted Broadcast — candidate 4",
  projectId: "p1",
  approvedUsd: 10,
  status: "approved",
  note: null,
  createdAt: "2026-10-08T00:00:00Z",
  committedUsd: 2.5,
  calls: 3,
  ...over,
});

const panel = (budgets: McpBudget[], handlers: Partial<{ onCreate: never; onSet: never }> = {}) => {
  const onCreate = vi.fn(async () => undefined);
  const onSet = vi.fn(async () => undefined);
  render(
    <AiBudgetsPanel
      budgets={budgets}
      projects={[{ id: "p1", title: "YSL" }]}
      mcpUrl="https://x.supabase.co/functions/v1/avt-mcp"
      onCreate={handlers.onCreate ?? onCreate}
      onSet={handlers.onSet ?? onSet}
    />,
  );
  return { onCreate, onSet };
};

describe("AI budgets", () => {
  it("says nothing can be spent until a budget is approved", () => {
    panel([]);
    expect(screen.getByText(/cannot spend anything until you approve one/)).toBeTruthy();
    expect(screen.getByTestId("mcp-url").textContent).toContain("/functions/v1/avt-mcp");
  });

  it("shows what an approved budget has used and has left", () => {
    panel([budget({})]);
    expect(screen.getByTestId("budget-row").textContent).toContain("$2.50 of $10.00 used · $7.50 left · 3 paid calls");
    expect(screen.getByTestId("budget-row").textContent).toContain("YSL");
  });

  it("approves a budget an AI asked for, at the amount the owner sets", async () => {
    const { onSet } = panel([budget({ status: "pending", approvedUsd: 20, committedUsd: 0, calls: 0 })]);
    expect(screen.getByText("asked by an AI")).toBeTruthy();
    fireEvent.change(screen.getByTestId("approve-usd"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("approve-budget"));
    await waitFor(() => expect(onSet).toHaveBeenCalledWith({ id: "b1", status: "approved", usd: 12 }));
  });

  it("creates an approved budget for a project", async () => {
    const { onCreate } = panel([]);
    fireEvent.change(screen.getByLabelText("Video"), { target: { value: "IB stills" } });
    fireEvent.change(screen.getByTestId("budget-usd"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("budget-project"), { target: { value: "p1" } });
    fireEvent.click(screen.getByTestId("create-budget"));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ label: "IB stills", usd: 5, projectId: "p1" }));
  });

  it("closes a budget, and lists closed ones apart", async () => {
    const { onSet } = panel([budget({}), budget({ id: "b2", label: "Old", status: "closed" })]);
    expect(screen.getAllByTestId("budget-row")).toHaveLength(1);
    expect(screen.getByTestId("budgets-closed").textContent).toContain("Old");
    fireEvent.click(screen.getByTestId("close-budget"));
    await waitFor(() => expect(onSet).toHaveBeenCalledWith({ id: "b1", status: "closed" }));
  });
});

describe("budget arithmetic", () => {
  it("counts settled calls at their cost and the rest at their reservation", () => {
    const spend = [
      { budget_id: "b1", reserved_usd: "0.50", actual_usd: "0.14" },
      { budget_id: "b1", reserved_usd: 2, actual_usd: null },
      { budget_id: "b2", reserved_usd: 9, actual_usd: null },
    ];
    expect(committedOf(spend, "b1")).toEqual({ usd: 2.14, calls: 2 });
  });
  it("validates a new budget", () => {
    expect(validBudget({ label: "x", usd: 5 })).toBeNull();
    expect(validBudget({ label: " ", usd: 5 })).toMatch(/Name the video/);
    expect(validBudget({ label: "x", usd: 0 })).toMatch(/between/);
  });
});
