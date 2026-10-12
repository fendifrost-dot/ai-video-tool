const [impl, refsArg = "1", mode = "bytes"] = Deno.args;
const { run } = await import(`./${impl}/run.ts`);
const { parseInput, MODEL } = await import(`./${impl}/contract.ts`);
const user = "00000000-0000-4000-8000-000000000001", project = "00000000-0000-4000-8000-000000000002";
const base = `https://qoyxgnkvjukovkrvdaiq.supabase.co/storage/v1/object/sign/prop-refs/${user}`;
const n = Number(refsArg);
const fetcher = (u: string, init?: RequestInit) => {
  const url = new URL(u);
  if (u.startsWith(base)) return fetch(`http://127.0.0.1:8787/ref/${url.pathname.split("/").at(-1)!.split(".")[0]}`, { ...init, redirect: "follow" });
  return fetch(`http://127.0.0.1:8787${url.pathname}`, { ...init, redirect: "follow" });
};
const mem = () => { const m = Deno.memoryUsage(); return { rss: m.rss, he: m.heapUsed + m.external }; };
// @ts-ignore gc
globalThis.gc?.(); await new Promise((r) => setTimeout(r, 50)); globalThis.gc?.();
const b0 = mem(); let peakRss = b0.rss, peakHe = b0.he;
const timer = setInterval(() => { const m = mem(); peakRss = Math.max(peakRss, m.rss); peakHe = Math.max(peakHe, m.he); }, 1);
const input = parseInput({ model: MODEL, n: 1, prompt: "p", resolution: "2k", aspectRatio: "4:5", maxCostUsd: .15, avt_user_id: user, avt_project_id: project, jobRowId: project, references: Array.from({ length: n }, (_, i) => ({ url: `${base}/${i}.png?token=x`, label: "w", role: "cast" })) });
const r = await run(input, "k", fetcher as typeof fetch, mode);
const out = JSON.stringify(r); const m = mem(); peakRss = Math.max(peakRss, m.rss); peakHe = Math.max(peakHe, m.he); clearInterval(timer);
console.log(JSON.stringify({ impl, n, ok: r.ok, err: r.errorCode ?? null, rss: +((peakRss - b0.rss) / 1e6).toFixed(1), he: +((peakHe - b0.he) / 1e6).toFixed(1) }));
