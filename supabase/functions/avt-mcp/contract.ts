// avt-mcp — the pure half: the MCP wire protocol, the tools and their arguments, which tables and functions an
// outside AI may reach. No network or database here, so all of it
// is unit-tested (contract.test.ts); index.ts does the I/O.

export const SERVER_NAME = "avt";
export const SERVER_VERSION = "1.4.0";
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const INSTRUCTIONS = [
  "AVT (AI Video Tool) — Fendi's film production app. You act as the owner, through a machine credential.",
  "Read and edit anything in his projects with avt_select / avt_insert / avt_update / avt_delete (row-level security still applies).",
  "Generate and edit pictures and video by calling AVT's own edge functions with avt_call; avt_functions lists them with the request each one takes.",
  "Generation is billed to the owner's provider accounts at list price; prefer a dryRun first where a function offers one.",
  "Projects: video_projects; boards: shots (per video_variations); casting/continuity: continuity_entities; generated files: project_assets + provider_jobs.",
  "Put bytes into Storage with avt_upload_asset (a signed upload URL, or base64 up to 50 MB). It does not call a paid provider. The same tool's description is the recipe for filing a project_assets row and swapping a shot's primary.",
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

/** Never reachable from the generic tools: credentials. */
export const HIDDEN_TABLES = new Set(["batch_credentials", "batch_credential_mints"]);
/** Readable, never writable from the generic tools: server-side configuration. */
export const READ_ONLY_TABLES = new Set(["provider_capabilities", "job_runner_config", "generation_feasibility", "mcp_upload_events"]);
/** RPCs an AI may call. claim_provider_jobs belongs to the job runner, not to a client. */
export const RPC_ALLOWED = new Set(["duplicate_variation", "lyric_lines_in_window"]);

export const TABLE_NOTES: Record<string, string> = {
  video_projects: "a song/video project (treatment_json holds the treatment; active_variation_id the board in use)",
  video_variations: "one storyboard variation of a project (candidates live here)",
  shots: "the board's shots: generated_json (writer's spec), override_json (director's edits; override_json.reframe = {scale 1–3, x, y 0–1} is the edit's punch-in on the shot's media, applied by Review and the render), spec_json, shot_number, variation_id",
  shot_overrides: "per-shot director overrides",
  continuity_entities: "cast (kind=character), continuity (location/prop/lighting) and outfits (kind=outfit: garment_feature_ids, version): description, approved_asset_id, reference_asset_ids",
  variation_scenes: "a video's scenes: a stretch of the song (start_seconds..end_seconds) wearing one outfit (outfit_key)",
  project_assets: "every file in a project (stills, clips, references): file_url is the storage path; metadata_json.bucket is the bucket",
  shot_asset_assignments: "which asset is placed on which shot. is_primary true is the one the box shows; false keeps it as an alternate",
  mcp_upload_events: "append-only ledger of avt_upload_asset calls (record_mcp_upload). Readable here, not writable",
  provider_jobs: "every generation job: status, request/response payloads, cost, result_asset_id",
  writer_runs: "treatment-writer runs and their evidence",
  lyric_lines: "the song's lyric lines on the song clock",
  song_analyses: "beat grid / sections",
  performance_syncs: "real takes synced to the song clock",
  edit_sequences: "an in-app cut of a project: fps, frame size, song offset. Does not write shots or slip_seconds",
  edit_clips: "clips on a sequence: source in/out, timeline in/out, mouth (performance provenance) camera=recorded|model=generated|lipsync=modified mouth|unknown, placeholder",
  edit_markers: "beat, lyric, lipsync and comment markers on a sequence",
  edit_sequence_versions: "a committed snapshot of a sequence",
  edit_renders: "a queued ffmpeg plan. cost_usd is constrained to 0",
  timeline_items: "edit timeline",
  artists: "artist records",
  artist_assets: "artist pictures (faces, looks)",
  character_features: "the artist's identity/wardrobe pictures (wardrobe.garments)",
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

/** Functions an AI may not call: identity minting, server-to-server callbacks, research harnesses, itself. */
export function blockedFunction(name: string): string | null {
  if (name === "avt-mcp") return "this server";
  if (name === "batch-token-proxy") return "credentials are managed by the owner in AVT Settings";
  if (name.endsWith("-callback")) return "a server-to-server callback, not a client endpoint";
  if (name === "grok-resolution-test" || name === "grok-video-research-proxy") return "a research harness, not a product lane";
  return null;
}

export type FunctionPolicy = { name: string; access: "callable" | "blocked"; why?: string };

export function functionPolicy(name: string, known: readonly string[]): FunctionPolicy | null {
  if (!known.includes(name)) return null;
  const why = blockedFunction(name);
  return why ? { name, access: "blocked", why } : { name, access: "callable" };
}

// ---------------------------------------------------------------------------------------------------- uploads

/** Buckets an MCP upload may write. upload-asset also allows artist-assets and product-assets; this tool does not. */
export const UPLOAD_BUCKETS = ["project-exports", "project-clips", "project-references", "project-audio"] as const;
export type UploadBucket = (typeof UPLOAD_BUCKETS)[number];

/** Decoded-byte cap for mode base64. Larger files use mode signed_url so the bytes never enter the MCP body. */
export const BASE64_MAX_DECODED_BYTES = 50 * 1024 * 1024;

/**
 * Supabase Storage's signed upload token lifetime. createSignedUploadUrl does not take an expiry;
 * the platform default is two hours.
 */
export const SIGNED_UPLOAD_EXPIRES_IN = 7200;

/** finalize downloads the object to hash it. Above this, the caller hashes locally. */
export const FINALIZE_MAX_BYTES = 200 * 1024 * 1024;

const UPLOAD_MODES = ["signed_url", "base64", "finalize"] as const;
export type UploadMode = (typeof UPLOAD_MODES)[number];

export type ParsedUpload =
  | { mode: "signed_url"; bucket: UploadBucket; path: string; upsert: boolean }
  | { mode: "base64"; bucket: UploadBucket; path: string; upsert: boolean; bytes: Uint8Array; contentType: string }
  | { mode: "finalize"; bucket: UploadBucket; path: string };

export type UploadAuditArgs = {
  p_credential_id: string;
  p_bucket: string;
  p_path: string;
  p_bytes: number | null;
  p_sha256: string | null;
  p_mode: UploadMode;
};

/**
 * How to file an uploaded object and make it the shot's primary, leaving the old primary as an alternate.
 * Written from the live row of asset 6f4edd50-90e1-4d1b-a1d8-297c14b14698 (c041 FINAL, read 5 Nov 2026).
 * There is no bucket column and no duration column: both live in metadata_json.
 */
export const FILE_ASSET_RECIPE = [
  "File the object and swap the slot primary with avt_insert and avt_update. No new tool: row level security already lets the owner write these tables, and nothing in the database forces a single primary (the app demotes the old one itself). Do the demotion before the insert.",
  "Reference row: project_assets 6f4edd50-90e1-4d1b-a1d8-297c14b14698. asset_type edited_clip, source_tool manual, approval_status approved, footage_role performance, version_number 1, file_url the owner-prefixed path with no bucket in it, metadata_json.bucket project-exports, metadata_json.duration_seconds 4.0417, metadata_json.sha256, metadata_json.file_size_bytes, metadata_json.derived_from (method, asset_id, source_window), parent_asset_id 7b89d99f-fcb5-4bbb-b93b-c0ba68ec5e59, notes the what-and-why. Its active-board assignment is shot_asset_assignments 6711bed6-f813-4cf4-8d25-f65b585a0947 on variation c067efb9-90af-418e-aa6d-58834f6e19de, shot 0bad80da-e7a4-4edc-a281-8e7cd4a69300: role performance, is_primary true, sort_order 8, source_in_seconds null, source_out_seconds null, slip_seconds 0.",
  "1. avt_whoami. user_id is the path prefix and project_assets.user_id.",
  "2. Find the box. avt_select table shots columns id,spec_key,shot_number,variation_id,project_id filters variation_id eq c067efb9-90af-418e-aa6d-58834f6e19de AND spec_key eq the shot key (c036, c037, c043). spec_key is the column; spec_json.id repeats it. Use that shots.id.",
  "3. avt_insert table project_assets one row: user_id, project_id, shot_id, asset_type (edited_clip for a finished cut, or generated_clip), file_url (the upload path, no bucket prefix), source_tool manual, approval_status (pending until Fendi approves; 6f4edd50 is approved because he had), version_number 1, parent_asset_id (the asset it was made from, or null), footage_role (performance, b_roll, or reference — a silent cutaway is b_roll), metadata_json {bucket, sha256, file_size_bytes, duration_seconds, mime_type, original_filename, derived_from: {method, asset_id, replaced: {asset_id: the previous primary asset, why}}}, notes (what it replaced and why).",
  "4. Read the current primary. avt_select table shot_asset_assignments columns id,asset_id,role,is_primary,sort_order filters shot_id eq that shots.id AND variation_id eq c067efb9-90af-418e-aa6d-58834f6e19de AND is_primary eq true.",
  "5. For each of those ids, avt_update table shot_asset_assignments filters [{column:id, op:eq, value:that id}] values {is_primary: false}. The row stays. Do not avt_delete it. avt_update cannot filter on shot_id alone; it has to name id.",
  "6. avt_insert table shot_asset_assignments one row: project_id, variation_id c067efb9-90af-418e-aa6d-58834f6e19de, shot_id, asset_id (the new project_assets.id), role (performance, b_roll, generated_image, generated_clip, or reference), is_primary true, sort_order (one more than the highest sort_order already on that shot), source_in_seconds null, source_out_seconds null, slip_seconds 0, notes (what it replaced and why). Omit user_id; it defaults to the owner. A null variation_id is filled from the shot by trigger shot_asset_assignments_fill_variation; set it anyway. unique (shot_id, asset_id, role): on conflict, avt_update that existing row to is_primary true instead of inserting another.",
].join(" ");

export function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return crypto.subtle.digest("SHA-256", copy).then((digest) =>
    Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
}

export function resolveUploadBucket(raw: unknown): { ok: true; bucket: UploadBucket } | { ok: false; error: string } {
  if (typeof raw === "string" && (UPLOAD_BUCKETS as readonly string[]).includes(raw)) return { ok: true, bucket: raw as UploadBucket };
  return { ok: false, error: `bucket must be one of ${UPLOAD_BUCKETS.join(", ")}` };
}

/** Owner prefix, no traversal. Rejects another user's first segment, absolute paths, and `..`. */
export function resolveOwnerStoragePath(userId: string, raw: unknown): { ok: true; path: string } | { ok: false; error: string } {
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return { ok: false, error: "the session has no owner id" };
  }
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 1024) return { ok: false, error: "path is required" };
  if (raw !== raw.trim() || /[\u0000-\u001f\\]/.test(raw) || raw.includes("%")) {
    return { ok: false, error: "path must not contain whitespace, encoding, backslashes, or control characters" };
  }
  if (raw.startsWith("/")) return { ok: false, error: `path must start with ${userId}/` };
  const parts = raw.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) {
    return { ok: false, error: "path must not contain '..', '.' or empty segments" };
  }
  if (parts[0] !== userId) return { ok: false, error: `path must start with ${userId}/` };
  if (parts.length < 2) return { ok: false, error: `path must start with ${userId}/ and name a file` };
  return { ok: true, path: parts.join("/") };
}

export function resolveUpsert(raw: unknown): boolean {
  return raw === true;
}

const CONTENT_TYPE_RE = /^[\w.+-]+\/[\w.+-]+$/;

export function resolveContentType(raw: unknown): { ok: true; contentType: string } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, contentType: "application/octet-stream" };
  if (typeof raw !== "string" || raw.length > 200 || !CONTENT_TYPE_RE.test(raw)) return { ok: false, error: "content_type must be a mime type such as video/mp4" };
  return { ok: true, contentType: raw };
}

/** Decode base64 and refuse anything over the cap before the caller has to chunk. */
export function decodeUploadBase64(data: unknown, maxBytes = BASE64_MAX_DECODED_BYTES): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  if (typeof data !== "string" || data.trim().length === 0) return { ok: false, error: "data_base64 is required for mode base64" };
  const clean = data.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) return { ok: false, error: "data_base64 is not valid base64" };
  const pad = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const decoded = (clean.length / 4) * 3 - pad;
  if (decoded > maxBytes) {
    return { ok: false, error: `decoded upload is ${decoded} bytes, over the ${maxBytes} byte cap; use mode "signed_url"` };
  }
  let bin: string;
  try {
    bin = atob(clean);
  } catch {
    return { ok: false, error: "data_base64 is not valid base64" };
  }
  if (bin.length === 0) return { ok: false, error: "data_base64 decoded to an empty file" };
  if (bin.length > maxBytes) {
    return { ok: false, error: `decoded upload is ${bin.length} bytes, over the ${maxBytes} byte cap; use mode "signed_url"` };
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { ok: true, bytes };
}

export function parseUploadRequest(userId: string, args: Record<string, unknown>): { ok: true; request: ParsedUpload } | { ok: false; error: string } {
  const mode = args.mode;
  if (typeof mode !== "string" || !(UPLOAD_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: `mode must be one of ${UPLOAD_MODES.join(", ")}` };
  }
  const bucket = resolveUploadBucket(args.bucket);
  if (!bucket.ok) return bucket;
  const path = resolveOwnerStoragePath(userId, args.path);
  if (!path.ok) return path;
  if (mode === "finalize") return { ok: true, request: { mode: "finalize", bucket: bucket.bucket, path: path.path } };
  const upsert = resolveUpsert(args.upsert);
  if (mode === "signed_url") return { ok: true, request: { mode: "signed_url", bucket: bucket.bucket, path: path.path, upsert } };
  const contentType = resolveContentType(args.content_type);
  if (!contentType.ok) return contentType;
  const bytes = decodeUploadBase64(args.data_base64);
  if (!bytes.ok) return bytes;
  return { ok: true, request: { mode: "base64", bucket: bucket.bucket, path: path.path, upsert, bytes: bytes.bytes, contentType: contentType.contentType } };
}

export function signedUploadResult(bucket: string, path: string, signed: { signedUrl?: unknown; token?: unknown }) {
  if (typeof signed.signedUrl !== "string" || signed.signedUrl.length === 0) throw new Error("signed upload url missing");
  if (typeof signed.token !== "string" || signed.token.length === 0) throw new Error("signed upload token missing");
  return { bucket, path, signed_url: signed.signedUrl, token: signed.token, expires_in: SIGNED_UPLOAD_EXPIRES_IN };
}

export function storedObjectResult(bucket: string, path: string, sizeBytes: number, sha256: string) {
  return { bucket, path, size_bytes: sizeBytes, sha256 };
}

export function uploadAuditArgs(input: { credentialId: string; bucket: string; path: string; bytes: number | null; sha256: string | null; mode: UploadMode }): UploadAuditArgs {
  return {
    p_credential_id: input.credentialId,
    p_bucket: input.bucket,
    p_path: input.path,
    p_bytes: input.bytes,
    p_sha256: input.sha256,
    p_mode: input.mode,
  };
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
    description:
      "Who this server acts as and which credential is in use. Start here. With browser_session: true it also answers what avt_browser_session answers (for a client whose tool list predates that tool).",
    inputSchema: { type: "object", properties: { browser_session: { type: "boolean" } } },
  },
  {
    name: "avt_browser_session",
    description:
      "A short-lived sign-in for a headless browser that drives the app itself (scripts/agent-browser): the owner's access token, when it expires, the user record and the app's auth storage key. No refresh token — it ends with the hour. Audited in batch_credential_mints as [browser].",
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
    description:
      "Every AVT edge function this server can call, or one by name: callable or blocked, its notes and request type. name: \"avt_browser_session\" performs that tool instead (for a client whose tool list predates it or drops undeclared arguments).",
    inputSchema: { type: "object", properties: { name: { type: "string" } } },
  },
  {
    name: "avt_call",
    description: "Call an AVT edge function as the owner. Returns the function's own answer (HTTP status + body). Generation is billed to the owner's provider accounts.",
    inputSchema: {
      type: "object",
      properties: {
        function: { type: "string" },
        body: { type: "object" },
        method: { type: "string", enum: ["POST", "GET"], description: "default POST" },
      },
      required: ["function"],
    },
  },
  {
    name: "avt_montage",
    description:
      "Shoot a performance shot as a fast-cut montage (the storyboard's Montage button, without a browser): its DRESSED take re-shot in the place of its scene's plate in one Seedance 2.5 call, filed on the shot unselected when done. lines = the scenes, one per line, each optionally timed (\"2.0-2.7 s: …\"); absent = the dialog's prefill. About $2.22 list for 4 s. A shot he is NOT in (b-roll) is shot as a montage too: the scene's place and its people (a cast still, worlds/scene_*), no take, lines required, the lines sharing the shot's own seconds (about $1.85 for the 4 s minimum). Never a shot of his shoes or feet, and never a full-body shot of him (waist up or closer). Untimed lines are cut on the song's beats inside the part of the clip the shot plays (one render per shot; docs/recipes/MONTAGE_MUSIC_VIDEO_WORKFLOW.md). dry_run answers with the exact prompt and request and sends nothing.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string" },
        shot_id: { type: "string", description: "shots.id — or give shot_key" },
        shot_key: { type: "string", description: "the shot's spec key, e.g. c042, on the project's active variation (or variation_id)" },
        variation_id: { type: "string" },
        lines: { type: "string" },
        dry_run: { type: "boolean" },
      },
      required: ["project_id"],
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
    name: "avt_upload_asset",
    description:
      "Put a file into Storage as the credential's owner. Cost is $0: this never calls a paid provider. mode signed_url returns {bucket, path, signed_url, token, expires_in} from createSignedUploadUrl on the owner's client (row level security, no service role). PUT the bytes to signed_url, then call mode finalize, which reads the object back and returns {bucket, path, size_bytes, sha256}. mode base64 takes data_base64, capped at 52428800 decoded bytes, and returns {bucket, path, size_bytes, sha256}; over the cap the error says to use signed_url. path must start with the owner's user id and a slash. Rejects another user's prefix, '..', and absolute paths. bucket is project-exports, project-clips, project-references, or project-audio. upsert defaults to false and is honored only when boolean true. Each call writes one mcp_upload_events row (tool avt_upload_asset, credential id, bucket, path, bytes, sha256) through record_mcp_upload. The result includes audit_id. If that function is not deployed yet, the upload still returns, audit_id is null, and audit_error says why. " +
      FILE_ASSET_RECIPE,
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["signed_url", "base64", "finalize"] },
        bucket: { type: "string", enum: ["project-exports", "project-clips", "project-references", "project-audio"] },
        path: { type: "string", description: "Must start with the owner's user id and a slash. No '..' and no leading slash." },
        upsert: { type: "boolean", description: "default false. Only boolean true overwrites." },
        content_type: { type: "string", description: "base64 mode. Default application/octet-stream." },
        data_base64: { type: "string", description: "base64 mode only. Decoded size must be ≤ 52428800 bytes." },
      },
      required: ["mode", "bucket", "path"],
    },
  },
  {
    name: "avt_edit_list",
    description: "List in-app cut sequences for a project. Reads edit_sequences only.",
    inputSchema: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] },
  },
  {
    name: "avt_edit_get",
    description: "One cut sequence with its clips and markers.",
    inputSchema: { type: "object", properties: { sequence_id: { type: "string" } }, required: ["sequence_id"] },
  },
  {
    name: "avt_edit_save",
    description:
      "Insert or replace a cut sequence, its clips and its markers. Does not write shots, assignments, slip_seconds, or performance_syncs. commit: true also stores a snapshot in edit_sequence_versions.",
    inputSchema: {
      type: "object",
      properties: {
        sequence: { type: "object" },
        commit: { type: "boolean" },
      },
      required: ["sequence"],
    },
  },
  {
    name: "avt_edit_render",
    description:
      "Plan an ffmpeg proxy or final for a sequence from the stored clip and song files. dry_run defaults to true and returns the plan, how many real picture inputs resolved, and any missing media. cost_usd is 0. Nothing is generated and no provider is called. dry_run false only queues an edit_renders row; scripts/edit-render.mjs downloads the files, probes them, and runs ffmpeg.",
    inputSchema: {
      type: "object",
      properties: {
        sequence_id: { type: "string" },
        dry_run: { type: "boolean", description: "default true" },
        kind: { type: "string", enum: ["proxy", "final"] },
        aspect: { type: "string", enum: ["9:16", "1:1", "16:9"] },
      },
      required: ["sequence_id"],
    },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];
export const TOOL_NAMES = new Set<string>(TOOLS.map((t) => t.name));
