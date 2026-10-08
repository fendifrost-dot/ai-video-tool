// @vitest-environment node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FUNCTION_DOCS, KNOWN_TABLES } from "./catalog.generated";
import {
  TOOLS,
  capsFrom,
  credentialFrom,
  excerpt,
  functionPolicy,
  initializeResult,
  isRpcRequest,
  namesRowsById,
  paidCallRefusal,
  parseFilters,
  projectOf,
  reportedCostUsd,
  settlement,
  tableAccess,
  validColumn,
  validSelect,
} from "./contract";

const SECRET = "a".repeat(64);
const req = (url: string, headers: Record<string, string> = {}) => ({ url, headers: new Headers(headers) });
const NAMES = FUNCTION_DOCS.map((f) => f.name);

describe("the credential", () => {
  const base = "https://x.supabase.co/functions/v1/avt-mcp";
  it("is read from a header, a bearer, the end of the URL or ?key=", () => {
    expect(credentialFrom(req(base, { "x-batch-secret": SECRET }))).toBe(SECRET);
    expect(credentialFrom(req(base, { authorization: `Bearer ${SECRET}` }))).toBe(SECRET);
    expect(credentialFrom(req(`${base}/${SECRET}`))).toBe(SECRET);
    expect(credentialFrom(req(`${base}?key=${SECRET}`))).toBe(SECRET);
  });
  it("is never a Supabase JWT or anything not shaped like a credential", () => {
    expect(credentialFrom(req(base, { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.e30.x" }))).toBeNull();
    expect(credentialFrom(req(`${base}/avt-mcp`))).toBeNull();
    expect(credentialFrom(req(base))).toBeNull();
  });
});

describe("the protocol", () => {
  it("answers initialize with a version the client knows, or the newest", () => {
    expect(initializeResult("2025-03-26").protocolVersion).toBe("2025-03-26");
    expect(initializeResult("1999-01-01").protocolVersion).toBe("2025-06-18");
    expect(initializeResult(undefined).capabilities).toEqual({ tools: { listChanged: false } });
  });
  it("knows a JSON-RPC request when it sees one", () => {
    expect(isRpcRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" })).toBe(true);
    expect(isRpcRequest({ id: 1, method: "tools/list" })).toBe(false);
  });
  it("describes every tool with an object schema", () => {
    for (const t of TOOLS) expect(t.inputSchema.type).toBe("object");
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });
});

describe("tables", () => {
  it("hides credentials and keeps the ledger read-only", () => {
    expect(tableAccess("shots", KNOWN_TABLES)).toBe("write");
    expect(tableAccess("mcp_budgets", KNOWN_TABLES)).toBe("read");
    expect(tableAccess("mcp_spend", KNOWN_TABLES)).toBe("read");
    expect(tableAccess("batch_credentials", KNOWN_TABLES)).toBeNull();
    expect(tableAccess("pg_user", KNOWN_TABLES)).toBeNull();
  });
  it("never lets a hidden table in through an embed", () => {
    expect(validSelect("id, label, batch_credentials(secret_sha256)")).toBe(false);
    expect(validSelect("id, shot_number, generated_json")).toBe(true);
    expect(validColumn("generated_json->>description")).toBe(true);
    expect(validColumn("id; drop table shots")).toBe(false);
  });
  it("validates filters, and an update or delete must name its rows by id", () => {
    expect(parseFilters([{ column: "variation_id", op: "eq", value: "v" }])).toMatchObject({ ok: true });
    expect(parseFilters([{ column: "x", op: "drop", value: 1 }])).toMatchObject({ ok: false });
    expect(parseFilters([{ column: "id", op: "in", value: "a" }])).toMatchObject({ ok: false });
    expect(namesRowsById([{ column: "id", op: "eq", value: "1" }])).toBe(true);
    expect(namesRowsById([{ column: "id", op: "in", value: ["1", "2"] }])).toBe(true);
    expect(namesRowsById([{ column: "variation_id", op: "eq", value: "v" }])).toBe(false);
    expect(namesRowsById([{ column: "id", op: "neq", value: "1" }])).toBe(false);
  });
});

describe("functions", () => {
  it("knows every function in the repo", () => {
    expect(NAMES).toContain("world-still-proxy");
    expect(NAMES).toContain("avt-mcp");
  });
  it("blocks identity, callbacks, research harnesses and itself", () => {
    for (const n of ["batch-token-proxy", "compose-look-callback", "faceswap-callback", "grok-resolution-test", "avt-mcp"]) {
      expect(functionPolicy(n, NAMES)?.access).toBe("blocked");
    }
  });
  it("charges generation to a budget and lets uploads and polls through free", () => {
    expect(functionPolicy("world-still-proxy", NAMES)?.access).toBe("paid");
    expect(functionPolicy("grok-video-edit-proxy", NAMES)?.access).toBe("paid");
    expect(functionPolicy("upload-asset", NAMES)?.access).toBe("free");
    expect(functionPolicy("proxy-provider-call", NAMES, { endpoint: "video-providers-job-status" })?.access).toBe("free");
    expect(functionPolicy("proxy-provider-call", NAMES, { endpoint: "video-providers-runway-generate" })?.access).toBe("paid");
    expect(functionPolicy("nope", NAMES)).toBeNull();
  });
});

describe("money", () => {
  const caps = { perCallUsd: 10, dailyUsd: 50 };
  it("needs a budget and a price on every paid call, under the per-call cap", () => {
    const budgetId = "00000000-0000-4000-8000-000000000000";
    expect(paidCallRefusal({ budgetId, maxUsd: 0.14 }, caps)).toBeNull();
    expect(paidCallRefusal({ budgetId: undefined, maxUsd: 0.14 }, caps)).toMatch(/budget_id/);
    expect(paidCallRefusal({ budgetId, maxUsd: 0 }, caps)).toMatch(/max_usd/);
    expect(paidCallRefusal({ budgetId, maxUsd: 12 }, caps)).toMatch(/per-call cap/);
  });
  it("reads caps from the environment, with defaults", () => {
    expect(capsFrom(() => undefined)).toEqual({ perCallUsd: 10, dailyUsd: 50 });
    expect(capsFrom((k) => (k === "AVT_MCP_DAILY_CAP_USD" ? "20" : "x"))).toEqual({ perCallUsd: 10, dailyUsd: 20 });
  });
  it("takes the cost the function reports, top level or one down", () => {
    expect(reportedCostUsd({ ok: true, actualCostUsd: 0.0263 })).toBe(0.0263);
    expect(reportedCostUsd({ result: { cost_usd: 0.14 } })).toBe(0.14);
    expect(reportedCostUsd({ ok: true })).toBeNull();
  });
  it("settles: reported cost wins; a 4xx without one cost nothing; anything else keeps the reservation", () => {
    expect(settlement(200, { ok: true, costUsd: 0.14 })).toEqual({ status: "settled", actualUsd: 0.14 });
    expect(settlement(200, { ok: true })).toEqual({ status: "settled", actualUsd: null });
    expect(settlement(400, { error: "invalid_request" })).toEqual({ status: "failed", actualUsd: 0 });
    expect(settlement(200, { ok: false, error: "provider" })).toEqual({ status: "failed", actualUsd: null });
    expect(settlement(502, null)).toEqual({ status: "failed", actualUsd: null });
  });
  it("finds the project a body is about", () => {
    expect(projectOf({ projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51" })).toBe("764a63d2-93cd-44f3-905f-292f14ab2f51");
    expect(projectOf({ prompt: "x" })).toBeNull();
  });
  it("keeps secrets out of the ledger", () => {
    expect(excerpt({ prompt: "p", accessToken: "t", signedUrl: "u" })).toEqual({ prompt: "p", accessToken: "[redacted]", signedUrl: "[redacted]" });
    expect(excerpt({ big: "x".repeat(5000) })).toMatchObject({ truncated: true });
  });
});

describe("the generated catalog", () => {
  it("is up to date with the functions and tables in the repo", () => {
    expect(() => execFileSync("node", [resolve(__dirname, "../../../scripts/mcp/build-catalog.mjs"), "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
