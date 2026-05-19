import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Reference-images shared types and helpers
// ---------------------------------------------------------------------------
// Phase 4 of the fidelity roadmap. Every "library" asset — wardrobe items,
// jewelry, locations, props — can now hold an array of reference photos with
// optional angle labels. The composer / proxy enumerates these and signs as
// many as the 4-URL cap allows, picking complementary angles.
//
// The column is jsonb on all three tables (`character_features`,
// `location_library`, `prop_library`) — see
// `supabase/migrations/20260519230757_*.sql`. Default is NULL; the migration
// backfilled rows that already had a `file_url` with a single front-angle
// entry, so reads must tolerate either NULL or an array.
//
// Backward compatibility:
//   - `file_url` + `storage_path` still live on every row and continue to
//     point at the "primary" image. New consumers should prefer
//     `reference_images[0]` and fall back to `file_url`. Old consumers that
//     don't know about reference_images keep working unchanged.
//   - The first uploaded image fills BOTH `file_url`/`storage_path` AND
//     `reference_images[0]`. Subsequent angles append to the array only.
//   - Removing the first reference promotes the new first one to
//     `file_url`/`storage_path` so legacy consumers don't break.
//
// All mutation hooks in this file do an explicit read-modify-write against
// the row. That's safe because the array is small (≤ 8 angles per item) and
// because the UI mutates one entry at a time — collisions would require two
// edit windows open on the same item, which we don't support.

export const ANGLE_LABELS = [
  "front",
  "side",
  "three-quarter",
  "back",
  "detail",
  "other",
] as const;
export type AngleLabel = (typeof ANGLE_LABELS)[number];

export type ReferenceImage = {
  id: string;
  url: string;
  storage_path: string | null;
  angle?: AngleLabel | null;
  label?: string | null;
};

export type ReferenceImageTable =
  | "character_features"
  | "location_library"
  | "prop_library";

/**
 * Generate a (non-cryptographic) UUID v4 for client-side ID assignment.
 * Browsers shipped after ~2022 expose `crypto.randomUUID` — fall back to a
 * Math.random construction for the older ones we still see in analytics.
 */
export function newReferenceImageId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // RFC4122-ish fallback. Good enough for client IDs.
  const rand = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return `${rand()}-${rand().slice(0, 4)}-4${rand().slice(0, 3)}-8${rand().slice(0, 3)}-${rand()}${rand().slice(0, 4)}`;
}

/**
 * Normalise a row's `reference_images` column for downstream consumers. Treats
 * NULL, empty array, and unparseable values as empty. Filters out entries
 * missing required fields.
 */
export function normaliseReferenceImages(
  raw: unknown,
): ReferenceImage[] {
  if (!Array.isArray(raw)) return [];
  const out: ReferenceImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string") continue;
    if (typeof r.url !== "string") continue;
    out.push({
      id: r.id,
      url: r.url,
      storage_path: typeof r.storage_path === "string" ? r.storage_path : null,
      angle: typeof r.angle === "string" ? (r.angle as AngleLabel) : null,
      label: typeof r.label === "string" ? r.label : null,
    });
  }
  return out;
}

/**
 * Build the canonical first-entry that pairs with a freshly-uploaded primary
 * image. Used on row creation to keep `file_url` and `reference_images[0]`
 * consistent.
 */
export function buildPrimaryReferenceImage(args: {
  url: string;
  storage_path: string | null;
  angle?: AngleLabel | null;
}): ReferenceImage {
  return {
    id: newReferenceImageId(),
    url: args.url,
    storage_path: args.storage_path,
    angle: args.angle ?? "front",
  };
}

// ---------------------------------------------------------------------------
// DB plumbing
// ---------------------------------------------------------------------------
async function fetchReferenceImages(
  table: ReferenceImageTable,
  rowId: string,
): Promise<ReferenceImage[]> {
  const { data, error } = await (supabase as any)
    .from(table)
    .select("reference_images")
    .eq("id", rowId)
    .maybeSingle();
  if (error) throw error;
  return normaliseReferenceImages(data?.reference_images ?? null);
}

async function writeRow(
  table: ReferenceImageTable,
  rowId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await (supabase as any).from(table).update(patch).eq("id", rowId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Hooks — one set per (table, query-key-invalidator) pair. Wardrobe + Jewelry
// + Character DNA all use `character_features`, so they can share the same
// hook factory bound to different invalidation keys.
// ---------------------------------------------------------------------------

/**
 * Create a bundle of react-query mutation hooks bound to a specific table +
 * cache invalidation key(s). Each hook in the returned bundle is a custom
 * React hook — call it from a component to get a useMutation result.
 *
 *     const hooks = createReferenceImageHooks({ table: "...", invalidateKeys });
 *     // inside a component:
 *     const append = hooks.useAppend();
 *     await append.mutateAsync({ rowId, entries: [...] });
 */
export function createReferenceImageHooks(args: {
  table: ReferenceImageTable;
  /**
   * Invalidate these query keys after every mutation. Pass the bare prefix —
   * react-query treats it as a prefix match.
   */
  invalidateKeys: () => QueryKey[];
}) {
  return {
    useAppend: makeAppendHook(args),
    useRemove: makeRemoveHook(args),
    useUpdateAngle: makeUpdateAngleHook(args),
  };
}

// Type helper: the value of a react-query useMutation result.
function makeAppendHook(args: {
  table: ReferenceImageTable;
  invalidateKeys: () => QueryKey[];
}) {
  const { table, invalidateKeys } = args;
  return function useAppendReferenceImage() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (input: {
        rowId: string;
        entries: Omit<ReferenceImage, "id">[];
      }) => {
        const current = await fetchReferenceImages(table, input.rowId);
        const additions: ReferenceImage[] = input.entries.map((e) => ({
          id: newReferenceImageId(),
          url: e.url,
          storage_path: e.storage_path,
          angle: e.angle ?? null,
          label: e.label ?? null,
        }));
        const next = [...current, ...additions];

        // If the row had no primary image before (no file_url) and we just
        // added the first one, also fill file_url + storage_path so legacy
        // consumers can render the row. This handles the case of an item
        // created via a code path that didn't populate file_url, which we
        // don't currently have — but it's the conservative default.
        const patch: Record<string, unknown> = { reference_images: next };
        if (current.length === 0 && next.length > 0) {
          patch.file_url = next[0].url;
          patch.storage_path = next[0].storage_path ?? next[0].url;
        }

        await writeRow(table, input.rowId, patch);
        return next;
      },
      onSuccess: () => {
        for (const key of invalidateKeys()) {
          qc.invalidateQueries({ queryKey: key });
        }
      },
    });
  };
}

function makeRemoveHook(args: {
  table: ReferenceImageTable;
  invalidateKeys: () => QueryKey[];
}) {
  const { table, invalidateKeys } = args;
  return function useRemoveReferenceImage() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (input: {
        rowId: string;
        referenceImageId: string;
      }) => {
        const current = await fetchReferenceImages(table, input.rowId);
        const idx = current.findIndex((r) => r.id === input.referenceImageId);
        if (idx === -1) return current;
        const next = current.filter((r) => r.id !== input.referenceImageId);

        // If we removed the first entry and there's a second to take its
        // place, promote it to file_url + storage_path. If we removed the
        // last remaining entry, clear file_url + storage_path so the row's
        // primary state matches its (now empty) gallery.
        const patch: Record<string, unknown> = { reference_images: next };
        if (idx === 0) {
          if (next.length > 0) {
            patch.file_url = next[0].url;
            patch.storage_path = next[0].storage_path ?? next[0].url;
          } else {
            patch.file_url = null;
            patch.storage_path = null;
          }
        }

        await writeRow(table, input.rowId, patch);
        return next;
      },
      onSuccess: () => {
        for (const key of invalidateKeys()) {
          qc.invalidateQueries({ queryKey: key });
        }
      },
    });
  };
}

function makeUpdateAngleHook(args: {
  table: ReferenceImageTable;
  invalidateKeys: () => QueryKey[];
}) {
  const { table, invalidateKeys } = args;
  return function useUpdateReferenceImageAngle() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (input: {
        rowId: string;
        referenceImageId: string;
        angle: AngleLabel | null;
      }) => {
        const current = await fetchReferenceImages(table, input.rowId);
        const next = current.map((r) =>
          r.id === input.referenceImageId
            ? { ...r, angle: input.angle ?? null }
            : r,
        );
        await writeRow(table, input.rowId, { reference_images: next });
        return next;
      },
      onSuccess: () => {
        for (const key of invalidateKeys()) {
          qc.invalidateQueries({ queryKey: key });
        }
      },
    });
  };
}
