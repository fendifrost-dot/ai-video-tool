// AVT edge function — avt-mcp (AVT as an MCP server for Claude, ChatGPT and Grok)
//
// An outside AI connects here (MCP over streamable HTTP, JSON responses) with a MACHINE CREDENTIAL the owner created
// in AVT Settings → Machine credentials (batch_credentials). This function exchanges it for an ORDINARY user session
// through batch-token-proxy (rate limit + audit there) and then does everything as that user: table reads and writes
// through PostgREST (row-level security holds), files through Storage, generation through AVT's own edge functions.
// Nothing downstream learns this function exists. The session leaves it in exactly one way: avt_browser_session
// hands the ACCESS token (never the refresh token) to a headless browser that presses the app — see browserSession.
//
// Money: no budgets or caps here, by the owner's decision (8 Oct 2026) — spend is controlled on the provider
// accounts themselves. Every call is still the owner's own session, audited by batch_credential_mints.
//
// The credential may arrive as x-batch-secret, an Authorization bearer, the last path segment
// (/functions/v1/avt-mcp/<secret>) for clients that only take a URL, or ?key=.
//
// verify_jwt = false in config.toml: callers hold a machine credential, not a Supabase JWT.
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { FUNCTION_DOCS, KNOWN_TABLES } from "./catalog.generated.ts";
import { editGet, editList, editRender, editSave } from "./editTools.ts";
import type { EditSequence, RenderAspect, RenderKind } from "../edit-render/model.ts";
import {
  RPC,
  RPC_ALLOWED,
  TABLE_NOTES,
  TOOLS,
  TOOL_NAMES,
  credentialFrom,
  functionPolicy,
  initializeResult,
  isRpcRequest,
  namesRowsById,
  parseFilters,
  rpcError,
  rpcResult,
  tableAccess,
  toolText,
  validColumn,
  validSelect,
  type Filter,
  type RpcRequest,
  type RpcResponse,
} from "./contract.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-batch-secret, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Session = { accessToken: string; refreshToken: string; expiresAt: number; userId: string; credentialId: string };
// First-level cache only: one isolate serves several requests, and a valid token here saves even the proxy
// round trip. It is NOT the fix for minting — it cannot be. A Supabase isolate is recycled constantly, so a
// conversation lands on a cold one with an empty Map on most calls, which is what produced the mint storm
// ("120 mints per 3600s per credential", 9 Oct 2026). The session that survives an isolate lives in
// batch_credential_sessions, and batch-token-proxy is the one thing that reuses, refreshes and mints it.
const sessions = new Map<string, Session>();

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

class ToolError extends Error {}

type Ctx = {
  url: string;
  anonKey: string;
  secret: string;
  session: Session;
  // deno-lint-ignore no-explicit-any
  user: any;
};

async function sessionFor(secret: string, url: string, anonKey: string): Promise<Session> {
  const key = await sha256Hex(secret);
  const now = Date.now() / 1000;
  const cached = sessions.get(key);
  if (cached && cached.expiresAt - now > 60) return cached;
  // Deliberately NOT refreshing here. Supabase rotates the refresh token, so a refresh from this isolate would
  // invalidate the one stored in batch_credential_sessions and force the proxy to mint on the next cold start —
  // two places renewing one session, each breaking the other. Asking the proxy instead costs one local call and
  // keeps the session's lifecycle in exactly one place; it answers `reused`, `refreshed` or `minted`.
  sessions.delete(key);
  const res = await fetch(`${url}/functions/v1/batch-token-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}`, "x-batch-secret": secret },
    body: JSON.stringify({ action: "session" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.accessToken) {
    const detail = body?.detail ?? body?.error ?? `HTTP ${res.status}`;
    throw new AuthError(res.status === 429 ? 429 : 401, `credential refused: ${detail}`);
  }
  const s: Session = { accessToken: body.accessToken, refreshToken: body.refreshToken, expiresAt: body.expiresAt ?? now + 3000, userId: body.userId, credentialId: body.credentialId };
  sessions.set(key, s);
  return s;
}

class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ------------------------------------------------------------------------------------------------------ tools

/**
 * A sign-in for a headless browser that drives the app (scripts/agent-browser/avt-press.mjs): the parts of the
 * storyboard that only run in a browser (the composite lane's WebCodecs render, the dialogs) become pressable by the
 * AI without a person at the keyboard.
 *
 * What leaves here is the owner's ACCESS token only — the same session this server already acts with — never the
 * refresh token: a browser holding the refresh token would rotate it and race batch-token-proxy for the one stored
 * session, and without it the sign-in simply ends when the token expires (an hour at most). The proxy audits the
 * hand-out as `[browser]` in batch_credential_mints. The owner is the credential's, as everywhere: nothing in the
 * request names a user.
 */
async function browserSession(ctx: Ctx) {
  const res = await fetch(`${ctx.url}/functions/v1/batch-token-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}`, "x-batch-secret": ctx.secret },
    body: JSON.stringify({ action: "session", purpose: "browser" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.accessToken) throw new ToolError(`no browser session: ${body?.detail ?? body?.error ?? `HTTP ${res.status}`}`);
  const { data: who } = await ctx.user.auth.getUser(body.accessToken);
  if (!who?.user || who.user.id !== ctx.session.userId) throw new ToolError("the session does not belong to this credential's owner");
  const expiresAt = typeof body.expiresAt === "number" && Number.isFinite(body.expiresAt) ? body.expiresAt : null;
  if (!expiresAt) throw new ToolError("the session came back without an expiry");
  const ref = new URL(ctx.url).hostname.split(".")[0];
  // only what supabase-js needs to boot the app signed in — the rest of the record would sit in the AI vendor's
  // transcript for nothing
  const u = who.user;
  return {
    access_token: body.accessToken,
    token_type: "bearer",
    expires_at: expiresAt,
    expires_in: Math.max(0, Math.floor(expiresAt - Date.now() / 1000)),
    user: { id: u.id, aud: u.aud, role: u.role, email: u.email ?? null, is_anonymous: u.is_anonymous ?? false },
    supabase_url: ctx.url,
    storage_key: `sb-${ref}-auth-token`,
    source: body.source ?? null,
    note: "access token only: the sign-in ends when it expires; no refresh token is issued",
  };
}

function arg<T>(args: Record<string, unknown>, k: string): T {
  return args[k] as T;
}

function tableOrThrow(table: unknown, need: "read" | "write"): string {
  if (typeof table !== "string") throw new ToolError("table is required");
  const access = tableAccess(table, KNOWN_TABLES);
  if (!access) throw new ToolError(`no table "${table}" here — avt_tables lists them`);
  if (need === "write" && access !== "write") throw new ToolError(`"${table}" is read-only through this server`);
  return table;
}

function filtersOrThrow(raw: unknown): Filter[] {
  const p = parseFilters(raw);
  if (!p.ok) throw new ToolError(p.error);
  return p.filters;
}

// deno-lint-ignore no-explicit-any
function applyFilters(q: any, filters: Filter[]) {
  for (const f of filters) {
    if (f.op === "in") q = q.in(f.column, f.value as unknown[]);
    else if (f.op === "contains") q = q.contains(f.column, f.value);
    else if (f.op === "is") q = q.is(f.column, f.value);
    else q = q.filter(f.column, f.op, f.value);
  }
  return q;
}

function dbResult({ data, error }: { data: unknown; error: { message: string } | null }) {
  if (error) throw new ToolError(error.message);
  return data;
}

async function callFunction(ctx: Ctx, args: Record<string, unknown>) {
  const name = arg<string>(args, "function");
  const body = (arg<Record<string, unknown>>(args, "body") ?? {}) as Record<string, unknown>;
  const method = arg<string>(args, "method") === "GET" ? "GET" : "POST";
  const policy = typeof name === "string" ? functionPolicy(name, FUNCTION_DOCS.map((f) => f.name)) : null;
  if (!policy) throw new ToolError(`no function "${name}" — avt_functions lists them`);
  if (policy.access === "blocked") throw new ToolError(`"${name}" cannot be called from here: ${policy.why}`);

  const target = new URL(`${ctx.url}/functions/v1/${name}`);
  if (method === "GET") for (const [k, v] of Object.entries(body)) target.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  let status = 0;
  let answer: unknown = null;
  try {
    const res = await fetch(target, {
      method,
      headers: { "Content-Type": "application/json", apikey: ctx.anonKey, Authorization: `Bearer ${ctx.session.accessToken}` },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    try {
      answer = JSON.parse(text);
    } catch {
      answer = text.length > 20000 ? `${text.slice(0, 20000)}…` : text;
    }
  } catch (e) {
    answer = { error: "function_unreachable", detail: e instanceof Error ? e.message : String(e) };
  }

  const failed = status < 200 || status >= 300 || (answer && typeof answer === "object" && (answer as { ok?: unknown }).ok === false);
  return toolText({ function: name, http_status: status, answer }, !!failed);
}

async function runTool(ctx: Ctx, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "avt_whoami": {
      const { data: cred } = await ctx.user.from("batch_credentials").select("id, label, created_at, expires_at").eq("id", ctx.session.credentialId).maybeSingle();
      const { data: who } = await ctx.user.auth.getUser(ctx.session.accessToken);
      const base = { user_id: ctx.session.userId, email: who?.user?.email ?? null, credential: cred };
      if (args.browser_session === true) return toolText({ ...base, browser_session: await browserSession(ctx) });
      return toolText(base);
    }
    case "avt_browser_session":
      return toolText(await browserSession(ctx));
    case "avt_tables":
      return toolText(
        KNOWN_TABLES.map((t) => ({ table: t, access: tableAccess(t, KNOWN_TABLES), about: TABLE_NOTES[t] ?? null })).filter((t) => t.access),
      );
    case "avt_select": {
      const table = tableOrThrow(args.table, "read");
      const columns = args.columns === undefined ? "*" : args.columns;
      if (!validSelect(columns)) throw new ToolError("bad columns list");
      const limit = Math.min(Math.max(Number(args.limit ?? 50) || 50, 1), 500);
      let q = applyFilters(ctx.user.from(table).select(columns as string), filtersOrThrow(args.filters));
      const order = args.order as { column?: string; ascending?: boolean } | undefined;
      if (order?.column) {
        if (!validColumn(order.column)) throw new ToolError("bad order column");
        q = q.order(order.column, { ascending: order.ascending !== false });
      }
      return toolText(dbResult(await q.limit(limit)));
    }
    case "avt_insert": {
      const table = tableOrThrow(args.table, "write");
      const rows = args.rows;
      if (!Array.isArray(rows) || rows.length === 0 || rows.length > 50) throw new ToolError("rows must be 1–50 objects");
      return toolText(dbResult(await ctx.user.from(table).insert(rows).select()));
    }
    case "avt_update": {
      const table = tableOrThrow(args.table, "write");
      const filters = filtersOrThrow(args.filters);
      if (!namesRowsById(filters)) throw new ToolError("name the rows by id (a filter on id with eq or in)");
      if (!args.values || typeof args.values !== "object" || Array.isArray(args.values)) throw new ToolError("values must be an object");
      return toolText(dbResult(await applyFilters(ctx.user.from(table).update(args.values), filters).select()));
    }
    case "avt_delete": {
      const table = tableOrThrow(args.table, "write");
      if (args.confirm !== true) throw new ToolError("deleting needs confirm: true");
      const filters = filtersOrThrow(args.filters);
      if (!namesRowsById(filters)) throw new ToolError("name the rows by id (a filter on id with eq or in)");
      return toolText({ deleted: dbResult(await applyFilters(ctx.user.from(table).delete(), filters).select("id")) });
    }
    case "avt_rpc": {
      const fn = arg<string>(args, "name");
      if (!RPC_ALLOWED.has(fn)) throw new ToolError(`database function "${fn}" is not callable here (${[...RPC_ALLOWED].join(", ")})`);
      return toolText(dbResult(await ctx.user.rpc(fn, (args.args as Record<string, unknown>) ?? {})));
    }
    case "avt_functions": {
      const names = FUNCTION_DOCS.map((f) => f.name);
      // A client whose tool list predates avt_browser_session cannot call it, and some clients drop arguments
      // their cached schema does not declare (so avt_whoami's flag never arrives). `name` is declared here and
      // always forwarded: asking this catalogue for the tool by name performs it. Verified 16 Oct 2026.
      if (args.name === "avt_browser_session") return toolText(await browserSession(ctx));
      if (typeof args.name === "string") {
        const doc = FUNCTION_DOCS.find((f) => f.name === args.name);
        if (!doc) throw new ToolError(`no function "${args.name}"`);
        return toolText({ ...functionPolicy(doc.name, names), notes: doc.notes, request: doc.request || "(no request type declared — see notes)" });
      }
      return toolText(
        FUNCTION_DOCS.map((f) => ({ ...functionPolicy(f.name, names), summary: f.notes.split("\n")[0] })),
      );
    }
    case "avt_call":
      return await callFunction(ctx, args);
    case "avt_montage": {
      // the storyboard's Montage button as a server call (montage-shot); the same policy and answer as avt_call
      const body: Record<string, unknown> = { projectId: args.project_id };
      if (typeof args.shot_id === "string") body.shotId = args.shot_id;
      if (typeof args.shot_key === "string") body.shotKey = args.shot_key;
      if (typeof args.variation_id === "string") body.variationId = args.variation_id;
      if (typeof args.lines === "string") body.lines = args.lines;
      if (args.dry_run === true) body.dryRun = true;
      return await callFunction(ctx, { function: "montage-shot", body });
    }
    case "avt_signed_url": {
      const expires = Math.min(Math.max(Number(args.expires_in ?? 3600) || 3600, 60), 86400);
      const { data, error } = await ctx.user.storage.from(String(args.bucket)).createSignedUrl(String(args.path), expires);
      if (error) throw new ToolError(error.message);
      return toolText({ url: data.signedUrl, expires_in: expires });
    }
    case "avt_list_files": {
      const limit = Math.min(Math.max(Number(args.limit ?? 100) || 100, 1), 1000);
      const { data, error } = await ctx.user.storage.from(String(args.bucket)).list(typeof args.prefix === "string" ? args.prefix : "", { limit });
      if (error) throw new ToolError(error.message);
      return toolText(data);
    }
    case "avt_edit_list":
      return toolText(await editList(ctx.user, String(args.project_id ?? "")));
    case "avt_edit_get":
      return toolText(await editGet(ctx.user, String(args.sequence_id ?? "")));
    case "avt_edit_save": {
      const sequence = args.sequence as EditSequence;
      if (!sequence || typeof sequence !== "object" || !sequence.projectId) throw new ToolError("sequence.projectId is required");
      return toolText(await editSave(ctx.user, sequence, args.commit === true));
    }
    case "avt_edit_render":
      return toolText(
        await editRender(ctx.user, {
          sequenceId: String(args.sequence_id ?? ""),
          dryRun: args.dry_run !== false,
          kind: args.kind as RenderKind | undefined,
          aspect: args.aspect as RenderAspect | undefined,
        }),
      );
  }
  throw new ToolError(`unknown tool ${name}`);
}

// ------------------------------------------------------------------------------------------------------ protocol

async function answer(msg: RpcRequest, ctx: Ctx): Promise<RpcResponse | null> {
  const id = msg.id ?? null;
  if (msg.id === undefined) return null; // a notification: nothing to answer
  switch (msg.method) {
    case "initialize":
      return rpcResult(id, initializeResult(msg.params?.protocolVersion));
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      if (!TOOL_NAMES.has(name)) return rpcError(id, RPC.invalidParams, `unknown tool ${name}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        return rpcResult(id, await runTool(ctx, name, args));
      } catch (e) {
        if (e instanceof ToolError) return rpcResult(id, toolText({ error: e.message }, true));
        const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        console.error("avt-mcp tool_failed", name, detail);
        return rpcResult(id, toolText({ error: "tool_failed", detail }, true));
      }
    }
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
  }
  return rpcError(id, RPC.methodNotFound, `method ${msg.method} is not supported`);
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // no server-initiated stream: every answer comes back on the POST that asked
  if (req.method !== "POST") return json(405, { error: "method_not_allowed", detail: "POST JSON-RPC to this URL" });

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!url || !anonKey) return json(500, { error: "server_misconfigured" });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(400, rpcError(null, RPC.parse, "invalid JSON"));
  }

  const secret = credentialFrom(req);
  if (!secret)
    return json(401, rpcError(null, RPC.invalidRequest, "missing credential: create one in AVT Settings → Machine credentials and send it as a bearer token, x-batch-secret, or at the end of this URL"));

  let session: Session;
  try {
    session = await sessionFor(secret, url, anonKey);
  } catch (e) {
    if (e instanceof AuthError) return json(e.status, rpcError(null, RPC.invalidRequest, e.message));
    throw e;
  }
  const ctx: Ctx = {
    url,
    anonKey,
    secret,
    session,
    user: createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${session.accessToken}` } }, auth: { persistSession: false, autoRefreshToken: false } }),
  };

  const batch = Array.isArray(payload);
  const messages = batch ? (payload as unknown[]) : [payload];
  const out: RpcResponse[] = [];
  for (const m of messages) {
    if (!isRpcRequest(m)) {
      out.push(rpcError(null, RPC.invalidRequest, "not a JSON-RPC 2.0 request"));
      continue;
    }
    const r = await answer(m, ctx);
    if (r) out.push(r);
  }
  if (out.length === 0) return new Response(null, { status: 202, headers: corsHeaders });
  return json(200, batch ? out : out[0]);
}

serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("avt-mcp unhandled_exception", detail);
    return json(500, { error: "unhandled_exception", detail });
  }
});
