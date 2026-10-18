import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOUTH_GUIDANCE,
  applyPerformanceProvenance,
  historyLine,
  importEdlCsv,
  mediaWarnings,
  replaceTake,
  resolvePerformance,
  sequenceFromRows,
  sequenceToRows,
  videoClips,
  YSL_PROJECT_ID,
  YSL_VARIATION_ID,
  type ProvenanceAsset,
  type ProvenanceJob,
} from "../../../supabase/functions/edit-render/model";

// Shapes copied from the YSL project's real rows (ids shortened): the camera take 70304981, its dress 1bee4569,
// the Seedance montage f6ac996b made from the dress, and a world b-roll 44e1adc7 with no performer source.
const take: ProvenanceAsset = {
  id: "take",
  asset_type: "reference_video",
  footage_role: "performance",
  source_tool: "manual",
  metadata_json: { mime_type: "video/mp4" },
};
const dressed: ProvenanceAsset = {
  id: "dressed",
  asset_type: "generated_clip",
  footage_role: "performance",
  source_tool: "higgsfield",
  metadata_json: {
    provider_job_id: "job-dress",
    derived_from: { asset_id: "take", method: "dressed", dress: { outfit: { name: "YSL denim look" } } },
  },
};
const montage: ProvenanceAsset = {
  id: "montage",
  asset_type: "generated_clip",
  footage_role: "performance",
  source_tool: "higgsfield",
  metadata_json: { provider_job_id: "job-montage", derived_from: { asset_id: "dressed", method: "montage" } },
};
// a later shoe fix on the montage (dress-clip): filed as method "dressed" with no sourceMethod — only the chain says it was generated
const shoeFix: ProvenanceAsset = {
  id: "shoe",
  asset_type: "generated_clip",
  footage_role: "performance",
  source_tool: "higgsfield",
  metadata_json: { derived_from: { asset_id: "montage", method: "dressed", dress: { outfit: { name: "Prada sneakers" } } } },
};
// the same fix as jobProgress files it today: method "montage" carried over, with the dress record
const shoeFixFiled: ProvenanceAsset = {
  id: "shoe2",
  asset_type: "generated_clip",
  footage_role: "performance",
  source_tool: "higgsfield",
  metadata_json: { derived_from: { asset_id: "montage", method: "montage", dress: { sourceMethod: "montage" } } },
};
const lipsynced: ProvenanceAsset = {
  id: "lipsync",
  asset_type: "generated_clip",
  footage_role: "performance",
  source_tool: "fal",
  metadata_json: {
    derived_from: { asset_id: "montage", method: "montage", lipsync: { model: "fal-ai/sync-lipsync", sourceMethod: "montage" } },
  },
};
const dressedTakeLipsync: ProvenanceAsset = {
  id: "lipsync-on-dress",
  asset_type: "generated_clip",
  footage_role: "performance",
  source_tool: "fal",
  metadata_json: { provider_job_id: "job-ls" },
};
const broll: ProvenanceAsset = {
  id: "broll",
  asset_type: "generated_clip",
  footage_role: null,
  source_tool: "higgsfield",
  metadata_json: { provider_job_id: "job-world" },
};
const bare: ProvenanceAsset = { id: "bare", asset_type: "generated_clip", footage_role: null, source_tool: null, metadata_json: {} };
const orphanDress: ProvenanceAsset = {
  id: "orphan",
  asset_type: "generated_clip",
  footage_role: "performance",
  source_tool: "higgsfield",
  metadata_json: { derived_from: { asset_id: "gone", method: "dressed", dress: {} } },
};
const noMethod: ProvenanceAsset = {
  id: "nomethod",
  asset_type: "generated_clip",
  footage_role: "performance",
  source_tool: "higgsfield",
  metadata_json: { derived_from: { asset_id: "take" } },
};

const assets = new Map(
  [take, dressed, montage, shoeFix, shoeFixFiled, lipsynced, dressedTakeLipsync, broll, bare, orphanDress, noMethod].map((a) => [a.id, a]),
);
const jobs = new Map<string, ProvenanceJob>([
  ["job-world", { id: "job-world", settings: { route: "seedance_ref", kind: "world", variant: { broll: true } } }],
  ["job-montage", { id: "job-montage", settings: { route: "seedance_ref", kind: "angle", sourceAssetId: "dressed", variant: { version: "montage-v4" } } }],
  ["job-ls", { id: "job-ls", settings: { route: "lipsync", sourceAssetId: "dressed", lipsync: { sourceMethod: "dressed" } } }],
]);
const mouth = (id: string | null) => resolvePerformance(id, assets, jobs).mouth;

describe("performance provenance follows how the picture was made", () => {
  it("original camera footage is a recorded performance", () => {
    expect(mouth("take")).toBe("camera");
  });

  it("a clothing-only edit of a take stays recorded, with its edit history kept", () => {
    const p = resolvePerformance("dressed", assets, jobs);
    expect(p.mouth).toBe("camera");
    expect(p.history.map((h) => h.step)).toEqual(["camera", "dressed"]);
    expect(historyLine(p.history)).toBe("camera take → clothing edit (YSL denim look)");
  });

  it("a Seedance montage is a generated performance", () => {
    expect(mouth("montage")).toBe("model");
  });

  it("a shoe fix over a Seedance montage is still a generated performance (lineage)", () => {
    const p = resolvePerformance("shoe", assets, jobs);
    expect(p.mouth).toBe("model");
    expect(p.history.map((h) => h.step)).toEqual(["camera", "dressed", "montage", "dressed"]);
    expect(mouth("shoe2")).toBe("model");
  });

  it("a generative lip-sync output is modified mouth movement, over a montage or a dressed take", () => {
    expect(mouth("lipsync")).toBe("lipsync");
    // no derived_from on the asset: the job's sourceAssetId and lipsync record carry the chain
    const p = resolvePerformance("lipsync-on-dress", assets, jobs);
    expect(p.mouth).toBe("lipsync");
    expect(p.history.map((h) => h.step)).toEqual(["camera", "dressed", "lipsync"]);
  });

  it("missing or ambiguous provenance is unknown, never camera", () => {
    expect(mouth("bare")).toBe("unknown");
    expect(mouth("not-in-project")).toBe("unknown");
    expect(mouth(null)).toBe("unknown");
    expect(mouth("nomethod")).toBe("unknown");
    // a clothing edit whose parent cannot be read: recorded is not assumed
    expect(mouth("orphan")).toBe("unknown");
  });

  it("generated b-roll with no performer source is not a performance picture", () => {
    expect(mouth("broll")).toBeNull();
  });

  it("a cycle in the chain is unknown", () => {
    const loop = new Map<string, ProvenanceAsset>([
      ["a", { id: "a", metadata_json: { derived_from: { asset_id: "b", method: "dressed", dress: {} } } }],
      ["b", { id: "b", metadata_json: { derived_from: { asset_id: "a", method: "dressed", dress: {} } } }],
    ]);
    expect(resolvePerformance("a", loop).mouth).toBe("unknown");
  });
});

const csv = readFileSync(resolve("src/lib/editor/__fixtures__/edl_v1_coldopen.csv"), "utf8");
function coldOpen() {
  return importEdlCsv(csv, { projectId: YSL_PROJECT_ID, variationId: YSL_VARIATION_ID, name: "cold" });
}

describe("the Cut labels by history, not by lip-sync-pending status", () => {
  it("an imported EDL row is unknown until its asset is read — a pending row is never camera", () => {
    const video = videoClips(coldOpen());
    expect(video.every((c) => c.mouth === "unknown")).toBe(true);
  });

  it("a lip-sync-pending placeholder on a montage asset reads as generated", () => {
    const seq = coldOpen();
    const pending = videoClips(seq).find((c) => c.placeholder)!;
    const withAsset = { ...seq, clips: seq.clips.map((c) => (c.id === pending.id ? { ...c, assetId: "montage" } : c)) };
    const { sequence } = applyPerformanceProvenance(withAsset, assets, jobs);
    const c = sequence.clips.find((x) => x.id === pending.id)!;
    expect(c.placeholder).toBe(true);
    expect(c.mouth).toBe("model");
  });

  it("the guidance is neutral and exact", () => {
    expect(MOUTH_GUIDANCE.model).toBe("Generated performance — check mouth timing.");
    const seq = coldOpen();
    const first = videoClips(seq)[0]!;
    const labelled = applyPerformanceProvenance(
      { ...seq, clips: seq.clips.map((c) => (c.id === first.id ? { ...c, assetId: "shoe" } : c)) },
      assets,
      jobs,
    ).sequence;
    const w = mediaWarnings(labelled).find((x) => x.clipId === first.id && /performance/.test(x.message));
    expect(w?.message).toBe(`${first.name}: Generated performance — check mouth timing.`);
    for (const text of Object.values(MOUTH_GUIDANCE)) expect(text).not.toMatch(/cannot|can't|won't|will not|unusable|disable/i);
  });

  it("replacing a take resets the label to unknown until the new asset is read", () => {
    const seq = applyPerformanceProvenance(
      { ...coldOpen(), clips: coldOpen().clips.map((c) => (c.id === "v-1" ? { ...c, assetId: "take" } : c)) },
      assets,
      jobs,
    ).sequence;
    expect(seq.clips.find((c) => c.id === "v-1")!.mouth).toBe("camera");
    const next = replaceTake(seq, "v-1", { assetId: "montage", fileName: "m.mp4" });
    expect(next.clips.find((c) => c.id === "v-1")!.mouth).toBe("unknown");
  });

  it("stored labels round-trip, including lipsync and unknown", () => {
    const rows = [
      { id: "1", track: "V1", source_in_seconds: 0, source_out_seconds: 1, timeline_in_seconds: 0, timeline_out_seconds: 1, mouth: "lipsync" },
      { id: "2", track: "V1", source_in_seconds: 0, source_out_seconds: 1, timeline_in_seconds: 1, timeline_out_seconds: 2, mouth: "unknown" },
      { id: "3", track: "V1", source_in_seconds: 0, source_out_seconds: 1, timeline_in_seconds: 2, timeline_out_seconds: 3, mouth: "bogus" },
    ];
    const seq = sequenceFromRows({ id: "s", project_id: "p", fps: 24 }, rows, []);
    expect(seq.clips.map((c) => c.mouth)).toEqual(["lipsync", "unknown", null]);
  });
});

describe("backfill invariance: relabelling changes the label and nothing else", () => {
  const TIMING_KEYS = [
    "id",
    "sequence_id",
    "track",
    "item_order",
    "shot_id",
    "asset_id",
    "shot_key",
    "name",
    "file_name",
    "source_in_seconds",
    "source_out_seconds",
    "timeline_in_seconds",
    "timeline_out_seconds",
    "speed",
    "transition",
    "transition_seconds",
    "label_color",
    "placeholder",
    "comment",
    "enabled",
    "media_duration_seconds",
  ];
  it("every column but mouth is identical row for row", () => {
    const ids = ["take", "dressed", "montage", "shoe", "lipsync", "broll", "bare", "orphan"];
    const base = coldOpen();
    const seq = {
      ...base,
      id: "00000000-0000-4000-8000-000000000001",
      clips: base.clips.map((c, i) => ({
        ...c,
        id: `00000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`,
        assetId: c.track === "V1" ? ids[i % ids.length]! : c.assetId,
      })),
    };
    const before = sequenceToRows(seq, "u").clips;
    const { sequence } = applyPerformanceProvenance(seq, assets, jobs);
    const after = sequenceToRows(sequence, "u").clips;
    expect(after).toHaveLength(before.length);
    let changed = 0;
    for (const [i, b] of before.entries()) {
      const a = after[i]!;
      for (const k of TIMING_KEYS) expect(a[k]).toEqual(b[k]);
      if (a.mouth !== b.mouth) changed++;
    }
    expect(changed).toBeGreaterThan(0);
    // a second pass changes nothing (idempotent)
    expect(applyPerformanceProvenance(sequence, assets, jobs).sequence).toEqual(sequence);
  });
});
