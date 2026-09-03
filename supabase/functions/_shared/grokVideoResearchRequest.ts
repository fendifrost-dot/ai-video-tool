/**
 * Endpoint-specific xAI body builders for grok-video-research-proxy.
 *
 * Do not share these shapes across /videos/edits and /videos/generations.
 * Evidence:
 *   - /videos/edits requires `video: { url }` (P2 rejected `video_url`;
 *     P2_corrected accepted `video` + reference_images). Official docs agree.
 *   - /videos/generations documents `image: { url }` and
 *     `reference_images: [{ url }]` (xAI REST, fetched 2026-08-30).
 */

export function buildResearchEditVideoBody(input: {
  model: string;
  prompt: string;
  videoUrl: string;
  referenceUrls?: string[];
  resolution?: string;
}): {
  model: string;
  prompt: string;
  video: { url: string };
  reference_images?: Array<{ url: string }>;
  resolution?: string;
} {
  const body: {
    model: string;
    prompt: string;
    video: { url: string };
    reference_images?: Array<{ url: string }>;
    resolution?: string;
  } = {
    model: input.model,
    prompt: input.prompt,
    video: { url: input.videoUrl },
  };
  if (input.referenceUrls && input.referenceUrls.length > 0) {
    body.reference_images = input.referenceUrls.map((url) => ({ url }));
  }
  if (input.resolution) body.resolution = input.resolution;
  return body;
}

export function buildResearchReferenceToVideoBody(input: {
  model: string;
  prompt: string;
  referenceUrls: string[];
  duration: number;
  aspectRatio?: string;
  resolution?: string;
}): {
  model: string;
  prompt: string;
  duration: number;
  aspect_ratio: string;
  resolution: string;
  reference_images: Array<{ url: string }>;
} {
  return {
    model: input.model,
    prompt: input.prompt,
    duration: input.duration,
    aspect_ratio: input.aspectRatio ?? "9:16",
    resolution: input.resolution ?? "720p",
    reference_images: input.referenceUrls.map((url) => ({ url })),
  };
}

export function buildResearchImageToVideoBody(input: {
  model: string;
  prompt: string;
  imageUrl: string;
  duration: number;
  aspectRatio?: string;
  resolution?: string;
}): {
  model: string;
  prompt: string;
  image: { url: string };
  duration: number;
  aspect_ratio: string;
  resolution: string;
} {
  return {
    model: input.model,
    prompt: input.prompt,
    image: { url: input.imageUrl },
    duration: input.duration,
    aspect_ratio: input.aspectRatio ?? "9:16",
    resolution: input.resolution ?? "720p",
  };
}
