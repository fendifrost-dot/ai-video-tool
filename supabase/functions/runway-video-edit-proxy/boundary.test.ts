// Credential-boundary guard for the Runway video-edit lane.
//
// The architectural invariant: AVT never holds a provider credential and never calls a
// provider directly. Control Center owns RUNWAY_API_KEY, the upstream call, retries, audit
// and the break-glass. AVT PR #160 briefly crossed that line — this file makes the crossing
// impossible to reintroduce silently, because a regression here is invisible in review
// (one `Deno.env.get` and one `fetch` URL) but moves a credential across a trust boundary.
//
// These are source-level assertions on purpose. The alternative — booting the edge function
// and mocking Deno.env plus fetch — would test the mock, not the boundary.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

const proxySource = read("./index.ts");
const allowlistSource = read("../proxy-provider-call/index.ts");

/** Comments legitimately name the key when explaining where it lives; code must not read it. */
const codeOnly = (src: string) =>
  src
    .split("\n")
    .filter(
      (line) =>
        !line.trim().startsWith("//") &&
        !line.trim().startsWith("*") &&
        !line.trim().startsWith("/*"),
    )
    .join("\n");

describe("runway-video-edit-proxy holds no provider credential", () => {
  const code = codeOnly(proxySource);

  it("never reads RUNWAY_API_KEY", () => {
    expect(code).not.toContain("RUNWAY_API_KEY");
    expect(code).not.toMatch(/Deno\.env\.get\(\s*["'`]RUNWAY/);
  });

  it("never addresses the Runway API directly", () => {
    expect(code).not.toContain("api.dev.runwayml.com");
    expect(code).not.toContain("X-Runway-Version");
    // The old direct-execution slice, by its distinctive names.
    expect(code).not.toContain("RUNWAY_BASE_URL");
    expect(code).not.toContain("runway_key_missing");
  });

  it("routes provider execution through Control Center", () => {
    expect(code).toContain("video-providers-runway-video-edit");
    expect(code).toContain("controlCenterClient");
  });

  it("does not synchronously invoke another AVT edge function", () => {
    // The bug this pins: PR #161 called AVT's own proxy-provider-call from here, a
    // same-project edge→edge hop during a request. Every valid request came back as a bare
    // 503 with no CORS headers — the gateway answering for a killed worker, which the
    // caller's try/catch cannot intercept. Control Center is a SEPARATE project, so the
    // direct call is an ordinary outbound request; hopping through AVT's own gateway is not.
    expect(code).not.toContain("proxy-provider-call");
    expect(code).not.toMatch(/SUPABASE_URL[\s\S]{0,120}functions\/v1/);
  });

  it("reuses Control Center's existing polling instead of reimplementing it", () => {
    expect(code).toContain("video-providers-job-status");
    expect(code).toContain("video-providers-job-result");
    // Runway's own task endpoint is Control Center's business, not AVT's.
    expect(code).not.toContain("/tasks/");
  });

  it("reads the Control Center secret only through the shared client", () => {
    // AVT_PROXY_KEY is NOT a provider credential — it is AVT's own shared secret with Control
    // Center, and it already lives in proxy-provider-call and ingest-provider-job. The
    // invariant that matters is the one above: no PROVIDER key in AVT. Keeping the hop in
    // _shared/controlCenterClient.ts gives one implementation without an intra-project hop.
    expect(code).not.toMatch(/Deno\.env\.get\(\s*["'`]AVT_PROXY_KEY/);
    expect(code).not.toMatch(/Deno\.env\.get\(\s*["'`]CONTROL_CENTER_URL/);
    expect(code).toContain("controlCenterConfig()");
  });

  it("fails closed when Control Center is not configured", () => {
    // AVT has no provider credential to fall back on, so it must refuse rather than pretend.
    expect(code).toContain("control_center_not_configured");
  });

  it("converts an unhandled throw into a CORS-bearing JSON error", () => {
    // Without this the runtime answers with a bare 503 and no CORS headers, and the browser
    // only reports "Failed to fetch" — the failure becomes invisible to everyone.
    expect(code).toContain("unhandled_exception");
    expect(code).toMatch(/serve\(async \(req\) => \{[\s\S]{0,200}try \{[\s\S]{0,120}handleRequest/);
  });

  it("sends AVT's spend authorization and lets Control Center form its own estimate", () => {
    expect(code).toContain("avtAuthorizedMaxCents");
    // AVT must not tell Control Center what the provider will cost — that is CC's number.
    expect(code).not.toContain("ccProviderEstimateCents:");
  });

  it("keeps the dry run local and free of any provider call", () => {
    // dryRun returns before the submit path; the CC dry run it also attempts is itself $0.
    const dryRunIndex = code.indexOf("if (body.dryRun)");
    const submitIndex = code.indexOf("const submit = await callControlCenter");
    expect(dryRunIndex).toBeGreaterThan(-1);
    expect(submitIndex).toBeGreaterThan(dryRunIndex);
  });
});

describe("proxy-provider-call stays fail-closed", () => {
  it("allows the new Control Center video-edit endpoint", () => {
    expect(allowlistSource).toContain('"video-providers-runway-video-edit"');
  });

  it("was not broadened into a generic pass-through", () => {
    const code = codeOnly(allowlistSource);
    // An allowlist that can be bypassed is not an allowlist.
    expect(code).toContain("ALLOWED_ENDPOINTS.has(endpoint)");
    expect(code).not.toMatch(/ALLOWED_ENDPOINTS\s*=\s*null/);
    const listed = [...allowlistSource.matchAll(/^\s{2}"([a-z0-9-]+)",$/gm)].map((m) => m[1]);
    // Exactly one endpoint was added; the rest of the surface is unchanged.
    expect(listed).toContain("video-providers-runway-video-edit");
    expect(listed).toContain("video-providers-runway-generate");
    expect(listed.length).toBe(12);
  });
});
