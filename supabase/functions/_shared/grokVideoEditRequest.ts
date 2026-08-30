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
