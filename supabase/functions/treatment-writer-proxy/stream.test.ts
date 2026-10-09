// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamed } from "./stream.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("a long run is answered as a stream", () => {
  afterEach(() => vi.useRealTimers());

  // Fake timers: how many beats land before the answer is then a fact of the clock, not of how loaded the test
  // runner is (with real timers a stalled event loop fired the 20 ms interval once in a 70 ms wait and this flaked).
  it("sends a byte every heartbeat while the work runs, then the answer — which parses as the answer's JSON", async () => {
    vi.useFakeTimers();
    const res = streamed(async () => {
      await wait(70);
      return new Response(JSON.stringify({ ok: true, shots: 3 }), { status: 200 });
    }, { "Access-Control-Allow-Origin": "*" }, 20);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const reading = res.text();
    await vi.advanceTimersByTimeAsync(70); // beats at 20, 40, 60 ms; the work answers at 70
    const raw = await reading;
    expect(raw).toBe(`   ${JSON.stringify({ ok: true, shots: 3 })}`);
    expect(JSON.parse(raw)).toEqual({ ok: true, shots: 3 });
  });

  it("stops the heartbeat once the answer is sent, so nothing follows the JSON", async () => {
    vi.useFakeTimers();
    const res = streamed(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }), {}, 20);
    const reading = res.text();
    await vi.advanceTimersByTimeAsync(200);
    expect(await reading).toBe(JSON.stringify({ ok: true }));
  });

  it("a failure the work answers keeps its body; a failure it throws becomes ok:false with a reason — and the stream always closes", async () => {
    const answered = streamed(async () => new Response(JSON.stringify({ ok: false, status: 502, errorCode: "PROVIDER_API_ERROR", errorMessage: "no" }), { status: 502 }), {}, 1000);
    expect(answered.status).toBe(200);
    expect(await answered.json()).toMatchObject({ ok: false, status: 502, errorCode: "PROVIDER_API_ERROR" });
    const thrown = streamed(async () => { throw new Error("boom"); }, {}, 1000);
    expect(await thrown.json()).toEqual({ ok: false, status: 500, errorCode: "INTERNAL", errorMessage: "boom" });
  });
});
