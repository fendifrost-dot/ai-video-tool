import { describe, expect, it } from "vitest";
import {
  buildDressPrompt,
  composeDressRequest,
  dressBilledSeconds,
  dressCost,
  dressedSongStart,
  dressRecordOf,
  dressReferences,
  dressStaleness,
  dressWindow,
  pieceKind,
  DRESS_BILLING_GUARD,
  DRESS_HEAD_HANDLE,
  DRESS_MAX_REFERENCES,
  DRESS_PROMPT_VERSION,
  DRESS_TAIL_HANDLE,
  type DressPiece,
  type DressRecord,
} from "./dress";

const jacket: DressPiece = {
  id: "0feb028f",
  label: "Saint Laurent Track Jacket, Mastic Cotton Navy Stripe",
  featureType: "wardrobe_outerwear",
  storagePath: "65cf99cb/2a14a72b.jpg",
  images: [
    { storagePath: "65cf99cb/2a14a72b.jpg", angle: "front" },
    { storagePath: "65cf99cb/collar_crop.jpg", angle: "detail" },
  ],
  construction:
    "smooth woven mastic cotton, boxy, cropped; zipped; stand collar with navy lining; one narrow navy chest stripe interrupted by the zip; small gold SAINT LAURENT script on the wearer's left chest; a navy stripe down the underside of each sleeve",
};
const cap: DressPiece = {
  id: "07e6dcbe",
  label: "Saint Laurent Cap in Cotton Gabardine - Beige and Ivory",
  featureType: "wardrobe_accessory",
  storagePath: "caps/front.jpg",
  images: [
    { storagePath: "caps/front.jpg", angle: "front" },
    { storagePath: "caps/detail.jpg", angle: "detail" },
    { storagePath: "caps/side.jpg", angle: "side" },
    { storagePath: "caps/back.jpg", angle: "back" },
  ],
  construction:
    "light beige gabardine cap, soft crown, curved brim, ivory SAINT LAURENT wordmark on the front",
};
const glasses: DressPiece = {
  id: "g1",
  label: "Glasses — Cazal MOD octagonal",
  featureType: "wardrobe_accessory",
  storagePath: "g/front.jpg",
  images: [{ storagePath: "g/front.jpg", angle: "front" }],
  construction: null,
};

describe("the dress window — handles, the 4 s minimum, billed seconds", () => {
  it("a fast-cut 1.75 s shot: minimum handles, then grown to fill the 4 billed seconds, a guard under", () => {
    const r = dressWindow({ shotIn: 72.0, shotOut: 73.75, takeSeconds: 200 });
    if (!r.ok) throw new Error(r.why);
    const w = r.window;
    expect(w.seconds).toBeCloseTo(4 - DRESS_BILLING_GUARD, 4);
    expect(w.billedSeconds).toBe(4);
    expect(w.head).toBeGreaterThanOrEqual(DRESS_HEAD_HANDLE);
    expect(w.tail).toBeGreaterThanOrEqual(DRESS_TAIL_HANDLE);
    // the free extra is split evenly
    expect(w.head - DRESS_HEAD_HANDLE).toBeCloseTo(w.tail - DRESS_TAIL_HANDLE, 4);
    expect(w.start).toBeCloseTo(72.0 - w.head, 4);
    expect(w.end).toBeCloseTo(73.75 + w.tail, 4);
    expect(w.notes).toEqual([]);
  });

  it("a 3.3 s shot needs 4.55 s with handles: 5 billed seconds, filled to 4.95", () => {
    const r = dressWindow({ shotIn: 10, shotOut: 13.3, takeSeconds: 100 });
    if (!r.ok) throw new Error(r.why);
    expect(r.window.billedSeconds).toBe(5);
    expect(r.window.seconds).toBeCloseTo(4.95, 4);
  });

  it("clamps to the take's start and gives the head's share to the tail", () => {
    const r = dressWindow({ shotIn: 0.2, shotOut: 2.0, takeSeconds: 60 });
    if (!r.ok) throw new Error(r.why);
    expect(r.window.start).toBe(0);
    expect(r.window.head).toBeCloseTo(0.2, 4);
    expect(r.window.seconds).toBeCloseTo(3.95, 4);
    expect(r.window.notes[0]).toMatch(/head handle is short/);
  });

  it("clamps to the take's end and says the soft tail may show", () => {
    const r = dressWindow({ shotIn: 57.5, shotOut: 59.8, takeSeconds: 60 });
    if (!r.ok) throw new Error(r.why);
    expect(r.window.end).toBe(60);
    expect(r.window.tail).toBeCloseTo(0.2, 4);
    expect(r.window.seconds).toBeCloseTo(3.95, 4);
    expect(r.window.notes.join(" ")).toMatch(/soft last half-second/);
  });

  it("refuses a take too short for the swap, and a shot too long for one", () => {
    expect(dressWindow({ shotIn: 0.5, shotOut: 2, takeSeconds: 3.2 })).toMatchObject({ ok: false });
    expect(dressWindow({ shotIn: 1, shotOut: 31, takeSeconds: 100 })).toMatchObject({
      ok: false,
      why: expect.stringMatching(/split the shot/),
    });
    expect(dressWindow({ shotIn: 2, shotOut: 2, takeSeconds: 100 })).toMatchObject({ ok: false });
  });

  it("an unknown take length clamps nothing at the end", () => {
    const r = dressWindow({ shotIn: 5, shotOut: 7, takeSeconds: null });
    // 2 s + the minimum handles = 3.25 s; the 0.7 s left of the billed 3.95 s is split 0.35 / 0.35
    expect(r.ok && r.window.end).toBeCloseTo(7 + 0.75 + 0.35, 4);
  });
});

describe("the cost, exactly", () => {
  it("bills every started source second, never under 4", () => {
    expect(dressBilledSeconds(3.95)).toBe(4);
    expect(dressBilledSeconds(4)).toBe(4);
    expect(dressBilledSeconds(4.004)).toBe(5);
    expect(dressBilledSeconds(1.2)).toBe(4);
  });
  it("states the arithmetic", () => {
    expect(dressCost(3.95)).toEqual({
      billedSeconds: 4,
      usd: 2.724,
      text: "4 s × $0.681 = $2.724",
    });
    expect(dressCost(4.95).usd).toBeCloseTo(3.405, 6);
  });
});

describe("the dressed take on the song clock", () => {
  it("its first frame sits where the cut began, through the parent's sync (drift included)", () => {
    expect(dressedSongStart(72.673, { offsetSeconds: 0.853, driftPpm: 0 })).toBeCloseTo(73.526, 4);
    expect(dressedSongStart(100, { offsetSeconds: 2, driftPpm: 50 })).toBeCloseTo(
      100 * 1.00005 + 2,
      4,
    );
  });
});

describe("reference pictures — jacket product photo first, then the hat, then the rest", () => {
  it("reproduces the approved full look: jacket product photo, cap front, side, detail", () => {
    const { sent, notSent } = dressReferences([cap, jacket]);
    expect(sent.map((r) => r.path)).toEqual([
      "65cf99cb/2a14a72b.jpg",
      "caps/front.jpg",
      "caps/side.jpg",
      "caps/detail.jpg",
    ]);
    expect(sent.map((r) => r.role)).toEqual(["product", "product", "angle", "angle"]);
    expect(notSent).toEqual([]);
  });

  it("every piece gets its product photo before any extra angle; the cap is the limit", () => {
    const { sent } = dressReferences([glasses, cap, jacket]);
    expect(sent.map((r) => r.path)).toEqual([
      "65cf99cb/2a14a72b.jpg",
      "caps/front.jpg",
      "caps/side.jpg",
      "g/front.jpg",
    ]);
    expect(sent).toHaveLength(DRESS_MAX_REFERENCES);
  });

  it("a garment never sends its extra crops", () => {
    expect(dressReferences([jacket]).sent.map((r) => r.path)).toEqual(["65cf99cb/2a14a72b.jpg"]);
  });

  it("says which pieces could not go, and why", () => {
    const naked = { ...glasses, id: "x", label: "Belt", storagePath: null, images: [] };
    const many = [
      jacket,
      cap,
      glasses,
      { ...glasses, id: "g2", label: "Chain" },
      { ...glasses, id: "g3", label: "Ring" },
      naked,
    ];
    const { sent, notSent } = dressReferences(many);
    expect(sent).toHaveLength(4);
    expect(notSent).toEqual([
      { pieceId: "g3", label: "Ring", why: "the swap is given at most 4 pictures" },
      { pieceId: "x", label: "Belt", why: "it has no photograph on file" },
    ]);
  });

  it("is deterministic and reads the kind of piece from its type and name", () => {
    expect(dressReferences([cap, jacket])).toEqual(dressReferences([cap, jacket]));
    expect(pieceKind(jacket)).toBe("outerwear");
    expect(pieceKind(cap)).toBe("hat");
    expect(pieceKind(glasses)).toBe("eyewear");
    expect(
      pieceKind({ label: "Coat in Bubbled Lambskin - Noir", featureType: "wardrobe_top" }),
    ).toBe("outerwear");
  });
});

describe("the dress prompt", () => {
  const refs = dressReferences([jacket, cap]).sent;
  const prompt = buildDressPrompt([jacket, cap], refs);

  it("follows the recipe: Replace ONLY …, the construction of each piece, Keep everything else …", () => {
    expect(prompt).toMatch(
      /^Replace ONLY the man's jacket and cap with the exact pieces shown in the reference images: /,
    );
    expect(prompt).toContain(
      "the Saint Laurent Track Jacket, Mastic Cotton Navy Stripe (reference image 1)",
    );
    expect(prompt).toContain(
      "the Saint Laurent Cap in Cotton Gabardine - Beige and Ivory (reference images 2–4)",
    );
    expect(prompt).toContain("one narrow navy chest stripe interrupted by the zip");
    expect(prompt).toContain("ivory SAINT LAURENT wordmark on the front.");
    expect(prompt).toContain(
      "Keep everything else exactly as in the source video: his face, hair, glasses, skin, hands, the rest of his clothes, the room, the lighting, the camera move and his performance timing.",
    );
    expect(prompt).toMatch(/no other change\.$/);
  });

  it("is the same words for the same pieces, and only names pieces that are sent", () => {
    expect(buildDressPrompt([jacket, cap], refs)).toBe(prompt);
    expect(buildDressPrompt([jacket, cap], dressReferences([jacket]).sent)).not.toContain("Cap");
  });

  it("does not ask to keep the glasses when the glasses are a piece", () => {
    const p = buildDressPrompt([glasses], dressReferences([glasses]).sent);
    expect(p).toMatch(/^Replace ONLY the man's glasses/);
    expect(p).not.toContain("hair, glasses");
    expect(p).toContain("exactly as in its reference pictures");
  });

  it("refuses to write words for nothing", () => {
    expect(() => buildDressPrompt([jacket], [])).toThrow(/nothing to dress/);
  });
});

describe("the request", () => {
  it("is the approved object-swap body, through Control Center", () => {
    const req = composeDressRequest({
      prompt: "Replace ONLY …",
      sourceUrl: "https://x/src.mp4",
      referenceUrls: ["https://x/a.jpg"],
      billedSeconds: 4,
      projectId: "p1",
    });
    expect(req).toEqual({
      endpoint: "video-providers-higgsfield-model",
      provider: "higgsfield",
      modelVariant: "genjutsu-object-swap",
      body: {
        mode: "video_to_video",
        modelVariant: "genjutsu-object-swap",
        referenceVideoUrl: "https://x/src.mp4",
        referenceImageUrls: ["https://x/a.jpg"],
        resolution: "720p",
        promptText: "Replace ONLY …",
        duration: 4,
        avt_project_id: "p1",
      },
    });
    expect(() =>
      composeDressRequest({
        prompt: "x",
        sourceUrl: "https://x",
        referenceUrls: [],
        billedSeconds: 4,
        projectId: "p",
      }),
    ).toThrow();
  });
});

describe("current or stale — it only flags", () => {
  const record: Pick<DressRecord, "outfit" | "window" | "sync" | "syncId" | "promptVersion"> = {
    outfit: { id: "o1", key: "mastic", name: "Mastic look", version: 3 },
    window: [71.5, 75.45],
    sync: { offsetSeconds: 0.853, driftPpm: 0 },
    syncId: "s1",
    promptVersion: DRESS_PROMPT_VERSION,
  };
  type Now = Parameters<typeof dressStaleness>[1];
  const outfitNow = { id: "o1", key: "mastic", name: "Mastic look", version: 3 };
  const now: Now = {
    outfit: outfitNow,
    sync: { id: "s1", offsetSeconds: 0.853, driftPpm: 0 },
    shotRange: { start: 72, end: 73.75 },
  };

  it("is current when nothing upstream moved", () => {
    expect(dressStaleness(record, now)).toEqual({ state: "current", reasons: [] });
  });

  it("names each upstream change", () => {
    const codes = (n: Partial<Now>) =>
      dressStaleness(record, { ...now, ...n }).reasons.map((r) => r.code);
    expect(codes({ outfit: { ...outfitNow, version: 4 } })).toEqual(["outfit_version_changed"]);
    expect(codes({ outfit: { id: "o2", key: "coat", name: "Coat look", version: 1 } })).toEqual([
      "outfit_reassigned",
    ]);
    expect(codes({ outfit: null })).toEqual(["outfit_reassigned"]);
    expect(codes({ shotRange: { start: 74.5, end: 76 } })).toEqual(["window_outside"]);
    expect(codes({ shotRange: null })).toEqual(["window_outside"]);
    expect(codes({ sync: { id: "s1", offsetSeconds: 0.9, driftPpm: 0 } })).toEqual([
      "sync_changed",
    ]);
    expect(codes({ sync: { id: "s2", offsetSeconds: 0.853, driftPpm: 0 } })).toEqual([
      "sync_changed",
    ]);
    expect(codes({ sync: null })).toEqual(["sync_changed"]);
    expect(codes({ promptVersion: "dress-v2" })).toEqual(["prompt_version_changed"]);
  });

  it("a shot inside the handles is still covered; a frame's slack is allowed", () => {
    expect(dressStaleness(record, { ...now, shotRange: { start: 71.5, end: 75.46 } }).state).toBe(
      "current",
    );
  });

  it("reads a record back, and refuses a malformed one", () => {
    const full = {
      ...record,
      version: 1,
      sourceAssetId: "t1",
      songStart: 72.353,
      sourceSeconds: 3.95,
    };
    expect(dressRecordOf(full)).toEqual(full);
    expect(dressRecordOf({ ...full, window: [2, 1] })).toBeNull();
    expect(dressRecordOf(null)).toBeNull();
  });
});

describe("what is kept of a provider's answer", () => {
  it("drops every link and every echoed input, keeps the rest", async () => {
    const { scrubEnvelope } = await import("./dress");
    const env = {
      ok: true,
      jobId: "cc_1",
      providerJobId: "hf_1",
      status: "queued",
      resultUrl: null,
      costEstimateCents: 272,
      providerMetadata: {
        status: "queued",
        request_id: "hf_1",
        status_url: "https://platform.higgsfield.ai/requests/hf_1/status",
        input: {
          video_url: "https://signed/project-clips/u/p/dress/src.mp4?token=abc",
          image_urls: ["https://signed/wardrobe-refs/a.jpg?token=def"],
        },
        inputs: [{ url: "https://x/y" }],
        nested: { deep: ["https://a/b", "plain", 3] },
      },
    };
    expect(scrubEnvelope(env)).toEqual({
      ok: true,
      jobId: "cc_1",
      providerJobId: "hf_1",
      status: "queued",
      resultUrl: null,
      costEstimateCents: 272,
      providerMetadata: { status: "queued", request_id: "hf_1", nested: { deep: ["plain", 3] } },
    });
    expect(JSON.stringify(scrubEnvelope(env))).not.toMatch(/https?:/);
    expect(scrubEnvelope(null)).toBeNull();
    expect(scrubEnvelope("https://x")).toBeUndefined();
  });
});

describe("a plain request id", () => {
  it("is required by the import (it ends up in a storage key)", async () => {
    const { planDressImport, DRESS_ID_RE } = await import("./dress");
    const base = {
      projectId: "p",
      variationId: null,
      userId: "u",
      shot: { id: "s", key: "c1" },
      parentTakeId: "t",
      parentSync: { id: "sy", offsetSeconds: 0, driftPpm: 0 },
      window: [1, 5] as [number, number],
      requestId: "71ff19f4-0944-43fa-8371-677c5f9557e8",
      resultUrl: "https://d.cloudfront.net/x.mp4",
      outfit: null,
      references: [],
      prompt: "p",
      promptVersion: "v",
      batchRun: "storyboard",
    };
    expect(() => planDressImport(base)).not.toThrow();
    for (const bad of ["../x", "a/b", "a b", "", "id;drop"])
      expect(() => planDressImport({ ...base, requestId: bad })).toThrow(/plain id/);
    expect(DRESS_ID_RE.test("abc_DEF-123")).toBe(true);
  });
});

describe("one dress at a time", () => {
  const row = (over: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) => ({
    id: "j1",
    status: "running",
    finalized_at: null,
    request_payload_json: {
      shotId: "shot_19",
      settings: {
        route: "genjutsu_swap",
        batchShotId: "c019",
        dress: {
          sourceAssetId: "t",
          window: [71.5, 75.45],
          songStart: 1,
          sourceSeconds: 3.95,
          promptVersion: "dress-v1",
        },
        ...settings,
      },
    },
    ...over,
  });

  it("finds a queued or running dress of the shot, and of the same window when one is given", async () => {
    const { findLiveDressJob } = await import("./dress");
    expect(findLiveDressJob([row()], { shotId: "shot_19" })?.id).toBe("j1");
    expect(findLiveDressJob([row()], { shotKey: "c019" })?.id).toBe("j1");
    expect(findLiveDressJob([row()], { shotId: "shot_19", window: [71.5, 75.45] })?.id).toBe("j1");
    expect(findLiveDressJob([row()], { shotId: "shot_19", window: [71.51, 75.44] })?.id).toBe("j1");
    expect(findLiveDressJob([row()], { shotId: "shot_19", window: [70, 74] })).toBeNull();
    expect(findLiveDressJob([row()], { shotId: "shot_20" })).toBeNull();
  });

  it("ignores finished, failed and other kinds of job", async () => {
    const { findLiveDressJob } = await import("./dress");
    expect(findLiveDressJob([row({ status: "succeeded" })], { shotId: "shot_19" })).toBeNull();
    expect(findLiveDressJob([row({ status: "failed" })], { shotId: "shot_19" })).toBeNull();
    expect(
      findLiveDressJob([row({ finalized_at: "2026-10-15T00:00:00Z" })], { shotId: "shot_19" }),
    ).toBeNull();
    expect(
      findLiveDressJob([row({}, { route: "seedance_ref" })], { shotId: "shot_19" }),
    ).toBeNull();
  });
});

describe("staleness — the whole chain, not only the outfit's version", () => {
  const record = {
    outfit: { id: "o1", key: "mastic", name: "Mastic look", version: 3 },
    window: [71.5, 75.45] as [number, number],
    sync: { offsetSeconds: 0.853, driftPpm: 0 },
    syncId: "s1",
    promptVersion: DRESS_PROMPT_VERSION,
    sourceAssetId: "take_1",
    references: [{ path: "a/jacket.jpg" }, { path: "a/cap_front.jpg" }],
    prompt: "Replace ONLY the man's jacket and cap …",
  };
  const now = {
    outfit: { id: "o1", key: "mastic", name: "Mastic look", version: 3 },
    sync: { id: "s1", offsetSeconds: 0.853, driftPpm: 0 },
    shotRange: { start: 72, end: 73.75 },
    sourceAssetId: "take_1",
    references: [{ path: "a/jacket.jpg" }, { path: "a/cap_front.jpg" }],
    prompt: "Replace ONLY the man's jacket and cap …",
  };
  const codes = (n: Partial<Parameters<typeof dressStaleness>[1]>) =>
    dressStaleness(record, { ...now, ...n }).reasons.map((r) => r.code);

  it("is current when every link holds", () => {
    expect(dressStaleness(record, now).state).toBe("current");
  });

  it("a replaced garment photo, an added or removed piece, flags STALE", () => {
    expect(
      codes({ references: [{ path: "a/jacket_v2.jpg" }, { path: "a/cap_front.jpg" }] }),
    ).toEqual(["references_changed"]);
    expect(codes({ references: [{ path: "a/jacket.jpg" }] })).toEqual(["references_changed"]);
    expect(codes({ references: [{ path: "a/cap_front.jpg" }, { path: "a/jacket.jpg" }] })).toEqual([
      "references_changed",
    ]);
  });

  it("an edited description changes the words: STALE", () => {
    expect(codes({ prompt: "Replace ONLY the man's jacket and cap … with a navy collar" })).toEqual(
      ["prompt_changed"],
    );
  });

  it("a shot now dressed from another take, or none: STALE", () => {
    expect(codes({ sourceAssetId: "take_2" })).toEqual(["take_changed"]);
    expect(codes({ sourceAssetId: null })).toEqual(["take_changed"]);
  });

  it("an outfit rolled BACK to an older version is as stale as one moved forward", () => {
    expect(codes({ outfit: { ...now.outfit, version: 2 } })).toEqual(["outfit_version_changed"]);
    expect(codes({ outfit: { ...now.outfit, version: 4 } })).toEqual(["outfit_version_changed"]);
  });

  it("an imported, approved swap is not aged by the tool's own words, but its pictures still count", () => {
    const imported = {
      ...record,
      imported: { requestId: "r", resultUrl: "https://x" },
      promptVersion: "recipe-71ff19f4",
      prompt: "the recipe's words",
    };
    expect(dressStaleness(imported, now).state).toBe("current");
    expect(
      dressStaleness(imported, { ...now, references: [{ path: "a/jacket_v2.jpg" }] }).reasons.map(
        (r) => r.code,
      ),
    ).toEqual(["references_changed"]);
  });

  it("a caller that does not know the downstream links is not told they changed", () => {
    expect(
      dressStaleness(record, { outfit: now.outfit, sync: now.sync, shotRange: now.shotRange })
        .state,
    ).toBe("current");
  });
});
