/** xAI /v1/videos/edits request body builder — keep shape assertions in tests. */
export function buildGrokVideoEditXaiBody(input: {
  model: string;
  prompt: string;
  videoUrl: string;
  referenceUrls: string[];
}): {
  model: string;
  prompt: string;
  video: { url: string };
  reference_images: Array<{ url: string }>;
} {
  return {
    model: input.model,
    prompt: input.prompt,
    video: { url: input.videoUrl },
    reference_images: input.referenceUrls.map((url) => ({ url })),
  };
}

/** Strip signed-URL query strings so dry-run reports never persist tokens. */
export function redactSignedUrls(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("http")
      ? value.split("?")[0] + (value.includes("?") ? "?<signed>" : "")
      : value;
  }
  if (Array.isArray(value)) return value.map(redactSignedUrls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactSignedUrls(v);
    }
    return out;
  }
  return value;
}

/**
 * project_assets insert for a completed Grok edit.
 * `source_tool` is provider_name — omit it. "grok_video_edit" is not in the enum
 * and silently drops the Review-queue row (assetId null).
 */
export function buildGrokVideoEditAssetInsert(input: {
  userId: string;
  projectId: string;
  videoAssetId: string;
  wardrobeFeatureId: string;
  storedPath: string;
  shotId?: string | null;
  requestId: string;
  model: string;
  actualCostUsd: number | null;
  finalStatus: string;
  byteLength: number | null;
  promptVersion: string;
}): {
  user_id: string;
  project_id: string;
  shot_id: string | null;
  parent_asset_id: string;
  asset_type: "edited_clip";
  file_url: string;
  approval_status: "pending";
  metadata_json: Record<string, unknown>;
} {
  return {
    user_id: input.userId,
    project_id: input.projectId,
    shot_id: input.shotId ?? null,
    parent_asset_id: input.videoAssetId,
    asset_type: "edited_clip",
    file_url: input.storedPath,
    approval_status: "pending",
    metadata_json: {
      bucket: "project-clips",
      mime_type: "video/mp4",
      file_size_bytes: input.byteLength,
      architecture_lane: "architecture_c",
      grok_request_id: input.requestId,
      source_video_asset_id: input.videoAssetId,
      wardrobe_feature_id: input.wardrobeFeatureId,
      model: input.model,
      actual_cost_usd: input.actualCostUsd,
      final_status: input.finalStatus,
      prompt_version: input.promptVersion,
    },
  };
}
