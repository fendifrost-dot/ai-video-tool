import { describe, expect, it } from "vitest";
import { functionFailure, functionFailureText, reasonInBody } from "./functionsError";

const reply = (status: number, body: string) => ({ context: new Response(body, { status }), message: "Edge Function returned a non-2xx status code" });

describe("why an edge-function call failed", () => {
  it("is read out of the reply, not left as the wrapper's sentence", async () => {
    expect(await functionFailureText(reply(404, JSON.stringify({ code: "NOT_FOUND", message: "Requested function was not found" })))).toBe("404 — NOT_FOUND: Requested function was not found");
    expect(await functionFailureText(reply(502, JSON.stringify({ ok: false, errorCode: "INTERNAL", errorMessage: "Control Center proxy failed" })))).toBe("502 — INTERNAL: Control Center proxy failed");
    expect(await functionFailureText(reply(404, JSON.stringify({ type: "error", error: { type: "not_found_error", message: "model: old-model" } })))).toBe("404 — not_found_error: model: old-model");
    expect(await functionFailureText(reply(500, "upstream exploded"))).toBe("500 — upstream exploded");
  });

  it("uses a 2xx reply that says ok:false, and falls back to the transport message when nothing is said", async () => {
    expect(await functionFailure(null, { ok: false, errorCode: "PROVIDER_API_ERROR", errorMessage: "no credits" })).toEqual({ status: null, reason: "PROVIDER_API_ERROR: no credits" });
    expect(await functionFailureText(reply(500, ""))).toBe("500 — Edge Function returned a non-2xx status code");
    expect(await functionFailureText(new Error("Failed to fetch"))).toBe("Failed to fetch");
    expect(reasonInBody({ ok: true })).toBeNull();
  });
});
