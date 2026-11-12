// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FUNCTION_DOCS, KNOWN_TABLES } from "./catalog.generated.ts";
import {
  BASE64_MAX_DECODED_BYTES,
  FILE_ASSET_RECIPE,
  SIGNED_UPLOAD_EXPIRES_IN,
  TOOLS,
  credentialFrom,
  decodeUploadBase64,
  functionPolicy,
  grokGate,
  GROK_GENERATION_FUNCTIONS,
  initializeResult,
  isRpcRequest,
  namesRowsById,
  parseDeleteObject,
  parseFileAsset,
  parseFilters,
  parseUploadRequest,
  planFinalizeRead,
  resolveOwnerStoragePath,
  resolveUploadBucket,
  sha256HexBytes,
  signedUploadResult,
  storageMetadataHeader,
  storedObjectResult,
  tableAccess,
  uploadAuditArgs,
  validColumn,
  validSelect,
} from "./contract.ts";

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
  it("hides credentials and keeps server configuration read-only", () => {
    expect(tableAccess("shots", KNOWN_TABLES)).toBe("write");
    expect(tableAccess("provider_capabilities", KNOWN_TABLES)).toBe("read");
    expect(tableAccess("mcp_upload_events", KNOWN_TABLES)).toBe("read");
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
  it("lets every other function through, with no budget or cap", () => {
    expect(functionPolicy("world-still-proxy", NAMES)?.access).toBe("callable");
    expect(functionPolicy("grok-video-edit-proxy", NAMES)?.access).toBe("callable");
    expect(functionPolicy("upload-asset", NAMES)?.access).toBe("callable");
    expect(functionPolicy("proxy-provider-call", NAMES)?.access).toBe("callable");
    expect(functionPolicy("nope", NAMES)).toBeNull();
  });
  it("offers no budget, cap or ledger tool", () => {
    expect(TOOLS.map((t) => t.name).filter((n) => /budget|spend|cap/.test(n))).toEqual([]);
    expect(TOOLS.find((t) => t.name === "avt_call")!.inputSchema.properties).not.toHaveProperty("budget_id");
    expect(TOOLS).toHaveLength(20);
  });
  it("hands a browser an access token only, never a refresh token or a user of the caller's choosing", () => {
    const t = TOOLS.find((t) => t.name === "avt_browser_session")!;
    expect(t.inputSchema.properties).toEqual({});
    expect(t.description).toMatch(/No refresh token/);
    expect(t.description).toMatch(/\[browser\]/);
    expect(TOOLS.find((t) => t.name === "avt_whoami")!.inputSchema.properties).toEqual({ browser_session: { type: "boolean" } });
  });
  it("the hand-out code never touches the refresh token (source-level)", () => {
    const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const start = src.indexOf("async function browserSession(");
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    expect(body).not.toMatch(/refresh_token|refreshToken/);
    expect(body).toMatch(/purpose: "browser"/);
    expect(body).toMatch(/is_anonymous/);
    expect(body).not.toMatch(/identities|phone|user_metadata/);
    // the stale-client bridges: both reach the same function, through a declared argument where needed
    expect(src).toMatch(/args\.name === "avt_browser_session"\) return toolText\(await browserSession\(ctx\)\)/);
    expect(src).toMatch(/args\.browser_session === true\) return toolText\(\{ \.\.\.base, browser_session: await browserSession\(ctx\) \}\)/);
    expect(TOOLS.find((t) => t.name === "avt_functions")!.description).toMatch(/avt_browser_session/);
  });
});

const OWNER = "3ca10935-8c3d-4479-9a0c-8bfe8050840c";
const OTHER = "00000000-0000-0000-0000-0000000000b2";
const HELLO_PATH = `${OWNER}/_mcp_upload_test/hello.bin`;

describe("avt_upload_asset", () => {
  it("describes a $0 upload and the filing recipe, with no budget argument", () => {
    const t = TOOLS.find((t) => t.name === "avt_upload_asset")!;
    expect(t.description).toMatch(/\$0/);
    expect(t.description).toMatch(/never calls a paid provider/);
    expect(t.description).toContain(FILE_ASSET_RECIPE);
    for (const column of [
      "project_assets",
      "file_url",
      "metadata_json",
      "asset_type",
      "source_tool",
      "approval_status",
      "footage_role",
      "shot_asset_assignments",
      "is_primary",
      "variation_id",
      "sort_order",
      "source_in_seconds",
      "c067efb9-90af-418e-aa6d-58834f6e19de",
      "6f4edd50-90e1-4d1b-a1d8-297c14b14698",
    ]) {
      expect(t.description).toContain(column);
    }
    expect(t.description).toMatch(/is_primary: false/);
    expect(t.description).toMatch(/Do not avt_delete/);
    expect(t.inputSchema.properties).not.toHaveProperty("budget_id");
    expect(t.inputSchema.required).toEqual(["mode", "bucket", "path"]);
  });

  it("keeps the path under the owner and rejects another user, '..' and absolute paths", () => {
    expect(resolveOwnerStoragePath(OWNER, HELLO_PATH)).toEqual({ ok: true, path: HELLO_PATH });
    expect(resolveOwnerStoragePath(OWNER, `${OTHER}/hello.bin`)).toMatchObject({ ok: false });
    expect(resolveOwnerStoragePath(OWNER, `${OWNER}/../${OTHER}/hello.bin`)).toMatchObject({ ok: false });
    expect(resolveOwnerStoragePath(OWNER, `${OWNER}/foo/../../${OTHER}/hello.bin`)).toMatchObject({ ok: false });
    expect(resolveOwnerStoragePath(OWNER, `/${OWNER}/hello.bin`)).toMatchObject({ ok: false });
    expect(resolveOwnerStoragePath(OWNER, "/tmp/hello.bin")).toMatchObject({ ok: false });
    expect(resolveOwnerStoragePath(OWNER, `${OWNER}/%2e%2e/hello.bin`)).toMatchObject({ ok: false });
    expect(resolveOwnerStoragePath(OWNER, `${OWNER}\\hello.bin`)).toMatchObject({ ok: false });
    expect(resolveOwnerStoragePath(OWNER, `${OWNER}/hel%lo.bin`)).toMatchObject({ ok: false });
    expect(resolveOwnerStoragePath(OWNER, OWNER)).toMatchObject({ ok: false });
    expect(resolveOwnerStoragePath("not-a-user", HELLO_PATH)).toMatchObject({ ok: false });
  });

  it("allows only the four project buckets", () => {
    for (const bucket of ["project-exports", "project-clips", "project-references", "project-audio"]) {
      expect(resolveUploadBucket(bucket)).toEqual({ ok: true, bucket });
    }
    for (const bucket of ["artist-assets", "product-assets", "project-exports ", "Project-Exports", ""]) {
      expect(resolveUploadBucket(bucket).ok).toBe(false);
    }
  });

  it("rejects base64 over the cap and says to use signed_url", () => {
    expect(BASE64_MAX_DECODED_BYTES).toBe(50 * 1024 * 1024);
    const over = decodeUploadBase64("aGVsbG8=", 4);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toMatch(/signed_url/);
    const ok = decodeUploadBase64("aGVsbG8=");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(Array.from(ok.bytes)).toEqual([104, 101, 108, 108, 111]);
    expect(decodeUploadBase64("")).toMatchObject({ ok: false });
    const parsed = parseUploadRequest(OWNER, { mode: "base64", bucket: "project-exports", path: HELLO_PATH, data_base64: "aGVsbG8=", upsert: "true" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.request.mode === "base64") expect(parsed.request.upsert).toBe(false);
  });

  it("hashes the bytes it would store", async () => {
    const decoded = decodeUploadBase64("aGVsbG8=");
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(await sha256HexBytes(decoded.bytes)).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(await sha256HexBytes(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(storedObjectResult("project-exports", HELLO_PATH, 5, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")).toEqual({
      bucket: "project-exports",
      path: HELLO_PATH,
      size_bytes: 5,
      sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    });
  });

  it("returns the signed upload shape and an audit argument with credential, bucket, path, bytes and sha256", () => {
    expect(signedUploadResult("project-exports", HELLO_PATH, { signedUrl: "https://storage.example/upload", token: "tok" })).toEqual({
      bucket: "project-exports",
      path: HELLO_PATH,
      signed_url: "https://storage.example/upload",
      token: "tok",
      expires_in: SIGNED_UPLOAD_EXPIRES_IN,
    });
    expect(SIGNED_UPLOAD_EXPIRES_IN).toBe(7200);
    expect(() => signedUploadResult("project-exports", HELLO_PATH, { signedUrl: "", token: "tok" })).toThrow(/signed upload url/);
    const signed = parseUploadRequest(OWNER, { mode: "signed_url", bucket: "project-exports", path: HELLO_PATH });
    expect(signed).toEqual({ ok: true, request: { mode: "signed_url", bucket: "project-exports", path: HELLO_PATH, upsert: false } });
    expect(parseUploadRequest(OWNER, { mode: "signed_url", bucket: "project-audio", path: HELLO_PATH, upsert: true })).toMatchObject({
      ok: true,
      request: { upsert: true },
    });
    expect(parseUploadRequest(OWNER, { mode: "finalize", bucket: "project-clips", path: HELLO_PATH })).toEqual({
      ok: true,
      request: { mode: "finalize", bucket: "project-clips", path: HELLO_PATH, expectedSha256: null },
    });
    const HASH = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
    expect(parseUploadRequest(OWNER, { mode: "finalize", bucket: "project-clips", path: HELLO_PATH, expected_sha256: HASH }).ok).toBe(true);
    expect(parseUploadRequest(OWNER, { mode: "finalize", bucket: "project-clips", path: HELLO_PATH, expected_sha256: "abc" }).ok).toBe(false);
    expect(planFinalizeRead({ expectedSha256: null, info: { size: 5, metadata: { sha256: HASH } } })).toEqual({ action: "download" });
    expect(planFinalizeRead({ expectedSha256: HASH, info: { size: 5, metadata: { sha256: HASH } } })).toEqual({ action: "skip", sha256: HASH, sizeBytes: 5 });
    expect(planFinalizeRead({ expectedSha256: HASH, info: { metadata: { sha256: HASH } } })).toEqual({ action: "download" });
    expect(planFinalizeRead({ expectedSha256: HASH, info: { size: 5, metadata: { sha256: "a".repeat(64) } } }).action).toBe("reject");
    expect(planFinalizeRead({ expectedSha256: HASH, info: null })).toEqual({ action: "download" });
    expect(JSON.parse(atob(storageMetadataHeader(HASH)))).toEqual({ sha256: HASH });
    expect(parseUploadRequest(OWNER, { mode: "signed_url", bucket: "artist-assets", path: HELLO_PATH }).ok).toBe(false);
    expect(parseUploadRequest(OTHER, { mode: "finalize", bucket: "project-exports", path: HELLO_PATH }).ok).toBe(false);
    expect(
      uploadAuditArgs({
        credentialId: "b1000000-0000-0000-0000-000000000001",
        bucket: "project-exports",
        path: HELLO_PATH,
        bytes: 5,
        sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        mode: "base64",
      }),
    ).toEqual({
      p_credential_id: "b1000000-0000-0000-0000-000000000001",
      p_bucket: "project-exports",
      p_path: HELLO_PATH,
      p_bytes: 5,
      p_sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      p_mode: "base64",
    });
  });

  it("uploads with the owner's storage client and records the ledger, never a service role (source-level)", () => {
    const src = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const start = src.indexOf("function ownerStorageHeaders(");
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf("\nasync function callFunction(", start));
    expect(body).toContain("async function uploadAsset(");
    expect(body).toContain("x-metadata");
    expect(body).toContain("object/info/");
    expect(body).toContain("file_mcp_asset");
    expect(body).toContain(".remove(");
    expect(src).toContain('case "avt_delete_object"');
    expect(src).toContain('case "avt_file_asset"');
    expect(body).toContain("createSignedUploadUrl");
    expect(body).toContain("record_mcp_upload");
    expect(body).toContain("sha256HexBytes");
    expect(body).not.toMatch(/SERVICE_ROLE|service_role|createClient\(/);
    expect(body).not.toMatch(/functions\/v1\//);
    expect(src).toContain('case "avt_upload_asset"');
  });
});

describe("avt_file_asset and avt_delete_object", () => {
  it("files one asset and swaps the primary without a service role or a generic rpc", () => {
    const t = TOOLS.find((tool) => tool.name === "avt_file_asset")!;
    expect(t.description).toMatch(/\$0/);
    expect(t.description).toMatch(/one database transaction/);
    expect(t.description).toContain("project_assets");
    expect(t.description).toContain("is_primary");
    expect(t.inputSchema.required).toEqual(["project_id", "shot_id", "variation_id", "asset_type", "file_url", "source_tool", "footage_role", "role"]);
    const filed = parseFileAsset(OWNER, {
      project_id: "764a63d2-93cd-44f3-905f-292f14ab2f51",
      shot_id: "0bad80da-e7a4-4edc-a281-8e7cd4a69300",
      variation_id: "c067efb9-90af-418e-aa6d-58834f6e19de",
      asset_type: "edited_clip",
      file_url: HELLO_PATH,
      source_tool: "manual",
      footage_role: "b_roll",
      role: "b_roll",
      source_in_seconds: 0,
      source_out_seconds: 1.5,
      metadata_json: { bucket: "project-exports", sha256: "ab" },
    });
    expect(filed.ok).toBe(true);
    if (filed.ok) {
      expect(filed.args.p_approval_status).toBe("pending");
      expect(filed.args.p_source_in_seconds).toBe(0);
      expect(filed.args.p_source_out_seconds).toBe(1.5);
      expect(filed.args.p_slip_seconds).toBe(0);
      expect(filed.args.p_file_url).toBe(HELLO_PATH);
    }
    expect(parseFileAsset(OTHER, { ...{ project_id: "764a63d2-93cd-44f3-905f-292f14ab2f51", shot_id: "0bad80da-e7a4-4edc-a281-8e7cd4a69300", variation_id: "c067efb9-90af-418e-aa6d-58834f6e19de", asset_type: "edited_clip", file_url: HELLO_PATH, source_tool: "manual", footage_role: "b_roll", role: "b_roll" } }).ok).toBe(false);
    expect(parseFileAsset(OWNER, { project_id: "764a63d2-93cd-44f3-905f-292f14ab2f51", shot_id: "0bad80da-e7a4-4edc-a281-8e7cd4a69300", variation_id: "c067efb9-90af-418e-aa6d-58834f6e19de", asset_type: "edited_clip", file_url: `${OWNER}/x.bin`, source_tool: "manual", footage_role: "nope", role: "b_roll" }).ok).toBe(false);
  });

  it("deletes only under the owner's prefix and the same buckets", () => {
    const t = TOOLS.find((tool) => tool.name === "avt_delete_object")!;
    expect(t.description).toMatch(/\$0/);
    expect(t.description).toMatch(/avt_delete_object/);
    expect(parseDeleteObject(OWNER, { bucket: "project-exports", path: HELLO_PATH })).toEqual({ ok: true, bucket: "project-exports", path: HELLO_PATH });
    expect(parseDeleteObject(OWNER, { bucket: "project-exports", path: `${OTHER}/hello.bin` }).ok).toBe(false);
    expect(parseDeleteObject(OWNER, { bucket: "artist-assets", path: HELLO_PATH }).ok).toBe(false);
    expect(parseDeleteObject(OWNER, { bucket: "project-exports", path: `${OWNER}/hel%lo.bin` }).ok).toBe(false);
  });
});

describe("the generated catalog", () => {
  it("is up to date with the functions and tables in the repo", () => {
    expect(() => execFileSync("node", [resolve(__dirname, "../../../scripts/mcp/build-catalog.mjs"), "--check"], { stdio: "pipe" })).not.toThrow();
  });
});

describe("the function can actually boot", () => {
  // supabase/functions/** is outside tsconfig.json's `include`, so nothing typechecks these files and a stale
  // import lands as a Deno module-resolution error at deploy — the connector stops answering with no local
  // signal. The same guard lives in batch-token-proxy/contract.test.ts, where it caught two dead imports left
  // behind when the mint rate limit was deleted (9 Oct 2026).
  const here = dirname(fileURLToPath(import.meta.url));
  it("imports from contract.ts only what contract.ts exports", () => {
    const indexSource = readFileSync(resolve(here, "./index.ts"), "utf8");
    const contract = readFileSync(resolve(here, "./contract.ts"), "utf8");
    const block = indexSource.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/contract\.ts"/);
    expect(block, "index.ts should import from ./contract.ts").not.toBeNull();
    const imported = block![1]
      .split(",")
      .map((x) => x.replace(/\btype\b/, "").trim())
      .filter(Boolean);
    const missing = imported.filter(
      (name) => !new RegExp(`export\\s+(async\\s+)?(const|function|type|class)\\s+${name}\\b`).test(contract),
    );
    expect(missing, `imported from contract.ts but not exported by it: ${missing.join(", ")}`).toEqual([]);
  });

  it("renews its session through the proxy, never on its own", () => {
    // Two places refreshing one session rotate the refresh token out from under each other: a local refresh
    // here would invalidate the one stored in batch_credential_sessions and force a mint on the next cold
    // start — reintroducing the storm this was meant to end.
    const indexSource = readFileSync(resolve(here, "./index.ts"), "utf8");
    expect(indexSource).not.toContain("refreshSession");
    expect(indexSource).toContain("batch-token-proxy");
  });
});

describe("grokGate (Fendi, 9 and 12 Nov 2026: Grok is his call)", () => {
  const ok = "Fendi, 12 Nov: use Grok for the hyena plate";
  it("refuses a Grok b-roll without his words, names the Gemini and Seedance routes and Grok Imagine", () => {
    const why = grokGate("grok-broll-proxy", { projectId: "p", prompt: "x" }, undefined);
    expect(why).toMatch(/gemini-nano-banana-2\.1/);
    expect(why).toMatch(/montage-shot/);
    expect(why).toMatch(/Grok Imagine/);
  });
  it("refuses world-still-proxy without the Gemini model, and with a Grok model", () => {
    expect(grokGate("world-still-proxy", { prompt: "x" }, undefined)).not.toBeNull();
    expect(grokGate("world-still-proxy", { prompt: "x", model: "grok-imagine-image-2.0" }, undefined)).not.toBeNull();
  });
  it("lets Gemini stills, Seedance, Genjutsu and every non-Grok function through", () => {
    expect(grokGate("world-still-proxy", { prompt: "x", model: "gemini-nano-banana-2.1" }, undefined)).toBeNull();
    expect(grokGate("montage-shot", {}, undefined)).toBeNull();
    expect(grokGate("dress-clip", {}, undefined)).toBeNull();
    expect(grokGate("grok-voice-director-proxy", {}, undefined)).toBeNull();
  });
  it("keeps Grok possible: a dry run, a poll of a running job, a Gemini recovery, or his quoted approval", () => {
    expect(grokGate("grok-broll-proxy", { dryRun: true }, undefined)).toBeNull();
    expect(grokGate("grok-broll-proxy", { mode: "poll", requestId: "r" }, undefined)).toBeNull();
    expect(grokGate("world-still-proxy", { recoverJobRowId: "j" }, undefined)).toBeNull();
    for (const fn of GROK_GENERATION_FUNCTIONS) expect(grokGate(fn, {}, ok)).toBeNull();
    expect(grokGate("world-still-proxy", { prompt: "x" }, ok)).toBeNull();
  });
  it("does not take a token for his words", () => {
    expect(grokGate("grok-broll-proxy", {}, "yes")).not.toBeNull();
    expect(grokGate("grok-broll-proxy", {}, "   ")).not.toBeNull();
  });
  it("every gated name is a real AVT function", () => {
    for (const fn of GROK_GENERATION_FUNCTIONS) expect(FUNCTION_DOCS.map((f) => f.name)).toContain(fn);
  });
});
