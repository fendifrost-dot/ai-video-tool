import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LOOK_PRESETS } from "@/lib/shotCompiler";
import { stillFailure } from "./requests";
import {
  BatchShotSchema,
  PROMPT_CAPS,
  PROVIDER_RATES,
  PROVIDER_REFUSALS,
  batchJobsByRun,
  buildMotionRequest,
  estimateBatchUsd,
  estimateShotUsd,
  missingInput,
  motionPrompt,
  parseShotsJson,
  planRun,
  resultUrlOf,
  runPlan,
  seedancePriceBasis,
  seedanceUsd,
  unchargedSeedanceSizes,
  shotState,
  spentEstimateUsd,
  usd,
  statusFromEnvelope,
  stillPrompt,
  submitShot,
  submitStills,
  PANEL_SEAM_FRAC_MIN,
  PANEL_SEAM_STRAIGHT_MIN,
  describeSeam,
  isStackedPanels,
  panelSeam,
  type BatchJobRow,
  type BatchShot,
  type RunnerDeps,
} from "./index";

const root = (p: string) => resolve(process.cwd(), p);
const LOOK = LOOK_PRESETS.film_bar_v1;
const CTX = { projectId: "proj", runId: "r1", lookPresetId: "film_bar_v1", look: LOOK };

const shot = (over: Partial<BatchShot> & Pick<BatchShot, "id" | "route">): BatchShot => BatchShotSchema.parse(over);
const ANGLE = shot({
  id: "S06c_low_hero", kind: "angle", route: "seedance_ref", source_path: "u/p/seedance/S06c_src.mp4", source_trim: [0, 4],
  source_window: [66.885, 68.853], masterStart: 63.9987, angle: "a low hero angle from knee height looking up, 28mm, fast push-in",
  keep: ["clear-lens glasses, not tinted", "navy cap"],
});
const WORLD = shot({ id: "H1_tailor", route: "still_kling", prompt: "a Paris atelier, one tailor at his bench", motion: "slow push-in, dust in the window light", seconds: 5 });

function job(over: Partial<BatchJobRow> & { shotId: string; run?: string; stillPath?: string | null; estimateUsd?: number; stillCostUsd?: number }): BatchJobRow {
  return {
    id: over.id ?? `row-${over.shotId}-${over.created_at ?? "0"}`,
    provider: "higgsfield",
    status: over.status ?? "queued",
    external_job_id: over.external_job_id ?? null,
    error_text: over.error_text ?? null,
    result_asset_id: null,
    created_at: over.created_at ?? "2026-10-02T18:00:00Z",
    request_payload_json: { settings: { batchRun: over.run ?? "r1", batchShotId: over.shotId, route: "seedance_ref", kind: "angle", estimateUsd: over.estimateUsd ?? 3.698, lookPreset: "film_bar_v1", stillPath: over.stillPath ?? null, stillCostUsd: over.stillCostUsd } },
    response_payload_json: over.response_payload_json ?? null,
  };
}

function deps(over: Partial<RunnerDeps> = {}): RunnerDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    userId: "user-1",
    sign: vi.fn(async (bucket, path) => { calls.push(`sign:${bucket}`); return `https://signed/${bucket}/${path}`; }),
    generateStills: vi.fn(async () => { calls.push("stills"); return { ok: true, stills: [{ path: "u/p/worlds/a.png" }, { path: "u/p/worlds/b.png" }], actualCostUsd: 0.14 }; }),
    insertJob: vi.fn(async () => { calls.push("insert"); return "row-1"; }),
    updateJob: vi.fn(async (_id, patch) => { calls.push(`update:${String(patch.status)}`); }),
    callProxy: vi.fn(async () => { calls.push("proxy"); return { ok: true, providerJobId: "job-abc", status: "queued", costEstimateCents: 185 }; }),
    ...over,
  };
}

describe("rates and caps are the config files", () => {
  it("PROVIDER_RATES mirrors config/provider_rates.json", () => {
    const { _about, _seedance_tokens, ...file } = JSON.parse(readFileSync(root("config/provider_rates.json"), "utf8"));
    // the rule in words, and the scope of what has actually been charged, travel with the numbers
    expect(_seedance_tokens).toContain("billable video tokens = ceil(output height x output width x (input video seconds + generated video seconds) x 24 / 1024)");
    expect(_seedance_tokens).toContain("SCOPE OF WHAT HAS BEEN CHARGED");
    expect(_about).toBeTruthy();
    expect(PROVIDER_RATES).toEqual(file);
  });
  it("PROMPT_CAPS mirrors config/provider_caps.json", () => {
    const file = JSON.parse(readFileSync(root("config/provider_caps.json"), "utf8"));
    for (const p of ["runway", "higgsfield", "xai"] as const) {
      expect(PROMPT_CAPS[p]).toBe(file[p].max_prompt_chars);
      expect(PROVIDER_REFUSALS[p]).toEqual(file[p].refusal_patterns);
    }
  });
});

describe("dialect", () => {
  it("parses the round's request files exactly as the Python runner reads them", () => {
    const text = readFileSync(root("docs/handoffs/round_2026-10-02/angle_requests.json"), "utf8");
    const { shots, errors } = parseShotsJson(text);
    expect(errors).toEqual([]);
    expect(shots.map((s) => s.id)).toEqual(["S06c_low_hero", "S08a_side_tight", "S11c_low_hero", "S12b_side_tight"]);
    // run_world_batch.py measures the files; the browser has no ffprobe and uses source_trim, 4.0 s each. At the rate
    // the provider has been seen to charge at 720p (the list rate put these at $14.79 and $7.40)
    expect(estimateBatchUsd(shots).toFixed(2)).toBe("8.88");
    expect(estimateBatchUsd(shots.slice(0, 2)).toFixed(2)).toBe("4.44");
    // …and every one of them is blocked in the browser until its source clip is in storage
    expect(shots.every((s) => missingInput(s).includes("source clip"))).toBe(true);
  });
  it("reports each bad shot by name and drops nothing silently", () => {
    const { shots, errors } = parseShotsJson(JSON.stringify([{ id: "ok", route: "kling_t2v", prompt: "x" }, { id: "bad route", route: "kling_t2v" }, { id: "ok", route: "kling_t2v", prompt: "y" }, { id: "nope", route: "veo" }]));
    expect(shots.map((s) => s.id)).toEqual(["ok"]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain("bad route");
    expect(errors[1]).toContain("duplicate");
    expect(errors[2]).toContain("nope");
    expect(parseShotsJson("{").errors[0]).toContain("not JSON");
    expect(parseShotsJson("{}").errors[0]).toContain("list");
  });
  it("a seedance shot needs its source, its angle and its keep[]", () => {
    expect(missingInput(ANGLE)).toBe("");
    expect(missingInput({ ...ANGLE, source_path: null })).toContain("source clip");
    expect(missingInput({ ...ANGLE, keep: [] })).toContain("keep[]");
    expect(missingInput({ ...ANGLE, angle: " " })).toContain("angle");
    expect(missingInput(shot({ id: "x", route: "kling_t2v" }))).toContain("prompt");
  });
});

describe("Seedance price — the rule against the provider's own published figures, and what has actually been charged", () => {
  // Read from open.higgsfield.ai on 4 October 2026 (text-to-video, reference-to-video and video-edit pages; 16:9).
  // These are the provider's numbers, typed here — not derived from the config — so the rule is tested against them.
  const PUBLISHED_NO_VIDEO_INPUT_PER_GENERATED_S = { "480p": 0.2056, "720p": 0.4622, "1080p": 1.1372 };
  const PUBLISHED_WITH_VIDEO_INPUT_PER_COMBINED_S = { "480p": 0.1234, "720p": 0.2773, "1080p": 0.6823 };
  const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
  // the rule, spelled out with no reference to the module under test
  const byHand = (w: number, h: number, combinedSeconds: number, usdPer1000: number, videoInput: boolean) =>
    (Math.ceil((w * h * combinedSeconds * 24) / 1024) / 1000) * usdPer1000 * (videoInput ? 0.6 : 1);

  it("reproduces all six published per-second figures from the configured sizes", () => {
    for (const res of ["480p", "720p", "1080p"] as const) {
      // no video input: one generated second
      expect(round4(seedanceUsd(res, 1, 0))).toBe(PUBLISHED_NO_VIDEO_INPUT_PER_GENERATED_S[res]);
      // a video input: per second of input + generated together (two seconds in, two out, divided by four)
      expect(round4(seedanceUsd(res, 2, 2) / 4)).toBe(PUBLISHED_WITH_VIDEO_INPUT_PER_COMBINED_S[res]);
      // and the list of per-second figures in the config is the no-video-input one at every size
      expect(PROVIDER_RATES.seedance_usd_per_s[res]).toBe(PUBLISHED_NO_VIDEO_INPUT_PER_GENERATED_S[res]);
    }
  });

  it("480p: $0.2056 and $0.2468 are the same model and size under different billing — and give the same 4 s restage", () => {
    // $0.2056 = one generated second, NO video input, full rate
    expect(byHand(854, 480, 1, 0.0214, false)).toBeCloseTo(0.2056, 4);
    // $0.2468 = the pages' "from" headline for a job WITH a video input: one second in + one second out (two combined
    // seconds) at six tenths of the rate, rounded up to four places — a price per OUTPUT second when input = output
    const headline = byHand(854, 480, 2, 0.0214, true);
    expect(headline).toBeCloseTo(0.24672, 5);
    expect(Math.ceil(headline * 1e4) / 1e4).toBe(0.2468);
    // a 4 s restage from a 4 s source, each way: 76,860 tokens at $0.01284 per thousand, or four output seconds at the headline
    expect(Math.ceil((854 * 480 * 8 * 24) / 1024)).toBe(76860);
    expect(usd(byHand(854, 480, 8, 0.0214, true))).toBe("$0.99");
    expect(usd(4 * 0.2468)).toBe("$0.99");
    expect(usd(seedanceUsd("480p", 4, 4))).toBe("$0.99");
    // what the mixed-up figure used to produce, and must not: the no-input rate, or the headline, times combined seconds
    expect(usd(0.2468 * 8)).toBe("$1.97");
    expect(usd(seedanceUsd("480p", 4, 4))).not.toBe("$1.97");
  });

  it("720p is the charged case and is unchanged: 172,800 tokens, $2.22; six seconds, $3.33", () => {
    expect(Math.ceil((1280 * 720 * 8 * 24) / 1024)).toBe(172800);
    expect(byHand(1280, 720, 8, 0.0214, true)).toBeCloseTo(2.218752, 6);
    expect(seedanceUsd("720p", 4, 4)).toBeCloseTo(2.218752, 6);
    expect(usd(seedanceUsd("720p", 4, 4.004))).toBe("$2.22"); // as sent, as charged
    expect(usd(seedanceUsd("720p", 6, 6.006))).toBe("$3.33"); // as sent, as charged
  });

  it("says which sizes have been charged and which are only the published rule", () => {
    expect(PROVIDER_RATES.seedance_tokens.charged).toEqual(["720p"]);
    expect(seedancePriceBasis("720p")).toBe("charged");
    expect(seedancePriceBasis("480p")).toBe("published");
    expect(seedancePriceBasis("1080p")).toBe("published"); // formula-tested above; no charge has been seen at 1080p
    expect(usd(seedanceUsd("1080p", 4, 4))).toBe("$5.46");
    expect(unchargedSeedanceSizes([ANGLE])).toEqual([]);
    expect(unchargedSeedanceSizes([ANGLE, { ...ANGLE, resolution: "480p" }, { ...ANGLE, resolution: "1080p" }, WORLD])).toEqual(["1080p", "480p"]);
  });

  it("a size with no published rate is refused, not priced as nothing", () => {
    expect(() => seedanceUsd("4k", 4, 4)).toThrow("cannot be priced");
    expect(() => estimateShotUsd({ ...ANGLE, resolution: "2k" as never })).toThrow("not submitted");
  });
});

describe("estimate — run_world_batch.py's arithmetic", () => {
  it("seedance is priced by the provider's token rule: input and output seconds both, at six tenths of the rate when there is a video input", () => {
    // 720p, 4 s from a 4 s source: 921,600 px × 8 s × 24 / 1024 = 172,800 tokens × $0.0214 × 0.6 per thousand — $2.22, the amount charged
    expect(estimateShotUsd(ANGLE)).toBeCloseTo(2.218752, 6);
    expect(usd(estimateShotUsd(ANGLE))).toBe("$2.22");
    // 6 s: $3.33 — charged too
    expect(usd(estimateShotUsd({ ...ANGLE, source_trim: [0, 6] }))).toBe("$3.33");
    // the sources AVT actually sent were 4.004 s and 6.006 s: still $2.22 and $3.33
    expect(usd(seedanceUsd("720p", 4, 4.004))).toBe("$2.22");
    expect(usd(seedanceUsd("720p", 6, 6.006))).toBe("$3.33");
    // the same rule at the other sizes (published, not yet charged): 480p $0.99, 1080p $5.46 for 4 s
    expect(usd(estimateShotUsd({ ...ANGLE, resolution: "480p" }))).toBe("$0.99");
    expect(usd(estimateShotUsd({ ...ANGLE, resolution: "1080p" }))).toBe("$5.46");
    // (the provider's own per-second figures are held in their own test below)
    // a source longer than what it returns is paid for: 4 s out of a 10 s source
    expect(usd(seedanceUsd("720p", 4, 10))).toBe("$3.88");
    // source_seconds, when the shot says it, is what is billed (1080p, 6 s: 2,073,600 px × 12 s)
    expect(estimateShotUsd({ ...ANGLE, resolution: "1080p", source_seconds: 6 })).toBeCloseTo(8.188128, 6);
  });
  it("still routes add the stills unless one is supplied; seconds snap to 5 or 10", () => {
    expect(estimateShotUsd(WORLD)).toBeCloseTo(0.07 * 2 + 5 * 0.07, 6);
    expect(estimateShotUsd({ ...WORLD, still_path: "u/p/s.png", seconds: 7 })).toBeCloseTo(10 * 0.07, 6);
    expect(estimateShotUsd(shot({ id: "d", route: "still_dop", prompt: "p", still_path: "s.png" }))).toBeCloseTo(5 * 0.083, 6);
    expect(estimateShotUsd(shot({ id: "r", route: "runway_t2v", prompt: "p", seconds: 10 }))).toBeCloseTo(10 * 0.15, 6);
    expect(estimateShotUsd(shot({ id: "t", route: "still_runway", prompt: "p", still_path: "s.png" }))).toBeCloseTo(5 * 0.05, 6);
  });
});

describe("requests — the bodies motion_submit() sends", () => {
  it("seedance_ref: @Video1 is the real take, duration is the source's seconds, input never exceeds 30", () => {
    const prompt = motionPrompt(ANGLE, LOOK, false);
    expect(prompt.startsWith("@Video1 is the performer")).toBe(true);
    expect(prompt).toContain("clear-lens glasses, not tinted, navy cap");
    expect(prompt).toContain("The same room, the same light.");
    const r = buildMotionRequest(ANGLE, { prompt, sourceUrl: "https://signed/src.mp4", userId: "u", projectId: "p" });
    expect(r).toEqual({
      endpoint: "video-providers-higgsfield-model", provider: "higgsfield", modelVariant: "seedance-2.5-reference",
      body: { promptText: prompt, mode: "reference_to_video", modelVariant: "seedance-2.5-reference", referenceVideoUrls: ["https://signed/src.mp4"], referenceImageUrls: [], duration: 4, resolution: "720p", aspectRatio: "9:16", generate_audio: false, avt_user_id: "u", avt_project_id: "p" },
    });
    expect(buildMotionRequest({ ...ANGLE, source_seconds: 44 }, { prompt, sourceUrl: "s", userId: "u", projectId: "p" }).body.duration).toBe(30);
    expect(() => buildMotionRequest(ANGLE, { prompt, userId: "u", projectId: "p" })).toThrow(/source clip/);
  });
  it("still_kling: image-to-video on the catalogue with the motion sentence + suffix, no preamble", () => {
    const prompt = motionPrompt(WORLD, LOOK, true);
    expect(prompt).toBe(`slow push-in, dust in the window light ${LOOK.shot_suffix}`);
    const r = buildMotionRequest(WORLD, { prompt, stillUrl: "https://signed/still.png", userId: "u", projectId: "p" });
    expect(r.endpoint).toBe("video-providers-higgsfield-model");
    expect(r.body).toEqual({ promptText: prompt, mode: "image_to_video", modelVariant: "kling-2.5-turbo-pro-i2v", duration: 5, referenceImageUrl: "https://signed/still.png", avt_user_id: "u", avt_project_id: "p" });
    expect(stillPrompt(WORLD, LOOK)).toBe(`${LOOK.preamble} a Paris atelier, one tailor at his bench ${LOOK.shot_suffix}`);
  });
  it("text-to-video routes, DoP and Runway", () => {
    const t2v = shot({ id: "k", route: "kling_t2v", prompt: "a street", seconds: 8 });
    expect(buildMotionRequest(t2v, { prompt: "x", userId: "u", projectId: "p" }).body).toEqual({ promptText: "x", mode: "text_to_video", modelVariant: "kling-2.5-turbo-pro-t2v", duration: 10, avt_user_id: "u", avt_project_id: "p" });
    const dop = shot({ id: "d", route: "still_dop", prompt: "p", motion: "m" });
    expect(buildMotionRequest(dop, { prompt: "x", stillUrl: "s", userId: "u", projectId: "p" })).toMatchObject({ endpoint: "video-providers-higgsfield-generate", body: { mode: "image_to_video", referenceImageUrl: "s", modelVariant: "dop-turbo" } });
    const rw = shot({ id: "r", route: "still_runway45", prompt: "p", aspect: "16:9" });
    expect(buildMotionRequest(rw, { prompt: "x", stillUrl: "s", userId: "u", projectId: "p" })).toMatchObject({ endpoint: "video-providers-runway-generate", provider: "runway", body: { modelVariant: "gen4.5", aspectRatio: "16:9", referenceImageUrl: "s" } });
    // Runway caps the prompt at 1000 chars: the preamble goes first, the scene never
    const long = shot({ id: "l", route: "runway_t2v", prompt: "scene ".repeat(100).trim() });
    const p = motionPrompt(long, LOOK, false);
    expect(p.length).toBeLessThanOrEqual(1000);
    expect(p).toContain("scene scene");
    expect(p).not.toContain("world-class cinematographer");
  });
});

describe("submitShot — write-ahead", () => {
  it("the row exists before the provider is called, then carries the job id", async () => {
    const d = deps();
    const out = await submitShot(ANGLE, CTX, d);
    expect(d.calls).toEqual(["sign:project-clips", "insert", "proxy", "update:queued"]);
    expect(out).toMatchObject({ rowId: "row-1", providerJobId: "job-abc", stillPath: null });
    const row = (d.insertJob as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row).toMatchObject({ project_id: "proj", provider: "higgsfield", status: "queued" });
    expect(row.request_payload_json.settings).toMatchObject({ batchRun: "r1", batchShotId: "S06c_low_hero", route: "seedance_ref", estimateUsd: 2.219, sourcePath: "u/p/seedance/S06c_src.mp4", sourceWindow: [66.885, 68.853], masterStart: 63.9987 });
    expect((d.updateJob as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ external_job_id: "job-abc", status: "queued" });
  });
  it("a refused call is recorded on the row and rethrown with the shot's name", async () => {
    const d = deps({ callProxy: vi.fn(async () => { throw new Error("insufficient balance"); }) });
    await expect(submitShot(ANGLE, CTX, d)).rejects.toThrow("S06c_low_hero: insufficient balance");
    expect((d.updateJob as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual(["row-1", { status: "failed", error_text: "insufficient balance" }]);
  });
  it("an accepted job whose record cannot be updated is never reported as a failed submit, and keeps its id", async () => {
    const d = deps({ updateJob: vi.fn(async () => { throw new Error("row locked"); }) });
    await expect(submitShot(ANGLE, CTX, d)).rejects.toThrow("S06c_low_hero: accepted by the provider as job-abc, but its record could not be updated — row locked");
    expect(d.updateJob).toHaveBeenCalledTimes(1);
    const odd = deps({ callProxy: vi.fn(async () => ({ providerJobId: "job-x", status: "in_progress" })) });
    await submitShot(ANGLE, CTX, odd);
    expect((odd.updateJob as ReturnType<typeof vi.fn>).mock.calls[0][1].status).toBe("queued");
  });
  it("a still route generates its still first, takes the first candidate and records them all", async () => {
    const d = deps();
    const out = await submitShot(WORLD, CTX, d);
    expect(d.calls).toEqual(["stills", "sign:project-references", "insert", "proxy", "update:queued"]);
    expect(out.stillPath).toBe("u/p/worlds/a.png");
    const s = (d.insertJob as ReturnType<typeof vi.fn>).mock.calls[0][0].request_payload_json.settings;
    expect(s).toMatchObject({ stillPath: "u/p/worlds/a.png", stillCandidates: ["u/p/worlds/a.png", "u/p/worlds/b.png"], stillCostUsd: 0.14, estimateUsd: 0.35 });
    expect((d.generateStills as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ projectId: "proj", n: 2, aspectRatio: "9:16", resolution: "2k", shotLabel: "r1_H1_tailor", dryRun: false });
  });
  it("a retry reuses the still it already paid for", async () => {
    const d = deps();
    await submitShot(WORLD, CTX, d, "u/p/worlds/kept.png");
    expect(d.generateStills).not.toHaveBeenCalled();
    expect((d.callProxy as ReturnType<typeof vi.fn>).mock.calls[0][1].referenceImageUrl).toBe("https://signed/project-references/u/p/worlds/kept.png");
  });
  it("a shot that is not ready never reaches the provider or the table", async () => {
    const d = deps();
    await expect(submitShot({ ...ANGLE, source_path: null }, CTX, d)).rejects.toThrow(/source clip/);
    expect(d.calls).toEqual([]);
  });
});

describe("planRun / runPlan — no double spend", () => {
  const shots = [ANGLE, WORLD, shot({ id: "S11c", kind: "angle", route: "seedance_ref", angle: "low", keep: ["cap"] })];
  it("state comes from the jobs table: live, done and unreconciled shots are left alone; failed ones retry with their still", () => {
    const jobs = [
      job({ shotId: "S06c_low_hero", status: "running", external_job_id: "j1" }),
      job({ shotId: "H1_tailor", status: "failed", stillPath: "u/p/worlds/a.png", created_at: "2026-10-02T18:05:00Z" }),
    ];
    const byRun = batchJobsByRun(jobs).get("r1")!;
    expect(shotState(ANGLE, byRun).state).toBe("running");
    const plan = planRun(shots, byRun);
    expect(plan.submit).toEqual([{ shot: WORLD, reuseStillPath: "u/p/worlds/a.png" }]);
    expect(plan.skip.map((s) => [s.shot.id, s.why])).toEqual([["S06c_low_hero", "already running in this run"], ["S11c", "needs its source clip (the real take, 4–30 s) uploaded"]]);
    expect(plan.estimateUsd).toBeCloseTo(0.35, 6); // the retry does not pay for stills again
    expect(shotState(ANGLE, [job({ shotId: "S06c_low_hero", status: "queued" })]).state).toBe("unreconciled");
    expect(planRun([ANGLE], [job({ shotId: "S06c_low_hero", status: "queued" })]).skip[0].why).toContain("never reported back");
    expect(planRun([ANGLE], [job({ shotId: "S06c_low_hero", status: "succeeded", external_job_id: "j" })]).skip[0].why).toBe("already done in this run");
    expect(planRun([ANGLE], [job({ shotId: "S06c_low_hero", run: "other", status: "succeeded", external_job_id: "j" })].filter((j) => (j.request_payload_json as { settings: { batchRun: string } }).settings.batchRun === "r1")).submit).toHaveLength(1);
  });
  it("a run above the ceiling submits nothing", async () => {
    const d = deps();
    const plan = planRun([ANGLE, { ...ANGLE, id: "S11c_low_hero" }], []);
    await expect(runPlan(plan, CTX, d, { ceilingUsd: 4 })).rejects.toThrow("estimate $4.44 exceeds the ceiling $4.00 — nothing was submitted");
    expect(d.calls).toEqual([]);
  });
  it("one failure does not stop the rest; a refusal pattern stops that provider", async () => {
    let n = 0;
    const d = deps({ callProxy: vi.fn(async () => { n++; if (n === 1) throw new Error("upstream 502"); return { providerJobId: `job-${n}`, status: "queued" }; }) });
    const plan = planRun([ANGLE, { ...ANGLE, id: "B" }, { ...ANGLE, id: "C" }], []);
    const out = await runPlan(plan, CTX, d, { ceilingUsd: 20 });
    expect(out.failed).toEqual([{ shotId: "S06c_low_hero", error: "S06c_low_hero: upstream 502" }]);
    expect(out.submitted.map((s) => s.providerJobId)).toEqual(["job-2", "job-3"]);

    const d2 = deps({ callProxy: vi.fn(async () => { throw new Error("Insufficient credits on this workspace"); }) });
    const out2 = await runPlan(plan, CTX, d2, { ceilingUsd: 20, refusalPatterns: { higgsfield: ["insufficient"] } });
    expect(out2.failed).toHaveLength(1);
    expect(out2.skipped.map((s) => s.why)).toEqual(["higgsfield refused earlier in this run", "higgsfield refused earlier in this run"]);
    expect(d2.callProxy).toHaveBeenCalledTimes(1);
  });
  it("a result URL is success whatever the status word says; terminal words fail; the rest is running", () => {
    expect(statusFromEnvelope({ status: "completed", resultUrl: "https://cdn/x.mp4" })).toBe("succeeded");
    expect(statusFromEnvelope({ status: "nsfw" })).toBe("failed");
    expect(statusFromEnvelope({ status: "Canceled" })).toBe("failed");
    expect(statusFromEnvelope({ status: "in_progress" })).toBe("running");
    expect(statusFromEnvelope(null)).toBe("running");
  });
  it("result url and spend are read off the rows", () => {
    expect(resultUrlOf({ response_payload_json: { resultUrl: "https://cdn/x.mp4" } })).toBe("https://cdn/x.mp4");
    expect(resultUrlOf({ response_payload_json: { resultUrl: null } })).toBeNull();
    expect(spentEstimateUsd([
      job({ shotId: "a", external_job_id: "j", status: "succeeded", estimateUsd: 3.698 }),
      job({ shotId: "b", status: "failed", estimateUsd: 0.35, stillCostUsd: 0.14 }),
      job({ shotId: "c", external_job_id: "j2", status: "running", estimateUsd: 0.35, stillCostUsd: 0.14 }),
    ])).toBeCloseTo(3.698 + 0.14 + 0.35 + 0.14, 6);
  });
});

describe("a still that is two pictures", () => {
  const W = 720, H = 1280;                                                                         // block-averaged by 4 for the first pass
  /** luma picture from a function of (x, y) */
  const pic = (f: (x: number, y: number) => number) => Float32Array.from({ length: W * H }, (_, i) => f(i % W, Math.floor(i / W)));
  const tex = (x: number, y: number) => 8 * Math.sin(x / 11) + 6 * Math.cos(y / 17);
  const STACKED = pic((x, y) => (y < 480 ? 70 : 150) + tex(x, y));                                  // two panels, a one-pixel edge at y = 480
  const SIDE_BY_SIDE = pic((x, y) => (x < 360 ? 60 : 170) + tex(x, y));
  const ONE_PICTURE = pic((x, y) => 40 + y * 0.12 + tex(x, y));                                     // a graded street, no edge
  // a kerb photographed square-on: it crosses the whole frame, but it wanders and has thickness
  const KERB = pic((x, y) => { const e = 1101.5 + 1.2 * Math.sin(x / 40) + (x % 13 < 6 ? 1 : -1); const t = Math.min(1, Math.max(0, (y - e) / 2)); return 150 - 80 * t + tex(x, y); });

  it("finds the seam of stacked and of side-by-side panels", () => {
    const row = panelSeam(STACKED, W, H);
    expect(row.axis).toBe("row");
    expect(row.frac).toBeGreaterThan(0.95);
    expect(row.straight).toBeGreaterThan(0.95);
    expect(row.at).toBeCloseTo(480 / H, 2);
    expect(isStackedPanels(row)).toBe(true);
    const col = panelSeam(SIDE_BY_SIDE, W, H);
    expect(col.axis).toBe("column");
    expect(isStackedPanels(col)).toBe(true);
    expect(describeSeam(row)).toMatch(/^a ruler-straight edge across \d+ % of the frame, 3[78] % from the top$/);
  });

  it("leaves one picture alone — a graded frame, and a real edge that crosses the whole frame", () => {
    expect(isStackedPanels(panelSeam(ONE_PICTURE, W, H))).toBe(false);
    const kerb = panelSeam(KERB, W, H);
    expect(kerb.frac).toBeGreaterThan(PANEL_SEAM_FRAC_MIN);          // it does span the frame …
    expect(kerb.straight).toBeLessThan(PANEL_SEAM_STRAIGHT_MIN);     // … but no ruler drew it
    expect(isStackedPanels(kerb)).toBe(false);
  });

  const seamOf = (frac: number, straight = 0.8) => ({ frac, straight, at: 0.4, axis: "row" as const });

  it("the motion model gets the first candidate that is one picture", async () => {
    const d = deps({ inspectStill: vi.fn(async (path) => (path.endsWith("a.png") ? seamOf(0.86) : seamOf(0.87, 0.09))) });
    const r = await submitShot(WORLD, CTX, d);
    expect(r.stillPath).toBe("u/p/worlds/b.png");
    expect((d.callProxy as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ referenceImageUrl: "https://signed/project-references/u/p/worlds/b.png" });
  });

  it("when every candidate is stacked panels nothing is spent on motion, and a retry will not reuse them", async () => {
    const d = deps({ inspectStill: vi.fn(async () => seamOf(0.84)) });
    await expect(submitShot(WORLD, CTX, d)).rejects.toThrow("stacked panels (a ruler-straight edge across 84 % of the frame, 40 % from the top)");
    expect(d.callProxy).not.toHaveBeenCalled();
    const row = (d.insertJob as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.request_payload_json.settings).toMatchObject({ batchShotId: "H1_tailor", stillPath: null, stillCandidates: ["u/p/worlds/a.png", "u/p/worlds/b.png"], stillCostUsd: 0.14, estimateUsd: 0 });
    expect(d.updateJob).toHaveBeenCalledWith("row-1", expect.objectContaining({ status: "failed" }));
    // the failed row carries no still to reuse → the shot is ready again and will generate afresh
    const failed = job({ shotId: "H1_tailor", status: "failed", stillPath: null, stillCostUsd: 0.14, estimateUsd: 0 });
    expect(shotState(WORLD, [failed])).toMatchObject({ state: "failed", reuseStillPath: null });
    expect(spentEstimateUsd([failed])).toBeCloseTo(0.14, 5);
  });

  it("a check that cannot run, or a shot that opts out, does not block the shot", async () => {
    const broken = deps({ inspectStill: vi.fn(async () => { throw new Error("canvas tainted"); }) });
    expect((await submitShot(WORLD, CTX, broken)).stillPath).toBe("u/p/worlds/a.png");
    const optOut = deps({ inspectStill: vi.fn(async () => seamOf(0.95)) });
    expect((await submitShot({ ...WORLD, panel_check: false }, CTX, optOut)).stillPath).toBe("u/p/worlds/a.png");
    expect(optOut.inspectStill).not.toHaveBeenCalled();
  });
});

describe("a still on its own (the storyboard's Generate image)", () => {
  const CTX = { projectId: "p", runId: "storyboard", lookPresetId: "film_bar_v1", look: LOOK_PRESETS.film_bar_v1, shotIds: { c006: "shot-uuid-6" } };
  const shot = BatchShotSchema.parse({ id: "c006", route: "still_kling", prompt: "a Bentley at the kerb" });

  it("records the job before the generator is called, files it under the box, and ends on the picked still", async () => {
    const d = deps();
    const r = await submitStills(shot, CTX, d);
    expect(d.calls).toEqual(["insert", "stills", "update:succeeded"]);
    const inserted = (d.insertJob as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(inserted.provider).toBe("grok");
    expect(inserted.request_payload_json).toMatchObject({ mode: "still_only", shotId: "shot-uuid-6", settings: { batchRun: "storyboard", batchShotId: "c006", stillPath: null } });
    expect(r).toMatchObject({ rowId: "row-1", picked: "u/p/worlds/a.png", candidates: ["u/p/worlds/a.png", "u/p/worlds/b.png"], costUsd: 0.14 });
    const patch = (d.updateJob as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(patch.request_payload_json.settings).toMatchObject({ stillPath: "u/p/worlds/a.png", stillCostUsd: 0.14 });
    // no motion model was called
    expect(d.callProxy).not.toHaveBeenCalled();
  });

  it("a still that is two pictures stacked is never the box's image", async () => {
    const stacked = { frac: 0.95, straight: 0.9, at: 0.5, axis: "row" as const };
    const first = deps({ inspectStill: vi.fn(async (p: string) => (p.endsWith("a.png") ? stacked : null)) });
    expect((await submitStills(shot, CTX, first)).picked).toBe("u/p/worlds/b.png");
    const all = deps({ inspectStill: vi.fn(async () => stacked) });
    await expect(submitStills(shot, CTX, all)).rejects.toThrow(/stacked panels/);
    expect(all.calls.at(-1)).toBe("update:failed");
    // the stills are paid for: they stay on the record
    expect((all.updateJob as ReturnType<typeof vi.fn>).mock.calls[0][1].request_payload_json.settings.stillCandidates).toHaveLength(2);
  });

  it("a generator failure is recorded on the row", async () => {
    const d = deps({ generateStills: vi.fn(async () => ({ ok: false, error: "rate limited" })) });
    await expect(submitStills(shot, CTX, d)).rejects.toThrow(/rate limited/);
    expect(d.calls).toEqual(["insert", "update:failed"]);
  });

  it("a clip submitted for a box carries the box's record id, which the ingest files the clip under", async () => {
    const d = deps();
    await submitShot(BatchShotSchema.parse({ id: "c006", route: "still_kling", prompt: "x", still_path: "u/p/worlds/a.png" }), CTX, d);
    expect((d.insertJob as ReturnType<typeof vi.fn>).mock.calls[0][0].request_payload_json.shotId).toBe("shot-uuid-6");
    const plain = deps();
    await submitShot(BatchShotSchema.parse({ id: "c006", route: "still_kling", prompt: "x", still_path: "u/p/worlds/a.png" }), { ...CTX, shotIds: undefined }, plain);
    expect("shotId" in (plain.insertJob as ReturnType<typeof vi.fn>).mock.calls[0][0].request_payload_json).toBe(false);
  });
});

describe("why the still generator did not draw", () => {
  it("says what the image model itself said, not only a code", () => {
    expect(stillFailure({ ok: false, error: "xai_error", httpStatus: 400, detail: { error: "Generated image rejected by content moderation." } })).toBe("the image model refused (400): Generated image rejected by content moderation.");
    expect(stillFailure({ ok: false, error: "xai_error", httpStatus: 429, detail: { error: { message: "Rate limit reached" } } })).toBe("the image model refused (429): Rate limit reached");
    expect(stillFailure({ ok: false, error: "xai_error", httpStatus: 502, detail: { _raw: "<html>Bad gateway</html>" } })).toBe("the image model refused (502): <html>Bad gateway</html>");
    // nothing said: the code and the status are all there is
    expect(stillFailure({ ok: false, error: "xai_error", httpStatus: 500, detail: {} })).toBe("the image model refused (500)");
    expect(stillFailure({ ok: false })).toBe("the image generator failed");
  });
  it("a request above the cost limit says both numbers", () => {
    expect(stillFailure({ ok: false, error: "cost_gate", estimatedCostUsd: 0.28, maxCostUsd: 0.2 })).toBe("this would cost about $0.28, above the limit of $0.20 for one request");
  });
});
