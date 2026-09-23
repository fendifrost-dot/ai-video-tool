// Control Center client — the one way an AVT edge function reaches Control Center.
//
// WHY THIS IS A DIRECT CROSS-PROJECT CALL
// ---------------------------------------
// Control Center is a SEPARATE Supabase project, so this is an ordinary outbound request.
// It deliberately does NOT hop through AVT's own `proxy-provider-call`.
//
// `proxy-provider-call` exists for the BROWSER: it keeps AVT_PROXY_KEY out of the client
// bundle and verifies the caller's JWT. An edge function calling it would be a synchronous
// same-project edge→edge invocation — the AVT runtime answering its own gateway mid-request.
// PR #161 introduced the first such hop and every valid request died with a bare 503 and no
// CORS headers: the gateway answering for a worker that was killed, which no try/catch in the
// caller can intercept. Nothing else in this repo does that. Every other function that reaches
// Control Center (`ingest-provider-job`, `proxy-provider-call` itself) calls the CC project
// directly, and the same-project `/functions/v1/` URLs elsewhere are callback addresses handed
// to a remote service, not calls made during a request.
//
// WHAT THIS DOES NOT CHANGE
// -------------------------
// The credential boundary is untouched: provider keys (RUNWAY_API_KEY, FAL_KEY) live in
// Control Center and never in AVT. AVT_PROXY_KEY is not a provider credential — it is AVT's
// own shared secret with Control Center, and it already lives in `proxy-provider-call` and
// `ingest-provider-job`. Centralising the hop here keeps one implementation rather than one
// caller.

const CORS_SAFE_TIMEOUT_MS = 180_000;

export type ControlCenterCall = {
  /** Control Center function name, e.g. "video-providers-runway-video-edit". */
  endpoint: string;
  method?: "POST" | "GET";
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  /** Abort after this many ms. Defaults to 180 s, matching proxy-provider-call. */
  timeoutMs?: number;
};

export type ControlCenterResult = {
  httpStatus: number;
  payload: Record<string, unknown>;
};

export type ControlCenterConfig = { url: string; key: string };

/**
 * Read the Control Center address and shared secret. Returns null when either is missing so
 * the caller can fail closed with its own error rather than calling an unauthenticated
 * endpoint or a blank URL.
 */
export function controlCenterConfig(
  env: { get(name: string): string | undefined } = Deno.env,
): ControlCenterConfig | null {
  const url = env.get("CONTROL_CENTER_URL")?.trim();
  const key = env.get("AVT_PROXY_KEY")?.trim();
  if (!url || !key) return null;
  return { url, key };
}

async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : { _raw: text.slice(0, 4000) };
  } catch {
    return { _raw: text.slice(0, 4000) };
  }
}

/** Call a Control Center function. Control Center's envelope is returned verbatim. */
export async function callControlCenter(
  config: ControlCenterConfig,
  call: ControlCenterCall,
): Promise<ControlCenterResult> {
  const qs = call.query ? `?${new URLSearchParams(call.query).toString()}` : "";
  const url = `${config.url.replace(/\/$/, "")}/functions/v1/${call.endpoint}${qs}`;
  const method = call.method ?? "POST";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), call.timeoutMs ?? CORS_SAFE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-api-key": config.key },
      signal: ctrl.signal,
      ...(method === "POST" && call.body ? { body: JSON.stringify(call.body) } : {}),
    });
    return { httpStatus: res.status, payload: await readJsonSafe(res) };
  } finally {
    clearTimeout(timer);
  }
}
