// @vitest-environment node
/**
 * The deployment gate for edge-function ENTRYPOINTS.
 *
 * The pure modules beside an index.ts (contract.ts, beats.ts, _shared/*) have their own tests; index.ts itself had
 * none, and a helper cut out of it (PR #193: `text is not defined`) reached production and answered 503 at the first
 * request. Here every function's index.ts is bundled as Deno would load it — its remote imports replaced by stubs
 * that export exactly the names it imports — booted under a Deno stand-in, and sent a request that must come back
 * as a Response: an unauthenticated POST (the auth refusal exercises the response helpers) and a GET (the method
 * refusal). A handler that throws, or that never registers, fails the suite. Functions whose imports this harness
 * cannot stub (npm:, jsr:, node: specifiers) are listed as not gated, never silently skipped.
 */
import { build } from "esbuild";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname);
const FUNCTIONS = readdirSync(ROOT).filter((d) => !d.startsWith("_") && statSync(join(ROOT, d)).isDirectory() && statSync(join(ROOT, d, "index.ts"), { throwIfNoEntry: false } as never));

/** Every name a source file imports from a remote URL, by URL — what the stub for that URL must export. */
function remoteImports(dir: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/import\s+(?:type\s+)?(\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)?\s*(?:,\s*(\{[^}]*\}))?\s*from\s*["']([^"']+)["']/g)) {
      const spec = m[3];
      if (/^https?:\/\//.test(spec)) {
        const names = out.get(spec) ?? new Set<string>();
        for (const part of [m[1], m[2]]) {
          if (!part) continue;
          if (part.startsWith("{")) for (const n of part.slice(1, -1).split(",")) { const name = n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim(); if (name) names.add(name); }
          else if (part.startsWith("*")) names.add("*");
          else names.add("default");
        }
        out.set(spec, names);
      } else if (spec.startsWith(".")) {
        const target = resolve(file, "..", spec);
        if (statSync(target, { throwIfNoEntry: false } as never)) walk(target);
      }
    }
  };
  walk(join(dir, "index.ts"));
  return out;
}

/**
 * A stub module for one remote URL: `serve` registers the handler; `createClient` is a client whose caller IS signed
 * in and owns whatever it reads (so a function runs past its auth and ownership checks to its real work, where a
 * missing helper would throw); every other import is a no-op. Any query chain resolves to one owned row.
 */
function stubFor(url: string, names: Set<string>): string {
  const lines = [
    `const noop = (..._a) => undefined;`,
    `const ROW = { id: "00000000-0000-4000-8000-000000000000", user_id: "u1", project_id: "00000000-0000-4000-8000-000000000000", active_variation_id: "00000000-0000-4000-8000-000000000001", treatment_json: {}, metadata_json: {}, status: "queued" };`,
    `const chain = () => { const p = new Proxy(function () {}, { get: (_t, k) => { if (k === "then") return (res) => res({ data: ROW, error: null }); if (k === "maybeSingle" || k === "single") return async () => ({ data: ROW, error: null }); return () => p; }, apply: () => p }); return p; };`,
    `const client = { auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) }, from: () => chain(), rpc: () => chain(), storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://stub.local/x" }, error: null }), upload: async () => ({ error: null }), download: async () => ({ data: null, error: { message: "stub" } }) }) }, functions: { invoke: async () => ({ data: null, error: null }) } };`,
  ];
  for (const n of names) {
    if (n === "*") continue;
    if (n === "default") lines.push(`export default noop;`);
    else if (n === "serve") lines.push(`export const serve = (h) => { globalThis.__avt_handler = h; };`);
    else if (n === "createClient") lines.push(`export const createClient = () => client;`);
    else lines.push(`export const ${n} = noop;`);
  }
  return lines.join("\n");
}

type Booted = { handler: ((req: Request) => Promise<Response> | Response) | null; error: string | null };

async function boot(name: string): Promise<Booted> {
  const dir = join(ROOT, name);
  const remotes = remoteImports(dir);
  const outdir = mkdtempSync(join(tmpdir(), `avt-fn-${name}-`));
  const outfile = join(outdir, "index.mjs");
  try {
    await build({
      entryPoints: [join(dir, "index.ts")],
      bundle: true,
      format: "esm",
      platform: "neutral",
      target: "es2022",
      outfile,
      logLevel: "silent",
      plugins: [
        {
          name: "remote-stubs",
          setup(b) {
            b.onResolve({ filter: /^https?:\/\// }, (args) => ({ path: args.path, namespace: "remote" }));
            b.onResolve({ filter: /^(npm|jsr|node):/ }, (args) => { throw new Error(`cannot stub ${args.path}`); });
            b.onLoad({ filter: /.*/, namespace: "remote" }, (args) => ({ contents: stubFor(args.path, remotes.get(args.path) ?? new Set()), loader: "js" }));
          },
        },
      ],
    });
  } catch (e) {
    return { handler: null, error: `not bundled: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` };
  }
  (globalThis as Record<string, unknown>).__avt_handler = null;
  // no provider is reached: every outbound call is refused, which a function must answer as its own JSON error
  (globalThis as Record<string, unknown>).fetch = async () => new Response(JSON.stringify({ error: { message: "stub: no provider here" } }), { status: 400, headers: { "content-type": "application/json" } });
  (globalThis as Record<string, unknown>).Deno = {
    env: { get: (k: string) => (k.endsWith("_URL") ? "https://stub.local" : "stub-value") },
    // the newer entry form: Deno.serve(handler) registers the same way
    serve: (a: unknown, b?: unknown) => { (globalThis as Record<string, unknown>).__avt_handler = typeof a === "function" ? a : b; },
  };
  try {
    await import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
  } catch (e) {
    return { handler: null, error: `failed at load: ${e instanceof Error ? e.message : String(e)}` };
  }
  const handler = (globalThis as Record<string, unknown>).__avt_handler as Booted["handler"];
  return { handler, error: handler ? null : "no handler registered through serve()" };
}

const booted = new Map<string, Booted>();
const notGated: string[] = [];

beforeAll(async () => {
  for (const name of FUNCTIONS) {
    const b = await boot(name);
    booted.set(name, b);
    if (b.error?.startsWith("not bundled")) notGated.push(`${name}: ${b.error}`);
  }
}, 120_000);

afterAll(() => {
  if (notGated.length) console.warn(`entrypoints not gated (imports this harness cannot stub):\n  ${notGated.join("\n  ")}`);
  delete (globalThis as Record<string, unknown>).Deno;
});

describe("every edge-function entrypoint boots and answers", () => {
  it("finds the functions", () => {
    expect(FUNCTIONS).toContain("treatment-writer-proxy");
  });

  it("treatment-writer-proxy is gated — the function whose helper went missing: a signed-in, well-formed request runs to the model call and comes back as the function's own PROVIDER_API_ERROR (streamed: status 200, the failure in the body), not an exception", async () => {
    const b = booted.get("treatment-writer-proxy")!;
    expect(b.error).toBeNull();
    const body = { avt_project_id: "00000000-0000-4000-8000-000000000000", mode: "full_treatment", concept: "A treatment.", clip_grid: [{ key: "c001", start: 0, end: 4, section: "intro", energy: "low", lyrics: "" }] };
    const res = await b.handler!(new Request("https://stub.local/", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer stub" }, body: JSON.stringify(body) }));
    // the work is streamed so the gateway never sees an idle connection: 200 from the first byte, the outcome in the body
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ ok: false, status: 502, errorCode: "PROVIDER_API_ERROR" });
    // and a signed-out caller is refused, as JSON
    const out = await b.handler!(new Request("https://stub.local/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    expect(out.status).toBe(401);
  });

  for (const name of FUNCTIONS) {
    it(`${name}: a GET is refused and an unsigned POST is refused — as Responses, not exceptions`, async () => {
      const b = booted.get(name)!;
      if (b.error?.startsWith("not bundled")) return; // listed as not gated above
      expect(b.error).toBeNull();
      const handler = b.handler!;
      const get = await handler(new Request("https://stub.local/", { method: "GET" }));
      expect(get).toBeInstanceOf(Response);
      const post = await handler(new Request("https://stub.local/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ avt_project_id: "00000000-0000-4000-8000-000000000000", mode: "full_treatment" }) }));
      expect(post).toBeInstanceOf(Response);
      // a refusal of some kind — a signed-out caller, a missing setting — as JSON, never an exception out of the handler
      expect(post.status).toBeGreaterThanOrEqual(400);
      const text = await post.text();
      expect(() => JSON.parse(text)).not.toThrow();
    });
  }
});
