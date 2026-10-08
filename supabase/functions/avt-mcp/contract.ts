// avt-mcp — the pure half: the MCP wire protocol, the tools and their arguments, which tables and functions an
// outside AI may reach, and how a paid call is priced against a budget. No network or database here, so all of it
// is unit-tested (contract.test.ts); index.ts does the I/O.

export const SERVER_NAME = "avt";
export const SERVER_VERSION = "1.0.0";
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const INSTRUCTIONS = [
  "AVT (AI Video Tool) — Fendi's film production app. You act as the owner, through a machine credential.",
  "Read and edit anything in his projects with avt_select / avt_insert / avt_update / avt_delete (row-level security still applies).",
  "Generate and edit pictures and video by calling AVT's own edge functions with avt_call; avt_functions lists them with the request each one takes.",
  "PAID calls need a budget_id and a max_usd: the owner approves one budget per video before work starts (avt_budgets lists them; avt_budget_request asks for one).",
  "A call that would take the budget past what was approved is refused. Prefer a dryRun first where a function offers one.",
  "Projects: video_projects; boards: shots (per video_variations); casting/continuity: continuity_entities; generated files: project_assets + provider_jobs.",
].join("\n");

// ---------------------------------------------------------------------------------------------------- credentials

const SECRET_RE = /^[0-9a-f]{64}$/;

/**
 * The machine credential, wherever the client could put it: the x-batch-secret header, an Authorization bearer, the
 * last path segment (…/avt-mcp/<secret>, for clients that only take a URL) or ?key=. Only the credential format is
 * accepted, so a Supabase JWT in Authorization is never mistaken for one.
 */
export function credentialFrom(req: { headers: Headers; url: string }): string | null {
  const header = req.headers.get("x-batch-secret")?.trim();
  if (header && SECRET_RE.test(header)) return header;
  const bearer = /^bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]?.trim();
  if (bearer && SECRET_RE.test(bearer)) return bearer;
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return null;
  }
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (SECRET_RE.test(last)) return last;
  const key = url.searchParams.get("key")?.trim();
  if (key && SECRET_RE.test(key)) return key;
  return null;
}

// ---------------------------------------------------------------------------------------------------- JSON-RPC

export type RpcId = string | number | null;
export type RpcRequest = { jsonrpc: "2.0"; id?: RpcId; method: string; params?: Record<string, unknown> };
export type RpcResponse = { jsonrpc: "2.0"; id: RpcId; result?: unknown; error?: { code: number; message: string; data?: unknown } };

export const RPC = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

export function isRpcRequest(x: unknown): x is RpcRequest {
  return !!x && typeof x === "object" && (x as RpcRequest).jsonrpc === "2.0" && typeof (x as RpcRequest).method === "string";
}

export const rpcResult = (id: RpcId, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
export const rpcError = (id: RpcId, code: number, message: string, data?: unknown): RpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});

export function initializeResult(requested: unknown) {
  const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(String(requested)) ? String(requested) : PROTOCOL_VERSIONS[0];
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    instructions: INSTRUCTIONS,
  };
}

/** A tool's answer: JSON as text (every client reads text), flagged as an error when it is one. */
export function toolText(value: unknown, isError = false) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }], isError };
}

// ---------------------------------------------------------------------------------------------------- tables

/** Never reachable from the generic tools: credentials, and the budget/spend ledger the caps are enforced from. */
export const HIDDEN_TABLES = new Set(["batch_credentials", "batch_credential_mints"]);
/** Readable, never writable from the generic tools: the ledger (budgets are approved by the owner in the app) and
 * server-side configuration. */
export const READ_ONLY_TABLES = new Set(["mcp_budgets", "mcp_spend", "provider_capabilities", "job_runner_config", "generation_feasibility"]);
/** RPCs an AI may call. claim_provider_jobs belongs to the job runner, not to a client. */
export const RPC_ALLOWED = new Set(["duplicate_variation", "lyric_lines_in_window"]);

export const TABLE_NOTES: Record<string, string> = {
  video_projects: "a song/video project (treatment_json holds the treatment; active_variation_id the board in use)",
  video_variations: "one storyboard variation of a project (candidates live here)",
  shots: "the board's shots: generated_json (writer's spec), override_json (director's edits), spec_json, shot_number, variation_id",
  shot_overrides: "per-shot director overrides",
  continuity_entities: "cast (kind=character) and continuity (location/prop/lighting): description, approved_asset_id, reference_asset_ids",
  project_assets: "every file in a project (stills, clips, references): bucket + file_url path",
  shot_asset_assignments: "which asset is placed on which shot (and which still is selected)",
  provider_jobs: "every generation job: status, request/response payloads, cost, result_asset_id",
  writer_runs: "treatment-writer runs and their evidence",
  lyric_lines: "the song's lyric lines on the song clock",
  song_analyses: "beat grid / sections",
  performance_syncs: "real takes synced to the song clock",
  timeline_items: "edit timeline",
  artists: "artist records",
  artist_assets: "artist pictures (faces, looks)",
  character_features: "the artist's identity/wardrobe pictures (wardrobe.garments)",
  mcp_budgets: "spend budgets the owner approved (read-only here)",
  mcp_spend: "every paid call made through this server (read-only here)",
};

export function tableAccess(table: string, known: readonly string[]): "read" | "write" | null {
  if (!known.includes(table) || HIDDEN_TABLES.has(table)) return null;
  return READ_ONLY_TABLES.has(table) ? "read" : "write";
}

const COLUMN_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:->>?'?[A-Za-z0-9_]+'?)*$/;
const SELECT_RE = /^[A-Za-z0-9_*,\s()!:.>-]{1,500}$/;
export const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains"] as const;
export type FilterOp = (typeof FILTER_OPS)[number];
export type Filter = { column: string; op: FilterOp; value: unknown };

export function parseFilters(raw: unknown): { ok: true; filters: Filter[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, filters: [] };
  if (!Array.isArray(raw) || raw.length > 20) return { ok: false, error: "filters must be an array of at most 20 {column, op, value}" };
  const out: Filter[] = [];
  for (const f of raw) {
    const column = (f as Filter)?.column;
    const op = (f as Filter)?.op;
    if (typeof column !== "string" || !COLUMN_RE.test(column)) return { ok: false, error: `bad filter column ${JSON.stringify(column)}` };
    if (!(FILTER_OPS as readonly string[]).includes(op)) return { ok: false, error: `bad filter op ${JSON.stringify(op)} (one of ${FILTER_OPS.join(", ")})` };
    if (op === "in" && !Array.isArray((f as Filter).value)) return { ok: false, error: `"in" takes an array value` };
    out.push({ column, op, value: (f as Filter).value });
  }
  return { ok: true, filters: out };
}

/** A select list, which may embed related tables — never a hidden one (an embed is a join around the table check). */
export const validSelect = (s: unknown) => typeof s === "string" && SELECT_RE.test(s) && ![...HIDDEN_TABLES].some((t) => s.includes(t));
export const validColumn = (s: unknown) => typeof s === "string" && COLUMN_RE.test(s);

/** An update or delete names its rows by id — never "every row matching a loose filter". */
export function namesRowsById(filters: Filter[]): boolean {
  return filters.some((f) => f.column === "id" && (f.op === "eq" || (f.op === "in" && Array.isArray(f.value) && f.value.length > 0 && f.value.length <= 100)));
}

// ---------------------------------------------------------------------------------------------------- functions

/** Functions that never reach a paid provider: callable without a budget. */
export const FREE_FUNCTIONS = new Set(["upload-asset", "fetch-reference-image", "fal-queue-poll-proxy", "provider-jobs-tick", "ingest-provider-job"]);

/** Functions an AI may not call: identity minting, server-to-server callbacks, research harnesses, itself. */
export function blockedFunction(name: string): string | null {
  if (name === "avt-mcp") return "this server";
  if (name === "batch-token-proxy") return "credentials are managed by the owner in AVT Settings";
  if (name.endsWith("-callback")) return "a server-to-server callback, not a client endpoint";
  if (name === "grok-resolution-test" || name === "grok-video-research-proxy") return "a research harness, not a product lane";
  return null;
}

export type FunctionPolicy = { name: string; access: "free" | "paid" | "blocked"; why?: string };

/** proxy-provider-call forwards to Control Center: asking where a job stands is free, submitting one is not. */
const CC_READ_ENDPOINT = /(?:job-status|status|poll|list|get)$/i;

export function functionPolicy(name: string, known: readonly string[], body?: unknown): FunctionPolicy | null {
  if (!known.includes(name)) return null;
  const why = blockedFunction(name);
  if (why) return { name, access: "blocked", why };
  if (name === "proxy-provider-call") {
    const endpoint = body && typeof body === "object" ? (body as { endpoint?: unknown }).endpoint : undefined;
    return { name, access: typeof endpoint === "string" && CC_READ_ENDPOINT.test(endpoint) ? "free" : "paid" };
  }
  return { name, access: FREE_FUNCTIONS.has(name) ? "free" : "paid" };
}

// ---------------------------------------------------------------------------------------------------- money

const COST_KEYS = ["actualCostUsd", "actual_cost_usd", "costUsd", "cost_usd", "billedUsd", "billed_usd", "chargedUsd"];

/** What the function says the call cost, when it says so (top level or one level down). Null when it does not. */
export function reportedCostUsd(body: unknown): number | null {
  const look = (o: unknown, depth: number): number | null => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    for (const k of COST_KEYS) {
      const v = (o as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
    }
    if (depth === 0) return null;
    for (const v of Object.values(o as Record<string, unknown>)) {
      const found = look(v, depth - 1);
      if (found !== null) return found;
    }
    return null;
  };
  return look(body, 1);
}

/**
 * How a finished paid call is written on the ledger. A cost the function reports is the cost. Without one: a 4xx
 * was refused before any provider was reached (nothing spent); anything else may have been billed, so the
 * reservation stands.
 */
export function settlement(httpStatus: number, body: unknown): { status: "settled" | "failed"; actualUsd: number | null } {
  const reported = reportedCostUsd(body);
  const ok = httpStatus >= 200 && httpStatus < 300 && !(body && typeof body === "object" && (body as { ok?: unknown }).ok === false);
  if (reported !== null) return { status: ok ? "settled" : "failed", actualUsd: reported };
  if (ok) return { status: "settled", actualUsd: null };
  if (httpStatus >= 400 && httpStatus < 500) return { status: "failed", actualUsd: 0 };
  return { status: "failed", actualUsd: null };
}

/** The project a function body is about, when it names one — a budget for one video does not pay for another. */
export function projectOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const v = (body as Record<string, unknown>).projectId ?? (body as Record<string, unknown>).project_id;
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

/** A short, secret-free copy of a payload for the ledger. */
export function excerpt(value: unknown, max = 2000): unknown {
  try {
    const s = JSON.stringify(value, (k, v) => (/token|secret|signed|authorization|apikey/i.test(k) ? "[redacted]" : v));
    if (s === undefined) return null;
    return s.length <= max ? JSON.parse(s) : { truncated: true, head: s.slice(0, max) };
  } catch {
    return null;
  }
}

export type Caps = { perCallUsd: number; dailyUsd: number };

export function capsFrom(get: (k: string) => string | undefined): Caps {
  const n = (k: string, d: number) => {
    const v = Number(get(k));
    return Number.isFinite(v) && v > 0 ? v : d;
  };
  return { perCallUsd: n("AVT_MCP_MAX_USD_PER_CALL", 10), dailyUsd: n("AVT_MCP_DAILY_CAP_USD", 50) };
}

export function paidCallRefusal(args: { budgetId: unknown; maxUsd: unknown }, caps: Caps): string | null {
  if (typeof args.budgetId !== "string" || !/^[0-9a-f-]{36}$/i.test(args.budgetId))
    return "a paid function needs budget_id — the id of a budget the owner approved (avt_budgets lists them; avt_budget_request asks for one)";
  if (typeof args.maxUsd !== "number" || !Number.isFinite(args.maxUsd) || args.maxUsd <= 0)
    return "a paid function needs max_usd — the most this one call may cost, in US dollars (use the function's dryRun or price notes)";
  if (args.maxUsd > caps.perCallUsd) return `max_usd $${args.maxUsd.toFixed(2)} is over the per-call cap $${caps.perCallUsd.toFixed(2)}`;
  return null;
}

// ---------------------------------------------------------------------------------------------------- tools

const filtersSchema = {
  type: "array",
  description: "Row filters, ANDed: [{column, op, value}]. op: eq neq gt gte lt lte like ilike is in contains. JSON paths like generated_json->>description are allowed.",
  items: {
    type: "object",
    properties: { column: { type: "string" }, op: { type: "string", enum: [...FILTER_OPS] }, value: {} },
    required: ["column", "op", "value"],
  },
};

export const TOOLS = [
  {
    name: "avt_whoami",
    description: "Who this server acts as, which credential is in use, the spend caps, and the approved budgets. Start here.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "avt_tables",
    description: "The tables you can read or write, with what each holds.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "avt_select",
    description: "Read rows from a table (the owner's rows only).",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        columns: { type: "string", description: 'PostgREST select list, default "*"' },
        filters: filtersSchema,
        order: { type: "object", properties: { column: { type: "string" }, ascending: { type: "boolean" } } },
        limit: { type: "integer", minimum: 1, maximum: 500, description: "default 50" },
      },
      required: ["table"],
    },
  },
  {
    name: "avt_insert",
    description: "Insert rows (up to 50). Returns the inserted rows.",
    inputSchema: {
      type: "object",
      properties: { table: { type: "string" }, rows: { type: "array", items: { type: "object" }, minItems: 1, maxItems: 50 } },
      required: ["table", "rows"],
    },
  },
  {
    name: "avt_update",
    description: "Update rows named by id (filters must include id eq/in). Returns the updated rows.",
    inputSchema: {
      type: "object",
      properties: { table: { type: "string" }, filters: filtersSchema, values: { type: "object" } },
      required: ["table", "filters", "values"],
    },
  },
  {
    name: "avt_delete",
    description: "Delete rows named by id. Requires confirm: true.",
    inputSchema: {
      type: "object",
      properties: { table: { type: "string" }, filters: filtersSchema, confirm: { type: "boolean" } },
      required: ["table", "filters", "confirm"],
    },
  },
  {
    name: "avt_rpc",
    description: `Call a database function: ${[...RPC_ALLOWED].join(", ")}.`,
    inputSchema: { type: "object", properties: { name: { type: "string" }, args: { type: "object" } }, required: ["name"] },
  },
  {
    name: "avt_functions",
    description: "AVT's edge functions (image/video generation, edits, uploads, polling): whether each is free or paid, what it does, and the request body it takes. Pass name for one function's full notes.",
    inputSchema: { type: "object", properties: { name: { type: "string" } } },
  },
  {
    name: "avt_call",
    description: "Call an AVT edge function as the owner. PAID functions need budget_id and max_usd; the call is refused if it would pass the budget or a cap. Returns the function's own answer and, for paid calls, the budget left.",
    inputSchema: {
      type: "object",
      properties: {
        function: { type: "string" },
        body: { type: "object" },
        method: { type: "string", enum: ["POST", "GET"], description: "default POST" },
        budget_id: { type: "string" },
        max_usd: { type: "number" },
      },
      required: ["function"],
    },
  },
  {
    name: "avt_signed_url",
    description: "A temporary URL to look at or download a stored file (bucket + path, e.g. from project_assets).",
    inputSchema: {
      type: "object",
      properties: { bucket: { type: "string" }, path: { type: "string" }, expires_in: { type: "integer", minimum: 60, maximum: 86400 } },
      required: ["bucket", "path"],
    },
  },
  {
    name: "avt_list_files",
    description: "List stored files under a folder of a bucket.",
    inputSchema: {
      type: "object",
      properties: { bucket: { type: "string" }, prefix: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 1000 } },
      required: ["bucket"],
    },
  },
  {
    name: "avt_budgets",
    description: "Budgets for paid calls: approved amount, committed so far, remaining, status.",
    inputSchema: { type: "object", properties: { project_id: { type: "string" } } },
  },
  {
    name: "avt_budget_request",
    description: "Ask the owner to approve a budget for a video (it stays pending until he approves it in AVT Settings → AI budgets).",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", description: 'e.g. "Interrupted Broadcast — candidate 4 stills + 6 clips"' },
        usd: { type: "number", exclusiveMinimum: 0 },
        project_id: { type: "string" },
        note: { type: "string", description: "the plan and how the amount was worked out" },
      },
      required: ["label", "usd"],
    },
  },
  {
    name: "avt_spend",
    description: "The paid calls made against a budget, newest first.",
    inputSchema: { type: "object", properties: { budget_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 } }, required: ["budget_id"] },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];
export const TOOL_NAMES = new Set<string>(TOOLS.map((t) => t.name));
