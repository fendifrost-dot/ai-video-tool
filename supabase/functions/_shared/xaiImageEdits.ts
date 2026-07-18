const XAI_EDITS_URL = "https://api.x.ai/v1/images/edits";

export type XaiImageInput = { url: string; type: "image_url" };

export type XaiImageEditsRequest = {
  apiKey: string;
  model: string;
  prompt: string;
  images: XaiImageInput[];
  responseFormat?: "url" | "b64_json";
  /** Optional xAI output resolution ("1k" | "2k"). When omitted, the request
   *  body is byte-identical to before — xAI returns its native default size.
   *  Only forwarded when explicitly set, so existing callers are unaffected. */
  resolution?: string;
  /** Hard timeout for the xAI edit call (ms). Keeps the background task from
   *  hanging past the edge wall limit, which would leave the look row stuck
   *  "pending" forever (catch never runs if the worker is killed mid-fetch). */
  timeoutMs?: number;
  /** Hard timeout for downloading the resulting image URL (ms). */
  downloadTimeoutMs?: number;
};

/** fetch() with an AbortController-based hard timeout. */
async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      throw new Error(`${label}_timeout_${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function decodeBase64Image(b64: string): Uint8Array {
  const raw = b64.includes(",") ? b64.split(",")[1]! : b64;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extractFromBody(body: Record<string, unknown>): { url?: string; b64?: string } {
  const data = body?.data as Array<{ url?: string; b64_json?: string }> | undefined;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0]!;
    if (typeof first.url === "string" && first.url.startsWith("http")) {
      return { url: first.url };
    }
    if (typeof first.b64_json === "string" && first.b64_json.length > 0) {
      return { b64: first.b64_json };
    }
  }
  const image = body?.image as { url?: string } | undefined;
  if (typeof image?.url === "string" && image.url.startsWith("http")) {
    return { url: image.url };
  }
  return {};
}

/** Call xAI multi-image edit; returns raw image bytes. */
export async function callXaiImageEdits(
  req: XaiImageEditsRequest,
): Promise<Uint8Array> {
  const resp = await fetchWithTimeout(
    XAI_EDITS_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${req.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        prompt: req.prompt,
        images: req.images,
        response_format: req.responseFormat ?? "url",
        // Only present when a caller opts in — keeps default behaviour identical.
        ...(req.resolution ? { resolution: req.resolution } : {}),
      }),
    },
    req.timeoutMs ?? 90_000,
    "xai_edits",
  );

  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      `xai_edits_failed: ${resp.status} ${JSON.stringify(body).slice(0, 300)}`,
    );
  }

  const extracted = extractFromBody(body as Record<string, unknown>);
  if (extracted.url) {
    const dl = await fetchWithTimeout(
      extracted.url,
      { headers: { Accept: "image/*" } },
      req.downloadTimeoutMs ?? 30_000,
      "xai_download",
    );
    if (!dl.ok) throw new Error(`xai_download_${dl.status}`);
    return new Uint8Array(await dl.arrayBuffer());
  }
  if (extracted.b64) return decodeBase64Image(extracted.b64);
  throw new Error("xai_no_image_in_response");
}
