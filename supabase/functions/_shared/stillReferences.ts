// The reference pictures a storyboard still is drawn with — checked here, on the server, before anything is signed or
// paid for. The pure half of world-still-proxy's reference delivery (tested in stillReferences.test.ts).
//
// A reference names a RECORD, never a path or a URL: a project asset (project_assets.id) or one of the artist's
// pictures (character_features.id). The server looks each one up, holds it to the caller (the asset must be in the
// project the caller owns; the picture must belong to one of the caller's artists), takes only images, and signs only
// in the buckets those records live in. Anything that fails is refused by name and nothing is generated — a picture
// is never dropped quietly and the request never goes ahead with fewer than it was asked for.

export type ReferenceRequest = { source: "project_asset" | "character_feature"; id: string; role: string; label: string };

/** Where an asset's or a picture's file may be signed from. Nothing else is reachable through this route. */
export const ASSET_BUCKETS = ["project-references", "project-clips"] as const;
/** Where the artist's pictures live, by kind: wardrobe in wardrobe-refs, everything else (face, hair, Character DNA) in artist-assets. */
export const WARDROBE_BUCKET = "wardrobe-refs";
export const ARTIST_BUCKET = "artist-assets";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(["screen", "position", "place", "garment", "cast", "prop"]);
/** A request carrying more than this is malformed whatever the provider's limit (the cap check comes after). */
const MAX_LISTED = 12;

export function parseReferenceRequest(raw: unknown): { refs: ReferenceRequest[]; error: string | null } {
  if (raw === undefined || raw === null) return { refs: [], error: null };
  if (!Array.isArray(raw)) return { refs: [], error: "references must be a list" };
  if (raw.length > MAX_LISTED) return { refs: [], error: `at most ${MAX_LISTED} references may be listed` };
  const refs: ReferenceRequest[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const source = o.source === "project_asset" || o.source === "character_feature" ? o.source : null;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const role = typeof o.role === "string" && ROLES.has(o.role) ? o.role : null;
    if (!source || !UUID_RE.test(id) || !role) return { refs: [], error: "each reference needs a source (project_asset | character_feature), a record id and a known role" };
    if (refs.some((x) => x.source === source && x.id === id)) return { refs: [], error: `reference ${id} is listed twice` };
    refs.push({ source, id, role, label: typeof o.label === "string" ? o.label.slice(0, 120) : "" });
  }
  return { refs, error: null };
}

export type AssetRow = { id: string; project_id: string; file_url: string | null; asset_type: string | null; metadata_json: unknown };
export type FeatureRow = { id: string; artist_id: string; storage_path: string | null; file_url: string | null; feature_type?: string | null };

/**
 * The row is the caller's — but the row names a FILE, and the row is written by the client. So the file itself must
 * sit in the folder that belongs to what the row belongs to: a project asset under `<uid>/<projectId>/…`, an artist's
 * picture under `<uid>/<artistId>/…`. (Storage writes are scoped to the writer's own first segment, so a file in the
 * caller's project or artist folder was put there for that project or artist. The first segment is not required to
 * be today's uid: older files sit under an earlier anonymous uid — RISK-002.) A row pointing anywhere else is refused.
 */
export function inFolderOf(path: string, ownerId: string): boolean {
  const parts = path.split("/");
  return parts.length >= 3 && parts[1] === ownerId && parts.every((p) => p !== "" && p !== "." && p !== "..");
}

export type ResolvedReference = { ref: ReferenceRequest; path: string; buckets: readonly string[] };

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/**
 * Hold every reference to the caller. `assets` are the project_assets rows looked up by id; `features` the
 * character_features rows; `ownArtists` the ids of the caller's artists. Order is kept (it is the <IMAGE_n> order).
 */
export function resolveReferences(
  refs: readonly ReferenceRequest[],
  input: { projectId: string; assets: readonly AssetRow[]; features: readonly FeatureRow[]; ownArtists: ReadonlySet<string> },
): { resolved: ResolvedReference[]; refused: { ref: ReferenceRequest; why: string }[] } {
  const assets = new Map(input.assets.map((a) => [a.id, a]));
  const features = new Map(input.features.map((f) => [f.id, f]));
  const resolved: ResolvedReference[] = [];
  const refused: { ref: ReferenceRequest; why: string }[] = [];
  for (const ref of refs) {
    if (ref.source === "project_asset") {
      const a = assets.get(ref.id);
      if (!a || a.project_id !== input.projectId) {
        refused.push({ ref, why: "not an asset of this project" });
        continue;
      }
      const meta = (a.metadata_json ?? {}) as Record<string, unknown>;
      // the bucket the app reads it from — src/lib/queries/projectAssets.ts `bucketForAssetType` is the source of truth
      // (functions cannot import src/); change both together — unless the row says
      const bucket = typeof meta.bucket === "string" ? meta.bucket : a.asset_type === "reference_image" ? "project-references" : "project-clips";
      const mime = typeof meta.mime_type === "string" ? meta.mime_type : "";
      const path = (a.file_url ?? "").trim();
      if (!(ASSET_BUCKETS as readonly string[]).includes(bucket)) {
        refused.push({ ref, why: `its file is in ${bucket}, which this route does not read` });
        continue;
      }
      if (!path || /^https?:\/\//i.test(path) || path.includes("..")) {
        refused.push({ ref, why: "it has no stored file this route can sign" });
        continue;
      }
      if (!inFolderOf(path, input.projectId)) {
        refused.push({ ref, why: "its file is not in this project's folder" });
        continue;
      }
      if (!(mime === "" || mime.startsWith("image/")) || !IMAGE_EXT.test(path)) {
        refused.push({ ref, why: "it is not an image" });
        continue;
      }
      resolved.push({ ref, path, buckets: [bucket] });
    } else {
      const f = features.get(ref.id);
      if (!f || !input.ownArtists.has(f.artist_id)) {
        refused.push({ ref, why: "not a picture of one of your artists" });
        continue;
      }
      // rows from before the multi-angle column carry the file in file_url only (src/lib/queries/characterFeatures.ts)
      const path = (f.storage_path ?? f.file_url ?? "").trim();
      if (!path || /^https?:\/\//i.test(path) || path.includes("..") || !IMAGE_EXT.test(path)) {
        refused.push({ ref, why: "it has no stored image this route can sign" });
        continue;
      }
      if (!inFolderOf(path, f.artist_id)) {
        refused.push({ ref, why: "its file is not in its artist's folder" });
        continue;
      }
      // one bucket per kind, never a fall-through: a same-named file elsewhere is not this picture
      resolved.push({ ref, path, buckets: [(f.feature_type ?? "").startsWith("wardrobe_") ? WARDROBE_BUCKET : ARTIST_BUCKET] });
    }
  }
  return { resolved, refused };
}

/** A provider's error text with any signed-URL token taken out, so a URL it echoes never reaches the caller. */
export function redactSigned(text: string): string {
  return text.replace(/([?&](?:token|sig|signature|X-Amz-[A-Za-z-]+)=)[^&\s"']+/g, "$1…");
}

/** A whole number in [lo, hi], or the default when the value is missing or not a number. */
export function boundedInt(value: unknown, dflt: number, lo: number, hi: number): number {
  const n = Number(value ?? dflt);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : dflt;
}
