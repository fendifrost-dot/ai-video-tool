import { describe, expect, it } from "vitest";
import { pickGrokVideoEditReferencePaths } from "./garmentReference.ts";
import {
  buildGrokVideoEditAssetInsert,
  buildGrokVideoEditXaiBody,
  DRY_RUN_PROMPT_PLACEHOLDER,
  redactSignedUrls,
  resolveGrokEditPrompt,
} from "./grokVideoEditRequest.ts";

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

describe("redactSignedUrls", () => {
  it("strips query tokens from the dry-run envelope and keeps the V2 prompt", () => {
    const redacted = redactSignedUrls({
      prompt: "Keep this text",
      video: { url: "https://storage.example/source.mp4?token=secret" },
      reference_images: [{ url: "https://storage.example/flat.jpg?token=secret" }],
    }) as {
      prompt: string;
      video: { url: string };
      reference_images: Array<{ url: string }>;
    };
    expect(redacted.prompt).toBe("Keep this text");
    expect(redacted.video.url).toBe("https://storage.example/source.mp4?<signed>");
    expect(redacted.reference_images[0].url).toBe("https://storage.example/flat.jpg?<signed>");
    expect(JSON.stringify(redacted)).not.toContain("token=secret");
  });
});

describe("resolveGrokEditPrompt (the billing gate)", () => {
  it("the request's prompt wins, with the request's version", () => {
    expect(resolveGrokEditPrompt({ requestPrompt: " P ", lookBasePrompt: "L", requestVersion: "v2", lookVersion: "v5" })).toEqual({ ok: true, prompt: "P", source: "request", version: "v2" });
  });
  it("uses the Look's prompt and the Look's version when the request has none", () => {
    expect(resolveGrokEditPrompt({ requestPrompt: "", lookBasePrompt: " L ", requestVersion: "v2", lookVersion: "v5" })).toEqual({ ok: true, prompt: "L", source: "look", version: "v5" });
  });
  it("a whitespace-only prompt counts as missing", () => {
    expect(resolveGrokEditPrompt({ requestPrompt: "   ", lookBasePrompt: "L" })).toMatchObject({ ok: true, source: "look" });
    expect(resolveGrokEditPrompt({ requestPrompt: "   ", lookBasePrompt: "  " })).toEqual({ ok: false, error: "prompt_required" });
  });
  it("refuses a billed run with neither prompt", () => {
    expect(resolveGrokEditPrompt({})).toEqual({ ok: false, error: "prompt_required" });
  });
  it("a dry run with neither prompt gets the placeholder, never a billed call", () => {
    expect(resolveGrokEditPrompt({ dryRun: true })).toEqual({ ok: true, prompt: DRY_RUN_PROMPT_PLACEHOLDER, source: "none", version: "unspecified" });
  });
});

describe("buildGrokVideoEditAssetInsert — reproducibility fields", () => {
  const base = { userId: "u", projectId: "p", videoAssetId: "v", wardrobeFeatureId: "w", storedPath: "s.mp4", requestId: "r", model: "m", actualCostUsd: 0.32, finalStatus: "done", byteLength: 1, promptVersion: "v5" };
  it("records the prompt source, the exact prompt and the reference files", () => {
    const row = buildGrokVideoEditAssetInsert({ ...base, promptSource: "look", composedPrompt: "THE JACKET IS ZIPPED.", referenceFiles: ["a.png", "b.png"] });
    expect(row.metadata_json.prompt_source).toBe("look");
    expect(row.metadata_json.prompt).toBe("THE JACKET IS ZIPPED.");
    expect(row.metadata_json.reference_files).toEqual(["a.png", "b.png"]);
  });
  it("leaves today's row shape unchanged when they are not given", () => {
    const row = buildGrokVideoEditAssetInsert(base);
    expect("prompt_source" in row.metadata_json).toBe(false);
    expect("prompt" in row.metadata_json).toBe(false);
    expect("reference_files" in row.metadata_json).toBe(false);
  });
});
