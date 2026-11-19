import { describe, expect, it } from "vitest";
import { checkPutbackInput, checkPutbackPair, faceCoverage, LOW_FACE_SHARE, parsePutbackProof, planPutback, putbackNote, putbackOutputPath, putbackPasses, putbackRecord, PUTBACK_LIMITS, PUTBACK_MODELS, PUTBACK_PRESETS, PUTBACK_PRESET_NAMES, PUTBACK_SCRIPT_FILES } from "./putback.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

// the script's real printout shape (scripts/edit/body_only_swap.py lines 73, 79, 187, 270, 471, 472): a 22 fps swap
// interpolated to the take's 59.94, so the aligned swap frames are the take's 240
const PRINTOUT = [
  "swap interpolated to the original's rate: 60000/1001 (22.250 fps), minterpolate mci",
  "original (240, 1920, 1080, 3) 59.94 swap (240, 1920, 1080, 3) 59.94",
  "segmenter mediapipe",
  "scenes aligned by their cuts: original [0, 240] swap [0, 240]",
  "scene 0-239: his face on 240 of 240 frames, brow row 412..418, face height 168",
  "frames 240 swap frames aligned 240 max |out-original| on face/hair/skin: 0",
  "scene re-rendered by the generator (overshoot band limited to him) on 0 frames",
].join("\n");

describe("a put-back job is a preset and two asset ids — nothing else reaches the script", () => {
  it("the presets are the approved settings, by the name of what each reproduces", () => {
    // one preset per approved result; a setting with no approved asset behind it is not a preset
    expect(PUTBACK_PRESET_NAMES).toEqual(["c033_showroom", "hyenas_verse_creature"]);
    expect(PUTBACK_PRESETS.c033_showroom).toMatchObject({ args: ["--base", "original"], env: { AVT_HEAD_ZOOM: "4" } });
    expect(PUTBACK_PRESETS.c033_showroom.reproduces).toContain("5482b35b");
    expect(PUTBACK_PRESETS.hyenas_verse_creature.reproduces).toContain("96/96");
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
    for (const preset of ["", "nope", "full_body", "constructor", "__proto__", "toString", 4, null, ["c033_showroom"], "c033_showroom; rm -rf /"]) {
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
    expect(p).toMatchObject({ proofMax: 0, frames: 240, swapFramesAligned: 240, faceFound: [{ scene: "0-239", found: 240, of: 240 }], warnings: [] });
    // what the script did to the swap's timing is kept too, not only its warnings
    expect(p.notes).toEqual(["swap interpolated to the original's rate: 60000/1001 (22.250 fps), minterpolate mci", "scenes aligned by their cuts: original [0, 240] swap [0, 240]", "scene re-rendered by the generator (overshoot band limited to him) on 0 frames"]);
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
    // found on few frames passes and is flagged; found on none does not pass
    expect(putbackPasses(p).ok).toBe(true);
    expect(faceCoverage(p)).toEqual({ found: 50, of: 96, share: 50 / 96 });
    expect(50 / 96).toBeLessThan(LOW_FACE_SHARE);
  });

  it("a 0 that protected nothing is not a proof: no face line, or a scene with his face on no frame, fails", () => {
    const none = parsePutbackProof("frames 96 swap frames aligned 96 max |out-original| on face/hair/skin: 0");
    const v1 = putbackPasses(none);
    expect(v1.ok).toBe(false);
    if (!v1.ok) expect(v1.why).toContain("protects nothing");
    const zero = parsePutbackProof("scene 0-95: his face on 0 of 96 frames\nframes 96 swap frames aligned 96 max |out-original| on face/hair/skin: 0");
    const v2 = putbackPasses(zero);
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.why).toContain("0 of 96 frames in scene 0-95");
    const oneBad = parsePutbackProof("scene 0-47: his face on 48 of 48 frames\nscene 48-95: his face on 0 of 48 frames\nframes 96 swap frames aligned 96 max |out-original| on face/hair/skin: 0");
    expect(putbackPasses(oneBad).ok).toBe(false);
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
    // what decides whether it fits the host is frames x width x height: the approved c033 window fits, 12 s of
    // 1080p at 59.94 does not, and a 4K window must be short or cropped
    expect(240 * 1080 * 1920).toBeLessThan(PUTBACK_LIMITS.maxPixelFrames);
    expect(checkPutbackInput("the original", { seconds: 12, frames: 719, width: 1080, height: 1920 })).toContain("more than this job holds in memory");
    expect(checkPutbackInput("the original", { seconds: 4, frames: 96, width: 3840, height: 2160 })).toContain("Cut a shorter window or crop");
    // only the codecs a camera or the app's own encoders write
    expect(checkPutbackInput("the swap", { ...ok, codec: "h264" })).toBeNull();
    expect(checkPutbackInput("the swap", { ...ok, codec: "mjpeg" })).toContain("mjpeg");
    expect(checkPutbackInput("the swap", { ...ok, codec: "" })).toContain("no known codec");
    // the swap is the Dress output conformed to the take's window: a raw provider file of another length is refused
    expect(checkPutbackPair({ seconds: 4.004 }, { seconds: 4.0 })).toBeNull();
    expect(checkPutbackPair({ seconds: 4.004 }, { seconds: 3.708 })).toContain("not conformed");
  });

  it("the record carries the proof and everything needed to make the result again — and never an approval", () => {
    const plan = planPutback({ preset: "c033_showroom" }, [A, B]);
    if (!plan.ok) throw new Error("expected ok");
    const rec = putbackRecord({ plan: plan.value, proof: parsePutbackProof(PRINTOUT), scriptSha256: "s".repeat(64), inputSha256: { original: "a".repeat(64), swap: "b".repeat(64) }, seconds: 71.2, versions: { python: "3.9.6", ffmpeg: "6.1.1" }, repo: { commit: "a".repeat(40), dirty: false }, output: { frames: 240, width: 1080, height: 1920, seconds: 4.004 } });
    expect(rec).toMatchObject({ proof_max: 0, frames: 240, preset: "c033_showroom", env: { AVT_HEAD_ZOOM: "4" }, original_asset_id: A, swap_asset_id: B, script: "scripts/edit/body_only_swap.py", approved: false, run_seconds: 71.2, face_share: 1, face_low: false });
    // the script is six files, not one; the versions that ran it and the checkout it ran from are on the record
    expect(rec.script_files).toEqual([...PUTBACK_SCRIPT_FILES]);
    expect(PUTBACK_SCRIPT_FILES).toEqual(["body_only_swap.py", "segmenters.py", "swap_rate.py", "face_track.py", "head_fit.py", "silhouette.py"]);
    expect(rec.versions).toEqual({ python: "3.9.6", ffmpeg: "6.1.1" });
    expect(rec.repo).toEqual({ commit: "a".repeat(40), dirty: false });
    expect(rec.model_sha256).toEqual(PUTBACK_MODELS);
    expect(Object.values(PUTBACK_MODELS).every((h) => /^[0-9a-f]{64}$/.test(h))).toBe(true);
  });
});

import { acceptPutbackRecord, claimKinds, isWholeFrameDress, putbackInputItems, swapBinding } from "./putback.ts";

describe("the server's side: what a claimed put-back is handed, and what it may file", () => {
  const U = "33333333-3333-4333-8333-333333333333";
  const P = "44444444-4444-4444-8444-444444444444";
  const plan = (() => {
    const r = planPutback({ preset: "c033_showroom" }, [A, B]);
    if (!r.ok) throw new Error("expected ok");
    return r.value;
  })();
  const row = (id: string, over: Record<string, unknown> = {}) => ({ id, user_id: U, project_id: P, asset_type: "video_clip", file_url: `${U}/${P}/dress/${id}.mp4`, metadata_json: { bucket: "project-clips", ...(id === B ? { derived_from: { asset_id: A, method: "dressed" } } : {}) }, ...over });
  const bucketOf = (r: Record<string, unknown>) => String((r.metadata_json as { bucket?: string })?.bucket ?? "project-clips");
  const buckets = ["project-clips", "project-exports"];

  it("hands over the two files of the job's own project, by bucket and path", () => {
    const r = putbackInputItems(plan, [row(B), row(A)], { userId: U, projectId: P }, bucketOf, buckets);
    expect(r).toEqual({ ok: true, value: { original: { assetId: A, bucket: "project-clips", path: `${U}/${P}/dress/${A}.mp4` }, swap: { assetId: B, bucket: "project-clips", path: `${U}/${P}/dress/${B}.mp4` }, binding: "derived_from" } });
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
    // a file under ANOTHER user's folder of this project (a planted file with a row to match) is refused
    expect(no([row(A, { file_url: `someone-else/${P}/evil.mp4` }), row(B)]).ok).toBe(false);
    expect(no([row(A), row(B, { file_url: `someone-else/${P}/evil.mp4` })]).ok).toBe(false);
  });

  it("the swap must be the Dress output made from the original: reversed, unrelated or raw inputs are refused", () => {
    const job = { userId: U, projectId: P };
    const reversed = planPutback({ preset: "c033_showroom" }, [B, A]);
    if (!reversed.ok) throw new Error("expected ok");
    const r1 = putbackInputItems(reversed.value, [row(A), row(B)], job, bucketOf, buckets);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toContain("does not say it was made from the original");
    // a swap with no record of what it was made from (a raw provider file filed by hand), or made from another take
    expect(putbackInputItems(plan, [row(A), row(B, { metadata_json: { bucket: "project-clips" } })], job, bucketOf, buckets).ok).toBe(false);
    expect(putbackInputItems(plan, [row(A), row(B, { metadata_json: { bucket: "project-clips", derived_from: { asset_id: "55555555-5555-4555-8555-555555555555", method: "dressed" } } })], job, bucketOf, buckets).ok).toBe(false);
    // a creature or prop swap made through the provider call is filed with a declared link to its window
    const declared = putbackInputItems(plan, [row(A), row(B, { metadata_json: { bucket: "project-clips", swap_of: { asset_id: A.toUpperCase() } } })], job, bucketOf, buckets);
    expect(declared.ok).toBe(true);
    if (declared.ok) expect(declared.value.binding).toBe("swap_of");
    // ...and a declaration naming another window is refused like any other
    expect(putbackInputItems(plan, [row(A), row(B, { metadata_json: { bucket: "project-clips", swap_of: { asset_id: "55555555-5555-4555-8555-555555555555" } } })], job, bucketOf, buckets).ok).toBe(false);
    expect(swapBinding({ derived_from: { asset_id: A }, swap_of: { asset_id: A } }, A)).toBe("derived_from");
    expect(swapBinding(null, A)).toBe(null);
  });

  it("knows a whole-frame Dress output from a take and from a put-back", () => {
    expect(isWholeFrameDress({ derived_from: { asset_id: A, method: "dressed", dress: {} } })).toBe(true);
    expect(isWholeFrameDress({ derived_from: { asset_id: A, method: "montage", dress: {} } })).toBe(true);
    expect(isWholeFrameDress({ derived_from: { asset_id: A, method: "dressed", putback: true } })).toBe(false);
    expect(isWholeFrameDress({ derived_from: { asset_id: A, method: "restaged" } })).toBe(false);
    expect(isWholeFrameDress({})).toBe(false);
    expect(isWholeFrameDress(null)).toBe(false);
  });

  it("files only a record whose proof is exactly 0 and that is for this job; unknown fields are dropped", () => {
    const good = putbackRecord({ plan, proof: parsePutbackProof(PRINTOUT), scriptSha256: "c".repeat(64), inputSha256: { original: "a".repeat(64), swap: "b".repeat(64) }, seconds: 60, versions: { python: "3.9.6", numpy: "2.0.2", SHOUTING: "x", ffmpeg: 7 as unknown as string }, repo: { commit: "b".repeat(40), dirty: true }, output: { frames: 240, width: 1080, height: 1920, seconds: 4.004 } });
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
    if (ok.ok) {
      expect(ok.value.versions).toEqual({ python: "3.9.6", numpy: "2.0.2" });
      expect(ok.value.repo).toEqual({ commit: "b".repeat(40), dirty: true });
      expect(ok.value.output).toMatchObject({ frames: 240, width: 1080, height: 1920 });
      expect(ok.value.proof_measured).toContain("not re-run and not re-hashed by the server");
      expect(putbackNote(ok.value)).toContain("measured by the worker on the frames before the final encode");
      const clean = { ...ok.value, repo: { commit: "b".repeat(40), dirty: false } };
      expect(putbackNote(clean)).not.toContain("WARNING");
      expect(putbackNote(clean)).toContain("his face from the take");
      expect(putbackNote(ok.value)).toContain("WARNING: the worker's copy of the script had uncommitted changes");
      expect(putbackNote({ ...clean, face_low: true, face_share: 0.52 })).toContain("WARNING: his face was found on only 52 %");
      // the proof is against the original it was given: a Dress output as the original is said, never "his face"
      const whole = putbackNote({ ...clean, original_is_whole_frame_dress: true });
      expect(whole).toContain("not his own pixels");
      expect(whole).not.toContain("his face from the take");
      expect(putbackNote({ ...clean, binding: "swap_of" })).toContain("declared by whoever filed it");
    }
    for (const bad of [null, [], { ...good, proof_max: 1 }, { ...good, proof_max: "0" }, { ...good, proof_max: null }, { ...good, preset: "hyenas_verse_creature" }, { ...good, swap_asset_id: A }, { ...good, script_sha256: "short" }, { ...good, input_sha256: { original: "a".repeat(64) } }]) {
      expect(acceptPutbackRecord(bad, plan).ok).toBe(false);
    }
    // a record that says it ran other flags or settings than the preset's is refused, never rewritten to look right
    const lied = acceptPutbackRecord({ ...good, args: ["--base", "swap"] }, plan);
    expect(lied.ok).toBe(false);
    if (!lied.ok) expect(lied.error).toContain("did not run preset c033_showroom as it is written");
    expect(acceptPutbackRecord({ ...good, env: { AVT_HEAD_ZOOM: "4", AVT_HEAD_FIT: "1" } }, plan).ok).toBe(false);
    // no frames, no face count, his face on no frame, or a file whose frame count is not the proof's: nothing is filed
    expect(acceptPutbackRecord({ ...good, frames: null }, plan).ok).toBe(false);
    expect(acceptPutbackRecord({ ...good, face_found: [] }, plan).ok).toBe(false);
    expect(acceptPutbackRecord({ ...good, face_found: [{ scene: "0-239", found: 0, of: 240 }] }, plan).ok).toBe(false);
    expect(acceptPutbackRecord({ ...good, output: { frames: 17, width: 1080, height: 1920, seconds: 0.7 } }, plan).ok).toBe(false);
    // a record with no output block states no frame count for the file: refused too
    expect(acceptPutbackRecord({ ...good, output: null }, plan).ok).toBe(false);
    expect(putbackOutputPath(U, P, "job", 2)).toBe(`${U}/${P}/renders/job_a2.mp4`);
    expect(putbackOutputPath(U, P, "job", 0)).toBe(`${U}/${P}/renders/job_a1.mp4`);
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
    const plan = planPutback({ preset: "hyenas_verse_creature" }, [A, B]);
    if (!plan.ok) throw new Error("expected ok");
    expect(queuePutbackArgs("44444444-4444-4444-8444-444444444444", plan.value)).toEqual({ p_project_id: "44444444-4444-4444-8444-444444444444", p_original_asset_id: A, p_swap_asset_id: B, p_preset: "hyenas_verse_creature" });
  });
  it("every preset name is a name the SQL door accepts", () => {
    for (const name of PUTBACK_PRESET_NAMES) expect(name).toMatch(/^[a-z0-9_]{1,40}$/);
    expect(PUTBACK_LIMITS.maxBytes).toBe(1024 * 1024 * 1024);
  });
});
