/**
 * A shot's timed beats as the director sees and edits them: the strip on the card and in the full-screen view, the
 * editor, what generating will do with the beats said before anything is spent, and the two-choice confirmation.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import { parseShotSpec, type ShotEvent } from "@/lib/treatment/shotSpec";
import { boxFromRow, boxWrite, type BoxRow, type StoryboardBox } from "@/lib/storyboard/boxes";
import { resolveEvents, type EventClock } from "@/lib/storyboard/events";
import { temporalPlan } from "@/lib/storyboard/temporal";
import { BeatsEditor, BeatStrip } from "./TimedBeats";
import { ConfirmHost } from "./ConfirmHost";
import { StoryboardProvider, type StoryboardController } from "./useStoryboardController";

const AT = "2026-10-03T12:00:00.000Z";
const ev = (over: Partial<ShotEvent> & { at: number }): ShotEvent => ({ id: "", trigger: { kind: "time", ref: "" }, visual: "", camera: "", lighting: "", action: "", lightingState: null, effect: null, ...over });
const EVENTS: ShotEvent[] = [
  ev({ id: "e1", at: 1.2, trigger: { kind: "lyric", ref: "lights out" }, lighting: "the house lights die", effect: { type: "blackout", seconds: null, level: null } }),
  ev({ id: "e2", at: 2.4, lighting: "the stones he wears are the only light", camera: "a slow push toward him begins" }),
];
const LINES: LyricLine[] = [
  {
    lineIndex: 7,
    section: "hook",
    text: "then it goes lights out again",
    start: 60.2,
    end: 63.1,
    confidence: 1,
    words: [
      { w: "then", start: 60.2, end: 60.4 },
      { w: "it", start: 60.4, end: 60.6 },
      { w: "goes", start: 60.6, end: 61.0 },
      { w: "lights", start: 61.31, end: 61.6 },
      { w: "out", start: 61.6, end: 62.0 },
      { w: "again", start: 62.5, end: 63.1 },
    ],
  },
];
const CLOCK: EventClock = { lyricLines: LINES, beats: [60, 60.5, 61, 61.5, 62, 62.5, 63, 63.5] };

function box(events: ShotEvent[]): StoryboardBox {
  const spec = parseShotSpec({ id: "c018", purpose: "a runway under full house lights", shotType: "b_roll", kind: "broll", timeline: { start: 60, end: 64 }, events });
  const w = boxWrite({ key: "c018", start: 60, end: 64, section: "hook", generated: spec, override: null, locked: false, origin: "treatment", history: [] });
  return boxFromRow({ id: "r18", project_id: "p1", shot_number: 18, ...w, updated_at: AT } as BoxRow)!;
}

function controller(over: Partial<StoryboardController> = {}): StoryboardController {
  return {
    eventsOf: (b: StoryboardBox) => resolveEvents(b.spec.events, { start: b.start, end: b.end }, CLOCK),
    clock: CLOCK,
    busyOf: () => null,
    entities: [],
    saveEvents: vi.fn(async () => undefined),
    splitAtBeats: vi.fn(async () => undefined),
    clipPlanOf: (b: StoryboardBox) => temporalPlan({ route: "still_kling", resolved: resolveEvents(b.spec.events, { start: b.start, end: b.end }, CLOCK), shotSeconds: b.end - b.start }),
    ...over,
  } as unknown as StoryboardController;
}

const show = (ui: React.ReactNode, sb = controller()) => ({ sb, ...render(<StoryboardProvider value={sb}>{ui}</StoryboardProvider>) });

describe("the timed beats of a shot, at a glance", () => {
  it("shows nothing on a shot that does not change", () => {
    show(<BeatStrip box={box([])} />);
    expect(screen.queryByTestId("beats-strip")).toBeNull();
  });

  it("is one line per beat: when, what it hangs on, what changes — not a paragraph", () => {
    show(<BeatStrip box={box(EVENTS)} />);
    expect(screen.getByTestId("beats-strip").getAttribute("data-beats")).toBe("2");
    const lines = screen.getAllByTestId("beats-line");
    expect(lines).toHaveLength(2);
    // the first beat sits where the words are sung, not at the number that was typed
    expect(lines[0].getAttribute("data-offset")).toBe("1.31");
    expect(lines[0].getAttribute("data-placed-by")).toBe("lyric");
    expect(lines[0].textContent).toContain("0:01.3");
    expect(within(lines[0]).getByTestId("beats-trigger").textContent).toContain('on "lights out"');
    expect(lines[0].textContent).toContain("the house lights die");
    expect(lines[0].querySelector('[data-beat-kind="effect"]')?.textContent).toMatch(/blackout over 0\.3 s/);
    expect(lines[1].textContent).toContain("0:02.4");
    expect(lines[1].querySelector('[data-beat-kind="lighting"]')?.textContent).toContain("the stones he wears are the only light");
    expect(lines[1].querySelector('[data-beat-kind="camera"]')?.textContent).toContain("a slow push toward him begins");
    // and each has its mark along the shot
    expect(screen.getAllByTestId("beats-mark").map((m) => m.getAttribute("data-offset"))).toEqual(["1.31", "2.4"]);
  });

  it("says so when the words a beat hangs on are no longer sung in the shot", () => {
    show(<BeatStrip box={box([ev({ id: "e1", at: 1, trigger: { kind: "lyric", ref: "never sung" }, action: "he stops" })])} />);
    expect(screen.getByTestId("beats-line").getAttribute("data-placed-by")).toBe("fallback");
    expect(screen.getByTestId("beats-trigger").textContent).toContain("not sung in this shot");
  });
});

describe("editing a shot's timed beats", () => {
  it("opens on the shot's own beats and saves them as one list", async () => {
    const b = box(EVENTS);
    const { sb } = show(<BeatsEditor box={b} />);
    const rows = screen.getAllByTestId("beat-row");
    expect(rows).toHaveLength(2);
    expect((within(rows[0]).getByTestId("beat-lighting") as HTMLInputElement).value).toBe("the house lights die");
    expect((within(rows[0]).getByTestId("beat-trigger") as HTMLSelectElement).value).toBe("lyric:lights out");
    expect((within(rows[0]).getByTestId("beat-effect") as HTMLSelectElement).value).toBe("blackout");
    // nothing to save until something is changed
    expect((screen.getByTestId("beats-save") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(within(rows[1]).getByTestId("beat-action"), { target: { value: "he stops walking" } });
    fireEvent.click(screen.getByTestId("beats-save"));
    expect(sb.saveEvents).toHaveBeenCalledTimes(1);
    const [, saved] = (sb.saveEvents as ReturnType<typeof vi.fn>).mock.calls[0] as [StoryboardBox, ShotEvent[]];
    expect(saved.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(saved[1]).toMatchObject({ at: 2.4, action: "he stops walking", camera: "a slow push toward him begins" });
    // the lyric trigger is kept as a trigger, not flattened into a number
    expect(saved[0].trigger).toEqual({ kind: "lyric", ref: "lights out" });
  });

  it("adds a beat inside the shot, hangs it on words sung in the shot, and drops a beat that says nothing", () => {
    const { sb } = show(<BeatsEditor box={box([])} />);
    expect(screen.queryByTestId("beat-row")).toBeNull();
    fireEvent.click(screen.getByTestId("beats-add"));
    fireEvent.click(screen.getByTestId("beats-add"));
    const rows = screen.getAllByTestId("beat-row");
    expect(rows).toHaveLength(2);
    const trigger = within(rows[0]).getByTestId("beat-trigger") as HTMLSelectElement;
    const sung = [...trigger.options].find((o) => o.value.startsWith("lyric:lights out"))!;
    fireEvent.change(trigger, { target: { value: sung.value } });
    // hanging it on the words moves it to where they are sung
    expect((within(rows[0]).getByTestId("beat-at") as HTMLInputElement).value).toBe("1.31");
    fireEvent.change(within(rows[0]).getByTestId("beat-lighting"), { target: { value: "the lights die" } });
    fireEvent.click(screen.getByTestId("beats-save"));
    const [, saved] = (sb.saveEvents as ReturnType<typeof vi.fn>).mock.calls[0] as [StoryboardBox, ShotEvent[]];
    // the second row said nothing: it is not a beat
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ at: 1.31, lighting: "the lights die", trigger: { kind: "lyric" } });
  });

  it("removes a beat", () => {
    const { sb } = show(<BeatsEditor box={box(EVENTS)} />);
    fireEvent.click(within(screen.getAllByTestId("beat-row")[0]).getByTestId("beat-remove"));
    fireEvent.click(screen.getByTestId("beats-save"));
    const [, saved] = (sb.saveEvents as ReturnType<typeof vi.fn>).mock.calls[0] as [StoryboardBox, ShotEvent[]];
    expect(saved.map((e) => e.id)).toEqual(["e2"]);
  });

  it("says what generating will do with the beats before anything is spent, and offers the split", () => {
    const b = box(EVENTS);
    const { sb } = show(<BeatsEditor box={b} />);
    const plan = screen.getByTestId("beats-plan");
    expect(plan.getAttribute("data-plan")).toBe("refused");
    expect(plan.textContent).toContain("is not generated as if it were one state");
    expect(plan.textContent).toContain("Split the shot at its beats");
    fireEvent.click(screen.getByTestId("beats-split"));
    expect(sb.splitAtBeats).toHaveBeenCalledWith(b);
  });

  it("says nothing about generating on a shot whose only beat is an effect — the edit makes it", () => {
    show(<BeatsEditor box={box([ev({ id: "e1", at: 1, effect: { type: "flash", seconds: null, level: null } })])} />);
    expect(screen.queryByTestId("beats-plan")).toBeNull();
  });
});

describe("a confirmation with two ways forward", () => {
  it("runs the one that was pressed and only that one", async () => {
    const split = vi.fn();
    const ordered = vi.fn();
    const close = vi.fn();
    render(
      <ConfirmHost
        onClose={close}
        request={{ title: "Shot 18 changes while it plays", body: "…", confirmLabel: "Split at the beats", testId: "confirm-split-beats", onConfirm: split, secondary: { label: "Generate in order · $0.35", testId: "confirm-generate-ordered", onConfirm: ordered } }}
      />,
    );
    fireEvent.click(screen.getByTestId("confirm-generate-ordered"));
    await Promise.resolve();
    await Promise.resolve();
    expect(ordered).toHaveBeenCalledTimes(1);
    expect(split).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("has no second button unless one was asked for", () => {
    render(<ConfirmHost onClose={() => undefined} request={{ title: "t", body: "b", confirmLabel: "Go", testId: "confirm-go", onConfirm: () => undefined }} />);
    expect(screen.queryByTestId("confirm-generate-ordered")).toBeNull();
    expect(screen.getByTestId("confirm-go")).toBeTruthy();
  });
});
