/**
 * The Treatment page: ONE treatment, AI-written or hand-written, editable and deletable — and nothing else on the
 * page that directs the video (Fendi, 2026-10-03).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TreatmentPage from "./TreatmentPage";
import { fingerprint } from "@/lib/treatment/treatmentDoc";

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
  write: vi.fn(async (..._args: unknown[]) => ({ written: 2, kept: 1, draft: { coverage: null }, variationId: "v1", candidateVariationId: null, editsLeftBehind: 0 })),
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
vi.mock("@/lib/queries/variations", () => ({
  useActiveVariation: () => ({ id: "v1", name: "Original", archived: false }),
  useVariations: () => ({ data: [{ id: "v1", name: "Original", archived: false }], isLoading: false }),
  variationsKeys: { forProject: (id: string) => ["video_variations", "project", id] },
}));
vi.mock("@/lib/queries/treatmentVersions", () => ({
  treatmentVersionsKeys: { forProject: (id: string) => ["tv", id] },
  useTreatmentVersions: () => ({ data: state.versions, isLoading: false, isError: false, error: null }),
  useRestoreTreatmentVersion: () => ({ mutateAsync: calls.restore }),
}));
vi.mock("@/lib/queries/continuity", () => ({ useContinuityEntities: () => ({ data: state.entities }) }));
vi.mock("@/lib/queries/treatmentInputs", () => ({
  useTreatmentInputs: () => ({
    project: { id: "p1", active_variation_id: "v1", treatment_json: state.treatmentJson, lyrics: state.lyrics, mood: "opulent", visual_style: "luxury runway", notes: "" },
    projectQuery: { isLoading: false },
    analysis: { bpm: 122, duration_seconds: 200 },
    lyricLines: state.lyricLines,
    looks: [],
    treatmentContext: () => ({ projectId: "p1", projectType: "music_video" }),
  }),
}));
vi.mock("@/lib/queries/storyboard", () => ({
  storyboardKeys: { boxes: (id: string) => ["b", id], assignments: (id: string) => ["a", id] },
  applyAssignmentOps: vi.fn(async () => undefined),
  writeBoxes: vi.fn(async () => ({ updated: 0, inserted: [] })),
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
    await waitFor(() => expect(calls.deleteTreatment).toHaveBeenCalledWith("p1", SAVED, "v1"));
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

  it("a board that exists can be written again as a CANDIDATE: a new variation, this board untouched — and the board's coverage of the treatment is shown with its gaps", async () => {
    const now = fingerprint("A new idea.");
    const coverage = {
      ok: false,
      beats: [
        { id: "b01", title: "The burning show", shots: ["c001", "c002"], people: [{ key: "THE_RIDER", castIn: [] }], emptied: ["c002"], ties: [] },
        { id: "b02", title: "The viewer", shots: ["c003"], people: [{ key: "FENDI", castIn: ["c003"] }], emptied: [], ties: [{ kind: "screen_shows", to: "b01", fromShot: "c003", toShot: "c002", present: false }] },
        { id: "b03", title: "The control room", shots: [], people: [], emptied: [], ties: [] },
      ],
      uncoveredBeats: ["b03"],
      missingPeople: [{ beat: "b01", key: "THE_RIDER" }],
      missingLinks: [{ beat: "b02", kind: "screen_shows", to: "b01" }],
      anchors: [],
      unanchored: [],
    };
    state.treatmentJson = { ...SAVED, treatment: { text: "A new idea.", mode: "manual", updated_at: "t", notes: "", storyboard: { from: now, at: "2026-10-07", written: 3, kept: 0, coverage, run: { id: "run1", model: "grok-4-fast", actualCostUsd: null, estimatedCostUsd: 0.04 } } } };
    const from = (stamp: string) => ({ provenance: { treatment: stamp, createdAt: "2026-10-07T00:00:00Z" } });
    state.boxes = [
      { id: "r1", key: "c001", locked: false, override: null, generated: from(now) },
      { id: "r2", key: "c002", locked: false, override: null, generated: from(now) },
      { id: "r3", key: "c003", locked: false, override: { direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null, manual: ["continuity"] }, generated: from(now) },
    ];
    render(<TreatmentPage projectId="p1" />);
    // the coverage is open because it has gaps, and says each one in words, by shot number
    const cov = screen.getByTestId("treatment-coverage");
    expect(cov.getAttribute("data-ok")).toBe("false");
    expect(cov.textContent).toContain("2 of 3 beats of the treatment have shots");
    const gaps = screen.getByTestId("treatment-coverage-gaps").textContent ?? "";
    expect(gaps).toContain("“The control room” got no shot");
    expect(gaps).toContain("“The burning show” puts THE_RIDER in it, and no shot of it casts them");
    expect(gaps).toContain("shot 2 came back with nobody in it");
    expect(gaps).toContain("“The viewer” is cut from “The burning show” (screen shows) and no shot carries that link");
    // the run's cost is said as unknown, with the estimate apart — never the estimate as the cost
    expect(screen.getByTestId("treatment-coverage-run").textContent).toContain("actual cost unknown");
    expect(screen.getByTestId("treatment-coverage-run").textContent).toContain("estimate was $0.04");

    // the candidate: confirmed first, named after this variation, this board kept as it is
    fireEvent.click(screen.getByTestId("treatment-write-candidate"));
    expect(screen.getByTestId("confirm-dialog").textContent).toMatch(/“Original · candidate 1”/);
    expect(screen.getByTestId("confirm-dialog").textContent).toMatch(/this board stays exactly as it is/);
    fireEvent.click(screen.getByTestId("confirm-write-candidate"));
    await waitFor(() => expect(calls.write).toHaveBeenCalledTimes(1));
    expect(calls.write.mock.calls[0][0]).toMatchObject({ aiWritesText: false, treatmentText: "A new idea.", candidate: { name: "Original · candidate 1" } });
  });

  it("an edited treatment is behind its shots until they are rewritten — and only the shots that are not the director's", () => {
    const blank = { direction: null, cameraMotion: null, framing: null, transitionIn: null, requiredElements: null, notes: null };
    state.treatmentJson = { ...SAVED, treatment: { text: "A new idea.", mode: "manual", updated_at: "t", notes: "", storyboard: { from: "0:x", at: "2026-10-01", written: 3, kept: 0 } } };
    // every shot says which treatment it was written from: these three, an earlier one
    const from = (stamp: string) => ({ provenance: { treatment: stamp, createdAt: "2026-10-01T00:00:00Z" } });
    state.boxes = [
      { id: "r1", key: "c001", locked: false, override: null, generated: from("9:old") },
      { id: "r2", key: "c002", locked: true, override: { ...blank, direction: "mine", treatment: "9:old" }, generated: from("9:old") },
      { id: "r3", key: "c003", locked: false, override: null, generated: from("9:old") },
    ];
    state.assignments = [{ shotId: "r3" }];
    const { unmount } = render(<TreatmentPage projectId="p1" />);
    expect(screen.getByTestId("treatment-storyboard-status").textContent).toMatch(/All 3 were written from an earlier version of this treatment/);
    expect(screen.getByTestId("treatment-stale-kept").textContent).toMatch(/2 of yours are still from the earlier treatment/);
    expect(screen.getByTestId("treatment-write-shots").textContent).toContain("Rewrite the 1 shot that is not yours");
    fireEvent.click(screen.getByTestId("treatment-write-shots"));
    expect(screen.getByTestId("confirm-dialog").textContent).toMatch(/1 of the 3 shots are rewritten\. 2 are yours/);
    unmount();

    // AFTER that rewrite the board is stamped as written from this treatment — and the two kept shots still are not.
    // The page used to say "Written from this treatment" here.
    const now = fingerprint("A new idea.");
    state.treatmentJson = { ...SAVED, treatment: { text: "A new idea.", mode: "manual", updated_at: "t", notes: "", storyboard: { from: now, at: "2026-10-07", written: 1, kept: 2 } } };
    state.boxes = [
      { id: "r1", key: "c001", locked: false, override: null, generated: from(now) },
      { id: "r2", key: "c002", locked: true, override: { ...blank, direction: "mine", treatment: "9:old" }, generated: from("9:old") },
      { id: "r3", key: "c003", locked: false, override: null, generated: from("9:old") },
    ];
    render(<TreatmentPage projectId="p1" />);
    const status = screen.getByTestId("treatment-storyboard-status").textContent ?? "";
    expect(status).toMatch(/2 of them were written from an earlier version of this treatment/);
    expect(status).not.toMatch(/Written from this treatment/);
    expect(screen.getByTestId("treatment-stale-kept").textContent).toMatch(/2 of yours are still from the earlier treatment/);
    // nothing left that this button could rewrite
    expect(screen.queryByTestId("treatment-write-shots")).toBeNull();
    // the one deliberate way through: hand those shots back to the treatment
    expect(screen.getByTestId("treatment-release-kept").textContent).toContain("Release those 2 shots to be rewritten");
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
