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
