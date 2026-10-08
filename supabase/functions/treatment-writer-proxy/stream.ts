// A long edge-function run answered as a stream, so the gateway never sees an idle connection. Nothing here knows
// the writer; index.ts wraps its work in `streamed`.

/** How often a byte is sent while the model calls run — well inside the gateway's idle limit (150 s). */
export const HEARTBEAT_MS = 10_000;

/**
 * A run is several model calls and can take longer than the gateway lets a connection sit idle (150 s), after which
 * the caller gets a 504 for work that finishes and is paid for anyway. So the run answers as a stream: a space
 * every HEARTBEAT_MS while it works (JSON ignores leading whitespace), then the answer itself. The status is 200
 * from the first byte, so a failure is told by the body — `ok: false` with its code, as every failure here already is.
 */
export function streamed(work: () => Promise<Response>, headers: Record<string, string> = {}, heartbeatMs = HEARTBEAT_MS): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const beat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch { clearInterval(beat); }
      }, heartbeatMs);
      try {
        const answer = await work();
        controller.enqueue(encoder.encode(await answer.text()));
      } catch (e) {
        controller.enqueue(encoder.encode(JSON.stringify({ ok: false, status: 500, errorCode: "INTERNAL", errorMessage: e instanceof Error ? e.message : String(e) })));
      } finally {
        clearInterval(beat);
        controller.close();
      }
    },
  });
  return new Response(stream, { status: 200, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

