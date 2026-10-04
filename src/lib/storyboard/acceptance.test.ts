/**
 * Whether a clip does what it was asked to. The checks here are real ones: measured from made clips by the same
 * code the app runs, and — for the retest — from the light of the real clip.
 */
import { describe, expect, it } from "vitest";
import { acceptanceLine, acceptanceOf, cutAcceptance, cutAcceptanceLine, LIP_MEASURE_VALIDATED, parseAcceptance, reviewedByAsset, withJudgement, type AcceptanceRecord, type ClipAsk, type Requirement, type ReviewedFinding } from "./acceptance";
import type { MediaAsset, TimelineSegment } from "./media";
import { measureBeats, type AskedChange, type BeatCheck } from "./beatCheck";
import { framesOf, RETEST_C035 } from "./__fixtures__/realCurves";
import type { TakeCheck } from "./takeCheck";

const AT = "2026-10-04T05:00:00Z";
const BEAT: AskedChange = { id: "e1", offset: 1.9, kinds: ["lighting"], says: "light: the mirror ball comes alive" };
const RESTAGED: ClipAsk = { asked: [BEAT], fromTake: true };
const change = (begins: number) => ({ begins, half: begins, arrived: begins, size: 0.1, strength: 9, kind: "light" as const, lumaBefore: 0.3, lumaAfter: 0.1 });
const beats = (verdict: "on_time" | "displaced" | "not_seen", error: number | null, over: Partial<BeatCheck> = {}): BeatCheck => ({
  version: 4,
  measuredAt: AT,
  frames: 96,
  fps: 24,
  clipSeconds: 4,
  noise: 0.01,
  beats: [{ ...BEAT, verdict, change: error == null ? null : change(1.9 + error), error }],
  unasked: [],
  verdict: verdict === "on_time" ? "kept" : verdict === "displaced" ? "displaced" : "not_kept",
  series: [],
  ...over,
});
const take = (lip: TakeCheck["lip"]["verdict"], framing: TakeCheck["framing"]["verdict"], ratio = 1.02): TakeCheck =>
  ({
    version: 2,
    measuredAt: AT,
    frames: 96,
    faceFrames: 90,
    faceFrom: 0.04,
    faceTo: 3.9,
    takeFrames: 94,
    takeFaceFrames: 94,
    lip: { verdict: lip, best: { corr: 0.81, offset: 0.02, retime: 1 }, onClock: 0.8, worstLag: 0.02, compared: 3.4 },
    framing: { verdict: framing, takeReach: 11.7, widestReach: 11.7 * ratio, openingReach: 11.7 * ratio, widestAt: 0.2, ratio, openingSeen: true },
    series: { take: [], clip: [] },
  }) as unknown as TakeCheck;
const finding = (a: ReturnType<typeof acceptanceOf>, r: string) => a.lines.find((l) => l.requirement === r);
/** Every one of these judged, by eye, as met. */
const judgedMet = (requirements: readonly Requirement[], from: AcceptanceRecord | null = null) => requirements.reduce<AcceptanceRecord | null>((r, q) => withJudgement(r, q, "meets", "", AT), from)!;

describe("a clip held against what it was asked for", () => {
  it("a restaged clip with a timed script is asked seven things; a clip asked for as one state from a still, four", () => {
    expect(acceptanceOf({ ask: RESTAGED, beatCheck: null, takeCheck: null, record: null }).lines.map((l) => l.requirement)).toEqual(["timing", "framing", "lips", "lighting", "camera", "integrity", "action"]);
    // every generated clip is asked for its light, its camera, whole bodies and objects, and the action it was asked for
    expect(acceptanceOf({ ask: { asked: [], fromTake: false }, beatCheck: null, takeCheck: null, record: null }).lines.map((l) => [l.requirement, l.label])).toEqual([
      ["lighting", "Lighting"],
      ["camera", "Camera and movement"],
      ["integrity", "Bodies and objects"],
      ["action", "Action"],
    ]);
    // a state the clip opens in is not a timed beat
    expect(acceptanceOf({ ask: { asked: [{ ...BEAT, offset: 0 }], fromTake: false }, beatCheck: null, takeCheck: null, record: null }).lines.map((l) => l.requirement)).toEqual(["lighting", "camera", "integrity", "action"]);
  });

  it("nothing measured and nothing looked at is not a pass: it is not yet verified", () => {
    const a = acceptanceOf({ ask: RESTAGED, beatCheck: null, takeCheck: null, record: null });
    expect(a.verdict).toBe("unverified");
    expect(a.lines.every((l) => l.finding === "unverified" && l.source === "none")).toBe(true);
    expect(acceptanceLine(a)).toBe("not verified: timing, framing, lip sync, lighting, camera and movement, bodies and objects, action");
  });

  it("a change a second early fails timing; a frame wider than the take fails framing — each as measured", () => {
    const a = acceptanceOf({ ask: RESTAGED, beatCheck: beats("displaced", -0.94), takeCheck: take("unclear", "wider", 2.54), record: null });
    expect(a.verdict).toBe("fails");
    // the number is of A change of light; it is not said to be the change that was asked for — and it fails either way
    expect(finding(a, "timing")).toMatchObject({ finding: "fails", source: "measured", says: "1 of 1: the only change of light near it began −0.94 s from where it was asked — whatever that change is, nothing changed when it was asked to" });
    expect(finding(a, "framing")).toMatchObject({ finding: "fails", source: "measured" });
    expect(finding(a, "framing")!.says).toContain("2.54× as far");
    expect(acceptanceLine(a)).toBe("fails timing, framing · not verified: lip sync, lighting, camera and movement, bodies and objects, action");
  });

  it("a change that was never seen fails timing", () => {
    expect(finding(acceptanceOf({ ask: RESTAGED, beatCheck: beats("not_seen", null), takeCheck: null, record: null }), "timing")).toMatchObject({ finding: "fails", says: "1 of 1: no change of light near it at all — whatever that change is, nothing changed when it was asked to" });
  });

  it("a timing the check could not determine is neither a pass nor a failure — and no number is carried", () => {
    const check = measureBeats(framesOf(RETEST_C035), [BEAT], AT);
    const a = acceptanceOf({ ask: RESTAGED, beatCheck: check, takeCheck: null, record: null });
    const timing = finding(a, "timing")!;
    expect(timing).toMatchObject({ finding: "undetermined", source: "measured" });
    expect(timing.says).not.toMatch(/\d\.\d\d s/);
    expect(a.verdict).toBe("unverified");
  });

  it("a change of light on time is a detected change, not the asked event: timing is met only when someone has looked and said it is", () => {
    const onTime = { ask: RESTAGED, beatCheck: beats("on_time", 0.05), takeCheck: take("in_sync", "kept") };
    const a = acceptanceOf({ ...onTime, record: null });
    const timing = finding(a, "timing")!;
    expect(timing).toMatchObject({ finding: "undetermined", source: "measured" });
    expect(timing.says).toBe("a change of light begins within a quarter of a second of each of the 1 it was asked for — whether it is the change that was asked for is not something the light can say: look at the frames beside the beat");
    // someone looks: it is the mirror ball → met, by eye, with the detection beside it
    const seen = finding(acceptanceOf({ ...onTime, record: withJudgement(null, "timing", "meets", "the mirror ball comes alive there", AT) }), "timing")!;
    expect(seen).toMatchObject({ finding: "meets", source: "by_eye" });
    expect(seen.measured).toMatchObject({ finding: "undetermined" });
    // someone looks: it is something else → the change asked for did not happen
    expect(finding(acceptanceOf({ ...onTime, record: withJudgement(null, "timing", "fails", "that is a door opening, not the ball", AT) }), "timing")!.finding).toBe("fails");
  });

  it("everything measured meeting still leaves what only eyes and ears can settle open", () => {
    const a = acceptanceOf({ ask: RESTAGED, beatCheck: beats("on_time", 0.05), takeCheck: take("in_sync", "kept"), record: null });
    expect(finding(a, "framing")!.finding).toBe("meets");
    expect(a.verdict).toBe("unverified");
    // timing (the change is not identified), lip sync, lighting, camera, bodies and objects, action
    expect(a.open).toBe(6);
  });

  it("an empty shoe is not a lighting or a camera fault: bodies and objects, and the action, have lines of their own", () => {
    const cutaway: ClipAsk = { asked: [], fromTake: false };
    const open = acceptanceOf({ ask: cutaway, beatCheck: null, takeCheck: null, record: null });
    expect(finding(open, "integrity")).toMatchObject({ finding: "unverified", source: "none" });
    expect(finding(open, "integrity")!.says).toContain("a shoe with no leg in it");
    const judged = acceptanceOf({ ask: cutaway, beatCheck: null, takeCheck: null, record: withJudgement(withJudgement(null, "integrity", "fails", "the stepping sneaker has no leg in it until the last frames", AT), "action", "fails", "no weight-bearing step", AT) });
    expect(judged.verdict).toBe("fails");
    expect(acceptanceLine(judged)).toBe("fails bodies and objects, action · not verified: lighting, camera and movement");
  });

  it("a second opinion's major finding counts against the clip until someone looks — and is neither a measurement nor a judgement", () => {
    const reviewed: ReviewedFinding[] = [
      { severity: "major", area: "realism", finding: "The moving sneaker appears empty and disconnected from a leg.", at: "2026-10-03T21:28:49.082Z" },
      { severity: "minor", area: "rhythm", finding: "The cut lands a frame late.", at: "2026-10-03T21:28:49.082Z" },
    ];
    const cutaway: ClipAsk = { asked: [], fromTake: false };
    const a = acceptanceOf({ ask: cutaway, beatCheck: null, takeCheck: null, record: null, reviewed });
    const line = finding(a, "review")!;
    expect(line).toMatchObject({ label: "Second opinion", finding: "fails", source: "reviewed", says: "major (realism, 2026-10-03): The moving sneaker appears empty and disconnected from a leg." });
    expect(a.verdict).toBe("fails");
    // overruled by someone who looked: the review is still shown as what the review said
    const over = finding(acceptanceOf({ ask: cutaway, beatCheck: null, takeCheck: null, record: withJudgement(null, "review", "meets", "the leg is there; the frame it saw was mid-blur", AT), reviewed }), "review")!;
    expect(over).toMatchObject({ finding: "meets", source: "by_eye" });
    expect(over.measured).toMatchObject({ finding: "fails" });
    // nothing major said: no line at all
    expect(finding(acceptanceOf({ ask: cutaway, beatCheck: null, takeCheck: null, record: null, reviewed: [reviewed[1]] }), "review")).toBeUndefined();
    expect(finding(acceptanceOf({ ask: cutaway, beatCheck: null, takeCheck: null, record: null }), "review")).toBeUndefined();
  });

  it("the lip check's reading is reported as a reading and settles nothing, whichever way it reads", () => {
    expect(LIP_MEASURE_VALIDATED).toBe(false);
    for (const reading of ["in_sync", "off"] as const) {
      const lips = finding(acceptanceOf({ ask: RESTAGED, beatCheck: null, takeCheck: take(reading, "kept"), record: null }), "lips")!;
      expect(lips.finding).toBe("unverified");
      expect(lips.source).toBe("none");
      expect(lips.says).toContain(reading === "in_sync" ? "the lip check reads in sync" : "the lip check reads off");
      expect(lips.says).toContain("has not been held against footage whose answer is known");
      expect(lips.says).toContain("watch the clip with the song");
    }
    const unclear = finding(acceptanceOf({ ask: RESTAGED, beatCheck: null, takeCheck: take("unclear", "kept"), record: null }), "lips")!;
    expect(unclear).toMatchObject({ finding: "undetermined", source: "measured" });
  });

  it("a change of light or a jump nobody asked for is a measured failure; a camera's drift is not", () => {
    const stray = acceptanceOf({ ask: { asked: [], fromTake: false }, beatCheck: beats("on_time", 0, { beats: [], unasked: [change(2.1), { ...change(3), kind: "picture" }] }), takeCheck: null, record: null });
    expect(finding(stray, "lighting")).toMatchObject({ finding: "fails", source: "measured", says: "the light changes at 2.10 s where nothing asked it to" });
    expect(finding(stray, "camera")).toMatchObject({ finding: "fails", source: "measured", says: "the picture jumps at 3.00 s where nothing asked it to" });
    const drift = acceptanceOf({ ask: { asked: [], fromTake: false }, beatCheck: beats("on_time", 0, { beats: [], unasked: [{ ...change(0.7), arrived: 2.0 }] }), takeCheck: null, record: null });
    expect(finding(drift, "lighting")).toMatchObject({ finding: "unverified", source: "none" });
  });
});

describe("what a person decided by looking", () => {
  it("settles the requirement, is marked as seen not measured, and leaves the measurement as it was", () => {
    const record = withJudgement(null, "lighting", "fails", " opens dark for half a second; the room does not go dark after the beat ", AT);
    const a = acceptanceOf({ ask: RESTAGED, beatCheck: measureBeats(framesOf(RETEST_C035), [BEAT], AT), takeCheck: take("unclear", "wider", 1.18), record });
    expect(finding(a, "lighting")).toMatchObject({ finding: "fails", source: "by_eye", says: "opens dark for half a second; the room does not go dark after the beat", measured: null });
    expect(a.verdict).toBe("fails");
    // judging the timing by eye does not turn the measurement into a number: it stays "could not tell", beside the judgement
    const both = acceptanceOf({ ask: RESTAGED, beatCheck: measureBeats(framesOf(RETEST_C035), [BEAT], AT), takeCheck: null, record: withJudgement(record, "timing", "fails", "the ball comes alive at 0.96 s, asked at 1.90 s", AT) });
    const timing = finding(both, "timing")!;
    expect(timing).toMatchObject({ finding: "fails", source: "by_eye" });
    expect(timing.measured).toMatchObject({ finding: "undetermined" });
    // a person can overrule a measurement; it is still shown as measured
    const over = acceptanceOf({ ask: RESTAGED, beatCheck: null, takeCheck: take("unclear", "wider", 1.18), record: withJudgement(null, "framing", "meets", "close enough to the take", AT) });
    expect(finding(over, "framing")).toMatchObject({ finding: "meets", source: "by_eye" });
    expect(finding(over, "framing")!.measured).toMatchObject({ finding: "fails" });
  });

  it("every requirement met — measured or seen — is a clip that does what it was asked", () => {
    const record = judgedMet(["timing", "lighting", "camera", "integrity", "action"], withJudgement(null, "lips", "meets", "watched with the song", AT));
    const a = acceptanceOf({ ask: RESTAGED, beatCheck: beats("on_time", 0.05), takeCheck: take("in_sync", "kept"), record });
    expect(a.verdict).toBe("meets");
    expect(acceptanceLine(a)).toBe("meets all 7 it was asked for");
    expect(finding(a, "lighting")!.says).toBe("looked at, and it does");
    // taken back, it is open again
    expect(acceptanceOf({ ask: RESTAGED, beatCheck: beats("on_time", 0.05), takeCheck: take("in_sync", "kept"), record: withJudgement(record, "lips", null, "", AT) }).verdict).toBe("unverified");
  });

  it("is kept as a record and read back; anything else is no record", () => {
    const record = withJudgement(null, "camera", "fails", "no push", AT);
    expect(parseAcceptance(JSON.parse(JSON.stringify(record)))).toEqual(record);
    expect(parseAcceptance(null)).toBeNull();
    expect(parseAcceptance({ version: 2, judged: {} })).toBeNull();
    expect(parseAcceptance({ version: 1, judged: { camera: { finding: "maybe", at: AT }, mood: { finding: "meets", at: AT } } })).toEqual({ version: 1, judged: {} });
    // the newer lines are kept like the first five
    const more = withJudgement(withJudgement(null, "integrity", "fails", "empty shoe", AT), "review", "meets", "", AT);
    expect(parseAcceptance(JSON.parse(JSON.stringify(more)))).toEqual(more);
  });
});

describe("a cut held against what its clips were asked for", () => {
  const seg = (index: number, assetId: string | null): TimelineSegment =>
    ({ index, key: `c0${index}`, shotId: `s${index}`, start: index * 4, end: index * 4 + 4, scene: "", media: assetId ? { kind: "video", role: "performance", assetId, base: false } : { kind: "none" } }) as unknown as TimelineSegment;
  const clipAsset = (id: string, over: Partial<MediaAsset> = {}): MediaAsset => ({ id, name: `${id}.mp4`, isVideo: true, ...over }) as MediaAsset;
  const allMet = judgedMet(["timing", "lips", "lighting", "camera", "integrity", "action"]);
  const assets = new Map<string, MediaAsset>([
    ["take", clipAsset("take")],
    ["good", clipAsset("good", { beatCheck: beats("on_time", 0.05), takeCheck: take("in_sync", "kept"), acceptance: allMet })],
    ["wide", clipAsset("wide", { beatCheck: beats("on_time", 0.05), takeCheck: take("in_sync", "wider", 2.5) })],
    ["new", clipAsset("new")],
  ]);
  const asks = new Map<string, ClipAsk>([
    ["good", RESTAGED],
    ["wide", RESTAGED],
    ["new", RESTAGED],
  ]);

  it("counts only clips something was asked of: a take as filmed and an empty shot are not in it", () => {
    const cut = cutAcceptance([seg(1, "take"), seg(2, "good"), seg(3, null), seg(4, "wide"), seg(5, "new")], assets, asks);
    expect(cut.clips.map((c) => [c.index, c.name, c.acceptance.verdict])).toEqual([
      [2, "good.mp4", "meets"],
      [4, "wide.mp4", "fails"],
      [5, "new.mp4", "unverified"],
    ]);
    expect(cut).toMatchObject({ meets: 1, fails: 1, open: 1, verdict: "fails" });
    expect(cutAcceptanceLine(cut)).toBe("3 generated clips: 1 fails what was asked, 1 not yet verified, 1 does what was asked");
  });

  it("a cut whose clips all play is not accepted while one of them has not been verified", () => {
    expect(cutAcceptance([seg(2, "good"), seg(5, "new")], assets, asks).verdict).toBe("unverified");
    expect(cutAcceptance([seg(2, "good")], assets, asks).verdict).toBe("meets");
    const none = cutAcceptance([seg(1, "take")], assets, asks);
    expect(none.verdict).toBe("none");
    expect(cutAcceptanceLine(none)).toBe("no generated clip in this cut");
  });
});

describe("which clip a second opinion's finding is about", () => {
  const REVIEW_AT = "2026-10-03T21:28:49.082Z";
  const clipAsset = (id: string, createdAt: string) => ({ id, createdAt });
  const assets = new Map([
    ["first", clipAsset("first", "2026-10-03T20:43:04.026787+00:00")],
    ["retest", clipAsset("retest", "2026-10-04T01:59:05.150608+00:00")],
    ["sneaker", clipAsset("sneaker", "2026-10-03T19:34:03.824277+00:00")],
    ["still", clipAsset("still", "2026-10-03T19:30:06.074883+00:00")],
    ["a", clipAsset("a", "2026-10-03T10:00:00+00:00")],
    ["b", clipAsset("b", "2026-10-03T11:00:00+00:00")],
  ]);
  const asks = new Map<string, ClipAsk>(["first", "retest", "sneaker", "a", "b"].map((id) => [id, RESTAGED]));
  const assignments = [
    { shotId: "s39", assetId: "first" },
    { shotId: "s39", assetId: "retest" },
    { shotId: "s40", assetId: "sneaker" },
    { shotId: "s40", assetId: "still" },
    { shotId: "s41", assetId: "a" },
    { shotId: "s41", assetId: "b" },
  ];
  const f = (shotId: string | null, finding: string, assetId?: string) => ({ shotId, assetId, severity: "major" as const, area: "realism", finding });

  it("is the clip the shot was showing when the review looked — never one made after it", () => {
    const by = reviewedByAsset({ at: REVIEW_AT, findings: [f("s39", "full length, not thighs-up"), f("s40", "empty sneaker")] }, assignments, assets, asks);
    // shot 39: the retest was made hours after the review; the finding is the first clip's
    expect([...by.keys()].sort()).toEqual(["first", "sneaker"]);
    expect(by.get("first")![0]).toMatchObject({ finding: "full length, not thighs-up", at: REVIEW_AT, severity: "major" });
    expect(by.has("retest")).toBe(false);
    // shot 40: the still on the shot is not a generated clip and is not a candidate
    expect(by.get("sneaker")).toHaveLength(1);
  });

  it("is not guessed when two clips were on the shot at the time — unless the review recorded which it saw", () => {
    expect(reviewedByAsset({ at: REVIEW_AT, findings: [f("s41", "x")] }, assignments, assets, asks).size).toBe(0);
    const by = reviewedByAsset({ at: REVIEW_AT, findings: [f("s41", "x", "b")] }, assignments, assets, asks);
    expect([...by.keys()]).toEqual(["b"]);
    // a finding tied to no shot, and no review at all, are tied to nothing
    expect(reviewedByAsset({ at: REVIEW_AT, findings: [f(null, "x")] }, assignments, assets, asks).size).toBe(0);
    expect(reviewedByAsset(null, assignments, assets, asks).size).toBe(0);
  });
});
