import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A candidate board must point at the same people, places and lighting states by the same keys as the board it
 * was written from — with the same approved pictures — or its shots' cast reads "not cast in this variation"
 * (seen live on Interrupted Broadcast · candidate 2). A small stand-in for the client records what is read and
 * what is inserted.
 */
const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  existingKeys: [] as string[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: (cols: string) => ({
        eq: (col: string, val: string) => {
          const chain = {
            eq: (_c: string, _v: unknown) => Promise.resolve({ data: db.rows.filter((r) => r.variation_id === val), error: null }),
            then: (resolve: (v: unknown) => void) => resolve({ data: cols === "key" ? db.existingKeys.map((key) => ({ key })) : db.rows.filter((r) => r.variation_id === val), error: null }),
          };
          return chain;
        },
      }),
      insert: (rows: Record<string, unknown>[]) => {
        db.inserted.push(...rows);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

import { copyContinuityEntities } from "./continuity";

const entity = (over: Partial<Record<string, unknown>>) => ({
  id: "e", project_id: "p1", variation_id: "src", kind: "character", key: "K", name: "N", description: "d", constraints: "", approved_asset_id: null, reference_asset_ids: [], archived: false,
  created_at: "t", updated_at: "t", cast_role: null, identity_mode: null, artist_id: null, ...over,
});

beforeEach(() => {
  db.rows = [];
  db.inserted = [];
  db.existingKeys = [];
});

describe("a candidate carries the source board's continuity entities", () => {
  it("copies every unarchived entity with its key, kind, role, identity mode, artist and approved pictures — into the target variation", async () => {
    db.rows = [
      entity({ id: "1", key: "FENDI", name: "Fendi", cast_role: "primary_artist", identity_mode: "preserve", artist_id: "artist-1", approved_asset_id: "face-1", reference_asset_ids: ["face-2"] }),
      entity({ id: "2", key: "THE_RIDER", name: "The rider", cast_role: "recurring", identity_mode: "recurring" }),
      entity({ id: "3", key: "BLACK_RUNWAY", kind: "location", name: "Black Runway", approved_asset_id: "place-1" }),
    ];
    const n = await copyContinuityEntities("src", "cand");
    expect(n).toBe(3);
    expect(db.inserted.map((r) => r.variation_id)).toEqual(["cand", "cand", "cand"]);
    expect(db.inserted[0]).toMatchObject({ project_id: "p1", key: "FENDI", kind: "character", cast_role: "primary_artist", identity_mode: "preserve", artist_id: "artist-1", approved_asset_id: "face-1", reference_asset_ids: ["face-2"] });
    expect(db.inserted[2]).toMatchObject({ key: "BLACK_RUNWAY", kind: "location", approved_asset_id: "place-1", cast_role: null });
    // the source's ids are not carried: the target gets its own rows
    expect(db.inserted.every((r) => !("id" in r))).toBe(true);
  });

  it("skips keys the target already has, and copies nothing when there is nothing to copy", async () => {
    db.rows = [entity({ key: "FENDI" }), entity({ key: "THE_RIDER" })];
    db.existingKeys = ["FENDI"];
    expect(await copyContinuityEntities("src", "cand")).toBe(1);
    expect(db.inserted.map((r) => r.key)).toEqual(["THE_RIDER"]);
    db.rows = [];
    db.inserted = [];
    expect(await copyContinuityEntities("src", "cand")).toBe(0);
    expect(db.inserted).toEqual([]);
  });
});
