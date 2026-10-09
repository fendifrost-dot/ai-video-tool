import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BatchRunView, type BatchRunViewProps, type BatchRowView } from "./BatchRunView";
import { BatchShotSchema, planRun, shotState, type BatchJobRow } from "@/lib/worldBatch";

const ANGLE = BatchShotSchema.parse({ id: "S06c_low_hero", kind: "angle", route: "seedance_ref", source_trim: [0, 4], angle: "a low hero angle", keep: ["navy cap"] });
const READY = { ...ANGLE, id: "S11c_low_hero", source_path: "u/p/seedance/S11c_src.mp4" };
const doneJob: BatchJobRow = {
  id: "row-1", provider: "higgsfield", status: "succeeded", external_job_id: "job-1", error_text: null, result_asset_id: "asset-9", created_at: "2026-10-02T18:00:00Z",
  request_payload_json: { settings: { batchRun: "r1", batchShotId: "DONE", route: "seedance_ref", kind: "angle", estimateUsd: 3.698, lookPreset: "film_bar_v1" } },
  response_payload_json: { resultUrl: "https://cdn.example/clip.mp4" },
};

function row(shot: typeof ANGLE, jobs: BatchJobRow[] = [], over: Partial<BatchRowView> = {}): BatchRowView {
  return { shot, state: shotState(shot, jobs), estimateUsd: 3.698, selected: true, resultUrl: null, storedPath: null, stillUrls: [], note: null, busy: null, ...over };
}

function props(over: Partial<BatchRunViewProps> = {}): BatchRunViewProps {
  const shots = [ANGLE, READY];
  return {
    runId: "r1", onRunId: vi.fn(), lookPresetId: "film_bar_v1", lookPresetIds: ["film_bar_v1", "handheld_doc_v1"], onLookPreset: vi.fn(),
    ceilingUsd: 25, onCeiling: vi.fn(), shotsText: "", onShotsText: vi.fn(), onLoad: vi.fn(), onLoadFile: vi.fn(), onFromStoryboard: vi.fn(),
    parseErrors: [], rows: shots.map((s) => row(s)), plan: planRun(shots, []), running: false, log: [], spentUsd: 0,
    onToggle: vi.fn(), onAttachSource: vi.fn(), onAttachStill: vi.fn(), onMarkFailed: vi.fn(), onRun: vi.fn(),
    ...over,
  };
}

describe("BatchRunView", () => {
  it("says exactly why a shot is not ready, and only the ready one is in the plan", () => {
    render(<BatchRunView {...props()} />);
    const rows = screen.getAllByTestId("shot-row");
    expect(rows.map((r) => r.getAttribute("data-state"))).toEqual(["blocked", "ready"]);
    expect(screen.getByTestId("shot-blocked").textContent).toContain("source clip");
    expect(screen.getByTestId("plan-summary").textContent).toBe("1 to submit · estimate $2.22 · ceiling $25.00");
  });

  it("says when an estimate rests on a published rate that has never been charged — and says nothing at the charged size", () => {
    render(<BatchRunView {...props()} />); // 720p: charged
    expect(screen.queryByTestId("plan-price-basis")).toBeNull();
    const low = { ...READY, id: "S12_480", resolution: "480p" as const };
    render(<BatchRunView {...props({ rows: [row(low)], plan: planRun([low], []) })} />);
    const note = screen.getByTestId("plan-price-basis").textContent ?? "";
    expect(note).toContain("Seedance at 480p");
    expect(note).toContain("never yet charged at that size");
    expect(note).toContain("not a verified price");
  });

  it("nothing is submitted without a second click that names the amount", () => {
    const onRun = vi.fn();
    render(<BatchRunView {...props({ onRun })} />);
    fireEvent.click(screen.getByTestId("run"));
    expect(onRun).not.toHaveBeenCalled();
    const confirm = screen.getByTestId("confirm-run");
    expect(confirm.textContent).toBe("Spend up to $2.22 — submit 1");
    fireEvent.click(confirm);
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("an estimate above the ceiling cannot be run", () => {
    render(<BatchRunView {...props({ ceilingUsd: 2 })} />);
    expect((screen.getByTestId("run") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("above the ceiling");
  });

  it("an empty plan cannot be run", () => {
    render(<BatchRunView {...props({ rows: [row(ANGLE)], plan: planRun([ANGLE], []) })} />);
    expect(screen.getByTestId("plan-summary").textContent).toBe("Nothing to submit.");
    expect((screen.getByTestId("run") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a finished shot links its clip and where it was saved; a submit that never reported back offers no blind retry", () => {
    const done = { ...READY, id: "DONE" };
    const lost = { ...READY, id: "LOST" };
    const lostJob: BatchJobRow = { ...doneJob, id: "row-2", status: "queued", external_job_id: null, result_asset_id: null, response_payload_json: null, request_payload_json: { settings: { batchRun: "r1", batchShotId: "LOST", route: "seedance_ref", kind: "angle", estimateUsd: 3.698, lookPreset: "film_bar_v1" } } };
    const jobs = [doneJob, lostJob];
    const onMarkFailed = vi.fn();
    render(
      <BatchRunView
        {...props({
          rows: [row(done, jobs, { resultUrl: "https://cdn.example/clip.mp4", storedPath: "asset asset-9" }), row(lost, jobs)],
          plan: planRun([done, lost], jobs),
          onMarkFailed,
        })}
      />,
    );
    expect((screen.getByTestId("result-url") as HTMLAnchorElement).href).toBe("https://cdn.example/clip.mp4");
    expect(screen.getByTestId("stored-path").textContent).toBe("saved: asset asset-9");
    expect(screen.queryByTestId("still-url")).toBeNull();
    expect(screen.getByTestId("plan-summary").textContent).toBe("Nothing to submit.");
    fireEvent.click(screen.getByTestId("mark-failed"));
    expect(onMarkFailed).toHaveBeenCalledWith("LOST");
  });

  it("a shot's stills are linked — the picked one first — so the picture can be judged before motion is paid for", () => {
    render(<BatchRunView {...props({ rows: [row(READY, [], { stillUrls: ["https://signed/a.png", "https://signed/b.png"] })], plan: planRun([READY], []) })} />);
    const links = screen.getAllByTestId("still-url") as HTMLAnchorElement[];
    expect(links.map((l) => [l.textContent, l.href])).toEqual([["Still", "https://signed/a.png"], ["Candidate 2", "https://signed/b.png"]]);
  });

  it("parse errors are shown by shot", () => {
    render(<BatchRunView {...props({ parseErrors: ["nope: route Invalid enum value"] })} />);
    expect(screen.getByTestId("parse-errors").textContent).toContain("nope: route");
  });
});
