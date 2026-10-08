// @vitest-environment node
import { describe, expect, it } from "vitest";
import { streamed } from "./stream.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("a long run is answered as a stream", () => {
  it("sends a byte every heartbeat while the work runs, then the answer — which parses as the answer's JSON", async () => {
    const res = streamed(async () => {
      await wait(70);
      return new Response(JSON.stringify({ ok: true, shots: 3 }), { status: 200 });
    }, { "Access-Control-Allow-Origin": "*" }, 20);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const raw = await res.text();
    expect(raw.length).toBeGreaterThan(JSON.stringify({ ok: true, shots: 3 }).length + 1);
    expect(raw.startsWith(" ")).toBe(true);
    expect(JSON.parse(raw)).toEqual({ ok: true, shots: 3 });
  });

  it("a failure the work answers keeps its body; a failure it throws becomes ok:false with a reason — and the stream always closes", async () => {
    const answered = streamed(async () => new Response(JSON.stringify({ ok: false, status: 502, errorCode: "PROVIDER_API_ERROR", errorMessage: "no" }), { status: 502 }), {}, 1000);
    expect(answered.status).toBe(200);
    expect(await answered.json()).toMatchObject({ ok: false, status: 502, errorCode: "PROVIDER_API_ERROR" });
    const thrown = streamed(async () => { throw new Error("boom"); }, {}, 1000);
    expect(await thrown.json()).toEqual({ ok: false, status: 500, errorCode: "INTERNAL", errorMessage: "boom" });
  });
});
