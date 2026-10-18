import { describe, expect, it } from "vitest";
import {
  assertPlanSafe,
  emptySequence,
  planRender,
  type EditClip,
} from "../../../supabase/functions/_shared/editModel";
import {
  applyProbes,
  assertMediaUrls,
  isFiledDefaultDuration,
  renderPlanFor,
  resolveSequenceMedia,
  storageSignUrlOk,
  trustedDuration,
  type StoredAsset,
} from "../../../supabase/functions/_shared/editMedia";

const PROJECT = "764a63d2-93cd-44f3-905f-292f14ab2f51";
const UID = "3ca10935-8c3d-4479-9a0c-8bfe8050840c";
const PICTURE = "44e1adc7-965b-420c-987e-4ce344687f55";
const PENDING = "21b9e18a-abcc-4faa-b08d-bdf4647aea07";
const SONG = "067a4cbf-6fd0-4601-9111-df1119c52fa6";

function picture(partial: Partial<EditClip> & Pick<EditClip, "id" | "name">): EditClip {
  return {
    track: "V1",
    order: 0,
    shotId: null,
    shotKey: null,
    assetId: null,
    fileName: null,
    sourceIn: 0,
    sourceOut: 1,
    timelineIn: 0,
    timelineOut: 1,
    speed: 1,
    transition: "cut",
    transitionSeconds: 0,
    labelColor: null,
    placeholder: false,
    comment: "",
    enabled: true,
    mediaDuration: 97 / 24,
    mouth: null,
    ...partial,
  };
}

function asset(partial: Partial<StoredAsset> & Pick<StoredAsset, "id" | "file_url">): StoredAsset {
  return {
    project_id: PROJECT,
    asset_type: "generated_clip",
    metadata_json: { bucket: "project-clips", duration_seconds: 4 },
    ...partial,
  };
}

function sequence() {
  const seq = emptySequence({
    projectId: PROJECT,
    name: "cold",
    id: "2976b498-3e8d-4795-8509-f203dd811916",
  });
  seq.songAssetId = SONG;
  seq.songOffset = 13.791667;
  seq.songFile = "song_master_24bit.wav";
  seq.songDuration = 201.833333;
  seq.clips = [
    picture({
      id: "c-real",
      name: "c008 b-roll",
      assetId: PICTURE,
      fileName: "c008.mp4",
      sourceIn: 0,
      sourceOut: 1.25,
      timelineIn: 0,
      timelineOut: 1.25,
    }),
    picture({
      id: "c-pending-file",
      name: "LIPSYNC PENDING c009",
      assetId: PENDING,
      fileName: "c009.mp4",
      placeholder: true,
      sourceIn: 0,
      sourceOut: 4.5,
      timelineIn: 1.25,
      timelineOut: 5.75,
    }),
    picture({
      id: "c-slate",
      name: "LIPSYNC PENDING c010",
      placeholder: true,
      fileName: "missing.mp4",
      timelineIn: 5.75,
      timelineOut: 6.75,
    }),
  ];
  return seq;
}

function rows(): StoredAsset[] {
  return [
    asset({ id: PICTURE, file_url: `${UID}/${PROJECT}/c008.mp4` }),
    asset({
      id: PENDING,
      file_url: `${UID}/${PROJECT}/c009.mp4`,
      metadata_json: { bucket: "project-clips", duration_seconds: 97 / 24 },
    }),
    asset({
      id: SONG,
      asset_type: "audio",
      file_url: `${UID}/${PROJECT}/song.wav`,
      metadata_json: { duration_seconds: 201.874313, mime_type: "audio/wav" },
    }),
  ];
}

function sign(bucket: string, path: string): string {
  return `https://qoyxgnkvjukovkrvdaiq.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=test`;
}

describe("edit media resolution", () => {
  it("treats 4 s and 97/24 as the filing default, and keeps a measured length", () => {
    expect(isFiledDefaultDuration(4)).toBe(true);
    expect(isFiledDefaultDuration(97 / 24)).toBe(true);
    expect(trustedDuration(4)).toBeNull();
    expect(trustedDuration(97 / 24)).toBeNull();
    expect(trustedDuration(201.874313)).toBeCloseTo(201.874313, 5);
  });

  it("resolves picture files and the song, and leaves a pending clip with no file as a slate", () => {
    const resolved = resolveSequenceMedia(sequence(), rows());
    expect(resolved.pictures.map((item) => item.assetId)).toEqual([PICTURE, PENDING]);
    expect(resolved.pictures[0]?.durationSeconds).toBeNull();
    expect(resolved.pictures[1]?.placeholder).toBe(true);
    expect(resolved.pictures[1]?.bucket).toBe("project-clips");
    expect(resolved.song?.bucket).toBe("project-audio");
    expect(resolved.song?.durationSeconds).toBeCloseTo(201.874313, 5);
    expect(resolved.song?.sourceIn).toBeCloseTo(13.791667, 5);
    expect(resolved.slate.map((row) => row.clipId)).toEqual(["c-slate"]);
    expect(resolved.missing).toEqual([]);
  });

  it("refuses a file that is not in this project's folder", () => {
    const foreign = rows();
    foreign[0] = { ...foreign[0]!, project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    const resolved = resolveSequenceMedia(sequence(), foreign);
    expect(resolved.pictures.map((item) => item.assetId)).toEqual([PENDING]);
    expect(resolved.missing.map((row) => row.reason)).toContain("wrong_project");
  });

  it("plans real trims and the song offset, and does not put a URL on the ffmpeg command", () => {
    const seq = sequence();
    const resolved = resolveSequenceMedia(seq, rows());
    const urls = {
      [PICTURE]: sign("project-clips", resolved.pictures[0]!.path),
      [PENDING]: sign("project-clips", resolved.pictures[1]!.path),
      [SONG]: sign("project-audio", resolved.song!.path),
    };
    const plan = renderPlanFor(seq, resolved, urls, { kind: "proxy", aspect: "9:16" });
    assertPlanSafe(plan);
    assertMediaUrls(plan);
    expect(plan.costUsd).toBe(0);
    expect(plan.billable).toBe(false);
    expect(plan.providers).toEqual([]);
    expect(plan.inputs.realCount).toBe(2);
    expect(plan.inputs.song).toBe(true);
    expect(plan.inputs.slate).toHaveLength(1);
    expect(plan.inputs.missing).toEqual([]);
    const argv = plan.argv.join(" ");
    expect(argv).not.toMatch(/https?:/);
    expect(argv).toContain(`avt-media/${PICTURE}.bin`);
    expect(argv).toContain(`avt-song/${SONG}.bin`);
    expect(argv).toContain("trim=start=0.000:end=1.250");
    expect(argv).toContain("trim=start=0.000:end=4.500");
    expect(argv).toContain("atrim=start=13.792:end=");
    expect(argv).toContain("color=");
    expect(plan.inputs.items.find((item) => item.assetId === PICTURE)?.url).toBe(urls[PICTURE]);
  });

  it("clamps a source out to an ffprobe duration and ignores the 4.04 s default", () => {
    const seq = sequence();
    const resolved = resolveSequenceMedia(seq, rows());
    const urls = {
      [PICTURE]: sign("project-clips", `${UID}/${PROJECT}/c008.mp4`),
      [PENDING]: sign("project-clips", `${UID}/${PROJECT}/c009.mp4`),
      [SONG]: sign("project-audio", `${UID}/${PROJECT}/song.wav`),
    };
    const unclamped = renderPlanFor(seq, resolved, urls);
    expect(unclamped.argv.join(" ")).toContain("trim=start=0.000:end=4.500");
    const probed = applyProbes(resolved, { [PENDING]: 4 });
    expect(probed.pictures.find((item) => item.assetId === PENDING)?.durationSeconds).toBe(4);
    const plan = renderPlanFor(seq, resolved, urls, { probes: { [PENDING]: 4 } });
    expect(plan.argv.join(" ")).toContain("trim=start=0.000:end=4.000");
    expect(plan.warnings.some((warning) => warning.includes("clamped"))).toBe(true);
  });

  it("accepts only this project's signed storage URLs", () => {
    const path = `${UID}/${PROJECT}/c008.mp4`;
    expect(storageSignUrlOk(sign("project-clips", path))).toBe(true);
    expect(storageSignUrlOk(sign("project-audio", path))).toBe(true);
    expect(storageSignUrlOk("https://fal.ai/files/a.mp4")).toBe(false);
    expect(
      storageSignUrlOk(
        `http://qoyxgnkvjukovkrvdaiq.supabase.co/storage/v1/object/sign/project-clips/${path}`,
      ),
    ).toBe(false);
    expect(storageSignUrlOk(sign("project-clips", `${UID}/${PROJECT}/../secret.mp4`))).toBe(false);
    const seq = sequence();
    const plan = planRender(seq);
    plan.argv.push("https://fal.ai/files/a.mp4");
    expect(() => assertPlanSafe(plan)).toThrow(/remote/);
    const resolved = resolveSequenceMedia(seq, rows());
    const good = renderPlanFor(seq, resolved, {
      [PICTURE]: sign("project-clips", `${UID}/${PROJECT}/c008.mp4`),
      [PENDING]: sign("project-clips", `${UID}/${PROJECT}/c009.mp4`),
      [SONG]: sign("project-audio", `${UID}/${PROJECT}/song.wav`),
    });
    good.inputs.items[0]!.url = "https://fal.ai/files/a.mp4";
    expect(() => assertMediaUrls(good)).toThrow(/storage/);
  });
});
