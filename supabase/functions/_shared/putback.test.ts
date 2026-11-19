import { describe, expect, it } from "vitest";
import { checkPutbackInput, parsePutbackProof, planPutback, putbackPasses, putbackRecord, PUTBACK_LIMITS, PUTBACK_MODELS, PUTBACK_PRESETS, PUTBACK_PRESET_NAMES } from "./putback.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

// the script's real printout shape (scripts/edit/body_only_swap.py lines 79, 187, 270, 471, 472)
const PRINTOUT = [
  "swap interpolated to the original's rate: 60000/1001 (22.250 fps), minterpolate mci",
  "original (240, 1920, 1080, 3) 59.94 swap (240, 1920, 1080, 3) 59.94",
  "segmenter mediapipe",
  "scenes aligned by their cuts: original [0, 240] swap [0, 240]",
  "scene 0-239: his face on 240 of 240 frames, brow row 412..418, face height 168",
  "frames 240 swap frames aligned 89 max |out-original| on face/hair/skin: 0",
  "scene re-rendered by the generator (overshoot band limited to him) on 0 frames",
].join("\n");

describe("a put-back job is a preset and two asset ids — nothing else reaches the script", () => {
  it("the presets are the approved settings, by the name of what each reproduces", () => {
    expect(PUTBACK_PRESET_NAMES).toEqual(["c033_showroom", "full_body", "hyenas_verse_creature"]);
    expect(PUTBACK_PRESETS.c033_showroom).toMatchObject({ args: ["--base", "original"], env: { AVT_HEAD_ZOOM: "4" } });
    expect(PUTBACK_PRESETS.full_body.env).toEqual({ AVT_HEAD_ZOOM: "3" });
    expect(PUTBACK_PRESETS.hyenas_verse_creature.args).toEqual(["--base", "swap", "--retime", "auto", "--hat-gap-fill", "off"]);
    // head fit is never switched on (2-6 px jitter on the hat, PROBLEM_INDEX) and nothing ablates a stage
    for (const p of Object.values(PUTBACK_PRESETS)) {
      expect(Object.keys(p.env)).toEqual(["AVT_HEAD_ZOOM"]);
      expect(p.reproduces.length).toBeGreaterThan(20);
    }
  });

  it("accepts a preset with the original first and its swap second", () => {
    const r = planPutback({ preset: "hyenas_verse_creature" }, [A, B]);
    expect(r).toEqual({ ok: true, value: { preset: "hyenas_verse_creature", originalAssetId: A, swapAssetId: B, args: ["--base", "swap", "--retime", "auto", "--hat-gap-fill", "off"], env: { AVT_HEAD_ZOOM: "3" } } });
  });

  it("refuses anything a row could use to steer the command: extra settings, unknown presets, flags, env", () => {
    for (const settings of [
      { preset: "c033_showroom", args: ["--base", "swap"] },
      { preset: "c033_showroom", env: { AVT_HEAD_FIT: "1" } },
      { preset: "c033_showroom", script: "/tmp/x.py" },
      { preset: "c033_showroom", AVT_ABLATE: "gap" },
    ]) {
      const r = planPutback(settings, [A, B]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain("a preset and nothing else");
    }
    for (const preset of ["", "nope", "constructor", "__proto__", "toString", 4, null, ["c033_showroom"], "c033_showroom; rm -rf /"]) {
      expect(planPutback({ preset }, [A, B]).ok).toBe(false);
    }
    for (const settings of [null, undefined, "c033_showroom", [], 7]) expect(planPutback(settings, [A, B]).ok).toBe(false);
  });

  it("refuses inputs that are not exactly two different asset ids", () => {
    const s = { preset: "c033_showroom" };
    for (const ids of [[], [A], [A, B, A], [A, A], [A, "../../etc/passwd"], [A, "https://example.com/x.mp4"], "x", null, [A, 5]]) {
      expect(planPutback(s, ids).ok).toBe(false);
    }
  });

  it("a plan is a copy: changing it never changes the preset", () => {
    const r = planPutback({ preset: "c033_showroom" }, [A, B]);
    if (!r.ok) throw new Error("expected ok");
    r.value.args.push("--evil");
    r.value.env.AVT_HEAD_FIT = "1";
    expect(PUTBACK_PRESETS.c033_showroom.args).toEqual(["--base", "original"]);
    expect(PUTBACK_PRESETS.c033_showroom.env).toEqual({ AVT_HEAD_ZOOM: "4" });
  });
});

describe("the proof is read from the script's own printout, and only 0 passes", () => {
  it("reads the proof line, the frame counts and on how many frames his face was found", () => {
    const p = parsePutbackProof(PRINTOUT);
    expect(p).toEqual({ proofMax: 0, frames: 240, swapFramesAligned: 89, faceFound: [{ scene: "0-239", found: 240, of: 240 }], warnings: [] });
    expect(putbackPasses(p)).toEqual({ ok: true });
  });

  it("a proof that is not 0 fails with the number; a run that printed no proof fails too", () => {
    const bad = parsePutbackProof(PRINTOUT.replace("face/hair/skin: 0", "face/hair/skin: 3"));
    expect(bad.proofMax).toBe(3);
    const verdict = putbackPasses(bad);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.why).toContain("is 3, not 0");
    const none = putbackPasses(parsePutbackProof("original (240, 1920, 1080, 3) 59.94"));
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.why).toContain("did not print its proof line");
    expect(putbackPasses(parsePutbackProof("")).ok).toBe(false);
    // a fractional difference is still a difference
    expect(putbackPasses(parsePutbackProof(PRINTOUT.replace("skin: 0", "skin: 0.5"))).ok).toBe(false);
  });

  it("keeps a low face count and the script's warnings with the result instead of hiding them", () => {
    const p = parsePutbackProof(
      ["WARNING: the original has 1 cuts and the swap 0 - frames mapped by the clock only", "scene 0-47: his face on 2 of 48 frames", "scene 48-95: his face on 48 of 48 frames, brow row 300..310", "frames 96 swap frames aligned 96 max |out-original| on face/hair/skin: 0"].join("\n"),
    );
    expect(p.faceFound).toEqual([{ scene: "0-47", found: 2, of: 48 }, { scene: "48-95", found: 48, of: 48 }]);
    expect(p.warnings).toHaveLength(1);
    expect(putbackPasses(p).ok).toBe(true);
  });
});

describe("limits and the record on the asset", () => {
  it("an input over a limit is refused with the number", () => {
    const ok = { seconds: 4.004, frames: 240, width: 1080, height: 1920 };
    expect(checkPutbackInput("the original", ok)).toBeNull();
    expect(checkPutbackInput("the original", { ...ok, seconds: 60 })).toContain(`over the ${PUTBACK_LIMITS.maxSeconds} s`);
    expect(checkPutbackInput("the swap", { ...ok, frames: 5000 })).toContain("5000 frames");
    expect(checkPutbackInput("the swap", { ...ok, width: 7680, height: 4320 })).toContain("7680x4320");
    expect(checkPutbackInput("the swap", { ...ok, frames: 0 })).toContain("no video");
  });

  it("the record carries the proof and everything needed to make the result again — and never an approval", () => {
    const plan = planPutback({ preset: "c033_showroom" }, [A, B]);
    if (!plan.ok) throw new Error("expected ok");
    const rec = putbackRecord({ plan: plan.value, proof: parsePutbackProof(PRINTOUT), scriptSha256: "s".repeat(64), inputSha256: { original: "a".repeat(64), swap: "b".repeat(64) }, seconds: 71.2 });
    expect(rec).toMatchObject({ proof_max: 0, frames: 240, preset: "c033_showroom", env: { AVT_HEAD_ZOOM: "4" }, original_asset_id: A, swap_asset_id: B, script: "scripts/edit/body_only_swap.py", approved: false, run_seconds: 71.2 });
    expect(rec.model_sha256).toEqual(PUTBACK_MODELS);
    expect(Object.values(PUTBACK_MODELS).every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });
});

import { acceptPutbackRecord, claimKinds, putbackInputItems } from "./putback.ts";

describe("the server's side: what a claimed put-back is handed, and what it may file", () => {
  const U = "33333333-3333-4333-8333-333333333333";
  const P = "44444444-4444-4444-8444-444444444444";
  const plan = (() => {
    const r = planPutback({ preset: "c033_showroom" }, [A, B]);
    if (!r.ok) throw new Error("expected ok");
    return r.value;
  })();
  const row = (id: string, over: Record<string, unknown> = {}) => ({ id, user_id: U, project_id: P, asset_type: "video_clip", file_url: `${U}/${P}/dress/${id}.mp4`, metadata_json: { bucket: "project-clips" }, ...over });
  const bucketOf = (r: Record<string, unknown>) => String((r.metadata_json as { bucket?: string })?.bucket ?? "project-clips");
  const buckets = ["project-clips", "project-exports"];

  it("hands over the two files of the job's own project, by bucket and path", () => {
    const r = putbackInputItems(plan, [row(B), row(A)], { userId: U, projectId: P }, bucketOf, buckets);
    expect(r).toEqual({ ok: true, value: { original: { assetId: A, bucket: "project-clips", path: `${U}/${P}/dress/${A}.mp4` }, swap: { assetId: B, bucket: "project-clips", path: `${U}/${P}/dress/${B}.mp4` } } });
  });

  it("refuses an asset of another owner or project, a path outside the project, a URL, and a bucket it does not read", () => {
    const job = { userId: U, projectId: P };
    const no = (rows: Record<string, unknown>[]) => putbackInputItems(plan, rows, job, bucketOf, buckets);
    expect(no([row(A)]).ok).toBe(false); // the swap is missing
    expect(no([row(A, { user_id: "someone-else" }), row(B)]).ok).toBe(false);
    expect(no([row(A, { project_id: "another" }), row(B)]).ok).toBe(false);
    expect(no([row(A, { file_url: `${U}/another-project/x.mp4` }), row(B)]).ok).toBe(false);
    expect(no([row(A, { file_url: `${U}/${P}/../../secret.mp4` }), row(B)]).ok).toBe(false);
    expect(no([row(A, { file_url: "https://evil.example/x.mp4" }), row(B)]).ok).toBe(false);
    expect(no([row(A, { file_url: `/${U}/${P}/x.mp4` }), row(B)]).ok).toBe(false);
    expect(no([row(A, { file_url: null }), row(B)]).ok).toBe(false);
    expect(no([row(A, { metadata_json: { bucket: "artist-assets" } }), row(B)]).ok).toBe(false);
  });

  it("files only a record whose proof is exactly 0 and that is for this job; unknown fields are dropped", () => {
    const good = putbackRecord({ plan, proof: parsePutbackProof(PRINTOUT), scriptSha256: "c".repeat(64), inputSha256: { original: "a".repeat(64), swap: "b".repeat(64) }, seconds: 60 });
    const ok = acceptPutbackRecord({ ...good, approved: true, extra: "x", signed_url: "https://…" }, plan);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.proof_max).toBe(0);
      // a worker cannot approve, and nothing unknown rides along
      expect(ok.value.approved).toBe(false);
      expect(ok.value.extra).toBeUndefined();
      expect(ok.value.signed_url).toBeUndefined();
      expect(ok.value.face_found).toEqual([{ scene: "0-239", found: 240, of: 240 }]);
    }
    for (const bad of [null, [], { ...good, proof_max: 1 }, { ...good, proof_max: "0" }, { ...good, proof_max: null }, { ...good, preset: "full_body" }, { ...good, swap_asset_id: A }, { ...good, script_sha256: "short" }, { ...good, input_sha256: { original: "a".repeat(64) } }]) {
      expect(acceptPutbackRecord(bad, plan).ok).toBe(false);
    }
  });

  it("a worker may ask for the kinds this door knows; with none asked it is the edit queue, as before", () => {
    expect(claimKinds(undefined)).toEqual(["edit"]);
    expect(claimKinds([])).toEqual(["edit"]);
    expect(claimKinds(["putback"])).toEqual(["putback"]);
    expect(claimKinds(["putback", "edit", "vfx", 4, "'; drop table"])).toEqual(["edit", "putback"]);
    expect(claimKinds("putback")).toEqual(["edit"]);
  });
});

import { queuePutbackArgs } from "./putback.ts";

describe("the owner's door is called with the plan's own fields", () => {
  it("passes the project, the two assets in order and the preset name — nothing free-form", () => {
    const plan = planPutback({ preset: "full_body" }, [A, B]);
    if (!plan.ok) throw new Error("expected ok");
    expect(queuePutbackArgs("44444444-4444-4444-8444-444444444444", plan.value)).toEqual({ p_project_id: "44444444-4444-4444-8444-444444444444", p_original_asset_id: A, p_swap_asset_id: B, p_preset: "full_body" });
  });
  it("every preset name is a name the SQL door accepts", () => {
    for (const name of PUTBACK_PRESET_NAMES) expect(name).toMatch(/^[a-z0-9_]{1,40}$/);
    expect(PUTBACK_LIMITS.maxBytes).toBe(1024 * 1024 * 1024);
  });
});
