/**
 * The Treatment page: ONE treatment, AI-written or hand-written, editable and deletable — and nothing else on the
 * page that directs the video (Fendi, 2026-10-03).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TreatmentPage from "./TreatmentPage";

const state = vi.hoisted(() => ({
  treatmentJson: null as unknown,
  lyrics: "a line" as string | null,
  lyricLines: [{ lineIndex: 0 }] as unknown[],
  boxes: [] as unknown[],
  assignments: [] as unknown[],
  hasSong: true,
  versions: [] as unknown[],
  entities: [
    { id: "e1", key: "BLACK_RUNWAY", kind: "location", name: "Black Runway", description: "A long black runway.", archived: false },
    { id: "e2", key: "OLD_STREET", kind: "location", name: "Old Street", description: "Gone.", archived: true },
  ] as unknown[],
}));
const calls = vi.hoisted(() => ({
  restore: vi.fn(async (..._args: unknown[]) => undefined),
  saveTreatment: vi.fn(async (..._args: unknown[]) => ({})),
  deleteTreatment: vi.fn(async (..._args: unknown[]) => undefined),
  write: vi.fn(async (..._args: unknown[]) => ({ written: 2, kept: 1 })),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params: _p, ...rest }: { children: React.ReactNode; to: string; params?: unknown }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn(async () => undefined) }) }));
vi.mock("@/lib/queries/projects", () => ({
  projectsKeys: { detail: (id: string) => ["p", id] },
  useUpdateProject: () => ({ mutateAsync: vi.fn(async () => ({})) }),
}));
vi.mock("@/lib/queries/treatmentVersions", () => ({
  treatmentVersionsKeys: { forProject: (id: string) => ["tv", id] },
  useTreatmentVersions: () => ({ data: state.versions, isLoading: false, isError: false, error: null }),
  useRestoreTreatmentVersion: () => ({ mutateAsync: calls.restore }),
}));
vi.mock("@/lib/queries/continuity", () => ({ useContinuityEntities: () => ({ data: state.entities }) }));
vi.mock("@/lib/queries/treatmentInputs", () => ({
  useTreatmentInputs: () => ({
    project: { id: "p1", treatment_json: state.treatmentJson, lyrics: state.lyrics, mood: "opulent", visual_style: "luxury runway", notes: "" },
    projectQuery: { isLoading: false },
    analysis: { bpm: 122, duration_seconds: 200 },
    lyricLines: state.lyricLines,
    looks: [],
    treatmentContext: () => ({ projectId: "p1", projectType: "music_video" }),
  }),
}));
vi.mock("@/lib/queries/storyboard", () => ({
  storyboardKeys: { boxes: (id: string) => ["b", id] },
  useStoryboardBoxes: () => ({ data: state.boxes }),
  useAssignments: () => ({ data: state.assignments }),
  useTakeSyncs: () => ({ data: [] }),
  useProjectMedia: () => ({ list: [], byId: new Map(), song: state.hasSong ? { id: "song", file_url: "u/p/s.wav" } : null }),
}));
vi.mock("@/lib/storyboard/build", () => ({
  saveTreatment: calls.saveTreatment,
  deleteTreatment: calls.deleteTreatment,
  writeStoryboardFromTreatment: calls.write,
}));

const CONFIRMED = { setup: { footage_confirmed_at: "2026-10-03T00:00:00Z" } };
const SAVED = {
  ...CONFIRMED,
  version: 2,
  concept: "Opulent late-night runway",
  narrative: "A closet performance becomes a runway.",
  sections: [{ name: "intro", intent: "establish" }, { name: "hook", intent: "lift" }],
  clips: [{ key: "c001", dependencies: [{ kind: "look_composite", look: "Look A", note: "composite" }] }],
  model: "test-model",
  generated_at: "2026-09-18T00:00:00.000Z",
};

beforeEach(() => {
  state.treatmentJson = CONFIRMED;
  state.lyrics = "a line";
  state.lyricLines = [{ lineIndex: 0 }];
  state.boxes = [];
  state.assignments = [];
  state.hasSong = true;
  state.versions = [];
  Object.values(calls).forEach((f) => f.mockClear());
});

describe("TreatmentPage", () => {
  it("with no treatment, offers the two ways to make one", () => {
    render(<TreatmentPage projectId="p1" />);
    expect(screen.getByTestId("treatment-tab-ai")).toBeTruthy();
    expect(screen.getByTestId("treatment-tab-manual")).toBeTruthy();
    expect(screen.getByTestId("treatment-generate")).toBeTruthy();
    fireEvent.click(screen.getByTestId("treatment-tab-manual"));
    expect(screen.getByTestId("treatment-text")).toBeTruthy();
  });

  it("a hand-written treatment is saved exactly as typed, marked as the director's", async () => {
    render(<TreatmentPage projectId="p1" />);
    fireEvent.click(screen.getByTestId("treatment-tab-manual"));
    fireEvent.change(screen.getByTestId("treatment-text"), { target: { value: "  My treatment,\nexactly.  " } });
    fireEvent.click(screen.getByTestId("treatment-save"));
    await waitFor(() => expect(calls.saveTreatment).toHaveBeenCalled());
    const doc = calls.saveTreatment.mock.calls[0][2] as { text: string; mode: string };
    expect(doc.text).toBe("  My treatment,\nexactly.  ");
    expect(doc.mode).toBe("manual");
  });

  it("shows the saved treatment with a way to edit, regenerate and delete it", () => {
    state.treatmentJson = SAVED;
    render(<TreatmentPage projectId="p1" />);
    expect(screen.getByTestId("treatment-saved-text").textContent).toBe("Opulent late-night runway\n\nA closet performance becomes a runway.");
    expect(screen.getByTestId("treatment-edit")).toBeTruthy();
    expect(screen.getByTestId("treatment-regenerate")).toBeTruthy();
    expect(screen.getByTestId("treatment-delete")).toBeTruthy();
    fireEvent.click(screen.getByTestId("treatment-edit"));
    expect((screen.getByTestId("treatment-text") as HTMLTextAreaElement).value).toContain("Opulent late-night runway");
  });

  it("deleting asks first, and says the shots and footage stay", async () => {
    state.treatmentJson = SAVED;
    render(<TreatmentPage projectId="p1" />);
    fireEvent.click(screen.getByTestId("treatment-delete"));
    expect(calls.deleteTreatment).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirm-dialog").textContent).toMatch(/shots, the footage on them and your edits stay/);
    fireEvent.click(screen.getByTestId("confirm-delete-treatment"));
    await waitFor(() => expect(calls.deleteTreatment).toHaveBeenCalledWith("p1", SAVED));
  });

  it("carries nothing that competes with the treatment: no second brief, no section buttons, no prep list, no second planner", () => {
    state.treatmentJson = SAVED;
    const { container } = render(<TreatmentPage projectId="p1" />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Your bar/i);
    expect(text).not.toMatch(/Prep assets/i);
    expect(text).not.toMatch(/Creative Director/i);
    expect(text).not.toMatch(/Commit .* to shot list/i);
    expect(container.querySelector('[data-testid="creative-exemplars"]')).toBeNull();
    // the old section pills were bare labels named after the sections
    expect(screen.queryByText("intro")).toBeNull();
    expect(screen.queryByText("hook")).toBeNull();
  });

  it("generation waits for Setup and says what is missing; writing by hand does not", () => {
    state.treatmentJson = null; // footage not confirmed
    render(<TreatmentPage projectId="p1" />);
    expect(screen.getByTestId("treatment-gate").textContent).toMatch(/All real footage is in/);
    fireEvent.click(screen.getByTestId("treatment-generate"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
    expect(calls.write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("treatment-tab-manual"));
    expect(screen.getByTestId("treatment-text")).toBeTruthy();
  });

  it("AI generate confirms, then makes ONE call that writes the text and the shots", async () => {
    render(<TreatmentPage projectId="p1" />);
    fireEvent.click(screen.getByTestId("treatment-generate"));
    fireEvent.click(screen.getByTestId("confirm-generate-treatment"));
    await waitFor(() => expect(calls.write).toHaveBeenCalledTimes(1));
    expect(calls.write.mock.calls[0][0]).toMatchObject({ aiWritesText: true, treatmentText: "" });
    // the writer is handed the project's own places, props and lighting states to point shots at — not the archived ones
    expect((calls.write.mock.calls[0][0] as { context: { entities: unknown[] } }).context.entities).toEqual([{ key: "BLACK_RUNWAY", kind: "location", name: "Black Runway", description: "A long black runway." }]);
  });

  it("an edited treatment is behind its shots until they are rewritten — and only the shots that are not the director's", () => {
    const blank = { direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null };
    state.treatmentJson = { ...SAVED, treatment: { text: "A new idea.", mode: "manual", updated_at: "t", notes: "", storyboard: { from: "0:x", at: "2026-10-01", written: 3, kept: 0 } } };
    state.boxes = [
      { id: "r1", key: "c001", locked: false, override: null },
      { id: "r2", key: "c002", locked: true, override: { ...blank, direction: "mine" } },
      { id: "r3", key: "c003", locked: false, override: null },
    ];
    state.assignments = [{ shotId: "r3" }];
    render(<TreatmentPage projectId="p1" />);
    expect(screen.getByTestId("treatment-storyboard-status").textContent).toMatch(/treatment changed after the shots were written/);
    expect(screen.getByTestId("treatment-write-shots").textContent).toContain("Rewrite the 1 shot that is not yours");
    fireEvent.click(screen.getByTestId("treatment-write-shots"));
    expect(screen.getByTestId("confirm-dialog").textContent).toMatch(/1 of the 3 shots are rewritten\. 2 are yours/);
  });

  describe("Current and Versions", () => {
    const V1 = { id: "v1", projectId: "p1", replacedAt: "2026-10-03T10:04:12Z", replacedBy: "generate", text: "The treatment that was here before.", mode: "manual", model: null, writtenAt: "2026-10-01T00:00:00Z", notes: "the earlier notes", mood: "opulent", visualStyle: "an earlier world" };
    const V2 = { ...V1, id: "v2", replacedAt: "2026-10-02T08:00:00Z", replacedBy: "edit", text: "An even earlier one.", notes: "" };

    it("regenerating and deleting say the current text is kept and can be restored", () => {
      state.treatmentJson = SAVED;
      render(<TreatmentPage projectId="p1" />);
      fireEvent.click(screen.getByTestId("treatment-regenerate"));
      expect(screen.getByTestId("confirm-dialog").textContent).toMatch(/kept under Versions and can be restored/);
      fireEvent.click(screen.getByTestId("confirm-cancel"));
      fireEvent.click(screen.getByTestId("treatment-delete"));
      expect(screen.getByTestId("confirm-dialog").textContent).toMatch(/kept under Versions and can be restored/);
    });

    it("lists the earlier versions, newest first, and opens one to read it whole", () => {
      state.treatmentJson = SAVED;
      state.versions = [V1, V2];
      render(<TreatmentPage projectId="p1" />);
      expect(screen.getByTestId("treatment-view-versions").textContent).toContain("2");
      fireEvent.click(screen.getByTestId("treatment-view-versions"));
      // the current treatment is not shown under Versions, and is not gone
      expect(screen.queryByTestId("treatment-saved-text")).toBeNull();
      const rows = screen.getAllByTestId("treatment-version");
      expect(rows.map((r) => r.getAttribute("data-version-id"))).toEqual(["v1", "v2"]);
      expect(rows[0].textContent).toMatch(/replaced when the AI wrote a new treatment/);
      fireEvent.click(screen.getAllByTestId("treatment-version-open")[0]);
      expect(screen.getByTestId("treatment-version-text").textContent).toBe("The treatment that was here before.");
      expect(screen.getByTestId("treatment-version-notes").textContent).toBe("the earlier notes");
      expect(screen.getByTestId("treatment-version-differs").textContent).toMatch(/the treatment text, the notes, the visual direction/);
      fireEvent.click(screen.getByTestId("treatment-view-current"));
      expect(screen.getByTestId("treatment-saved-text")).toBeTruthy();
    });

    it("restoring asks first, says what is current is kept, and restores that version", async () => {
      state.treatmentJson = SAVED;
      state.versions = [V1];
      render(<TreatmentPage projectId="p1" />);
      fireEvent.click(screen.getByTestId("treatment-view-versions"));
      fireEvent.click(screen.getByTestId("treatment-version-open"));
      fireEvent.click(screen.getByTestId("treatment-version-restore"));
      expect(calls.restore).not.toHaveBeenCalled();
      expect(screen.getByTestId("confirm-dialog").textContent).toMatch(/What is current now is kept as a version of its own/);
      expect(screen.getByTestId("confirm-dialog").textContent).toMatch(/shots, their footage and your edits are not touched/);
      fireEvent.click(screen.getByTestId("confirm-restore-treatment"));
      await waitFor(() => expect(calls.restore).toHaveBeenCalledTimes(1));
      expect(calls.restore.mock.calls[0][0]).toMatchObject({ version: { id: "v1" }, currentTreatmentJson: SAVED });
    });

    it("with no versions yet, says what will be kept from now on", () => {
      state.treatmentJson = SAVED;
      render(<TreatmentPage projectId="p1" />);
      fireEvent.click(screen.getByTestId("treatment-view-versions"));
      expect(screen.getByTestId("treatment-versions-empty").textContent).toMatch(/what was there is kept here/);
    });
  });
});
