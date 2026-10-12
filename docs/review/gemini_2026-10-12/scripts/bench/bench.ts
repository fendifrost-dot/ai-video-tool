// Deno bench: peak memory of run() for a synthetic Google answer. Args: impl shape refs
const [impl, shape = "sig", refsArg = "7.5"] = Deno.args;
const { run } = await import(`./${impl}/run.ts`);
const { parseInput, MODEL } = await import(`./${impl}/contract.ts`);
const user = "00000000-0000-4000-8000-000000000001", project = "00000000-0000-4000-8000-000000000002";
const base = `https://qoyxgnkvjukovkrvdaiq.supabase.co/storage/v1/object/sign/prop-refs/${user}`;
const sizes = refsArg.split("+").map((s) => Math.round(Number(s) * 1e6));
const refs = sizes.map((n, i) => { const b = new Uint8Array(n); b.set([137,80,78,71,13,10,26,10,0,0,0,13]); for (let k = 12; k < n; k++) b[k] = (k * 7919 + i) & 255; return b; });
const img = new Uint8Array(3_136_174); img.set([255,216,255,224,0,16,74,70,73,70,0,1]); for (let k = 12; k < img.length; k++) img[k] = (k * 31) & 255;
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const imgB64 = b64(img);
const filler = (n: number) => "A".repeat(n);
function answer(): string {
  const final: Record<string, unknown> = { inlineData: { mimeType: "image/jpeg", data: imgB64 } };
  const parts: unknown[] = [];
  if (shape === "sig") final.thoughtSignature = filler(7_100_000);
  if (shape === "thoughtimgs") parts.push({ thought: true, inlineData: { mimeType: "image/jpeg", data: imgB64 } }, { thought: true, inlineData: { mimeType: "image/jpeg", data: imgB64 } });
  if (shape === "text") parts.push({ text: filler(7_100_000) });
  parts.push(final);
  return JSON.stringify({ candidates: [{ finishReason: "STOP", content: { role: "model", parts } }], usageMetadata: { promptTokenCount: 2731 }, modelVersion: MODEL });
}
const ANSWER = new TextEncoder().encode(answer());
const mem = () => { const m = Deno.memoryUsage(); return { rss: m.rss, heap: m.heapUsed, ext: m.external }; };
let phase: "request" | "answer" = "request";
const peaks: Record<string, { rss: number; heapExt: number }> = { request: { rss: 0, heapExt: 0 }, answer: { rss: 0, heapExt: 0 } };
let peak = peaks.request;
const sample = () => { const m = mem(); const p = peaks[phase]; p.rss = Math.max(p.rss, m.rss); p.heapExt = Math.max(p.heapExt, m.heap + m.ext); };
const timer = setInterval(sample, 1);
const fetcher = async (u: string, init?: RequestInit) => {
  sample();
  // Like real fetch: the body is encoded to bytes and held until sent.
  let sent: Uint8Array | null = typeof init?.body === "string" ? new TextEncoder().encode(init.body) : init?.body instanceof Uint8Array ? init.body : init?.body instanceof ReadableStream ? new Uint8Array(await new Response(init.body).arrayBuffer()) : null;
  sample(); await new Promise((r) => setTimeout(r, 15)); sample(); sent = null;
  if (u.startsWith(base)) { const i = Number(new URL(u).pathname.split("/").at(-1)!.split(".")[0]); return new Response(refs[i]); }
  if (u.endsWith(":countTokens")) return Response.json({ totalTokens: 2731 });
  if (u.endsWith(":generateContent")) { sample(); phase = "answer"; let off = 0;
    return new Response(new ReadableStream({ pull(c) { sample(); if (off >= ANSWER.length) return c.close(); c.enqueue(ANSWER.subarray(off, off + 65536)); off += 65536; } })); }
  return Response.json({ name: `models/${MODEL}` });
};
// @ts-ignore gc
if (globalThis.gc) globalThis.gc();
const b0 = mem(); for (const k of ["request", "answer"]) peaks[k] = { rss: b0.rss, heapExt: b0.heap + b0.ext };
const input = parseInput({ model: MODEL, n: 1, prompt: "p", resolution: "2k", aspectRatio: "4:5", maxCostUsd: .15, avt_user_id: user, avt_project_id: project, jobRowId: project, references: sizes.map((_, i) => ({ url: `${base}/${i}.png?token=x`, label: "w", role: "cast" })) });
const t = performance.now(); const r = await run(input, "k", fetcher); const ms = performance.now() - t;
const out = JSON.stringify(r); sample(); clearInterval(timer);
console.log(JSON.stringify({ impl, shape, refs: refsArg, ok: r.ok, err: r.errorCode ?? null, reqRssMB: +((peaks.request.rss - b0.rss) / 1e6).toFixed(1), reqHeapExtMB: +((peaks.request.heapExt - b0.heap - b0.ext) / 1e6).toFixed(1), ansRssMB: +((peaks.answer.rss - b0.rss) / 1e6).toFixed(1), ansHeapExtMB: +((peaks.answer.heapExt - b0.heap - b0.ext) / 1e6).toFixed(1), baseRssMB: +(b0.rss / 1e6).toFixed(1), ms: Math.round(ms), outMB: +(out.length / 1e6).toFixed(1) }));
