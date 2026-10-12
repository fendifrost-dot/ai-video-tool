// AVT edge — asset-derivative
//
// Cuts a labelled derivative (a crop) out of one of the caller's own image assets, server-side, and files it as a new
// project_assets row that points back at its source. The original is never modified. Built for the continuity
// experiments (12 Oct 2026): a garment or horse reference with the face cropped away, so a generation request can
// carry the approved portrait as the only face-bearing reference. Free: no provider is called.
//
// Auth: platform verify_jwt plus getUser(); anonymous sessions are refused. The source must be readable by the caller
// (own folder or a legacy grant, see _shared/storageAccess.ts); the derivative is written into the caller's folder.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decode as decodeImage, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import { callerMayRead } from "../_shared/storageAccess.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

import { cleanLabel, headerDimensions, MAX_SOURCE_PIXELS, pixelBox } from "./lib.ts";

type Body = {
  assetId: string;                                   // a project_assets row the caller owns (an image)
  box: { x: number; y: number; w: number; h: number }; // fractions of the source, 0..1, w/h > 0
  label: string;                                     // e.g. "outfit_faceless"; letters, digits, _ and - only
  note?: string;                                     // free text kept on the derivative row
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "", anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "", serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { error: "server_misconfigured" });
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json(401, { error: "missing_bearer" });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: "unauthenticated" });
  if (userData.user.is_anonymous) return json(403, { error: "anonymous_forbidden" });
  const userId = userData.user.id;

  let body: Partial<Body>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (typeof body.assetId !== "string" || !UUID.test(body.assetId)) return json(400, { error: "invalid_asset_id" });
  const label = cleanLabel(body.label);
  if (!label) return json(400, { error: "invalid_label" });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: source, error: srcErr } = await admin.from("project_assets").select("id, user_id, project_id, file_url, asset_type, metadata_json").eq("id", body.assetId).maybeSingle();
  if (srcErr) return json(500, { error: "asset_query_failed" });
  if (!source || source.user_id !== userId) return json(403, { error: "asset_forbidden" });
  const bucket = typeof source.metadata_json?.bucket === "string" ? source.metadata_json.bucket : "project-references";
  const access = await callerMayRead(admin, userId, bucket, source.file_url);
  if (!access.ok) return json(access.reason === "not_owner" ? 403 : 400, { error: access.reason === "not_owner" ? "storage_path_forbidden" : "invalid_storage_path" });

  // Size from object metadata before any download, dimensions from the header before any decode: a service-role
  // worker has 256 MB, and imagescript expands a decoded image to 4 bytes a pixel.
  const dir = source.file_url.slice(0, source.file_url.lastIndexOf("/")), name = source.file_url.slice(source.file_url.lastIndexOf("/") + 1);
  const { data: listed, error: listErr } = await admin.storage.from(bucket).list(dir, { search: name });
  const meta = Array.isArray(listed) ? listed.find((o: { name: string }) => o.name === name) : null;
  if (listErr || !meta) return json(404, { error: "source_object_not_found" });
  const declared = Number(meta.metadata?.size ?? meta.metadata?.contentLength ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) return json(413, { error: "source_too_large", bytes: declared });
  const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(source.file_url);
  if (dlErr || !blob) return json(404, { error: "source_download_failed" });
  if (blob.size > MAX_SOURCE_BYTES) return json(413, { error: "source_too_large", bytes: blob.size });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dims = headerDimensions(bytes);
  if (!dims) return json(415, { error: "source_not_a_still_image" });
  if (dims.width * dims.height > MAX_SOURCE_PIXELS) return json(413, { error: "source_too_many_pixels", width: dims.width, height: dims.height, maxPixels: MAX_SOURCE_PIXELS });
  let image: Image;
  try { const decoded = await decodeImage(bytes); if (!(decoded instanceof Image)) return json(415, { error: "source_not_a_still_image" }); image = decoded; }
  catch { return json(415, { error: "source_not_decodable" }); }
  const px = pixelBox(body.box, image.width, image.height);
  if (!px) return json(400, { error: "invalid_box" });
  const crop = image.clone().crop(px.x, px.y, px.w, px.h);
  const out = await crop.encodeJPEG(92);

  const stamp = Date.now();
  const path = `${userId}/${source.project_id}/derivatives/${source.id}_${label}_${stamp}.jpg`;
  const { error: upErr } = await admin.storage.from(bucket).upload(path, out, { contentType: "image/jpeg", upsert: false });
  if (upErr) return json(502, { error: "derivative_upload_failed", detail: upErr.message });
  const metadata = { bucket, mime_type: "image/jpeg", file_size_bytes: out.byteLength, lane: "derivative", tool: "asset-derivative", derivative_of: source.id, derivative_box: px, derivative_box_fraction: body.box, source_pixels: { width: image.width, height: image.height }, label, note: typeof body.note === "string" ? body.note.slice(0, 500) : null };
  const { data: filed, error: insErr } = await admin.from("project_assets").insert({ user_id: userId, project_id: source.project_id, asset_type: "reference_image", file_url: path, source_tool: "manual", approval_status: "pending", notes: `DERIVATIVE (${label}) of ${source.id}`, metadata_json: metadata }).select("id").maybeSingle();
  // Stored but not recorded: the object stays in the caller's folder for a later filing; the DB code says why (12 Oct: an
  // enum value outside provider_name refused the row and the object was orphaned).
  if (insErr || !filed?.id) return json(500, { error: "asset_record_failed", path, detail: insErr ? `${insErr.code ?? ""} ${insErr.message ?? ""}`.trim().slice(0, 200) : "no row returned" });
  return json(200, { ok: true, assetId: filed.id, path, bucket, bytes: out.byteLength, pixels: { width: px.w, height: px.h }, derivativeOf: source.id });
});
