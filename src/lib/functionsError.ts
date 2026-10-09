/**
 * Why an edge-function call failed, in the function's own words.
 *
 * supabase-js reports every non-2xx reply as "Edge Function returned a non-2xx status code" and hands the reply
 * itself back as `error.context`. The reason is in that reply — a proxy's errorCode/errorMessage, a provider's
 * message, or the platform's "function not found" — and the director is owed it, not the wrapper's sentence.
 */
type Reply = { status?: number; json?: () => Promise<unknown>; text?: () => Promise<string>; clone?: () => Reply };

/** The reason carried in a reply body, or null when it says nothing usable. */
export function reasonInBody(body: unknown): string | null {
  if (typeof body === "string") return body.trim() ? body.trim().slice(0, 300) : null;
  const o = body as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const nested = o.error && typeof o.error === "object" ? (o.error as Record<string, unknown>) : null;
  const parts = [o.errorCode ?? o.code ?? nested?.type, o.errorMessage ?? (typeof o.error === "string" ? o.error : nested?.message) ?? o.message ?? o.msg, o.detail]
    .filter((x) => typeof x === "string" && x)
    .map(String);
  return parts.length ? parts.join(": ").slice(0, 400) : null;
}

/** The reason an invoke failed: from the data when the function answered 2xx with ok:false, else from the reply. */
export async function functionFailure(error: unknown, data?: unknown): Promise<{ status: number | null; reason: string }> {
  const direct = reasonInBody(data);
  if (direct) return { status: null, reason: direct };
  const ctx = (error as { context?: Reply } | null)?.context;
  const status = typeof ctx?.status === "number" ? ctx.status : null;
  if (ctx) {
    try {
      const copy = ctx.clone ? ctx.clone() : ctx;
      const text = copy.text ? await copy.text() : copy.json ? JSON.stringify(await copy.json()) : "";
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // not JSON: the text itself is the reason
      }
      const reason = reasonInBody(parsed);
      if (reason) return { status, reason };
    } catch {
      // the reply could not be read; fall through to the transport message
    }
  }
  return { status, reason: (error as { message?: string } | null)?.message || "the call failed without a reason" };
}

/** One line for a toast: "404 — NOT_FOUND: Requested function was not found". */
export async function functionFailureText(error: unknown, data?: unknown): Promise<string> {
  const f = await functionFailure(error, data);
  return f.status ? `${f.status} — ${f.reason}` : f.reason;
}
