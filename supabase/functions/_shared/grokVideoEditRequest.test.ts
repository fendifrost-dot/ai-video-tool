import { describe, expect, it } from "vitest";
import { pickGrokVideoEditReferencePaths } from "./garmentReference.ts";
import { buildGrokVideoEditAssetInsert, buildGrokVideoEditXaiBody } from "./grokVideoEditRequest.ts";

describe("buildGrokVideoEditXaiBody", () => {
  it("uses struct forms for video and reference_images", () => {
    const body = buildGrokVideoEditXaiBody({
      model: "grok-imagine-video",
      prompt: "test",
      videoUrl: "https://example.com/video.mp4",
      referenceUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    });

    expect(body.video).toEqual({ url: "https://example.com/video.mp4" });
    expect(body.reference_images).toEqual([
      { url: "https://example.com/a.jpg" },
      { url: "https://example.com/b.jpg" },
    ]);
    expect(body.reference_images.every((r) => typeof r === "object" && "url" in r)).toBe(true);
    expect(body.reference_images.some((r) => typeof r === "string")).toBe(false);
  });
});

describe("buildGrokVideoEditAssetInsert", () => {
  it("omits source_tool, parents the source clip, and writes edited_clip", () => {
    const row = buildGrokVideoEditAssetInsert({
      userId: "3ca10935-8c3d-4479-9a0c-8bfe8050840c",
      projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
      videoAssetId: "76fe7438-671d-4428-a7f6-17a45e98c16f",
      wardrobeFeatureId: "0feb028f-dc4d-45dc-82ac-e4bbd16054b0",
      storedPath: "3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-93cd-44f3-905f-292f14ab2f51/grok-video-edit/req.mp4",
      requestId: "944b9875-778e-9443-a9a1-a3bb5fd77d7e",
      model: "grok-imagine-video",
      actualCostUsd: 0.32,
      finalStatus: "done",
      byteLength: 1653727,
      promptVersion: "v2",
    });

    expect(row).not.toHaveProperty("source_tool");
    expect(row.asset_type).toBe("edited_clip");
    expect(row.user_id).toBe("3ca10935-8c3d-4479-9a0c-8bfe8050840c");
    expect(row.project_id).toBe("764a63d2-93cd-44f3-905f-292f14ab2f51");
    expect(row.parent_asset_id).toBe("76fe7438-671d-4428-a7f6-17a45e98c16f");
    expect(row.approval_status).toBe("pending");
    expect(row.metadata_json.prompt_version).toBe("v2");
    expect(row.metadata_json.grok_request_id).toBe("944b9875-778e-9443-a9a1-a3bb5fd77d7e");
  });
});

describe("R4 reference lock", () => {
  it("returns exactly one flat path and never the on-model path", () => {
    const paths = pickGrokVideoEditReferencePaths(
      [
        {
          angle: "on_model",
          label: "on-model YSL model (IMG_5541)",
          storage_path:
            "65cf99cb-fd18-4168-b9ab-dfbfd42112ca/8d4a4d22-41c0-43ab-ba99-92750f81e335/onmodel_img5541_1782258480.png",
        },
        {
          angle: "front",
          storage_path:
            "65cf99cb-fd18-4168-b9ab-dfbfd42112ca/8d4a4d22-41c0-43ab-ba99-92750f81e335/2a14a72b-e7de-4ecb-9c24-4142b672d175.jpg",
        },
      ],
      "65cf99cb-fd18-4168-b9ab-dfbfd42112ca/8d4a4d22-41c0-43ab-ba99-92750f81e335/onmodel_img5541_1782258480.png",
      1,
    );
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain("2a14a72b-e7de-4ecb-9c24-4142b672d175.jpg");
    expect(paths.some((p) => p.includes("onmodel"))).toBe(false);
  });
});
